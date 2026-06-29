import { FormEvent, useEffect, useMemo, useState } from 'react';
import { formatApiError, PolyCostClient, PolyCostApiError, polyCostClient } from './api-client';
import { applyTheme, storedTheme, ThemeChoice } from './theme';
import {
  ComparisonProviderResult,
  ComparisonResult,
  INTERVALS,
  IntervalKey,
  PROVIDER_ORDER,
  ProviderId,
  ReportFormat,
  PricingStatusResponse,
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

interface AppProps {
  client?: PolyCostClient;
}

export function App({ client = polyCostClient }: AppProps) {
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => storedTheme());
  const [inputMode, setInputMode] = useState<InputMode>('describe');
  const [naturalLanguageInput, setNaturalLanguageInput] = useState(sampleNaturalLanguageInput);
  const [form, setForm] = useState<WorkloadFormState>(defaultWorkloadForm);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [pricingStatus, setPricingStatus] = useState<PricingStatusResponse | null>(null);
  const [pricingStatusUnavailable, setPricingStatusUnavailable] = useState(false);
  const [interval, setInterval] = useState<IntervalKey>('monthly');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(themeChoice);
  }, [themeChoice]);

  useEffect(() => {
    let isMounted = true;

    client
      .getPricingStatus()
      .then((status) => {
        if (isMounted) {
          setPricingStatus(status);
          setPricingStatusUnavailable(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPricingStatusUnavailable(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client]);

  const activeNws = useMemo(
    () =>
      buildNwsFromForm(
        form,
        inputMode === 'describe' ? 'natural_language' : 'structured_form',
        inputMode === 'describe' ? naturalLanguageInput : undefined,
      ),
    [form, inputMode, naturalLanguageInput],
  );

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
      await client.validateWorkload(activeNws);
      const result = await client.createComparison(activeNws);
      setComparison(result);
      setNotice('Comparison ready.');
    } catch (comparisonError) {
      setError(formatApiError(comparisonError));
    } finally {
      setBusyAction(null);
    }
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
              Describe
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'form'}
              className="tab-button"
              onClick={() => setInputMode('form')}
            >
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
          <PricingFreshness
            comparison={comparison}
            pricingStatus={pricingStatus}
            pricingStatusUnavailable={pricingStatusUnavailable}
          />

          <RequirementSummary form={form} />

          <div className="action-row">
            <button
              type="button"
              className="pc-button pc-button-primary"
              onClick={() => void handleCompare()}
              disabled={busyAction !== null}
            >
              <CompareIcon />
              {busyAction === 'compare' ? 'Comparing' : 'Compare'}
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
        Compare
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

function PricingFreshness({
  comparison,
  pricingStatus,
  pricingStatusUnavailable,
}: {
  comparison: ComparisonResult | null;
  pricingStatus: PricingStatusResponse | null;
  pricingStatusUnavailable: boolean;
}) {
  if (comparison) {
    return (
      <div className="freshness-strip">Pricing as of {formatDate(comparison.pricingAsOf)}</div>
    );
  }

  if (pricingStatus) {
    return (
      <div className="freshness-strip">
        {PROVIDER_ORDER.map((provider) => {
          const status = pricingStatus.providers.find((entry) => entry.providerId === provider);
          return `${provider.toUpperCase()}: ${status?.status ?? 'unknown'}`;
        }).join(' · ')}
      </div>
    );
  }

  return (
    <div className="freshness-strip">
      {pricingStatusUnavailable ? 'Pricing status restricted' : 'Pricing status pending'}
    </div>
  );
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
              {providerLabel(providerId)}{' '}
              <strong>
                {provider ? formatCurrency(costForInterval(provider, interval)) : 'Unavailable'}
              </strong>
            </span>
          );
        })}
      </div>

      <div className="provider-grid">
        {PROVIDER_ORDER.map((providerId) => (
          <ProviderPanel
            key={providerId}
            providerId={providerId}
            provider={providerResults.get(providerId)}
            cheapestProviderId={comparison?.cheapestProviderId}
            interval={interval}
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
}: {
  providerId: ProviderId;
  provider?: ComparisonProviderResult;
  cheapestProviderId?: ProviderId;
  interval: IntervalKey;
}) {
  const isCheapest = cheapestProviderId === providerId;

  return (
    <article
      className={`provider-card provider-${providerId}`}
      aria-labelledby={`${providerId}-title`}
    >
      <header className="provider-header">
        <div>
          <h2 id={`${providerId}-title`}>{providerLabel(providerId)}</h2>
          {isCheapest ? <span className="lowest-badge">Lowest cost</span> : null}
        </div>
        <strong className="provider-total">
          {provider ? formatCurrency(costForInterval(provider, interval)) : 'Unavailable'}
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
                <span className="line-category">{item.category}</span>
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
        <div className="provider-empty">Pricing unavailable</div>
      )}
    </article>
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
