import { FormEvent, useEffect, useState } from 'react';
import { formatApiError, PolyCostClient, PolyCostApiError, polyCostClient } from './api-client';
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
    setForm(formFromNws(parsed.draftNws));
    setInputMode('form');

    return {
      nws: parsed.draftNws,
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

    try {
      const blob = await client.exportComparison(comparison.comparisonId, format);
      downloadBlob(blob, `polycost-comparison-${comparison.comparisonId}.${format}`);
      setNotice(`${format.toUpperCase()} export downloaded.`);
    } catch (exportError) {
      setError(formatApiError(exportError));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="app-shell" aria-labelledby="page-title">
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
              <CompareIcon />
              {compareButtonLabel(inputMode, busyAction)}
            </button>
            <button
              type="button"
              className="pc-button pc-button-secondary"
              onClick={handleRefreshLive}
              disabled={!comparison || busyAction !== null}
            >
              <RefreshIcon />
              Refresh live
            </button>
          </div>

          <ExportBar
            disabled={!comparison || busyAction !== null}
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
  onParse,
  onUseSample,
}: {
  value: string;
  isParsing: boolean;
  onChange: (value: string) => void;
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
          <ParseIcon />
          {isParsing ? 'Parsing' : 'Parse'}
        </button>
        <button type="button" className="pc-button pc-button-secondary" onClick={onUseSample}>
          <SampleIcon />
          Sample
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

  return (
    <form className="structured-form" id="requirements" onSubmit={onSubmit}>
      <div className="form-grid">
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
        <TextField
          label="Compute role"
          value={form.computeRole}
          onChange={(value) => update('computeRole', value)}
        />
        <TextField
          label="vCPU"
          value={form.vcpu}
          inputMode="decimal"
          onChange={(value) => update('vcpu', value)}
        />
        <TextField
          label="Memory GB"
          value={form.memoryGb}
          inputMode="decimal"
          onChange={(value) => update('memoryGb', value)}
        />
        <TextField
          label="Instances"
          value={form.instanceCount}
          inputMode="numeric"
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
          onChange={(value) => update('autoscaleMin', value)}
        />
        <TextField
          label="Scale max"
          value={form.autoscaleMax}
          inputMode="numeric"
          onChange={(value) => update('autoscaleMax', value)}
        />
      </div>

      <div className="form-switches" aria-label="Workload options">
        <CheckboxField
          label="Object storage"
          checked={form.storageEnabled}
          onChange={(checked) => update('storageEnabled', checked)}
        />
        <CheckboxField
          label="Managed database"
          checked={form.databaseEnabled}
          onChange={(checked) => update('databaseEnabled', checked)}
        />
        <CheckboxField
          label="CDN"
          checked={form.cdn}
          onChange={(checked) => update('cdn', checked)}
        />
        <CheckboxField
          label="Load balancer"
          checked={form.loadBalancer}
          onChange={(checked) => update('loadBalancer', checked)}
        />
        <CheckboxField
          label="Multi-AZ"
          checked={form.multiAz}
          onChange={(checked) => update('multiAz', checked)}
        />
        <CheckboxField
          label="Multi-region"
          checked={form.multiRegion}
          onChange={(checked) => update('multiRegion', checked)}
        />
      </div>

      <div className="form-grid secondary-grid">
        <TextField
          label="Storage GB"
          value={form.storageSizeGb}
          inputMode="decimal"
          onChange={(value) => update('storageSizeGb', value)}
        />
        <SelectField
          label="Storage type"
          value={form.storageType}
          options={[
            ['object', 'Object'],
            ['block', 'Block'],
            ['file', 'File'],
          ]}
          onChange={(value) => update('storageType', value)}
        />
        <SelectField
          label="Database"
          value={form.databaseEngine}
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
          onChange={(value) => update('databaseSizeGb', value)}
        />
        <TextField
          label="Egress GB/mo"
          value={form.monthlyEgressGb}
          inputMode="decimal"
          onChange={(value) => update('monthlyEgressGb', value)}
        />
        <TextField
          label="SLA target"
          value={form.slaTarget}
          onChange={(value) => update('slaTarget', value)}
        />
      </div>

      <button type="submit" className="sr-only">
        Submit structured workload
      </button>
    </form>
  );
}

function TextField({
  label,
  value,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  onChange: (value: string) => void;
}) {
  const id = toId(label);
  return (
    <label className="form-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  const id = toId(label);
  return (
    <label className="form-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.currentTarget.value as T)}>
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
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="checkbox-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
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
  onExport,
}: {
  disabled: boolean;
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
          <DownloadIcon />
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
