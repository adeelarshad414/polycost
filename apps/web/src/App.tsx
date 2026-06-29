import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { formatApiError, PolyCostClient, PolyCostApiError, polyCostClient } from './api-client';
import { Button } from './components/Button';
import { FinOpsFeatureLayer, SharedReportPlaceholder } from './components/FinOpsFeatureLayer';
import { LandingPage } from './components/LandingPage';
import { PersonaComparisonWorkspace } from './components/PersonaComparisonWorkspace';
import { TopLoadingBar } from './components/TopLoadingBar';
import { providerLogoSrc, providerMarkSrc } from './provider-brand';
import {
  CLOUD_SERVICE_CATALOG,
  SERVICE_CATALOG_CATEGORIES,
  type CloudServiceFamily,
  type ServiceSupportStatus,
  orderedServiceFamilyIds,
  serviceCatalogTraceability,
  supportLabel,
} from './service-catalog';
import { applyTheme, ResolvedTheme, resolveTheme, storedTheme, ThemeChoice } from './theme';
import {
  ComparisonProviderResult,
  ComparisonResult,
  INTERVALS,
  IntervalKey,
  NormalizedWorkloadSpec,
  PROVIDER_ORDER,
  ProviderId,
  RegionCatalogResponse,
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
type ResultWorkspaceView = 'executive' | 'engineering';
type ServiceCategory = ComparisonProviderResult['lineItems'][number]['category'];
type FormSectionTone = 'profile' | 'compute' | 'services' | 'portfolio' | 'data' | 'network';
type ToggleIconKind = 'storage' | 'database' | 'cdn' | 'loadBalancer' | 'multiAz' | 'multiRegion';

const RESULT_WORKSPACE_VIEWS: Array<{
  key: ResultWorkspaceView;
  label: string;
  description: string;
}> = [
  {
    key: 'executive',
    label: 'Executive View',
    description: 'Decision memo, savings, provider ranking',
  },
  {
    key: 'engineering',
    label: 'Engineering View',
    description: 'Architecture checks, cost drivers, exports',
  },
];

const SERVICE_CATEGORIES: ServiceCategory[] = ['compute', 'storage', 'database', 'network'];

const DEFAULT_CALCULATOR_URLS: Record<ProviderId, string> = {
  aws: 'https://calculator.aws/#/',
  azure: 'https://azure.microsoft.com/en-us/pricing/calculator/',
  gcp: 'https://cloud.google.com/products/calculator',
};

const DEFAULT_REGION_REFERENCE_URLS: Record<ProviderId, string> = {
  aws: 'https://aws.amazon.com/about-aws/global-infrastructure/regions_az/',
  azure: 'https://learn.microsoft.com/en-us/azure/reliability/availability-zones-region-support',
  gcp: 'https://cloud.google.com/compute/docs/regions-zones',
};

const FALLBACK_REGION_CATALOG: RegionCatalogResponse = {
  generatedAt: 'fallback',
  cacheTtlSeconds: 0,
  providers: [
    {
      providerId: 'aws',
      label: 'AWS',
      source: 'fallback',
      sourceUrl: 'https://b0.p.awsstatic.com/locations/1.0/aws/current/locations.json',
      calculatorUrl: DEFAULT_CALCULATOR_URLS.aws,
      regions: [
        { providerId: 'aws', id: 'us-east-1', label: 'US East (N. Virginia)', source: 'fallback' },
        { providerId: 'aws', id: 'us-east-2', label: 'US East (Ohio)', source: 'fallback' },
        {
          providerId: 'aws',
          id: 'us-west-1',
          label: 'US West (N. California)',
          source: 'fallback',
        },
        { providerId: 'aws', id: 'us-west-2', label: 'US West (Oregon)', source: 'fallback' },
        { providerId: 'aws', id: 'eu-west-1', label: 'Europe (Ireland)', source: 'fallback' },
        { providerId: 'aws', id: 'eu-central-1', label: 'Europe (Frankfurt)', source: 'fallback' },
        { providerId: 'aws', id: 'ap-south-1', label: 'Asia Pacific (Mumbai)', source: 'fallback' },
        {
          providerId: 'aws',
          id: 'ap-southeast-1',
          label: 'Asia Pacific (Singapore)',
          source: 'fallback',
        },
        {
          providerId: 'aws',
          id: 'ap-northeast-1',
          label: 'Asia Pacific (Tokyo)',
          source: 'fallback',
        },
      ],
    },
    {
      providerId: 'azure',
      label: 'Azure',
      source: 'fallback',
      sourceUrl:
        'https://azure.microsoft.com/en-us/explore/global-infrastructure/products-by-region/table',
      calculatorUrl: DEFAULT_CALCULATOR_URLS.azure,
      regions: [
        { providerId: 'azure', id: 'eastus', label: 'East US', source: 'fallback' },
        { providerId: 'azure', id: 'eastus2', label: 'East US 2', source: 'fallback' },
        { providerId: 'azure', id: 'centralus', label: 'Central US', source: 'fallback' },
        { providerId: 'azure', id: 'westus', label: 'West US', source: 'fallback' },
        { providerId: 'azure', id: 'westus2', label: 'West US 2', source: 'fallback' },
        { providerId: 'azure', id: 'westus3', label: 'West US 3', source: 'fallback' },
        { providerId: 'azure', id: 'uksouth', label: 'UK South', source: 'fallback' },
        { providerId: 'azure', id: 'westeurope', label: 'West Europe', source: 'fallback' },
        { providerId: 'azure', id: 'southeastasia', label: 'Southeast Asia', source: 'fallback' },
      ],
    },
    {
      providerId: 'gcp',
      label: 'Google Cloud',
      source: 'fallback',
      sourceUrl: 'https://www.gstatic.com/ipranges/cloud.json',
      calculatorUrl: DEFAULT_CALCULATOR_URLS.gcp,
      regions: [
        { providerId: 'gcp', id: 'us-central1', label: 'US Central (Iowa)', source: 'fallback' },
        {
          providerId: 'gcp',
          id: 'us-east1',
          label: 'US East (South Carolina)',
          source: 'fallback',
        },
        {
          providerId: 'gcp',
          id: 'us-east4',
          label: 'US East (Northern Virginia)',
          source: 'fallback',
        },
        { providerId: 'gcp', id: 'us-west1', label: 'US West (Oregon)', source: 'fallback' },
        {
          providerId: 'gcp',
          id: 'europe-west1',
          label: 'Europe West (Belgium)',
          source: 'fallback',
        },
        {
          providerId: 'gcp',
          id: 'europe-west2',
          label: 'Europe West (London)',
          source: 'fallback',
        },
        { providerId: 'gcp', id: 'asia-south1', label: 'Asia South (Mumbai)', source: 'fallback' },
        {
          providerId: 'gcp',
          id: 'asia-southeast1',
          label: 'Asia Southeast (Singapore)',
          source: 'fallback',
        },
        {
          providerId: 'gcp',
          id: 'asia-northeast1',
          label: 'Asia Northeast (Tokyo)',
          source: 'fallback',
        },
      ],
    },
  ],
};

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
  executiveDecision: ExecutiveDecision;
  solutionArchitecture: SolutionArchitectureReview;
  monthlyLowest?: ProviderCostSummary;
  yearlyLowest?: ProviderCostSummary;
  monthlySpread?: number;
  monthlySpreadPercent?: number;
  dominantCategory?: CategoryCostSummary;
  dominantCategoryProvider?: ProviderId;
  approximateCount: number;
  lineItemCount: number;
  pricedProviderCount: number;
  providerFit: ProviderFitSummary[];
  recommendations: string[];
}

interface ExecutiveDecision {
  headline: string;
  subhead: string;
  confidence: 'High' | 'Medium' | 'Low' | 'Pending';
  confidenceDetail: string;
  annualExposure?: number;
  avoidableAnnualSpend?: number;
  lenses: ExecutiveLens[];
}

interface ExecutiveLens {
  role: 'Budget' | 'Delivery' | 'Risk' | 'Governance' | 'Provider';
  label: string;
  value: string;
  detail: string;
}

interface SolutionArchitectureReview {
  posture: 'Ready for shortlist' | 'Architecture review' | 'Assumptions needed' | 'Pending';
  riskLevel: 'Low' | 'Medium' | 'High' | 'Pending';
  summary: string;
  baselineLabel: string;
  baselineValue: string;
  checkpoints: SolutionArchitectureCheckpoint[];
}

interface SolutionArchitectureCheckpoint {
  label: string;
  value: string;
  detail: string;
  tone: 'good' | 'review' | 'risk' | 'pending';
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
  const shareToken = shareTokenFromLocation();
  const isPageLoading = usePageLoadingState();
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => storedTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(storedTheme()),
  );
  const [inputMode, setInputMode] = useState<InputMode>('describe');
  const [naturalLanguageInput, setNaturalLanguageInput] = useState(sampleNaturalLanguageInput);
  const [form, setForm] = useState<WorkloadFormState>(defaultWorkloadForm);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [interval, setInterval] = useState<IntervalKey>('monthly');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [exportingFormat, setExportingFormat] = useState<ReportFormat | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regionCatalog, setRegionCatalog] = useState<RegionCatalogResponse | null>(null);
  const [regionCatalogError, setRegionCatalogError] = useState<string | null>(null);

  useEffect(() => {
    setResolvedTheme(applyTheme(themeChoice));
  }, [themeChoice]);

  useEffect(() => {
    let isMounted = true;

    void client
      .getRegionCatalog()
      .then((catalog) => {
        if (!isMounted) {
          return;
        }

        setRegionCatalog(catalog);
        setRegionCatalogError(null);
      })
      .catch((catalogError) => {
        if (!isMounted) {
          return;
        }

        setRegionCatalog(null);
        setRegionCatalogError(formatApiError(catalogError));
      });

    return () => {
      isMounted = false;
    };
  }, [client]);

  if (shareToken) {
    return <SharedReportPlaceholder token={shareToken} />;
  }

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

  function handleStartComparing() {
    setInputMode('describe');
    scrollToElement('requirements');
    window.requestAnimationFrame(() => {
      document.getElementById('natural-language-input')?.focus();
    });
  }

  function handleViewDemo() {
    scrollToElement('pricing');
  }

  function handleSignInNotice() {
    setError(null);
    setNotice('Sign in is not configured in this self-hosted MVP.');
    scrollToElement('requirements');
  }

  return (
    <main className="app-shell" aria-labelledby="page-title">
      <TopLoadingBar isLoading={isPageLoading} />
      <ScrollProgressBar />
      <LandingPage
        comparison={comparison}
        form={form}
        resolvedTheme={resolvedTheme}
        themeChoice={themeChoice}
        onStartComparing={handleStartComparing}
        onThemeChange={setThemeChoice}
        onViewDemo={handleViewDemo}
        onSignIn={handleSignInNotice}
      />

      <section
        className="workbench-shell mx-auto grid max-w-[1440px] gap-5 xl:grid-cols-[minmax(320px,0.34fr)_minmax(0,0.66fr)] xl:items-start"
        id="requirements"
        aria-label="Cost comparison workbench"
      >
        <div
          className="workbench-config grid min-w-0 gap-4 print:hidden"
          aria-label="Workload configuration"
        >
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
              <WorkloadForm
                form={form}
                regionCatalog={regionCatalog}
                regionCatalogError={regionCatalogError}
                onChange={setForm}
                onSubmit={handleCompare}
              />
            )}
          </section>

          <section className="summary-zone lg:!static" aria-label="Current estimate controls">
            <PricingFreshness comparison={comparison} />

            <RequirementSummary form={form} />

            <CloudCalculatorLinks regionCatalog={regionCatalog} />

            <div className="action-row">
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleCompare()}
                loading={busyAction === 'compare'}
                loadingLabel={compareLoadingLabel(inputMode)}
                disabled={busyAction !== null && busyAction !== 'compare'}
              >
                <CompareIcon />
                {compareButtonLabel(inputMode)}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleRefreshLive}
                loading={busyAction === 'refresh'}
                loadingLabel="Refreshing..."
                disabled={!comparison || (busyAction !== null && busyAction !== 'refresh')}
              >
                <RefreshIcon />
                Refresh live
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleClearComparison}
                disabled={!comparison || busyAction !== null}
              >
                <ClearIcon />
                Clear costs
              </Button>
            </div>

            <ExportBar
              disabled={!comparison || (busyAction !== null && busyAction !== 'export')}
              exportingFormat={exportingFormat}
              onExport={(format) => void handleExport(format)}
            />

            <StatusMessage notice={notice} error={error} />
          </section>
        </div>

        <section className="workbench-results min-w-0" id="docs" aria-label="Provider comparison">
          <ComparisonToolbar interval={interval} onIntervalChange={setInterval} />
          <ComparisonView
            comparison={comparison}
            interval={interval}
            form={form}
            isLoading={busyAction === 'compare' || busyAction === 'refresh'}
            error={error}
            exportingFormat={exportingFormat}
            onExport={(format) => void handleExport(format)}
          />
        </section>
      </section>
    </main>
  );
}

function usePageLoadingState(): boolean {
  const [isPageLoading, setIsPageLoading] = useState(() => document.readyState !== 'complete');

  useEffect(() => {
    let hashNavigationStarted = false;

    function stopLoading() {
      hashNavigationStarted = false;
      setIsPageLoading(false);
    }

    function startLoadingForHashNavigation(event: MouseEvent) {
      if (!(event.target instanceof Element)) {
        return;
      }

      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');

      if (!anchor) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      const isSameDocument =
        destination.origin === window.location.origin &&
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search;

      if (!isSameDocument || !destination.hash || destination.hash === window.location.hash) {
        return;
      }

      hashNavigationStarted = true;
      setIsPageLoading(true);
    }

    function handleHashChange() {
      if (hashNavigationStarted) {
        stopLoading();
      }
    }

    function handleBeforeUnload() {
      setIsPageLoading(true);
    }

    if (document.readyState === 'complete') {
      setIsPageLoading(false);
    } else {
      window.addEventListener('load', stopLoading, { once: true });
    }

    document.addEventListener('click', startLoadingForHashNavigation, true);
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('load', stopLoading);
      document.removeEventListener('click', startLoadingForHashNavigation, true);
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return isPageLoading;
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
    <div className="describe-panel">
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
        <Button
          type="button"
          variant="primary"
          onClick={onParse}
          loading={isParsing}
          loadingLabel="Parsing..."
        >
          <ParseIcon />
          Parse
        </Button>
        <Button type="button" variant="secondary" onClick={onUseSample}>
          <SampleIcon />
          Sample
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={onClear}
          disabled={isParsing || value.length === 0}
        >
          <ClearIcon />
          Clear
        </Button>
      </div>
    </div>
  );
}

function WorkloadForm({
  form,
  regionCatalog,
  regionCatalogError,
  onChange,
  onSubmit,
}: {
  form: WorkloadFormState;
  regionCatalog: RegionCatalogResponse | null;
  regionCatalogError: string | null;
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
    <form className="structured-form" onSubmit={onSubmit}>
      <div className="form-overview-strip" aria-label="Workload sizing summary">
        <FormSummaryChip label="Traffic" value={sizingSummary.traffic} tone="profile" />
        <FormSummaryChip label="Compute" value={sizingSummary.compute} tone="compute" />
        <FormSummaryChip label="Scale" value={sizingSummary.scale} tone="services" />
        <FormSummaryChip label="Portfolio" value={sizingSummary.services} tone="portfolio" />
        <FormSummaryChip label="Data" value={sizingSummary.data} tone="data" />
      </div>

      <FormSection title="Workload" tone="profile" defaultOpen>
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
          <RegionSelectField
            value={form.regionPreference}
            regionCatalog={regionCatalog}
            regionCatalogError={regionCatalogError}
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

      <FormSection title="Compute" tone="compute" defaultOpen>
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

      <FormSection title="Services" tone="services" defaultOpen>
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
  defaultOpen = false,
  children,
}: {
  title: string;
  tone: FormSectionTone;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const headingId = `form-section-${tone}`;

  return (
    <details
      className={`form-section form-section-${tone}`}
      aria-labelledby={headingId}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="form-section-heading">
        <span className="form-section-icon" aria-hidden="true">
          <FormSectionIcon tone={tone} />
        </span>
        <h3 id={headingId}>{title}</h3>
        <span className="form-section-chevron" aria-hidden="true">
          {isOpen ? '-' : '+'}
        </span>
      </summary>
      <div className="form-section-body">{children}</div>
    </details>
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

function RegionSelectField({
  value,
  regionCatalog,
  regionCatalogError,
  onChange,
}: {
  value: string;
  regionCatalog: RegionCatalogResponse | null;
  regionCatalogError: string | null;
  onChange: (value: string) => void;
}) {
  const catalog = regionCatalog ?? FALLBACK_REGION_CATALOG;
  const providerCatalogs = PROVIDER_ORDER.map((providerId) =>
    catalog.providers.find((provider) => provider.providerId === providerId),
  ).filter((provider): provider is RegionCatalogResponse['providers'][number] => Boolean(provider));
  const regionCount = providerCatalogs.reduce(
    (count, provider) => count + provider.regions.length,
    0,
  );
  const selectedRegion = providerCatalogs
    .flatMap((provider) => provider.regions)
    .find((region) => region.id === value);
  const catalogLabel = regionCatalog
    ? providerCatalogs.some((provider) => provider.source === 'live')
      ? 'Live provider catalog'
      : 'Fallback provider catalog'
    : 'Loading live provider catalog';

  return (
    <label className="form-field region-field" htmlFor="region">
      <span className="region-field-header">
        <span className="field-caption">Region</span>
        <span
          className={regionCatalogError ? 'region-source-pill is-warning' : 'region-source-pill'}
        >
          {regionCatalogError ? 'Fallback' : regionCatalog ? 'Live' : 'Loading'}
        </span>
      </span>
      <select
        id="region"
        className="region-select"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {value && !selectedRegion ? (
          <option value={value}>Current selection: {value}</option>
        ) : null}
        {providerCatalogs.map((provider) => (
          <optgroup
            key={provider.providerId}
            label={`${providerLabel(provider.providerId)} regions (${provider.regions.length})`}
          >
            {provider.regions.map((region) => (
              <option key={`${provider.providerId}-${region.id}`} value={region.id}>
                {region.id} - {region.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="field-help">
        {catalogLabel} · {regionCount} regions · calculators open provider pricing pages.
      </span>
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

function CloudCalculatorLinks({ regionCatalog }: { regionCatalog: RegionCatalogResponse | null }) {
  const catalogsByProvider = new Map(
    regionCatalog?.providers.map((provider) => [provider.providerId, provider]) ?? [],
  );

  return (
    <section className="calculator-links" aria-label="Official cloud pricing and region references">
      <div className="calculator-links-heading">
        <span>Official calculators</span>
        <strong>Validate regional pricing</strong>
      </div>
      <div className="calculator-link-grid">
        {PROVIDER_ORDER.map((providerId) => {
          const url =
            catalogsByProvider.get(providerId)?.calculatorUrl ?? defaultCalculatorUrl(providerId);

          return (
            <a
              key={providerId}
              className={`calculator-link calculator-link-${providerId}`}
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              <img src={providerLogoSrc(providerId)} alt="" aria-hidden="true" />
              <span>{providerLabel(providerId)} Calculator</span>
              <ExternalLinkIcon />
            </a>
          );
        })}
      </div>
      <div className="calculator-links-heading calculator-links-subheading">
        <span>Official region and zone maps</span>
        <strong>Check regions, AZs, and zones</strong>
      </div>
      <div className="calculator-link-grid region-link-grid">
        {PROVIDER_ORDER.map((providerId) => (
          <a
            key={providerId}
            className={`calculator-link region-link calculator-link-${providerId}`}
            href={regionReferenceUrl(providerId)}
            target="_blank"
            rel="noreferrer"
          >
            <ProviderMark providerId={providerId} />
            <span>{regionReferenceLabel(providerId)}</span>
            <ExternalLinkIcon />
          </a>
        ))}
      </div>
    </section>
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
      {(['pdf', 'csv', 'xlsx'] as ReportFormat[]).map((format) => {
        const label = reportFormatLabel(format);
        const isExporting = exportingFormat === format;

        return (
          <Button
            key={format}
            type="button"
            variant="secondary"
            disabled={disabled || (exportingFormat !== null && !isExporting)}
            loading={isExporting}
            loadingLabel={`Exporting ${label}...`}
            onClick={() => onExport(format)}
          >
            <DownloadIcon />
            {label}
          </Button>
        );
      })}
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
  error = null,
  exportingFormat = null,
  form = defaultWorkloadForm,
  interval,
  isLoading = false,
  onExport,
}: {
  comparison: ComparisonResult | null;
  error?: string | null;
  exportingFormat?: ReportFormat | null;
  interval: IntervalKey;
  form?: WorkloadFormState;
  isLoading?: boolean;
  onExport?: (format: ReportFormat) => void;
}) {
  const [activeView, setActiveView] = useState<ResultWorkspaceView>('executive');
  const providerResults = new Map<ProviderId, ComparisonProviderResult>(
    comparison?.providers.map((provider) => [provider.providerId, provider]) ?? [],
  );

  function handleViewChange(view: ResultWorkspaceView) {
    setActiveView(view);
    window.requestAnimationFrame(() => {
      scrollToElement(`${view}-view`);
    });
  }

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
                {provider ? (
                  formatCurrency(costForInterval(provider, interval))
                ) : comparison ? (
                  'Unavailable'
                ) : (
                  <ProviderPendingValue providerId={providerId} compact />
                )}
              </strong>
            </span>
          );
        })}
      </div>

      <ResultWorkspaceNav
        activeView={activeView}
        hasComparison={Boolean(comparison)}
        onChange={handleViewChange}
      />

      <div className="result-workspace-panel result-workspace-stack">
        <section
          className="result-view-section result-view-section-executive"
          id="executive-view"
          aria-labelledby="executive-view-title"
        >
          <ResultSectionHeader
            id="executive-view-title"
            eyebrow="Executive View"
            title="Decision-ready comparison"
            description="A concise business view of provider totals, savings spread, annual exposure, confidence, and shortlist ranking."
          />
          <ExecutiveOverview comparison={comparison} interval={interval} form={form} />
          <ProviderCostWorkspace comparison={comparison} interval={interval} />
        </section>

        <section
          className="result-view-section result-view-section-engineering"
          id="engineering-view"
          aria-labelledby="engineering-view-title"
        >
          <ResultSectionHeader
            id="engineering-view-title"
            eyebrow="Engineering View"
            title="Technical validation workspace"
            description="Service fit, resilience checks, commitment scenarios, cost drivers, export controls, and API-facing line-item rows."
          />
          <ArchitectureWorkspace comparison={comparison} interval={interval} form={form} />
          <FinOpsFeatureLayer comparison={comparison} interval={interval} isLoading={isLoading} />
          <PersonaComparisonWorkspace
            comparison={comparison}
            interval={interval}
            form={form}
            defaultViewMode="engineering"
            emptyStateMessage="Run a comparison to populate engineering rows, export controls, and API-facing cost evidence."
            isLoading={isLoading}
            error={error}
            exportingFormat={exportingFormat}
            onExport={onExport}
            showViewSwitcher={false}
          />
        </section>
      </div>
    </div>
  );
}

function ResultWorkspaceNav({
  activeView,
  hasComparison,
  onChange,
}: {
  activeView: ResultWorkspaceView;
  hasComparison: boolean;
  onChange: (view: ResultWorkspaceView) => void;
}) {
  return (
    <section className="result-workspace-nav" aria-label="Result audience views">
      <div>
        <span>Workspace</span>
        <strong>{hasComparison ? 'Comparison ready' : 'Run comparison to populate data'}</strong>
      </div>
      <div className="result-tabs" role="group" aria-label="Jump to result view">
        {RESULT_WORKSPACE_VIEWS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={activeView === tab.key}
            onClick={() => onChange(tab.key)}
          >
            <span>{tab.label}</span>
            <small>{tab.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ResultSectionHeader({
  description,
  eyebrow,
  id,
  title,
}: {
  description: string;
  eyebrow: string;
  id: string;
  title: string;
}) {
  return (
    <div className="result-section-header">
      <div>
        <span>{eyebrow}</span>
        <h2 id={id}>{title}</h2>
      </div>
      <p>{description}</p>
    </div>
  );
}

function ExecutiveOverview({
  comparison,
  interval,
  form,
}: {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
  form: WorkloadFormState;
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
  const review = buildFinOpsReview(comparison, interval, form);

  return (
    <section className="demo-overview" aria-label="Executive demo overview">
      <ExecutiveDecisionPanel decision={review.executiveDecision} />

      <div className="metric-grid metric-grid-compact">
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
          label="Confidence"
          value={review.executiveDecision.confidence}
          detail={review.executiveDecision.confidenceDetail}
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

      <FinancialAnalyticsPanel comparison={comparison} form={form} />

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
    </section>
  );
}

function FinancialAnalyticsPanel({
  comparison,
  form,
}: {
  comparison: ComparisonResult | null;
  form: WorkloadFormState;
}) {
  const monthlySummaries = providerCostSummaries(comparison, 'monthly');
  const pricedMonthly = monthlySummaries.filter((summary) => summary.total !== undefined);
  const lowest = pricedMonthly[0];
  const highest = pricedMonthly.at(-1);
  const monthlyBaseline = lowest?.total;
  const annualBaseline =
    monthlyBaseline !== undefined ? roundCurrency(monthlyBaseline * 12) : undefined;
  const threeYearBaseline =
    monthlyBaseline !== undefined ? roundCurrency(monthlyBaseline * 36) : undefined;
  const annualSpread =
    lowest?.total !== undefined && highest?.total !== undefined
      ? roundCurrency((highest.total - lowest.total) * 12)
      : undefined;
  const dailyUsers = parseInputNumber(form.dailyActiveUsers);
  const peakUsers = parseInputNumber(form.peakConcurrentUsers);
  const egressGb = parseInputNumber(form.monthlyEgressGb);
  const unitDailyUser =
    monthlyBaseline !== undefined && dailyUsers && dailyUsers > 0
      ? monthlyBaseline / dailyUsers
      : undefined;
  const unitPeakUser =
    monthlyBaseline !== undefined && peakUsers && peakUsers > 0
      ? monthlyBaseline / peakUsers
      : undefined;
  const unitEgress =
    monthlyBaseline !== undefined && egressGb && egressGb > 0
      ? monthlyBaseline / egressGb
      : undefined;
  const forecastRows = financialForecastRows(monthlyBaseline);
  const maxMonthlyTotal = Math.max(...monthlySummaries.map((summary) => summary.total ?? 0), 0);

  return (
    <section className="financial-analytics" aria-label="Financial analytics">
      <div className="panel-heading">
        <div>
          <span>Financial Analytics</span>
          <h3>Run-rate, variance, and unit economics</h3>
        </div>
        <strong>
          {lowest ? `${providerLabel(lowest.providerId)} baseline` : 'Pending baseline'}
        </strong>
      </div>

      <div className="financial-kpi-grid">
        <InsightCard
          label="Monthly run-rate"
          value={monthlyBaseline !== undefined ? formatCurrency(monthlyBaseline) : 'Pending'}
          detail={
            lowest
              ? `${providerLabel(lowest.providerId)} lowest estimate`
              : 'Awaiting provider totals'
          }
          providerId={lowest?.providerId}
        />
        <InsightCard
          label="Annualized exposure"
          value={annualBaseline !== undefined ? formatCurrency(annualBaseline) : 'Pending'}
          detail="12-month on-demand view"
          providerId={lowest?.providerId}
        />
        <InsightCard
          label="3-year exposure"
          value={threeYearBaseline !== undefined ? formatCurrency(threeYearBaseline) : 'Pending'}
          detail="Before commitments and growth"
          providerId={lowest?.providerId}
        />
        <InsightCard
          label="Annual savings spread"
          value={annualSpread !== undefined ? formatCurrency(annualSpread) : 'Pending'}
          detail="Highest minus lowest provider"
        />
      </div>

      <div className="financial-chart-grid">
        <section
          className="financial-chart-card forecast-card"
          aria-label="Run-rate forecast ladder"
        >
          <div className="chart-heading">
            <h4>Run-rate Ladder</h4>
            <span>Month to 3 years</span>
          </div>
          <div className="forecast-bars">
            {forecastRows.map((row) => (
              <div className="forecast-bar-item" key={row.label}>
                <div className="forecast-bar-track" aria-hidden="true">
                  <span
                    className={
                      lowest
                        ? `forecast-bar-fill provider-fill-${lowest.providerId}`
                        : 'forecast-bar-fill'
                    }
                    style={{ height: `${row.percent}%` }}
                  />
                </div>
                <strong>{row.total !== undefined ? formatCurrency(row.total) : 'Pending'}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="financial-chart-card variance-card" aria-label="Provider variance bars">
          <div className="chart-heading">
            <h4>Provider Variance</h4>
            <span>Monthly delta</span>
          </div>
          <div className="variance-list">
            {monthlySummaries.map((summary) => (
              <div className="variance-row" key={summary.providerId}>
                <div className="variance-provider">
                  <ProviderMark providerId={summary.providerId} />
                  <strong>{providerLabel(summary.providerId)}</strong>
                </div>
                <div className="variance-track" aria-hidden="true">
                  <span
                    className={`variance-fill provider-fill-${summary.providerId}`}
                    style={{
                      width:
                        summary.total !== undefined && maxMonthlyTotal > 0
                          ? `${Math.max(4, (summary.total / maxMonthlyTotal) * 100)}%`
                          : '0%',
                    }}
                  />
                </div>
                <span className="variance-value">
                  {summary.total !== undefined ? formatCurrency(summary.total) : 'Pending'}
                  <small>
                    {summary.deltaFromLowest !== undefined
                      ? formatSignedCurrency(summary.deltaFromLowest)
                      : 'Delta pending'}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="financial-chart-card mix-card" aria-label="Provider category mix">
          <div className="chart-heading">
            <h4>Cost Mix Stack</h4>
            <span>Compute / storage / database / network</span>
          </div>
          <div className="mix-stack-list">
            {monthlySummaries.map((summary) => (
              <div className="mix-stack-row" key={summary.providerId}>
                <div className="mix-stack-label">
                  <ProviderMark providerId={summary.providerId} />
                  <strong>{providerLabel(summary.providerId)}</strong>
                </div>
                <div className="mix-stack-bar" aria-hidden="true">
                  {summary.categoryTotals.map((category) => (
                    <span
                      className={`mix-segment category-fill category-${category.category}`}
                      key={`${summary.providerId}-${category.category}`}
                      style={{ width: `${category.percentOfTotal}%` }}
                    />
                  ))}
                </div>
                <span>
                  {summary.total !== undefined ? formatCurrency(summary.total) : 'Pending'}
                </span>
              </div>
            ))}
          </div>
          <div className="mix-legend" aria-label="Cost mix legend">
            {SERVICE_CATEGORIES.map((category) => (
              <span key={category}>
                <i className={`category-dot category-${category}`} />
                {capitalize(category)}
              </span>
            ))}
          </div>
        </section>

        <section className="financial-chart-card unit-card" aria-label="Unit economics">
          <div className="chart-heading">
            <h4>Unit Economics</h4>
            <span>Blended workload ratios</span>
          </div>
          <div className="unit-economics-grid">
            <FinancialRatioCard
              label="Per daily user"
              value={unitDailyUser !== undefined ? formatUnitCurrency(unitDailyUser) : 'Pending'}
              detail={
                dailyUsers
                  ? `${dailyUsers.toLocaleString('en-US')} DAU modeled`
                  : 'DAU not specified'
              }
            />
            <FinancialRatioCard
              label="Per peak user"
              value={unitPeakUser !== undefined ? formatUnitCurrency(unitPeakUser) : 'Pending'}
              detail={
                peakUsers
                  ? `${peakUsers.toLocaleString('en-US')} peak concurrent`
                  : 'Peak not specified'
              }
            />
            <FinancialRatioCard
              label="Per egress GB"
              value={unitEgress !== undefined ? formatUnitCurrency(unitEgress) : 'Pending'}
              detail={
                egressGb
                  ? `${egressGb.toLocaleString('en-US')}GB monthly egress`
                  : 'Egress not specified'
              }
            />
          </div>
        </section>
      </div>
    </section>
  );
}

function FinancialRatioCard({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="financial-ratio-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ProviderCostWorkspace({
  comparison,
  interval,
}: {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
}) {
  const providerResults = new Map<ProviderId, ComparisonProviderResult>(
    comparison?.providers.map((provider) => [provider.providerId, provider]) ?? [],
  );
  const summaries = providerCostSummaries(comparison, interval);

  return (
    <section className="provider-cost-workspace" aria-label="Provider cost comparison">
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

      <div className="analysis-grid analysis-grid-compact">
        <ProviderRanking summaries={summaries} interval={interval} />
        <IntervalOutlook comparison={comparison} />
        <CategoryHeatmap summaries={summaries} />
      </div>
    </section>
  );
}

function ArchitectureWorkspace({
  comparison,
  interval,
  form,
}: {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
  form: WorkloadFormState;
}) {
  const review = buildFinOpsReview(comparison, interval, form);
  const summaries = providerCostSummaries(comparison, interval);

  return (
    <section className="architecture-workspace" aria-label="Architecture and governance review">
      <SolutionArchitecturePanel review={review.solutionArchitecture} />
      <FinOpsReviewPanel review={review} />
      <CategoryHeatmap summaries={summaries} />
    </section>
  );
}

function shareTokenFromLocation(): string | undefined {
  const match = window.location.pathname.match(/^\/share\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function ProviderPanel({
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
          {provider ? (
            formatCurrency(costForInterval(provider, interval))
          ) : hasComparison ? (
            'Unavailable'
          ) : (
            <ProviderPendingValue providerId={providerId} />
          )}
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
          {hasComparison ? (
            'Pricing unavailable'
          ) : (
            <ProviderPendingValue providerId={providerId} label="Ready to estimate" />
          )}
        </div>
      )}
    </article>
  );
}

export function CostDashboard({
  comparison,
  interval,
  form,
}: {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
  form: WorkloadFormState;
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
  const finOpsReview = buildFinOpsReview(comparison, interval, form);

  return (
    <section className="cost-dashboard" aria-label="Cost dashboard">
      <ExecutiveDecisionPanel decision={finOpsReview.executiveDecision} />

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

      <SolutionArchitecturePanel review={finOpsReview.solutionArchitecture} />

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

function ExecutiveDecisionPanel({ decision }: { decision: ExecutiveDecision }) {
  return (
    <section className="executive-decision" aria-label="Executive decision memo">
      <div className="executive-copy">
        <span>Executive Memo</span>
        <h3>{decision.headline}</h3>
        <p>{decision.subhead}</p>
      </div>

      <div className="executive-scoreboard">
        <div className={`confidence-pill confidence-${decision.confidence.toLowerCase()}`}>
          <span>Confidence</span>
          <strong>{decision.confidence}</strong>
          <small>{decision.confidenceDetail}</small>
        </div>
        <InsightCard
          label="Annual exposure"
          value={
            decision.annualExposure !== undefined
              ? formatCurrency(decision.annualExposure)
              : 'Pending'
          }
          detail="Lowest on-demand baseline"
        />
        <InsightCard
          label="Avoidable annual spread"
          value={
            decision.avoidableAnnualSpend !== undefined
              ? formatCurrency(decision.avoidableAnnualSpend)
              : 'Pending'
          }
          detail="Before commitments and discounts"
        />
      </div>

      <div className="stakeholder-lens-grid">
        {decision.lenses.map((lens) => (
          <div
            className={`stakeholder-lens stakeholder-${roleClassName(lens.role)}`}
            key={lens.role}
          >
            <span>{lens.role}</span>
            <strong>{lens.value}</strong>
            <small>{lens.label}</small>
            <p>{lens.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SolutionArchitecturePanel({ review }: { review: SolutionArchitectureReview }) {
  return (
    <section className="solution-architecture" aria-label="Engineering architecture review">
      <div className="panel-heading">
        <div>
          <span>Engineering Review</span>
          <h3>Architecture Fit Review</h3>
        </div>
        <strong className={`architecture-risk architecture-risk-${review.riskLevel.toLowerCase()}`}>
          {review.riskLevel} risk
        </strong>
      </div>

      <div className="architecture-summary">
        <div>
          <span>{review.posture}</span>
          <strong>{review.baselineValue}</strong>
          <small>{review.baselineLabel}</small>
        </div>
        <p>{review.summary}</p>
      </div>

      <div className="architecture-checkpoint-grid">
        {review.checkpoints.map((checkpoint) => (
          <div
            className={`architecture-checkpoint architecture-checkpoint-${checkpoint.tone}`}
            key={checkpoint.label}
          >
            <span>{checkpoint.label}</span>
            <strong>{checkpoint.value}</strong>
            <p>{checkpoint.detail}</p>
          </div>
        ))}
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
    <section className="finops-review" aria-label="Cost governance review">
      <div className="panel-heading">
        <div>
          <span>Cost Governance</span>
          <h3>Decision Signals</h3>
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

function ProviderLogo({ providerId }: { providerId: ProviderId }) {
  return (
    <div
      className={`provider-logo-lockup provider-logo-lockup-${providerId}`}
      data-provider-logo={providerId}
      aria-hidden="true"
    >
      <img className="provider-logo-image" src={providerLogoSrc(providerId)} alt="" />
    </div>
  );
}

function ProviderMark({ providerId }: { providerId: ProviderId }) {
  return (
    <img
      className={`provider-mark provider-mark-${providerId}`}
      src={providerMarkSrc(providerId)}
      alt=""
      aria-hidden="true"
    />
  );
}

function ProviderPendingValue({
  providerId,
  label = 'Estimating',
  compact = false,
}: {
  providerId: ProviderId;
  label?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={[
        'provider-pending',
        `provider-pending-${providerId}`,
        compact ? 'provider-pending-compact' : undefined,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${providerLabel(providerId)} estimate pending`}
    >
      <span className="provider-pending-icon" aria-hidden="true">
        <img src={providerMarkSrc(providerId)} alt="" />
      </span>
      <span>{label}</span>
      <span className="provider-pending-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
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

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M14 5h5v5M19 5l-9 9M19 14v5H5V5h5" />
    </svg>
  );
}

function defaultCalculatorUrl(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return DEFAULT_CALCULATOR_URLS.aws;
    case 'azure':
      return DEFAULT_CALCULATOR_URLS.azure;
    case 'gcp':
      return DEFAULT_CALCULATOR_URLS.gcp;
  }
}

function regionReferenceUrl(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return DEFAULT_REGION_REFERENCE_URLS.aws;
    case 'azure':
      return DEFAULT_REGION_REFERENCE_URLS.azure;
    case 'gcp':
      return DEFAULT_REGION_REFERENCE_URLS.gcp;
  }
}

function regionReferenceLabel(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'AWS Regions & AZs';
    case 'azure':
      return 'Azure Regions & AZs';
    case 'gcp':
      return 'GCP Regions & Zones';
  }
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M6 6l12 12M18 6 6 18" />
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

function roleClassName(role: ExecutiveLens['role']): string {
  return role.toLowerCase().split(' ').join('-');
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
  form: WorkloadFormState,
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
  const pricedProviderCount = monthlyPriced.length;
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
    executiveDecision: buildExecutiveDecision({
      approximateCount,
      dominantCategory,
      lineItemCount,
      monthlyLowest,
      monthlySpread,
      monthlySpreadPercent,
      pricedProviderCount,
      yearlyLowest,
    }),
    solutionArchitecture: buildSolutionArchitectureReview({
      approximateCount,
      dominantCategory,
      form,
      lineItemCount,
      monthlyLowest,
      monthlySpreadPercent,
      pricedProviderCount,
    }),
    monthlyLowest,
    yearlyLowest,
    monthlySpread,
    monthlySpreadPercent,
    dominantCategory,
    dominantCategoryProvider: dominantCategory ? dominantProvider?.providerId : undefined,
    approximateCount,
    lineItemCount,
    pricedProviderCount,
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

function buildExecutiveDecision({
  approximateCount,
  dominantCategory,
  lineItemCount,
  monthlyLowest,
  monthlySpread,
  monthlySpreadPercent,
  pricedProviderCount,
  yearlyLowest,
}: {
  approximateCount: number;
  dominantCategory?: CategoryCostSummary;
  lineItemCount: number;
  monthlyLowest?: ProviderCostSummary;
  monthlySpread?: number;
  monthlySpreadPercent?: number;
  pricedProviderCount: number;
  yearlyLowest?: ProviderCostSummary;
}): ExecutiveDecision {
  if (lineItemCount === 0 || !monthlyLowest) {
    return {
      headline: 'Run a comparison to create a decision memo',
      subhead:
        'PolyCost will translate requirements into a cloud-neutral cost baseline, provider fit, and stakeholder actions.',
      confidence: 'Pending',
      confidenceDetail: 'No provider estimates yet',
      lenses: [
        {
          role: 'Budget',
          label: 'Budget decision',
          value: 'Pending',
          detail: 'A comparison is required before the estimate can support budget approval.',
        },
        {
          role: 'Delivery',
          label: 'Delivery decision',
          value: 'Pending',
          detail:
            'Capture availability, data, and scaling assumptions before shortlisting a cloud.',
        },
        {
          role: 'Risk',
          label: 'Fit decision',
          value: 'Pending',
          detail: 'Validate workload assumptions before mapping services to provider designs.',
        },
        {
          role: 'Governance',
          label: 'Governance decision',
          value: 'Pending',
          detail: 'Use the first estimate to seed budgets, tags, and scenario tracking.',
        },
        {
          role: 'Provider',
          label: 'Provider decision',
          value: 'Pending',
          detail: 'Validate service equivalence after the workload is normalized.',
        },
      ],
    };
  }

  const confidence = decisionConfidence(pricedProviderCount, approximateCount);
  const annualExposure = yearlyLowest?.total;
  const avoidableAnnualSpend =
    monthlySpread !== undefined ? roundCurrency(monthlySpread * 12) : undefined;
  const provider = providerLabel(monthlyLowest.providerId);
  const driver = dominantCategory ? capitalize(dominantCategory.category) : 'the top category';

  return {
    headline: `${provider} is the current executive cost baseline`,
    subhead: [
      `${provider} leads the on-demand monthly view at ${formatCurrency(monthlyLowest.total ?? 0)}.`,
      avoidableAnnualSpend !== undefined && avoidableAnnualSpend > 0
        ? `The annualized spread to the highest estimate is ${formatCurrency(avoidableAnnualSpend)} before commitments or private pricing.`
        : 'All priced providers are tightly clustered before commitments or private pricing.',
    ].join(' '),
    confidence,
    confidenceDetail: confidenceDetail(confidence, pricedProviderCount, approximateCount),
    annualExposure,
    avoidableAnnualSpend,
    lenses: [
      {
        role: 'Budget',
        label: 'Budget decision',
        value: annualExposure !== undefined ? formatCurrency(annualExposure) : 'Pending',
        detail: 'Use as the directional annual budget baseline before vendor negotiation.',
      },
      {
        role: 'Delivery',
        label: 'Delivery decision',
        value: driver,
        detail: `Prioritize ${driver.toLowerCase()} sizing, resilience, and managed-service tier review.`,
      },
      {
        role: 'Risk',
        label: 'Fit decision',
        value: approximateCount > 0 ? 'Mapping review' : 'Pattern review',
        detail: `Validate ${provider} regional services, HA pattern, quotas, and data/network assumptions before target-cloud selection.`,
      },
      {
        role: 'Governance',
        label: 'Governance decision',
        value:
          monthlySpreadPercent !== undefined
            ? `${formatPercent(monthlySpreadPercent)} spread`
            : 'Spread pending',
        detail: 'Create guardrails for tags, budgets, alerts, and commitment-model scenarios.',
      },
      {
        role: 'Provider',
        label: 'Provider decision',
        value: approximateCount > 0 ? 'Equivalence review' : 'Service fit ready',
        detail:
          approximateCount > 0
            ? 'Validate approximate mappings against AWS, Azure, and GCP managed-service behavior.'
            : 'Validate regional SKU availability, quotas, and network/data-transfer assumptions.',
      },
    ],
  };
}

function buildSolutionArchitectureReview({
  approximateCount,
  dominantCategory,
  form,
  lineItemCount,
  monthlyLowest,
  monthlySpreadPercent,
  pricedProviderCount,
}: {
  approximateCount: number;
  dominantCategory?: CategoryCostSummary;
  form: WorkloadFormState;
  lineItemCount: number;
  monthlyLowest?: ProviderCostSummary;
  monthlySpreadPercent?: number;
  pricedProviderCount: number;
}): SolutionArchitectureReview {
  if (lineItemCount === 0 || !monthlyLowest) {
    return {
      posture: 'Pending',
      riskLevel: 'Pending',
      baselineLabel: 'Provider baseline pending',
      baselineValue: 'Run comparison',
      summary:
        'An engineering review will appear after PolyCost has provider totals and workload assumptions to inspect.',
      checkpoints: [
        {
          label: 'Service mapping',
          value: 'Pending',
          detail: 'Normalize requirements before validating AWS, Azure, and GCP equivalents.',
          tone: 'pending',
        },
        {
          label: 'Resilience',
          value: 'Pending',
          detail: 'Confirm multi-AZ, database HA, recovery objectives, and SLA target.',
          tone: 'pending',
        },
        {
          label: 'Scaling',
          value: 'Pending',
          detail: 'Capture fixed or autoscaling bounds before provider selection.',
          tone: 'pending',
        },
        {
          label: 'Data and network',
          value: 'Pending',
          detail: 'Estimate egress, CDN, load-balancing, and stateful service needs.',
          tone: 'pending',
        },
      ],
    };
  }

  const riskLevel = solutionArchitectureRisk({
    approximateCount,
    form,
    pricedProviderCount,
  });
  const posture = solutionArchitecturePosture(riskLevel);
  const provider = providerLabel(monthlyLowest.providerId);
  const driver = dominantCategory ? capitalize(dominantCategory.category) : 'Core workload';
  const egressGb = parseInputNumber(form.monthlyEgressGb);
  const egressLabel =
    egressGb !== undefined ? `${egressGb}GB monthly egress modeled` : 'Egress not specified';
  const peakUsers = parseInputNumber(form.peakConcurrentUsers);
  const hasResilience = form.multiRegion || form.multiAz;
  const databaseHaReady = !form.databaseEnabled || form.databaseHighAvailability;
  const loadPathReady = form.loadBalancer || (peakUsers !== undefined && peakUsers < 250);
  const edgeReady = form.cdn || egressGb === undefined || egressGb < 500;

  return {
    posture,
    riskLevel,
    baselineLabel: `${provider} cost baseline`,
    baselineValue: driver,
    summary: [
      `${provider} is the current cost baseline, but the engineering gate should validate service equivalence, resilience, scaling, and data movement before cloud commitment.`,
      monthlySpreadPercent !== undefined && monthlySpreadPercent >= 20
        ? `The ${formatPercent(monthlySpreadPercent)} provider spread is material enough to review architecture patterns before procurement.`
        : 'The cost spread is not enough by itself to skip architecture-fit validation.',
    ].join(' '),
    checkpoints: [
      {
        label: 'Service mapping',
        value: approximateCount > 0 ? `${approximateCount} approximate` : 'Exact mappings',
        detail:
          approximateCount > 0
            ? 'Validate managed-service behavior, limits, and operational differences before shortlisting.'
            : 'Exact catalog mappings are present; still confirm regional SKU availability and quotas.',
        tone: approximateCount > 0 ? 'review' : 'good',
      },
      {
        label: 'Resilience',
        value: form.multiRegion ? 'Multi-region' : form.multiAz ? 'Multi-AZ' : 'Single-zone risk',
        detail: databaseHaReady
          ? `SLA target ${form.slaTarget || 'not stated'}; confirm RTO/RPO and failover design.`
          : 'Database HA is disabled; validate recovery objectives before production approval.',
        tone: hasResilience && databaseHaReady ? 'good' : 'risk',
      },
      {
        label: 'Scaling',
        value:
          form.scalingType === 'autoscaling'
            ? `${form.autoscaleMin || 'min'}-${form.autoscaleMax || 'max'} autoscale`
            : `${form.instanceCount || 'Fixed'} fixed nodes`,
        detail:
          form.scalingType === 'autoscaling'
            ? 'Review warm-up time, scaling policy, and provider-specific quota ceilings.'
            : 'Fixed capacity needs load testing against peak concurrency before target-cloud selection.',
        tone: form.scalingType === 'autoscaling' ? 'good' : 'review',
      },
      {
        label: 'Data and network',
        value: form.cdn && form.loadBalancer ? 'Edge ready' : 'Review path',
        detail:
          loadPathReady && edgeReady
            ? `${egressLabel}; confirm CDN cache ratio and transfer paths.`
            : 'Validate load balancing, CDN, private connectivity, and egress assumptions for production traffic.',
        tone: loadPathReady && edgeReady ? 'good' : 'review',
      },
    ],
  };
}

function solutionArchitectureRisk({
  approximateCount,
  form,
  pricedProviderCount,
}: {
  approximateCount: number;
  form: WorkloadFormState;
  pricedProviderCount: number;
}): SolutionArchitectureReview['riskLevel'] {
  const egressGb = parseInputNumber(form.monthlyEgressGb);
  const peakUsers = parseInputNumber(form.peakConcurrentUsers);
  const resilienceGap = !form.multiAz && !form.multiRegion;
  const databaseGap = form.databaseEnabled && !form.databaseHighAvailability;
  const loadPathGap = Boolean(peakUsers && peakUsers >= 500 && !form.loadBalancer);

  if (pricedProviderCount <= 1 || databaseGap || loadPathGap) {
    return 'High';
  }

  if (
    pricedProviderCount < 3 ||
    approximateCount > 0 ||
    resilienceGap ||
    form.scalingType === 'fixed' ||
    Boolean(egressGb && egressGb >= 500 && !form.cdn)
  ) {
    return 'Medium';
  }

  return 'Low';
}

function solutionArchitecturePosture(
  riskLevel: SolutionArchitectureReview['riskLevel'],
): SolutionArchitectureReview['posture'] {
  if (riskLevel === 'Low') {
    return 'Ready for shortlist';
  }

  if (riskLevel === 'Medium') {
    return 'Architecture review';
  }

  if (riskLevel === 'High') {
    return 'Assumptions needed';
  }

  return 'Pending';
}

function decisionConfidence(
  pricedProviderCount: number,
  approximateCount: number,
): ExecutiveDecision['confidence'] {
  if (pricedProviderCount === 0) {
    return 'Pending';
  }

  if (pricedProviderCount === 3 && approximateCount === 0) {
    return 'High';
  }

  if (pricedProviderCount >= 2) {
    return 'Medium';
  }

  return 'Low';
}

function confidenceDetail(
  confidence: ExecutiveDecision['confidence'],
  pricedProviderCount: number,
  approximateCount: number,
): string {
  if (confidence === 'Pending') {
    return 'No provider estimates yet';
  }

  if (confidence === 'High') {
    return 'Three providers priced with exact mappings';
  }

  if (confidence === 'Medium') {
    return `${pricedProviderCount}/3 providers priced; ${approximateCount} approximate mappings`;
  }

  return `${pricedProviderCount}/3 providers priced; validate before sharing`;
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

function financialForecastRows(monthlyTotal?: number): Array<{
  label: string;
  total?: number;
  percent: number;
}> {
  const rows = [
    { label: 'Month', total: monthlyTotal },
    {
      label: 'Quarter',
      total: monthlyTotal !== undefined ? roundCurrency(monthlyTotal * 3) : undefined,
    },
    {
      label: 'Year',
      total: monthlyTotal !== undefined ? roundCurrency(monthlyTotal * 12) : undefined,
    },
    {
      label: '3-year',
      total: monthlyTotal !== undefined ? roundCurrency(monthlyTotal * 36) : undefined,
    },
  ];
  const maxTotal = Math.max(...rows.map((row) => row.total ?? 0), 0);

  return rows.map((row) => ({
    ...row,
    percent:
      row.total !== undefined && maxTotal > 0 ? Math.max(8, (row.total / maxTotal) * 100) : 0,
  }));
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

function compareButtonLabel(inputMode: InputMode): string {
  return inputMode === 'describe' ? 'Parse & compare' : 'Compare';
}

function compareLoadingLabel(inputMode: InputMode): string {
  return inputMode === 'describe' ? 'Parsing & comparing...' : 'Comparing...';
}

function reportFormatLabel(format: ReportFormat): string {
  return format === 'xlsx' ? 'Excel' : format.toUpperCase();
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function scrollToElement(id: string) {
  const element = document.getElementById(id);

  if (!element || typeof element.scrollIntoView !== 'function') {
    return;
  }

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function parseInputNumber(value: string): number | undefined {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function formatUnitCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value > 0 && value < 1 ? 4 : 2,
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
