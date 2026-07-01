import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import { formatApiError, PolyCostClient, PolyCostApiError, polyCostClient } from './api-client';
import { POLYCOST_TAGLINE } from './brand';
import { Button } from './components/Button';
import { FinOpsFeatureLayer, SharedReportPlaceholder } from './components/FinOpsFeatureLayer';
import { PersonaComparisonWorkspace } from './components/PersonaComparisonWorkspace';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { TopLoadingBar } from './components/TopLoadingBar';
import { hourlyFromMonthly, intervalMultiplierFromMonthly } from './cost-time';
import {
  COMPARISON_REGION_GROUPS,
  comparisonRegionLabel,
  providerRegionSummary,
} from './region-normalization';
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
  DataHealthResponse,
  INTERVALS,
  IntervalKey,
  NormalizedWorkloadSpec,
  PROVIDER_ORDER,
  PricingModelKey,
  ProviderId,
  RegionCatalogResponse,
  ReportFormat,
} from './types';
import {
  ARCHITECTURE_TEMPLATES,
  ArchitectureTemplate,
  buildNwsFromForm,
  BulkServiceRow,
  defaultWorkloadForm,
  formFromNws,
  sampleNaturalLanguageInput,
  serviceRequirementsFromForm,
  validateWorkloadForm,
  WorkloadFormIssue,
  WorkloadFormState,
} from './workload';

type InputMode = 'describe' | 'form';
type BusyAction = 'parse' | 'compare' | 'refresh' | 'export' | null;
type ServiceCategory = ComparisonProviderResult['lineItems'][number]['category'];
type ComparisonLineItem = ComparisonProviderResult['lineItems'][number];
type CostComponent = NonNullable<ComparisonLineItem['costComponent']>;
type FormSectionTone = 'profile' | 'compute' | 'services' | 'portfolio' | 'data' | 'network';
type ToggleIconKind = 'storage' | 'database' | 'cdn' | 'loadBalancer' | 'multiAz' | 'multiRegion';
type CostMatrixCategoryFilter = ServiceCategory | 'all';
type CostMatrixProviderFilter = ProviderId | 'all';
type CostMatrixPricingModelFilter = PricingModelKey | 'all';
type CostMatrixSortKey = 'service' | `${ProviderId}:${PricingModelKey}`;

const INPUT_MODE_OPTIONS: Array<{
  key: InputMode;
  label: string;
  summaryLabel: string;
  description: string;
}> = [
  {
    key: 'form',
    label: 'Guided form',
    summaryLabel: 'Manual entry',
    description: 'Structured sizing fields',
  },
  {
    key: 'describe',
    label: 'Paste / parse',
    summaryLabel: 'Parsed from text',
    description: 'Natural language or pasted bill text',
  },
];

const PRICING_MODEL_STORAGE_KEY = 'polycost-pricing-model';
const REQUIREMENT_SESSION_STORAGE_KEY = 'polycost-current-requirements-v1';
const COMPARISON_HISTORY_STORAGE_KEY = 'polycost-comparison-history-v1';
const MAX_COMPARISON_HISTORY_ENTRIES = 8;
const REQUIREMENTS_FILE_MAX_BYTES = 128 * 1024;
const REQUIREMENTS_FILE_ACCEPT =
  '.txt,.md,.markdown,.json,.yaml,.yml,text/plain,text/markdown,application/json,application/yaml,application/x-yaml,text/yaml';
const REQUIREMENTS_FILE_EXTENSIONS = ['.txt', '.md', '.markdown', '.json', '.yaml', '.yml'];
const REQUIREMENTS_FILE_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'application/yaml',
  'application/x-yaml',
  'text/yaml',
]);
const PRICING_MODEL_OPTIONS: Array<{
  key: PricingModelKey;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: 'on-demand',
    label: 'On-demand',
    shortLabel: 'On-demand',
    description: 'Baseline cached pay-as-you-go pricing.',
  },
  {
    key: 'reserved-1yr',
    label: 'Reserved 1yr',
    shortLabel: 'Reserved 1yr',
    description: 'One-year commitment scenario.',
  },
  {
    key: 'reserved-3yr',
    label: 'Reserved 3yr',
    shortLabel: 'Reserved 3yr',
    description: 'Three-year commitment scenario.',
  },
  {
    key: 'savings-plan',
    label: 'Savings/CUD',
    shortLabel: 'Savings/CUD',
    description: 'Savings Plans, Azure reservations, or GCP committed-use discounts.',
  },
  {
    key: 'spot',
    label: 'Spot estimate',
    shortLabel: 'Spot estimate',
    description: 'Interruptible compute shown as an estimate range.',
  },
];

const INSTANCE_TIER_OPTIONS: Array<[WorkloadFormState['instanceTier'], string]> = [
  ['small', 'Small - dev/test or light production'],
  ['balanced', 'Balanced - general production'],
  ['compute', 'Compute optimized - CPU-heavy'],
  ['memory', 'Memory optimized - data-heavy'],
  ['storage', 'Storage optimized - high I/O'],
  ['accelerated', 'GPU / accelerated - ML and CUDA'],
  ['custom', 'Custom - use vCPU and memory fields'],
];

const PROCESSOR_ARCHITECTURE_OPTIONS: Array<[WorkloadFormState['processorArchitecture'], string]> =
  [
    ['x86_64', 'x86 - Intel / AMD'],
    ['arm64', 'ARM - Graviton / Ampere / Tau'],
    ['gpu', 'GPU - accelerator attached'],
  ];

const COMPUTE_TENANCY_OPTIONS: Array<[WorkloadFormState['computeTenancy'], string]> = [
  ['shared', 'Shared cloud tenancy'],
  ['dedicated-host', 'Dedicated host'],
  ['sole-tenant', 'Sole-tenant node'],
];

const STORAGE_CLASS_OPTIONS: Array<[WorkloadFormState['storageClass'], string]> = [
  ['standard', 'Standard / hot default'],
  ['hot', 'Azure Hot'],
  ['cool', 'Azure Cool'],
  ['cold', 'Azure Cold'],
  ['nearline', 'GCS Nearline'],
  ['coldline', 'GCS Coldline'],
  ['intelligent-tiering', 'S3 Intelligent-Tiering'],
  ['infrequent-access', 'Infrequent access'],
  ['one-zone-infrequent-access', 'S3 One Zone-IA'],
  ['archive-instant', 'Archive instant'],
  ['archive', 'Archive'],
  ['deep-archive', 'Deep archive'],
  ['premium', 'Premium disk / file'],
  ['ultra', 'Ultra disk'],
];

const STORAGE_REPLICATION_OPTIONS: Array<[WorkloadFormState['storageReplication'], string]> = [
  ['none', 'No replication modeled'],
  ['same-region', 'Same-region replication'],
  ['cross-region', 'Cross-region replication'],
];

const SERVICE_CATEGORIES: ServiceCategory[] = [
  'compute',
  'storage',
  'database',
  'network',
  'support',
  'licensing',
  'operations',
];

const SERVICE_FAMILY_ALIASES: Record<string, string> = {
  s3: 'object-storage',
  amazons3: 'object-storage',
  blob: 'object-storage',
  azureblob: 'object-storage',
  gcs: 'object-storage',
  cloudstorage: 'object-storage',
  eks: 'container-orchestration',
  aks: 'container-orchestration',
  gke: 'container-orchestration',
  kubernetes: 'container-orchestration',
  lambda: 'serverless-functions',
  cloudfunctions: 'serverless-functions',
  rds: 'relational-database',
  aurora: 'relational-database',
  cloudsql: 'relational-database',
  dynamodb: 'nosql-database',
  cosmosdb: 'nosql-database',
  redis: 'cache',
  cloudfront: 'cdn-edge',
  cdn: 'cdn-edge',
  dns: 'dns',
};

const ENVIRONMENT_OPTIONS: Array<[WorkloadFormState['environment'], string]> = [
  ['production', 'Production'],
  ['staging', 'Staging'],
  ['development', 'Development'],
  ['test', 'Test'],
];

const OPERATING_SYSTEM_OPTIONS: Array<[WorkloadFormState['operatingSystem'], string]> = [
  ['linux', 'Linux'],
  ['windows', 'Windows'],
  ['byol', 'BYOL'],
];

const SUPPORT_TIER_OPTIONS: Array<[WorkloadFormState['supportTier'], string]> = [
  ['none', 'No support'],
  ['developer', 'Developer'],
  ['business', 'Business'],
  ['enterprise', 'Enterprise'],
];

const USAGE_PATTERN_OPTIONS: Array<[WorkloadFormState['usagePattern'], string]> = [
  ['always_on', 'Always on'],
  ['scheduled', 'Scheduled'],
  ['bursty', 'Bursty'],
];

const FAULT_TOLERANCE_OPTIONS: Array<[WorkloadFormState['faultTolerance'], string]> = [
  ['single-zone', 'Single-zone'],
  ['multi-az', 'Multi-AZ'],
  ['multi-region', 'Multi-region'],
  ['active-active', 'Active-active'],
];

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

const INITIAL_HOME_FORM: WorkloadFormState = {
  ...defaultWorkloadForm,
  workloadName: '',
  dailyActiveUsers: '',
  peakConcurrentUsers: '',
  instanceCount: '1',
  autoscaleMin: '1',
  autoscaleMax: '3',
  storageEnabled: false,
  storageSizeGb: '',
  databaseEnabled: false,
  databaseSizeGb: '',
  monthlyEgressGb: '',
  cdn: false,
  loadBalancer: false,
  selectedServiceCategory: 'compute',
  selectedServiceFamilyId: 'vm-compute',
  instanceTier: 'small',
  availabilityZoneCount: '1',
  selectedServiceFamilyIds: [],
  multiAz: false,
  multiRegion: false,
  slaTarget: '',
};

interface StoredRequirementSession {
  inputMode: InputMode;
  naturalLanguageInput: string;
  form: WorkloadFormState;
  pricingModel: PricingModelKey;
  requirementsAwaitingReview: boolean;
}

interface ComparisonHistoryEntry {
  id: string;
  comparisonId: string;
  createdAt: string;
  form: WorkloadFormState;
  inputMode: InputMode;
  pricingModel: PricingModelKey;
  cheapestProviderId: ProviderId;
  serviceCount: number;
  providerCount: number;
  monthlyLowestUsd: number;
  summary: string;
}

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

interface ProviderMixDatum {
  providerId: ProviderId;
  name: string;
  value: number;
  percent: number;
  color: string;
}

interface ExecutiveAnalyticsModel {
  review: FinOpsReview;
  monthlySummaries: ProviderCostSummary[];
  pricedMonthlySummaries: ProviderCostSummary[];
  totalMonthlyAcrossProviders?: number;
  providerMix: ProviderMixDatum[];
  cheapest?: ProviderCostSummary;
  highest?: ProviderCostSummary;
  annualPotentialSavings?: number;
  monthlyPotentialSavings?: number;
}

interface EngineeringServiceDatum {
  category: ServiceCategory;
  serviceLabel: string;
  value: number;
  percent: number;
  color: string;
}

interface EngineeringProviderServiceModel {
  providerId: ProviderId;
  total?: number;
  lineItemCount: number;
  approximateCount: number;
  services: EngineeringServiceDatum[];
  dominantService?: EngineeringServiceDatum;
}

interface EngineeringAnalyticsModel {
  providers: EngineeringProviderServiceModel[];
  pricedProviders: EngineeringProviderServiceModel[];
  totalLineItems: number;
  approximateCount: number;
  topDriver?: {
    providerId: ProviderId;
    service: EngineeringServiceDatum;
  };
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
  const activeAsyncActionId = useRef(0);
  const initialRequirementSession = useRef(readStoredRequirementSession()).current;
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => storedTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(storedTheme()),
  );
  const [inputMode, setInputMode] = useState<InputMode>(
    () => initialRequirementSession?.inputMode ?? 'form',
  );
  const [naturalLanguageInput, setNaturalLanguageInput] = useState(
    () => initialRequirementSession?.naturalLanguageInput ?? sampleNaturalLanguageInput,
  );
  const [form, setForm] = useState<WorkloadFormState>(
    () => initialRequirementSession?.form ?? INITIAL_HOME_FORM,
  );
  const [submittedForm, setSubmittedForm] = useState<WorkloadFormState>(INITIAL_HOME_FORM);
  const [submittedInputMode, setSubmittedInputMode] = useState<InputMode>('form');
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [comparisonHistory, setComparisonHistory] = useState<ComparisonHistoryEntry[]>(() =>
    readStoredComparisonHistory(),
  );
  const [interval, setInterval] = useState<IntervalKey>('monthly');
  const [pricingModel, setPricingModel] = useState<PricingModelKey>(
    () => initialRequirementSession?.pricingModel ?? readStoredPricingModel(),
  );
  const [requirementsAwaitingReview, setRequirementsAwaitingReview] = useState(
    () => initialRequirementSession?.requirementsAwaitingReview ?? false,
  );
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [exportingFormat, setExportingFormat] = useState<ReportFormat | null>(null);
  const [isEditingRequirements, setIsEditingRequirements] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requirementsFileName, setRequirementsFileName] = useState<string | null>(null);
  const [regionCatalog, setRegionCatalog] = useState<RegionCatalogResponse | null>(null);
  const [regionCatalogError, setRegionCatalogError] = useState<string | null>(null);
  const [dataHealth, setDataHealth] = useState<DataHealthResponse | null>(null);
  const [dataHealthError, setDataHealthError] = useState<string | null>(null);
  const [formValidationIssues, setFormValidationIssues] = useState<WorkloadFormIssue[]>([]);

  useEffect(() => {
    setResolvedTheme(applyTheme(themeChoice));
  }, [themeChoice]);

  useEffect(() => {
    storeRequirementSession({
      inputMode,
      naturalLanguageInput,
      form,
      pricingModel,
      requirementsAwaitingReview,
    });
  }, [form, inputMode, naturalLanguageInput, pricingModel, requirementsAwaitingReview]);

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

  useEffect(() => {
    let isMounted = true;

    void client
      .getDataHealth()
      .then((health) => {
        if (!isMounted) {
          return;
        }

        setDataHealth(health);
        setDataHealthError(null);
      })
      .catch((healthError) => {
        if (!isMounted) {
          return;
        }

        setDataHealth(null);
        setDataHealthError(formatApiError(healthError));
      });

    return () => {
      isMounted = false;
    };
  }, [client]);

  if (shareToken) {
    return <SharedReportPlaceholder client={client} token={shareToken} />;
  }

  async function handleParse() {
    if (!naturalLanguageInput.trim()) {
      setError('Enter workload requirements before parsing.');
      setNotice(null);
      return;
    }

    const actionId = startAsyncAction();
    setError(null);
    setNotice(null);
    setBusyAction('parse');

    try {
      const parsed = await client.parseWorkload(naturalLanguageInput);
      if (!isCurrentAsyncAction(actionId)) {
        return;
      }

      setForm(formFromNws(parsed.draftNws));
      setFormValidationIssues([]);
      setInputMode('form');
      setRequirementsAwaitingReview(true);
      setNotice(
        `${reviewMessage(
          parsed.parserConfidence,
          parsed.fieldsRequiringReview,
        )} Review the interpreted services, edit anything, then compare.`,
      );
    } catch (parseError) {
      if (isCurrentAsyncAction(actionId)) {
        setError(formatApiError(parseError));
      }
    } finally {
      if (isCurrentAsyncAction(actionId)) {
        setBusyAction(null);
      }
    }
  }

  async function handleCompare(event?: FormEvent) {
    event?.preventDefault();

    if (inputMode === 'describe') {
      await handleParse();
      return;
    }

    const validationIssues = inputMode === 'form' ? validateWorkloadForm(form) : [];

    if (validationIssues.length > 0) {
      setFormValidationIssues(validationIssues);
      setError(formValidationSummaryMessage(validationIssues));
      setNotice(null);
      return;
    }

    setFormValidationIssues([]);
    const actionId = startAsyncAction();
    setError(null);
    setNotice(null);
    setBusyAction('compare');

    try {
      const {
        nws,
        parserNotice,
        parsedForm,
        submittedComparisonForm,
        submittedComparisonInputMode,
      } = await prepareNwsForComparison();
      if (!isCurrentAsyncAction(actionId)) {
        return;
      }

      if (parsedForm) {
        setForm(parsedForm);
        setFormValidationIssues([]);
      }

      await client.validateWorkload(nws);
      if (!isCurrentAsyncAction(actionId)) {
        return;
      }

      const result = await client.createComparison(nws);
      if (!isCurrentAsyncAction(actionId)) {
        return;
      }

      setComparison(result);
      setSubmittedForm(submittedComparisonForm);
      setSubmittedInputMode(submittedComparisonInputMode);
      setComparisonHistory((currentHistory) =>
        saveComparisonHistoryEntry(
          currentHistory,
          createComparisonHistoryEntry({
            comparison: result,
            form: submittedComparisonForm,
            inputMode: submittedComparisonInputMode,
            pricingModel,
          }),
        ),
      );
      setIsEditingRequirements(false);
      setRequirementsAwaitingReview(false);
      setNotice(parserNotice ? `${parserNotice} Comparison ready.` : 'Comparison ready.');
    } catch (comparisonError) {
      if (isCurrentAsyncAction(actionId)) {
        setError(formatApiError(comparisonError));
      }
    } finally {
      if (isCurrentAsyncAction(actionId)) {
        setBusyAction(null);
      }
    }
  }

  async function prepareNwsForComparison(): Promise<{
    nws: NormalizedWorkloadSpec;
    parserNotice?: string;
    parsedForm?: WorkloadFormState;
    submittedComparisonForm: WorkloadFormState;
    submittedComparisonInputMode: InputMode;
  }> {
    if (inputMode !== 'describe') {
      return {
        nws: buildNwsFromForm(form, 'structured_form'),
        submittedComparisonForm: form,
        submittedComparisonInputMode: requirementsAwaitingReview ? 'describe' : 'form',
      };
    }

    const parsed = await client.parseWorkload(naturalLanguageInput);
    const parsedForm = formFromNws(parsed.draftNws);

    return {
      nws: {
        ...parsed.draftNws,
        sourceTraceability:
          parsed.draftNws.sourceTraceability ??
          serviceCatalogTraceability(parsedForm.selectedServiceFamilyIds),
      },
      parserNotice: reviewMessage(parsed.parserConfidence, parsed.fieldsRequiringReview),
      parsedForm,
      submittedComparisonForm: parsedForm,
      submittedComparisonInputMode: 'describe',
    };
  }

  async function handleRefreshLive() {
    if (!comparison) {
      return;
    }

    const actionId = startAsyncAction();
    setError(null);
    setNotice(null);
    setBusyAction('refresh');

    try {
      const result = await client.refreshLiveComparison(comparison.comparisonId);
      if (!isCurrentAsyncAction(actionId)) {
        return;
      }

      setComparison(result);
      setNotice('Live refresh snapshot created.');
    } catch (refreshError) {
      if (isCurrentAsyncAction(actionId)) {
        setError(formatApiError(refreshError));
      }
    } finally {
      if (isCurrentAsyncAction(actionId)) {
        setBusyAction(null);
      }
    }
  }

  async function handleExport(format: ReportFormat) {
    if (!comparison) {
      return;
    }

    const actionId = startAsyncAction();
    setError(null);
    setNotice(null);
    setBusyAction('export');
    setExportingFormat(format);

    try {
      const blob = await client.exportComparison(comparison.comparisonId, format, {
        interval,
        pricingModel,
      });
      if (!isCurrentAsyncAction(actionId)) {
        return;
      }

      downloadBlob(blob, `polycost-comparison-${comparison.comparisonId}.${format}`);
      setNotice(`${format.toUpperCase()} report generated and downloaded.`);
    } catch (exportError) {
      if (isCurrentAsyncAction(actionId)) {
        setError(formatApiError(exportError));
      }
    } finally {
      if (isCurrentAsyncAction(actionId)) {
        setBusyAction(null);
        setExportingFormat(null);
      }
    }
  }

  function handleClearRequirements() {
    setNaturalLanguageInput('');
    setRequirementsFileName(null);
    setFormValidationIssues([]);
    setNotice(null);
    setError(null);
  }

  function handleNaturalLanguageChange(value: string) {
    setNaturalLanguageInput(value);
    setRequirementsFileName(null);
  }

  function handleUseSampleRequirements() {
    setInputMode('describe');
    setNaturalLanguageInput(sampleNaturalLanguageInput);
    setRequirementsFileName(null);
    setNotice(null);
    setError(null);
  }

  async function handleRequirementsFileLoad(file: File | null) {
    if (!file) {
      return;
    }

    if (file.size > REQUIREMENTS_FILE_MAX_BYTES) {
      setError('Upload a requirements file under 128KB.');
      setNotice(null);
      return;
    }

    if (!isSupportedRequirementsFile(file)) {
      setError(
        'Upload a plain text, Markdown, JSON, or YAML requirements file. CSV, Excel, and DrawIO imports are Phase 2 hook points.',
      );
      setNotice(null);
      return;
    }

    try {
      const fileText = await file.text();
      if (!fileText.trim()) {
        setError('The selected requirements file is empty.');
        setNotice(null);
        return;
      }

      setNaturalLanguageInput(fileText);
      setRequirementsFileName(file.name || 'requirements file');
      setInputMode('describe');
      setRequirementsAwaitingReview(false);
      setFormValidationIssues([]);
      setError(null);
      setNotice(
        `Loaded ${file.name || 'requirements file'}. Review the text, then parse requirements.`,
      );
    } catch {
      setError('Could not read the selected requirements file.');
      setNotice(null);
    }
  }

  function handleClearComparison() {
    cancelAsyncActions();
    setForm(INITIAL_HOME_FORM);
    setRequirementsAwaitingReview(false);
    clearRequirementSession();
    setSubmittedForm(INITIAL_HOME_FORM);
    setSubmittedInputMode('form');
    setInputMode('form');
    setNaturalLanguageInput(sampleNaturalLanguageInput);
    setRequirementsFileName(null);
    setComparison(null);
    setIsEditingRequirements(false);
    setInterval('monthly');
    handlePricingModelChange('on-demand');
    setBusyAction(null);
    setExportingFormat(null);
    setNotice(null);
    setError(null);
    setFormValidationIssues([]);
  }

  function handleRestoreComparisonHistory(entry: ComparisonHistoryEntry) {
    cancelAsyncActions();
    setForm(entry.form);
    setSubmittedForm(entry.form);
    setSubmittedInputMode(entry.inputMode);
    setInputMode('form');
    setNaturalLanguageInput(sampleNaturalLanguageInput);
    setRequirementsFileName(null);
    setPricingModel(entry.pricingModel);
    storePricingModel(entry.pricingModel);
    setComparison(null);
    setIsEditingRequirements(false);
    setRequirementsAwaitingReview(false);
    setInterval('monthly');
    setBusyAction(null);
    setExportingFormat(null);
    setFormValidationIssues([]);
    setError(null);
    setNotice(`Loaded ${entry.summary}. Compare again to refresh pricing.`);
  }

  function handleClearComparisonHistory() {
    setComparisonHistory([]);
    clearComparisonHistory();
    setError(null);
    setNotice('Recent comparison history cleared.');
  }

  function handleFormChange(nextForm: WorkloadFormState) {
    setForm(nextForm);
    setFormValidationIssues((currentIssues) =>
      currentIssues.length > 0 ? validateWorkloadForm(nextForm) : currentIssues,
    );
  }

  function handleEditComparison() {
    setForm(submittedForm);
    setFormValidationIssues([]);
    setInputMode(submittedInputMode);
    setRequirementsAwaitingReview(false);
    setIsEditingRequirements(true);
  }

  function handlePricingModelChange(nextPricingModel: PricingModelKey) {
    setPricingModel(nextPricingModel);
    storePricingModel(nextPricingModel);
  }

  function handleSignIn() {
    setError(null);
    setNotice('Sign in is not required for the local open-source demo.');
  }

  function startAsyncAction(): number {
    activeAsyncActionId.current += 1;
    return activeAsyncActionId.current;
  }

  function cancelAsyncActions() {
    activeAsyncActionId.current += 1;
  }

  function isCurrentAsyncAction(actionId: number): boolean {
    return activeAsyncActionId.current === actionId;
  }

  const hasComparison = Boolean(comparison);

  return (
    <main
      className={hasComparison ? 'app-shell' : 'app-shell app-shell-minimal'}
      aria-labelledby="page-title"
    >
      <TopLoadingBar isLoading={isPageLoading} />
      {hasComparison ? <ScrollProgressBar /> : null}
      <AppHeader
        resolvedTheme={resolvedTheme}
        themeChoice={themeChoice}
        onSignIn={handleSignIn}
        onThemeChange={setThemeChoice}
      />
      {comparison ? (
        <ProgressiveComparisonPage
          client={client}
          comparison={comparison}
          form={form}
          submittedForm={submittedForm}
          submittedInputMode={submittedInputMode}
          inputMode={inputMode}
          pricingModel={pricingModel}
          interval={interval}
          isEditingRequirements={isEditingRequirements}
          requirementsAwaitingReview={requirementsAwaitingReview}
          busyAction={busyAction}
          exportingFormat={exportingFormat}
          notice={notice}
          error={error}
          naturalLanguageInput={naturalLanguageInput}
          regionCatalog={regionCatalog}
          regionCatalogError={regionCatalogError}
          validationIssues={formValidationIssues}
          dataHealth={dataHealth}
          dataHealthError={dataHealthError}
          onClear={handleClearComparison}
          onEdit={handleEditComparison}
          onInputModeChange={setInputMode}
          onPricingModelChange={handlePricingModelChange}
          onNaturalLanguageChange={handleNaturalLanguageChange}
          onFormChange={handleFormChange}
          onSubmit={handleCompare}
          onParse={handleParse}
          onClearRequirements={handleClearRequirements}
          onUseSample={handleUseSampleRequirements}
          onRequirementsFileLoad={handleRequirementsFileLoad}
          requirementsFileName={requirementsFileName}
          onIntervalChange={setInterval}
          onRefreshLive={handleRefreshLive}
          onExport={(format) => void handleExport(format)}
        />
      ) : (
        <InitialHomePage
          form={form}
          inputMode={inputMode}
          pricingModel={pricingModel}
          requirementsAwaitingReview={requirementsAwaitingReview}
          naturalLanguageInput={naturalLanguageInput}
          regionCatalog={regionCatalog}
          regionCatalogError={regionCatalogError}
          notice={notice}
          error={error}
          validationIssues={formValidationIssues}
          dataHealth={dataHealth}
          dataHealthError={dataHealthError}
          comparisonHistory={comparisonHistory}
          isComparing={busyAction === 'compare' || busyAction === 'parse'}
          onInputModeChange={setInputMode}
          onPricingModelChange={handlePricingModelChange}
          onNaturalLanguageChange={handleNaturalLanguageChange}
          onChange={handleFormChange}
          onClearRequirements={handleClearRequirements}
          onSubmit={handleCompare}
          onRestoreHistory={handleRestoreComparisonHistory}
          onClearHistory={handleClearComparisonHistory}
          onUseSample={handleUseSampleRequirements}
          onRequirementsFileLoad={handleRequirementsFileLoad}
          requirementsFileName={requirementsFileName}
        />
      )}
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

function AppHeader({
  resolvedTheme,
  themeChoice,
  onSignIn,
  onThemeChange,
}: {
  resolvedTheme: ResolvedTheme;
  themeChoice: ThemeChoice;
  onSignIn: () => void;
  onThemeChange: (choice: ThemeChoice) => void;
}) {
  return (
    <header className="app-header" aria-label="PolyCost workspace header">
      <a className="brand-lockup app-brand-link" href="#requirements" aria-label="PolyCost home">
        <span className="brand-logo-shell">
          <img className="brand-logo-image" src={logoSrcForTheme(resolvedTheme)} alt="" />
        </span>
        <span className="brand-copy">
          <span className="brand-tagline">Cloud-neutral cost comparison</span>
          <span className="brand-subhead">AWS, Azure, and GCP decision support</span>
        </span>
      </a>

      <div className="app-header-actions">
        <ThemeSwitcher themeChoice={themeChoice} onThemeChange={onThemeChange} />
        <Button type="button" variant="secondary" className="app-signin-button" onClick={onSignIn}>
          <SignInIcon />
          Sign in
        </Button>
      </div>
    </header>
  );
}

function InitialHomePage({
  form,
  inputMode,
  pricingModel,
  naturalLanguageInput,
  regionCatalog,
  regionCatalogError,
  notice,
  error,
  validationIssues,
  dataHealth,
  dataHealthError,
  comparisonHistory,
  isComparing,
  requirementsAwaitingReview,
  onInputModeChange,
  onPricingModelChange,
  onNaturalLanguageChange,
  onChange,
  onClearRequirements,
  onSubmit,
  onRestoreHistory,
  onClearHistory,
  onUseSample,
  onRequirementsFileLoad,
  requirementsFileName,
}: {
  form: WorkloadFormState;
  inputMode: InputMode;
  pricingModel: PricingModelKey;
  naturalLanguageInput: string;
  regionCatalog: RegionCatalogResponse | null;
  regionCatalogError: string | null;
  notice: string | null;
  error: string | null;
  validationIssues: WorkloadFormIssue[];
  dataHealth: DataHealthResponse | null;
  dataHealthError: string | null;
  comparisonHistory: ComparisonHistoryEntry[];
  isComparing: boolean;
  requirementsAwaitingReview: boolean;
  onInputModeChange: (mode: InputMode) => void;
  onPricingModelChange: (model: PricingModelKey) => void;
  onNaturalLanguageChange: (value: string) => void;
  onChange: (form: WorkloadFormState) => void;
  onClearRequirements: () => void;
  onSubmit: (event: FormEvent) => void;
  onRestoreHistory: (entry: ComparisonHistoryEntry) => void;
  onClearHistory: () => void;
  onUseSample: () => void;
  onRequirementsFileLoad: (file: File | null) => void | Promise<void>;
  requirementsFileName: string | null;
}) {
  function update<K extends keyof WorkloadFormState>(key: K, value: WorkloadFormState[K]) {
    onChange({
      ...form,
      [key]: value,
    });
  }

  function updateServiceCategory(value: string) {
    onChange({
      ...form,
      selectedServiceCategory: value,
      selectedServiceFamilyId:
        firstServiceFamilyIdForCategory(value) ?? form.selectedServiceFamilyId,
    });
  }

  function updateStorageSize(value: string) {
    onChange({
      ...form,
      storageEnabled: value.trim().length > 0,
      storageSizeGb: value,
    });
  }

  function applyTemplate(template: ArchitectureTemplate) {
    onChange(template.form);
  }

  const fieldErrors = validationIssueMap(validationIssues);

  return (
    <section className="initial-home" id="requirements" aria-labelledby="page-title">
      <div className="initial-home-brand">
        <h1 id="page-title">{POLYCOST_TAGLINE}</h1>
        <p>Enter the core workload shape, then compare AWS, Azure, and GCP side by side.</p>
      </div>

      <div className="initial-home-form" aria-label="Compare cloud costs">
        <DataHealthBanner health={dataHealth} error={dataHealthError} />
        <InputModeTabs inputMode={inputMode} onInputModeChange={onInputModeChange} />
        <PricingModelPreferenceControl
          pricingModel={pricingModel}
          onPricingModelChange={onPricingModelChange}
        />
        <ComparisonHistoryPanel
          entries={comparisonHistory}
          onRestore={onRestoreHistory}
          onClear={onClearHistory}
        />

        {inputMode === 'form' ? (
          <form className="initial-guided-form" onSubmit={onSubmit}>
            <ArchitectureTemplatePicker onApply={applyTemplate} compact />
            <FormValidationSummary issues={validationIssues} />
            {requirementsAwaitingReview ? <RequirementReviewCards form={form} /> : null}
            <div className="initial-home-actions initial-home-actions-primary">
              <span className="initial-home-action-hint">
                {requirementsAwaitingReview
                  ? 'Review the interpreted workload below, edit anything, then confirm.'
                  : 'Adjust the workload below, or run the default estimate now.'}
              </span>
              <Button
                type="submit"
                variant="primary"
                loading={isComparing}
                loadingLabel="Comparing costs..."
                disabled={isComparing}
              >
                <CompareIcon />
                {requirementsAwaitingReview ? 'Confirm & compare' : 'Compare costs'}
              </Button>
            </div>
            <div className="initial-home-fields">
              {requirementsAwaitingReview ? (
                <TextField
                  label="Name"
                  value={form.workloadName}
                  onChange={(value) => update('workloadName', value)}
                />
              ) : null}
              <SelectField
                label="Service category"
                value={form.selectedServiceCategory}
                options={serviceCategoryOptions()}
                onChange={updateServiceCategory}
              />
              <SelectField
                label="Specific service"
                value={form.selectedServiceFamilyId}
                options={serviceFamilyOptions(form.selectedServiceCategory)}
                onChange={(value) => update('selectedServiceFamilyId', value)}
              />
              <SelectField
                label="Workload type"
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
              <SelectField
                label="Instance tier"
                value={form.instanceTier}
                options={INSTANCE_TIER_OPTIONS}
                onChange={(value) => update('instanceTier', value)}
              />
              <SelectField
                label="Architecture"
                value={form.processorArchitecture}
                options={PROCESSOR_ARCHITECTURE_OPTIONS}
                onChange={(value) => update('processorArchitecture', value)}
              />
              <SelectField
                label="Tenancy"
                value={form.computeTenancy}
                options={COMPUTE_TENANCY_OPTIONS}
                onChange={(value) => update('computeTenancy', value)}
              />
              <TextField
                label="vCPU"
                value={form.vcpu}
                inputMode="decimal"
                suffix="cores"
                error={fieldErrors.vcpu}
                onChange={(value) => update('vcpu', value)}
              />
              <TextField
                label="Memory GB"
                value={form.memoryGb}
                inputMode="decimal"
                suffix="GB"
                error={fieldErrors.memoryGb}
                onChange={(value) => update('memoryGb', value)}
              />
              <RegionSelectField
                value={form.regionPreference}
                regionCatalog={regionCatalog}
                regionCatalogError={regionCatalogError}
                compact
                onChange={(value) => update('regionPreference', value)}
              />
              <SelectField
                label="Environment"
                value={form.environment}
                options={ENVIRONMENT_OPTIONS}
                onChange={(value) => update('environment', value)}
              />
              <SelectField
                label="OS / license"
                value={form.operatingSystem}
                options={OPERATING_SYSTEM_OPTIONS}
                onChange={(value) => update('operatingSystem', value)}
              />
              <SelectField
                label="Support"
                value={form.supportTier}
                options={SUPPORT_TIER_OPTIONS}
                onChange={(value) => update('supportTier', value)}
              />
              <SelectField
                label="Usage"
                value={form.usagePattern}
                options={USAGE_PATTERN_OPTIONS}
                onChange={(value) => update('usagePattern', value)}
              />
              <TextField
                label="Availability zones"
                value={form.availabilityZoneCount}
                inputMode="numeric"
                suffix="AZs"
                onChange={(value) => update('availabilityZoneCount', value)}
              />
              <RangeField
                label="Commitment fit"
                value={form.commitmentPreferencePercent}
                min={0}
                max={100}
                suffix="%"
                error={fieldErrors.commitmentPreferencePercent}
                onChange={(value) => update('commitmentPreferencePercent', value)}
              />
            </div>

            <details className="initial-optional-estimate">
              <summary>
                <span>Add storage, egress & governance assumptions</span>
                <span className="initial-optional-chevron" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="initial-optional-fields">
                <TextField
                  label="Storage GB"
                  value={form.storageSizeGb}
                  inputMode="decimal"
                  suffix="GB"
                  error={fieldErrors.storageSizeGb}
                  onChange={updateStorageSize}
                />
                <TextField
                  label="Egress GB/mo"
                  value={form.monthlyEgressGb}
                  inputMode="decimal"
                  suffix="GB"
                  error={fieldErrors.monthlyEgressGb}
                  onChange={(value) => update('monthlyEgressGb', value)}
                />
                <SelectField
                  label="Fault tolerance"
                  value={form.faultTolerance}
                  options={FAULT_TOLERANCE_OPTIONS}
                  onChange={(value) =>
                    onChange({
                      ...form,
                      faultTolerance: value,
                      multiAz: value !== 'single-zone',
                      multiRegion: value === 'multi-region' || value === 'active-active',
                    })
                  }
                />
                <TextField
                  label="Data residency"
                  value={form.dataResidency}
                  onChange={(value) => update('dataResidency', value)}
                />
                <TextField
                  label="Metric samples"
                  value={form.observabilityMetricsMillion}
                  inputMode="decimal"
                  suffix="M/mo"
                  error={fieldErrors.observabilityMetricsMillion}
                  onChange={(value) => update('observabilityMetricsMillion', value)}
                />
                <TextField
                  label="Log ingest"
                  value={form.observabilityLogsIngestGb}
                  inputMode="decimal"
                  suffix="GB/mo"
                  error={fieldErrors.observabilityLogsIngestGb}
                  onChange={(value) => update('observabilityLogsIngestGb', value)}
                />
                <TextField
                  label="Trace spans"
                  value={form.observabilityTracesMillion}
                  inputMode="decimal"
                  suffix="M/mo"
                  error={fieldErrors.observabilityTracesMillion}
                  onChange={(value) => update('observabilityTracesMillion', value)}
                />
                <TextField
                  label="Warehouse query"
                  value={form.analyticsWarehouseQueryTb}
                  inputMode="decimal"
                  suffix="TB/mo"
                  error={fieldErrors.analyticsWarehouseQueryTb}
                  onChange={(value) => update('analyticsWarehouseQueryTb', value)}
                />
                <TextField
                  label="Lake storage"
                  value={form.analyticsDataLakeStorageGb}
                  inputMode="decimal"
                  suffix="GB"
                  error={fieldErrors.analyticsDataLakeStorageGb}
                  onChange={(value) => update('analyticsDataLakeStorageGb', value)}
                />
                <TextField
                  label="Streaming ingest"
                  value={form.analyticsStreamingIngestGb}
                  inputMode="decimal"
                  suffix="GB/mo"
                  error={fieldErrors.analyticsStreamingIngestGb}
                  onChange={(value) => update('analyticsStreamingIngestGb', value)}
                />
                <TextField
                  label="BI users"
                  value={form.analyticsBiUsers}
                  inputMode="numeric"
                  suffix="users"
                  error={fieldErrors.analyticsBiUsers}
                  onChange={(value) => update('analyticsBiUsers', value)}
                />
                <TextField
                  label="Secrets"
                  value={form.secretsCount}
                  inputMode="numeric"
                  suffix="items"
                  error={fieldErrors.secretsCount}
                  onChange={(value) => update('secretsCount', value)}
                />
                <TextField
                  label="Security resources"
                  value={form.securityProtectedResources}
                  inputMode="numeric"
                  suffix="items"
                  error={fieldErrors.securityProtectedResources}
                  onChange={(value) => update('securityProtectedResources', value)}
                />
                <TextField
                  label="Security findings"
                  value={form.securityFindingsThousand}
                  inputMode="decimal"
                  suffix="K/mo"
                  error={fieldErrors.securityFindingsThousand}
                  onChange={(value) => update('securityFindingsThousand', value)}
                />
                <TextField
                  label="WAF ACLs"
                  value={form.wafWebAclCount}
                  inputMode="numeric"
                  suffix="ACLs"
                  error={fieldErrors.wafWebAclCount}
                  onChange={(value) => update('wafWebAclCount', value)}
                />
                <TextField
                  label="WAF rules"
                  value={form.wafRuleCount}
                  inputMode="numeric"
                  suffix="rules"
                  error={fieldErrors.wafRuleCount}
                  onChange={(value) => update('wafRuleCount', value)}
                />
                <TextField
                  label="WAF requests"
                  value={form.wafRequestsMillion}
                  inputMode="decimal"
                  suffix="M/mo"
                  error={fieldErrors.wafRequestsMillion}
                  onChange={(value) => update('wafRequestsMillion', value)}
                />
                <TextField
                  label="DDoS resources"
                  value={form.ddosProtectedResources}
                  inputMode="numeric"
                  suffix="items"
                  error={fieldErrors.ddosProtectedResources}
                  onChange={(value) => update('ddosProtectedResources', value)}
                />
                <TextField
                  label="Function invokes"
                  value={form.functionInvocationsMillion}
                  inputMode="decimal"
                  suffix="M/mo"
                  error={fieldErrors.functionInvocationsMillion}
                  onChange={(value) => update('functionInvocationsMillion', value)}
                />
                <TextField
                  label="K8s clusters"
                  value={form.kubernetesClusterCount}
                  inputMode="numeric"
                  suffix="clusters"
                  error={fieldErrors.kubernetesClusterCount}
                  onChange={(value) => update('kubernetesClusterCount', value)}
                />
                <TextField
                  label="Registry storage"
                  value={form.registryStorageGb}
                  inputMode="decimal"
                  suffix="GB"
                  error={fieldErrors.registryStorageGb}
                  onChange={(value) => update('registryStorageGb', value)}
                />
              </div>
            </details>
          </form>
        ) : (
          <form className="initial-paste-form" onSubmit={onSubmit}>
            <DescribePanel
              value={naturalLanguageInput}
              isParsing={isComparing}
              onChange={onNaturalLanguageChange}
              onClear={onClearRequirements}
              onUseSample={onUseSample}
              onFileLoad={onRequirementsFileLoad}
              fileName={requirementsFileName}
            />
            <div className="initial-home-actions">
              <Button
                type="submit"
                variant="primary"
                loading={isComparing}
                loadingLabel={compareLoadingLabel(inputMode)}
                disabled={isComparing}
              >
                <ParseIcon />
                {compareButtonLabel(inputMode)}
              </Button>
            </div>
          </form>
        )}

        <StatusMessage notice={initialStatusNotice(notice)} error={error} />
      </div>
    </section>
  );
}

function ProgressiveComparisonPage({
  client,
  comparison,
  form,
  submittedForm,
  submittedInputMode,
  inputMode,
  pricingModel,
  interval,
  isEditingRequirements,
  requirementsAwaitingReview,
  busyAction,
  exportingFormat,
  notice,
  error,
  naturalLanguageInput,
  regionCatalog,
  regionCatalogError,
  validationIssues,
  dataHealth,
  dataHealthError,
  onClear,
  onEdit,
  onInputModeChange,
  onPricingModelChange,
  onNaturalLanguageChange,
  onFormChange,
  onSubmit,
  onParse,
  onClearRequirements,
  onUseSample,
  onRequirementsFileLoad,
  requirementsFileName,
  onIntervalChange,
  onRefreshLive,
  onExport,
}: {
  client: PolyCostClient;
  comparison: ComparisonResult;
  form: WorkloadFormState;
  submittedForm: WorkloadFormState;
  submittedInputMode: InputMode;
  inputMode: InputMode;
  pricingModel: PricingModelKey;
  interval: IntervalKey;
  isEditingRequirements: boolean;
  requirementsAwaitingReview: boolean;
  busyAction: BusyAction;
  exportingFormat: ReportFormat | null;
  notice: string | null;
  error: string | null;
  naturalLanguageInput: string;
  regionCatalog: RegionCatalogResponse | null;
  regionCatalogError: string | null;
  validationIssues: WorkloadFormIssue[];
  dataHealth: DataHealthResponse | null;
  dataHealthError: string | null;
  onClear: () => void;
  onEdit: () => void;
  onInputModeChange: (mode: InputMode) => void;
  onPricingModelChange: (model: PricingModelKey) => void;
  onNaturalLanguageChange: (value: string) => void;
  onFormChange: (form: WorkloadFormState) => void;
  onSubmit: (event?: FormEvent) => void;
  onParse: () => void;
  onClearRequirements: () => void;
  onUseSample: () => void;
  onRequirementsFileLoad: (file: File | null) => void | Promise<void>;
  requirementsFileName: string | null;
  onIntervalChange: (interval: IntervalKey) => void;
  onRefreshLive: () => void;
  onExport: (format: ReportFormat) => void;
}) {
  return (
    <section className="progressive-results" id="requirements" aria-label="Cost comparison results">
      <div className="progressive-results-inner">
        {isEditingRequirements ? (
          <>
            <RequirementsEditPanel
              form={form}
              inputMode={inputMode}
              naturalLanguageInput={naturalLanguageInput}
              pricingModel={pricingModel}
              regionCatalog={regionCatalog}
              regionCatalogError={regionCatalogError}
              validationIssues={validationIssues}
              requirementsAwaitingReview={requirementsAwaitingReview}
              busyAction={busyAction}
              onClearRequirements={onClearRequirements}
              onFormChange={onFormChange}
              onInputModeChange={onInputModeChange}
              onPricingModelChange={onPricingModelChange}
              onNaturalLanguageChange={onNaturalLanguageChange}
              onParse={onParse}
              onSubmit={onSubmit}
              onUseSample={onUseSample}
              onRequirementsFileLoad={onRequirementsFileLoad}
              requirementsFileName={requirementsFileName}
            />
            <StatusMessage notice={editStatusNotice(notice)} error={error} />
          </>
        ) : (
          <>
            <RequirementSummaryStrip
              form={submittedForm}
              inputMode={submittedInputMode}
              pricingModel={pricingModel}
              regionCatalog={regionCatalog}
              onClear={onClear}
              onEdit={onEdit}
            />

            <DataHealthBanner health={dataHealth} error={dataHealthError} compact />

            <ResultQuickActions
              comparison={comparison}
              interval={interval}
              pricingModel={pricingModel}
              busyAction={busyAction}
              exportingFormat={exportingFormat}
              onExport={onExport}
              onRefreshLive={onRefreshLive}
            />

            <StatusMessage notice={resultStatusNotice(notice)} error={error} />

            <ProviderSummaryCards comparison={comparison} interval={interval} />

            <div
              className="progressive-analytics-stack"
              aria-label="Executive and engineering analytics"
            >
              <ExecutiveAnalyticsPreview
                comparison={comparison}
                form={submittedForm}
                pricingModel={pricingModel}
              />
              <EngineeringAnalyticsPreview comparison={comparison} interval={interval} />
            </div>

            <div className="result-disclosure-stack" aria-label="Additional comparison details">
              <ResultDisclosureSection
                title="Show full breakdown, pricing models & export options"
                description="Expand for cost periods, charts, commitment scenarios, budget alerts, sharing, architecture evidence, calculators, and exports."
              >
                <StateDetailContent
                  busyAction={busyAction}
                  client={client}
                  comparison={comparison}
                  error={error}
                  exportingFormat={exportingFormat}
                  form={submittedForm}
                  interval={interval}
                  pricingModel={pricingModel}
                  regionCatalog={regionCatalog}
                  onExport={onExport}
                  onIntervalChange={onIntervalChange}
                  onPricingModelChange={onPricingModelChange}
                  onRefreshLive={onRefreshLive}
                />
              </ResultDisclosureSection>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function RequirementSummaryStrip({
  form,
  inputMode,
  pricingModel,
  regionCatalog,
  onClear,
  onEdit,
}: {
  form: WorkloadFormState;
  inputMode: InputMode;
  pricingModel: PricingModelKey;
  regionCatalog: RegionCatalogResponse | null;
  onClear: () => void;
  onEdit: () => void;
}) {
  return (
    <section className="requirement-summary-strip" aria-label="Current workload summary">
      <div className="summary-strip-main">
        <span className="summary-strip-kicker">
          <InputModeBadge mode={inputMode} />
          <PricingModelBadge pricingModel={pricingModel} />
          <span>Requirements</span>
        </span>
        <strong>{compactRequirementSummary(form, regionCatalog)}</strong>
      </div>
      <div className="summary-strip-actions">
        <Button type="button" variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button type="button" variant="destructive" onClick={onClear}>
          Clear
        </Button>
      </div>
    </section>
  );
}

function ResultQuickActions({
  comparison,
  interval,
  pricingModel,
  busyAction,
  exportingFormat,
  onExport,
  onRefreshLive,
}: {
  comparison: ComparisonResult;
  interval: IntervalKey;
  pricingModel: PricingModelKey;
  busyAction: BusyAction;
  exportingFormat: ReportFormat | null;
  onExport: (format: ReportFormat) => void;
  onRefreshLive: () => void;
}) {
  const cheapestProvider = comparison.providers.find(
    (provider) => provider.providerId === comparison.cheapestProviderId,
  );
  const pricedProviderCount = comparison.providers.filter(
    (provider) => provider.totals.monthly > 0,
  ).length;
  const scenarioLabel = pricingModelSummaryLabel(pricingModel);
  const intervalLabel = capitalize(interval);

  return (
    <section className="result-quick-actions" aria-label="Comparison quick actions">
      <div className="result-quick-actions-copy">
        <span className="result-quick-actions-kicker">Demo controls</span>
        <strong>
          {cheapestProvider
            ? `${providerLabel(comparison.cheapestProviderId)} leads at ${formatCurrency(
                costForInterval(cheapestProvider, interval),
              )}`
            : 'Provider recommendation pending'}
        </strong>
        <span>
          {intervalLabel} · {scenarioLabel} · {pricedProviderCount}/{comparison.providers.length}{' '}
          providers priced
        </span>
      </div>
      <div className="result-quick-actions-controls">
        <ExportBar
          disabled={busyAction !== null && busyAction !== 'export'}
          exportingFormat={exportingFormat}
          onExport={onExport}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={onRefreshLive}
          loading={busyAction === 'refresh'}
          loadingLabel="Refreshing..."
          disabled={busyAction !== null && busyAction !== 'refresh'}
        >
          <RefreshIcon />
          Refresh live
        </Button>
      </div>
    </section>
  );
}

function StateDetailContent({
  busyAction,
  client,
  comparison,
  error,
  exportingFormat,
  form,
  interval,
  pricingModel,
  regionCatalog,
  onExport,
  onIntervalChange,
  onPricingModelChange,
  onRefreshLive,
}: {
  busyAction: BusyAction;
  client: PolyCostClient;
  comparison: ComparisonResult;
  error: string | null;
  exportingFormat: ReportFormat | null;
  form: WorkloadFormState;
  interval: IntervalKey;
  pricingModel: PricingModelKey;
  regionCatalog: RegionCatalogResponse | null;
  onExport: (format: ReportFormat) => void;
  onIntervalChange: (interval: IntervalKey) => void;
  onPricingModelChange: (model: PricingModelKey) => void;
  onRefreshLive: () => void;
}) {
  const isLoading = busyAction === 'compare' || busyAction === 'refresh';

  return (
    <div className="state-detail-stack state-detail-stack-combined">
      <section className="state-detail-panel" aria-label="Executive recommendation and export">
        <ResultDetailHeading
          title="Executive decision brief"
          description="A plain-language recommendation, forecast, and board-ready PDF summary export."
        />
        <ExecutiveDecisionDashboard
          comparison={comparison}
          form={form}
          regionCatalog={regionCatalog}
          exportingFormat={exportingFormat}
          isLoading={isLoading}
          onExport={onExport}
        />
      </section>

      <section className="state-detail-panel" aria-label="Engineering cost controls">
        <ResultDetailHeading
          title="Engineering cost controls"
          description="Cost periods, commitment scenarios, compute/storage/egress mix, budget alerts, currency, and share workflow."
        />
        <EngineeringAnalyticsDashboard comparison={comparison} interval={interval} />
        <ServiceCheapestMatrix comparison={comparison} interval={interval} />
        <ProductionDepthAnalytics comparison={comparison} form={form} />
        <FullCostMatrixTable comparison={comparison} />
        <CostFormulaEvidence comparison={comparison} />
        <ComparisonToolbar interval={interval} onIntervalChange={onIntervalChange} />
        <FinOpsFeatureLayer
          client={client}
          comparison={comparison}
          form={form}
          interval={interval}
          isLoading={isLoading}
          pricingModelPreference={pricingModel}
          onPricingModelPreferenceChange={onPricingModelChange}
        />
      </section>

      <section className="state-detail-panel" aria-label="Architecture and engineering evidence">
        <ResultDetailHeading
          title="Architecture & engineering evidence"
          description="Solution architecture review, governance checks, sortable resource rows, CSV export, and API-facing JSON."
        />
        <ArchitectureWorkspace comparison={comparison} interval={interval} form={form} />
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

      <section
        className="state-detail-panel"
        aria-label="Official calculators, regions, and exports"
      >
        <ResultDetailHeading
          title="Official calculators, regions & exports"
          description="Provider calculator links, official region references, refresh, and PDF/CSV/Excel report downloads."
        />
        <CloudCalculatorLinks regionCatalog={regionCatalog} />
        <div className="progressive-export-panel">
          <ExportBar
            disabled={busyAction !== null && busyAction !== 'export'}
            exportingFormat={exportingFormat}
            onExport={onExport}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={onRefreshLive}
            loading={busyAction === 'refresh'}
            loadingLabel="Refreshing..."
            disabled={busyAction !== null && busyAction !== 'refresh'}
          >
            <RefreshIcon />
            Refresh live
          </Button>
        </div>
      </section>
    </div>
  );
}

function editStatusNotice(notice: string | null): string | null {
  const meaningfulNotice = notice?.replace(/ ?Comparison ready\.$/, '').trim();

  return meaningfulNotice ? meaningfulNotice : null;
}

function initialStatusNotice(notice: string | null): string | null {
  return notice === 'Comparison ready.' ? null : notice;
}

function resultStatusNotice(notice: string | null): string | null {
  return editStatusNotice(notice);
}

function InputModeTabs({
  inputMode,
  onInputModeChange,
}: {
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
}) {
  return (
    <div className="mode-tabs" role="tablist" aria-label="Requirement input mode">
      {INPUT_MODE_OPTIONS.map((option) => (
        <button
          type="button"
          role="tab"
          aria-selected={inputMode === option.key}
          className="tab-button"
          title={option.description}
          key={option.key}
          onClick={() => onInputModeChange(option.key)}
        >
          <ModeIcon mode={option.key} />
          {option.label}
        </button>
      ))}
    </div>
  );
}

function InputModeBadge({ mode }: { mode: InputMode }) {
  return (
    <span className={`input-mode-badge input-mode-badge-${mode}`}>
      <ModeIcon mode={mode} />
      {inputModeSummaryLabel(mode)}
    </span>
  );
}

function PricingModelPreferenceControl({
  pricingModel,
  onPricingModelChange,
}: {
  pricingModel: PricingModelKey;
  onPricingModelChange: (model: PricingModelKey) => void;
}) {
  return (
    <div className="pricing-model-preference" aria-label="Pricing model preference">
      <span className="pricing-model-preference-label">Scenario</span>
      <div className="pricing-model-preference-options" role="group" aria-label="Pricing model">
        {PRICING_MODEL_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.key}
            title={option.description}
            aria-pressed={pricingModel === option.key}
            onClick={() => onPricingModelChange(option.key)}
          >
            <PricingModelMiniIcon pricingModel={option.key} />
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PricingModelBadge({ pricingModel }: { pricingModel: PricingModelKey }) {
  return (
    <span className={`pricing-model-badge pricing-model-badge-${pricingModel}`}>
      <PricingModelMiniIcon pricingModel={pricingModel} />
      {pricingModelSummaryLabel(pricingModel)}
    </span>
  );
}

function DataHealthBanner({
  health,
  error,
  compact = false,
}: {
  health: DataHealthResponse | null;
  error: string | null;
  compact?: boolean;
}) {
  if (!health && !error) {
    return null;
  }

  const tone = error ? 'degraded' : (health?.overallStatus ?? 'degraded');
  const summary = error
    ? 'Pricing data health unavailable'
    : health?.overallStatus === 'fresh'
      ? `Pricing cache fresh across ${health.providers.length} providers`
      : `${health?.alertCount ?? 0} pricing data alert${health?.alertCount === 1 ? '' : 's'}`;

  return (
    <section
      className={
        compact
          ? `data-health-banner data-health-${tone} is-compact`
          : `data-health-banner data-health-${tone}`
      }
      aria-label="Pricing data health"
    >
      <div className="data-health-main">
        <span>Data health</span>
        <strong>{summary}</strong>
        <small>
          {error ??
            `Freshness policy ${health?.freshnessPolicyHours ?? 24}h · generated ${formatDateTime(
              health?.generatedAt,
            )}`}
        </small>
      </div>
      {health ? (
        <div className="data-health-providers" aria-label="Provider data freshness">
          {health.providers.map((provider) => (
            <span
              className={`data-health-provider data-health-provider-${provider.freshness}`}
              key={provider.providerId}
              title={provider.message}
            >
              {providerLabel(provider.providerId)}
              <small>
                {provider.ageHours !== undefined ? `${provider.ageHours}h` : provider.freshness}
              </small>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RequirementsEditPanel({
  form,
  inputMode,
  naturalLanguageInput,
  pricingModel,
  regionCatalog,
  regionCatalogError,
  validationIssues,
  requirementsAwaitingReview,
  busyAction,
  onClearRequirements,
  onFormChange,
  onInputModeChange,
  onPricingModelChange,
  onNaturalLanguageChange,
  onParse,
  onSubmit,
  onUseSample,
  onRequirementsFileLoad,
  requirementsFileName,
}: {
  form: WorkloadFormState;
  inputMode: InputMode;
  naturalLanguageInput: string;
  pricingModel: PricingModelKey;
  regionCatalog: RegionCatalogResponse | null;
  regionCatalogError: string | null;
  validationIssues: WorkloadFormIssue[];
  requirementsAwaitingReview: boolean;
  busyAction: BusyAction;
  onClearRequirements: () => void;
  onFormChange: (form: WorkloadFormState) => void;
  onInputModeChange: (mode: InputMode) => void;
  onPricingModelChange: (model: PricingModelKey) => void;
  onNaturalLanguageChange: (value: string) => void;
  onParse: () => void;
  onSubmit: (event?: FormEvent) => void;
  onUseSample: () => void;
  onRequirementsFileLoad: (file: File | null) => void | Promise<void>;
  requirementsFileName: string | null;
}) {
  return (
    <section className="requirements-edit-panel" aria-label="Edit workload requirements">
      <div className="requirements-edit-header">
        <div>
          <span>Edit requirements</span>
          <strong>Adjust inputs and compare again</strong>
        </div>
      </div>
      <InputModeTabs inputMode={inputMode} onInputModeChange={onInputModeChange} />
      <PricingModelPreferenceControl
        pricingModel={pricingModel}
        onPricingModelChange={onPricingModelChange}
      />
      {inputMode === 'describe' ? (
        <DescribePanel
          value={naturalLanguageInput}
          isParsing={busyAction === 'parse'}
          onChange={onNaturalLanguageChange}
          onClear={onClearRequirements}
          onParse={onParse}
          onUseSample={onUseSample}
          onFileLoad={onRequirementsFileLoad}
          fileName={requirementsFileName}
        />
      ) : (
        <WorkloadForm
          form={form}
          regionCatalog={regionCatalog}
          regionCatalogError={regionCatalogError}
          validationIssues={validationIssues}
          onChange={onFormChange}
          onSubmit={onSubmit}
        />
      )}
      {inputMode === 'form' && requirementsAwaitingReview ? (
        <RequirementReviewCards form={form} compact />
      ) : null}
      <div className="requirements-edit-actions">
        <Button
          type="button"
          variant="primary"
          onClick={() => void onSubmit()}
          loading={busyAction === 'compare'}
          loadingLabel={compareLoadingLabel(inputMode)}
          disabled={busyAction !== null && busyAction !== 'compare'}
        >
          <CompareIcon />
          {inputMode === 'form' && requirementsAwaitingReview
            ? 'Confirm & compare'
            : compareButtonLabel(inputMode)}
        </Button>
      </div>
    </section>
  );
}

function ProviderSummaryCards({
  comparison,
  interval,
}: {
  comparison: ComparisonResult;
  interval: IntervalKey;
}) {
  const providerResults = new Map<ProviderId, ComparisonProviderResult>(
    comparison.providers.map((provider) => [provider.providerId, provider]),
  );

  return (
    <section className="provider-summary-results" aria-label="Provider cost summary">
      <div className="provider-summary-grid">
        {PROVIDER_ORDER.map((providerId) => {
          const provider = providerResults.get(providerId);
          const isCheapest = comparison.cheapestProviderId === providerId && Boolean(provider);

          return (
            <article
              key={providerId}
              className={`provider-summary-card provider-summary-card-${providerId}`}
              aria-labelledby={`summary-${providerId}-title`}
            >
              {isCheapest ? <span className="lowest-badge">Best value</span> : null}
              <div className="provider-summary-heading">
                <div>
                  <h2 id={`summary-${providerId}-title`}>{providerLabel(providerId)}</h2>
                  <span>{providerSubtitle(providerId)}</span>
                </div>
              </div>
              <strong className="provider-summary-total">
                {provider ? formatCurrency(costForInterval(provider, interval)) : 'Unavailable'}
              </strong>
              <span className="provider-summary-period">{capitalize(interval)} estimate</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ResultDisclosureSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const headingId = `result-disclosure-${toId(title)}`;
  const bodyId = `${headingId}-body`;
  const actionLabel = isOpen ? 'Hide full breakdown' : title;
  const actionDescription = isOpen
    ? 'Collapse detailed cost periods, charts, commitment scenarios, budget alerts, sharing, architecture evidence, calculators, and exports.'
    : description;

  function handleToggle() {
    setIsOpen((current) => {
      const nextOpen = !current;
      if (nextOpen) {
        setHasOpened(true);
      }

      return nextOpen;
    });
  }

  return (
    <section
      className="result-disclosure"
      aria-labelledby={headingId}
      data-open={isOpen ? 'true' : 'false'}
      data-mounted={hasOpened ? 'true' : 'false'}
    >
      <button
        type="button"
        className="result-disclosure-heading"
        aria-controls={bodyId}
        aria-expanded={isOpen}
        aria-label={`${actionLabel}. ${actionDescription}`}
        onClick={handleToggle}
      >
        <span>
          <strong id={headingId}>{actionLabel}</strong> <small>{actionDescription}</small>
        </span>
        <span className="result-disclosure-chevron" aria-hidden="true">
          {isOpen ? '-' : '+'}
        </span>
      </button>
      <div
        id={bodyId}
        className="result-disclosure-panel"
        aria-hidden={!isOpen}
        data-open={isOpen ? 'true' : 'false'}
      >
        <div className="result-disclosure-body">{hasOpened ? children : null}</div>
      </div>
    </section>
  );
}

function ResultDetailHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="state-detail-heading">
      <h3>{title}</h3>
      <p>{description}</p>
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
  onFileLoad,
  fileName,
}: {
  value: string;
  isParsing: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  onParse?: () => void;
  onUseSample: () => void;
  onFileLoad: (file: File | null) => void | Promise<void>;
  fileName: string | null;
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
        placeholder="Paste an architecture description, cloud bill excerpt, or CSV-like text. Example: A web app for 5,000 daily users with Postgres, 250GB object storage, CDN, and US East preference."
      />
      <div className="requirements-file-loader">
        <label className="requirements-file-trigger" htmlFor="requirements-file-input">
          <UploadIcon />
          Upload requirements file
        </label>
        <input
          id="requirements-file-input"
          className="sr-only"
          type="file"
          accept={REQUIREMENTS_FILE_ACCEPT}
          aria-describedby="requirements-file-help"
          disabled={isParsing}
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0] ?? null;

            void Promise.resolve(onFileLoad(file)).finally(() => {
              input.value = '';
            });
          }}
        />
        <div className="requirements-file-copy">
          <p id="requirements-file-help">
            TXT, Markdown, JSON, or YAML. CSV, Excel, and diagram parsers plug in at Phase 2.
          </p>
          {fileName ? (
            <p className="requirements-file-status" role="status">
              Loaded from {fileName}
            </p>
          ) : null}
        </div>
      </div>
      <div className="action-row">
        {onParse ? (
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
        ) : null}
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
  validationIssues,
  onChange,
  onSubmit,
}: {
  form: WorkloadFormState;
  regionCatalog: RegionCatalogResponse | null;
  regionCatalogError: string | null;
  validationIssues: WorkloadFormIssue[];
  onChange: (form: WorkloadFormState) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  function update<K extends keyof WorkloadFormState>(key: K, value: WorkloadFormState[K]) {
    onChange({
      ...form,
      [key]: value,
    });
  }

  function updateServiceCategory(value: string) {
    onChange({
      ...form,
      selectedServiceCategory: value,
      selectedServiceFamilyId:
        firstServiceFamilyIdForCategory(value) ?? form.selectedServiceFamilyId,
    });
  }

  function updateFaultTolerance(value: WorkloadFormState['faultTolerance']) {
    onChange({
      ...form,
      faultTolerance: value,
      multiAz: value !== 'single-zone',
      multiRegion: value === 'multi-region' || value === 'active-active',
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

  function updateBulkServiceRows(rows: BulkServiceRow[]) {
    onChange(formWithBulkServiceRows(form, rows));
  }

  function applyTemplate(template: ArchitectureTemplate) {
    onChange(template.form);
  }

  const sizingSummary = formSizingSummary(form);
  const fieldErrors = validationIssueMap(validationIssues);

  return (
    <form className="structured-form" onSubmit={onSubmit}>
      <ArchitectureTemplatePicker onApply={applyTemplate} />
      <FormValidationSummary issues={validationIssues} />
      <div className="form-overview-strip" aria-label="Workload sizing summary">
        <FormSummaryChip label="Profile" value={sizingSummary.profile} tone="profile" />
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
          <SelectField
            label="Environment"
            value={form.environment}
            options={ENVIRONMENT_OPTIONS}
            onChange={(value) => update('environment', value)}
          />
          <SelectField
            label="Data residency"
            value={form.dataResidency}
            options={[
              ['global', 'Global'],
              ['us', 'United States'],
              ['eu', 'European Union'],
              ['uk', 'United Kingdom'],
              ['apac', 'APAC'],
              ['canada', 'Canada'],
            ]}
            onChange={(value) => update('dataResidency', value)}
          />
          <SelectField
            label="Support"
            value={form.supportTier}
            options={SUPPORT_TIER_OPTIONS}
            onChange={(value) => update('supportTier', value)}
          />
          <SelectField
            label="OS / license"
            value={form.operatingSystem}
            options={OPERATING_SYSTEM_OPTIONS}
            onChange={(value) => update('operatingSystem', value)}
          />
          <TextField
            label="Daily users"
            value={form.dailyActiveUsers}
            inputMode="numeric"
            error={fieldErrors.dailyActiveUsers}
            onChange={(value) => update('dailyActiveUsers', value)}
          />
          <TextField
            label="Peak users"
            value={form.peakConcurrentUsers}
            inputMode="numeric"
            error={fieldErrors.peakConcurrentUsers}
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
            error={fieldErrors.vcpu}
            onChange={(value) => update('vcpu', value)}
          />
          <TextField
            label="Memory GB"
            value={form.memoryGb}
            inputMode="decimal"
            suffix="GB"
            error={fieldErrors.memoryGb}
            onChange={(value) => update('memoryGb', value)}
          />
          <TextField
            label="Instances"
            value={form.instanceCount}
            inputMode="numeric"
            suffix="nodes"
            error={fieldErrors.instanceCount}
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
            error={fieldErrors.autoscaleMin}
            onChange={(value) => update('autoscaleMin', value)}
          />
          <TextField
            label="Scale max"
            value={form.autoscaleMax}
            inputMode="numeric"
            suffix="max"
            error={fieldErrors.autoscaleMax}
            onChange={(value) => update('autoscaleMax', value)}
          />
          <SelectField
            label="Usage pattern"
            value={form.usagePattern}
            options={USAGE_PATTERN_OPTIONS}
            onChange={(value) => update('usagePattern', value)}
          />
          <TextField
            label="Hours/day"
            value={form.usageHoursPerDay}
            inputMode="decimal"
            suffix="hrs"
            disabled={form.usagePattern !== 'scheduled'}
            error={fieldErrors.usageHoursPerDay}
            onChange={(value) => update('usageHoursPerDay', value)}
          />
          <TextField
            label="Days/week"
            value={form.usageDaysPerWeek}
            inputMode="numeric"
            suffix="days"
            disabled={form.usagePattern !== 'scheduled'}
            error={fieldErrors.usageDaysPerWeek}
            onChange={(value) => update('usageDaysPerWeek', value)}
          />
          <TextField
            label="Avg utilization"
            value={form.averageUtilizationPercent}
            inputMode="decimal"
            suffix="%"
            disabled={form.usagePattern !== 'bursty'}
            error={fieldErrors.averageUtilizationPercent}
            onChange={(value) => update('averageUtilizationPercent', value)}
          />
          <RangeField
            label="Commitment fit"
            value={form.commitmentPreferencePercent}
            min={0}
            max={100}
            suffix="%"
            error={fieldErrors.commitmentPreferencePercent}
            onChange={(value) => update('commitmentPreferencePercent', value)}
          />
        </div>
      </FormSection>

      <FormSection title="Services" tone="services" defaultOpen>
        <div className="service-selector-grid">
          <SelectField
            label="Fault tolerance"
            value={form.faultTolerance}
            options={FAULT_TOLERANCE_OPTIONS}
            onChange={updateFaultTolerance}
          />
        </div>
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
        <div className="service-selector-grid" aria-label="Primary cloud-neutral service selector">
          <SelectField
            label="Service category"
            value={form.selectedServiceCategory}
            options={serviceCategoryOptions()}
            onChange={updateServiceCategory}
          />
          <SelectField
            label="Specific service"
            value={form.selectedServiceFamilyId}
            options={serviceFamilyOptions(form.selectedServiceCategory)}
            onChange={(value) => update('selectedServiceFamilyId', value)}
          />
          <SelectField
            label="Instance tier"
            value={form.instanceTier}
            options={INSTANCE_TIER_OPTIONS}
            onChange={(value) => update('instanceTier', value)}
          />
          <SelectField
            label="Architecture"
            value={form.processorArchitecture}
            options={PROCESSOR_ARCHITECTURE_OPTIONS}
            onChange={(value) => update('processorArchitecture', value)}
          />
          <SelectField
            label="Tenancy"
            value={form.computeTenancy}
            options={COMPUTE_TENANCY_OPTIONS}
            onChange={(value) => update('computeTenancy', value)}
          />
          <TextField
            label="Availability zones"
            value={form.availabilityZoneCount}
            inputMode="numeric"
            suffix="AZs"
            onChange={(value) => update('availabilityZoneCount', value)}
          />
        </div>
        <ServiceCatalogPicker
          selectedIds={form.selectedServiceFamilyIds}
          onToggle={toggleServiceFamily}
        />
        <BulkServiceImporter
          rows={form.bulkServiceRows}
          selectedIds={form.selectedServiceFamilyIds}
          error={fieldErrors.bulkServiceRows}
          onRowsChange={updateBulkServiceRows}
        />
        <details className="advanced-service-fields">
          <summary>
            <span>Serverless & container cost drivers</span>
            <small>Function usage, Kubernetes overhead, registry transfer</small>
          </summary>
          <div className="form-grid secondary-grid">
            <TextField
              label="Function invokes"
              value={form.functionInvocationsMillion}
              inputMode="decimal"
              suffix="M/mo"
              error={fieldErrors.functionInvocationsMillion}
              onChange={(value) => update('functionInvocationsMillion', value)}
            />
            <TextField
              label="Function duration"
              value={form.functionDurationMs}
              inputMode="decimal"
              suffix="ms"
              error={fieldErrors.functionDurationMs}
              onChange={(value) => update('functionDurationMs', value)}
            />
            <TextField
              label="Function memory"
              value={form.functionMemoryMb}
              inputMode="numeric"
              suffix="MB"
              error={fieldErrors.functionMemoryMb}
              onChange={(value) => update('functionMemoryMb', value)}
            />
            <TextField
              label="K8s clusters"
              value={form.kubernetesClusterCount}
              inputMode="numeric"
              suffix="clusters"
              error={fieldErrors.kubernetesClusterCount}
              onChange={(value) => update('kubernetesClusterCount', value)}
            />
            <TextField
              label="Worker nodes"
              value={form.kubernetesWorkerNodeCount}
              inputMode="numeric"
              suffix="nodes"
              error={fieldErrors.kubernetesWorkerNodeCount}
              onChange={(value) => update('kubernetesWorkerNodeCount', value)}
            />
            <TextField
              label="Registry storage"
              value={form.registryStorageGb}
              inputMode="decimal"
              suffix="GB"
              error={fieldErrors.registryStorageGb}
              onChange={(value) => update('registryStorageGb', value)}
            />
            <TextField
              label="Registry egress"
              value={form.registryEgressGb}
              inputMode="decimal"
              suffix="GB/mo"
              error={fieldErrors.registryEgressGb}
              onChange={(value) => update('registryEgressGb', value)}
            />
          </div>
        </details>
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
              error={fieldErrors.storageSizeGb}
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
          <details className="advanced-service-fields">
            <summary>
              <span>Advanced storage cost drivers</span>
              <small>Requests, retrieval, replication, snapshots, IOPS</small>
            </summary>
            <div
              className={
                form.storageEnabled
                  ? 'form-grid form-grid-data'
                  : 'form-grid form-grid-data is-muted'
              }
            >
              <SelectField
                label="Storage class"
                value={form.storageClass}
                disabled={!form.storageEnabled}
                options={STORAGE_CLASS_OPTIONS}
                onChange={(value) => update('storageClass', value)}
              />
              <SelectField
                label="Replication"
                value={form.storageReplication}
                disabled={!form.storageEnabled}
                options={STORAGE_REPLICATION_OPTIONS}
                onChange={(value) => update('storageReplication', value)}
              />
              <TextField
                label="PUT requests"
                value={form.monthlyPutRequestsThousand}
                inputMode="decimal"
                suffix="k/mo"
                disabled={!form.storageEnabled}
                error={fieldErrors.monthlyPutRequestsThousand}
                onChange={(value) => update('monthlyPutRequestsThousand', value)}
              />
              <TextField
                label="GET requests"
                value={form.monthlyGetRequestsThousand}
                inputMode="decimal"
                suffix="k/mo"
                disabled={!form.storageEnabled}
                error={fieldErrors.monthlyGetRequestsThousand}
                onChange={(value) => update('monthlyGetRequestsThousand', value)}
              />
              <TextField
                label="DELETE requests"
                value={form.monthlyDeleteRequestsThousand}
                inputMode="decimal"
                suffix="k/mo"
                disabled={!form.storageEnabled}
                error={fieldErrors.monthlyDeleteRequestsThousand}
                onChange={(value) => update('monthlyDeleteRequestsThousand', value)}
              />
              <TextField
                label="LIST requests"
                value={form.monthlyListRequestsThousand}
                inputMode="decimal"
                suffix="k/mo"
                disabled={!form.storageEnabled}
                error={fieldErrors.monthlyListRequestsThousand}
                onChange={(value) => update('monthlyListRequestsThousand', value)}
              />
              <TextField
                label="Retrieval"
                value={form.monthlyRetrievalGb}
                inputMode="decimal"
                suffix="GB/mo"
                disabled={!form.storageEnabled}
                error={fieldErrors.monthlyRetrievalGb}
                onChange={(value) => update('monthlyRetrievalGb', value)}
              />
              <TextField
                label="Lifecycle ops"
                value={form.lifecycleTransitionsThousand}
                inputMode="decimal"
                suffix="k/mo"
                disabled={!form.storageEnabled}
                error={fieldErrors.lifecycleTransitionsThousand}
                onChange={(value) => update('lifecycleTransitionsThousand', value)}
              />
              <TextField
                label="Snapshot storage"
                value={form.snapshotSizeGb}
                inputMode="decimal"
                suffix="GB"
                disabled={!form.storageEnabled}
                error={fieldErrors.snapshotSizeGb}
                onChange={(value) => update('snapshotSizeGb', value)}
              />
              <TextField
                label="Snapshot days"
                value={form.snapshotRetentionDays}
                inputMode="numeric"
                suffix="days"
                disabled={!form.storageEnabled}
                error={fieldErrors.snapshotRetentionDays}
                onChange={(value) => update('snapshotRetentionDays', value)}
              />
              <TextField
                label="Provisioned IOPS"
                value={form.provisionedIops}
                inputMode="numeric"
                suffix="IOPS"
                disabled={!form.storageEnabled}
                error={fieldErrors.provisionedIops}
                onChange={(value) => update('provisionedIops', value)}
              />
              <TextField
                label="Throughput"
                value={form.provisionedThroughputMbps}
                inputMode="decimal"
                suffix="MB/s"
                disabled={!form.storageEnabled}
                error={fieldErrors.provisionedThroughputMbps}
                onChange={(value) => update('provisionedThroughputMbps', value)}
              />
            </div>
          </details>
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
              error={fieldErrors.databaseSizeGb}
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
          <details className="advanced-service-fields">
            <summary>
              <span>Advanced database cost drivers</span>
              <small>Backups, IOPS, replicas, NoSQL units, RU/s, query TB</small>
            </summary>
            <div
              className={
                form.databaseEnabled
                  ? 'form-grid form-grid-data'
                  : 'form-grid form-grid-data is-muted'
              }
            >
              <TextField
                label="Backup storage"
                value={form.databaseBackupStorageGb}
                inputMode="decimal"
                suffix="GB"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseBackupStorageGb}
                onChange={(value) => update('databaseBackupStorageGb', value)}
              />
              <TextField
                label="Backup days"
                value={form.databaseBackupRetentionDays}
                inputMode="numeric"
                suffix="days"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseBackupRetentionDays}
                onChange={(value) => update('databaseBackupRetentionDays', value)}
              />
              <TextField
                label="DB IOPS"
                value={form.databaseProvisionedIops}
                inputMode="numeric"
                suffix="IOPS"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseProvisionedIops}
                onChange={(value) => update('databaseProvisionedIops', value)}
              />
              <TextField
                label="Read replicas"
                value={form.databaseReadReplicaCount}
                inputMode="numeric"
                suffix="nodes"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseReadReplicaCount}
                onChange={(value) => update('databaseReadReplicaCount', value)}
              />
              <TextField
                label="Replica transfer"
                value={form.databaseCrossRegionReplicaTransferGb}
                inputMode="decimal"
                suffix="GB/mo"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseCrossRegionReplicaTransferGb}
                onChange={(value) => update('databaseCrossRegionReplicaTransferGb', value)}
              />
              <TextField
                label="NoSQL reads"
                value={form.databaseNosqlReadRequestUnitsMillion}
                inputMode="decimal"
                suffix="M/mo"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseNosqlReadRequestUnitsMillion}
                onChange={(value) => update('databaseNosqlReadRequestUnitsMillion', value)}
              />
              <TextField
                label="NoSQL writes"
                value={form.databaseNosqlWriteRequestUnitsMillion}
                inputMode="decimal"
                suffix="M/mo"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseNosqlWriteRequestUnitsMillion}
                onChange={(value) => update('databaseNosqlWriteRequestUnitsMillion', value)}
              />
              <TextField
                label="RU/s"
                value={form.databaseRuPerSecond}
                inputMode="numeric"
                suffix="RU/s"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseRuPerSecond}
                onChange={(value) => update('databaseRuPerSecond', value)}
              />
              <TextField
                label="Query volume"
                value={form.databaseQueryDataTb}
                inputMode="decimal"
                suffix="TB/mo"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseQueryDataTb}
                onChange={(value) => update('databaseQueryDataTb', value)}
              />
              <TextField
                label="Cache replicas"
                value={form.databaseCacheReplicaCount}
                inputMode="numeric"
                suffix="nodes"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseCacheReplicaCount}
                onChange={(value) => update('databaseCacheReplicaCount', value)}
              />
              <TextField
                label="Storage growth"
                value={form.databaseStorageGrowthGbPerMonth}
                inputMode="decimal"
                suffix="GB/mo"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseStorageGrowthGbPerMonth}
                onChange={(value) => update('databaseStorageGrowthGbPerMonth', value)}
              />
            </div>
          </details>
        </div>
      </FormSection>

      <FormSection title="Analytics" tone="data">
        <div className="form-grid secondary-grid">
          <TextField
            label="Warehouse storage"
            value={form.analyticsWarehouseStorageGb}
            inputMode="decimal"
            suffix="GB"
            error={fieldErrors.analyticsWarehouseStorageGb}
            onChange={(value) => update('analyticsWarehouseStorageGb', value)}
          />
          <TextField
            label="Warehouse query"
            value={form.analyticsWarehouseQueryTb}
            inputMode="decimal"
            suffix="TB/mo"
            error={fieldErrors.analyticsWarehouseQueryTb}
            onChange={(value) => update('analyticsWarehouseQueryTb', value)}
          />
          <TextField
            label="Data lake storage"
            value={form.analyticsDataLakeStorageGb}
            inputMode="decimal"
            suffix="GB"
            error={fieldErrors.analyticsDataLakeStorageGb}
            onChange={(value) => update('analyticsDataLakeStorageGb', value)}
          />
          <TextField
            label="Integration jobs"
            value={form.analyticsIntegrationJobHours}
            inputMode="decimal"
            suffix="hrs/mo"
            error={fieldErrors.analyticsIntegrationJobHours}
            onChange={(value) => update('analyticsIntegrationJobHours', value)}
          />
          <TextField
            label="Streaming ingest"
            value={form.analyticsStreamingIngestGb}
            inputMode="decimal"
            suffix="GB/mo"
            error={fieldErrors.analyticsStreamingIngestGb}
            onChange={(value) => update('analyticsStreamingIngestGb', value)}
          />
          <TextField
            label="BI users"
            value={form.analyticsBiUsers}
            inputMode="numeric"
            suffix="users"
            error={fieldErrors.analyticsBiUsers}
            onChange={(value) => update('analyticsBiUsers', value)}
          />
        </div>
      </FormSection>

      <FormSection title="Integration" tone="network">
        <div className="form-grid secondary-grid">
          <TextField
            label="Queue messages"
            value={form.integrationQueueMessagesMillion}
            inputMode="decimal"
            suffix="M/mo"
            error={fieldErrors.integrationQueueMessagesMillion}
            onChange={(value) => update('integrationQueueMessagesMillion', value)}
          />
          <TextField
            label="Event routing"
            value={form.integrationEventsMillion}
            inputMode="decimal"
            suffix="M/mo"
            error={fieldErrors.integrationEventsMillion}
            onChange={(value) => update('integrationEventsMillion', value)}
          />
          <TextField
            label="Workflow transitions"
            value={form.integrationWorkflowTransitionsThousand}
            inputMode="decimal"
            suffix="K/mo"
            error={fieldErrors.integrationWorkflowTransitionsThousand}
            onChange={(value) => update('integrationWorkflowTransitionsThousand', value)}
          />
          <TextField
            label="API gateway requests"
            value={form.integrationApiGatewayRequestsMillion}
            inputMode="decimal"
            suffix="M/mo"
            error={fieldErrors.integrationApiGatewayRequestsMillion}
            onChange={(value) => update('integrationApiGatewayRequestsMillion', value)}
          />
        </div>
      </FormSection>

      <FormSection title="Network" tone="network">
        <div className="form-grid secondary-grid">
          <TextField
            label="Egress GB/mo"
            value={form.monthlyEgressGb}
            inputMode="decimal"
            suffix="GB"
            error={fieldErrors.monthlyEgressGb}
            onChange={(value) => update('monthlyEgressGb', value)}
          />
          <TextField
            label="Cross-AZ GB/mo"
            value={form.crossAzTransferGb}
            inputMode="decimal"
            suffix="GB"
            error={fieldErrors.crossAzTransferGb}
            onChange={(value) => update('crossAzTransferGb', value)}
          />
          <TextField
            label="Inter-region GB/mo"
            value={form.interRegionTransferGb}
            inputMode="decimal"
            suffix="GB"
            error={fieldErrors.interRegionTransferGb}
            onChange={(value) => update('interRegionTransferGb', value)}
          />
          <TextField
            label="CDN traffic GB/mo"
            value={form.cdnTrafficGb}
            inputMode="decimal"
            suffix="GB"
            error={fieldErrors.cdnTrafficGb}
            onChange={(value) => update('cdnTrafficGb', value)}
          />
          <RangeField
            label="CDN cache hit"
            value={form.cdnCacheHitRatioPercent}
            min={0}
            max={100}
            suffix="%"
            error={fieldErrors.cdnCacheHitRatioPercent}
            onChange={(value) => update('cdnCacheHitRatioPercent', value)}
          />
          <TextField
            label="NAT GB/mo"
            value={form.natGatewayGb}
            inputMode="decimal"
            suffix="GB"
            error={fieldErrors.natGatewayGb}
            onChange={(value) => update('natGatewayGb', value)}
          />
          <TextField
            label="NAT hours/mo"
            value={form.natGatewayHours}
            inputMode="decimal"
            suffix="hrs"
            error={fieldErrors.natGatewayHours}
            onChange={(value) => update('natGatewayHours', value)}
          />
          <TextField
            label="DNS zones"
            value={form.dnsHostedZones}
            inputMode="numeric"
            suffix="zones"
            error={fieldErrors.dnsHostedZones}
            onChange={(value) => update('dnsHostedZones', value)}
          />
          <TextField
            label="DNS queries"
            value={form.dnsQueriesMillion}
            inputMode="decimal"
            suffix="M/mo"
            error={fieldErrors.dnsQueriesMillion}
            onChange={(value) => update('dnsQueriesMillion', value)}
          />
          <TextField
            label="LB processed GB"
            value={form.loadBalancerProcessedGb}
            inputMode="decimal"
            suffix="GB"
            error={fieldErrors.loadBalancerProcessedGb}
            onChange={(value) => update('loadBalancerProcessedGb', value)}
          />
          <TextField
            label="LB hours/mo"
            value={form.loadBalancerHours}
            inputMode="decimal"
            suffix="hrs"
            error={fieldErrors.loadBalancerHours}
            onChange={(value) => update('loadBalancerHours', value)}
          />
          <details className="advanced-service-fields form-grid-span">
            <summary>
              <span>Operations cost drivers</span>
              <small>Metrics, logs, alarms, traces, secrets, posture, WAF</small>
            </summary>
            <div className="form-grid secondary-grid">
              <TextField
                label="Metric samples"
                value={form.observabilityMetricsMillion}
                inputMode="decimal"
                suffix="M/mo"
                error={fieldErrors.observabilityMetricsMillion}
                onChange={(value) => update('observabilityMetricsMillion', value)}
              />
              <TextField
                label="Log ingest"
                value={form.observabilityLogsIngestGb}
                inputMode="decimal"
                suffix="GB/mo"
                error={fieldErrors.observabilityLogsIngestGb}
                onChange={(value) => update('observabilityLogsIngestGb', value)}
              />
              <TextField
                label="Log retention"
                value={form.observabilityLogRetentionGb}
                inputMode="decimal"
                suffix="GB-mo"
                error={fieldErrors.observabilityLogRetentionGb}
                onChange={(value) => update('observabilityLogRetentionGb', value)}
              />
              <TextField
                label="Alarms"
                value={form.observabilityAlarms}
                inputMode="numeric"
                suffix="rules"
                error={fieldErrors.observabilityAlarms}
                onChange={(value) => update('observabilityAlarms', value)}
              />
              <TextField
                label="Dashboards"
                value={form.observabilityDashboards}
                inputMode="numeric"
                suffix="views"
                error={fieldErrors.observabilityDashboards}
                onChange={(value) => update('observabilityDashboards', value)}
              />
              <TextField
                label="Trace spans"
                value={form.observabilityTracesMillion}
                inputMode="decimal"
                suffix="M/mo"
                error={fieldErrors.observabilityTracesMillion}
                onChange={(value) => update('observabilityTracesMillion', value)}
              />
              <TextField
                label="Secrets"
                value={form.secretsCount}
                inputMode="numeric"
                suffix="items"
                error={fieldErrors.secretsCount}
                onChange={(value) => update('secretsCount', value)}
              />
              <TextField
                label="Secret API calls"
                value={form.secretApiCallsTenThousand}
                inputMode="decimal"
                suffix="10k/mo"
                error={fieldErrors.secretApiCallsTenThousand}
                onChange={(value) => update('secretApiCallsTenThousand', value)}
              />
              <TextField
                label="Security resources"
                value={form.securityProtectedResources}
                inputMode="numeric"
                suffix="items"
                error={fieldErrors.securityProtectedResources}
                onChange={(value) => update('securityProtectedResources', value)}
              />
              <TextField
                label="Security findings"
                value={form.securityFindingsThousand}
                inputMode="decimal"
                suffix="K/mo"
                error={fieldErrors.securityFindingsThousand}
                onChange={(value) => update('securityFindingsThousand', value)}
              />
              <TextField
                label="WAF ACLs"
                value={form.wafWebAclCount}
                inputMode="numeric"
                suffix="ACLs"
                error={fieldErrors.wafWebAclCount}
                onChange={(value) => update('wafWebAclCount', value)}
              />
              <TextField
                label="WAF rules"
                value={form.wafRuleCount}
                inputMode="numeric"
                suffix="rules"
                error={fieldErrors.wafRuleCount}
                onChange={(value) => update('wafRuleCount', value)}
              />
              <TextField
                label="WAF requests"
                value={form.wafRequestsMillion}
                inputMode="decimal"
                suffix="M/mo"
                error={fieldErrors.wafRequestsMillion}
                onChange={(value) => update('wafRequestsMillion', value)}
              />
              <TextField
                label="DDoS resources"
                value={form.ddosProtectedResources}
                inputMode="numeric"
                suffix="items"
                error={fieldErrors.ddosProtectedResources}
                onChange={(value) => update('ddosProtectedResources', value)}
              />
            </div>
          </details>
          <TextField
            label="SLA target"
            value={form.slaTarget}
            onChange={(value) => update('slaTarget', value)}
          />
          <TextField
            label="Compliance"
            value={form.complianceFrameworks}
            onChange={(value) => update('complianceFrameworks', value)}
          />
          <TextField label="Tags" value={form.tags} onChange={(value) => update('tags', value)} />
          <CheckboxField
            label="Residency lock"
            icon="multiRegion"
            checked={form.complianceLocked}
            onChange={(checked) => update('complianceLocked', checked)}
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

function ArchitectureTemplatePicker({
  compact = false,
  onApply,
}: {
  compact?: boolean;
  onApply: (template: ArchitectureTemplate) => void;
}) {
  return (
    <section
      className={
        compact
          ? 'architecture-template-picker architecture-template-picker-compact'
          : 'architecture-template-picker'
      }
      aria-label="Architecture templates"
    >
      <div className="architecture-template-heading">
        <span>Quick starts</span>
        <strong>Choose a complete architecture baseline</strong>
      </div>
      <div className="architecture-template-grid">
        {ARCHITECTURE_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className="architecture-template-button"
            onClick={() => onApply(template)}
          >
            <span>{template.label}</span>
            <small>{template.summary}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ComparisonHistoryPanel({
  entries,
  onRestore,
  onClear,
}: {
  entries: ComparisonHistoryEntry[];
  onRestore: (entry: ComparisonHistoryEntry) => void;
  onClear: () => void;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="comparison-history-panel" aria-label="Recent comparisons">
      <div className="comparison-history-heading">
        <div>
          <span>Recent comparisons</span>
          <strong>Resume a saved workload shape</strong>
        </div>
        <button type="button" className="comparison-history-clear" onClick={onClear}>
          Clear history
        </button>
      </div>
      <div className="comparison-history-list">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="comparison-history-row"
            onClick={() => onRestore(entry)}
          >
            <span className="comparison-history-main">
              <strong>{entry.summary}</strong>
              <small>
                {formatHistoryTimestamp(entry.createdAt)} · {entry.serviceCount} service
                {entry.serviceCount === 1 ? '' : 's'} · {entry.providerCount} providers
              </small>
            </span>
            <span
              className={`comparison-history-best comparison-history-best-${entry.cheapestProviderId}`}
            >
              {providerLabel(entry.cheapestProviderId)} best ·{' '}
              {formatCurrency(entry.monthlyLowestUsd)}
              /mo
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function FormValidationSummary({ issues }: { issues: WorkloadFormIssue[] }) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <div className="form-validation-summary" role="alert">
      <strong>
        Fix {issues.length} requirement field{issues.length === 1 ? '' : 's'}.
      </strong>{' '}
      <span>{issues.map((issue) => issue.message).join(' ')}</span>
    </div>
  );
}

function RequirementReviewCards({
  form,
  compact = false,
}: {
  form: WorkloadFormState;
  compact?: boolean;
}) {
  const requirements = serviceRequirementsFromForm(form);

  return (
    <section
      className={compact ? 'requirement-review-cards is-compact' : 'requirement-review-cards'}
      aria-label="Interpreted requirement review"
    >
      <div className="requirement-review-heading">
        <span>Review checkpoint</span>
        <strong>Interpreted services ready to price</strong>
      </div>
      <div className="requirement-review-grid">
        {requirements.map((requirement, index) => (
          <article
            key={`${requirement.serviceCategory}-${requirement.serviceType}-${index}`}
            className={`requirement-review-card requirement-review-card-${requirement.serviceCategory}`}
          >
            <span>{requirement.serviceCategory}</span>
            <strong>{requirement.serviceType}</strong>
            <small>
              Qty {requirement.quantity}
              {requirement.region ? ` · ${requirement.region}` : ''}
              {requirement.az ? ` · ${requirement.az}` : ''}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

function validationIssueMap(
  issues: WorkloadFormIssue[],
): Partial<Record<keyof WorkloadFormState, string>> {
  return issues.reduce<Partial<Record<keyof WorkloadFormState, string>>>((map, issue) => {
    map[issue.field] = issue.message;
    return map;
  }, {});
}

function TextField({
  label,
  value,
  inputMode,
  suffix,
  disabled,
  error,
  onChange,
}: {
  label: string;
  value: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  suffix?: string;
  disabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = toId(label);
  const errorId = `${id}-error`;
  return (
    <div className={error ? 'form-field is-invalid' : 'form-field'}>
      <label className="field-caption" htmlFor={id}>
        {label}
      </label>
      <span className={suffix ? 'field-control field-control-suffix' : 'field-control'}>
        <input
          id={id}
          value={value}
          inputMode={inputMode}
          disabled={disabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        {suffix ? <span className="field-suffix">{suffix}</span> : null}
      </span>
      {error ? (
        <span id={errorId} className="field-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  suffix,
  error,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  suffix?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = toId(label);
  const errorId = `${id}-error`;
  const numericValue = clampNumber(Number(value), min, max);

  return (
    <div className={error ? 'form-field range-field is-invalid' : 'form-field range-field'}>
      <label className="field-caption" htmlFor={id}>
        {label}
      </label>
      <div className="range-field-control">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={numericValue}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <strong>
          {numericValue}
          {suffix}
        </strong>
      </div>
      {error ? (
        <span id={errorId} className="field-error">
          {error}
        </span>
      ) : null}
    </div>
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
  compact = false,
  onChange,
}: {
  value: string;
  regionCatalog: RegionCatalogResponse | null;
  regionCatalogError: string | null;
  compact?: boolean;
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
  const selectedComparisonRegion = COMPARISON_REGION_GROUPS.find((group) => group.id === value);
  const selectedRegion = providerCatalogs
    .flatMap((provider) => provider.regions)
    .find((region) => region.id === value);
  const catalogLabel = regionCatalog
    ? providerCatalogs.some((provider) => provider.source === 'live')
      ? 'Live provider catalog'
      : 'Fallback provider catalog'
    : 'Loading live provider catalog';

  return (
    <label
      className={
        compact ? 'form-field region-field region-field-compact' : 'form-field region-field'
      }
      htmlFor="region"
    >
      <span className="region-field-header">
        <span className="field-caption">Region</span>
        {compact ? null : (
          <span
            className={regionCatalogError ? 'region-source-pill is-warning' : 'region-source-pill'}
          >
            {regionCatalogError ? 'Fallback' : regionCatalog ? 'Live' : 'Loading'}
          </span>
        )}
      </span>
      <select
        id="region"
        className="region-select"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {value && !selectedRegion && !selectedComparisonRegion ? (
          <option value={value}>Current selection: {value}</option>
        ) : null}
        <optgroup label="Comparable regions (priced peer groups)">
          {COMPARISON_REGION_GROUPS.map((group) => (
            <option key={group.id} value={group.id}>
              {group.label} - {providerRegionSummary(group)}
            </option>
          ))}
        </optgroup>
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
      {compact ? null : (
        <span className="field-help">
          {catalogLabel} · {regionCount} provider regions · comparable groups normalize AWS, Azure,
          and GCP pricing.
        </span>
      )}
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

interface BulkServiceDraftRow {
  line: string;
  query: string;
  quantity: string;
  tier: string;
  note: string;
  family?: CloudServiceFamily;
  status: 'matched' | 'unmatched';
}

function BulkServiceImporter({
  rows,
  selectedIds,
  error,
  onRowsChange,
}: {
  rows: BulkServiceRow[];
  selectedIds: string[];
  error?: string;
  onRowsChange: (rows: BulkServiceRow[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const previewRows = parseBulkServiceRows(draft);
  const matchedRows = previewRows.filter((row) => row.family);
  const selected = new Set(selectedIds);

  function addMatchedRows() {
    const nextRowsByFamily = new Map(rows.map((row) => [row.serviceFamilyId, row]));

    for (const row of matchedRows) {
      if (!row.family) {
        continue;
      }

      nextRowsByFamily.set(row.family.id, {
        id: nextRowsByFamily.get(row.family.id)?.id ?? bulkServiceRowId(),
        serviceFamilyId: row.family.id,
        quantity: positiveIntegerInput(row.quantity),
        tier: row.tier.trim(),
        note: row.note.trim(),
      });
    }

    onRowsChange(orderBulkServiceRows([...nextRowsByFamily.values()]));
    setDraft('');
  }

  function updateRow(id: string, patch: Partial<BulkServiceRow>) {
    onRowsChange(
      orderBulkServiceRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row))),
    );
  }

  function removeRow(id: string) {
    onRowsChange(rows.filter((row) => row.id !== id));
  }

  return (
    <section className={error ? 'bulk-service-importer is-invalid' : 'bulk-service-importer'}>
      <div className="bulk-service-heading">
        <div>
          <span>Bulk service import</span>
          <strong>Paste service rows from a spreadsheet</strong>
        </div>
        <small>Format: service, quantity, tier, notes</small>
      </div>

      <label className="bulk-service-input" htmlFor="bulk-service-input">
        <span className="field-caption">Paste service rows</span>
        <textarea
          id="bulk-service-input"
          value={draft}
          placeholder={'Managed Kubernetes, 3, production\nS3, 1, standard\nCloud CDN, 1'}
          aria-invalid={error ? 'true' : undefined}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
      </label>

      {error ? <span className="field-error">{error}</span> : null}

      {previewRows.length > 0 ? (
        <div className="bulk-service-preview" aria-label="Bulk service import preview">
          <div className="bulk-service-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Matched service</th>
                  <th>Qty</th>
                  <th>Tier</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.line} className={row.family ? 'is-matched' : 'is-unmatched'}>
                    <td>{row.query}</td>
                    <td>{row.family?.label ?? 'No catalog match'}</td>
                    <td>{positiveIntegerInput(row.quantity)}</td>
                    <td>{row.tier || 'default'}</td>
                    <td>
                      {row.family ? (selected.has(row.family.id) ? 'Selected' : 'Ready') : 'Review'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="bulk-service-add"
            disabled={matchedRows.length === 0}
            onClick={addMatchedRows}
          >
            Add matched services
          </button>
        </div>
      ) : null}

      <div className="bulk-service-current" aria-label="Imported service rows">
        <div className="bulk-service-current-heading">
          <span>Imported rows</span>
          <strong>{rows.length}</strong>
        </div>
        {rows.length > 0 ? (
          <div className="bulk-service-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Quantity</th>
                  <th>Tier</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const family = CLOUD_SERVICE_CATALOG.find(
                    (candidate) => candidate.id === row.serviceFamilyId,
                  );

                  return (
                    <tr key={row.id}>
                      <td>{family?.label ?? row.serviceFamilyId}</td>
                      <td>
                        <input
                          aria-label={`${family?.label ?? row.serviceFamilyId} quantity`}
                          value={row.quantity}
                          inputMode="numeric"
                          onChange={(event) =>
                            updateRow(row.id, { quantity: event.currentTarget.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${family?.label ?? row.serviceFamilyId} tier`}
                          value={row.tier}
                          onChange={(event) =>
                            updateRow(row.id, { tier: event.currentTarget.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${family?.label ?? row.serviceFamilyId} notes`}
                          value={row.note}
                          onChange={(event) =>
                            updateRow(row.id, { note: event.currentTarget.value })
                          }
                        />
                      </td>
                      <td>
                        <button type="button" onClick={() => removeRow(row.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No imported rows yet. Paste services above to add many catalog items at once.</p>
        )}
      </div>
    </section>
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

function formWithBulkServiceRows(
  form: WorkloadFormState,
  rows: BulkServiceRow[],
): WorkloadFormState {
  const previousBulkIds = new Set(form.bulkServiceRows.map((row) => row.serviceFamilyId));
  const nextBulkIds = rows.map((row) => row.serviceFamilyId);
  const nextSelectedIds = orderedServiceFamilyIds([
    ...form.selectedServiceFamilyIds.filter((id) => !previousBulkIds.has(id)),
    ...nextBulkIds,
  ]);
  const primaryServiceFamilyId = nextSelectedIds.includes(form.selectedServiceFamilyId)
    ? form.selectedServiceFamilyId
    : (nextBulkIds[0] ?? nextSelectedIds[0] ?? form.selectedServiceFamilyId);
  const primaryFamily = CLOUD_SERVICE_CATALOG.find(
    (family) => family.id === primaryServiceFamilyId,
  );

  return {
    ...form,
    bulkServiceRows: rows,
    selectedServiceFamilyIds: nextSelectedIds,
    selectedServiceFamilyId: primaryServiceFamilyId,
    selectedServiceCategory: primaryFamily?.categoryId ?? form.selectedServiceCategory,
  };
}

function parseBulkServiceRows(input: string): BulkServiceDraftRow[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => !isBulkServiceHeader(line, index))
    .map((line) => {
      const columns = splitBulkServiceLine(line);
      const query = columns[0]?.trim() ?? '';
      const quantity = columns[1]?.trim() ?? '1';
      const tier = columns[2]?.trim() ?? '';
      const note = columns.slice(3).join(' / ').trim();
      const family = matchServiceFamily(query);

      return {
        line,
        query,
        quantity,
        tier,
        note,
        family,
        status: family ? 'matched' : 'unmatched',
      };
    });
}

function isBulkServiceHeader(line: string, index: number): boolean {
  return index === 0 && /\bservice\b/i.test(line) && /\b(qty|quantity|tier)\b/i.test(line);
}

function splitBulkServiceLine(line: string): string[] {
  if (line.includes('\t')) {
    return line.split('\t');
  }

  if (line.includes('|')) {
    return line.split('|');
  }

  return line.split(',');
}

function matchServiceFamily(query: string): CloudServiceFamily | undefined {
  const normalizedQuery = normalizeServiceSearchText(query);

  if (!normalizedQuery) {
    return undefined;
  }

  const aliasId = SERVICE_FAMILY_ALIASES[normalizedQuery];
  if (aliasId) {
    return CLOUD_SERVICE_CATALOG.find((family) => family.id === aliasId);
  }

  return (
    CLOUD_SERVICE_CATALOG.find((family) =>
      [
        family.id,
        family.label,
        ...PROVIDER_ORDER.flatMap((providerId) => providerServicesForFamily(family, providerId)),
      ]
        .map(normalizeServiceSearchText)
        .some((candidate) => candidate === normalizedQuery),
    ) ??
    CLOUD_SERVICE_CATALOG.find((family) =>
      normalizeServiceSearchText(serviceFamilySearchText(family)).includes(normalizedQuery),
    )
  );
}

function serviceFamilySearchText(family: CloudServiceFamily): string {
  return [
    family.id,
    family.label,
    family.categoryId,
    ...PROVIDER_ORDER.flatMap((providerId) => providerServicesForFamily(family, providerId)),
  ].join(' ');
}

function normalizeServiceSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function orderBulkServiceRows(rows: BulkServiceRow[]): BulkServiceRow[] {
  const rowsByFamily = new Map(rows.map((row) => [row.serviceFamilyId, row]));

  return orderedServiceFamilyIds([...rowsByFamily.keys()])
    .map((id) => rowsByFamily.get(id))
    .filter((row): row is BulkServiceRow => Boolean(row));
}

function positiveIntegerInput(value: string): string {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : '1';
}

function bulkServiceRowId(): string {
  return `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function serviceCategoryOptions(): Array<[string, string]> {
  return SERVICE_CATALOG_CATEGORIES.map((category) => [category.id, category.label]);
}

function serviceFamilyOptions(categoryId: string): Array<[string, string]> {
  return CLOUD_SERVICE_CATALOG.filter((family) => family.categoryId === categoryId).map(
    (family) => [family.id, serviceFamilyOptionLabel(family)],
  );
}

function firstServiceFamilyIdForCategory(categoryId: string): string | undefined {
  return CLOUD_SERVICE_CATALOG.find((family) => family.categoryId === categoryId)?.id;
}

function serviceFamilyOptionLabel(family: CloudServiceFamily): string {
  const secondary = PROVIDER_ORDER.map(
    (providerId) => providerServicesForFamily(family, providerId)[0],
  )
    .filter(Boolean)
    .join(' / ');

  return `${family.label} - ${secondary}`;
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
): Record<'profile' | 'traffic' | 'compute' | 'scale' | 'services' | 'data', string> {
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
  const selectedServiceCount = new Set([
    form.selectedServiceFamilyId,
    ...form.selectedServiceFamilyIds,
  ]).size;

  return {
    profile: `${capitalize(form.environment)} / ${supportTierLabel(form.supportTier)}`,
    traffic: `${dailyUsers} daily / ${peakUsers} peak`,
    compute: `${formatDecimal(totalVcpu)} vCPU / ${formatDecimal(totalMemory)}GB`,
    scale:
      form.scalingType === 'autoscaling'
        ? `${formatDecimal(scaleMin)}-${formatDecimal(scaleMax)} nodes`
        : `${formatDecimal(instances)} fixed`,
    services: `${selectedServiceCount}/${CLOUD_SERVICE_CATALOG.length} families`,
    data: `${storageText} / ${databaseText}`,
  };
}

function compactRequirementSummary(
  form: WorkloadFormState,
  regionCatalog: RegionCatalogResponse | null,
): string {
  const workload = workloadTypeLabel(form.workloadType);
  const vcpu = form.vcpu.trim() || '0';
  const memory = form.memoryGb.trim() || '0';
  const region = regionLabelForSummary(form.regionPreference, regionCatalog);
  const service = serviceFamilyShortLabel(form.selectedServiceFamilyId);

  return `${workload} · ${service} · ${vcpu} vCPU · ${memory}GB · ${region}`;
}

function serviceFamilyShortLabel(serviceFamilyId: string): string {
  return (
    CLOUD_SERVICE_CATALOG.find((family) => family.id === serviceFamilyId)?.label ??
    'Selected service'
  );
}

function workloadTypeLabel(type: WorkloadFormState['workloadType']): string {
  switch (type) {
    case 'web_app':
      return 'Web app';
    case 'api_backend':
      return 'API backend';
    case 'static_site':
      return 'Static site';
    case 'batch_processing':
      return 'Batch processing';
    case 'data_pipeline':
      return 'Data pipeline';
    case 'ml_workload':
      return 'ML workload';
    case 'other':
      return 'General-purpose';
  }
}

function supportTierLabel(supportTier: WorkloadFormState['supportTier']): string {
  switch (supportTier) {
    case 'none':
      return 'No support';
    case 'developer':
      return 'Developer support';
    case 'business':
      return 'Business support';
    case 'enterprise':
      return 'Enterprise support';
  }
}

function regionLabelForSummary(value: string, regionCatalog: RegionCatalogResponse | null): string {
  const comparisonLabel = comparisonRegionLabel(value);

  if (comparisonLabel) {
    return comparisonLabel;
  }

  const catalog = regionCatalog ?? FALLBACK_REGION_CATALOG;
  const region = catalog.providers
    .flatMap((provider) => provider.regions)
    .find((candidate) => candidate.id === value);

  return region ? region.label : value || 'Default region';
}

function parseFormNumber(value: string): number | undefined {
  const parsed = Number(value.replace(/,/g, '').trim());

  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
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
            loadingLabel={`Generating ${label}...`}
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
  client = polyCostClient,
  comparison,
  error = null,
  exportingFormat = null,
  form = defaultWorkloadForm,
  interval,
  isLoading = false,
  pricingModel = 'on-demand',
  onExport,
}: {
  client?: PolyCostClient;
  comparison: ComparisonResult | null;
  error?: string | null;
  exportingFormat?: ReportFormat | null;
  interval: IntervalKey;
  form?: WorkloadFormState;
  isLoading?: boolean;
  pricingModel?: PricingModelKey;
  onExport?: (format: ReportFormat) => void;
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
          <ExecutiveOverview
            comparison={comparison}
            exportingFormat={exportingFormat}
            form={form}
            isLoading={isLoading}
            pricingModel={pricingModel}
            onExport={onExport}
          />
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
          <EngineeringAnalyticsDashboard comparison={comparison} interval={interval} />
          <ArchitectureWorkspace comparison={comparison} interval={interval} form={form} />
          <ServiceCheapestMatrix comparison={comparison} interval={interval} />
          <ProductionDepthAnalytics comparison={comparison} form={form} />
          <FullCostMatrixTable comparison={comparison} />
          <CostFormulaEvidence comparison={comparison} />
          <FinOpsFeatureLayer
            client={client}
            comparison={comparison}
            form={form}
            interval={interval}
            isLoading={isLoading}
          />
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
  exportingFormat,
  form,
  isLoading,
  pricingModel,
  onExport,
}: {
  comparison: ComparisonResult | null;
  exportingFormat?: ReportFormat | null;
  form: WorkloadFormState;
  isLoading?: boolean;
  pricingModel: PricingModelKey;
  onExport?: (format: ReportFormat) => void;
}) {
  return (
    <section className="demo-overview" aria-label="Executive analytics overview">
      <ExecutiveAnalyticsPreview comparison={comparison} form={form} pricingModel={pricingModel} />
      <ExecutiveDecisionDashboard
        comparison={comparison}
        form={form}
        regionCatalog={null}
        exportingFormat={exportingFormat ?? null}
        isLoading={Boolean(isLoading)}
        onExport={onExport}
      />
    </section>
  );
}

function ExecutiveAnalyticsPreview({
  comparison,
  form,
  pricingModel,
}: {
  comparison: ComparisonResult | null;
  form: WorkloadFormState;
  pricingModel: PricingModelKey;
}) {
  const analytics = executiveAnalyticsModel(comparison, form);
  const pricedCount = analytics.pricedMonthlySummaries.length;
  const totalMonthly = analytics.totalMonthlyAcrossProviders;

  return (
    <section className="executive-analytics-preview" aria-label="Executive analytics dashboard">
      <ExecutiveProviderHero comparison={comparison} pricingModel={pricingModel} />

      <article className="executive-headline-card">
        <div className="executive-card-heading">
          <span>Executive monthly baseline</span>
          <strong>Total across priced clouds</strong>
        </div>
        <div className="executive-headline-value">
          {totalMonthly !== undefined ? formatCurrency(totalMonthly) : 'Pending'}
        </div>
        <p>
          {pricedCount > 0
            ? `${pricedCount}/3 provider estimates priced for this workload.`
            : 'Run a comparison to calculate provider estimates.'}
        </p>
        <div className="executive-trend-pending" role="status">
          <span>Trend pending</span>
          <strong>Historical spend data not yet available</strong>
          <div className="executive-pending-sparkline" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </article>

      <article className="executive-provider-mix-card">
        <div className="executive-card-heading">
          <span>Provider mix</span>
          <strong>Share of current estimates</strong>
        </div>
        <ProviderMixDonut data={analytics.providerMix} />
      </article>

      <ExecutivePricingModelBars comparison={comparison} />

      <div className="executive-stat-grid" aria-label="Executive compact stats">
        <ExecutiveStatTile
          label="Cheapest provider"
          value={analytics.cheapest ? providerLabel(analytics.cheapest.providerId) : 'Pending'}
          detail={
            analytics.cheapest?.total !== undefined
              ? `${formatCurrency(analytics.cheapest.total)} monthly`
              : 'Awaiting provider totals'
          }
          providerId={analytics.cheapest?.providerId}
        />
        <ExecutiveStatTile
          label="90-day forecast"
          value="Pending"
          detail="Backend trend series required"
        />
        <ExecutiveStatTile
          label="Potential savings"
          value={
            analytics.annualPotentialSavings !== undefined && analytics.annualPotentialSavings > 0
              ? formatCurrency(analytics.annualPotentialSavings)
              : 'Pending'
          }
          detail={
            analytics.annualPotentialSavings !== undefined && analytics.annualPotentialSavings > 0
              ? 'Annual spread vs highest estimate'
              : 'Need at least two priced clouds'
          }
        />
      </div>
    </section>
  );
}

function ExecutiveDecisionDashboard({
  comparison,
  form,
  regionCatalog,
  exportingFormat,
  isLoading,
  onExport,
}: {
  comparison: ComparisonResult | null;
  form: WorkloadFormState;
  regionCatalog: RegionCatalogResponse | null;
  exportingFormat: ReportFormat | null;
  isLoading: boolean;
  onExport?: (format: ReportFormat) => void;
}) {
  const analytics = executiveAnalyticsModel(comparison, form);
  const decision = analytics.review.executiveDecision;
  const recommendation = executiveRecommendation(analytics, form, regionCatalog);

  return (
    <section className="executive-decision-dashboard" aria-label="Executive decision dashboard">
      <div className="executive-detail-grid">
        <article className="executive-recommendation-card">
          <div className="executive-card-heading">
            <span>Recommendation</span>
            <strong>{decision.confidence} confidence</strong>
          </div>
          <h3>{recommendation.headline}</h3>
          <p>{recommendation.detail}</p>
          <div className="executive-recommendation-actions">
            <Button
              type="button"
              variant="primary"
              disabled={
                !comparison ||
                isLoading ||
                !onExport ||
                (exportingFormat !== null && exportingFormat !== 'pdf')
              }
              loading={exportingFormat === 'pdf'}
              loadingLabel="Exporting summary..."
              onClick={() => onExport?.('pdf')}
            >
              <DownloadIcon />
              Export summary
            </Button>
          </div>
        </article>

        <article className="executive-data-gap-card">
          <div className="executive-card-heading">
            <span>Trend & forecast</span>
            <strong>Pending backend series</strong>
          </div>
          <div className="executive-data-gap-chart" role="status">
            <span>Trend data not yet available</span>
            <p>
              PolyCost has current comparison totals, but no exposed historical cost series or
              forecast endpoint yet. Sparkline and 90-day forecast stay pending instead of showing
              fabricated data.
            </p>
          </div>
        </article>
      </div>

      <div className="executive-lens-grid" aria-label="Executive decision lenses">
        {decision.lenses.slice(0, 3).map((lens) => (
          <article
            className={`executive-lens-card lens-${roleClassName(lens.role)}`}
            key={lens.role}
          >
            <span>{lens.label}</span>
            <strong>{lens.value}</strong>
            <p>{lens.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ExecutiveProviderHero({
  comparison,
  pricingModel,
}: {
  comparison: ComparisonResult | null;
  pricingModel: PricingModelKey;
}) {
  const providers = PROVIDER_ORDER.map((providerId) =>
    comparison?.providers.find((provider) => provider.providerId === providerId),
  );
  const pricedProviders = providers.filter((provider): provider is ComparisonProviderResult =>
    Boolean(provider),
  );
  const monthlyCosts = pricedProviders
    .map((provider) => executiveModelMonthlyCost(provider, pricingModel))
    .filter((cost): cost is number => cost !== undefined);
  const highest = Math.max(...monthlyCosts, 0);
  const lowest = Math.min(...monthlyCosts, highest || 0);

  return (
    <section className="executive-provider-hero" aria-label="Executive provider monthly cards">
      {PROVIDER_ORDER.map((providerId) => {
        const provider = providers.find((candidate) => candidate?.providerId === providerId);
        const monthly = provider ? executiveModelMonthlyCost(provider, pricingModel) : undefined;
        const isLowest = monthly !== undefined && monthly === lowest && monthlyCosts.length > 0;
        const deltaPercent =
          monthly !== undefined && lowest > 0 ? ((monthly - lowest) / lowest) * 100 : undefined;

        return (
          <article
            key={providerId}
            className={`executive-provider-card executive-provider-card-${providerId}`}
          >
            <span>{providerLabel(providerId)}</span>
            <strong>{monthly !== undefined ? formatCurrency(monthly) : 'Unavailable'}</strong>
            <small>
              {isLowest
                ? 'Best value'
                : deltaPercent !== undefined
                  ? `${formatPercent(deltaPercent)} over lowest`
                  : 'Pricing pending'}
            </small>
            <em>{pricingModelSummaryLabel(pricingModel)}</em>
          </article>
        );
      })}
    </section>
  );
}

function ExecutivePricingModelBars({ comparison }: { comparison: ComparisonResult | null }) {
  const models: PricingModelKey[] = ['on-demand', 'reserved-1yr', 'reserved-3yr'];
  const rows =
    comparison?.providers.map((provider) => ({
      providerId: provider.providerId,
      values: models.map((model) => ({
        model,
        monthly: executiveModelMonthlyCost(provider, model),
      })),
    })) ?? [];
  const maxMonthly = Math.max(
    ...rows.flatMap((row) =>
      row.values.map((value) => (value.monthly !== undefined ? value.monthly : 0)),
    ),
    1,
  );

  return (
    <article className="executive-pricing-bars" aria-label="Pricing model comparison bar">
      <div className="executive-card-heading">
        <span>Pricing model comparison</span>
        <strong>On-demand vs commitments</strong>
      </div>
      <div className="executive-pricing-bar-grid">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div className="executive-pricing-row" key={row.providerId}>
              <span>{providerLabel(row.providerId)}</span>
              <div className="executive-pricing-bar-stack">
                {row.values.map((value) => (
                  <span
                    key={`${row.providerId}-${value.model}`}
                    className={`executive-pricing-bar executive-pricing-${row.providerId}`}
                    style={{
                      inlineSize: `${Math.max(6, ((value.monthly ?? 0) / maxMonthly) * 100)}%`,
                    }}
                    title={`${providerLabel(row.providerId)} ${pricingModelSummaryLabel(
                      value.model,
                    )}: ${
                      value.monthly !== undefined ? formatCurrency(value.monthly) : 'Unavailable'
                    } monthly`}
                  >
                    <i>{costMatrixPricingModelLabel(value.model)}</i>
                    <b>{value.monthly !== undefined ? formatCurrency(value.monthly) : 'N/A'}</b>
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p>Run a comparison to populate pricing-model bars.</p>
        )}
      </div>
    </article>
  );
}

function executiveModelMonthlyCost(
  provider: ComparisonProviderResult,
  pricingModel: PricingModelKey,
): number | undefined {
  if (pricingModel === 'on-demand') {
    return provider.totals.monthly;
  }

  const model = provider.pricingModels?.find((candidate) => candidate.model === pricingModel);

  return model?.available ? model.monthlyCostUsd : undefined;
}

function ProviderMixDonut({ data }: { data: ProviderMixDatum[] }) {
  if (data.length === 0) {
    return (
      <div className="provider-mix-empty" role="status">
        Provider mix pending until comparison totals are available.
      </div>
    );
  }

  return (
    <div className="provider-mix-layout">
      <div className="provider-mix-chart-shell" aria-hidden="true">
        <PieChart width={220} height={220}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={3}
            stroke="var(--pc-bg-surface)"
            strokeWidth={4}
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell fill={entry.color} key={entry.providerId} />
            ))}
          </Pie>
        </PieChart>
      </div>
      <div className="provider-mix-legend">
        {data.map((entry) => (
          <span key={entry.providerId}>
            <i className={`provider-dot provider-fill-${entry.providerId}`} aria-hidden="true" />
            <strong>{entry.name}</strong>
            <small>
              {formatCurrency(entry.value)} · {formatPercent(entry.percent)}
            </small>
          </span>
        ))}
      </div>
    </div>
  );
}

function ExecutiveStatTile({
  detail,
  label,
  providerId,
  value,
}: {
  detail: string;
  label: string;
  providerId?: ProviderId;
  value: string;
}) {
  return (
    <article
      className={
        providerId ? `executive-stat-tile executive-stat-${providerId}` : 'executive-stat-tile'
      }
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function EngineeringAnalyticsPreview({
  comparison,
  interval,
}: {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
}) {
  const analytics = engineeringAnalyticsModel(comparison, interval);

  return (
    <section className="engineering-analytics-preview" aria-label="Engineering analytics dashboard">
      <div className="engineering-preview-header">
        <div>
          <span>Engineering service spend</span>
          <h3>Cost-by-service concentration</h3>
        </div>
        <strong>{capitalize(interval)} view</strong>
      </div>

      <EngineeringServiceChartGrid analytics={analytics} compact />

      <div className="engineering-signal-strip" aria-label="Engineering data signals">
        <EngineeringSignal
          label="Line items"
          value={analytics.totalLineItems > 0 ? String(analytics.totalLineItems) : 'Pending'}
          detail="Provider-returned cost drivers"
        />
        <EngineeringSignal
          label="Approximate mappings"
          value={String(analytics.approximateCount)}
          detail="Require architecture review"
          tone={analytics.approximateCount > 0 ? 'review' : 'ready'}
        />
        <EngineeringSignal
          label="Top driver"
          value={
            analytics.topDriver
              ? `${providerServiceLabel(
                  analytics.topDriver.providerId,
                  analytics.topDriver.service.category,
                )}`
              : 'Pending'
          }
          detail={
            analytics.topDriver
              ? `${providerLabel(analytics.topDriver.providerId)} · ${formatCurrency(
                  analytics.topDriver.service.value,
                )}`
              : 'Awaiting provider costs'
          }
          providerId={analytics.topDriver?.providerId}
        />
      </div>
    </section>
  );
}

function EngineeringAnalyticsDashboard({
  comparison,
  interval,
}: {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
}) {
  const analytics = engineeringAnalyticsModel(comparison, interval);

  return (
    <section className="engineering-analytics-dashboard" aria-label="Engineering service dashboard">
      <div className="engineering-dashboard-heading">
        <div>
          <span>Service driver split</span>
          <h3>Provider cost by mapped service family</h3>
        </div>
        <p>
          Bars are calculated from the current comparison line items. SKU, exact region, and tag
          metadata stay with the resource table until the API exposes those per row.
        </p>
      </div>

      <EngineeringServiceChartGrid analytics={analytics} />
    </section>
  );
}

function ServiceCheapestMatrix({
  comparison,
  interval,
}: {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
}) {
  const rows = serviceCheapestRows(comparison, interval);

  return (
    <section className="service-cheapest-matrix" aria-label="Cheapest provider by service">
      <div className="engineering-dashboard-heading">
        <div>
          <span>Cheapest by service</span>
          <h3>Per-service decision matrix</h3>
        </div>
        <p>
          Each row uses the same provider line items as the dashboard and flags approximate service
          mappings for architecture review.
        </p>
      </div>
      <div className="table-wrap">
        <table className="ranking-table service-matrix-table">
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Cheapest</th>
              <th scope="col">Cost</th>
              <th scope="col">Coverage</th>
              <th scope="col">Caveat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category}>
                <td>{capitalize(row.category)}</td>
                <td>{row.providerId ? providerLabel(row.providerId) : 'Pending'}</td>
                <td>{row.cost !== undefined ? formatCurrency(row.cost) : 'Pending'}</td>
                <td>{row.coverage}</td>
                <td>{row.caveat}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductionDepthAnalytics({
  comparison,
  form,
}: {
  comparison: ComparisonResult | null;
  form: WorkloadFormState;
}) {
  const insights = productionDepthInsights(comparison, form);
  const scenarios = sensitivityScenarioRows(comparison, form);

  return (
    <section className="production-depth-analytics" aria-label="Production-depth analytics">
      <div className="engineering-dashboard-heading">
        <div>
          <span>Production-depth analytics</span>
          <h3>FinOps, architecture, and finance decision signals</h3>
        </div>
        <p>
          These cards are derived from the current comparison, workload profile, pricing models,
          line items, and explicit modeled assumptions.
        </p>
      </div>
      <div className="production-depth-grid">
        {insights.map((insight) => (
          <article
            className={`production-depth-card production-depth-${insight.tone}`}
            key={insight.label}
          >
            <span>{insight.label}</span>
            <strong>{insight.value}</strong>
            <p>{insight.detail}</p>
          </article>
        ))}
      </div>
      <ScenarioSensitivityTable rows={scenarios} />
    </section>
  );
}

function ScenarioSensitivityTable({ rows }: { rows: SensitivityScenarioRow[] }) {
  const winCounts = scenarioWinCounts(rows);

  return (
    <div className="scenario-sensitivity" aria-label="Scenario sensitivity analysis">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Scenario sensitivity</span>
          <h4>Provider winner under operational shocks</h4>
        </div>
        <div className="scenario-win-strip" aria-label="Scenario win count">
          {PROVIDER_ORDER.map((providerId) => (
            <span className={`scenario-win scenario-win-${providerId}`} key={providerId}>
              {providerLabel(providerId)}
              <strong>{winCounts.get(providerId) ?? 0}</strong>
            </span>
          ))}
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="table-wrap scenario-sensitivity-wrap">
          <table className="ranking-table scenario-sensitivity-table">
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                <th scope="col">Assumption</th>
                {PROVIDER_ORDER.map((providerId) => (
                  <th scope="col" key={providerId}>
                    {providerLabel(providerId)}
                  </th>
                ))}
                <th scope="col">Low</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>{row.assumption}</td>
                  {PROVIDER_ORDER.map((providerId) => {
                    const provider = row.providers.find(
                      (candidate) => candidate.providerId === providerId,
                    );

                    return (
                      <td
                        className={
                          provider?.isLowest
                            ? `scenario-low scenario-low-${provider.providerId}`
                            : undefined
                        }
                        key={`${row.id}-${providerId}`}
                      >
                        {provider ? (
                          <>
                            <strong>{formatCurrency(provider.monthlyCostUsd)}</strong>
                            <small>{formatSignedCurrency(provider.deltaVsBaselineUsd)}</small>
                          </>
                        ) : (
                          'N/A'
                        )}
                      </td>
                    );
                  })}
                  <td>
                    {row.lowestProviderId ? (
                      <span className={`scenario-low-label scenario-low-${row.lowestProviderId}`}>
                        {providerLabel(row.lowestProviderId)}
                      </span>
                    ) : (
                      'Pending'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Run a comparison to populate provider-by-provider sensitivity analysis.
        </div>
      )}
    </div>
  );
}

function FullCostMatrixTable({ comparison }: { comparison: ComparisonResult | null }) {
  const [categoryFilter, setCategoryFilter] = useState<CostMatrixCategoryFilter>('all');
  const [providerFilter, setProviderFilter] = useState<CostMatrixProviderFilter>('all');
  const [pricingModelFilter, setPricingModelFilter] = useState<CostMatrixPricingModelFilter>('all');
  const [sortBy, setSortBy] = useState<CostMatrixSortKey>('service');
  const visibleProviders =
    providerFilter === 'all'
      ? PROVIDER_ORDER
      : PROVIDER_ORDER.filter((providerId) => providerId === providerFilter);
  const visiblePricingModels =
    pricingModelFilter === 'all'
      ? PRICING_MODEL_OPTIONS
      : PRICING_MODEL_OPTIONS.filter((model) => model.key === pricingModelFilter);
  const rows = fullCostMatrixRows(comparison);
  const visibleRows = rows
    .filter((row) => categoryFilter === 'all' || row.category === categoryFilter)
    .sort((left, right) => compareCostMatrixRows(left, right, sortBy));

  return (
    <section className="full-cost-matrix" aria-label="Full cost matrix">
      <div className="engineering-dashboard-heading">
        <div>
          <span>Full cost matrix</span>
          <h3>Service x provider x pricing model</h3>
        </div>
        <p>
          This is the engineering audit view for scenario tradeoffs. Empty cells mean the current
          backend response did not publish that service-level pricing model.
        </p>
      </div>

      <div className="cost-matrix-controls" aria-label="Cost matrix controls">
        <label>
          <span>Category</span>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as CostMatrixCategoryFilter)}
          >
            <option value="all">All services</option>
            {SERVICE_CATEGORIES.map((category) => (
              <option value={category} key={category}>
                {capitalize(category)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Provider</span>
          <select
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value as CostMatrixProviderFilter)}
          >
            <option value="all">All providers</option>
            {PROVIDER_ORDER.map((providerId) => (
              <option value={providerId} key={providerId}>
                {providerLabel(providerId)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Pricing model</span>
          <select
            value={pricingModelFilter}
            onChange={(event) =>
              setPricingModelFilter(event.target.value as CostMatrixPricingModelFilter)
            }
          >
            <option value="all">All models</option>
            {PRICING_MODEL_OPTIONS.map((model) => (
              <option value={model.key} key={model.key}>
                {model.shortLabel}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as CostMatrixSortKey)}
          >
            <option value="service">Service order</option>
            {PROVIDER_ORDER.flatMap((providerId) =>
              PRICING_MODEL_OPTIONS.map((model) => (
                <option
                  value={costMatrixSortKey(providerId, model.key)}
                  key={`${providerId}-${model.key}`}
                >
                  {providerLabel(providerId)} {costMatrixPricingModelLabel(model.key)}
                </option>
              )),
            )}
          </select>
        </label>
      </div>

      <div className="table-wrap cost-matrix-wrap">
        <table className="ranking-table cost-matrix-table">
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Category</th>
              <th scope="col">Confidence</th>
              {visibleProviders.flatMap((providerId) =>
                visiblePricingModels.map((model) => (
                  <th scope="col" key={`${providerId}-${model.key}`}>
                    {providerLabel(providerId)} {costMatrixPricingModelLabel(model.key)}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length > 0 ? (
              visibleRows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <span className="matrix-service-label">{row.service}</span>
                  </td>
                  <td>{capitalize(row.category)}</td>
                  <td>{row.approximate ? 'Approximate' : 'Mapped'}</td>
                  {visibleProviders.flatMap((providerId) =>
                    visiblePricingModels.map((model) => (
                      <td key={`${row.key}-${providerId}-${model.key}`}>
                        <CostMatrixValue cell={costMatrixCellFromRow(row, providerId, model.key)} />
                      </td>
                    )),
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3 + visibleProviders.length * visiblePricingModels.length}>
                  No services match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CostMatrixValue({ cell }: { cell: CostMatrixCell }) {
  if (!cell.available || cell.monthlyCostUsd === undefined) {
    return (
      <span className="matrix-unavailable" title={cell.caveat}>
        N/A
      </span>
    );
  }

  return (
    <span className={cell.estimated ? 'matrix-estimated' : undefined} title={cell.caveat}>
      {formatCurrency(cell.monthlyCostUsd)}
      {cell.estimated ? ' est.' : ''}
    </span>
  );
}

interface CostMatrixCell {
  available: boolean;
  monthlyCostUsd?: number;
  estimated?: boolean;
  caveat?: string;
}

interface FullCostMatrixRow {
  key: string;
  service: string;
  category: ServiceCategory;
  approximate: boolean;
  sortCosts: Array<{
    providerId: ProviderId;
    monthlyCostUsd: number;
  }>;
  providerModelCosts: Array<{
    providerId: ProviderId;
    modelCosts: Array<{
      pricingModel: PricingModelKey;
      cell: CostMatrixCell;
    }>;
  }>;
}

function fullCostMatrixRows(comparison: ComparisonResult | null): FullCostMatrixRow[] {
  if (!comparison) {
    return [];
  }

  const providersById = new Map<ProviderId, ComparisonProviderResult>(
    comparison.providers.map((provider) => [provider.providerId, provider]),
  );
  const rowCount = Math.max(
    ...comparison.providers.map((provider) => provider.lineItems.length),
    0,
  );

  return Array.from({ length: rowCount }, (_, index) => {
    const firstLineItem = PROVIDER_ORDER.map((providerId) =>
      providersById.get(providerId)?.lineItems.at(index),
    ).find((lineItem): lineItem is ComparisonLineItem => Boolean(lineItem));
    const category = firstLineItem?.category ?? 'compute';
    const service = firstLineItem
      ? `${capitalize(firstLineItem.category)} - ${firstLineItem.description}`
      : `Service row ${index + 1}`;
    const sortCosts: FullCostMatrixRow['sortCosts'] = [];
    let approximate = firstLineItem?.isApproximate ?? false;
    const providerModelCosts = PROVIDER_ORDER.map((providerId) => {
      const lineItem = providersById.get(providerId)?.lineItems.at(index);

      if (lineItem) {
        approximate = approximate || lineItem.isApproximate;
        sortCosts.push({ providerId, monthlyCostUsd: lineItem.baseMonthlyCostUsd });
      }

      return {
        providerId,
        modelCosts: PRICING_MODEL_OPTIONS.map((model) => ({
          pricingModel: model.key,
          cell: lineItem
            ? costMatrixCellForLineItem(lineItem, model.key)
            : missingCostMatrixCell('No matching service line item in this provider response.'),
        })),
      };
    });

    return {
      key: `${index}-${category}-${service}`,
      service,
      category,
      approximate,
      sortCosts,
      providerModelCosts,
    };
  });
}

function missingCostMatrixCell(caveat: string): CostMatrixCell {
  return {
    available: false,
    caveat,
  };
}

function costMatrixCellFromRow(
  row: FullCostMatrixRow,
  providerId: ProviderId,
  pricingModel: PricingModelKey,
): CostMatrixCell {
  return (
    row.providerModelCosts
      .find((provider) => provider.providerId === providerId)
      ?.modelCosts.find((model) => model.pricingModel === pricingModel)?.cell ??
    missingCostMatrixCell('Pricing model unavailable for this row.')
  );
}

function costMatrixCellForLineItem(
  lineItem: ComparisonLineItem,
  pricingModel: PricingModelKey,
): CostMatrixCell {
  if (pricingModel === 'on-demand') {
    return {
      available: true,
      monthlyCostUsd: lineItem.baseMonthlyCostUsd,
      caveat: 'Base monthly line item cost.',
    };
  }

  const model = lineItem.pricingModels?.find((candidate) => candidate.model === pricingModel);

  if (!model) {
    return {
      available: false,
      caveat: 'Service-level pricing model not present in the backend response.',
    };
  }

  if (!model.available || model.monthlyCostUsd === undefined) {
    return {
      available: false,
      caveat: model.unavailableReason ?? model.caveat ?? 'Pricing model unavailable.',
    };
  }

  return {
    available: true,
    monthlyCostUsd: model.monthlyCostUsd,
    estimated: model.estimated,
    caveat: model.caveat ?? model.providerTerm ?? model.displayName,
  };
}

function compareCostMatrixRows(
  left: FullCostMatrixRow,
  right: FullCostMatrixRow,
  sortBy: CostMatrixSortKey,
): number {
  if (sortBy === 'service') {
    return left.service.localeCompare(right.service);
  }

  const parsed = parseCostMatrixSortKey(sortBy);

  if (!parsed) {
    return left.service.localeCompare(right.service);
  }

  return (
    costMatrixSortCost(left, parsed.providerId, parsed.pricingModel) -
    costMatrixSortCost(right, parsed.providerId, parsed.pricingModel)
  );
}

function costMatrixSortKey(
  providerId: ProviderId,
  pricingModel: PricingModelKey,
): CostMatrixSortKey {
  return `${providerId}:${pricingModel}`;
}

function parseCostMatrixSortKey(
  sortBy: CostMatrixSortKey,
): { providerId: ProviderId; pricingModel: PricingModelKey } | null {
  const [providerId, pricingModel] = sortBy.split(':');

  if (!isProviderId(providerId) || !isPricingModelKey(pricingModel)) {
    return null;
  }

  return { providerId, pricingModel };
}

function isProviderId(value: string): value is ProviderId {
  return PROVIDER_ORDER.some((providerId) => providerId === value);
}

function isPricingModelKey(value: string): value is PricingModelKey {
  return PRICING_MODEL_OPTIONS.some((model) => model.key === value);
}

function costMatrixSortCost(
  row: FullCostMatrixRow,
  providerId: ProviderId,
  pricingModel: PricingModelKey,
): number {
  return (
    costMatrixCellFromRow(row, providerId, pricingModel).monthlyCostUsd ?? Number.POSITIVE_INFINITY
  );
}

function costMatrixPricingModelLabel(pricingModel: PricingModelKey): string {
  switch (pricingModel) {
    case 'on-demand':
      return 'On-demand';
    case 'reserved-1yr':
      return '1yr';
    case 'reserved-3yr':
      return '3yr';
    case 'savings-plan':
      return 'Savings';
    case 'spot':
      return 'Spot';
  }
}

function CostFormulaEvidence({ comparison }: { comparison: ComparisonResult | null }) {
  const rows = costFormulaRows(comparison);

  return (
    <section className="cost-formula-evidence" aria-label="Cost calculation evidence">
      <div className="engineering-dashboard-heading">
        <div>
          <span>Calculation evidence</span>
          <h3>Rate x quantity x time</h3>
        </div>
        <p>
          Monthly totals are derived from cached rates and the shared 730-hours/month constant; no
          request-time cloud calculator calls are made.
        </p>
      </div>
      <div className="formula-evidence-grid">
        {rows.map((row) => (
          <article className={`formula-evidence-card formula-${row.providerId}`} key={row.key}>
            <span>
              {providerLabel(row.providerId)} · {capitalize(row.category)}
            </span>
            <strong>{row.description}</strong>
            <p>{row.formula}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function serviceCheapestRows(
  comparison: ComparisonResult | null,
  interval: IntervalKey,
): Array<{
  category: ServiceCategory;
  providerId?: ProviderId;
  cost?: number;
  coverage: string;
  caveat: string;
}> {
  return SERVICE_CATEGORIES.map((category) => {
    const candidates =
      comparison?.providers
        .map((provider) => {
          const categoryCost = provider.lineItems
            .filter((lineItem) => lineItem.category === category)
            .reduce(
              (sum, lineItem) =>
                sum + lineItem.baseMonthlyCostUsd * intervalMultiplierFromMonthly(interval),
              0,
            );
          const approximate = provider.lineItems.some(
            (lineItem) => lineItem.category === category && lineItem.isApproximate,
          );

          return {
            providerId: provider.providerId,
            cost: categoryCost,
            approximate,
          };
        })
        .filter((candidate) => candidate.cost > 0) ?? [];
    const cheapest = [...candidates].sort((left, right) => left.cost - right.cost)[0];

    return {
      category,
      providerId: cheapest?.providerId,
      cost: cheapest?.cost,
      coverage: `${candidates.length}/3 providers`,
      caveat: cheapest
        ? cheapest.approximate
          ? 'Approximate service mapping; validate fit.'
          : 'Exact mapped line item.'
        : 'No priced line item for this service.',
    };
  });
}

interface ProductionDepthInsight {
  label: string;
  value: string;
  detail: string;
  tone: 'good' | 'review' | 'risk';
}

interface SensitivityScenarioProviderCost {
  providerId: ProviderId;
  monthlyCostUsd: number;
  deltaVsBaselineUsd: number;
  isLowest: boolean;
}

interface SensitivityScenarioRow {
  id: string;
  label: string;
  assumption: string;
  providers: SensitivityScenarioProviderCost[];
  lowestProviderId?: ProviderId;
}

function productionDepthInsights(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): ProductionDepthInsight[] {
  const providers = comparison?.providers ?? [];
  const pricedProviders = [...providers].sort(
    (left, right) => left.totals.monthly - right.totals.monthly,
  );
  const lowest = pricedProviders[0];
  const highest = pricedProviders.at(-1);

  if (!lowest) {
    return [
      {
        label: 'Production model',
        value: 'Pending',
        detail: 'Run a comparison to populate executive, engineering, and finance signals.',
        tone: 'review',
      },
    ];
  }

  const spread =
    highest && highest.providerId !== lowest.providerId
      ? highest.totals.monthly - lowest.totals.monthly
      : 0;
  const modeledAssumptions =
    componentMonthly(lowest, 'support') +
    componentMonthly(lowest, 'licensing') +
    componentMonthly(lowest, 'operations');
  const bestCommitment = bestCommitmentModel(lowest);
  const breakEvenMonths =
    bestCommitment?.model.upfrontCostUsd && bestCommitment.monthlySavings > 0
      ? bestCommitment.model.upfrontCostUsd / bestCommitment.monthlySavings
      : undefined;
  const spotModel = lowest.pricingModels?.find((model) => model.model === 'spot');
  const spotBlendMonthly =
    spotModel?.available && spotModel.monthlyCostUsd !== undefined
      ? lowest.totals.monthly * 0.7 + spotModel.monthlyCostUsd * 0.3
      : undefined;
  const computeMonthly = componentMonthly(lowest, 'compute');
  const storageMonthly = componentMonthly(lowest, 'storage');
  const egressMonthly = componentMonthly(lowest, 'egress');
  const sensitivityMonthly =
    lowest.totals.monthly + computeMonthly * 0.2 + storageMonthly * 0.5 + egressMonthly * 0.25;
  const approximateRows = providers.reduce(
    (count, provider) =>
      count + provider.lineItems.filter((lineItem) => lineItem.isApproximate).length,
    0,
  );
  const threeYearTco = bestCommitment?.model.monthlyCostUsd
    ? bestCommitment.model.monthlyCostUsd * 36 + (bestCommitment.model.upfrontCostUsd ?? 0)
    : lowest.totals.monthly * 36;
  const egressGb = parseInputNumber(form.monthlyEgressGb) ?? 0;
  const utilization = parseInputNumber(form.averageUtilizationPercent);
  const rightsizingSignal =
    form.usagePattern === 'bursty' && utilization !== undefined && utilization < 55
      ? 'Downsize or autoscale'
      : form.scalingType === 'fixed'
        ? 'Load-test fixed nodes'
        : 'Autoscaling ready';

  return [
    {
      label: 'Waterfall',
      value: `${formatCurrency(lowest.totals.monthly)} baseline`,
      detail: `${formatCurrency(modeledAssumptions)} of support, licensing, and resilience assumptions are explicit modeled line items.`,
      tone: modeledAssumptions > 0 ? 'review' : 'good',
    },
    {
      label: 'Provider delta',
      value: spread > 0 ? `${formatCurrency(spread)}/mo` : 'Tight spread',
      detail:
        spread > 0
          ? `${providerLabel(lowest.providerId)} is lower than ${providerLabel(
              highest?.providerId ?? lowest.providerId,
            )} by ${formatCurrency(spread * 12)}/yr before private discounts.`
          : 'Provider totals are clustered; architecture fit should drive selection.',
      tone: spread > lowest.totals.monthly * 0.2 ? 'review' : 'good',
    },
    {
      label: 'Break-even',
      value:
        breakEvenMonths !== undefined
          ? `${formatDecimal(breakEvenMonths)} mo`
          : bestCommitment
            ? 'No upfront'
            : 'Unavailable',
      detail: bestCommitment
        ? `${bestCommitment.model.displayName ?? bestCommitment.model.model} saves ${formatCurrency(
            bestCommitment.monthlySavings,
          )}/mo versus on-demand.`
        : 'No eligible commitment model is published for the current provider baseline.',
      tone: bestCommitment ? 'good' : 'review',
    },
    {
      label: 'Sensitivity',
      value: formatCurrency(sensitivityMonthly),
      detail:
        '+20% compute, +50% storage, and +25% egress stress case against the current low provider.',
      tone: sensitivityMonthly > lowest.totals.monthly * 1.35 ? 'risk' : 'review',
    },
    {
      label: 'Spot blend',
      value: spotBlendMonthly !== undefined ? formatCurrency(spotBlendMonthly) : 'Estimate only',
      detail:
        spotBlendMonthly !== undefined
          ? 'Modeled as 30% interruptible compute and 70% on-demand baseline.'
          : 'Spot/preemptible rows are not available for this comparison response.',
      tone: spotBlendMonthly !== undefined ? 'review' : 'risk',
    },
    {
      label: 'Rightsizing',
      value: rightsizingSignal,
      detail: `${capitalize(form.usagePattern.replace('_', ' '))} usage with ${form.scalingType} capacity. Validate CPU, memory, and peak concurrency before commitment.`,
      tone: rightsizingSignal === 'Autoscaling ready' ? 'good' : 'review',
    },
    {
      label: 'Commitment coverage',
      value: `${form.commitmentPreferencePercent || '0'}% fit`,
      detail: `${supportTierLabel(form.supportTier)} and ${form.operatingSystem.toUpperCase()} assumptions are included in the workload profile.`,
      tone: Number(form.commitmentPreferencePercent) >= 70 ? 'good' : 'review',
    },
    {
      label: 'Egress optimization',
      value: egressGb > 0 ? `${formatDecimal(egressGb)}GB/mo` : 'Not stated',
      detail: form.cdn
        ? 'CDN is enabled; validate cache hit ratio and cross-region transfer paths.'
        : 'CDN is off; review public egress and inter-service transfer before production.',
      tone: egressGb >= 500 && !form.cdn ? 'risk' : 'review',
    },
    {
      label: 'License optimization',
      value: form.operatingSystem.toUpperCase(),
      detail:
        form.operatingSystem === 'windows'
          ? 'Windows licensing is modeled separately; validate BYOL eligibility and provider hybrid benefits.'
          : 'Linux/BYOL setting avoids a modeled Windows license premium.',
      tone: form.operatingSystem === 'windows' ? 'review' : 'good',
    },
    {
      label: '3-year TCO',
      value: formatCurrency(threeYearTco),
      detail:
        'Projection uses the best available commitment model when eligible, otherwise current on-demand monthly run rate.',
      tone: bestCommitment ? 'good' : 'review',
    },
    {
      label: 'Risk flags',
      value: approximateRows > 0 ? `${approximateRows} review` : 'Low',
      detail:
        approximateRows > 0
          ? 'Approximate service mappings require solution-architecture review.'
          : 'No approximate provider mappings are flagged in the comparison response.',
      tone: approximateRows > 0 ? 'review' : 'good',
    },
    {
      label: 'Region variance',
      value: regionLabelForSummary(form.regionPreference, null),
      detail: form.complianceLocked
        ? `Residency lock enabled for ${form.dataResidency}; verify regional SKU coverage before procurement.`
        : 'Region can still be adjusted for price, latency, residency, and availability tradeoffs.',
      tone: form.complianceLocked ? 'risk' : 'review',
    },
  ];
}

function sensitivityScenarioRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): SensitivityScenarioRow[] {
  if (!comparison) {
    return [];
  }

  const providersById = new Map<ProviderId, ComparisonProviderResult>(
    comparison.providers.map((provider) => [provider.providerId, provider]),
  );
  const providers = PROVIDER_ORDER.map((providerId) => providersById.get(providerId)).filter(
    (provider): provider is ComparisonProviderResult => Boolean(provider),
  );

  if (providers.length === 0) {
    return [];
  }

  const demandGrowthPercent = form.usagePattern === 'bursty' ? 35 : 25;
  const dataGrowthPercent = storageGrowthSensitivityPercent(form);
  const egressShockPercent = form.cdn ? 25 : 50;
  const peakBufferPercent = form.scalingType === 'autoscaling' ? 10 : 18;

  return [
    scenarioSensitivityRow(
      'baseline',
      'Baseline run-rate',
      'Current on-demand monthly comparison payload.',
      providers,
      (provider) => provider.totals.monthly,
    ),
    scenarioSensitivityRow(
      'demand-growth',
      `Demand +${demandGrowthPercent}%`,
      `Compute scales ${demandGrowthPercent}%; database and operations scale at half rate.`,
      providers,
      (provider) =>
        provider.totals.monthly +
        componentMonthly(provider, 'compute') * (demandGrowthPercent / 100) +
        componentMonthly(provider, 'database') * (demandGrowthPercent / 200) +
        componentMonthly(provider, 'operations') * (demandGrowthPercent / 200),
    ),
    scenarioSensitivityRow(
      'data-growth',
      `Data growth +${dataGrowthPercent}%`,
      'Storage, database capacity, and observability retention growth pressure.',
      providers,
      (provider) =>
        provider.totals.monthly +
        (componentMonthly(provider, 'storage') +
          componentMonthly(provider, 'database') +
          componentMonthly(provider, 'operations') * 0.35) *
          (dataGrowthPercent / 100),
    ),
    scenarioSensitivityRow(
      'egress-shock',
      `Egress +${egressShockPercent}%`,
      form.cdn
        ? 'CDN enabled; public egress shock is dampened by cache coverage.'
        : 'No CDN flag; public and inter-region transfer shock is fully applied.',
      providers,
      (provider) =>
        provider.totals.monthly + componentMonthly(provider, 'egress') * (egressShockPercent / 100),
    ),
    scenarioSensitivityRow(
      'commitment-path',
      'Best commitment path',
      'Uses published reserved/Savings Plan/CUD monthly model when present; otherwise baseline.',
      providers,
      (provider) => bestCommitmentModel(provider)?.model.monthlyCostUsd ?? provider.totals.monthly,
    ),
    scenarioSensitivityRow(
      'peak-buffer',
      `Peak buffer +${peakBufferPercent}%`,
      `${form.scalingType === 'autoscaling' ? 'Autoscaling' : 'Fixed'} capacity buffer on compute, network, and operations.`,
      providers,
      (provider) =>
        provider.totals.monthly +
        (componentMonthly(provider, 'compute') +
          componentMonthly(provider, 'egress') * 0.5 +
          componentMonthly(provider, 'operations') * 0.4) *
          (peakBufferPercent / 100),
    ),
  ];
}

function scenarioSensitivityRow(
  id: string,
  label: string,
  assumption: string,
  providers: ComparisonProviderResult[],
  monthlyCost: (provider: ComparisonProviderResult) => number,
): SensitivityScenarioRow {
  const providerCosts = providers.map((provider) => ({
    providerId: provider.providerId,
    monthlyCostUsd: roundCurrency(monthlyCost(provider)),
    deltaVsBaselineUsd: roundCurrency(monthlyCost(provider) - provider.totals.monthly),
    isLowest: false,
  }));
  const lowest = [...providerCosts].sort(
    (left, right) => left.monthlyCostUsd - right.monthlyCostUsd,
  )[0];

  return {
    id,
    label,
    assumption,
    providers: providerCosts.map((provider) => ({
      ...provider,
      isLowest: lowest?.providerId === provider.providerId,
    })),
    lowestProviderId: lowest?.providerId,
  };
}

function scenarioWinCounts(rows: SensitivityScenarioRow[]): Map<ProviderId, number> {
  return rows.reduce((counts, row) => {
    if (row.lowestProviderId) {
      counts.set(row.lowestProviderId, (counts.get(row.lowestProviderId) ?? 0) + 1);
    }

    return counts;
  }, new Map<ProviderId, number>());
}

function storageGrowthSensitivityPercent(form: WorkloadFormState): number {
  const storageGrowthGb = parseInputNumber(form.databaseStorageGrowthGbPerMonth) ?? 0;
  const databaseSizeGb = parseInputNumber(form.databaseSizeGb) ?? 0;
  const storageSizeGb = parseInputNumber(form.storageSizeGb) ?? 0;
  const currentDataFootprintGb = databaseSizeGb + storageSizeGb;

  if (storageGrowthGb <= 0 || currentDataFootprintGb <= 0) {
    return 40;
  }

  return Math.min(
    120,
    Math.max(20, Math.round((storageGrowthGb * 12 * 100) / currentDataFootprintGb)),
  );
}

function componentMonthly(provider: ComparisonProviderResult, component: CostComponent): number {
  return provider.lineItems
    .filter((lineItem) => lineItemCostComponent(lineItem) === component)
    .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
}

function lineItemCostComponent(lineItem: ComparisonLineItem): CostComponent {
  if (lineItem.costComponent) {
    return lineItem.costComponent;
  }

  switch (lineItem.category) {
    case 'network':
      return 'egress';
    case 'support':
    case 'licensing':
    case 'operations':
      return lineItem.category;
    case 'compute':
    case 'storage':
    case 'database':
      return lineItem.category;
  }
}

function bestCommitmentModel(provider: ComparisonProviderResult): {
  model: NonNullable<ComparisonProviderResult['pricingModels']>[number];
  monthlySavings: number;
} | null {
  const onDemand = provider.pricingModels?.find((model) => model.model === 'on-demand');
  const onDemandMonthly = onDemand?.monthlyCostUsd ?? provider.totals.monthly;
  const candidates =
    provider.pricingModels?.filter(
      (model) =>
        model.available &&
        model.monthlyCostUsd !== undefined &&
        model.model !== 'on-demand' &&
        model.model !== 'spot' &&
        model.monthlyCostUsd < onDemandMonthly,
    ) ?? [];
  const best = [...candidates].sort(
    (left, right) => (left.monthlyCostUsd ?? Infinity) - (right.monthlyCostUsd ?? Infinity),
  )[0];

  return best && best.monthlyCostUsd !== undefined
    ? {
        model: best,
        monthlySavings: onDemandMonthly - best.monthlyCostUsd,
      }
    : null;
}

function costFormulaRows(comparison: ComparisonResult | null): Array<{
  key: string;
  providerId: ProviderId;
  category: ServiceCategory;
  description: string;
  formula: string;
}> {
  return (
    comparison?.providers.flatMap((provider) =>
      provider.lineItems.slice(0, 4).map((lineItem, index) => ({
        key: `${provider.providerId}-${lineItem.category}-${index}`,
        providerId: provider.providerId,
        category: lineItem.category,
        description: lineItem.description,
        formula:
          lineItem.baseHourlyCostUsd !== undefined
            ? `${formatCurrency(lineItem.baseHourlyCostUsd)} hourly x 730 hours = ${formatCurrency(
                lineItem.baseMonthlyCostUsd,
              )} monthly`
            : lineItem.unitPriceUsd !== undefined
              ? `${formatCurrency(lineItem.unitPriceUsd)} per ${lineItem.unit ?? 'unit'} rolled into ${formatCurrency(
                  lineItem.baseMonthlyCostUsd,
                )} monthly`
              : `Provider adapter subtotal = ${formatCurrency(lineItem.baseMonthlyCostUsd)} monthly`,
      })),
    ) ?? []
  );
}

function EngineeringServiceChartGrid({
  analytics,
  compact = false,
}: {
  analytics: EngineeringAnalyticsModel;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact ? 'engineering-chart-grid engineering-chart-grid-compact' : 'engineering-chart-grid'
      }
      aria-label="Provider service cost charts"
    >
      {analytics.providers.map((provider) => (
        <EngineeringProviderServiceChart
          key={provider.providerId}
          provider={provider}
          compact={compact}
        />
      ))}
    </div>
  );
}

function EngineeringProviderServiceChart({
  provider,
  compact = false,
}: {
  provider: EngineeringProviderServiceModel;
  compact?: boolean;
}) {
  const hasData = provider.total !== undefined && provider.total > 0;
  const viewportWidth = useViewportWidth();
  const { height: chartHeight, width: chartWidth } = engineeringChartDimensions(
    compact,
    viewportWidth,
  );

  return (
    <article className={`engineering-chart-card engineering-chart-${provider.providerId}`}>
      <div className="engineering-chart-title">
        <span>{providerLabel(provider.providerId)}</span>
        <strong>{hasData ? formatCurrency(provider.total ?? 0) : 'Pending'}</strong>
      </div>

      {hasData ? (
        <>
          <div className="engineering-bar-chart-shell" aria-hidden="true">
            <BarChart
              width={chartWidth}
              height={chartHeight}
              data={provider.services}
              margin={{ top: 10, right: 4, bottom: 0, left: -20 }}
            >
              <CartesianGrid stroke="var(--pc-chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="serviceLabel"
                interval={0}
                tick={{ fill: 'var(--pc-text-secondary)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: 'var(--pc-chart-hover)' }}
                formatter={(value) => [formatCurrency(Number(value)), 'Cost']}
                contentStyle={{
                  background: 'var(--pc-bg-surface)',
                  border: '1px solid var(--pc-border)',
                  borderRadius: '8px',
                  color: 'var(--pc-text-primary)',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="value" radius={[6, 6, 2, 2]} isAnimationActive={false}>
                {provider.services.map((service) => (
                  <Cell
                    key={`${provider.providerId}-${service.category}`}
                    fill={service.color}
                    opacity={service.value > 0 ? 1 : 0.2}
                  />
                ))}
              </Bar>
            </BarChart>
          </div>
          <div className="engineering-service-list">
            {provider.services.map((service) => (
              <span key={service.category}>
                <i className={`category-dot category-${service.category}`} aria-hidden="true" />
                <strong>{service.serviceLabel}</strong>
                <small>
                  {formatCurrency(service.value)} · {formatPercent(service.percent)}
                </small>
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="engineering-chart-empty" role="status">
          Run a comparison to populate {providerLabel(provider.providerId)} service bars.
        </div>
      )}

      <p className="engineering-chart-footnote">
        {provider.dominantService
          ? `${provider.dominantService.serviceLabel} is the largest mapped driver.`
          : 'Service concentration pending provider line items.'}
      </p>
    </article>
  );
}

function useViewportWidth(): number {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  );

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return viewportWidth;
}

function engineeringChartDimensions(
  compact: boolean,
  viewportWidth: number,
): { width: number; height: number } {
  if (viewportWidth < 420) {
    return { width: 196, height: compact ? 126 : 140 };
  }

  if (viewportWidth < 768) {
    return { width: compact ? 220 : 238, height: compact ? 132 : 148 };
  }

  return { width: compact ? 238 : 276, height: compact ? 138 : 164 };
}

function EngineeringSignal({
  detail,
  label,
  providerId,
  tone,
  value,
}: {
  detail: string;
  label: string;
  providerId?: ProviderId;
  tone?: 'ready' | 'review';
  value: string;
}) {
  const className = [
    'engineering-signal',
    providerId ? `engineering-signal-${providerId}` : undefined,
    tone ? `engineering-signal-${tone}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
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
                <span>{providerLabel(fit.providerId)}</span>
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
      <small>{detail}</small>
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
                  <span className="rank-provider">{providerLabel(summary.providerId)}</span>
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
      <small>{detail}</small>
    </div>
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
      <span>{label}</span>
      <span className="provider-pending-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

function SignInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M10 6h8v12h-8M4 12h10M11 9l3 3-3 3" />
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

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M12 17V5M8 9l4-4 4 4M5 19h14" />
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

function PricingModelMiniIcon({ pricingModel }: { pricingModel: PricingModelKey }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="segment-icon">
      {pricingModel === 'spot' ? (
        <path d="M5 17l4-8 4 5 3-6 3 9M5 20h14" />
      ) : pricingModel === 'on-demand' ? (
        <path d="M6 7h12M6 12h12M6 17h8" />
      ) : (
        <path d="M7 20V9M12 20V5M17 20v-8M5 20h14" />
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

function logoSrcForTheme(resolvedTheme: ResolvedTheme): string {
  return resolvedTheme === 'dark'
    ? '/brand/polycost-lockup-dark.svg'
    : '/brand/polycost-lockup.svg';
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
    case 'hourly':
      return provider.totals.hourly ?? hourlyFromMonthly(provider.totals.monthly);
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

function executiveAnalyticsModel(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): ExecutiveAnalyticsModel {
  const monthlySummaries = providerCostSummaries(comparison, 'monthly');
  const summaryByProvider = new Map(
    monthlySummaries.map((summary) => [summary.providerId, summary]),
  );
  const pricedMonthlySummaries = monthlySummaries.filter((summary) => summary.total !== undefined);
  const pricedInProviderOrder = PROVIDER_ORDER.map((providerId) =>
    summaryByProvider.get(providerId),
  )
    .filter((summary): summary is ProviderCostSummary => Boolean(summary))
    .filter((summary) => summary.total !== undefined);
  const totalMonthlyAcrossProviders =
    pricedMonthlySummaries.length > 0
      ? roundCurrency(
          pricedMonthlySummaries.reduce((sum, summary) => sum + (summary.total ?? 0), 0),
        )
      : undefined;
  const review = buildFinOpsReview(comparison, 'monthly', form);
  const highest = pricedMonthlySummaries.at(-1);
  const monthlyPotentialSavings = review.monthlySpread;
  const annualPotentialSavings =
    review.executiveDecision.avoidableAnnualSpend ??
    (monthlyPotentialSavings !== undefined
      ? roundCurrency(monthlyPotentialSavings * 12)
      : undefined);

  return {
    review,
    monthlySummaries,
    pricedMonthlySummaries,
    totalMonthlyAcrossProviders,
    providerMix:
      totalMonthlyAcrossProviders !== undefined && totalMonthlyAcrossProviders > 0
        ? pricedInProviderOrder.map((summary) => ({
            providerId: summary.providerId,
            name: providerLabel(summary.providerId),
            value: roundCurrency(summary.total ?? 0),
            percent: ((summary.total ?? 0) / totalMonthlyAcrossProviders) * 100,
            color: providerChartColor(summary.providerId),
          }))
        : [],
    cheapest: review.monthlyLowest,
    highest,
    annualPotentialSavings,
    monthlyPotentialSavings,
  };
}

function providerChartColor(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'var(--pc-provider-aws)';
    case 'azure':
      return 'var(--pc-provider-azure)';
    case 'gcp':
      return 'var(--pc-provider-gcp)';
  }
}

function executiveRecommendation(
  analytics: ExecutiveAnalyticsModel,
  form: WorkloadFormState,
  regionCatalog: RegionCatalogResponse | null,
): { headline: string; detail: string } {
  const lowest = analytics.cheapest;

  if (!lowest) {
    return {
      headline: 'Run a comparison to create a recommendation',
      detail:
        'PolyCost will use current provider totals, service mappings, and workload assumptions to produce an export-ready executive brief.',
    };
  }

  const provider = providerLabel(lowest.providerId);
  const region = regionLabelForSummary(form.regionPreference, regionCatalog);
  const annualSavings = analytics.annualPotentialSavings;
  const savingsPhrase =
    annualSavings !== undefined && annualSavings > 0
      ? `can avoid up to ${formatCurrency(annualSavings)}/yr versus the highest current estimate`
      : 'is currently the lowest priced option, with providers tightly clustered';

  return {
    headline: `Shortlist ${provider} in ${region}`,
    detail: `${provider} ${savingsPhrase}. Validate service equivalence, regional availability, quotas, resilience, and data-transfer assumptions before target-cloud commitment.`,
  };
}

function engineeringAnalyticsModel(
  comparison: ComparisonResult | null,
  interval: IntervalKey,
): EngineeringAnalyticsModel {
  const providerResults = new Map<ProviderId, ComparisonProviderResult>(
    comparison?.providers.map((provider) => [provider.providerId, provider]) ?? [],
  );

  const providers = PROVIDER_ORDER.map((providerId): EngineeringProviderServiceModel => {
    const provider = providerResults.get(providerId);
    const total = provider ? costForInterval(provider, interval) : undefined;
    const services = categoryTotalsForLineItems(provider?.lineItems ?? [], interval).map(
      (categorySummary): EngineeringServiceDatum => ({
        category: categorySummary.category,
        serviceLabel: providerServiceLabel(providerId, categorySummary.category),
        value: categorySummary.total,
        percent: categorySummary.total > 0 ? categorySummary.percentOfTotal : 0,
        color: providerChartColor(providerId),
      }),
    );
    const dominantService = services
      .filter((service) => service.value > 0)
      .sort((left, right) => right.value - left.value)[0];

    return {
      providerId,
      total,
      lineItemCount: provider?.lineItems.length ?? 0,
      approximateCount:
        provider?.lineItems.filter((lineItem) => lineItem.isApproximate).length ?? 0,
      services,
      dominantService,
    };
  });

  const pricedProviders = providers.filter(
    (provider): provider is EngineeringProviderServiceModel & { total: number } =>
      provider.total !== undefined,
  );
  const topDriver = providers
    .flatMap((provider) =>
      provider.services.map((service) => ({
        providerId: provider.providerId,
        service,
      })),
    )
    .filter((driver) => driver.service.value > 0)
    .sort((left, right) => right.service.value - left.service.value)[0];

  return {
    providers,
    pricedProviders,
    totalLineItems: providers.reduce((sum, provider) => sum + provider.lineItemCount, 0),
    approximateCount: providers.reduce((sum, provider) => sum + provider.approximateCount, 0),
    topDriver,
  };
}

function providerServiceLabel(providerId: ProviderId, category: ServiceCategory): string {
  if (category === 'support') {
    return 'Support plan';
  }

  if (category === 'licensing') {
    return 'OS licensing';
  }

  if (category === 'operations') {
    return 'Resilience ops';
  }

  if (providerId === 'aws') {
    switch (category) {
      case 'compute':
        return 'EC2';
      case 'storage':
        return 'EBS / S3';
      case 'database':
        return 'RDS';
      case 'network':
        return 'Data transfer';
    }
  }

  if (providerId === 'azure') {
    switch (category) {
      case 'compute':
        return 'VM';
      case 'storage':
        return 'Disk / Blob';
      case 'database':
        return 'Azure SQL';
      case 'network':
        return 'Bandwidth';
    }
  }

  switch (category) {
    case 'compute':
      return 'GCE';
    case 'storage':
      return 'PD / GCS';
    case 'database':
      return 'Cloud SQL';
    case 'network':
      return 'Egress';
  }
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

function intervalCostMultiplier(interval: IntervalKey): number {
  return intervalMultiplierFromMonthly(interval);
}

function compareButtonLabel(inputMode: InputMode): string {
  return inputMode === 'describe' ? 'Parse requirements' : 'Compare';
}

function compareLoadingLabel(inputMode: InputMode): string {
  return inputMode === 'describe' ? 'Parsing requirements...' : 'Comparing...';
}

function inputModeSummaryLabel(inputMode: InputMode): string {
  return (
    INPUT_MODE_OPTIONS.find((option) => option.key === inputMode)?.summaryLabel ?? 'Manual entry'
  );
}

function pricingModelSummaryLabel(pricingModel: PricingModelKey): string {
  return (
    PRICING_MODEL_OPTIONS.find((option) => option.key === pricingModel)?.shortLabel ?? 'On-demand'
  );
}

function readStoredPricingModel(): PricingModelKey {
  const stored = window.localStorage.getItem(PRICING_MODEL_STORAGE_KEY);

  return PRICING_MODEL_OPTIONS.some((option) => option.key === stored)
    ? (stored as PricingModelKey)
    : 'on-demand';
}

function storePricingModel(pricingModel: PricingModelKey): void {
  window.localStorage.setItem(PRICING_MODEL_STORAGE_KEY, pricingModel);
}

function createComparisonHistoryEntry({
  comparison,
  form,
  inputMode,
  pricingModel,
}: {
  comparison: ComparisonResult;
  form: WorkloadFormState;
  inputMode: InputMode;
  pricingModel: PricingModelKey;
}): ComparisonHistoryEntry {
  const cheapestProvider =
    comparison.providers.find(
      (provider) => provider.providerId === comparison.cheapestProviderId,
    ) ??
    comparison.providers.reduce<ComparisonProviderResult | undefined>((lowest, provider) => {
      if (!lowest || provider.totals.monthly < lowest.totals.monthly) {
        return provider;
      }

      return lowest;
    }, undefined);
  const cheapestProviderId = cheapestProvider?.providerId ?? comparison.cheapestProviderId;

  return {
    id: comparison.comparisonId,
    comparisonId: comparison.comparisonId,
    createdAt: new Date().toISOString(),
    form,
    inputMode,
    pricingModel,
    cheapestProviderId,
    serviceCount: serviceRequirementsFromForm(form).length,
    providerCount: comparison.providers.length,
    monthlyLowestUsd: cheapestProvider?.totals.monthly ?? 0,
    summary: comparisonHistorySummary(form),
  };
}

function saveComparisonHistoryEntry(
  currentHistory: ComparisonHistoryEntry[],
  entry: ComparisonHistoryEntry,
): ComparisonHistoryEntry[] {
  const nextHistory = [
    entry,
    ...currentHistory.filter((candidate) => candidate.comparisonId !== entry.comparisonId),
  ].slice(0, MAX_COMPARISON_HISTORY_ENTRIES);

  storeComparisonHistory(nextHistory);
  return nextHistory;
}

function readStoredComparisonHistory(): ComparisonHistoryEntry[] {
  try {
    const stored = window.localStorage.getItem(COMPARISON_HISTORY_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(sanitizeComparisonHistoryEntry)
      .filter((entry): entry is ComparisonHistoryEntry => Boolean(entry))
      .slice(0, MAX_COMPARISON_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

function sanitizeComparisonHistoryEntry(
  entry: Partial<ComparisonHistoryEntry>,
): ComparisonHistoryEntry | undefined {
  if (!entry || typeof entry !== 'object' || !entry.form || typeof entry.form !== 'object') {
    return undefined;
  }

  const cheapestProviderId = PROVIDER_ORDER.includes(entry.cheapestProviderId as ProviderId)
    ? (entry.cheapestProviderId as ProviderId)
    : 'aws';
  const pricingModel = PRICING_MODEL_OPTIONS.some((option) => option.key === entry.pricingModel)
    ? (entry.pricingModel as PricingModelKey)
    : 'on-demand';
  const form = {
    ...INITIAL_HOME_FORM,
    ...entry.form,
  };

  return {
    id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : comparisonHistoryId(),
    comparisonId:
      typeof entry.comparisonId === 'string' && entry.comparisonId.trim()
        ? entry.comparisonId
        : typeof entry.id === 'string'
          ? entry.id
          : comparisonHistoryId(),
    createdAt:
      typeof entry.createdAt === 'string' && !Number.isNaN(new Date(entry.createdAt).getTime())
        ? entry.createdAt
        : new Date().toISOString(),
    form,
    inputMode: entry.inputMode === 'describe' ? 'describe' : 'form',
    pricingModel,
    cheapestProviderId,
    serviceCount:
      typeof entry.serviceCount === 'number' && entry.serviceCount > 0
        ? entry.serviceCount
        : serviceRequirementsFromForm(form).length,
    providerCount:
      typeof entry.providerCount === 'number' && entry.providerCount > 0
        ? entry.providerCount
        : PROVIDER_ORDER.length,
    monthlyLowestUsd:
      typeof entry.monthlyLowestUsd === 'number' && entry.monthlyLowestUsd >= 0
        ? entry.monthlyLowestUsd
        : 0,
    summary:
      typeof entry.summary === 'string' && entry.summary.trim()
        ? entry.summary
        : comparisonHistorySummary(form),
  };
}

function comparisonHistoryId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `history-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function storeComparisonHistory(history: ComparisonHistoryEntry[]): void {
  window.localStorage.setItem(COMPARISON_HISTORY_STORAGE_KEY, JSON.stringify(history));
}

function clearComparisonHistory(): void {
  window.localStorage.removeItem(COMPARISON_HISTORY_STORAGE_KEY);
}

function comparisonHistorySummary(form: WorkloadFormState): string {
  const name = form.workloadName.trim();
  const workload = workloadTypeLabel(form.workloadType);
  const service = serviceFamilyShortLabel(form.selectedServiceFamilyId);

  return name ? `${name} · ${workload}` : `${workload} · ${service}`;
}

function readStoredRequirementSession(): StoredRequirementSession | undefined {
  try {
    const stored = window.sessionStorage.getItem(REQUIREMENT_SESSION_STORAGE_KEY);
    if (!stored) {
      return undefined;
    }

    const parsed = JSON.parse(stored) as Partial<StoredRequirementSession>;
    const inputMode: InputMode = parsed.inputMode === 'describe' ? 'describe' : 'form';
    const pricingModel = PRICING_MODEL_OPTIONS.some((option) => option.key === parsed.pricingModel)
      ? (parsed.pricingModel as PricingModelKey)
      : 'on-demand';

    if (!parsed.form || typeof parsed.form !== 'object') {
      return undefined;
    }

    return {
      inputMode,
      pricingModel,
      form: {
        ...INITIAL_HOME_FORM,
        ...parsed.form,
      },
      naturalLanguageInput:
        typeof parsed.naturalLanguageInput === 'string'
          ? parsed.naturalLanguageInput
          : sampleNaturalLanguageInput,
      requirementsAwaitingReview: Boolean(parsed.requirementsAwaitingReview),
    };
  } catch {
    return undefined;
  }
}

function storeRequirementSession(session: StoredRequirementSession): void {
  window.sessionStorage.setItem(REQUIREMENT_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearRequirementSession(): void {
  window.sessionStorage.removeItem(REQUIREMENT_SESSION_STORAGE_KEY);
}

function isSupportedRequirementsFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  const hasSupportedExtension = REQUIREMENTS_FILE_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );

  return hasSupportedExtension || REQUIREMENTS_FILE_MIME_TYPES.has(file.type);
}

function reportFormatLabel(format: ReportFormat): string {
  return format === 'xlsx' ? 'Excel' : format.toUpperCase();
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

function formValidationSummaryMessage(issues: WorkloadFormIssue[]): string {
  return `Fix ${issues.length} requirement field${issues.length === 1 ? '' : 's'} before comparing. ${issues
    .map((issue) => issue.message)
    .join(' ')}`;
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

function formatDateTime(value: string | undefined): string {
  if (!value) {
    return 'pending';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'pending';
  }

  return date.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatHistoryTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Recent';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
