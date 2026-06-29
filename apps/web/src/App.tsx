import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { formatApiError, PolyCostClient, PolyCostApiError, polyCostClient } from './api-client';
import {
  CLOUD_SERVICE_CATALOG,
  SERVICE_CATALOG_CATEGORIES,
  type CloudServiceFamily,
  type ServiceSupportStatus,
  orderedServiceFamilyIds,
  serviceCatalogTraceability,
  supportLabel,
} from './service-catalog';
import { applyTheme, storedTheme, ThemeChoice } from './theme';
import {
  ComparisonProviderResult,
  ComparisonResult,
  INTERVALS,
  IntervalKey,
  NormalizedWorkloadSpec,
  PROVIDER_ORDER,
  ProviderId,
  ReportFormat,
} from './types';
import {
  buildNwsFromForm,
  defaultWorkloadForm,
  formFromNws,
  sampleNaturalLanguageInput,
  WorkloadFormState,
} from './workload';

type InputMode = 'describe' | 'form';
type BusyAction = 'parse' | 'compare' | 'refresh' | 'export' | null;
type ServiceCategory = ComparisonProviderResult['lineItems'][number]['category'];
type FormSectionTone = 'profile' | 'compute' | 'services' | 'portfolio' | 'data' | 'network';
type ToggleIconKind = 'storage' | 'database' | 'cdn' | 'loadBalancer' | 'multiAz' | 'multiRegion';

const SERVICE_CATEGORIES: ServiceCategory[] = ['compute', 'storage', 'database', 'network'];

interface CategoryCostSummary {
  category: ServiceCategory;
  total: number;
  percentOfTotal: number;
}

interface ProviderCostSummary {
  providerId: ProviderId;
  total?: number;
  percentOfMax: number;
  deltaFromLowest?: number;
  percentOverLowest?: number;
  approximateCount: number;
  lineItemCount: number;
  categoryTotals: CategoryCostSummary[];
}

interface FinOpsReview {
  monthlyLowest?: ProviderCostSummary;
  yearlyLowest?: ProviderCostSummary;
  monthlySpread?: number;
  monthlySpreadPercent?: number;
  dominantCategory?: CategoryCostSummary;
  dominantCategoryProvider?: ProviderId;
  approximateCount: number;
  lineItemCount: number;
  providerFit: ProviderFitSummary[];
  recommendations: string[];
}

interface ProviderFitSummary {
  providerId: ProviderId;
  label: string;
  detail: string;
  tone: 'preferred' | 'review' | 'unavailable';
}

interface AppProps {
  client?: PolyCostClient;
}

export function App({ client = polyCostClient }: AppProps) {
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => storedTheme());
  const [inputMode, setInputMode] = useState<InputMode>('describe');
  const [naturalLanguageInput, setNaturalLanguageInput] = useState(sampleNaturalLanguageInput);
  const [form, setForm] = useState<WorkloadFormState>(defaultWorkloadForm);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [interval, setInterval] = useState<IntervalKey>('monthly');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [exportingFormat, setExportingFormat] = useState<ReportFormat | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(themeChoice);
  }, [themeChoice]);

  async function handleParse() {
    setError(null);
    setNotice(null);
    setBusyAction('parse');

    try {
      const parsed = await client.parseWorkload(naturalLanguageInput);
      setForm(formFromNws(parsed.draftNws));
      setInputMode('form');
      setNotice(reviewMessage(parsed.parserConfidence, parsed.fieldsRequiringReview));
    } catch (parseError) {
      setError(formatApiError(parseError));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCompare(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setNotice(null);
    setBusyAction('compare');

    try {
      const { nws, parserNotice } = await prepareNwsForComparison();
      await client.validateWorkload(nws);
      const result = await client.createComparison(nws);
      setComparison(result);
      setNotice(parserNotice ? `${parserNotice} Comparison ready.` : 'Comparison ready.');
    } catch (comparisonError) {
      setError(formatApiError(comparisonError));
    } finally {
      setBusyAction(null);
    }
  }

  async function prepareNwsForComparison(): Promise<{
    nws: NormalizedWorkloadSpec;
    parserNotice?: string;
  }> {
    if (inputMode !== 'describe') {
      return {
        nws: buildNwsFromForm(form, 'structured_form'),
      };
    }

    const parsed = await client.parseWorkload(naturalLanguageInput);
    const parsedForm = formFromNws(parsed.draftNws);
    setForm(parsedForm);
    setInputMode('form');

    return {
      nws: {
        ...parsed.draftNws,
        sourceTraceability:
          parsed.draftNws.sourceTraceability ??
          serviceCatalogTraceability(parsedForm.selectedServiceFamilyIds),
      },
      parserNotice: reviewMessage(parsed.parserConfidence, parsed.fieldsRequiringReview),
    };
  }

  async function handleRefreshLive() {
    if (!comparison) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusyAction('refresh');

    try {
      const result = await client.refreshLiveComparison(comparison.comparisonId);
      setComparison(result);
      setNotice('Live refresh snapshot created.');
    } catch (refreshError) {
      setError(formatApiError(refreshError));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExport(format: ReportFormat) {
    if (!comparison) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusyAction('export');
    setExportingFormat(format);

    try {
      const blob = await client.exportComparison(comparison.comparisonId, format);
      downloadBlob(blob, `polycost-comparison-${comparison.comparisonId}.${format}`);
      setNotice(`${format.toUpperCase()} export downloaded.`);
    } catch (exportError) {
      setError(formatApiError(exportError));
    } finally {
      setBusyAction(null);
      setExportingFormat(null);
    }
  }

  function handleClearRequirements() {
    setNaturalLanguageInput('');
    setNotice(null);
    setError(null);
  }

  function handleClearComparison() {
    setComparison(null);
    setInterval('monthly');
    setExportingFormat(null);
    setNotice(null);
    setError(null);
  }

  return (
    <main className="app-shell" aria-labelledby="page-title">
      <ScrollProgressBar />
      <Header themeChoice={themeChoice} onThemeChange={setThemeChoice} />

      <section className="workbench" aria-label="Cost comparison workbench">
        <section className="input-zone" aria-label="Workload requirements">
          <div className="mode-tabs" role="tablist" aria-label="Requirement input mode">
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'describe'}
              className="tab-button"
              onClick={() => setInputMode('describe')}
            >
              <ModeIcon mode="describe" />
              Describe
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'form'}
              className="tab-button"
              onClick={() => setInputMode('form')}
            >
              <ModeIcon mode="form" />
              Form
            </button>
          </div>

          {inputMode === 'describe' ? (
            <DescribePanel
              value={naturalLanguageInput}
              isParsing={busyAction === 'parse'}
              onChange={setNaturalLanguageInput}
              onClear={handleClearRequirements}
              onParse={handleParse}
              onUseSample={() => setNaturalLanguageInput(sampleNaturalLanguageInput)}
            />
          ) : (
            <WorkloadForm form={form} onChange={setForm} onSubmit={handleCompare} />
          )}
        </section>

        <section className="summary-zone" aria-label="Current estimate controls">
          <PricingFreshness comparison={comparison} />

          <RequirementSummary form={form} />

          <div className="action-row">
            <button
              type="button"
              className="pc-button pc-button-primary"
              onClick={() => void handleCompare()}
              disabled={busyAction !== null}
            >
              {busyAction === 'compare' ? <LoadingSpinner /> : <CompareIcon />}
              {compareButtonLabel(inputMode, busyAction)}
            </button>
            <button
              type="button"
              className="pc-button pc-button-secondary"
              onClick={handleRefreshLive}
              disabled={!comparison || busyAction !== null}
            >
              {busyAction === 'refresh' ? <LoadingSpinner /> : <RefreshIcon />}
              Refresh live
            </button>
            <button
              type="button"
              className="pc-button pc-button-secondary"
              onClick={handleClearComparison}
              disabled={!comparison || busyAction !== null}
            >
              <ClearIcon />
              Clear costs
            </button>
          </div>

          <ExportBar
            disabled={!comparison || busyAction !== null}
            exportingFormat={exportingFormat}
            onExport={(format) => void handleExport(format)}
          />

          <StatusMessage notice={notice} error={error} />
        </section>
      </section>

      <section className="comparison-section" aria-label="Provider comparison">
        <ComparisonToolbar interval={interval} onIntervalChange={setInterval} />
        <ComparisonView comparison={comparison} interval={interval} />
      </section>
    </main>
  );
}

function ScrollProgressBar() {
  const [progress, setProgress] = useState(0);
  const percent = Math.round(progress * 100);

  useEffect(() => {
    function updateProgress() {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      const maxScroll = Math.max(0, scrollingElement.scrollHeight - window.innerHeight);
      const nextProgress =
        maxScroll === 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / maxScroll));

      setProgress(nextProgress);
    }

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);

    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
    };
  }, []);

  return (
    <div
      className="scroll-progress"
      role="progressbar"
      aria-label="Page scroll progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}% scrolled`}
    >
      <span className="scroll-progress-bar" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

function Header({
  themeChoice,
  onThemeChange,
}: {
  themeChoice: ThemeChoice;
  onThemeChange: (choice: ThemeChoice) => void;
}) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <Logo />
        <h1 id="page-title" className="wordmark">
          <span>Poly</span>
          <strong>Cost</strong>
        </h1>
      </div>
      <nav className="top-nav" aria-label="Primary">
        <a href="#requirements">Requirements</a>
        <a href="#comparison">Comparison</a>
      </nav>
      <div className="theme-toggle" role="group" aria-label="Theme">
        {(['light', 'dark', 'system'] as ThemeChoice[]).map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={themeChoice === choice}
            onClick={() => onThemeChange(choice)}
          >
            <ThemeIcon choice={choice} />
            {capitalize(choice)}
          </button>
        ))}
      </div>
    </header>
  );
}

function DescribePanel({
  value,
  isParsing,
  onChange,
  onClear,
  onParse,
  onUseSample,
}: {
  value: string;
  isParsing: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  onParse: () => void;
  onUseSample: () => void;
}) {
  return (
    <div className="describe-panel" id="requirements">
      <label className="field-label" htmlFor="natural-language-input">
        Requirements
      </label>
      <textarea
        id="natural-language-input"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="e.g. A web app for 5,000 daily users with a Postgres database and file storage for uploads"
      />
      <div className="action-row">
        <button
          type="button"
          className="pc-button pc-button-primary"
          onClick={onParse}
          disabled={isParsing}
        >
          {isParsing ? <LoadingSpinner /> : <ParseIcon />}
          {isParsing ? 'Parsing' : 'Parse'}
        </button>
        <button type="button" className="pc-button pc-button-secondary" onClick={onUseSample}>
          <SampleIcon />
          Sample
        </button>
        <button
          type="button"
          className="pc-button pc-button-secondary"
          onClick={onClear}
          disabled={isParsing || value.length === 0}
        >
          <ClearIcon />
          Clear
        </button>
      </div>
    </div>
  );
}

function WorkloadForm({
  form,
  onChange,
  onSubmit,
}: {
  form: WorkloadFormState;
  onChange: (form: WorkloadFormState) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  function update<K extends keyof WorkloadFormState>(key: K, value: WorkloadFormState[K]) {
    onChange({
      ...form,
      [key]: value,
    });
  }

  function toggleServiceFamily(id: string) {
    const selected = new Set(form.selectedServiceFamilyIds);

    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }

    update('selectedServiceFamilyIds', orderedServiceFamilyIds([...selected]));
  }

  const sizingSummary = formSizingSummary(form);

  return (
    <form className="structured-form" id="requirements" onSubmit={onSubmit}>
      <div className="form-overview-strip" aria-label="Workload sizing summary">
        <FormSummaryChip label="Traffic" value={sizingSummary.traffic} tone="profile" />
        <FormSummaryChip label="Compute" value={sizingSummary.compute} tone="compute" />
        <FormSummaryChip label="Scale" value={sizingSummary.scale} tone="services" />
        <FormSummaryChip label="Portfolio" value={sizingSummary.services} tone="portfolio" />
        <FormSummaryChip label="Data" value={sizingSummary.data} tone="data" />
      </div>

      <FormSection title="Workload" tone="profile">
        <div className="form-grid form-grid-profile">
          <TextField
            label="Name"
            value={form.workloadName}
            onChange={(value) => update('workloadName', value)}
          />
          <SelectField
            label="Type"
            value={form.workloadType}
            options={[
              ['web_app', 'Web app'],
              ['api_backend', 'API backend'],
              ['static_site', 'Static site'],
              ['batch_processing', 'Batch'],
              ['data_pipeline', 'Data pipeline'],
              ['ml_workload', 'ML workload'],
              ['other', 'Other'],
            ]}
            onChange={(value) => update('workloadType', value)}
          />
          <TextField
            label="Region"
            value={form.regionPreference}
            onChange={(value) => update('regionPreference', value)}
          />
          <TextField
            label="Daily users"
            value={form.dailyActiveUsers}
            inputMode="numeric"
            onChange={(value) => update('dailyActiveUsers', value)}
          />
          <TextField
            label="Peak users"
            value={form.peakConcurrentUsers}
            inputMode="numeric"
            onChange={(value) => update('peakConcurrentUsers', value)}
          />
        </div>
      </FormSection>

      <FormSection title="Compute" tone="compute">
        <div className="form-grid form-grid-compute">
          <TextField
            label="Compute role"
            value={form.computeRole}
            onChange={(value) => update('computeRole', value)}
          />
          <TextField
            label="vCPU"
            value={form.vcpu}
            inputMode="decimal"
            suffix="cores"
            onChange={(value) => update('vcpu', value)}
          />
          <TextField
            label="Memory GB"
            value={form.memoryGb}
            inputMode="decimal"
            suffix="GB"
            onChange={(value) => update('memoryGb', value)}
          />
          <TextField
            label="Instances"
            value={form.instanceCount}
            inputMode="numeric"
            suffix="nodes"
            onChange={(value) => update('instanceCount', value)}
          />
          <SelectField
            label="Scaling"
            value={form.scalingType}
            options={[
              ['fixed', 'Fixed'],
              ['autoscaling', 'Autoscaling'],
            ]}
            onChange={(value) => update('scalingType', value)}
          />
          <TextField
            label="Scale min"
            value={form.autoscaleMin}
            inputMode="numeric"
            suffix="min"
            onChange={(value) => update('autoscaleMin', value)}
          />
          <TextField
            label="Scale max"
            value={form.autoscaleMax}
            inputMode="numeric"
            suffix="max"
            onChange={(value) => update('autoscaleMax', value)}
          />
        </div>
      </FormSection>

      <FormSection title="Services" tone="services">
        <div className="form-switches" aria-label="Workload options">
          <CheckboxField
            label="Object storage"
            icon="storage"
            checked={form.storageEnabled}
            onChange={(checked) => update('storageEnabled', checked)}
          />
          <CheckboxField
            label="Managed database"
            icon="database"
            checked={form.databaseEnabled}
            onChange={(checked) => update('databaseEnabled', checked)}
          />
          <CheckboxField
            label="CDN"
            icon="cdn"
            checked={form.cdn}
            onChange={(checked) => update('cdn', checked)}
          />
          <CheckboxField
            label="Load balancer"
            icon="loadBalancer"
            checked={form.loadBalancer}
            onChange={(checked) => update('loadBalancer', checked)}
          />
          <CheckboxField
            label="Multi-AZ"
            icon="multiAz"
            checked={form.multiAz}
            onChange={(checked) => update('multiAz', checked)}
          />
          <CheckboxField
            label="Multi-region"
            icon="multiRegion"
            checked={form.multiRegion}
            onChange={(checked) => update('multiRegion', checked)}
          />
        </div>
      </FormSection>

      <FormSection title="Cloud services" tone="portfolio">
        <ServiceCatalogPicker
          selectedIds={form.selectedServiceFamilyIds}
          onToggle={toggleServiceFamily}
        />
      </FormSection>

      <FormSection title="Data" tone="data">
        <div className="form-subsection">
          <div className="form-subsection-heading">
            <span>Storage</span>
            <strong>{form.storageEnabled ? 'Enabled' : 'Off'}</strong>
          </div>
          <div
            className={
              form.storageEnabled ? 'form-grid form-grid-data' : 'form-grid form-grid-data is-muted'
            }
          >
            <TextField
              label="Storage role"
              value={form.storageRole}
              disabled={!form.storageEnabled}
              onChange={(value) => update('storageRole', value)}
            />
            <TextField
              label="Storage GB"
              value={form.storageSizeGb}
              inputMode="decimal"
              suffix="GB"
              disabled={!form.storageEnabled}
              onChange={(value) => update('storageSizeGb', value)}
            />
            <SelectField
              label="Storage type"
              value={form.storageType}
              disabled={!form.storageEnabled}
              options={[
                ['object', 'Object'],
                ['block', 'Block'],
                ['file', 'File'],
              ]}
              onChange={(value) => update('storageType', value)}
            />
            <SelectField
              label="Access pattern"
              value={form.storageAccessPattern}
              disabled={!form.storageEnabled}
              options={[
                ['frequent', 'Frequent'],
                ['infrequent', 'Infrequent'],
                ['archive', 'Archive'],
              ]}
              onChange={(value) => update('storageAccessPattern', value)}
            />
          </div>
        </div>

        <div className="form-subsection">
          <div className="form-subsection-heading">
            <span>Database</span>
            <strong>{form.databaseEnabled ? 'Enabled' : 'Off'}</strong>
          </div>
          <div
            className={
              form.databaseEnabled
                ? 'form-grid form-grid-data'
                : 'form-grid form-grid-data is-muted'
            }
          >
            <TextField
              label="Database role"
              value={form.databaseRole}
              disabled={!form.databaseEnabled}
              onChange={(value) => update('databaseRole', value)}
            />
            <SelectField
              label="Database"
              value={form.databaseEngine}
              disabled={!form.databaseEnabled}
              options={[
                ['postgres', 'Postgres'],
                ['mysql', 'MySQL'],
                ['mongodb', 'MongoDB'],
                ['redis', 'Redis'],
                ['generic_relational', 'Relational'],
                ['generic_nosql', 'NoSQL'],
              ]}
              onChange={(value) => update('databaseEngine', value)}
            />
            <TextField
              label="Database GB"
              value={form.databaseSizeGb}
              inputMode="decimal"
              suffix="GB"
              disabled={!form.databaseEnabled}
              onChange={(value) => update('databaseSizeGb', value)}
            />
            <CheckboxField
              label="Database HA"
              icon="multiAz"
              checked={form.databaseHighAvailability}
              disabled={!form.databaseEnabled}
              onChange={(checked) => update('databaseHighAvailability', checked)}
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Network" tone="network">
        <div className="form-grid secondary-grid">
          <TextField
            label="Egress GB/mo"
            value={form.monthlyEgressGb}
            inputMode="decimal"
            suffix="GB"
            onChange={(value) => update('monthlyEgressGb', value)}
          />
          <TextField
            label="SLA target"
            value={form.slaTarget}
            onChange={(value) => update('slaTarget', value)}
          />
        </div>
      </FormSection>

      <button type="submit" className="sr-only">
        Submit structured workload
      </button>
    </form>
  );
}

function FormSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone: FormSectionTone;
  children: ReactNode;
}) {
  const headingId = `form-section-${tone}`;

  return (
    <section className={`form-section form-section-${tone}`} aria-labelledby={headingId}>
      <div className="form-section-heading">
        <span className="form-section-icon" aria-hidden="true">
          <FormSectionIcon tone={tone} />
        </span>
        <h3 id={headingId}>{title}</h3>
      </div>
      <div className="form-section-body">{children}</div>
    </section>
  );
}

function FormSummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: FormSectionTone;
}) {
  return (
    <div className={`form-summary-chip form-summary-chip-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TextField({
  label,
  value,
  inputMode,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  suffix?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = toId(label);
  return (
    <label className="form-field" htmlFor={id}>
      <span className="field-caption">{label}</span>
      <span className={suffix ? 'field-control field-control-suffix' : 'field-control'}>
        <input
          id={id}
          value={value}
          inputMode={inputMode}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        {suffix ? <span className="field-suffix">{suffix}</span> : null}
      </span>
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const id = toId(label);
  return (
    <label className="form-field" htmlFor={id}>
      <span className="field-caption">{label}</span>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({
  label,
  icon,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  icon: ToggleIconKind;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="checkbox-field">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="checkbox-content">
        <span className="checkbox-icon" aria-hidden="true">
          <ToggleIcon icon={icon} />
        </span>
        <span className="checkbox-label">{label}</span>
      </span>
      <span className="switch-visual" aria-hidden="true" />
    </label>
  );
}

function ServiceCatalogPicker({
  selectedIds,
  onToggle,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const selected = new Set(selectedIds);
  const selectedFamilies = CLOUD_SERVICE_CATALOG.filter((service) => selected.has(service.id));
  const selectedPriced = selectedFamilies.filter((service) => service.supportStatus === 'priced');
  const selectedMapped = selectedFamilies.filter((service) => service.supportStatus === 'mapped');
  const selectedRoadmap = selectedFamilies.filter((service) => service.supportStatus === 'roadmap');

  return (
    <div className="service-catalog" aria-label="AWS Azure GCP service catalog">
      <div className="service-catalog-stats" aria-label="Service catalog summary">
        <ServiceCatalogStat label="Families" value={String(CLOUD_SERVICE_CATALOG.length)} />
        <ServiceCatalogStat
          label="Selected"
          value={String(selectedFamilies.length)}
          tone="selected"
        />
        <ServiceCatalogStat label="Priced" value={String(selectedPriced.length)} tone="priced" />
        <ServiceCatalogStat
          label="Mapped / roadmap"
          value={`${selectedMapped.length} / ${selectedRoadmap.length}`}
          tone="mapped"
        />
      </div>

      <div className="service-category-list">
        {SERVICE_CATALOG_CATEGORIES.map((category) => {
          const families = CLOUD_SERVICE_CATALOG.filter(
            (service) => service.categoryId === category.id,
          );
          const selectedCount = families.filter((service) => selected.has(service.id)).length;
          const headingId = `service-category-${category.id}`;

          return (
            <section
              key={category.id}
              className="service-category-panel"
              aria-labelledby={headingId}
            >
              <div className="service-category-heading">
                <h4 id={headingId}>{category.label}</h4>
                <span>
                  {selectedCount}/{families.length}
                </span>
              </div>
              <div className="service-family-grid">
                {families.map((family) => (
                  <ServiceFamilyCard
                    key={family.id}
                    family={family}
                    checked={selected.has(family.id)}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ServiceCatalogStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'selected' | 'priced' | 'mapped';
}) {
  return (
    <div className={tone ? `service-stat service-stat-${tone}` : 'service-stat'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ServiceFamilyCard({
  family,
  checked,
  onToggle,
}: {
  family: CloudServiceFamily;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <label className={`service-family-card service-family-card-${family.supportStatus}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(family.id)}
        aria-label={family.label}
      />
      <span className="service-family-header">
        <span className="service-family-title">{family.label}</span>
        <SupportBadge status={family.supportStatus} />
      </span>
      <span className="provider-service-map">
        {PROVIDER_ORDER.map((providerId) => (
          <span key={providerId} className={`provider-service-row provider-service-${providerId}`}>
            <strong>{providerLabel(providerId)}</strong>
            <span>{providerServicesForFamily(family, providerId).join(', ')}</span>
          </span>
        ))}
      </span>
    </label>
  );
}

function providerServicesForFamily(family: CloudServiceFamily, providerId: ProviderId): string[] {
  switch (providerId) {
    case 'aws':
      return family.providerServices.aws;
    case 'azure':
      return family.providerServices.azure;
    case 'gcp':
      return family.providerServices.gcp;
  }
}

function SupportBadge({ status }: { status: ServiceSupportStatus }) {
  return <span className={`support-badge support-badge-${status}`}>{supportLabel(status)}</span>;
}

function FormSectionIcon({ tone }: { tone: FormSectionTone }) {
  return (
    <svg className="form-icon-svg" viewBox="0 0 24 24" focusable="false">
      {tone === 'profile' ? (
        <path d="M4 7h16M4 12h10M4 17h7" />
      ) : tone === 'compute' ? (
        <path d="M8 4v3M16 4v3M8 17v3M16 17v3M4 8h3M17 8h3M4 16h3M17 16h3M8 8h8v8H8z" />
      ) : tone === 'services' ? (
        <path d="M6 8h12M8 5h8M8 19h8M6 16h12M5 8v8M19 8v8" />
      ) : tone === 'portfolio' ? (
        <path d="M4 7h7v7H4zM13 5h7v7h-7zM12 16h8v3h-8zM4 18h5M7 14v7" />
      ) : tone === 'data' ? (
        <path d="M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      ) : (
        <path d="M4 12h5M15 12h5M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM12 5v4M12 15v4" />
      )}
    </svg>
  );
}

function ToggleIcon({ icon }: { icon: ToggleIconKind }) {
  return (
    <svg className="form-icon-svg" viewBox="0 0 24 24" focusable="false">
      {icon === 'storage' ? (
        <path d="M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      ) : icon === 'database' ? (
        <path d="M6 6h12v12H6zM9 9h6M9 13h6M9 17h3" />
      ) : icon === 'cdn' ? (
        <path d="M12 4v4M12 16v4M4 12h4M16 12h4M8 8l-3-3M16 8l3-3M8 16l-3 3M16 16l3 3M9 9h6v6H9z" />
      ) : icon === 'loadBalancer' ? (
        <path d="M4 7h6M14 7h6M10 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM4 17h6M14 17h6M10 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0z" />
      ) : icon === 'multiAz' ? (
        <path d="M5 18V8l7-4 7 4v10M8 18v-6h8v6M4 18h16" />
      ) : (
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 12h17M12 3c2.5 2.6 3.7 5.6 3.7 9S14.5 18.4 12 21M12 3c-2.5 2.6-3.7 5.6-3.7 9s1.2 6.4 3.7 9" />
      )}
    </svg>
  );
}

function formSizingSummary(
  form: WorkloadFormState,
): Record<'traffic' | 'compute' | 'scale' | 'services' | 'data', string> {
  const dailyUsers = formatCompactInput(form.dailyActiveUsers);
  const peakUsers = formatCompactInput(form.peakConcurrentUsers);
  const vcpu = parseFormNumber(form.vcpu) ?? 0;
  const memory = parseFormNumber(form.memoryGb) ?? 0;
  const instances = parseFormNumber(form.instanceCount) ?? 0;
  const scaleMin = parseFormNumber(form.autoscaleMin) ?? instances;
  const scaleMax = parseFormNumber(form.autoscaleMax) ?? instances;
  const totalVcpu = vcpu * Math.max(instances, 1);
  const totalMemory = memory * Math.max(instances, 1);
  const storageText = form.storageEnabled
    ? `${formatCompactInput(form.storageSizeGb)}GB`
    : 'No storage';
  const databaseText = form.databaseEnabled ? form.databaseEngine : 'No database';

  return {
    traffic: `${dailyUsers} daily / ${peakUsers} peak`,
    compute: `${formatDecimal(totalVcpu)} vCPU / ${formatDecimal(totalMemory)}GB`,
    scale:
      form.scalingType === 'autoscaling'
        ? `${formatDecimal(scaleMin)}-${formatDecimal(scaleMax)} nodes`
        : `${formatDecimal(instances)} fixed`,
    services: `${form.selectedServiceFamilyIds.length}/${CLOUD_SERVICE_CATALOG.length} families`,
    data: `${storageText} / ${databaseText}`,
  };
}

function parseFormNumber(value: string): number | undefined {
  const parsed = Number(value.replace(/,/g, '').trim());

  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatCompactInput(value: string): string {
  const parsed = parseFormNumber(value);

  if (parsed === undefined) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: parsed >= 1000 ? 1 : 0,
    notation: parsed >= 1000 ? 'compact' : 'standard',
  }).format(parsed);
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value);
}

function PricingFreshness({ comparison }: { comparison: ComparisonResult | null }) {
  if (comparison) {
    return (
      <div className="freshness-strip">Pricing as of {formatDate(comparison.pricingAsOf)}</div>
    );
  }

  return <div className="freshness-strip">Using cached pricing catalog</div>;
}

function RequirementSummary({ form }: { form: WorkloadFormState }) {
  return (
    <div className="requirement-summary" aria-label="Requirement summary">
      <div>
        <span className="summary-label">Workload</span>
        <strong>{form.workloadName || 'Unnamed workload'}</strong>
      </div>
      <div>
        <span className="summary-label">Compute</span>
        <strong>
          {form.instanceCount} x {form.vcpu} vCPU
        </strong>
      </div>
      <div>
        <span className="summary-label">Portfolio</span>
        <strong>
          {form.selectedServiceFamilyIds.length}/{CLOUD_SERVICE_CATALOG.length} families
        </strong>
      </div>
      <div>
        <span className="summary-label">Data</span>
        <strong>
          {form.storageEnabled ? `${form.storageSizeGb}GB` : 'No storage'} ·{' '}
          {form.databaseEnabled ? form.databaseEngine : 'No database'}
        </strong>
      </div>
    </div>
  );
}

function ExportBar({
  disabled,
  exportingFormat,
  onExport,
}: {
  disabled: boolean;
  exportingFormat: ReportFormat | null;
  onExport: (format: ReportFormat) => void;
}) {
  return (
    <div className="export-bar" aria-label="Export comparison">
      {(['pdf', 'csv', 'xlsx'] as ReportFormat[]).map((format) => (
        <button
          key={format}
          type="button"
          className="pc-button pc-button-secondary"
          disabled={disabled}
          onClick={() => onExport(format)}
        >
          {exportingFormat === format ? <LoadingSpinner /> : <DownloadIcon />}
          {format === 'xlsx' ? 'Excel' : format.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function StatusMessage({ notice, error }: { notice: string | null; error: string | null }) {
  if (!notice && !error) {
    return null;
  }

  return (
    <div
      className={error ? 'status-message error' : 'status-message'}
      role={error ? 'alert' : 'status'}
    >
      {error ?? notice}
    </div>
  );
}

function ComparisonToolbar({
  interval,
  onIntervalChange,
}: {
  interval: IntervalKey;
  onIntervalChange: (interval: IntervalKey) => void;
}) {
  return (
    <div className="comparison-toolbar" id="comparison">
      <div className="toolbar-title">
        <span>Comparison</span>
        <strong>{capitalize(interval)} outlook</strong>
      </div>
      <div className="interval-toggle" role="group" aria-label="Cost interval">
        {INTERVALS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={interval === key}
            onClick={() => onIntervalChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ComparisonView({
  comparison,
  interval,
}: {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
}) {
  const providerResults = new Map<ProviderId, ComparisonProviderResult>(
    comparison?.providers.map((provider) => [provider.providerId, provider]) ?? [],
  );

  return (
    <div className="comparison-view">
      <div className="mobile-total-bar" aria-label="Provider totals">
        {PROVIDER_ORDER.map((providerId) => {
          const provider = providerResults.get(providerId);
          return (
            <span key={providerId}>
              <ProviderMark providerId={providerId} />
              {providerLabel(providerId)}
              <strong>
                {provider
                  ? formatCurrency(costForInterval(provider, interval))
                  : comparison
                    ? 'Unavailable'
                    : 'Pending'}
              </strong>
            </span>
          );
        })}
      </div>

      <CostDashboard comparison={comparison} interval={interval} />

      <div className="provider-grid">
        {PROVIDER_ORDER.map((providerId) => (
          <ProviderPanel
            key={providerId}
            providerId={providerId}
            provider={providerResults.get(providerId)}
            cheapestProviderId={comparison?.cheapestProviderId}
            interval={interval}
            hasComparison={Boolean(comparison)}
          />
        ))}
      </div>

      {comparison?.warnings && comparison.warnings.length > 0 ? (
        <div className="warning-list" role="status">
          {comparison.warnings.map((warning) => (
            <span key={`${warning.providerId ?? 'provider'}-${warning.message}`}>
              {warning.providerId ? `${providerLabel(warning.providerId)}: ` : ''}
              {warning.message}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProviderPanel({
  providerId,
  provider,
  cheapestProviderId,
  interval,
  hasComparison,
}: {
  providerId: ProviderId;
  provider?: ComparisonProviderResult;
  cheapestProviderId?: ProviderId;
  interval: IntervalKey;
  hasComparison: boolean;
}) {
  const isCheapest = cheapestProviderId === providerId;

  return (
    <article
      className={`provider-card provider-${providerId}`}
      aria-labelledby={`${providerId}-title`}
    >
      <header className="provider-header">
        <div className="provider-title-block">
          <ProviderLogo providerId={providerId} />
          <div>
            <h2 id={`${providerId}-title`}>{providerLabel(providerId)}</h2>
            <span className="provider-subtitle">{providerSubtitle(providerId)}</span>
            {isCheapest ? <span className="lowest-badge">Lowest cost</span> : null}
          </div>
        </div>
        <strong className="provider-total">
          {provider
            ? formatCurrency(costForInterval(provider, interval))
            : hasComparison
              ? 'Unavailable'
              : 'Pending'}
        </strong>
      </header>

      {provider ? (
        <ul className="line-item-list" aria-label={`${providerLabel(providerId)} line items`}>
          {provider.lineItems.map((item, index) => (
            <li
              key={`${providerId}-${item.category}-${index}`}
              aria-label={`${providerLabel(providerId)} ${item.category} ${item.description} ${formatCurrency(
                item.baseMonthlyCostUsd,
              )} monthly`}
            >
              <div>
                <span className={`line-category line-category-${item.category}`}>
                  {item.category}
                </span>
                <span
                  className={
                    item.isApproximate ? 'line-description approximate' : 'line-description'
                  }
                >
                  {item.isApproximate ? '≈ ' : ''}
                  {item.description}
                </span>
              </div>
              <strong>{formatCurrency(item.baseMonthlyCostUsd)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <div className="provider-empty">
          {hasComparison ? 'Pricing unavailable' : 'Ready to compare'}
        </div>
      )}
    </article>
  );
}

function CostDashboard({
  comparison,
  interval,
}: {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
}) {
  const summaries = providerCostSummaries(comparison, interval);
  const pricedSummaries = summaries.filter((summary) => summary.total !== undefined);
  const lowest = pricedSummaries[0];
  const secondLowest = pricedSummaries[1];
  const highest = pricedSummaries.at(-1);
  const spread =
    lowest?.total !== undefined && highest?.total !== undefined ? highest.total - lowest.total : 0;
  const average =
    pricedSummaries.length > 0
      ? pricedSummaries.reduce((sum, summary) => sum + (summary.total ?? 0), 0) /
        pricedSummaries.length
      : undefined;
  const categorySummaries = categoryCostSummaries(comparison, interval);
  const finOpsReview = buildFinOpsReview(comparison, interval);

  return (
    <section className="cost-dashboard" aria-label="Cost dashboard">
      <div className="metric-grid">
        <MetricCard
          label="Lowest"
          value={lowest ? formatCurrency(lowest.total ?? 0) : 'Pending'}
          detail={lowest ? providerLabel(lowest.providerId) : 'Awaiting estimate'}
          providerId={lowest?.providerId}
        />
        <MetricCard
          label="Spread"
          value={pricedSummaries.length > 1 ? formatCurrency(spread) : 'Pending'}
          detail={pricedSummaries.length > 1 ? 'Highest minus lowest' : 'Need provider totals'}
        />
        <MetricCard
          label="Average"
          value={average !== undefined ? formatCurrency(average) : 'Pending'}
          detail={`${capitalize(interval)} view`}
        />
        <MetricCard
          label="Priced"
          value={`${pricedSummaries.length}/3`}
          detail="Providers available"
        />
      </div>

      <DecisionBrief
        lowest={lowest}
        secondLowest={secondLowest}
        highest={highest}
        interval={interval}
        pricedCount={pricedSummaries.length}
        approximateCount={pricedSummaries.reduce(
          (count, summary) => count + summary.approximateCount,
          0,
        )}
      />

      <FinOpsReviewPanel review={finOpsReview} />

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-label="Provider spend chart">
          <div className="panel-heading">
            <h3>Provider Spend</h3>
            <span>{capitalize(interval)}</span>
          </div>
          <div className="provider-bars">
            {summaries.map((summary) => (
              <div className="provider-bar-row" key={summary.providerId}>
                <div className="bar-provider">
                  <ProviderMark providerId={summary.providerId} />
                  <strong>{providerLabel(summary.providerId)}</strong>
                </div>
                <div className="bar-track" aria-hidden="true">
                  <span
                    className={`bar-fill provider-fill-${summary.providerId}`}
                    style={{ width: `${summary.percentOfMax}%` }}
                  />
                </div>
                <span className="bar-value">
                  {summary.total !== undefined ? formatCurrency(summary.total) : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-panel" aria-label="Lowest provider category breakdown">
          <div className="panel-heading">
            <h3>Category Mix</h3>
            <span>{lowest ? providerLabel(lowest.providerId) : 'Pending'}</span>
          </div>
          <div className="category-bars">
            {categorySummaries.map((summary) => (
              <div className="category-row" key={summary.category}>
                <div>
                  <span className={`category-dot category-${summary.category}`} />
                  <strong>{capitalize(summary.category)}</strong>
                </div>
                <div className="bar-track" aria-hidden="true">
                  <span
                    className={`bar-fill category-fill category-${summary.category}`}
                    style={{ width: `${summary.percentOfTotal}%` }}
                  />
                </div>
                <span className="bar-value">{formatCurrency(summary.total)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="analysis-grid">
        <ProviderRanking summaries={summaries} interval={interval} />
        <IntervalOutlook comparison={comparison} />
        <CategoryHeatmap summaries={summaries} />
      </div>
    </section>
  );
}

function FinOpsReviewPanel({ review }: { review: FinOpsReview }) {
  const dominantProvider = review.dominantCategoryProvider
    ? providerLabel(review.dominantCategoryProvider)
    : undefined;
  const dominantCategory = review.dominantCategory;

  return (
    <section className="finops-review" aria-label="FinOps review">
      <div className="panel-heading">
        <div>
          <span>Architect Review</span>
          <h3>FinOps Decision Signals</h3>
        </div>
        <strong>
          {review.lineItemCount > 0 ? `${review.lineItemCount} priced drivers` : 'Pending'}
        </strong>
      </div>

      <div className="finops-metric-grid">
        <InsightCard
          label="Monthly run-rate"
          value={review.monthlyLowest ? formatCurrency(review.monthlyLowest.total ?? 0) : 'Pending'}
          detail={
            review.monthlyLowest
              ? providerLabel(review.monthlyLowest.providerId)
              : 'Awaiting estimate'
          }
          providerId={review.monthlyLowest?.providerId}
        />
        <InsightCard
          label="Annual exposure"
          value={review.yearlyLowest ? formatCurrency(review.yearlyLowest.total ?? 0) : 'Pending'}
          detail={
            review.yearlyLowest
              ? `${providerLabel(review.yearlyLowest.providerId)} on-demand`
              : 'Awaiting estimate'
          }
          providerId={review.yearlyLowest?.providerId}
        />
        <InsightCard
          label="Optimization spread"
          value={
            review.monthlySpread !== undefined ? formatCurrency(review.monthlySpread) : 'Pending'
          }
          detail={
            review.monthlySpreadPercent !== undefined
              ? `${formatPercent(review.monthlySpreadPercent)} between high and low`
              : 'Need multiple providers'
          }
        />
        <InsightCard
          label="Top cost driver"
          value={dominantCategory ? capitalize(dominantCategory.category) : 'Pending'}
          detail={
            dominantCategory && dominantProvider
              ? `${formatCurrency(dominantCategory.total)} on ${dominantProvider}`
              : 'No priced categories yet'
          }
        />
      </div>

      <div className="finops-advisor-grid">
        <div className="advisor-panel">
          <h4>Provider Fit</h4>
          <div className="provider-fit-list">
            {review.providerFit.map((fit) => (
              <div className={`provider-fit provider-fit-${fit.tone}`} key={fit.providerId}>
                <span>
                  <ProviderMark providerId={fit.providerId} />
                  {providerLabel(fit.providerId)}
                </span>
                <strong>{fit.label}</strong>
                <small>{fit.detail}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="advisor-panel">
          <h4>Recommended Next Checks</h4>
          <ul className="advisor-list">
            {review.recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function InsightCard({
  label,
  value,
  detail,
  providerId,
}: {
  label: string;
  value: string;
  detail: string;
  providerId?: ProviderId;
}) {
  return (
    <div className={providerId ? `finops-card finops-card-${providerId}` : 'finops-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>
        {providerId ? <ProviderMark providerId={providerId} /> : null}
        {detail}
      </small>
    </div>
  );
}

function DecisionBrief({
  lowest,
  secondLowest,
  highest,
  interval,
  pricedCount,
  approximateCount,
}: {
  lowest?: ProviderCostSummary;
  secondLowest?: ProviderCostSummary;
  highest?: ProviderCostSummary;
  interval: IntervalKey;
  pricedCount: number;
  approximateCount: number;
}) {
  const saveVsNext =
    lowest?.total !== undefined && secondLowest?.total !== undefined
      ? secondLowest.total - lowest.total
      : undefined;
  const saveVsHighest =
    lowest?.total !== undefined && highest?.total !== undefined ? highest.total - lowest.total : 0;

  return (
    <section className="decision-brief" aria-label="Decision brief">
      <div className="decision-lede">
        {lowest ? <ProviderMark providerId={lowest.providerId} /> : null}
        <div>
          <span>Decision Brief</span>
          <strong>
            {lowest
              ? `${providerLabel(lowest.providerId)} leads ${capitalize(interval)}`
              : 'Awaiting estimate'}
          </strong>
        </div>
      </div>

      <div className="insight-chip-row">
        <InsightChip
          label="Save vs next"
          value={saveVsNext !== undefined ? formatCurrency(saveVsNext) : 'Pending'}
        />
        <InsightChip
          label="Save vs highest"
          value={pricedCount > 1 ? formatCurrency(saveVsHighest) : 'Pending'}
        />
        <InsightChip label="Priced providers" value={`${pricedCount}/3`} />
        <InsightChip
          label="Approximate lines"
          value={approximateCount > 0 ? String(approximateCount) : '0'}
          tone={approximateCount > 0 ? 'warning' : 'success'}
        />
      </div>
    </section>
  );
}

function InsightChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'warning';
}) {
  return (
    <div className={tone ? `insight-chip insight-${tone}` : 'insight-chip'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProviderRanking({
  summaries,
  interval,
}: {
  summaries: ProviderCostSummary[];
  interval: IntervalKey;
}) {
  return (
    <section className="dashboard-panel ranking-panel" aria-label="Provider ranking">
      <div className="panel-heading">
        <h3>Provider Ranking</h3>
        <span>{capitalize(interval)}</span>
      </div>
      <div className="table-wrap">
        <table className="ranking-table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Provider</th>
              <th scope="col">Cost</th>
              <th scope="col">Delta</th>
              <th scope="col">Over Low</th>
              <th scope="col">Approx</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary, index) => (
              <tr key={summary.providerId}>
                <td>{summary.total !== undefined ? `#${index + 1}` : '-'}</td>
                <td>
                  <span className="rank-provider">
                    <ProviderMark providerId={summary.providerId} />
                    {providerLabel(summary.providerId)}
                  </span>
                </td>
                <td>{summary.total !== undefined ? formatCurrency(summary.total) : 'Pending'}</td>
                <td>
                  {summary.deltaFromLowest !== undefined
                    ? formatSignedCurrency(summary.deltaFromLowest)
                    : 'Pending'}
                </td>
                <td>
                  {summary.percentOverLowest !== undefined
                    ? formatPercent(summary.percentOverLowest)
                    : 'Pending'}
                </td>
                <td>{summary.approximateCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IntervalOutlook({ comparison }: { comparison: ComparisonResult | null }) {
  const rows = intervalOutlookRows(comparison);

  return (
    <section className="dashboard-panel interval-panel" aria-label="Interval outlook">
      <div className="panel-heading">
        <h3>Interval Outlook</h3>
        <span>All periods</span>
      </div>
      <div className="interval-outlook">
        {rows.map((row) => (
          <div className="interval-row" key={row.interval}>
            <strong>{row.label}</strong>
            <div className="interval-provider-strip">
              {row.providers.map((provider) => (
                <span
                  className={`interval-pill interval-${provider.providerId}`}
                  key={provider.providerId}
                >
                  <span
                    className={`interval-fill provider-fill-${provider.providerId}`}
                    style={{ width: `${provider.percentOfMax}%` }}
                  />
                  <span className="interval-content">
                    <ProviderMark providerId={provider.providerId} />
                    {provider.total !== undefined ? formatCurrency(provider.total) : 'Pending'}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CategoryHeatmap({ summaries }: { summaries: ProviderCostSummary[] }) {
  const rows = categoryHeatmapRows(summaries);

  return (
    <section className="dashboard-panel heatmap-panel" aria-label="Category heatmap">
      <div className="panel-heading">
        <h3>Category Heatmap</h3>
        <span>Current view</span>
      </div>
      <div className="heatmap-grid" role="table" aria-label="Provider category costs">
        <div className="heatmap-row heatmap-head" role="row">
          <span role="columnheader">Category</span>
          {PROVIDER_ORDER.map((providerId) => (
            <span role="columnheader" key={providerId}>
              {providerLabel(providerId)}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div className="heatmap-row" role="row" key={row.category}>
            <strong role="rowheader">
              <span className={`category-dot category-${row.category}`} />
              {capitalize(row.category)}
            </strong>
            {row.providers.map((provider) => (
              <span className="heat-cell" role="cell" key={provider.providerId}>
                <span
                  className={`heat-fill provider-fill-${provider.providerId}`}
                  style={{ width: `${provider.percentOfMax}%` }}
                />
                <span>
                  {provider.total !== undefined ? formatCurrency(provider.total) : 'Pending'}
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  providerId,
}: {
  label: string;
  value: string;
  detail: string;
  providerId?: ProviderId;
}) {
  return (
    <div className={providerId ? `metric-card metric-${providerId}` : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>
        {providerId ? <ProviderMark providerId={providerId} /> : null}
        {detail}
      </small>
    </div>
  );
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" role="img" aria-label="PolyCost">
      <rect x="3" y="6" width="6" height="20" rx="1.5" fill="var(--pc-provider-aws)" />
      <rect x="13" y="6" width="6" height="20" rx="1.5" fill="var(--pc-provider-azure)" />
      <rect x="23" y="6" width="6" height="20" rx="1.5" fill="var(--pc-provider-gcp)" />
      <rect x="2" y="26" width="28" height="2.5" rx="1.25" fill="var(--pc-text-primary)" />
    </svg>
  );
}

function ProviderLogo({ providerId }: { providerId: ProviderId }) {
  if (providerId === 'aws') {
    return (
      <div
        className="provider-logo-lockup provider-logo-lockup-aws"
        data-provider-logo={providerId}
        aria-hidden="true"
      >
        <svg
          className="provider-logo-icon provider-logo-icon-aws"
          viewBox="0 0 46 38"
          focusable="false"
        >
          <path className="aws-smile" d="M4 24c11 5.5 23 5.3 36-.5" />
          <path className="aws-arrow" d="M35 20.5 43 23l-6.5 6" />
        </svg>
        <span className="provider-logo-word provider-logo-word-aws">aws</span>
      </div>
    );
  }

  if (providerId === 'azure') {
    return (
      <div
        className="provider-logo-lockup provider-logo-lockup-azure"
        data-provider-logo={providerId}
        aria-hidden="true"
      >
        <svg
          className="provider-logo-icon provider-logo-icon-azure"
          viewBox="0 0 54 54"
          focusable="false"
        >
          <path className="azure-shard-main" d="M23 9 9 44h19L47 9z" />
          <path className="azure-shard-fold" d="M38 30 28 44h30z" />
        </svg>
        <span className="provider-logo-word provider-logo-word-azure">Azure</span>
      </div>
    );
  }

  return (
    <div
      className="provider-logo-lockup provider-logo-lockup-gcp"
      data-provider-logo={providerId}
      aria-hidden="true"
    >
      <svg
        className="provider-logo-icon provider-logo-icon-gcp"
        viewBox="0 0 54 54"
        focusable="false"
      >
        <path className="gcp-logo-blue" d="M21 39a15 15 0 0 1 2-25.2l4.2 7.2a7 7 0 0 0-1.9 12.2z" />
        <path
          className="gcp-logo-red"
          d="M23 13.8a15 15 0 0 1 20.2 3.5l-6.8 4.9a7 7 0 0 0-9.3-1.2z"
        />
        <path
          className="gcp-logo-yellow"
          d="M43.2 17.3A15 15 0 0 1 44.7 35l-7-4.5a7 7 0 0 0-1.3-8.4z"
        />
        <path
          className="gcp-logo-green"
          d="M44.7 35A15 15 0 0 1 21 39l4.3-5.8a7 7 0 0 0 12.4-2.7z"
        />
      </svg>
      <span className="provider-logo-word provider-logo-word-gcp">
        <span>Google</span>
        <span>Cloud</span>
      </span>
    </div>
  );
}

function ProviderMark({ providerId }: { providerId: ProviderId }) {
  if (providerId === 'aws') {
    return (
      <svg
        className="provider-mark"
        viewBox="0 0 32 32"
        role="img"
        aria-label="AWS"
        focusable="false"
      >
        <rect x="5" y="8" width="22" height="12" rx="3" />
        <path d="M9 23c5 2.5 10 2.5 15 0" />
        <path d="M22 21l4 2-4 2" />
      </svg>
    );
  }

  if (providerId === 'azure') {
    return (
      <svg
        className="provider-mark"
        viewBox="0 0 32 32"
        role="img"
        aria-label="Azure"
        focusable="false"
      >
        <path d="M14.5 5 6 25h8.2L23 5z" />
        <path d="M18.5 17.5 13.4 25H26z" />
      </svg>
    );
  }

  return (
    <svg
      className="provider-mark provider-mark-gcp"
      viewBox="0 0 32 32"
      role="img"
      aria-label="GCP"
      focusable="false"
    >
      <path className="gcp-blue" d="M10.2 22.8a8 8 0 0 1 1-13.4l2.2 3.8a3.7 3.7 0 0 0-1 6.5z" />
      <path className="gcp-red" d="M11.2 9.4a8 8 0 0 1 10.8 1.9l-3.6 2.6a3.7 3.7 0 0 0-5-.7z" />
      <path className="gcp-yellow" d="M22 11.3a8 8 0 0 1 .8 9.5l-3.7-2.4a3.7 3.7 0 0 0-.7-4.5z" />
      <path
        className="gcp-green"
        d="M22.8 20.8A8 8 0 0 1 10.2 22.8l2.2-3.1a3.7 3.7 0 0 0 6.7-1.3z"
      />
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M4 7h16M6 7v10M18 7v10M9 17h6" />
    </svg>
  );
}

function ParseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M5 5h14M5 12h10M5 19h7" />
    </svg>
  );
}

function ModeIcon({ mode }: { mode: InputMode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="segment-icon">
      {mode === 'describe' ? (
        <path d="M5 7h14M5 12h10M5 17h6" />
      ) : (
        <path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" />
      )}
    </svg>
  );
}

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="segment-icon">
      {choice === 'light' ? (
        <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
      ) : choice === 'dark' ? (
        <path d="M19 14.4A7 7 0 0 1 9.6 5a7.5 7.5 0 1 0 9.4 9.4z" />
      ) : (
        <path d="M4 5h16v10H4zM9 19h6M12 15v4" />
      )}
    </svg>
  );
}

function SampleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M7 4h10v16H7zM10 8h4M10 12h4M10 16h2" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M20 7v5h-5M4 17v-5h5M18.5 10A7 7 0 0 0 6.2 6.7M5.5 14a7 7 0 0 0 12.3 3.3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M12 4v10M8 10l4 4 4-4M5 20h14" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon animate-spin">
      <circle cx="12" cy="12" r="8" />
      <path d="M20 12a8 8 0 0 0-8-8" />
    </svg>
  );
}

function providerLabel(provider: ProviderId): string {
  switch (provider) {
    case 'aws':
      return 'AWS';
    case 'azure':
      return 'Azure';
    case 'gcp':
      return 'GCP';
  }
}

function providerSubtitle(provider: ProviderId): string {
  switch (provider) {
    case 'aws':
      return 'Amazon Web Services';
    case 'azure':
      return 'Microsoft Azure';
    case 'gcp':
      return 'Google Cloud Platform';
  }
}

function costForInterval(provider: ComparisonProviderResult, interval: IntervalKey): number {
  switch (interval) {
    case 'daily':
      return provider.totals.daily;
    case 'weekly':
      return provider.totals.weekly;
    case 'monthly':
      return provider.totals.monthly;
    case 'quarterly':
      return provider.totals.quarterly;
    case 'yearly':
      return provider.totals.yearly;
  }
}

function providerCostSummaries(
  comparison: ComparisonResult | null,
  interval: IntervalKey,
): ProviderCostSummary[] {
  const providerResults = new Map<ProviderId, ComparisonProviderResult>(
    comparison?.providers.map((provider) => [provider.providerId, provider]) ?? [],
  );
  const totals = PROVIDER_ORDER.map((providerId) => {
    const provider = providerResults.get(providerId);

    return {
      providerId,
      total: provider ? costForInterval(provider, interval) : undefined,
      approximateCount:
        provider?.lineItems.filter((lineItem) => lineItem.isApproximate).length ?? 0,
      lineItemCount: provider?.lineItems.length ?? 0,
      categoryTotals: provider
        ? categoryTotalsForLineItems(provider.lineItems, interval)
        : emptyCategoryTotals(),
    };
  });
  const maxTotal = Math.max(...totals.map((summary) => summary.total ?? 0), 0);
  const lowestTotal = Math.min(
    ...totals
      .map((summary) => summary.total)
      .filter((total): total is number => total !== undefined),
  );

  return totals
    .map((summary) => ({
      ...summary,
      percentOfMax:
        summary.total !== undefined && maxTotal > 0
          ? Math.max(4, (summary.total / maxTotal) * 100)
          : 0,
      deltaFromLowest:
        summary.total !== undefined && Number.isFinite(lowestTotal)
          ? roundCurrency(summary.total - lowestTotal)
          : undefined,
      percentOverLowest:
        summary.total !== undefined && Number.isFinite(lowestTotal) && lowestTotal > 0
          ? ((summary.total - lowestTotal) / lowestTotal) * 100
          : undefined,
    }))
    .sort(
      (left, right) =>
        (left.total ?? Number.POSITIVE_INFINITY) - (right.total ?? Number.POSITIVE_INFINITY),
    );
}

function buildFinOpsReview(
  comparison: ComparisonResult | null,
  interval: IntervalKey,
): FinOpsReview {
  const monthlySummaries = providerCostSummaries(comparison, 'monthly');
  const yearlySummaries = providerCostSummaries(comparison, 'yearly');
  const intervalSummaries = providerCostSummaries(comparison, interval);
  const monthlyPriced = monthlySummaries.filter((summary) => summary.total !== undefined);
  const monthlyLowest = monthlyPriced[0];
  const monthlyHighest = monthlyPriced.at(-1);
  const yearlyLowest = yearlySummaries.find((summary) => summary.total !== undefined);
  const monthlySpread =
    monthlyLowest?.total !== undefined && monthlyHighest?.total !== undefined
      ? roundCurrency(monthlyHighest.total - monthlyLowest.total)
      : undefined;
  const monthlySpreadPercent =
    monthlySpread !== undefined && monthlyLowest?.total !== undefined && monthlyLowest.total > 0
      ? (monthlySpread / monthlyLowest.total) * 100
      : undefined;
  const dominantProvider = intervalSummaries.find((summary) => summary.total !== undefined);
  const dominantCategory = dominantProvider?.categoryTotals
    .filter((category) => category.total > 0)
    .sort((left, right) => right.total - left.total)[0];
  const approximateCount = intervalSummaries.reduce(
    (count, summary) => count + summary.approximateCount,
    0,
  );
  const lineItemCount = intervalSummaries.reduce(
    (count, summary) => count + summary.lineItemCount,
    0,
  );

  return {
    monthlyLowest,
    yearlyLowest,
    monthlySpread,
    monthlySpreadPercent,
    dominantCategory,
    dominantCategoryProvider: dominantCategory ? dominantProvider?.providerId : undefined,
    approximateCount,
    lineItemCount,
    providerFit: providerFitSummaries(intervalSummaries, monthlyLowest),
    recommendations: finOpsRecommendations({
      approximateCount,
      dominantCategory,
      lineItemCount,
      monthlyLowest,
      monthlySpread,
      monthlySpreadPercent,
    }),
  };
}

function providerFitSummaries(
  summaries: ProviderCostSummary[],
  monthlyLowest?: ProviderCostSummary,
): ProviderFitSummary[] {
  return PROVIDER_ORDER.map((providerId) => {
    const summary = summaries.find((item) => item.providerId === providerId);

    if (!summary || summary.total === undefined) {
      return {
        providerId,
        label: 'Needs pricing',
        detail: 'Provider returned no priced estimate for this workload.',
        tone: 'unavailable',
      };
    }

    if (monthlyLowest?.providerId === providerId) {
      return {
        providerId,
        label: 'Cost leader',
        detail: 'Use as the baseline for business-case and procurement review.',
        tone: summary.approximateCount > 0 ? 'review' : 'preferred',
      };
    }

    return {
      providerId,
      label: summary.approximateCount > 0 ? 'Review fit' : 'Viable alternative',
      detail:
        summary.deltaFromLowest !== undefined
          ? `${formatSignedCurrency(summary.deltaFromLowest)} versus current low estimate.`
          : 'Compare service constraints before shortlisting.',
      tone: summary.approximateCount > 0 ? 'review' : 'preferred',
    };
  });
}

function finOpsRecommendations({
  approximateCount,
  dominantCategory,
  lineItemCount,
  monthlyLowest,
  monthlySpread,
  monthlySpreadPercent,
}: {
  approximateCount: number;
  dominantCategory?: CategoryCostSummary;
  lineItemCount: number;
  monthlyLowest?: ProviderCostSummary;
  monthlySpread?: number;
  monthlySpreadPercent?: number;
}): string[] {
  if (lineItemCount === 0) {
    return [
      'Run a comparison to populate provider-specific cost drivers.',
      'Capture region, data transfer, database HA, and storage access assumptions before presenting.',
      'Use exports as the proposal artifact once provider prices are available.',
    ];
  }

  const recommendations = [
    monthlyLowest
      ? `Use ${providerLabel(monthlyLowest.providerId)} as the current on-demand baseline, then model commitments before final selection.`
      : 'Confirm provider availability before final selection.',
  ];

  if (monthlySpread !== undefined && monthlySpread > 0) {
    recommendations.push(
      `Validate the ${formatCurrency(monthlySpread)} monthly spread with provider calculators and regional SKU assumptions.`,
    );
  }

  if (monthlySpreadPercent !== undefined && monthlySpreadPercent >= 20) {
    recommendations.push(
      'Treat the spread as material for architecture governance and procurement negotiation.',
    );
  }

  if (dominantCategory) {
    recommendations.push(
      `${capitalize(dominantCategory.category)} is the leading driver; optimize sizing, utilization, and managed-service tier first.`,
    );
  }

  if (approximateCount > 0) {
    recommendations.push(
      `Review ${approximateCount} approximate line item${approximateCount === 1 ? '' : 's'} before using this as a client-facing estimate.`,
    );
  }

  recommendations.push(
    'For production decisions, add reserved/Savings Plan/CUD scenarios and expected data-growth sensitivity.',
  );

  return recommendations.slice(0, 5);
}

function categoryCostSummaries(
  comparison: ComparisonResult | null,
  interval: IntervalKey,
): CategoryCostSummary[] {
  const cheapestProvider = comparison?.providers.find(
    (provider) => provider.providerId === comparison.cheapestProviderId,
  );

  return cheapestProvider
    ? categoryTotalsForLineItems(cheapestProvider.lineItems, interval)
    : emptyCategoryTotals();
}

function categoryTotalsForLineItems(
  lineItems: ComparisonProviderResult['lineItems'],
  interval: IntervalKey,
): CategoryCostSummary[] {
  const intervalMultiplier = intervalCostMultiplier(interval);
  const categoryTotals = new Map<ServiceCategory, number>(
    SERVICE_CATEGORIES.map((category) => [category, 0]),
  );

  for (const lineItem of lineItems) {
    categoryTotals.set(
      lineItem.category,
      (categoryTotals.get(lineItem.category) ?? 0) +
        lineItem.baseMonthlyCostUsd * intervalMultiplier,
    );
  }

  const total = Array.from(categoryTotals.values()).reduce((sum, value) => sum + value, 0);

  return SERVICE_CATEGORIES.map((category) => {
    const categoryTotal = categoryTotals.get(category) ?? 0;

    return {
      category,
      total: roundCurrency(categoryTotal),
      percentOfTotal: total > 0 ? Math.max(4, (categoryTotal / total) * 100) : 0,
    };
  });
}

function emptyCategoryTotals(): CategoryCostSummary[] {
  return SERVICE_CATEGORIES.map((category) => ({
    category,
    total: 0,
    percentOfTotal: 0,
  }));
}

function intervalOutlookRows(comparison: ComparisonResult | null): Array<{
  interval: IntervalKey;
  label: string;
  providers: Array<{ providerId: ProviderId; total?: number; percentOfMax: number }>;
}> {
  const providerResults = new Map<ProviderId, ComparisonProviderResult>(
    comparison?.providers.map((provider) => [provider.providerId, provider]) ?? [],
  );

  return INTERVALS.map(({ key, label }) => {
    const providers = PROVIDER_ORDER.map((providerId) => {
      const provider = providerResults.get(providerId);

      return {
        providerId,
        total: provider ? costForInterval(provider, key) : undefined,
      };
    });
    const maxTotal = Math.max(...providers.map((provider) => provider.total ?? 0), 0);

    return {
      interval: key,
      label,
      providers: providers.map((provider) => ({
        ...provider,
        percentOfMax:
          provider.total !== undefined && maxTotal > 0
            ? Math.max(4, (provider.total / maxTotal) * 100)
            : 0,
      })),
    };
  });
}

function categoryHeatmapRows(summaries: ProviderCostSummary[]): Array<{
  category: ServiceCategory;
  providers: Array<{ providerId: ProviderId; total?: number; percentOfMax: number }>;
}> {
  const summaryMap = new Map<ProviderId, ProviderCostSummary>(
    summaries.map((summary) => [summary.providerId, summary]),
  );

  return SERVICE_CATEGORIES.map((category) => {
    const providers = PROVIDER_ORDER.map((providerId) => {
      const summary = summaryMap.get(providerId);
      const categoryTotal = summary?.categoryTotals.find((item) => item.category === category);

      return {
        providerId,
        total: summary?.total !== undefined ? (categoryTotal?.total ?? 0) : undefined,
      };
    });
    const maxTotal = Math.max(...providers.map((provider) => provider.total ?? 0), 0);

    return {
      category,
      providers: providers.map((provider) => ({
        ...provider,
        percentOfMax:
          provider.total !== undefined && maxTotal > 0
            ? Math.max(4, (provider.total / maxTotal) * 100)
            : 0,
      })),
    };
  });
}

function intervalCostMultiplier(interval: IntervalKey): number {
  switch (interval) {
    case 'daily':
      return 1 / 30;
    case 'weekly':
      return 7 / 30;
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'yearly':
      return 12;
  }
}

function compareButtonLabel(inputMode: InputMode, busyAction: BusyAction): string {
  if (busyAction === 'compare') {
    return inputMode === 'describe' ? 'Parsing' : 'Comparing';
  }

  return inputMode === 'describe' ? 'Parse & compare' : 'Compare';
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function reviewMessage(confidence: string, fields: string[]): string {
  return fields.length > 0
    ? `Parsed with ${confidence} confidence. Review ${fields.length} field${fields.length === 1 ? '' : 's'}.`
    : `Parsed with ${confidence} confidence.`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedCurrency(value: number): string {
  if (value === 0) {
    return '$0.00';
  }

  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('en-US', {
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  })}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function toId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function downloadBlob(blob: Blob, fileName: string): void {
  if (!window.URL.createObjectURL) {
    throw new PolyCostApiError(500, 'EXPORT_UNAVAILABLE', 'Export is unavailable in this browser');
  }

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.click();
  window.URL.revokeObjectURL(url);
}
