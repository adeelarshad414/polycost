import { FormEvent, lazy, ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency, formatPercent, formatSignedCurrency } from './lib/format';
import {
  appPlatformAlwaysOnMonthly,
  appPlatformRequestMonthly,
  buildExecutiveDecision,
  buildSolutionArchitectureReview,
  categoryHeatmapRows,
  categoryTotalsForLineItems,
  clearComparisonHistory,
  clearRequirementSession,
  clearStoredAuthToken,
  componentMonthly,
  componentMonthlyTotal,
  computeArchitectureDelta,
  computeSizingIntent,
  computeStorageDefaultForTier,
  costMatrixCellFromRow,
  createComparisonHistoryEntry,
  dataHealthBannerSummary,
  databaseAnalyticsSignal,
  databaseAnatomyRecommendation,
  databaseCapacitySignal,
  databaseDimensionSummary,
  databaseIntelligenceLineItems,
  databaseResilienceSignal,
  diagramReviewComponentFromRequirement,
  diagramServiceOptionForType,
  emptyCategoryTotals,
  finOpsFindingRiskFlag,
  formSizingSummary,
  fullCostMatrixRows,
  inputModeSummaryLabel,
  isPricingModelKey,
  isSupportedRequirementsFile,
  matchServiceFamily,
  networkLineItems,
  networkingRateEvidence,
  networkingVolumeEvidence,
  operationsOptimizationRows,
  pricingModelSummaryLabel,
  pricingModelTooltip,
  providerDeltaRows,
  readStoredPricingModel,
  regionVarianceRows,
  runtimeOptimizationRows,
  sanitizeInputMode,
  serverBreakEvenTimelineModel,
  serverlessFunctionMonthly,
  serviceCheapestRows,
  serviceFamilyOptions,
  shouldApplyComputeStorageDefault,
  spotBlendOptimizerRows,
  storageClassDisplayName,
  storageLineItems,
  storeAuthSession,
  storeComparisonHistory,
  storePricingModel,
  storeRequirementSession,
} from './lib/optimization-signals';
import {
  APP_PLATFORM_MODEL_RATES,
  AUTH_SESSION_EXPIRES_AT_STORAGE_KEY,
  AUTH_SESSION_STORAGE_KEY,
  COMPARISON_HISTORY_STORAGE_KEY,
  COMPUTE_SIZE_PRESETS,
  COMPUTE_SPEC_PROFILES,
  COMPUTE_TENANCY_OPTIONS,
  CONFIDENCE_TOOLTIP,
  DIAGRAM_FILE_ACCEPT,
  DIAGRAM_FILE_MAX_BYTES,
  DIAGRAM_REVIEW_SERVICE_OPTIONS,
  ENVIRONMENT_OPTIONS,
  FAULT_TOLERANCE_OPTIONS,
  HOURS_PER_MONTH_TOOLTIP,
  INITIAL_HOME_FORM,
  INPUT_MODE_OPTIONS,
  INSTANCE_TIER_OPTIONS,
  MAX_COMPARISON_HISTORY_ENTRIES,
  OPERATING_SYSTEM_OPTIONS,
  PRICING_MODEL_OPTIONS,
  PROCESSOR_ARCHITECTURE_OPTIONS,
  REQUIREMENTS_FILE_ACCEPT,
  REQUIREMENTS_FILE_MAX_BYTES,
  REQUIREMENT_SESSION_STORAGE_KEY,
  SERVERLESS_FUNCTION_RATES,
  SERVICE_CATEGORIES,
  STORAGE_CLASS_OPTIONS,
  STORAGE_REPLICATION_OPTIONS,
  SUPPORT_TIER_OPTIONS,
  TERRAFORM_AVAILABILITY_OPTIONS,
  TERRAFORM_NETWORK_OPTIONS,
  TERRAFORM_RUNTIME_OPTIONS,
  USAGE_PATTERN_OPTIONS,
} from './lib/app-catalogs';
import {
  backendSensitivityScenarioRows,
  chartPoint,
  compactRequirementSummary,
  compareButtonLabel,
  compareLoadingLabel,
  comparisonHistorySummary,
  computeFamilyLabel,
  computePresetScore,
  computeSizingSignal,
  computeSpecificationRecommendation,
  computeTenancySignal,
  costFormulaRows,
  costMatrixSortKey,
  dataHealthBannerDetail,
  databaseDimensionTotals,
  databaseOptimizationSignal,
  databaseRateEvidence,
  databaseStorageLineItems,
  diagramLayoutPreview,
  egressOptimizationSignal,
  executiveRecommendation,
  finOpsRecommendations,
  intervalOutlookRows,
  lineItemTierBillableGb,
  manualAssumptionsForService,
  networkingComponentLabel,
  providerFitSummaries,
  providerServiceLabel,
  quickActionTaskItems,
  reconciliationEvidenceSummary,
  resultStatusNotice,
  riskSeverityRank,
  roleClassName,
  scenarioSensitivityRow,
  scenarioWinCounts,
  storageDimensionTotals,
  storageGrowthSensitivityPercent,
  storageOperationsSignal,
  storageOptimizationSignal,
  storagePerformanceSignal,
  storageRateEvidence,
  storageResilienceSignal,
  workspaceSessionStatus,
} from './lib/comparison-models';
import type {
  AppPlatformModelRow,
  AppProps,
  ArchitectureRiskFlag,
  BreakEvenTimelineModel,
  BulkServiceDraftRow,
  BusyAction,
  CategoryCostSummary,
  CommitmentCoverageGapRow,
  ComparisonHistoryEntry,
  ComputeSizePreset,
  ComputeSpecificationRow,
  CostComponent,
  CostMatrixCategoryFilter,
  CostMatrixCell,
  CostMatrixColumnMode,
  CostMatrixPricingModelFilter,
  CostMatrixProviderFilter,
  CostMatrixSortKey,
  CrossProviderTcoRow,
  DatabaseAnatomyRow,
  DatabaseOptimizationRow,
  EgressOptimizationRow,
  EngineeringAnalyticsModel,
  EngineeringProviderServiceModel,
  EngineeringServiceDatum,
  ExecutiveAnalyticsModel,
  FinOpsReview,
  FormSectionTone,
  FullCostMatrixRow,
  InputMode,
  LicenseOptimizationRow,
  NetworkingCostRow,
  OperationsOptimizationRow,
  ProductionDepthInsight,
  ProviderCostSummary,
  ProviderDeltaRow,
  RegionVarianceRow,
  RuntimeOptimizationRow,
  SensitivityScenarioRow,
  ServerlessMemoryCurveRow,
  SolutionArchitectureReview,
  SpotBlendOptimizerRow,
  StorageAnatomyRow,
  StorageOptimizationRow,
  StoredRequirementSession,
  ToggleIconKind,
  ExecutiveDecision,
} from './lib/app-view-types';
import {
  activeTeamToMembership,
  applyResidencyRegionLock,
  availabilityProfileLabel,
  base64ToBlob,
  bestCommitmentModel,
  breakEvenMonthsForHorizon,
  bulkServiceRowId,
  capitalize,
  clampNumber,
  commitmentTermMonths,
  comparisonHistoryId,
  costForInterval,
  costMatrixPricingModelLabel,
  databaseAdvancedDescriptionMatches,
  databaseAnatomyProfile,
  defaultCalculatorUrl,
  diagramFormatFromFile,
  diagramNodeIdForRequirement,
  downloadBlob,
  editStatusNotice,
  evidenceRateLabel,
  evidenceSkuLabel,
  evidenceSourceLabel,
  executiveForecastForCheapest,
  executiveModelMonthlyCost,
  fileToBase64,
  firstServiceFamilyIdForCategory,
  formValidationSummaryMessage,
  formWithBulkServiceRows,
  formatDateTime,
  formatDecimal,
  formatFileSize,
  formatHistoryTimestamp,
  formatLabel,
  futureIsoTimestamp,
  initialStatusNotice,
  inviteDeliveryNotice,
  isBulkServiceHeader,
  isPastIsoTimestamp,
  isProviderId,
  isSessionExpiredError,
  logoSrcForTheme,
  mappingLabel,
  memberRemoveControlState,
  memberRoleControlState,
  mergeTeamMemberships,
  networkingValidationAction,
  orderBulkServiceRows,
  parseInputNumber,
  positiveIntegerInput,
  previewTerraformContent,
  providerChartColor,
  providerExportSample,
  providerServicesForFamily,
  providerSubtitle,
  providerTerraformResourceLabel,
  readInviteTokenFromUrl,
  regionLabelForSummary,
  regionReferenceLabel,
  regionReferenceUrl,
  reportFormatLabel,
  reviewMessage,
  rightSizingSavingsRate,
  roundCurrency,
  runtimeProfileLabel,
  selectedComputeArchitecture,
  serviceCategoryOptions,
  shareTokenFromLocation,
  sourceTypeForProvider,
  splitBulkServiceLine,
  storageAdvancedDescriptionMatches,
  storageAnatomyRecommendation,
  storageDimensionSummary,
  supportTierLabel,
  svgDataUrl,
  teamAuditActionLabel,
  teamAuditEventDetail,
  teamRoleLabel,
  terraformAvailabilityModeFromForm,
  toId,
  topologyProfileLabel,
  validationIssueMap,
  providerLabel,
} from './lib/workload-analysis';
// FE-4: charts (recharts, ~377 kB) are the single largest vendor chunk and are
// only needed once a comparison renders, so they load on demand rather than
// blocking first paint.
const ProviderMixDonut = lazy(() =>
  import('./components/Charts').then((module) => ({ default: module.ProviderMixDonut })),
);
const EngineeringProviderServiceChart = lazy(() =>
  import('./components/Charts').then((module) => ({
    default: module.EngineeringProviderServiceChart,
  })),
);
import { formatApiError, PolyCostClient, polyCostClient } from './api-client';
import { POLYCOST_TAGLINE } from './brand';
import { Button, ProviderBadge } from './components/Button';
import { FinOpsFeatureLayer, SharedReportPlaceholder } from './components/FinOpsFeatureLayer';
import {
  BootSplash,
  LoadingStatus,
  SessionLoader,
  TaskQueue,
  type LoadingStep,
} from './components/LoadingExperience';
import { PersonaComparisonWorkspace } from './components/PersonaComparisonWorkspace';
import { CostByService } from './components/CostByService';
import { ResultTabs, type ResultTab } from './components/ResultTabs';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { TopLoadingBar } from './components/TopLoadingBar';
import { HOURS_PER_MONTH } from './cost-time';
import {
  canonicalRegionsForResidencyScope,
  COMPARISON_REGION_GROUPS,
  isRegionPreferenceAllowedForResidency,
  providerRegionSummary,
} from './region-normalization';
import { FALLBACK_REGION_CATALOG } from './region-catalog';
import {
  CLOUD_SERVICE_CATALOG,
  SERVICE_CATALOG_CATEGORIES,
  type CloudServiceFamily,
  type ServiceSupportStatus,
  orderedServiceFamilyIds,
  serviceCatalogTraceability,
  supportLabel,
} from './service-catalog';
import {
  applyTheme,
  applyAccent,
  AccentChoice,
  ResolvedTheme,
  resolveTheme,
  storedAccent,
  storedTheme,
  subscribeToSystemTheme,
  ThemeChoice,
} from './theme';
import {
  ComparisonProviderResult,
  ComparisonAnalyticsResponse,
  ComparisonPricingEvidenceResponse,
  ComparisonResult,
  DataHealthResponse,
  BillingImportResponse,
  BillingProviderExportInput,
  DiagramInputFormat,
  DiagramParseResult,
  INTERVALS,
  IntervalKey,
  InvoiceArtifactLegalHoldInput,
  InvoiceArtifactBlobUploadInput,
  InvoiceArtifactPolicyExceptionInput,
  InvoiceArtifactPolicyExceptionStatus,
  InvoiceArtifactReviewInput,
  InvoiceArtifactReviewStatus,
  InvoiceControlValidationInput,
  InvoiceGradeArtifactRegistrationInput,
  InvoiceGradeArtifactVerificationInput,
  InvoiceReconciliationRecord,
  NormalizedWorkloadSpec,
  PROVIDER_ORDER,
  PricingModelKey,
  ProviderId,
  RegionCatalogResponse,
  ReportFormat,
  ServiceRequirement,
  TerraformAvailabilityMode,
  TerraformGenerationResult,
  TerraformNetworkTopology,
  TerraformRuntimeTarget,
  TerraformTargetCloud,
  AccountSessionRecord,
  AuthMeResponse,
  SsoConfigurationStatus,
  SsoStartResponse,
  TeamAuditEventRecord,
  TeamInvitationRecord,
  TeamInvitationPreview,
  TeamMemberRecord,
  TeamRole,
  CreatedTeamScimTokenRecord,
  TeamScimTokenRecord,
  TeamScimUserRecord,
  TeamSwitchResponse,
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

export function App({ client = polyCostClient }: AppProps) {
  const shareToken = shareTokenFromLocation();
  const isPageLoading = usePageLoadingState();
  const isBooting = useInitialBootState();
  const activeAsyncActionId = useRef(0);
  const initialRequirementSession = useRef(readStoredRequirementSession()).current;
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => storedTheme());
  const [accentChoice, setAccentChoice] = useState<AccentChoice>(() => storedAccent());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(storedTheme()),
  );
  const [inputMode, setInputMode] = useState<InputMode>(
    () => initialRequirementSession?.inputMode ?? 'form',
  );
  const [naturalLanguageInput, setNaturalLanguageInput] = useState(
    () => initialRequirementSession?.naturalLanguageInput ?? sampleNaturalLanguageInput,
  );
  const [diagramInput, setDiagramInput] = useState('');
  const [diagramEncoding, setDiagramEncoding] = useState<'text' | 'base64'>('text');
  const [diagramInputFormat, setDiagramInputFormat] = useState<DiagramInputFormat | 'auto'>('auto');
  const [diagramMimeType, setDiagramMimeType] = useState<string | undefined>(undefined);
  const [diagramFileName, setDiagramFileName] = useState<string | null>(null);
  const [diagramParseResult, setDiagramParseResult] = useState<DiagramParseResult | null>(null);
  const [form, setForm] = useState<WorkloadFormState>(
    () => initialRequirementSession?.form ?? INITIAL_HOME_FORM,
  );
  const [submittedForm, setSubmittedForm] = useState<WorkloadFormState>(INITIAL_HOME_FORM);
  const [submittedInputMode, setSubmittedInputMode] = useState<InputMode>('form');
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [comparisonAnalytics, setComparisonAnalytics] =
    useState<ComparisonAnalyticsResponse | null>(null);
  const [comparisonAnalyticsError, setComparisonAnalyticsError] = useState<string | null>(null);
  const [isComparisonAnalyticsLoading, setIsComparisonAnalyticsLoading] = useState(false);
  const [comparisonPricingEvidence, setComparisonPricingEvidence] =
    useState<ComparisonPricingEvidenceResponse | null>(null);
  const [comparisonPricingEvidenceError, setComparisonPricingEvidenceError] = useState<
    string | null
  >(null);
  const [isComparisonPricingEvidenceLoading, setIsComparisonPricingEvidenceLoading] =
    useState(false);
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
  const [completedExportFormat, setCompletedExportFormat] = useState<ReportFormat | null>(null);
  const [isEditingRequirements, setIsEditingRequirements] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read exactly once, here, and passed down. readStoredAuthState() CLEARS an
  // expired token as a side effect, so calling it in both App and the panel
  // would swallow the "session expired" notice the second caller needs.
  const [initialStoredAuth] = useState(() => readStoredAuthState());
  // The account / team / SSO / reconciliation panel is an operator surface, not
  // part of the landing page. It stays hidden until asked for, so a first-time
  // visitor sees the product rather than a sign-in form and two "Admin
  // required" panels they cannot use. Anyone with a live session - or one that
  // just expired and needs telling - still gets it straight away.
  const [workspaceOpen, setWorkspaceOpen] = useState(
    () =>
      initialStoredAuth.token !== '' ||
      initialStoredAuth.expired ||
      // Someone who followed an invite link came here specifically to join a
      // team; hiding the panel would strand them on the landing page.
      readInviteTokenFromUrl() !== '',
  );
  const [requirementsFileName, setRequirementsFileName] = useState<string | null>(null);
  const [regionCatalog, setRegionCatalog] = useState<RegionCatalogResponse | null>(null);
  const [regionCatalogError, setRegionCatalogError] = useState<string | null>(null);
  const [dataHealth, setDataHealth] = useState<DataHealthResponse | null>(null);
  const [dataHealthError, setDataHealthError] = useState<string | null>(null);
  const [formValidationIssues, setFormValidationIssues] = useState<WorkloadFormIssue[]>([]);

  useEffect(() => {
    setResolvedTheme(applyTheme(themeChoice));

    if (themeChoice !== 'system') {
      return undefined;
    }

    return subscribeToSystemTheme((nextTheme) => {
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
      setResolvedTheme(nextTheme);
    });
  }, [themeChoice]);

  useEffect(() => {
    applyAccent(accentChoice);
  }, [accentChoice]);

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
    if (!comparison) {
      setComparisonAnalytics(null);
      setComparisonAnalyticsError(null);
      setIsComparisonAnalyticsLoading(false);
      return;
    }

    let isMounted = true;

    setIsComparisonAnalyticsLoading(true);
    setComparisonAnalyticsError(null);

    void client
      .getComparisonAnalytics(comparison.comparisonId)
      .then((analytics) => {
        if (!isMounted) {
          return;
        }

        setComparisonAnalytics(analytics);
        setComparisonAnalyticsError(null);
      })
      .catch((analyticsError) => {
        if (!isMounted) {
          return;
        }

        setComparisonAnalytics(null);
        setComparisonAnalyticsError(formatApiError(analyticsError));
      })
      .finally(() => {
        if (!isMounted) {
          return;
        }

        setIsComparisonAnalyticsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [client, comparison]);

  useEffect(() => {
    if (!comparison) {
      setComparisonPricingEvidence(null);
      setComparisonPricingEvidenceError(null);
      setIsComparisonPricingEvidenceLoading(false);
      return;
    }

    let isMounted = true;

    setIsComparisonPricingEvidenceLoading(true);
    setComparisonPricingEvidenceError(null);

    void client
      .getComparisonPricingEvidence(comparison.comparisonId)
      .then((evidence) => {
        if (!isMounted) {
          return;
        }

        setComparisonPricingEvidence(evidence);
        setComparisonPricingEvidenceError(null);
      })
      .catch((evidenceError) => {
        if (!isMounted) {
          return;
        }

        setComparisonPricingEvidence(null);
        setComparisonPricingEvidenceError(formatApiError(evidenceError));
      })
      .finally(() => {
        if (!isMounted) {
          return;
        }

        setIsComparisonPricingEvidenceLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [client, comparison]);

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

  async function handleParseDiagram() {
    if (!diagramInput.trim()) {
      setError('Upload a diagram or paste Mermaid, draw.io XML, or Lucid CSV content first.');
      setNotice(null);
      return;
    }

    const actionId = startAsyncAction();
    setError(null);
    setNotice(null);
    setBusyAction('parse');

    try {
      const parsed = await client.parseDiagram({
        content: diagramInput,
        encoding: diagramEncoding,
        inputFormat: diagramInputFormat,
        fileName: diagramFileName ?? undefined,
        mimeType: diagramMimeType,
      });
      if (!isCurrentAsyncAction(actionId)) {
        return;
      }

      setDiagramParseResult(parsed);
      setForm(formFromNws(parsed.draftNws));
      setFormValidationIssues([]);
      setInputMode('diagram');
      setRequirementsAwaitingReview(true);
      setNotice(
        `${reviewMessage(
          parsed.parserConfidence,
          parsed.fieldsRequiringReview,
        )} Review the diagram-derived services, edit sizing assumptions, then compare.`,
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

    if (inputMode === 'diagram' && !diagramParseResult) {
      await handleParseDiagram();
      return;
    }

    const validationIssues =
      inputMode === 'form' || inputMode === 'diagram' ? validateWorkloadForm(form) : [];

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

      const recommendedPricingModel =
        result.pricingModelRecommendation?.preferredModel ?? pricingModel;
      setComparison(result);
      setPricingModel(recommendedPricingModel);
      storePricingModel(recommendedPricingModel);
      setSubmittedForm(submittedComparisonForm);
      setSubmittedInputMode(submittedComparisonInputMode);
      setComparisonHistory((currentHistory) =>
        saveComparisonHistoryEntry(
          currentHistory,
          createComparisonHistoryEntry({
            comparison: result,
            form: submittedComparisonForm,
            inputMode: submittedComparisonInputMode,
            pricingModel: recommendedPricingModel,
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
    if (inputMode === 'diagram' && diagramParseResult) {
      const nws = buildNwsFromForm(form, 'drawio_diagram');

      return {
        nws: {
          ...nws,
          serviceRequirements: diagramParseResult.draftNws.serviceRequirements,
          sourceTraceability:
            diagramParseResult.draftNws.sourceTraceability ??
            serviceCatalogTraceability(form.selectedServiceFamilyIds),
        },
        parserNotice: reviewMessage(
          diagramParseResult.parserConfidence,
          diagramParseResult.fieldsRequiringReview,
        ),
        submittedComparisonForm: form,
        submittedComparisonInputMode: 'diagram',
      };
    }

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

      const recommendedPricingModel =
        result.pricingModelRecommendation?.preferredModel ?? pricingModel;
      setComparison(result);
      setPricingModel(recommendedPricingModel);
      storePricingModel(recommendedPricingModel);
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
    setCompletedExportFormat(null);

    try {
      const blob = await client.exportComparison(comparison.comparisonId, format, {
        interval,
        pricingModel,
      });
      if (!isCurrentAsyncAction(actionId)) {
        return;
      }

      downloadBlob(blob, `polycost-comparison-${comparison.comparisonId}.${format}`);
      setCompletedExportFormat(format);
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

  function handleDiagramInputChange(value: string) {
    setDiagramInput(value);
    setDiagramEncoding('text');
    setDiagramInputFormat('auto');
    setDiagramMimeType(undefined);
    setDiagramFileName(null);
    setDiagramParseResult(null);
  }

  function handleClearDiagramInput() {
    setDiagramInput('');
    setDiagramEncoding('text');
    setDiagramInputFormat('auto');
    setDiagramMimeType(undefined);
    setDiagramFileName(null);
    setDiagramParseResult(null);
    setRequirementsAwaitingReview(false);
    setFormValidationIssues([]);
    setNotice(null);
    setError(null);
  }

  function handleRemoveDiagramComponent(nodeId: string) {
    setDiagramParseResult((current) => {
      if (!current) {
        return current;
      }

      const removedComponent = current.review.components.find(
        (component) => component.nodeId === nodeId,
      );

      return {
        ...current,
        fieldsRequiringReview: [
          ...new Set([...current.fieldsRequiringReview, `diagram.nodes.${nodeId}.removed`]),
        ],
        draftNws: {
          ...current.draftNws,
          serviceRequirements: (current.draftNws.serviceRequirements ?? []).filter(
            (requirement) => diagramNodeIdForRequirement(requirement) !== nodeId,
          ),
          sourceTraceability: current.draftNws.sourceTraceability?.filter(
            (trace) => trace.sourceRef !== removedComponent?.sourceRef,
          ),
        },
        review: {
          ...current.review,
          components: current.review.components.filter((component) => component.nodeId !== nodeId),
          ignoredNodes: removedComponent
            ? [
                ...current.review.ignoredNodes,
                {
                  id: nodeId,
                  displayLabel: removedComponent.displayLabel,
                  reason: 'removed during review',
                  sourceRef: removedComponent.sourceRef,
                },
              ]
            : current.review.ignoredNodes,
        },
        graph: {
          ...current.graph,
          nodes: current.graph.nodes.filter((node) => node.id !== nodeId),
          ignoredNodes: removedComponent
            ? [
                ...current.graph.ignoredNodes,
                {
                  id: nodeId,
                  displayLabel: removedComponent.displayLabel,
                  reason: 'removed during review',
                  sourceRef: removedComponent.sourceRef,
                },
              ]
            : current.graph.ignoredNodes,
        },
      };
    });
    setNotice('Removed the diagram service from the comparison review.');
  }

  function handleClassifyDiagramNode(nodeId: string, serviceType: string) {
    if (!serviceType) {
      return;
    }

    setDiagramParseResult((current) => {
      if (!current) {
        return current;
      }

      const node = current.review.unresolvedClassifications.find((item) => item.id === nodeId);
      if (!node) {
        return current;
      }

      const requirement = serviceRequirementForManualClassification(nodeId, serviceType);
      const component = diagramReviewComponentFromRequirement(node, requirement);

      return {
        ...current,
        parserConfidence: 'low',
        fieldsRequiringReview: [
          ...new Set([...current.fieldsRequiringReview, `diagram.nodes.${nodeId}.classification`]),
        ],
        draftNws: {
          ...current.draftNws,
          serviceRequirements: [...(current.draftNws.serviceRequirements ?? []), requirement],
          sourceTraceability: [
            ...(current.draftNws.sourceTraceability ?? []),
            {
              nwsPath: `serviceRequirements.${nodeId}`,
              sourceRef: node.sourceRef,
            },
          ],
        },
        review: {
          ...current.review,
          components: [...current.review.components, component],
          unresolvedClassifications: current.review.unresolvedClassifications.filter(
            (item) => item.id !== nodeId,
          ),
          assumedDefaults: [
            ...new Set([...current.review.assumedDefaults, ...component.assumedDefaults]),
          ],
        },
        graph: {
          ...current.graph,
          nodes: current.graph.nodes.map((graphNode) =>
            graphNode.id === nodeId ? { ...graphNode, kind: 'resource' } : graphNode,
          ),
        },
      };
    });
    setNotice(
      'Classified the unresolved diagram node. Review the sizing assumptions before comparing.',
    );
  }

  function handleAddDiagramRequirement(serviceType: string) {
    if (!serviceType) {
      return;
    }

    const nodeId = `manual-${Date.now()}`;
    const sourceRef = `diagram:manual:${nodeId}`;
    const requirement = serviceRequirementForManualClassification(nodeId, serviceType);

    setDiagramParseResult((current) => {
      if (!current) {
        return current;
      }

      const component = diagramReviewComponentFromRequirement(
        {
          id: nodeId,
          displayLabel: serviceLabelForType(serviceType),
          sourceRef,
        },
        requirement,
      );

      return {
        ...current,
        parserConfidence: 'low',
        fieldsRequiringReview: [
          ...new Set([...current.fieldsRequiringReview, `diagram.nodes.${nodeId}.manual`]),
        ],
        draftNws: {
          ...current.draftNws,
          serviceRequirements: [...(current.draftNws.serviceRequirements ?? []), requirement],
          sourceTraceability: [
            ...(current.draftNws.sourceTraceability ?? []),
            {
              nwsPath: `serviceRequirements.${nodeId}`,
              sourceRef,
            },
          ],
        },
        review: {
          ...current.review,
          components: [...current.review.components, component],
          assumedDefaults: [
            ...new Set([...current.review.assumedDefaults, ...component.assumedDefaults]),
          ],
        },
        graph: {
          ...current.graph,
          nodes: [
            ...current.graph.nodes,
            {
              id: nodeId,
              displayLabel: component.displayLabel,
              kind: 'resource',
              sourceRef,
            },
          ],
        },
      };
    });
    setNotice('Added a manual diagram service. Review the workload form before comparing.');
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

  async function handleDiagramFileLoad(file: File | null) {
    if (!file) {
      return;
    }

    if (file.size > DIAGRAM_FILE_MAX_BYTES) {
      setError('Upload a diagram file under 5MB.');
      setNotice(null);
      return;
    }

    try {
      const inputFormat = diagramFormatFromFile(file);
      const isBinary = inputFormat === 'vsdx' || file.type === 'application/octet-stream';
      const content = isBinary ? await fileToBase64(file) : await file.text();

      if (!content.trim()) {
        setError('The selected diagram file is empty.');
        setNotice(null);
        return;
      }

      setDiagramInput(content);
      setDiagramEncoding(isBinary ? 'base64' : 'text');
      setDiagramInputFormat(inputFormat);
      setDiagramMimeType(file.type || undefined);
      setDiagramFileName(file.name || 'diagram file');
      setDiagramParseResult(null);
      setInputMode('diagram');
      setRequirementsAwaitingReview(false);
      setFormValidationIssues([]);
      setError(null);
      setNotice(`Loaded ${file.name || 'diagram file'}. Parse the diagram to review services.`);
    } catch {
      setError('Could not read the selected diagram file.');
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
    setDiagramInput('');
    setDiagramEncoding('text');
    setDiagramInputFormat('auto');
    setDiagramMimeType(undefined);
    setDiagramFileName(null);
    setDiagramParseResult(null);
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
    setDiagramInput('');
    setDiagramEncoding('text');
    setDiagramInputFormat('auto');
    setDiagramMimeType(undefined);
    setDiagramFileName(null);
    setDiagramParseResult(null);
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
    setNotice(null);
    setWorkspaceOpen(true);

    // The panel mounts in the same tick, so the scroll is deferred to the next
    // frame; scrolling now would target an element that does not exist yet.
    requestAnimationFrame(() => {
      // Optional call: jsdom and older browsers do not implement scrollIntoView,
      // and failing to scroll must not break revealing the panel.
      document
        .getElementById('workspace')
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
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
      <a className="skip-link" href="#requirements">
        Skip to comparison workspace
      </a>
      <BootSplash active={isBooting} />
      <TopLoadingBar isLoading={isPageLoading} />
      {hasComparison ? <ScrollProgressBar /> : null}
      <AppHeader
        resolvedTheme={resolvedTheme}
        themeChoice={themeChoice}
        accentChoice={accentChoice}
        onSignIn={handleSignIn}
        onThemeChange={setThemeChoice}
        onAccentChange={setAccentChoice}
      />
      {workspaceOpen ? (
        <WorkspaceControlCenter
          client={client}
          comparisonId={comparison?.comparisonId}
          initialStoredAuth={initialStoredAuth}
          onNotice={setNotice}
          onError={setError}
        />
      ) : null}
      {comparison ? (
        <>
          <h1 id="page-title" className="sr-only">
            PolyCost comparison results
          </h1>
          <ProgressiveComparisonPage
            client={client}
            comparison={comparison}
            comparisonAnalytics={comparisonAnalytics}
            comparisonAnalyticsError={comparisonAnalyticsError}
            comparisonPricingEvidence={comparisonPricingEvidence}
            comparisonPricingEvidenceError={comparisonPricingEvidenceError}
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
            completedExportFormat={completedExportFormat}
            notice={notice}
            error={error}
            naturalLanguageInput={naturalLanguageInput}
            diagramInput={diagramInput}
            diagramInputFormat={diagramInputFormat}
            diagramParseResult={diagramParseResult}
            regionCatalog={regionCatalog}
            regionCatalogError={regionCatalogError}
            validationIssues={formValidationIssues}
            dataHealth={dataHealth}
            dataHealthError={dataHealthError}
            isComparisonAnalyticsLoading={isComparisonAnalyticsLoading}
            isComparisonPricingEvidenceLoading={isComparisonPricingEvidenceLoading}
            onClear={handleClearComparison}
            onEdit={handleEditComparison}
            onInputModeChange={setInputMode}
            onPricingModelChange={handlePricingModelChange}
            onNaturalLanguageChange={handleNaturalLanguageChange}
            onDiagramInputChange={handleDiagramInputChange}
            onRemoveDiagramComponent={handleRemoveDiagramComponent}
            onClassifyDiagramNode={handleClassifyDiagramNode}
            onAddDiagramRequirement={handleAddDiagramRequirement}
            onFormChange={handleFormChange}
            onSubmit={handleCompare}
            onParse={handleParse}
            onParseDiagram={handleParseDiagram}
            onClearRequirements={handleClearRequirements}
            onClearDiagramInput={handleClearDiagramInput}
            onUseSample={handleUseSampleRequirements}
            onRequirementsFileLoad={handleRequirementsFileLoad}
            onDiagramFileLoad={handleDiagramFileLoad}
            requirementsFileName={requirementsFileName}
            diagramFileName={diagramFileName}
            onIntervalChange={setInterval}
            onRefreshLive={handleRefreshLive}
            onExport={(format) => void handleExport(format)}
          />
        </>
      ) : (
        <InitialHomePage
          form={form}
          inputMode={inputMode}
          pricingModel={pricingModel}
          requirementsAwaitingReview={requirementsAwaitingReview}
          naturalLanguageInput={naturalLanguageInput}
          diagramInput={diagramInput}
          diagramInputFormat={diagramInputFormat}
          diagramParseResult={diagramParseResult}
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
          onDiagramInputChange={handleDiagramInputChange}
          onRemoveDiagramComponent={handleRemoveDiagramComponent}
          onClassifyDiagramNode={handleClassifyDiagramNode}
          onAddDiagramRequirement={handleAddDiagramRequirement}
          onChange={handleFormChange}
          onClearRequirements={handleClearRequirements}
          onClearDiagramInput={handleClearDiagramInput}
          onSubmit={handleCompare}
          onParseDiagram={handleParseDiagram}
          onRestoreHistory={handleRestoreComparisonHistory}
          onClearHistory={handleClearComparisonHistory}
          onUseSample={handleUseSampleRequirements}
          onRequirementsFileLoad={handleRequirementsFileLoad}
          onDiagramFileLoad={handleDiagramFileLoad}
          requirementsFileName={requirementsFileName}
          diagramFileName={diagramFileName}
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

function useInitialBootState(): boolean {
  const [isBooting, setIsBooting] = useState(true);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsBooting(false));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return isBooting;
}

export function ScrollProgressBar() {
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

function WorkspaceControlCenter({
  client,
  comparisonId,
  initialStoredAuth,
  onNotice,
  onError,
}: {
  client: PolyCostClient;
  comparisonId?: string;
  /** Read once by App; see the note there on the clearing side effect. */
  initialStoredAuth: { token: string; expired: boolean };
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [token, setToken] = useState(initialStoredAuth.token);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(initialStoredAuth.expired);
  const [session, setSession] = useState<AuthMeResponse | null>(null);
  const [email, setEmail] = useState('architect@example.com');
  const [password, setPassword] = useState('correct horse battery staple');
  const [displayName, setDisplayName] = useState('Architecture Lead');
  const [teamName, setTeamName] = useState('PolyCost demo team');
  const [profileEmail, setProfileEmail] = useState('architect@example.com');
  const [profileDisplayName, setProfileDisplayName] = useState('Architecture Lead');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleteCurrentPassword, setDeleteCurrentPassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [newTeamName, setNewTeamName] = useState('Platform cost office');
  const [teamSettingsName, setTeamSettingsName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [isSessionHydrating, setIsSessionHydrating] = useState(Boolean(initialStoredAuth.token));
  const [workspaceBusy, setWorkspaceBusy] = useState<string | null>(null);
  const [isWorkspaceDirectoryLoading, setIsWorkspaceDirectoryLoading] = useState(false);
  const [workspaceDirectoryError, setWorkspaceDirectoryError] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitationRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<TeamAuditEventRecord[]>([]);
  const [scimTokens, setScimTokens] = useState<TeamScimTokenRecord[]>([]);
  const [scimUsers, setScimUsers] = useState<TeamScimUserRecord[]>([]);
  const [accountSessions, setAccountSessions] = useState<AccountSessionRecord[]>([]);
  const [ssoStatus, setSsoStatus] = useState<SsoConfigurationStatus | null>(null);
  const [inviteEmail, setInviteEmail] = useState('finops@example.com');
  const [inviteRole, setInviteRole] = useState<Exclude<TeamRole, 'owner'>>('member');
  const [lastInviteToken, setLastInviteToken] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [lastInviteDelivery, setLastInviteDelivery] = useState<
    TeamInvitationRecord['delivery'] | null
  >(null);
  const [landingInviteToken] = useState(() => readInviteTokenFromUrl());
  const [acceptToken, setAcceptToken] = useState(landingInviteToken);
  const [invitePreview, setInvitePreview] = useState<TeamInvitationPreview | null>(null);
  const [ssoProviderType, setSsoProviderType] = useState<'oidc' | 'saml'>('oidc');
  const [ssoDisplayName, setSsoDisplayName] = useState('Corporate OIDC');
  const [ssoIssuerUrl, setSsoIssuerUrl] = useState('https://idp.example.com');
  const [ssoClientId, setSsoClientId] = useState('polycost-demo-client');
  const [ssoClientSecret, setSsoClientSecret] = useState('CHANGE_ME_DEV_ONLY');
  const [ssoLoginEmail, setSsoLoginEmail] = useState('finops@example.com');
  const [ssoStart, setSsoStart] = useState<SsoStartResponse | null>(null);
  const [scimTokenDisplayName, setScimTokenDisplayName] = useState('Okta production SCIM');
  const [scimTokenExpiresAt, setScimTokenExpiresAt] = useState('');
  const [createdScimToken, setCreatedScimToken] = useState<CreatedTeamScimTokenRecord | null>(null);
  const [provider, setProvider] = useState<ProviderId>('aws');
  const [billingPeriodStart, setBillingPeriodStart] = useState('2026-06-01');
  const [billingPeriodEnd, setBillingPeriodEnd] = useState('2026-06-30');
  const [exportContent, setExportContent] = useState(() => providerExportSample('aws'));
  const [billingImport, setBillingImport] = useState<BillingImportResponse | null>(null);
  const [reconciliation, setReconciliation] = useState<InvoiceReconciliationRecord | null>(null);
  const activeTeam = session?.activeTeam;
  const activeTeamOptions = session?.teams ?? [];
  const canManageTeam = activeTeam?.role === 'owner' || activeTeam?.role === 'admin';
  const billingAccessMessage = !token
    ? 'Sign in before importing provider billing exports.'
    : !activeTeam
      ? 'Join or create a team before importing provider billing exports.'
      : !canManageTeam
        ? 'Owner or admin role required for billing import and reconciliation.'
        : null;
  const ownerCount = members.filter((member) => member.role === 'owner').length;
  const activeScimTokenCount = scimTokens.filter((scimToken) => !scimToken.revokedAt).length;
  const activeScimUserCount = scimUsers.filter((scimUser) => scimUser.active).length;
  const sourceType = sourceTypeForProvider(provider);
  const sessionStatus = session ? workspaceSessionStatus(session.session.expiresAt) : null;
  const reconciliationSummary = reconciliation
    ? reconciliationEvidenceSummary(reconciliation)
    : null;
  const sessionHydrationSteps: LoadingStep[] = [
    { id: 'stored-token', label: 'Reading stored session', state: 'done' },
    { id: 'verify-session', label: 'Verifying workspace access', state: 'active' },
    { id: 'prepare-workspace', label: 'Preparing account controls', state: 'pending' },
  ];
  const workspaceDirectorySteps: LoadingStep[] = [
    { id: 'session', label: 'Workspace session verified', state: 'done' },
    {
      id: 'team-directory',
      label: 'Syncing team directory',
      state: workspaceDirectoryError ? 'failed' : isWorkspaceDirectoryLoading ? 'active' : 'done',
      detail: workspaceDirectoryError ?? undefined,
    },
    {
      id: 'sso-readiness',
      label: 'Checking SSO readiness',
      state: workspaceDirectoryError ? 'pending' : isWorkspaceDirectoryLoading ? 'pending' : 'done',
    },
    {
      id: 'scim-provisioning',
      label: 'Checking SCIM provisioning',
      state: workspaceDirectoryError ? 'pending' : isWorkspaceDirectoryLoading ? 'pending' : 'done',
    },
    {
      id: 'audit-trail',
      label: 'Loading audit trail',
      state: workspaceDirectoryError ? 'pending' : isWorkspaceDirectoryLoading ? 'pending' : 'done',
    },
  ];

  useEffect(() => {
    if (!landingInviteToken) {
      return undefined;
    }

    let isMounted = true;

    void client
      .previewTeamInvitation(landingInviteToken)
      .then((preview) => {
        if (isMounted) {
          setInvitePreview(preview);
        }
      })
      .catch(() => {
        if (isMounted) {
          setInvitePreview({
            status: 'invalid',
            message: 'Invitation token was not found.',
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, landingInviteToken]);

  useEffect(() => {
    if (!token) {
      setSession(null);
      setIsSessionHydrating(false);
      setMembers([]);
      setInvitations([]);
      setAuditEvents([]);
      setScimTokens([]);
      setScimUsers([]);
      setAccountSessions([]);
      setSsoStatus(null);
      return undefined;
    }

    let isMounted = true;

    setIsSessionHydrating(true);
    void client
      .getCurrentSession(token)
      .then((currentSession) => {
        if (!isMounted) {
          return;
        }

        setSession(currentSession);
        storeAuthSession(token, currentSession.session.expiresAt);
        setSessionExpiredNotice(false);
        setProfileEmail(currentSession.account.email);
        setProfileDisplayName(currentSession.account.displayName ?? '');
        setTeamSettingsName(currentSession.activeTeam?.name ?? '');
        onError(null);
      })
      .catch((sessionError) => {
        if (!isMounted) {
          return;
        }

        clearStoredAuthToken();
        setToken('');
        setSession(null);
        setAccountSessions([]);
        setSessionExpiredNotice(isSessionExpiredError(sessionError));
        onError(formatApiError(sessionError));
      })
      .finally(() => {
        if (isMounted) {
          setIsSessionHydrating(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, onError, token]);

  useEffect(() => {
    if (!token || !session) {
      setAccountSessions([]);
      return undefined;
    }

    let isMounted = true;

    void client
      .listAccountSessions(token)
      .then((sessions) => {
        if (isMounted) {
          setAccountSessions(sessions);
        }
      })
      .catch((sessionsError) => {
        if (isMounted) {
          onError(formatApiError(sessionsError));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, onError, session, token]);

  useEffect(() => {
    setTeamSettingsName(activeTeam?.name ?? '');
  }, [activeTeam?.name]);

  useEffect(() => {
    if (!token || !activeTeam || !canManageTeam) {
      setIsWorkspaceDirectoryLoading(false);
      setWorkspaceDirectoryError(null);
      setMembers([]);
      setInvitations([]);
      setAuditEvents([]);
      setScimTokens([]);
      setScimUsers([]);
      setSsoStatus(null);
      setCreatedScimToken(null);
      return undefined;
    }

    let isMounted = true;

    setIsWorkspaceDirectoryLoading(true);
    setWorkspaceDirectoryError(null);
    // Settle each panel independently: a single failing endpoint must not
    // discard the five that succeeded (FE-5). Successful panels render their
    // data; failures leave prior data intact and surface a message.
    void Promise.allSettled([
      client.listTeamMembers(activeTeam.id, token),
      client.listTeamInvitations(activeTeam.id, token),
      client.listTeamAuditEvents(activeTeam.id, token),
      client.listTeamScimTokens(activeTeam.id, token),
      client.listTeamScimUsers(activeTeam.id, token),
      client.getSsoStatus(token),
    ])
      .then((results) => {
        if (!isMounted) {
          return;
        }

        const [membersR, invitationsR, auditR, scimTokensR, scimUsersR, ssoR] = results;
        if (membersR.status === 'fulfilled') setMembers(membersR.value);
        if (invitationsR.status === 'fulfilled') setInvitations(invitationsR.value);
        if (auditR.status === 'fulfilled') setAuditEvents(auditR.value);
        if (scimTokensR.status === 'fulfilled') setScimTokens(scimTokensR.value);
        if (scimUsersR.status === 'fulfilled') setScimUsers(scimUsersR.value);
        if (ssoR.status === 'fulfilled') setSsoStatus(ssoR.value);

        const failures = results.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );

        if (failures.length === 0) {
          setWorkspaceDirectoryError(null);
          return;
        }

        const message = formatApiError(failures[0].reason);
        setWorkspaceDirectoryError(message);
        // Only escalate to the global banner when nothing loaded; a partial
        // failure stays scoped to the workspace panel so good data still shows.
        if (failures.length === results.length) {
          onError(message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsWorkspaceDirectoryLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeTeam?.id, canManageTeam, client, onError, token]);

  async function handleAuthSubmit(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    onError(null);
    onNotice(null);

    try {
      const response =
        authMode === 'register'
          ? await client.register({
              email,
              password,
              displayName,
              teamName,
            })
          : await client.login({ email, password });

      storeAuthSession(response.token, response.expiresAt);
      setToken(response.token);
      setSessionExpiredNotice(false);
      onNotice(
        authMode === 'register'
          ? 'Workspace registered. Team controls and billing import are now available.'
          : 'Signed in. Team controls and billing import are now available.',
      );
    } catch (authError) {
      onError(formatApiError(authError));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    setAuthBusy(true);
    try {
      if (token) {
        await client.logout(token);
      }
    } catch {
      // Local token cleanup is still correct if the server session has already expired.
    } finally {
      clearStoredAuthToken();
      setToken('');
      setSession(null);
      setAccountSessions([]);
      setSessionExpiredNotice(false);
      setAuthBusy(false);
      onNotice('Signed out of the workspace.');
    }
  }

  async function handleRevokeOtherSessions() {
    if (!token) {
      return;
    }

    setWorkspaceBusy('revoke-sessions');
    onError(null);

    try {
      const result = await client.revokeOtherSessions(token);
      setAccountSessions((current) => current.filter((accountSession) => accountSession.current));
      onNotice(`Signed out ${result.revoked} other session${result.revoked === 1 ? '' : 's'}.`);
    } catch (sessionError) {
      onError(formatApiError(sessionError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  function clearWorkspaceScopedState() {
    setMembers([]);
    setInvitations([]);
    setAuditEvents([]);
    setScimTokens([]);
    setScimUsers([]);
    setCreatedScimToken(null);
    setSsoStatus(null);
    setSsoStart(null);
    setBillingImport(null);
    setReconciliation(null);
  }

  async function refreshTeamAuditEvents() {
    if (!token || !activeTeam || !canManageTeam) {
      return;
    }

    try {
      setAuditEvents(await client.listTeamAuditEvents(activeTeam.id, token));
    } catch (auditError) {
      onError(formatApiError(auditError));
    }
  }

  async function refreshScimPosture() {
    if (!token || !activeTeam || !canManageTeam) {
      return;
    }

    try {
      const [nextTokens, nextUsers] = await Promise.all([
        client.listTeamScimTokens(activeTeam.id, token),
        client.listTeamScimUsers(activeTeam.id, token),
      ]);
      setScimTokens(nextTokens);
      setScimUsers(nextUsers);
    } catch (scimError) {
      onError(formatApiError(scimError));
    }
  }

  function applyActiveTeamSwitch(
    switched: TeamSwitchResponse,
    extraMembership?: AuthMeResponse['teams'][number],
  ) {
    setSession((current) =>
      current
        ? {
            ...current,
            activeTeam: switched.activeTeam,
            teams: mergeTeamMemberships(current.teams, [
              activeTeamToMembership(switched.activeTeam),
              ...(extraMembership ? [extraMembership] : []),
            ]),
            session: {
              ...current.session,
              ...switched.session,
            },
          }
        : current,
    );
    setTeamSettingsName(switched.activeTeam.name);
    clearWorkspaceScopedState();
  }

  async function handleActiveTeamSwitch(teamId: string) {
    if (!token || !session || !teamId || teamId === activeTeam?.id) {
      return;
    }

    setWorkspaceBusy('switch-team');
    onError(null);

    try {
      const switched = await client.switchActiveTeam(teamId, token);
      applyActiveTeamSwitch(switched);
      onNotice(`Active workspace switched to ${switched.activeTeam.name}.`);
    } catch (switchError) {
      onError(formatApiError(switchError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleProfileUpdate(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setWorkspaceBusy('profile');
    onError(null);

    try {
      const updated = await client.updateAccountProfile(
        {
          email: profileEmail,
          displayName: profileDisplayName,
          ...(profileEmail !== session?.account.email
            ? { currentPassword: profileCurrentPassword }
            : {}),
        },
        token,
      );
      setProfileCurrentPassword('');
      setSession((current) =>
        current
          ? {
              ...current,
              account: {
                ...current.account,
                email: updated.email,
                displayName: updated.displayName,
              },
            }
          : current,
      );
      onNotice('Account profile updated.');
    } catch (profileError) {
      onError(formatApiError(profileError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handlePasswordChange(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setWorkspaceBusy('password');
    onError(null);

    try {
      await client.changePassword(
        {
          currentPassword: profileCurrentPassword,
          newPassword,
        },
        token,
      );
      setProfileCurrentPassword('');
      setNewPassword('');
      onNotice('Password changed. Existing sessions remain visible for review.');
    } catch (passwordError) {
      onError(formatApiError(passwordError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleAccountDeletion(event: FormEvent) {
    event.preventDefault();
    if (!token || deleteConfirmation !== 'DELETE') {
      return;
    }

    setWorkspaceBusy('delete-account');
    onError(null);

    try {
      await client.deleteAccount(
        {
          currentPassword: deleteCurrentPassword,
          confirmation: 'DELETE',
        },
        token,
      );
      clearStoredAuthToken();
      setToken('');
      setSession(null);
      setSessionExpiredNotice(false);
      setDeleteCurrentPassword('');
      setDeleteConfirmation('');
      onNotice('Account disabled and active sessions revoked.');
    } catch (deleteError) {
      onError(formatApiError(deleteError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleCreateTeam(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setWorkspaceBusy('create-team');
    onError(null);

    try {
      const created = await client.createTeam({ teamName: newTeamName }, token);
      const switched = await client.switchActiveTeam(created.teamId, token);
      applyActiveTeamSwitch(switched, {
        teamId: created.teamId,
        teamName: created.teamName,
        role: created.role,
      });
      onNotice(`Team created and selected: ${created.teamName}.`);
    } catch (teamError) {
      onError(formatApiError(teamError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleTeamSettingsUpdate(event: FormEvent) {
    event.preventDefault();
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy('team-settings');
    onError(null);

    try {
      const updated = await client.updateTeamSettings(
        activeTeam.id,
        { teamName: teamSettingsName },
        token,
      );
      setSession((current) =>
        current
          ? {
              ...current,
              activeTeam: {
                id: updated.teamId,
                name: updated.teamName,
                role: updated.role,
              },
              teams: current.teams.map((team) =>
                team.teamId === updated.teamId
                  ? {
                      ...team,
                      teamName: updated.teamName,
                      role: updated.role,
                    }
                  : team,
              ),
            }
          : current,
      );
      await refreshTeamAuditEvents();
      onNotice('Team settings updated.');
    } catch (settingsError) {
      onError(formatApiError(settingsError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy('invite');
    onError(null);

    try {
      const invitation = await client.inviteTeamMember(
        activeTeam.id,
        {
          email: inviteEmail,
          role: inviteRole,
        },
        token,
      );
      setInvitations((current) => [
        invitation,
        ...current.filter((currentInvitation) => currentInvitation.id !== invitation.id),
      ]);
      setLastInviteToken(invitation.inviteToken ?? null);
      setLastInviteUrl(invitation.inviteUrl ?? null);
      setLastInviteDelivery(invitation.delivery ?? null);
      await refreshTeamAuditEvents();
      onNotice(inviteDeliveryNotice(invitation, 'created'));
    } catch (inviteError) {
      onError(formatApiError(inviteError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleAcceptInvitation(event: FormEvent) {
    event.preventDefault();
    if (!token || !acceptToken.trim()) {
      return;
    }

    setWorkspaceBusy('accept-invite');
    onError(null);

    try {
      const accepted = await client.acceptTeamInvitation(acceptToken, token);
      setAcceptToken('');
      setInvitations((current) =>
        current.map((invitation) => (invitation.id === accepted.id ? accepted : invitation)),
      );
      setInvitePreview((current) =>
        current
          ? {
              ...current,
              status: accepted.status,
              acceptedAt: accepted.acceptedAt,
              message: 'Invitation has been accepted.',
            }
          : current,
      );
      onNotice('Invitation accepted. Sign in again if you want to switch the active team session.');
    } catch (acceptError) {
      onError(formatApiError(acceptError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy(`revoke-invite-${invitationId}`);
    onError(null);

    try {
      const revoked = await client.revokeTeamInvitation(activeTeam.id, invitationId, token);
      setInvitations((current) =>
        current.map((invitation) => (invitation.id === revoked.id ? revoked : invitation)),
      );
      await refreshTeamAuditEvents();
      onNotice('Invitation revoked.');
    } catch (inviteError) {
      onError(formatApiError(inviteError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleResendInvitation(invitationId: string) {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy(`resend-invite-${invitationId}`);
    onError(null);

    try {
      const invitation = await client.resendTeamInvitation(activeTeam.id, invitationId, token);
      setInvitations((current) => [
        invitation,
        ...current.filter((currentInvitation) => currentInvitation.id !== invitation.id),
      ]);
      setLastInviteToken(invitation.inviteToken ?? null);
      setLastInviteUrl(invitation.inviteUrl ?? null);
      setLastInviteDelivery(invitation.delivery ?? null);
      await refreshTeamAuditEvents();
      onNotice(inviteDeliveryNotice(invitation, 'refreshed'));
    } catch (inviteError) {
      onError(formatApiError(inviteError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleCreateScimToken(event: FormEvent) {
    event.preventDefault();
    if (!token || !activeTeam || !scimTokenDisplayName.trim()) {
      return;
    }

    setWorkspaceBusy('scim-token-create');
    onError(null);

    try {
      const created = await client.createTeamScimToken(
        activeTeam.id,
        {
          displayName: scimTokenDisplayName,
          ...(scimTokenExpiresAt ? { expiresAt: new Date(scimTokenExpiresAt).toISOString() } : {}),
        },
        token,
      );
      setCreatedScimToken(created);
      setScimTokens((current) => [
        created,
        ...current.filter((scimToken) => scimToken.id !== created.id),
      ]);
      setScimTokenExpiresAt('');
      await refreshScimPosture();
      await refreshTeamAuditEvents();
      onNotice('SCIM token created. Copy it now; PolyCost will not show it again.');
    } catch (scimError) {
      onError(formatApiError(scimError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleRevokeScimToken(tokenId: string) {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy(`scim-token-revoke-${tokenId}`);
    onError(null);

    try {
      const revoked = await client.revokeTeamScimToken(activeTeam.id, tokenId, token);
      setScimTokens((current) =>
        current.map((scimToken) => (scimToken.id === revoked.id ? revoked : scimToken)),
      );
      setCreatedScimToken((current) => (current?.id === revoked.id ? null : current));
      await refreshScimPosture();
      await refreshTeamAuditEvents();
      onNotice('SCIM token revoked.');
    } catch (scimError) {
      onError(formatApiError(scimError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleRoleChange(accountId: string, role: TeamRole) {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy(`role-${accountId}`);
    onError(null);

    try {
      const updated = await client.updateTeamMemberRole(activeTeam.id, accountId, role, token);
      setMembers((current) =>
        current.map((member) => (member.accountId === updated.accountId ? updated : member)),
      );
      if (session?.account.id === updated.accountId) {
        setSession((current) =>
          current
            ? {
                ...current,
                activeTeam: current.activeTeam
                  ? {
                      ...current.activeTeam,
                      role: updated.role,
                    }
                  : current.activeTeam,
                teams: current.teams.map((team) =>
                  team.teamId === activeTeam.id
                    ? {
                        ...team,
                        role: updated.role,
                      }
                    : team,
                ),
              }
            : current,
        );
      }
      await refreshTeamAuditEvents();
      onNotice('Team role updated.');
    } catch (roleError) {
      onError(formatApiError(roleError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleRemoveMember(accountId: string) {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy(`remove-${accountId}`);
    onError(null);

    try {
      await client.removeTeamMember(activeTeam.id, accountId, token);
      setMembers((current) => current.filter((member) => member.accountId !== accountId));
      await refreshTeamAuditEvents();
      onNotice('Team member removed.');
    } catch (removeError) {
      onError(formatApiError(removeError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleConfigureSso(event: FormEvent) {
    event.preventDefault();
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy('sso-configure');
    onError(null);

    try {
      const configured = await client.configureSsoProvider(
        activeTeam.id,
        {
          providerType: ssoProviderType,
          displayName: ssoDisplayName,
          issuerUrl: ssoIssuerUrl,
          clientId: ssoClientId,
          clientSecret: ssoClientSecret,
        },
        token,
      );
      setSsoStatus((current) =>
        current
          ? {
              ...current,
              oidcConfigured: configured.providerType === 'oidc' ? true : current.oidcConfigured,
              samlConfigured: configured.providerType === 'saml' ? true : current.samlConfigured,
              configuredProviders: [
                configured,
                ...current.configuredProviders.filter(
                  (providerConfig) => providerConfig.providerType !== configured.providerType,
                ),
              ],
            }
          : current,
      );
      await refreshTeamAuditEvents();
      onNotice('SSO provider configuration saved.');
    } catch (ssoError) {
      onError(formatApiError(ssoError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleTestSsoConnection() {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy('sso-test');
    onError(null);

    try {
      const result = await client.testSsoConnection(
        activeTeam.id,
        {
          providerType: ssoProviderType,
          displayName: ssoDisplayName,
          issuerUrl: ssoIssuerUrl,
          clientId: ssoClientId,
          clientSecret: ssoClientSecret,
        },
        token,
      );
      onNotice(result.message);
    } catch (ssoError) {
      onError(formatApiError(ssoError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleStartMockOidcLogin() {
    if (!activeTeam) {
      return;
    }

    setWorkspaceBusy('sso-start');
    onError(null);

    try {
      const emailHint = ssoLoginEmail || session?.account.email;
      const start = await client.startMockOidcLogin({
        teamId: activeTeam.id,
        ...(emailHint ? { email: emailHint } : {}),
      });

      setSsoStart(start);
      onNotice('Mock OIDC authorization URL generated.');
    } catch (ssoError) {
      onError(formatApiError(ssoError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleCompleteMockOidcCallback() {
    if (!ssoStart) {
      return;
    }

    setWorkspaceBusy('sso-complete');
    onError(null);

    try {
      const emailHint = ssoLoginEmail || session?.account.email;
      const displayNameHint = profileDisplayName || undefined;
      const response = await client.completeMockOidcCallback({
        state: ssoStart.state,
        ...(emailHint ? { email: emailHint } : {}),
        ...(displayNameHint ? { displayName: displayNameHint } : {}),
      });

      storeAuthSession(response.token, response.expiresAt);
      setToken(response.token);
      setSessionExpiredNotice(false);
      setSsoStart(null);
      onNotice('Mock OIDC callback verified and workspace session issued.');
    } catch (ssoError) {
      onError(formatApiError(ssoError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleImportProviderExport(event: FormEvent) {
    event.preventDefault();
    if (!token || billingAccessMessage) {
      onError(billingAccessMessage ?? 'Sign in before importing provider billing exports.');
      return;
    }

    setWorkspaceBusy('billing-import');
    setBillingImport(null);
    setReconciliation(null);
    onError(null);

    try {
      const input: BillingProviderExportInput = {
        provider,
        sourceType,
        billingPeriodStart,
        billingPeriodEnd,
        content: exportContent,
        encoding: 'text',
        fileName: `${provider}-billing-export.csv`,
      };
      const imported = await client.importProviderBillingExport(input, token);
      setBillingImport(imported);

      if (comparisonId) {
        const reconciled = await client.reconcileBillingImport(
          imported.importRun.id,
          comparisonId,
          token,
        );
        setReconciliation(reconciled);
      }

      await refreshTeamAuditEvents();
      onNotice(
        comparisonId
          ? 'Provider export imported and reconciled against the active comparison.'
          : 'Provider export imported. Run a comparison to reconcile estimate versus actuals.',
      );
    } catch (billingError) {
      onError(formatApiError(billingError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleRegisterInvoiceArtifact() {
    if (!token || billingAccessMessage || !reconciliation) {
      onError(
        billingAccessMessage ??
          'Run an estimate-vs-actual reconciliation before registering invoice artifacts.',
      );
      return;
    }

    setWorkspaceBusy('billing-artifact');
    onError(null);

    try {
      const artifactInput: InvoiceGradeArtifactRegistrationInput = {
        type: 'provider-invoice',
        displayName: `${providerLabel(reconciliation.provider)} invoice control packet`,
        reference: `demo://invoice-artifacts/${reconciliation.id}`,
        controlTotalUsd: reconciliation.invoicedTotalUsd,
        billingPeriodStart,
        billingPeriodEnd,
        notes:
          'Metadata registration only. Invoice files, contracts, tax, commitment, and allocation evidence still require independent verification.',
      };
      const updated = await client.registerInvoiceGradeArtifact(
        reconciliation.id,
        artifactInput,
        token,
      );
      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice('Invoice artifact metadata registered. Verification is still required.');
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleStoreInvoiceArtifactBlob() {
    if (!token || billingAccessMessage || !reconciliation || !reconciliationSummary?.artifactId) {
      onError(
        billingAccessMessage ??
          'Register invoice artifact metadata before storing the invoice evidence file.',
      );
      return;
    }

    setWorkspaceBusy('billing-artifact-upload');
    onError(null);

    try {
      const artifactInput: InvoiceArtifactBlobUploadInput = {
        fileName: `${reconciliation.provider}-invoice-control-${reconciliation.id.slice(0, 8)}.txt`,
        mimeType: 'text/plain',
        encoding: 'text',
        retentionDays: 365,
        legalHold: false,
        content: [
          'PolyCost invoice artifact control packet',
          `reconciliation_id=${reconciliation.id}`,
          `artifact_id=${reconciliationSummary.artifactId}`,
          `provider=${reconciliation.provider}`,
          `billing_period=${billingPeriodStart}/${billingPeriodEnd}`,
          `invoiced_total_usd=${reconciliation.invoicedTotalUsd}`,
          `variance_usd=${reconciliation.varianceUsd}`,
        ].join('\n'),
      };
      const updated = await client.uploadInvoiceArtifactBlob(
        reconciliation.id,
        reconciliationSummary.artifactId,
        artifactInput,
        token,
      );

      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice('Invoice artifact file stored with checksum and audit metadata.');
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleDownloadInvoiceArtifactBlob() {
    if (!token || billingAccessMessage || !reconciliation || !reconciliationSummary?.artifactId) {
      onError(
        billingAccessMessage ??
          'Store an invoice artifact file before downloading the evidence attachment.',
      );
      return;
    }

    setWorkspaceBusy('billing-artifact-download');
    onError(null);

    try {
      const artifactBlob = await client.downloadInvoiceArtifactBlob(
        reconciliation.id,
        reconciliationSummary.artifactId,
        token,
      );
      if (!artifactBlob.contentBase64) {
        throw new Error('Stored artifact bytes were not returned by the API.');
      }
      downloadBlob(
        base64ToBlob(artifactBlob.contentBase64, artifactBlob.mimeType),
        artifactBlob.fileName,
      );
      onNotice(
        `Downloaded stored artifact ${artifactBlob.fileName} (${formatFileSize(
          artifactBlob.contentSizeBytes,
        )}).`,
      );
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleToggleInvoiceArtifactLegalHold() {
    if (
      !token ||
      billingAccessMessage ||
      !reconciliation ||
      !reconciliationSummary?.artifactId ||
      !reconciliationSummary.artifactBlobStored
    ) {
      onError(
        billingAccessMessage ?? 'Store an invoice artifact file before changing legal hold state.',
      );
      return;
    }

    const nextLegalHold = !reconciliationSummary.artifactLegalHold;

    setWorkspaceBusy('billing-artifact-legal-hold');
    onError(null);

    try {
      const legalHoldInput: InvoiceArtifactLegalHoldInput = {
        legalHold: nextLegalHold,
        reason: nextLegalHold
          ? 'Placed from workspace demo panel before retention enforcement.'
          : 'Released from workspace demo panel after review evidence was checked.',
      };
      const updated = await client.setInvoiceArtifactLegalHold(
        reconciliation.id,
        reconciliationSummary.artifactId,
        legalHoldInput,
        token,
      );

      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice(
        nextLegalHold
          ? 'Legal hold placed. Retention purge will skip this artifact until released.'
          : 'Legal hold released. Retention policy can apply again after review.',
      );
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleUpdateInvoiceArtifactReview(reviewStatus: InvoiceArtifactReviewStatus) {
    if (
      !token ||
      billingAccessMessage ||
      !reconciliation ||
      !reconciliationSummary?.artifactId ||
      !reconciliationSummary.artifactBlobStored ||
      reviewStatus === 'not-requested'
    ) {
      onError(
        billingAccessMessage ??
          'Store an invoice artifact file before changing review workflow state.',
      );
      return;
    }

    setWorkspaceBusy(`billing-artifact-review-${reviewStatus}`);
    onError(null);

    try {
      const reviewInput: InvoiceArtifactReviewInput = {
        reviewStatus,
        reviewer: 'finance-review@example.com',
        ...(reviewStatus === 'pending'
          ? {
              notes: 'Submitted from workspace panel for finance/legal artifact review.',
            }
          : {
              evidenceReference: `review://invoice-artifacts/${reconciliationSummary.artifactId}/${reviewStatus}`,
              notes:
                reviewStatus === 'approved'
                  ? 'Demo reviewer approved artifact governance packet after checksum and retention review.'
                  : 'Demo reviewer rejected artifact packet; provider invoice-of-record evidence is still incomplete.',
            }),
      };
      const updated = await client.updateInvoiceArtifactReview(
        reconciliation.id,
        reconciliationSummary.artifactId,
        reviewInput,
        token,
      );

      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice(
        reviewStatus === 'pending'
          ? 'Invoice artifact sent to the review queue.'
          : `Invoice artifact review ${reviewStatus}.`,
      );
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleUpdateInvoiceArtifactPolicyException(
    exceptionStatus: InvoiceArtifactPolicyExceptionStatus,
  ) {
    if (
      !token ||
      billingAccessMessage ||
      !reconciliation ||
      !reconciliationSummary?.artifactId ||
      !reconciliationSummary.artifactBlobStored ||
      exceptionStatus === 'not-requested' ||
      exceptionStatus === 'expired'
    ) {
      onError(
        billingAccessMessage ??
          'Store an invoice artifact file before changing policy exception state.',
      );
      return;
    }

    setWorkspaceBusy(`billing-artifact-exception-${exceptionStatus}`);
    onError(null);

    try {
      const artifactId = reconciliationSummary.artifactId;
      const exceptionInput: InvoiceArtifactPolicyExceptionInput = {
        exceptionStatus,
        reviewer: 'risk-review@example.com',
        reason:
          exceptionStatus === 'requested'
            ? 'Requesting a time-boxed policy exception while provider invoice-of-record evidence is still incomplete.'
            : exceptionStatus === 'approved'
              ? 'Approving a time-boxed exception for demo governance review; invoice-grade validation remains blocked.'
              : 'Rejecting the exception because provider invoice-of-record evidence remains insufficient.',
        ...(exceptionStatus === 'approved'
          ? {
              expiresAt: futureIsoTimestamp(30),
              evidenceReference: `exception://invoice-artifacts/${artifactId}/approved`,
              notes:
                'Approved as a temporary risk acceptance only. This does not mark the artifact invoice-grade verified.',
            }
          : exceptionStatus === 'rejected'
            ? {
                evidenceReference: `exception://invoice-artifacts/${artifactId}/rejected`,
                notes:
                  'Exception rejected; collect provider invoice controls before relying on invoice-grade evidence.',
              }
            : {
                expiresAt: futureIsoTimestamp(14),
                notes:
                  'Queued for policy owner review with explicit expiry target and invoice-grade caveat.',
              }),
      };
      const updated = await client.updateInvoiceArtifactPolicyException(
        reconciliation.id,
        artifactId,
        exceptionInput,
        token,
      );

      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice(
        exceptionStatus === 'requested'
          ? 'Policy exception requested for this artifact.'
          : `Policy exception ${exceptionStatus}.`,
      );
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleVerifyInvoiceArtifact() {
    if (!token || billingAccessMessage || !reconciliation || !reconciliationSummary?.artifactId) {
      onError(
        billingAccessMessage ??
          'Register invoice artifact metadata before marking an artifact verified.',
      );
      return;
    }

    setWorkspaceBusy('billing-artifact-verify');
    onError(null);

    try {
      const verificationInput: InvoiceGradeArtifactVerificationInput = {
        verificationStatus: 'verified',
        evidenceReference: `review://invoice-artifacts/${reconciliationSummary.artifactId}`,
        controlTotalUsd: reconciliation.invoicedTotalUsd,
        ...(reconciliationSummary.artifactBlobSha256
          ? { sha256: reconciliationSummary.artifactBlobSha256 }
          : {}),
        notes:
          'Demo verification based on stored artifact checksum and matching invoice control total. Full provider contract verification remains future scope.',
      };
      const updated = await client.verifyInvoiceGradeArtifact(
        reconciliation.id,
        reconciliationSummary.artifactId,
        verificationInput,
        token,
      );
      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice('Invoice artifact verification evidence recorded.');
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleValidateInvoiceControlPacket() {
    if (
      !token ||
      billingAccessMessage ||
      !reconciliation ||
      !reconciliationSummary?.artifactId ||
      !reconciliationSummary.artifactBlobStored ||
      reconciliationSummary.artifactVerifiedCount < 1
    ) {
      onError(
        billingAccessMessage ??
          'Store and verify an invoice artifact before validating invoice control totals.',
      );
      return;
    }

    setWorkspaceBusy('billing-invoice-control-validate');
    onError(null);

    try {
      const validationInput: InvoiceControlValidationInput = {
        acceptedVarianceUsd: 0.01,
        evidenceReference: `invoice-control://invoice-artifacts/${reconciliationSummary.artifactId}`,
        notes:
          'Control packet validation compares stored artifact total against imported actuals and reconciliation totals.',
      };
      const updated = await client.validateInvoiceControlPacket(
        reconciliation.id,
        reconciliationSummary.artifactId,
        validationInput,
        token,
      );
      const updatedSummary = reconciliationEvidenceSummary(updated);

      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice(
        `Invoice control validation ${updatedSummary.artifactInvoiceControlValidationStatus.replace(
          '-',
          ' ',
        )}.`,
      );
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleDownloadInvoiceEvidencePacket() {
    if (!token || billingAccessMessage || !reconciliation) {
      onError(
        billingAccessMessage ??
          'Run an estimate-vs-actual reconciliation before downloading an evidence packet.',
      );
      return;
    }

    setWorkspaceBusy('billing-evidence-packet');
    onError(null);

    try {
      const packet = await client.exportInvoiceEvidencePacket(reconciliation.id, token);
      const digestPrefix = packet.integrity.payloadDigestSha256.slice(0, 12);

      downloadBlob(
        new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' }),
        `polycost-invoice-evidence-${reconciliation.id.slice(0, 8)}-${digestPrefix}.json`,
      );
      onNotice(
        `Invoice evidence packet downloaded (${packet.packetStatus.replace(
          '-',
          ' ',
        )}; sha256 ${digestPrefix}).`,
      );
    } catch (packetError) {
      onError(formatApiError(packetError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  return (
    <section className="workspace-control-center" id="workspace" aria-label="Workspace controls">
      <div className="workspace-control-heading">
        <div>
          <span>Production hardening layer</span>
          <h2>Account, team, SSO readiness, and invoice reconciliation foundation</h2>
        </div>
        <strong>{session ? session.account.email : 'Local session required'}</strong>
      </div>

      <div className="workspace-control-grid">
        <section className="workspace-panel">
          <div className="workspace-panel-heading">
            <span>Workspace session</span>
            <strong>
              {session ? 'Connected' : authMode === 'register' ? 'Register' : 'Sign in'}
            </strong>
          </div>
          {invitePreview ? (
            <div className={`workspace-invite-preview is-${invitePreview.status}`}>
              <strong>
                Invite {invitePreview.status}
                {invitePreview.email ? ` · ${invitePreview.email}` : ''}
              </strong>
              <span>{invitePreview.message}</span>
            </div>
          ) : null}
          {sessionExpiredNotice && !session ? (
            <div className="workspace-session-policy is-expired" role="status">
              <strong>Workspace session expired</strong>
              <span>
                Anonymous comparisons still work. Sign in again for team, SSO, and billing-export
                controls.
              </span>
            </div>
          ) : null}
          {isSessionHydrating && token && !session ? (
            <SessionLoader
              compact
              phase="Verifying workspace access"
              steps={sessionHydrationSteps}
            />
          ) : session ? (
            <div className="workspace-session-summary">
              <span>{session.account.displayName ?? session.account.email}</span>
              <strong>
                {activeTeam ? `${activeTeam.name} · ${activeTeam.role}` : 'No active team'}
              </strong>
              {sessionStatus ? (
                <div className={`workspace-session-policy is-${sessionStatus.tone}`} role="status">
                  <strong>{sessionStatus.label}</strong>
                  <span>{sessionStatus.detail}</span>
                </div>
              ) : null}
              {activeTeamOptions.length > 0 ? (
                <label className="workspace-field">
                  <span>Active team</span>
                  <select
                    aria-label="Active team"
                    value={activeTeam?.id ?? ''}
                    disabled={workspaceBusy === 'switch-team'}
                    onChange={(event) => void handleActiveTeamSwitch(event.currentTarget.value)}
                  >
                    {activeTeamOptions.map((team) => (
                      <option key={team.teamId} value={team.teamId}>
                        {team.teamName} · {teamRoleLabel(team.role)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <form className="workspace-inline-form" onSubmit={handleProfileUpdate}>
                <label className="workspace-field">
                  <span>Profile email</span>
                  <input
                    value={profileEmail}
                    onChange={(event) => setProfileEmail(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Display name</span>
                  <input
                    value={profileDisplayName}
                    onChange={(event) => setProfileDisplayName(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Current password (email changes)</span>
                  <input
                    type="password"
                    value={profileCurrentPassword}
                    onChange={(event) => setProfileCurrentPassword(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'profile'}
                  loadingLabel="Saving..."
                >
                  Save profile
                </Button>
              </form>
              <form className="workspace-inline-form" onSubmit={handlePasswordChange}>
                <label className="workspace-field">
                  <span>Current password</span>
                  <input
                    type="password"
                    value={profileCurrentPassword}
                    onChange={(event) => setProfileCurrentPassword(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>New password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'password'}
                  loadingLabel="Changing..."
                >
                  Change password
                </Button>
              </form>
              <div className="workspace-session-list" aria-label="Active account sessions">
                {accountSessions.slice(0, 3).map((accountSession) => (
                  <span key={accountSession.id}>
                    {accountSession.current ? 'Current' : 'Other'} · last seen{' '}
                    {formatDateTime(accountSession.lastSeenAt)} · expires{' '}
                    {formatDateTime(accountSession.expiresAt)}
                  </span>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleRevokeOtherSessions()}
                loading={workspaceBusy === 'revoke-sessions'}
                disabled={accountSessions.filter((item) => !item.current).length === 0}
              >
                <ShieldIcon />
                Sign out other devices
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleLogout()}
                loading={authBusy}
              >
                <SignInIcon />
                Sign out
              </Button>
              <form className="workspace-inline-form" onSubmit={handleAccountDeletion}>
                <label className="workspace-field">
                  <span>Delete confirmation</span>
                  <input
                    value={deleteConfirmation}
                    placeholder="DELETE"
                    onChange={(event) => setDeleteConfirmation(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Delete current password</span>
                  <input
                    type="password"
                    value={deleteCurrentPassword}
                    onChange={(event) => setDeleteCurrentPassword(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'delete-account'}
                  loadingLabel="Disabling..."
                  disabled={deleteConfirmation !== 'DELETE'}
                >
                  Disable account
                </Button>
              </form>
            </div>
          ) : (
            <form className="workspace-auth-form" onSubmit={handleAuthSubmit}>
              <div className="workspace-auth-toggle" role="group" aria-label="Authentication mode">
                <button
                  type="button"
                  className={authMode === 'login' ? 'is-active' : ''}
                  aria-pressed={authMode === 'login'}
                  onClick={() => setAuthMode('login')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={authMode === 'register' ? 'is-active' : ''}
                  aria-pressed={authMode === 'register'}
                  onClick={() => setAuthMode('register')}
                >
                  Register
                </button>
              </div>
              <label className="workspace-field">
                <span>Email</span>
                <input value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
              </label>
              <label className="workspace-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                />
              </label>
              {authMode === 'register' ? (
                <>
                  <label className="workspace-field">
                    <span>Display name</span>
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.currentTarget.value)}
                    />
                  </label>
                  <label className="workspace-field">
                    <span>Team name</span>
                    <input
                      value={teamName}
                      onChange={(event) => setTeamName(event.currentTarget.value)}
                    />
                  </label>
                </>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                loading={authBusy}
                loadingLabel="Connecting..."
              >
                <SignInIcon />
                {authMode === 'register' ? 'Create workspace' : 'Sign in'}
              </Button>
            </form>
          )}
        </section>

        <section className="workspace-panel">
          <div className="workspace-panel-heading">
            <span>Team access</span>
            <strong>{canManageTeam ? `${members.length} members` : 'Admin required'}</strong>
          </div>
          {canManageTeam && activeTeam && session && token ? (
            <>
              {isWorkspaceDirectoryLoading || workspaceDirectoryError ? (
                <SessionLoader
                  compact
                  identity={{
                    name: session.account.displayName ?? session.account.email,
                    detail: `${activeTeam.name} · ${activeTeam.role}`,
                  }}
                  phase={
                    workspaceDirectoryError
                      ? 'Workspace sync needs attention'
                      : 'Syncing team access'
                  }
                  steps={workspaceDirectorySteps}
                  trustCue={Boolean(token && session)}
                  error={workspaceDirectoryError}
                />
              ) : null}
              <form className="workspace-inline-form" onSubmit={handleCreateTeam}>
                <label className="workspace-field">
                  <span>New team</span>
                  <input
                    value={newTeamName}
                    onChange={(event) => setNewTeamName(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'create-team'}
                  loadingLabel="Creating..."
                >
                  Create team
                </Button>
              </form>
              <form className="workspace-inline-form" onSubmit={handleTeamSettingsUpdate}>
                <label className="workspace-field">
                  <span>Current team name</span>
                  <input
                    value={teamSettingsName}
                    onChange={(event) => setTeamSettingsName(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'team-settings'}
                  loadingLabel="Saving..."
                >
                  Save team
                </Button>
              </form>
              <div className="workspace-role-guide" aria-label="Role permissions">
                <span>Owner: billing, SSO, roles, deletion</span>
                <span>Admin: members, invites, SSO setup</span>
                <span>Member: comparisons and shared evidence</span>
              </div>
              <form className="workspace-inline-form" onSubmit={handleInvite}>
                <label className="workspace-field">
                  <span>Invite email</span>
                  <input
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Role</span>
                  <select
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(event.currentTarget.value as Exclude<TeamRole, 'owner'>)
                    }
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'invite'}
                  loadingLabel="Inviting..."
                >
                  <ParseIcon />
                  Invite
                </Button>
              </form>
              {lastInviteToken ? (
                <p className="workspace-token-output">
                  Invite token: {lastInviteToken}
                  {lastInviteUrl ? ` · URL: ${lastInviteUrl}` : ''}
                </p>
              ) : null}
              {lastInviteDelivery ? (
                <p className={`workspace-delivery-output is-${lastInviteDelivery.status}`}>
                  Delivery: {lastInviteDelivery.message}
                  {lastInviteDelivery.deliveredAt
                    ? ` · ${formatDateTime(lastInviteDelivery.deliveredAt)}`
                    : ''}
                </p>
              ) : null}
              <div className="workspace-member-list">
                {members.map((member) => {
                  const roleControl = memberRoleControlState({
                    actorRole: activeTeam.role,
                    currentAccountId: session.account.id,
                    member,
                    ownerCount,
                    busyKey: workspaceBusy,
                  });
                  const removeControl = memberRemoveControlState({
                    actorRole: activeTeam.role,
                    currentAccountId: session.account.id,
                    member,
                    ownerCount,
                    busyKey: workspaceBusy,
                  });

                  return (
                    <div className="workspace-member-row" key={member.accountId}>
                      <span>
                        <strong>{member.displayName ?? member.email}</strong>
                        <small>{member.email}</small>
                      </span>
                      <span className={`workspace-role-badge is-${member.role}`}>
                        {teamRoleLabel(member.role)}
                      </span>
                      <select
                        value={member.role}
                        aria-label={`Change role for ${member.email}`}
                        disabled={roleControl.disabled}
                        title={roleControl.reason}
                        onChange={(event) =>
                          void handleRoleChange(
                            member.accountId,
                            event.currentTarget.value as TeamRole,
                          )
                        }
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                      <Button
                        type="button"
                        variant="destructiveQuiet"
                        size="compact"
                        className="workspace-link-button"
                        aria-label={`Remove ${member.email}`}
                        disabled={removeControl.disabled}
                        title={removeControl.reason}
                        onClick={() => void handleRemoveMember(member.accountId)}
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="workspace-member-list" aria-label="Team invitations">
                {invitations
                  .filter(
                    (invitation) =>
                      invitation.status === 'pending' || invitation.status === 'expired',
                  )
                  .slice(0, 4)
                  .map((invitation) => (
                    <div className="workspace-member-row" key={invitation.id}>
                      <span>
                        <strong>{invitation.email}</strong>
                        <small>
                          {invitation.role} invite · {invitation.status} · expires{' '}
                          {formatDateTime(invitation.expiresAt)}
                        </small>
                      </span>
                      <span className="workspace-row-actions">
                        {invitation.status === 'pending' || invitation.status === 'expired' ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            loading={workspaceBusy === `resend-invite-${invitation.id}`}
                            loadingLabel="Refreshing..."
                            onClick={() => void handleResendInvitation(invitation.id)}
                          >
                            Resend
                          </Button>
                        ) : null}
                        {invitation.status === 'pending' ? (
                          <Button
                            type="button"
                            variant="destructiveQuiet"
                            size="compact"
                            className="workspace-link-button"
                            disabled={workspaceBusy === `revoke-invite-${invitation.id}`}
                            onClick={() => void handleRevokeInvitation(invitation.id)}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </span>
                    </div>
                  ))}
              </div>
              <form className="workspace-inline-form" onSubmit={handleAcceptInvitation}>
                <label className="workspace-field workspace-field-wide">
                  <span>Accept invite token</span>
                  <input
                    value={acceptToken}
                    onChange={(event) => setAcceptToken(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'accept-invite'}
                  loadingLabel="Accepting..."
                >
                  Accept
                </Button>
              </form>
              <div className="workspace-sso-status">
                <span>SSO readiness</span>
                <strong>
                  OIDC {ssoStatus?.oidcConfigured ? 'configured' : 'ready'} · SAML{' '}
                  {ssoStatus?.samlConfigured ? 'configured' : 'ready'}
                </strong>
                <small>
                  {invitations.filter((item) => item.status === 'pending').length} pending
                  invitations
                  {ssoStatus?.callbackUrls.oidc
                    ? ` · OIDC callback ${ssoStatus.callbackUrls.oidc}`
                    : ''}
                </small>
              </div>
              <div className="workspace-sso-status workspace-scim-status">
                <span>SCIM provisioning</span>
                <strong>
                  {activeScimTokenCount} active tokens · {activeScimUserCount} active users
                </strong>
                <small>
                  Tokens are shown once, then stored as hashes. Provisioned IdP users attach to this
                  team directory.
                </small>
              </div>
              <form className="workspace-inline-form" onSubmit={handleCreateScimToken}>
                <label className="workspace-field">
                  <span>SCIM token name</span>
                  <input
                    value={scimTokenDisplayName}
                    onChange={(event) => setScimTokenDisplayName(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Expires at (optional)</span>
                  <input
                    type="datetime-local"
                    value={scimTokenExpiresAt}
                    onChange={(event) => setScimTokenExpiresAt(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'scim-token-create'}
                  loadingLabel="Creating..."
                  disabled={!scimTokenDisplayName.trim()}
                >
                  Create SCIM token
                </Button>
              </form>
              {createdScimToken ? (
                <p className="workspace-token-output workspace-sensitive-token" role="status">
                  SCIM token: {createdScimToken.token} · Copy now. It will not be shown again.
                </p>
              ) : null}
              <div className="workspace-scim-grid">
                <div className="workspace-member-list workspace-scim-list" aria-label="SCIM tokens">
                  {scimTokens.length > 0 ? (
                    scimTokens.slice(0, 4).map((scimToken) => (
                      <div
                        className={`workspace-member-row ${scimToken.revokedAt ? 'is-muted' : ''}`}
                        key={scimToken.id}
                      >
                        <span>
                          <strong>{scimToken.displayName}</strong>
                          <small>
                            Prefix {scimToken.tokenPrefix} · created{' '}
                            {formatDateTime(scimToken.createdAt)}
                            {scimToken.lastUsedAt
                              ? ` · last used ${formatDateTime(scimToken.lastUsedAt)}`
                              : ' · never used'}
                            {scimToken.expiresAt
                              ? ` · expires ${formatDateTime(scimToken.expiresAt)}`
                              : ' · no expiry'}
                          </small>
                        </span>
                        <span
                          className={`workspace-role-badge ${
                            scimToken.revokedAt ? 'is-disabled' : 'is-admin'
                          }`}
                        >
                          {scimToken.revokedAt ? 'Revoked' : 'Active'}
                        </span>
                        {!scimToken.revokedAt ? (
                          <Button
                            type="button"
                            variant="destructiveQuiet"
                            size="compact"
                            className="workspace-link-button"
                            aria-label={`Revoke SCIM token ${scimToken.displayName}`}
                            loading={workspaceBusy === `scim-token-revoke-${scimToken.id}`}
                            loadingLabel="Revoking..."
                            onClick={() => void handleRevokeScimToken(scimToken.id)}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="workspace-empty-state">No SCIM tokens created yet.</p>
                  )}
                </div>
                <div
                  className="workspace-member-list workspace-scim-list"
                  aria-label="SCIM provisioned users"
                >
                  {scimUsers.length > 0 ? (
                    scimUsers.slice(0, 4).map((scimUser) => (
                      <div
                        className={`workspace-member-row ${scimUser.active ? '' : 'is-muted'}`}
                        key={scimUser.id}
                      >
                        <span>
                          <strong>{scimUser.displayName ?? scimUser.userName}</strong>
                          <small>
                            {scimUser.userName} · external {scimUser.externalId} · updated{' '}
                            {formatDateTime(scimUser.updatedAt)}
                          </small>
                        </span>
                        <span
                          className={`workspace-role-badge ${
                            scimUser.active ? 'is-member' : 'is-disabled'
                          }`}
                        >
                          {scimUser.active ? 'Active' : 'Deactivated'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="workspace-empty-state">
                      Provisioned IdP users will appear here after SCIM sync.
                    </p>
                  )}
                </div>
              </div>
              <div className="workspace-inline-form">
                <label className="workspace-field">
                  <span>Mock OIDC email</span>
                  <input
                    value={ssoLoginEmail}
                    onChange={(event) => setSsoLoginEmail(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  loading={workspaceBusy === 'sso-start'}
                  loadingLabel="Starting..."
                  onClick={() => void handleStartMockOidcLogin()}
                >
                  Start mock OIDC
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={workspaceBusy === 'sso-complete'}
                  loadingLabel="Completing..."
                  disabled={!ssoStart}
                  onClick={() => void handleCompleteMockOidcCallback()}
                >
                  Complete callback
                </Button>
              </div>
              {ssoStart ? (
                <p className="workspace-token-output">
                  Mock authorization: {ssoStart.authorizationUrl} · callback {ssoStart.callbackUrl}{' '}
                  · state expires {formatDateTime(ssoStart.expiresAt)}
                </p>
              ) : null}
              <form className="workspace-inline-form" onSubmit={handleConfigureSso}>
                <label className="workspace-field">
                  <span>SSO provider</span>
                  <select
                    value={ssoProviderType}
                    onChange={(event) =>
                      setSsoProviderType(event.currentTarget.value as 'oidc' | 'saml')
                    }
                  >
                    <option value="oidc">OIDC</option>
                    <option value="saml">SAML</option>
                  </select>
                </label>
                <label className="workspace-field">
                  <span>Display name</span>
                  <input
                    value={ssoDisplayName}
                    onChange={(event) => setSsoDisplayName(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field workspace-field-wide">
                  <span>Issuer URL</span>
                  <input
                    value={ssoIssuerUrl}
                    onChange={(event) => setSsoIssuerUrl(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Client ID</span>
                  <input
                    value={ssoClientId}
                    onChange={(event) => setSsoClientId(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Client secret</span>
                  <input
                    type="password"
                    value={ssoClientSecret}
                    onChange={(event) => setSsoClientSecret(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'sso-configure'}
                  loadingLabel="Saving..."
                >
                  Save SSO
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={workspaceBusy === 'sso-test'}
                  loadingLabel="Testing..."
                  onClick={() => void handleTestSsoConnection()}
                >
                  Test connection
                </Button>
              </form>
              <div className="workspace-audit-list" aria-label="Team audit trail">
                <div className="workspace-audit-heading">
                  <span>Recent audit trail</span>
                  <strong>{auditEvents.length} events</strong>
                </div>
                {auditEvents.length > 0 ? (
                  auditEvents.slice(0, 6).map((event) => (
                    <div className="workspace-audit-row" key={event.id}>
                      <span>
                        <strong>{teamAuditActionLabel(event.action)}</strong>
                        <small>{teamAuditEventDetail(event)}</small>
                      </span>
                      <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                    </div>
                  ))
                ) : (
                  <p className="workspace-empty-state">
                    Team, SSO, invite, and billing actions will appear here after the first audited
                    change.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="workspace-empty-state">
              Sign in as a team owner or admin to manage members, issue invite and SCIM tokens, and
              review SSO status.
            </p>
          )}
        </section>

        <form
          className="workspace-panel workspace-billing-panel"
          onSubmit={handleImportProviderExport}
        >
          <div className="workspace-panel-heading">
            <span>Actuals reconciliation</span>
            <strong>
              {billingImport
                ? `${billingImport.acceptedRows} rows imported`
                : billingAccessMessage
                  ? 'Admin required'
                  : 'Provider export'}
            </strong>
          </div>
          {billingAccessMessage ? (
            <p className="workspace-empty-state">{billingAccessMessage}</p>
          ) : null}
          <div className="workspace-billing-controls">
            <label className="workspace-field">
              <span>Provider</span>
              <select
                value={provider}
                disabled={Boolean(billingAccessMessage)}
                onChange={(event) => {
                  const nextProvider = event.currentTarget.value as ProviderId;
                  setProvider(nextProvider);
                  setExportContent(providerExportSample(nextProvider));
                }}
              >
                <option value="aws">AWS CUR</option>
                <option value="azure">Azure Cost Management</option>
                <option value="gcp">GCP Billing Export</option>
              </select>
            </label>
            <TextField
              label="Billing period start"
              value={billingPeriodStart}
              disabled={Boolean(billingAccessMessage)}
              onChange={setBillingPeriodStart}
            />
            <TextField
              label="Billing period end"
              value={billingPeriodEnd}
              disabled={Boolean(billingAccessMessage)}
              onChange={setBillingPeriodEnd}
            />
          </div>
          <label className="workspace-field workspace-export-field">
            <span>{sourceType} CSV or JSON content</span>
            <textarea
              value={exportContent}
              disabled={Boolean(billingAccessMessage)}
              onChange={(event) => setExportContent(event.currentTarget.value)}
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            loading={workspaceBusy === 'billing-import'}
            loadingLabel="Importing actuals..."
            disabled={Boolean(billingAccessMessage)}
          >
            <CompareIcon />
            Import & reconcile
          </Button>
          {billingImport ? (
            <div className="workspace-reconciliation-result">
              <span>Import {billingImport.importRun.id.slice(0, 8)}</span>
              <strong>{formatCurrency(billingImport.importRun.totalCostUsd)}</strong>
              <small>
                {reconciliation
                  ? `${reconciliation.status} · ${formatCurrency(
                      reconciliation.varianceUsd,
                    )} variance`
                  : 'Run a comparison to attach estimate-vs-actual evidence'}
              </small>
              {reconciliationSummary ? (
                <div className="workspace-reconciliation-audit">
                  <span>{reconciliationSummary.readiness}</span>
                  <small>
                    {reconciliationSummary.sourceFingerprintPercent}% source fingerprinted ·{' '}
                    {reconciliationSummary.skuMatchPercent}% SKU matched
                  </small>
                  <small>
                    Usage-comparable variance{' '}
                    {formatCurrency(reconciliationSummary.estimateComparableVarianceUsd)} ·{' '}
                    {reconciliationSummary.adjustmentLineItemCount} adjustment rows (
                    {formatCurrency(reconciliationSummary.adjustmentCostUsd)})
                  </small>
                  <small>
                    Invoice-grade readiness: {reconciliationSummary.invoiceGradeStatus} ·{' '}
                    {reconciliationSummary.invoiceGradeMissingCount} missing ·{' '}
                    {reconciliationSummary.invoiceGradePartialCount} partial
                  </small>
                  {reconciliationSummary.invoiceGradeBlockers.length > 0 ? (
                    <small>
                      Invoice blockers: {reconciliationSummary.invoiceGradeBlockers.join(', ')}
                    </small>
                  ) : null}
                  <small>
                    Artifact metadata: {reconciliationSummary.artifactRegisteredCount} registered ·{' '}
                    {reconciliationSummary.artifactVerifiedCount} verified ·{' '}
                    {reconciliationSummary.artifactRegisterStatus}
                  </small>
                  {reconciliationSummary.artifactBlobStored ? (
                    <>
                      <small>
                        Stored file: {reconciliationSummary.artifactBlobFileName} ·{' '}
                        {formatFileSize(reconciliationSummary.artifactBlobSizeBytes)} · sha256{' '}
                        {reconciliationSummary.artifactBlobSha256?.slice(0, 12)}
                      </small>
                      <small>
                        Governance: scan {reconciliationSummary.artifactMalwareScanStatus} · retain
                        until {formatDateTime(reconciliationSummary.artifactRetentionUntil)} · legal
                        hold {reconciliationSummary.artifactLegalHold ? 'on' : 'off'} ·{' '}
                        {reconciliationSummary.artifactKmsRequiredForProduction
                          ? 'KMS required for production'
                          : 'KMS reference recorded'}
                      </small>
                      <small>
                        Review queue: {reconciliationSummary.artifactReviewStatus.replace('-', ' ')}
                        {reconciliationSummary.artifactReviewReviewer
                          ? ` · ${reconciliationSummary.artifactReviewReviewer}`
                          : ''}{' '}
                        · pending {reconciliationSummary.artifactReviewPendingCount} · approved{' '}
                        {reconciliationSummary.artifactReviewApprovedCount} · rejected{' '}
                        {reconciliationSummary.artifactReviewRejectedCount}
                      </small>
                      <small>
                        Policy exception:{' '}
                        {reconciliationSummary.artifactPolicyExceptionStatus.replace('-', ' ')}
                        {reconciliationSummary.artifactPolicyExceptionReviewer
                          ? ` · ${reconciliationSummary.artifactPolicyExceptionReviewer}`
                          : ''}
                        {reconciliationSummary.artifactPolicyExceptionExpiresAt
                          ? ` · expires ${formatDateTime(
                              reconciliationSummary.artifactPolicyExceptionExpiresAt,
                            )}`
                          : ''}{' '}
                        · requested {reconciliationSummary.artifactPolicyExceptionRequestedCount} ·
                        approved {reconciliationSummary.artifactPolicyExceptionApprovedCount} ·
                        rejected {reconciliationSummary.artifactPolicyExceptionRejectedCount} ·
                        expired {reconciliationSummary.artifactPolicyExceptionExpiredCount}
                      </small>
                      <small>
                        Invoice control:{' '}
                        {reconciliationSummary.artifactInvoiceControlValidationStatus.replace(
                          '-',
                          ' ',
                        )}{' '}
                        · reconciliation delta{' '}
                        {formatSignedCurrency(
                          reconciliationSummary.artifactInvoiceControlTotalDeltaUsd,
                        )}{' '}
                        · import delta{' '}
                        {formatSignedCurrency(
                          reconciliationSummary.artifactInvoiceControlImportDeltaUsd,
                        )}{' '}
                        · period{' '}
                        {reconciliationSummary.artifactInvoiceControlValidationStatus === 'not-run'
                          ? 'pending'
                          : reconciliationSummary.artifactInvoiceControlPeriodMatched
                            ? 'matched'
                            : 'not matched'}{' '}
                        {reconciliationSummary.artifactInvoiceControlValidatedAt
                          ? `· ${formatDateTime(
                              reconciliationSummary.artifactInvoiceControlValidatedAt,
                            )}`
                          : ''}
                      </small>
                    </>
                  ) : reconciliationSummary.artifactId ? (
                    <small>
                      Artifact file not stored yet. Metadata is registered, but no evidence blob is
                      attached.
                    </small>
                  ) : null}
                  <small>{reconciliationSummary.artifactPrimaryCaveat}</small>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    loading={workspaceBusy === 'billing-evidence-packet'}
                    loadingLabel="Preparing packet..."
                    disabled={Boolean(billingAccessMessage)}
                    onClick={handleDownloadInvoiceEvidencePacket}
                  >
                    <CompareIcon />
                    Download evidence packet
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    loading={workspaceBusy === 'billing-artifact'}
                    loadingLabel="Registering artifact..."
                    disabled={Boolean(billingAccessMessage)}
                    onClick={handleRegisterInvoiceArtifact}
                  >
                    <CompareIcon />
                    Register invoice artifact
                  </Button>
                  {reconciliationSummary.artifactId && !reconciliationSummary.artifactBlobStored ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-upload'}
                      loadingLabel="Storing artifact..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={handleStoreInvoiceArtifactBlob}
                    >
                      <CompareIcon />
                      Store artifact file
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId && reconciliationSummary.artifactBlobStored ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-download'}
                      loadingLabel="Opening artifact..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={handleDownloadInvoiceArtifactBlob}
                    >
                      <CompareIcon />
                      Download stored file
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId && reconciliationSummary.artifactBlobStored ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-legal-hold'}
                      loadingLabel={
                        reconciliationSummary.artifactLegalHold
                          ? 'Releasing legal hold...'
                          : 'Placing legal hold...'
                      }
                      disabled={Boolean(billingAccessMessage)}
                      onClick={handleToggleInvoiceArtifactLegalHold}
                    >
                      <CompareIcon />
                      {reconciliationSummary.artifactLegalHold
                        ? 'Release legal hold'
                        : 'Place legal hold'}
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactBlobStored &&
                  reconciliationSummary.artifactReviewStatus === 'not-requested' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-review-pending'}
                      loadingLabel="Sending to review..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={() => void handleUpdateInvoiceArtifactReview('pending')}
                    >
                      <CompareIcon />
                      Send to review
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactBlobStored &&
                  reconciliationSummary.artifactReviewStatus === 'pending' ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        loading={workspaceBusy === 'billing-artifact-review-approved'}
                        loadingLabel="Approving review..."
                        disabled={Boolean(billingAccessMessage)}
                        onClick={() => void handleUpdateInvoiceArtifactReview('approved')}
                      >
                        <CompareIcon />
                        Approve review
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        loading={workspaceBusy === 'billing-artifact-review-rejected'}
                        loadingLabel="Rejecting review..."
                        disabled={Boolean(billingAccessMessage)}
                        onClick={() => void handleUpdateInvoiceArtifactReview('rejected')}
                      >
                        <CompareIcon />
                        Reject review
                      </Button>
                    </>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactBlobStored &&
                  (reconciliationSummary.artifactPolicyExceptionStatus === 'not-requested' ||
                    reconciliationSummary.artifactPolicyExceptionStatus === 'expired') ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-exception-requested'}
                      loadingLabel="Requesting exception..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={() => void handleUpdateInvoiceArtifactPolicyException('requested')}
                    >
                      <CompareIcon />
                      Request exception
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactBlobStored &&
                  reconciliationSummary.artifactPolicyExceptionStatus === 'requested' ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        loading={workspaceBusy === 'billing-artifact-exception-approved'}
                        loadingLabel="Approving exception..."
                        disabled={Boolean(billingAccessMessage)}
                        onClick={() => void handleUpdateInvoiceArtifactPolicyException('approved')}
                      >
                        <CompareIcon />
                        Approve exception
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        loading={workspaceBusy === 'billing-artifact-exception-rejected'}
                        loadingLabel="Rejecting exception..."
                        disabled={Boolean(billingAccessMessage)}
                        onClick={() => void handleUpdateInvoiceArtifactPolicyException('rejected')}
                      >
                        <CompareIcon />
                        Reject exception
                      </Button>
                    </>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactVerifiedCount <
                    reconciliationSummary.artifactRegisteredCount ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-verify'}
                      loadingLabel="Verifying artifact..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={handleVerifyInvoiceArtifact}
                    >
                      <CompareIcon />
                      Verify artifact evidence
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactBlobStored &&
                  reconciliationSummary.artifactVerifiedCount > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-invoice-control-validate'}
                      loadingLabel="Validating controls..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={handleValidateInvoiceControlPacket}
                    >
                      <CompareIcon />
                      Validate invoice control
                    </Button>
                  ) : null}
                  {reconciliationSummary.commitmentLineItemCount > 0 ? (
                    <>
                      <small>
                        Commitments: {reconciliationSummary.commitmentLineItemCount} rows · net{' '}
                        {formatCurrency(reconciliationSummary.commitmentNetCostUsd)}
                        {reconciliationSummary.commitmentCategories.length > 0
                          ? ` (${reconciliationSummary.commitmentCategories.join(', ')})`
                          : ''}
                      </small>
                      <small>
                        Commitment evidence needed:{' '}
                        {reconciliationSummary.commitmentRowsRequiringProviderInventory} inventory ·{' '}
                        {reconciliationSummary.commitmentRowsRequiringAmortizationPeriod}{' '}
                        amortization ·{' '}
                        {reconciliationSummary.commitmentRowsRequiringAllocationEvidence} allocation
                      </small>
                    </>
                  ) : null}
                  {reconciliationSummary.adjustmentCategories.length > 0 ? (
                    <small>
                      Adjustments: {reconciliationSummary.adjustmentCategories.join(', ')}
                    </small>
                  ) : null}
                  <small>{reconciliationSummary.primaryCaveat}</small>
                </div>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}

function AppHeader({
  resolvedTheme,
  themeChoice,
  accentChoice,
  onSignIn,
  onThemeChange,
  onAccentChange,
}: {
  resolvedTheme: ResolvedTheme;
  themeChoice: ThemeChoice;
  accentChoice: AccentChoice;
  onSignIn: () => void;
  onThemeChange: (choice: ThemeChoice) => void;
  onAccentChange: (choice: AccentChoice) => void;
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
        <ThemeSwitcher
          themeChoice={themeChoice}
          accentChoice={accentChoice}
          onThemeChange={onThemeChange}
          onAccentChange={onAccentChange}
        />
        <Button
          type="button"
          variant="secondary"
          className="app-signin-button"
          aria-label="Sign in"
          onClick={onSignIn}
        >
          <SignInIcon />
          <span className="app-signin-text">Sign in</span>
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
  diagramInput,
  diagramInputFormat,
  diagramParseResult,
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
  onDiagramInputChange,
  onRemoveDiagramComponent,
  onClassifyDiagramNode,
  onAddDiagramRequirement,
  onChange,
  onClearRequirements,
  onClearDiagramInput,
  onSubmit,
  onParseDiagram,
  onRestoreHistory,
  onClearHistory,
  onUseSample,
  onRequirementsFileLoad,
  onDiagramFileLoad,
  requirementsFileName,
  diagramFileName,
}: {
  form: WorkloadFormState;
  inputMode: InputMode;
  pricingModel: PricingModelKey;
  naturalLanguageInput: string;
  diagramInput: string;
  diagramInputFormat: DiagramInputFormat | 'auto';
  diagramParseResult: DiagramParseResult | null;
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
  onDiagramInputChange: (value: string) => void;
  onRemoveDiagramComponent: (nodeId: string) => void;
  onClassifyDiagramNode: (nodeId: string, serviceType: string) => void;
  onAddDiagramRequirement: (serviceType: string) => void;
  onChange: (form: WorkloadFormState) => void;
  onClearRequirements: () => void;
  onClearDiagramInput: () => void;
  onSubmit: (event?: FormEvent) => void;
  onParseDiagram: () => void;
  onRestoreHistory: (entry: ComparisonHistoryEntry) => void;
  onClearHistory: () => void;
  onUseSample: () => void;
  onRequirementsFileLoad: (file: File | null) => void | Promise<void>;
  onDiagramFileLoad: (file: File | null) => void | Promise<void>;
  requirementsFileName: string | null;
  diagramFileName: string | null;
}) {
  function update<K extends keyof WorkloadFormState>(key: K, value: WorkloadFormState[K]) {
    onChange(applyResidencyRegionLock({ ...form, [key]: value }));
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

  function updateInstanceTier(value: WorkloadFormState['instanceTier']) {
    onChange(applyComputeStorageDefault({ ...form, instanceTier: value }));
  }

  function applyComputeSizing(suggestion: ComputeSizePreset) {
    onChange(applyComputeSizingSuggestion(form, suggestion));
  }

  function applyTemplate(template: ArchitectureTemplate) {
    onChange(template.form);
  }

  const fieldErrors = validationIssueMap(validationIssues);

  return (
    <section className="initial-home" id="requirements" aria-labelledby="page-title">
      <div className="initial-home-brand">
        <h1 id="page-title">{POLYCOST_TAGLINE}</h1>
        <p>Compare AWS, Azure, and GCP costs — instantly.</p>
        <div className="initial-provider-badges" aria-label="Supported cloud providers">
          <ProviderBadge provider="aws" className="initial-provider-badge">
            <span className="provider-badge-dot" aria-hidden="true" />
            AWS
          </ProviderBadge>
          <ProviderBadge provider="azure" className="initial-provider-badge">
            <span className="provider-badge-dot" aria-hidden="true" />
            Azure
          </ProviderBadge>
          <ProviderBadge provider="gcp" className="initial-provider-badge">
            <span className="provider-badge-dot" aria-hidden="true" />
            GCP
          </ProviderBadge>
        </div>
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
                onChange={updateInstanceTier}
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
              <ComputeSizingAssistant form={form} compact onApply={applyComputeSizing} />
              <RegionSelectField
                value={form.regionPreference}
                dataResidency={form.dataResidency}
                complianceLocked={form.complianceLocked}
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
                  label="App requests"
                  value={form.appPlatformRequestsMillion}
                  inputMode="decimal"
                  suffix="M/mo"
                  error={fieldErrors.appPlatformRequestsMillion}
                  onChange={(value) => update('appPlatformRequestsMillion', value)}
                />
                <TextField
                  label="App vCPU"
                  value={form.appPlatformVcpu}
                  inputMode="decimal"
                  suffix="vCPU"
                  error={fieldErrors.appPlatformVcpu}
                  onChange={(value) => update('appPlatformVcpu', value)}
                />
                <TextField
                  label="App memory"
                  value={form.appPlatformMemoryGb}
                  inputMode="decimal"
                  suffix="GB"
                  error={fieldErrors.appPlatformMemoryGb}
                  onChange={(value) => update('appPlatformMemoryGb', value)}
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
                <TextField
                  label="AI training"
                  value={form.aiTrainingGpuHours}
                  inputMode="decimal"
                  suffix="GPU hrs"
                  error={fieldErrors.aiTrainingGpuHours}
                  onChange={(value) => update('aiTrainingGpuHours', value)}
                />
                <TextField
                  label="AI hosting"
                  value={form.aiModelHostingHours}
                  inputMode="decimal"
                  suffix="hrs"
                  error={fieldErrors.aiModelHostingHours}
                  onChange={(value) => update('aiModelHostingHours', value)}
                />
                <TextField
                  label="AI inference"
                  value={form.aiInferenceRequestsMillion}
                  inputMode="decimal"
                  suffix="M/mo"
                  error={fieldErrors.aiInferenceRequestsMillion}
                  onChange={(value) => update('aiInferenceRequestsMillion', value)}
                />
                <TextField
                  label="GenAI input"
                  value={form.aiApiInputTokensMillion}
                  inputMode="decimal"
                  suffix="M tokens"
                  error={fieldErrors.aiApiInputTokensMillion}
                  onChange={(value) => update('aiApiInputTokensMillion', value)}
                />
                <TextField
                  label="GenAI output"
                  value={form.aiApiOutputTokensMillion}
                  inputMode="decimal"
                  suffix="M tokens"
                  error={fieldErrors.aiApiOutputTokensMillion}
                  onChange={(value) => update('aiApiOutputTokensMillion', value)}
                />
              </div>
            </details>
          </form>
        ) : inputMode === 'diagram' ? (
          <div className="initial-diagram-form">
            <DiagramImportPanel
              value={diagramInput}
              format={diagramInputFormat}
              parseResult={diagramParseResult}
              isParsing={isComparing}
              onChange={onDiagramInputChange}
              onClear={onClearDiagramInput}
              onParse={onParseDiagram}
              onFileLoad={onDiagramFileLoad}
              fileName={diagramFileName}
              onRemoveComponent={onRemoveDiagramComponent}
              onClassifyNode={onClassifyDiagramNode}
              onAddRequirement={onAddDiagramRequirement}
            />
            {diagramParseResult ? (
              <div className="diagram-review-workspace">
                <div className="diagram-review-workload">
                  <RequirementReviewCards form={form} />
                  <div className="diagram-review-edit-hint">
                    <span>Editable sizing</span>
                    <strong>Review services, tune assumptions, then compare.</strong>
                  </div>
                </div>
                <details className="diagram-edit-details" open>
                  <summary>Edit parsed sizing</summary>
                  <WorkloadForm
                    form={form}
                    regionCatalog={regionCatalog}
                    regionCatalogError={regionCatalogError}
                    validationIssues={validationIssues}
                    onChange={onChange}
                    onSubmit={(event) => onSubmit(event)}
                  />
                </details>
              </div>
            ) : null}
            <div className="initial-home-actions">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  if (diagramParseResult) {
                    onSubmit();
                  } else {
                    onParseDiagram();
                  }
                }}
                loading={isComparing}
                loadingLabel={
                  diagramParseResult ? 'Comparing costs...' : compareLoadingLabel(inputMode)
                }
                disabled={isComparing}
              >
                {diagramParseResult ? <CompareIcon /> : <ParseIcon />}
                {diagramParseResult ? 'Compare costs' : compareButtonLabel(inputMode)}
              </Button>
            </div>
          </div>
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
  comparisonAnalytics,
  comparisonAnalyticsError,
  comparisonPricingEvidence,
  comparisonPricingEvidenceError,
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
  completedExportFormat,
  notice,
  error,
  naturalLanguageInput,
  diagramInput,
  diagramInputFormat,
  diagramParseResult,
  regionCatalog,
  regionCatalogError,
  validationIssues,
  dataHealth,
  dataHealthError,
  isComparisonAnalyticsLoading,
  isComparisonPricingEvidenceLoading,
  onClear,
  onEdit,
  onInputModeChange,
  onPricingModelChange,
  onNaturalLanguageChange,
  onDiagramInputChange,
  onRemoveDiagramComponent,
  onClassifyDiagramNode,
  onAddDiagramRequirement,
  onFormChange,
  onSubmit,
  onParse,
  onParseDiagram,
  onClearRequirements,
  onClearDiagramInput,
  onUseSample,
  onRequirementsFileLoad,
  onDiagramFileLoad,
  requirementsFileName,
  diagramFileName,
  onIntervalChange,
  onRefreshLive,
  onExport,
}: {
  client: PolyCostClient;
  comparison: ComparisonResult;
  comparisonAnalytics: ComparisonAnalyticsResponse | null;
  comparisonAnalyticsError: string | null;
  comparisonPricingEvidence: ComparisonPricingEvidenceResponse | null;
  comparisonPricingEvidenceError: string | null;
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
  completedExportFormat: ReportFormat | null;
  notice: string | null;
  error: string | null;
  naturalLanguageInput: string;
  diagramInput: string;
  diagramInputFormat: DiagramInputFormat | 'auto';
  diagramParseResult: DiagramParseResult | null;
  regionCatalog: RegionCatalogResponse | null;
  regionCatalogError: string | null;
  validationIssues: WorkloadFormIssue[];
  dataHealth: DataHealthResponse | null;
  dataHealthError: string | null;
  isComparisonAnalyticsLoading: boolean;
  isComparisonPricingEvidenceLoading: boolean;
  onClear: () => void;
  onEdit: () => void;
  onInputModeChange: (mode: InputMode) => void;
  onPricingModelChange: (model: PricingModelKey) => void;
  onNaturalLanguageChange: (value: string) => void;
  onDiagramInputChange: (value: string) => void;
  onRemoveDiagramComponent: (nodeId: string) => void;
  onClassifyDiagramNode: (nodeId: string, serviceType: string) => void;
  onAddDiagramRequirement: (serviceType: string) => void;
  onFormChange: (form: WorkloadFormState) => void;
  onSubmit: (event?: FormEvent) => void;
  onParse: () => void;
  onParseDiagram: () => void;
  onClearRequirements: () => void;
  onClearDiagramInput: () => void;
  onUseSample: () => void;
  onRequirementsFileLoad: (file: File | null) => void | Promise<void>;
  onDiagramFileLoad: (file: File | null) => void | Promise<void>;
  requirementsFileName: string | null;
  diagramFileName: string | null;
  onIntervalChange: (interval: IntervalKey) => void;
  onRefreshLive: () => void;
  onExport: (format: ReportFormat) => void;
}) {
  // The option the page is recommending; the service breakdown follows it rather
  // than pinning to a provider the reader has not been pointed at.
  const cheapestProviderResult = comparison
    ? (comparison.providers.find(
        (provider) => provider.providerId === comparison.cheapestProviderId,
      ) ?? comparison.providers[0])
    : undefined;

  return (
    <section className="progressive-results" id="requirements" aria-label="Cost comparison results">
      <div className="progressive-results-inner">
        {isEditingRequirements ? (
          <>
            <RequirementsEditPanel
              form={form}
              inputMode={inputMode}
              naturalLanguageInput={naturalLanguageInput}
              diagramInput={diagramInput}
              diagramInputFormat={diagramInputFormat}
              diagramParseResult={diagramParseResult}
              pricingModel={pricingModel}
              regionCatalog={regionCatalog}
              regionCatalogError={regionCatalogError}
              validationIssues={validationIssues}
              requirementsAwaitingReview={requirementsAwaitingReview}
              busyAction={busyAction}
              onClearRequirements={onClearRequirements}
              onClearDiagramInput={onClearDiagramInput}
              onFormChange={onFormChange}
              onInputModeChange={onInputModeChange}
              onPricingModelChange={onPricingModelChange}
              onNaturalLanguageChange={onNaturalLanguageChange}
              onDiagramInputChange={onDiagramInputChange}
              onRemoveDiagramComponent={onRemoveDiagramComponent}
              onClassifyDiagramNode={onClassifyDiagramNode}
              onAddDiagramRequirement={onAddDiagramRequirement}
              onParse={onParse}
              onParseDiagram={onParseDiagram}
              onSubmit={onSubmit}
              onUseSample={onUseSample}
              onRequirementsFileLoad={onRequirementsFileLoad}
              onDiagramFileLoad={onDiagramFileLoad}
              requirementsFileName={requirementsFileName}
              diagramFileName={diagramFileName}
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
              completedExportFormat={completedExportFormat}
              onExport={onExport}
              onRefreshLive={onRefreshLive}
            />

            <PricingModelRecommendationCallout comparison={comparison} />

            <StatusMessage notice={resultStatusNotice(notice)} error={error} />

            <ServerAnalyticsStatusStrip
              analytics={comparisonAnalytics}
              error={comparisonAnalyticsError}
              isLoading={isComparisonAnalyticsLoading}
            />

            <ProviderSummaryCards comparison={comparison} interval={interval} />

            {/*
              What am I paying for, for the option actually being recommended.
              The provider cards answer which cloud; this answers where the money
              goes, which is the question that changes an architecture.
            */}
            {cheapestProviderResult ? (
              <CostByService provider={cheapestProviderResult} formatCost={formatCurrency} />
            ) : null}

            <div className="progressive-analytics-stack" aria-label="Executive analytics">
              <ExecutiveAnalyticsPreview
                comparison={comparison}
                form={submittedForm}
                pricingModel={pricingModel}
                analytics={comparisonAnalytics}
              />
            </div>

            {/*
              No longer behind a disclosure. That toggle existed to hide a very
              long scroll; the tab strip does that job better, and nesting tabs
              inside a "show more" made the detail harder to reach than before.
            */}
            <div className="result-detail-stack" aria-label="Comparison detail">
              <StateDetailContent
                busyAction={busyAction}
                client={client}
                comparison={comparison}
                comparisonAnalytics={comparisonAnalytics}
                comparisonPricingEvidence={comparisonPricingEvidence}
                comparisonPricingEvidenceError={comparisonPricingEvidenceError}
                error={error}
                exportingFormat={exportingFormat}
                completedExportFormat={completedExportFormat}
                form={submittedForm}
                interval={interval}
                pricingModel={pricingModel}
                regionCatalog={regionCatalog}
                onExport={onExport}
                onIntervalChange={onIntervalChange}
                onPricingModelChange={onPricingModelChange}
                onRefreshLive={onRefreshLive}
                isComparisonPricingEvidenceLoading={isComparisonPricingEvidenceLoading}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function PricingModelRecommendationCallout({ comparison }: { comparison: ComparisonResult }) {
  const recommendation = comparison.pricingModelRecommendation;

  if (!recommendation) {
    return null;
  }

  return (
    <section className="pricing-model-recommendation" aria-label="Pricing model recommendation">
      <div className="pricing-model-recommendation-main">
        <span className="pricing-model-recommendation-kicker">
          Recommended scenario · {capitalize(recommendation.confidence)} confidence
        </span>
        <strong>{pricingModelSummaryLabel(recommendation.preferredModel)}</strong>
        <p>{recommendation.rationale}</p>
      </div>
      <div className="pricing-model-recommendation-signals" aria-label="Recommendation signals">
        <span>{capitalize(recommendation.sourceSignals.environment ?? 'unspecified env')}</span>
        <span>{recommendation.sourceSignals.commitmentPreferencePercent ?? 0}% commitment</span>
        <span>{capitalize(recommendation.sourceSignals.flexibilityBias)}</span>
      </div>
    </section>
  );
}

function ServerAnalyticsStatusStrip({
  analytics,
  error,
  isLoading,
}: {
  analytics: ComparisonAnalyticsResponse | null;
  error: string | null;
  isLoading: boolean;
}) {
  if (!analytics && !error && !isLoading) {
    return null;
  }

  const tone = error ? 'error' : isLoading ? 'loading' : 'ready';
  const coveredDimensionCount =
    analytics?.costCoverageMap.filter((entry) => entry.status === 'Covered').length ?? 0;

  return (
    <section
      className={`server-analytics-strip server-analytics-${tone}`}
      aria-label="Backend analytics status"
    >
      <div className="server-analytics-main">
        <span>{isLoading ? 'Server analytics syncing' : 'Server analytics'}</span>
        <strong>
          {error
            ? 'Backend intelligence unavailable'
            : analytics
              ? `Generated ${formatDateTime(analytics.generatedAt)}`
              : 'Preparing deterministic insights'}
        </strong>
        {error ? <p>{error}</p> : null}
      </div>
      <div className="server-analytics-metrics" aria-label="Backend analytics coverage">
        <ServerAnalyticsMetric
          label="Coverage"
          value={analytics ? String(coveredDimensionCount) : '...'}
        />
        <ServerAnalyticsMetric
          label="Deltas"
          value={analytics ? String(analytics.providerDeltaAnalysis.length) : '...'}
        />
        <ServerAnalyticsMetric
          label="Sensitivity"
          value={analytics ? String(analytics.sensitivityScenarios.length) : '...'}
        />
        <ServerAnalyticsMetric
          label="Findings"
          value={analytics ? String(analytics.finOpsFindings.length) : '...'}
        />
        <ServerAnalyticsMetric
          label="ROI"
          value={analytics ? String(analytics.commitmentRoiTimelines.length) : '...'}
        />
      </div>
    </section>
  );
}

function ServerAnalyticsMetric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
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
        <Button type="button" variant="destructiveQuiet" onClick={onClear}>
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
  completedExportFormat,
  exportingFormat,
  onExport,
  onRefreshLive,
}: {
  comparison: ComparisonResult;
  interval: IntervalKey;
  pricingModel: PricingModelKey;
  busyAction: BusyAction;
  completedExportFormat: ReportFormat | null;
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
  const taskItems = quickActionTaskItems(busyAction, exportingFormat, completedExportFormat);

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
          completedExportFormat={completedExportFormat}
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
          Refresh live catalog
        </Button>
      </div>
      <TaskQueue items={taskItems} />
    </section>
  );
}

function StateDetailContent({
  busyAction,
  client,
  comparison,
  comparisonAnalytics,
  comparisonPricingEvidence,
  comparisonPricingEvidenceError,
  error,
  exportingFormat,
  completedExportFormat,
  form,
  interval,
  pricingModel,
  regionCatalog,
  isComparisonPricingEvidenceLoading,
  onExport,
  onIntervalChange,
  onPricingModelChange,
  onRefreshLive,
}: {
  busyAction: BusyAction;
  client: PolyCostClient;
  comparison: ComparisonResult;
  comparisonAnalytics: ComparisonAnalyticsResponse | null;
  comparisonPricingEvidence: ComparisonPricingEvidenceResponse | null;
  comparisonPricingEvidenceError: string | null;
  error: string | null;
  exportingFormat: ReportFormat | null;
  completedExportFormat: ReportFormat | null;
  form: WorkloadFormState;
  interval: IntervalKey;
  pricingModel: PricingModelKey;
  regionCatalog: RegionCatalogResponse | null;
  isComparisonPricingEvidenceLoading: boolean;
  onExport: (format: ReportFormat) => void;
  onIntervalChange: (interval: IntervalKey) => void;
  onPricingModelChange: (model: PricingModelKey) => void;
  onRefreshLive: () => void;
}) {
  const isLoading = busyAction === 'compare' || busyAction === 'refresh';

  const resultTabs: ResultTab[] = [
    {
      id: 'executive',
      label: 'Executive brief',
      hint: 'Plain-language recommendation, forecast, and the board-ready PDF summary.',
      content: (
        <section className="state-detail-panel" aria-label="Executive recommendation and export">
          <ResultDetailHeading
            title="Executive decision brief"
            description="A plain-language recommendation, forecast, and board-ready PDF summary export."
          />
          <ExecutiveDecisionDashboard
            comparison={comparison}
            analytics={comparisonAnalytics}
            form={form}
            regionCatalog={regionCatalog}
            exportingFormat={exportingFormat}
            isLoading={isLoading}
            onExport={onExport}
          />
        </section>
      ),
    },
    {
      id: 'controls',
      label: 'Cost controls',
      hint: 'Periods, commitment scenarios, service mix, budget alerts, currency, and sharing.',
      content: (
        <section className="state-detail-panel" aria-label="Engineering cost controls">
          <ResultDetailHeading
            title="Engineering cost controls"
            description="Cost periods, commitment scenarios, compute/storage/egress mix, budget alerts, currency, and share workflow."
          />
          <EngineeringAnalyticsDashboard comparison={comparison} interval={interval} />
          <ServiceCheapestMatrix comparison={comparison} interval={interval} />
          <ProductionDepthAnalytics
            comparison={comparison}
            form={form}
            serverAnalytics={comparisonAnalytics}
          />
          <FullCostMatrixTable comparison={comparison} />
          <CostFormulaEvidence comparison={comparison} />
          <PricingEvidencePanel
            evidence={comparisonPricingEvidence}
            error={comparisonPricingEvidenceError}
            isLoading={isComparisonPricingEvidenceLoading}
          />
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
      ),
    },
    {
      id: 'architecture',
      label: 'Architecture',
      hint: 'Solution review, governance checks, resource rows, and API-facing JSON.',
      content: (
        <section className="state-detail-panel" aria-label="Architecture and engineering evidence">
          <ResultDetailHeading
            title="Architecture & engineering evidence"
            description="Solution architecture review, governance checks, sortable resource rows, CSV export, and API-facing JSON."
          />
          <ArchitectureWorkspace comparison={comparison} interval={interval} form={form} />
          <TerraformGenerationPanel client={client} comparison={comparison} form={form} />
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
      ),
    },
    {
      id: 'exports',
      label: 'Calculators & exports',
      hint: 'Provider calculator links, region references, live refresh, and report downloads.',
      content: (
        <section
          className="state-detail-panel"
          aria-label="Official calculators, regions, and exports"
        >
          <ResultDetailHeading
            title="Official calculators, regions & exports"
            description="Provider calculator links, official region references, live catalog refresh, and PDF/CSV/Excel report downloads."
          />
          <CloudCalculatorLinks regionCatalog={regionCatalog} />
          <div className="progressive-export-panel">
            <ExportBar
              disabled={busyAction !== null && busyAction !== 'export'}
              completedExportFormat={completedExportFormat}
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
              Refresh live catalog
            </Button>
          </div>
        </section>
      ),
    },
  ];

  return (
    <div className="state-detail-stack state-detail-stack-combined">
      <ResultTabs tabs={resultTabs} />
    </div>
  );
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
      <div className="pricing-model-preference-select-wrap">
        <select
          className="pricing-model-preference-select"
          aria-label="Pricing model"
          value={pricingModel}
          onChange={(event) => onPricingModelChange(event.currentTarget.value as PricingModelKey)}
        >
          {PRICING_MODEL_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
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
  const currentRateRows =
    health?.providers.reduce((total, provider) => total + provider.cache.currentRateRows, 0) ?? 0;
  const summary = dataHealthBannerSummary(health, error, currentRateRows);
  const detail = dataHealthBannerDetail(health, error);

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
        <small>{detail}</small>
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
                {` · ${provider.cache.currentRateRows} rates`}
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
  diagramInput,
  diagramInputFormat,
  diagramParseResult,
  pricingModel,
  regionCatalog,
  regionCatalogError,
  validationIssues,
  requirementsAwaitingReview,
  busyAction,
  onClearRequirements,
  onClearDiagramInput,
  onFormChange,
  onInputModeChange,
  onPricingModelChange,
  onNaturalLanguageChange,
  onDiagramInputChange,
  onRemoveDiagramComponent,
  onClassifyDiagramNode,
  onAddDiagramRequirement,
  onParse,
  onParseDiagram,
  onSubmit,
  onUseSample,
  onRequirementsFileLoad,
  onDiagramFileLoad,
  requirementsFileName,
  diagramFileName,
}: {
  form: WorkloadFormState;
  inputMode: InputMode;
  naturalLanguageInput: string;
  diagramInput: string;
  diagramInputFormat: DiagramInputFormat | 'auto';
  diagramParseResult: DiagramParseResult | null;
  pricingModel: PricingModelKey;
  regionCatalog: RegionCatalogResponse | null;
  regionCatalogError: string | null;
  validationIssues: WorkloadFormIssue[];
  requirementsAwaitingReview: boolean;
  busyAction: BusyAction;
  onClearRequirements: () => void;
  onClearDiagramInput: () => void;
  onFormChange: (form: WorkloadFormState) => void;
  onInputModeChange: (mode: InputMode) => void;
  onPricingModelChange: (model: PricingModelKey) => void;
  onNaturalLanguageChange: (value: string) => void;
  onDiagramInputChange: (value: string) => void;
  onRemoveDiagramComponent: (nodeId: string) => void;
  onClassifyDiagramNode: (nodeId: string, serviceType: string) => void;
  onAddDiagramRequirement: (serviceType: string) => void;
  onParse: () => void;
  onParseDiagram: () => void;
  onSubmit: (event?: FormEvent) => void;
  onUseSample: () => void;
  onRequirementsFileLoad: (file: File | null) => void | Promise<void>;
  onDiagramFileLoad: (file: File | null) => void | Promise<void>;
  requirementsFileName: string | null;
  diagramFileName: string | null;
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
      ) : inputMode === 'diagram' ? (
        <DiagramImportPanel
          value={diagramInput}
          format={diagramInputFormat}
          parseResult={diagramParseResult}
          isParsing={busyAction === 'parse'}
          onChange={onDiagramInputChange}
          onClear={onClearDiagramInput}
          onParse={onParseDiagram}
          onFileLoad={onDiagramFileLoad}
          fileName={diagramFileName}
          onRemoveComponent={onRemoveDiagramComponent}
          onClassifyNode={onClassifyDiagramNode}
          onAddRequirement={onAddDiagramRequirement}
          compact
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
      {(inputMode === 'form' || inputMode === 'diagram') && requirementsAwaitingReview ? (
        <RequirementReviewCards form={form} compact />
      ) : null}
      <div className="requirements-edit-actions">
        <Button
          type="button"
          variant="primary"
          onClick={() => void onSubmit()}
          loading={busyAction === 'compare'}
          loadingLabel={
            inputMode === 'diagram' && diagramParseResult
              ? 'Comparing...'
              : compareLoadingLabel(inputMode)
          }
          disabled={busyAction !== null && busyAction !== 'compare'}
        >
          {inputMode === 'diagram' && !diagramParseResult ? <ParseIcon /> : <CompareIcon />}
          {inputMode === 'form' && requirementsAwaitingReview
            ? 'Confirm & compare'
            : inputMode === 'diagram' && diagramParseResult
              ? 'Compare diagram estimate'
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
  const costs = comparison.providers.map((provider) => costForInterval(provider, interval));
  const lowestCost = costs.length > 0 ? Math.min(...costs) : undefined;
  // Rank, deliberately not share-of-spend. These three are alternatives for the
  // same workload, not a multi-cloud bill: you pick one. Dividing a provider by
  // the sum of all three would imply you are paying all of them, which is the
  // kind of number that survives into a slide and misleads someone.
  const rankByProvider = new Map<ProviderId, number>(
    [...comparison.providers]
      .sort((a, b) => costForInterval(a, interval) - costForInterval(b, interval))
      .map((provider, index) => [provider.providerId, index + 1]),
  );

  return (
    <section className="provider-summary-results" aria-label="Provider cost summary">
      <div className="provider-summary-grid">
        {PROVIDER_ORDER.map((providerId) => {
          const provider = providerResults.get(providerId);
          const isCheapest = comparison.cheapestProviderId === providerId && Boolean(provider);
          const cost = provider ? costForInterval(provider, interval) : undefined;
          const rank = rankByProvider.get(providerId);
          const overLowest =
            cost !== undefined && lowestCost !== undefined && lowestCost > 0
              ? (cost - lowestCost) / lowestCost
              : undefined;

          return (
            <article
              key={providerId}
              className={`provider-summary-card provider-summary-card-${providerId}`}
              aria-labelledby={`summary-${providerId}-title`}
            >
              <div className="provider-summary-heading">
                <div>
                  <h2 id={`summary-${providerId}-title`}>{providerLabel(providerId)}</h2>
                  <span>{providerSubtitle(providerId)}</span>
                </div>
                {rank !== undefined ? (
                  <span className="provider-summary-share">
                    #{rank} of {rankByProvider.size}
                  </span>
                ) : null}
              </div>
              <strong className="provider-summary-total">
                {cost !== undefined ? formatCurrency(cost) : 'Unavailable'}
              </strong>
              <span className="provider-summary-period">{capitalize(interval)} estimate</span>
              {provider ? (
                <span className="provider-summary-services">{topServiceSummary(provider)}</span>
              ) : null}
              <span className="provider-summary-delta">
                {isCheapest ? (
                  <span className="provider-summary-best">Lowest cost for this workload</span>
                ) : overLowest !== undefined ? (
                  `${(overLowest * 100).toFixed(1)}% above the lowest-cost option`
                ) : (
                  'Not priced for this workload'
                )}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The two or three services driving a provider's cost, as one line.
 *
 * A total on its own does not tell an architect anything actionable; knowing it
 * is mostly database rather than mostly compute does. Kept to three so the line
 * stays scannable, and to line items that actually cost something - a list
 * padded with $0.00 rows reads as noise.
 */
function topServiceSummary(provider: ComparisonProviderResult): string {
  const drivers = [...provider.lineItems]
    .filter((item) => item.baseMonthlyCostUsd > 0)
    .sort((a, b) => b.baseMonthlyCostUsd - a.baseMonthlyCostUsd)
    .slice(0, 3);

  if (drivers.length === 0) {
    return 'No priced line items';
  }

  return drivers
    .map((item) => `${item.description} ${formatCurrency(item.baseMonthlyCostUsd)}`)
    .join(' · ');
}

function ResultDetailHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="state-detail-heading">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function DiagramImportPanel({
  value,
  format,
  parseResult,
  isParsing,
  onChange,
  onClear,
  onParse,
  onFileLoad,
  fileName,
  onRemoveComponent,
  onClassifyNode,
  onAddRequirement,
  compact = false,
}: {
  value: string;
  format: DiagramInputFormat | 'auto';
  parseResult: DiagramParseResult | null;
  isParsing: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  onParse: () => void;
  onFileLoad: (file: File | null) => void | Promise<void>;
  fileName: string | null;
  onRemoveComponent: (nodeId: string) => void;
  onClassifyNode: (nodeId: string, serviceType: string) => void;
  onAddRequirement: (serviceType: string) => void;
  compact?: boolean;
}) {
  const supportedLabel = 'Mermaid, draw.io XML, Lucid CSV, or VSDX';

  return (
    <div className={compact ? 'diagram-import-panel is-compact' : 'diagram-import-panel'}>
      <div className="diagram-import-header">
        <div>
          <span>Diagram input</span>
          <strong>{supportedLabel}</strong>
        </div>
        <span className="diagram-format-pill">
          {format === 'auto' ? 'Auto detect' : formatLabel(format)}
        </span>
      </div>
      <label className="diagram-drop-zone" htmlFor={compact ? 'diagram-file-edit' : 'diagram-file'}>
        <UploadIcon />
        <span>Upload architecture diagram</span>
        <small>5MB max. Files are parsed into editable cloud-neutral requirements.</small>
      </label>
      <input
        id={compact ? 'diagram-file-edit' : 'diagram-file'}
        className="sr-only"
        type="file"
        accept={DIAGRAM_FILE_ACCEPT}
        disabled={isParsing}
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0] ?? null;

          void Promise.resolve(onFileLoad(file)).finally(() => {
            input.value = '';
          });
        }}
      />
      <label className="field-label" htmlFor={compact ? 'diagram-source-edit' : 'diagram-source'}>
        Paste diagram source
      </label>
      <textarea
        id={compact ? 'diagram-source-edit' : 'diagram-source'}
        className="diagram-source-textarea"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="Paste Mermaid flowchart text, draw.io XML, or Lucid CSV export content."
      />
      {fileName ? (
        <p className="requirements-file-status" role="status">
          Loaded from {fileName}
        </p>
      ) : null}
      {parseResult ? (
        <DiagramReviewPanel
          result={parseResult}
          onRemoveComponent={onRemoveComponent}
          onClassifyNode={onClassifyNode}
          onAddRequirement={onAddRequirement}
        />
      ) : null}
      <div className="action-row">
        <Button
          type="button"
          variant="primary"
          onClick={onParse}
          loading={isParsing}
          loadingLabel="Parsing diagram..."
          disabled={isParsing || value.trim().length === 0}
        >
          <ParseIcon />
          Parse diagram
        </Button>
        <Button
          type="button"
          variant="destructiveQuiet"
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

function DiagramReviewPanel({
  result,
  onRemoveComponent,
  onClassifyNode,
  onAddRequirement,
}: {
  result: DiagramParseResult;
  onRemoveComponent: (nodeId: string) => void;
  onClassifyNode: (nodeId: string, serviceType: string) => void;
  onAddRequirement: (serviceType: string) => void;
}) {
  const layoutPreview = diagramLayoutPreview(result.graph.nodes, result.graph.edges);
  const visualPreview = result.graph.visualPreviews?.[0];
  const renderingCaveat = result.graph.nodes
    .map((node) => node.visual?.renderingWarnings?.[0])
    .find((warning): warning is string => Boolean(warning));
  const visualPreviewCaveat = visualPreview?.warnings[0];

  return (
    <section className="diagram-review-panel" aria-label="Diagram parse review">
      <div className="diagram-review-summary">
        <span>Parser confidence</span>
        <strong>{result.parserConfidence}</strong>
        <small>
          {result.review.components.length} services · {result.graph.edges.length} links ·{' '}
          {result.review.unresolvedClassifications.length} unresolved
        </small>
        {visualPreview ? (
          <small>
            SVG preview · {visualPreview.nodeCount} nodes · {visualPreview.edgeCount} links
          </small>
        ) : null}
        {(visualPreviewCaveat ?? renderingCaveat) ? (
          <small>{visualPreviewCaveat ?? renderingCaveat}</small>
        ) : null}
      </div>
      <div
        className={`diagram-preview-pane${
          visualPreview || layoutPreview ? ' diagram-preview-pane-layout' : ''
        }`}
        aria-label="Diagram structure preview"
      >
        {visualPreview ? (
          <img
            className="diagram-preview-svg"
            src={svgDataUrl(visualPreview.svg)}
            alt={`Approximate diagram preview for ${visualPreview.pageName ?? 'VSDX page'}`}
          />
        ) : layoutPreview ? (
          [
            <svg
              className="diagram-preview-edges"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              key="edges"
              aria-hidden="true"
            >
              {layoutPreview.edges.map((edge) => (
                <line key={edge.id} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
              ))}
            </svg>,
            ...layoutPreview.nodes.map((node) => (
              <span
                className={`diagram-preview-node diagram-preview-node-${node.kind}`}
                key={node.id}
                style={node.style}
                title={node.visual?.pageName ?? node.sourceRef}
              >
                {node.displayLabel}
              </span>
            )),
          ]
        ) : (
          result.graph.nodes.slice(0, 12).map((node) => (
            <span
              className={`diagram-preview-node diagram-preview-node-${node.kind}`}
              key={node.id}
            >
              {node.displayLabel}
            </span>
          ))
        )}
        {!visualPreview && !layoutPreview && result.graph.nodes.length > 12 ? (
          <span className="diagram-preview-node diagram-preview-node-more">
            +{result.graph.nodes.length - 12} more
          </span>
        ) : null}
      </div>
      <div className="diagram-review-grid">
        {result.review.components.slice(0, 8).map((component) => (
          <article className="diagram-review-card" key={component.nodeId}>
            <span className={`confidence-badge confidence-${component.confidence}`}>
              {component.confidence}
            </span>
            <strong>{component.displayLabel}</strong>
            <small>
              {component.serviceCategory} · {component.serviceType}
            </small>
            {component.assumedDefaults.length > 0 ? (
              <em>{component.assumedDefaults.slice(0, 2).join(', ')}</em>
            ) : null}
            <em>{component.evidence}</em>
            <Button
              type="button"
              variant="destructiveQuiet"
              size="compact"
              className="diagram-review-link-button"
              onClick={() => onRemoveComponent(component.nodeId)}
            >
              Remove
            </Button>
          </article>
        ))}
      </div>
      {result.review.unresolvedClassifications.length > 0 ? (
        <div className="diagram-review-callout diagram-review-callout-risk">
          <span>Needs classification</span>
          <div className="diagram-review-unresolved-list">
            {result.review.unresolvedClassifications.slice(0, 4).map((node) => (
              <label className="diagram-review-select-row" key={node.id}>
                <span>{node.displayLabel}</span>
                <select
                  aria-label={`Classify ${node.displayLabel}`}
                  defaultValue=""
                  onChange={(event) => onClassifyNode(node.id, event.currentTarget.value)}
                >
                  <option value="" disabled>
                    Classify as
                  </option>
                  {DIAGRAM_REVIEW_SERVICE_OPTIONS.map((option) => (
                    <option key={option.serviceType} value={option.serviceType}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {result.review.ignoredNodes.length > 0 ? (
        <details className="diagram-review-callout">
          <summary>
            <span>Ignored decorative nodes</span>
            <strong>{result.review.ignoredNodes.length}</strong>
          </summary>
          <ul className="diagram-review-ignored-list">
            {result.review.ignoredNodes.slice(0, 8).map((node) => (
              <li key={`${node.sourceRef}-${node.id}`}>
                {node.displayLabel} · {node.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <label className="diagram-review-select-row diagram-review-add-row">
        <span>Add missing service</span>
        <select
          aria-label="Add missing diagram service"
          defaultValue=""
          onChange={(event) => {
            onAddRequirement(event.currentTarget.value);
            event.currentTarget.value = '';
          }}
        >
          <option value="" disabled>
            Add service
          </option>
          {DIAGRAM_REVIEW_SERVICE_OPTIONS.map((option) => (
            <option key={option.serviceType} value={option.serviceType}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </section>
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
          variant="destructiveQuiet"
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
  onSubmit: (event?: FormEvent) => void;
}) {
  function update<K extends keyof WorkloadFormState>(key: K, value: WorkloadFormState[K]) {
    onChange(applyResidencyRegionLock({ ...form, [key]: value }));
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

  function updateInstanceTier(value: WorkloadFormState['instanceTier']) {
    onChange(applyComputeStorageDefault({ ...form, instanceTier: value }));
  }

  function applyComputeSizing(suggestion: ComputeSizePreset) {
    onChange(applyComputeSizingSuggestion(form, suggestion));
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
            dataResidency={form.dataResidency}
            complianceLocked={form.complianceLocked}
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
          <ComputeSizingAssistant form={form} onApply={applyComputeSizing} />
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
            onChange={updateInstanceTier}
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
            <small>Functions, app hosting, Kubernetes overhead, registry transfer</small>
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
              label="App requests"
              value={form.appPlatformRequestsMillion}
              inputMode="decimal"
              suffix="M/mo"
              error={fieldErrors.appPlatformRequestsMillion}
              onChange={(value) => update('appPlatformRequestsMillion', value)}
            />
            <TextField
              label="App request duration"
              value={form.appPlatformRequestDurationMs}
              inputMode="decimal"
              suffix="ms"
              error={fieldErrors.appPlatformRequestDurationMs}
              onChange={(value) => update('appPlatformRequestDurationMs', value)}
            />
            <TextField
              label="App vCPU"
              value={form.appPlatformVcpu}
              inputMode="decimal"
              suffix="vCPU"
              error={fieldErrors.appPlatformVcpu}
              onChange={(value) => update('appPlatformVcpu', value)}
            />
            <TextField
              label="App memory"
              value={form.appPlatformMemoryGb}
              inputMode="decimal"
              suffix="GB"
              error={fieldErrors.appPlatformMemoryGb}
              onChange={(value) => update('appPlatformMemoryGb', value)}
            />
            <TextField
              label="Always-on hours"
              value={form.appPlatformAlwaysOnHours}
              inputMode="decimal"
              suffix="hrs/mo"
              error={fieldErrors.appPlatformAlwaysOnHours}
              onChange={(value) => update('appPlatformAlwaysOnHours', value)}
            />
            <TextField
              label="Minimum instances"
              value={form.appPlatformMinInstances}
              inputMode="numeric"
              suffix="instances"
              error={fieldErrors.appPlatformMinInstances}
              onChange={(value) => update('appPlatformMinInstances', value)}
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
                label="Object count"
                value={form.objectCountThousand}
                inputMode="decimal"
                suffix="k objects"
                disabled={!form.storageEnabled}
                error={fieldErrors.objectCountThousand}
                onChange={(value) => update('objectCountThousand', value)}
              />
              <TextField
                label="Object retention"
                value={form.objectRetentionDays}
                inputMode="numeric"
                suffix="days"
                disabled={!form.storageEnabled}
                error={fieldErrors.objectRetentionDays}
                onChange={(value) => update('objectRetentionDays', value)}
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
              <CheckboxField
                label="Block multi-attach"
                icon="storage"
                checked={form.multiAttachEnabled}
                disabled={!form.storageEnabled || form.storageType !== 'block'}
                onChange={(checked) => update('multiAttachEnabled', checked)}
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
                ['sql_server', 'SQL Server'],
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
              <small>Backups, IOPS, replicas, NoSQL units, RU/s, search, query TB</small>
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
              <TextField
                label="Search nodes"
                value={form.databaseSearchNodeCount}
                inputMode="numeric"
                suffix="nodes"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseSearchNodeCount}
                onChange={(value) => update('databaseSearchNodeCount', value)}
              />
              <TextField
                label="Search hours"
                value={form.databaseSearchNodeHours}
                inputMode="decimal"
                suffix="hrs/mo"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseSearchNodeHours}
                onChange={(value) => update('databaseSearchNodeHours', value)}
              />
              <TextField
                label="Search index"
                value={form.databaseSearchStorageGb}
                inputMode="decimal"
                suffix="GB"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseSearchStorageGb}
                onChange={(value) => update('databaseSearchStorageGb', value)}
              />
              <TextField
                label="Search queries"
                value={form.databaseSearchQueriesMillion}
                inputMode="decimal"
                suffix="M/mo"
                disabled={!form.databaseEnabled}
                error={fieldErrors.databaseSearchQueriesMillion}
                onChange={(value) => update('databaseSearchQueriesMillion', value)}
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

      <FormSection title="AI + ML" tone="data">
        <div className="form-grid secondary-grid">
          <TextField
            label="Training GPU hours"
            value={form.aiTrainingGpuHours}
            inputMode="decimal"
            suffix="GPU hrs"
            error={fieldErrors.aiTrainingGpuHours}
            onChange={(value) => update('aiTrainingGpuHours', value)}
          />
          <TextField
            label="Model hosting"
            value={form.aiModelHostingHours}
            inputMode="decimal"
            suffix="hrs/mo"
            error={fieldErrors.aiModelHostingHours}
            onChange={(value) => update('aiModelHostingHours', value)}
          />
          <TextField
            label="Inference requests"
            value={form.aiInferenceRequestsMillion}
            inputMode="decimal"
            suffix="M/mo"
            error={fieldErrors.aiInferenceRequestsMillion}
            onChange={(value) => update('aiInferenceRequestsMillion', value)}
          />
          <TextField
            label="Vector storage"
            value={form.aiVectorStorageGb}
            inputMode="decimal"
            suffix="GB"
            error={fieldErrors.aiVectorStorageGb}
            onChange={(value) => update('aiVectorStorageGb', value)}
          />
          <TextField
            label="Vector queries"
            value={form.aiVectorQueriesMillion}
            inputMode="decimal"
            suffix="M/mo"
            error={fieldErrors.aiVectorQueriesMillion}
            onChange={(value) => update('aiVectorQueriesMillion', value)}
          />
          <TextField
            label="GenAI input"
            value={form.aiApiInputTokensMillion}
            inputMode="decimal"
            suffix="M tokens"
            error={fieldErrors.aiApiInputTokensMillion}
            onChange={(value) => update('aiApiInputTokensMillion', value)}
          />
          <TextField
            label="GenAI output"
            value={form.aiApiOutputTokensMillion}
            inputMode="decimal"
            suffix="M tokens"
            error={fieldErrors.aiApiOutputTokensMillion}
            onChange={(value) => update('aiApiOutputTokensMillion', value)}
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
            label="Destination region"
            value={form.interRegionDestination}
            inputMode="text"
            error={fieldErrors.interRegionDestination}
            onChange={(value) => update('interRegionDestination', value)}
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
            label="CDN requests"
            value={form.cdnRequestsMillion}
            inputMode="decimal"
            suffix="M/mo"
            error={fieldErrors.cdnRequestsMillion}
            onChange={(value) => update('cdnRequestsMillion', value)}
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
          <TextField
            label="LB new conn"
            value={form.loadBalancerNewConnectionsPerSecond}
            inputMode="decimal"
            suffix="/sec"
            error={fieldErrors.loadBalancerNewConnectionsPerSecond}
            onChange={(value) => update('loadBalancerNewConnectionsPerSecond', value)}
          />
          <TextField
            label="LB active conn"
            value={form.loadBalancerActiveConnections}
            inputMode="numeric"
            suffix="conn"
            error={fieldErrors.loadBalancerActiveConnections}
            onChange={(value) => update('loadBalancerActiveConnections', value)}
          />
          <TextField
            label="LB rule eval"
            value={form.loadBalancerRuleEvaluationsPerSecond}
            inputMode="decimal"
            suffix="/sec"
            error={fieldErrors.loadBalancerRuleEvaluationsPerSecond}
            onChange={(value) => update('loadBalancerRuleEvaluationsPerSecond', value)}
          />
          <details className="advanced-service-fields form-grid-span">
            <summary>
              <span>Private connectivity</span>
              <small>Site-to-site VPN, private circuits, and private data transfer</small>
            </summary>
            <div className="form-grid secondary-grid">
              <TextField
                label="VPN connections"
                value={form.vpnConnectionCount}
                inputMode="numeric"
                suffix="connections"
                error={fieldErrors.vpnConnectionCount}
                onChange={(value) => update('vpnConnectionCount', value)}
              />
              <TextField
                label="VPN hours/mo"
                value={form.vpnConnectionHours}
                inputMode="decimal"
                suffix="hrs"
                error={fieldErrors.vpnConnectionHours}
                onChange={(value) => update('vpnConnectionHours', value)}
              />
              <TextField
                label="VPN transfer"
                value={form.vpnDataTransferGb}
                inputMode="decimal"
                suffix="GB"
                error={fieldErrors.vpnDataTransferGb}
                onChange={(value) => update('vpnDataTransferGb', value)}
              />
              <TextField
                label="Private circuits"
                value={form.privateCircuitCount}
                inputMode="numeric"
                suffix="circuits"
                error={fieldErrors.privateCircuitCount}
                onChange={(value) => update('privateCircuitCount', value)}
              />
              <TextField
                label="Circuit port hours"
                value={form.privateCircuitPortHours}
                inputMode="decimal"
                suffix="hrs"
                error={fieldErrors.privateCircuitPortHours}
                onChange={(value) => update('privateCircuitPortHours', value)}
              />
              <TextField
                label="Circuit transfer"
                value={form.privateCircuitDataTransferGb}
                inputMode="decimal"
                suffix="GB"
                error={fieldErrors.privateCircuitDataTransferGb}
                onChange={(value) => update('privateCircuitDataTransferGb', value)}
              />
            </div>
          </details>
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
        <Button
          type="button"
          variant="destructiveQuiet"
          size="compact"
          className="comparison-history-clear"
          onClick={onClear}
        >
          Clear history
        </Button>
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

function ComputeSizingAssistant({
  form,
  compact = false,
  onApply,
}: {
  form: WorkloadFormState;
  compact?: boolean;
  onApply: (suggestion: ComputeSizePreset) => void;
}) {
  const [query, setQuery] = useState('');
  const suggestions = computeSizingSuggestions(query, form).slice(0, compact ? 2 : 3);
  const inputId = compact ? 'initial-compute-sizing-search' : 'compute-sizing-search';

  return (
    <div className={compact ? 'compute-sizing-assistant is-compact' : 'compute-sizing-assistant'}>
      <label className="compute-sizing-search" htmlFor={inputId}>
        <span>Sizing search</span>
        <input
          id={inputId}
          className="compute-sizing-input"
          value={query}
          placeholder="8 vCPU 32GB memory optimized"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <div className="compute-sizing-options" aria-label="Compute sizing suggestions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            className="compute-sizing-option"
            onClick={() => onApply(suggestion)}
          >
            <strong>{suggestion.label}</strong>
            <small>
              {suggestion.vcpu} vCPU / {suggestion.memoryGb}GB · {suggestion.fit}
            </small>
            <small>{suggestion.families}</small>
            <span>{computeSizingSignal(suggestion)}</span>
          </button>
        ))}
      </div>
    </div>
  );
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
  dataResidency,
  complianceLocked,
  regionCatalog,
  regionCatalogError,
  compact = false,
  onChange,
}: {
  value: string;
  dataResidency: string;
  complianceLocked: boolean;
  regionCatalog: RegionCatalogResponse | null;
  regionCatalogError: string | null;
  compact?: boolean;
  onChange: (value: string) => void;
}) {
  const catalog = regionCatalog ?? FALLBACK_REGION_CATALOG;
  const allowedComparisonRegions = complianceLocked
    ? canonicalRegionsForResidencyScope(dataResidency)
    : undefined;
  const providerCatalogs = PROVIDER_ORDER.map((providerId) =>
    catalog.providers.find((provider) => provider.providerId === providerId),
  )
    .filter((provider): provider is RegionCatalogResponse['providers'][number] => Boolean(provider))
    .map((provider) => ({
      ...provider,
      regions: complianceLocked
        ? provider.regions.filter((region) =>
            isRegionPreferenceAllowedForResidency(region.id, dataResidency),
          )
        : provider.regions,
    }));
  const regionCount = providerCatalogs.reduce(
    (count, provider) => count + provider.regions.length,
    0,
  );
  const comparisonRegionGroups = allowedComparisonRegions
    ? COMPARISON_REGION_GROUPS.filter((group) => allowedComparisonRegions.includes(group.id))
    : COMPARISON_REGION_GROUPS;
  const selectedComparisonRegion = comparisonRegionGroups.find((group) => group.id === value);
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
          {comparisonRegionGroups.map((group) => (
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
          {catalogLabel} · {regionCount} provider regions ·{' '}
          {complianceLocked && allowedComparisonRegions
            ? `${dataResidency.toUpperCase()} residency lock filters non-compliant regions.`
            : 'comparable groups normalize AWS, Azure, and GCP pricing.'}
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
          <div
            className="bulk-service-table-wrap"
            tabIndex={0}
            aria-label="Bulk service import preview table"
          >
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
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="bulk-service-add"
            disabled={matchedRows.length === 0}
            onClick={addMatchedRows}
          >
            Add matched services
          </Button>
        </div>
      ) : null}

      <div className="bulk-service-current" aria-label="Imported service rows">
        <div className="bulk-service-current-heading">
          <span>Imported rows</span>
          <strong>{rows.length}</strong>
        </div>
        {rows.length > 0 ? (
          <div
            className="bulk-service-table-wrap"
            tabIndex={0}
            aria-label="Current bulk service mappings table"
          >
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
                        <Button
                          type="button"
                          variant="destructiveQuiet"
                          size="compact"
                          onClick={() => removeRow(row.id)}
                        >
                          Remove
                        </Button>
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

function applyComputeSizingSuggestion(
  form: WorkloadFormState,
  suggestion: ComputeSizePreset,
): WorkloadFormState {
  const serviceFamilyId = suggestion.tier === 'small' ? 'burstable-compute' : 'vm-compute';

  return applyComputeStorageDefault({
    ...form,
    selectedServiceCategory: 'compute',
    selectedServiceFamilyId: serviceFamilyId,
    selectedServiceFamilyIds: orderedServiceFamilyIds([
      ...form.selectedServiceFamilyIds,
      serviceFamilyId,
    ]),
    instanceTier: suggestion.tier,
    processorArchitecture: suggestion.tier === 'accelerated' ? 'gpu' : form.processorArchitecture,
    vcpu: String(suggestion.vcpu),
    memoryGb: String(suggestion.memoryGb),
  });
}

function applyComputeStorageDefault(form: WorkloadFormState): WorkloadFormState {
  if (!shouldApplyComputeStorageDefault(form)) {
    return form;
  }

  const storageDefault = computeStorageDefaultForTier(form.instanceTier);

  return {
    ...form,
    storageEnabled: true,
    storageRole: storageDefault.storageRole,
    storageType: storageDefault.storageType,
    storageSizeGb: storageDefault.sizeGb,
    storageAccessPattern: storageDefault.storageAccessPattern,
    storageClass: storageDefault.storageClass,
    provisionedIops: storageDefault.provisionedIops ?? '0',
    provisionedThroughputMbps: storageDefault.provisionedThroughputMbps ?? '0',
  };
}

function computeSizingSuggestions(query: string, form: WorkloadFormState): ComputeSizePreset[] {
  const intent = computeSizingIntent(query, form);

  return [...COMPUTE_SIZE_PRESETS].sort(
    (left, right) =>
      computePresetScore(left, intent) - computePresetScore(right, intent) ||
      left.vcpu - right.vcpu ||
      left.memoryGb - right.memoryGb,
  );
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
  completedExportFormat,
  disabled,
  exportingFormat,
  onExport,
}: {
  completedExportFormat?: ReportFormat | null;
  disabled: boolean;
  exportingFormat: ReportFormat | null;
  onExport: (format: ReportFormat) => void;
}) {
  return (
    <div className="export-bar" aria-label="Export comparison">
      {(['pdf', 'csv', 'xlsx'] as ReportFormat[]).map((format) => {
        const label = reportFormatLabel(format);
        const isExporting = exportingFormat === format;
        const isCompleted = !exportingFormat && completedExportFormat === format;

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
            {isCompleted ? `${label} downloaded` : label}
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
  analytics = null,
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
  analytics?: ComparisonAnalyticsResponse | null;
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
          <TerraformGenerationPanel client={client} comparison={comparison} form={form} />
          <ServiceCheapestMatrix comparison={comparison} interval={interval} />
          <ProductionDepthAnalytics
            comparison={comparison}
            form={form}
            serverAnalytics={analytics}
          />
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
  analytics,
  comparison,
  exportingFormat,
  form,
  isLoading,
  pricingModel,
  onExport,
}: {
  analytics?: ComparisonAnalyticsResponse | null;
  comparison: ComparisonResult | null;
  exportingFormat?: ReportFormat | null;
  form: WorkloadFormState;
  isLoading?: boolean;
  pricingModel: PricingModelKey;
  onExport?: (format: ReportFormat) => void;
}) {
  return (
    <section className="demo-overview" aria-label="Executive analytics overview">
      <ExecutiveAnalyticsPreview
        analytics={analytics}
        comparison={comparison}
        form={form}
        pricingModel={pricingModel}
      />
      <ExecutiveDecisionDashboard
        analytics={analytics}
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
  analytics: serverAnalytics,
  comparison,
  form,
  pricingModel,
}: {
  analytics?: ComparisonAnalyticsResponse | null;
  comparison: ComparisonResult | null;
  form: WorkloadFormState;
  pricingModel: PricingModelKey;
}) {
  const analytics = useMemo(() => executiveAnalyticsModel(comparison, form), [comparison, form]);
  const pricedCount = analytics.pricedMonthlySummaries.length;
  const totalMonthly = analytics.totalMonthlyAcrossProviders;
  const forecast = executiveForecastForCheapest(serverAnalytics, comparison);

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
        <div
          className={forecast ? 'executive-trend-ready' : 'executive-trend-pending'}
          role="status"
        >
          <span>{forecast ? 'Server projection' : 'Trend pending'}</span>
          <strong>
            {forecast
              ? `${formatCurrency(forecast.ninetyDayRunRateUsd)} over 90 days`
              : 'Historical spend data not yet available'}
          </strong>
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
        <Suspense fallback={<div className="provider-mix-empty">Loading chart…</div>}>
          <ProviderMixDonut data={analytics.providerMix} />
        </Suspense>
      </article>

      <ExecutiveCostWaterfall analytics={serverAnalytics} comparison={comparison} />

      <ExecutivePricingModelBars comparison={comparison} />

      <ExecutiveBreakEvenTimeline analytics={serverAnalytics} comparison={comparison} />

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
          value={forecast ? formatCurrency(forecast.ninetyDayRunRateUsd) : 'Pending'}
          detail={
            forecast
              ? `${providerLabel(forecast.providerId)} run-rate projection`
              : 'Backend projection pending'
          }
          providerId={forecast?.providerId}
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
  analytics: serverAnalytics,
  comparison,
  form,
  regionCatalog,
  exportingFormat,
  isLoading,
  onExport,
}: {
  analytics?: ComparisonAnalyticsResponse | null;
  comparison: ComparisonResult | null;
  form: WorkloadFormState;
  regionCatalog: RegionCatalogResponse | null;
  exportingFormat: ReportFormat | null;
  isLoading: boolean;
  onExport?: (format: ReportFormat) => void;
}) {
  const analytics = useMemo(() => executiveAnalyticsModel(comparison, form), [comparison, form]);
  const decision = analytics.review.executiveDecision;
  const recommendation = executiveRecommendation(analytics, form, regionCatalog);
  const forecast = executiveForecastForCheapest(serverAnalytics, comparison);

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
            <strong>{forecast ? 'Server projection ready' : 'Pending backend series'}</strong>
          </div>
          <div
            className={forecast ? 'executive-data-gap-chart is-ready' : 'executive-data-gap-chart'}
            role="status"
          >
            <span>{forecast ? '90-day run-rate projection' : 'Trend data not yet available'}</span>
            <p>
              {forecast
                ? `${providerLabel(forecast.providerId)} projects to ${formatCurrency(
                    forecast.ninetyDayRunRateUsd,
                  )} over 90 days and ${formatCurrency(
                    forecast.annualizedRunRateUsd,
                  )} annualized. ${serverAnalytics?.executiveForecast.assumption ?? ''}`
                : 'PolyCost has current comparison totals, but no exposed historical cost series yet. The projection stays pending instead of showing fabricated trend data.'}
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

function ExecutiveBreakEvenTimeline({
  analytics,
  comparison,
}: {
  analytics?: ComparisonAnalyticsResponse | null;
  comparison: ComparisonResult | null;
}) {
  const timeline = breakEvenTimelineModel(comparison, analytics?.commitmentRoiTimelines);

  return (
    <article className="executive-break-even-card">
      <div className="executive-card-heading">
        <span>Break-even timeline</span>
        <strong>
          {timeline ? `${timeline.providerLabel} commitment ROI` : 'Commitment data pending'}
        </strong>
      </div>

      {timeline ? (
        <>
          <div className="break-even-chart-wrap">
            <svg
              className="break-even-chart"
              viewBox="0 0 360 180"
              role="img"
              aria-label={`${timeline.providerLabel} ${timeline.pricingLabel} break-even at month ${timeline.breakEvenMonth}`}
            >
              <title>
                {timeline.providerLabel} {timeline.pricingLabel} cumulative cost versus on-demand
              </title>
              <line className="break-even-axis" x1="42" x2="334" y1="142" y2="142" />
              <line className="break-even-grid" x1="42" x2="334" y1="86" y2="86" />
              <polyline
                className="break-even-line break-even-line-demand"
                points={timeline.onDemandPoints}
              />
              <polyline
                className="break-even-line break-even-line-commit"
                points={timeline.committedPoints}
              />
              {timeline.breakEvenPoint ? (
                <g className="break-even-point">
                  <circle cx={timeline.breakEvenPoint.x} cy={timeline.breakEvenPoint.y} r="5" />
                  <text x={timeline.breakEvenPoint.x + 8} y={timeline.breakEvenPoint.y - 8}>
                    Month {timeline.breakEvenMonth}
                  </text>
                </g>
              ) : null}
              <text className="break-even-axis-label" x="42" y="164">
                Month 0
              </text>
              <text className="break-even-axis-label" x="292" y="164">
                Month {timeline.horizonMonths}
              </text>
              <text className="break-even-axis-label" x="42" y="20">
                {formatCurrency(timeline.yMax)}
              </text>
            </svg>
          </div>
          <div className="break-even-legend" aria-label="Break-even series">
            <span>
              <i className="break-even-dot-demand" aria-hidden="true" />
              On-demand {formatCurrency(timeline.onDemandMonthly)}/mo
            </span>
            <span>
              <i className="break-even-dot-commit" aria-hidden="true" />
              {timeline.pricingLabel} {formatCurrency(timeline.committedMonthly)}/mo
            </span>
          </div>
          <div className="break-even-metrics" aria-label="Break-even metrics">
            <span>
              <strong>
                {timeline.breakEvenMonth === 0 ? 'Immediate' : `Month ${timeline.breakEvenMonth}`}
              </strong>
              <small>Break-even</small>
            </span>
            <span>
              <strong>{formatCurrency(timeline.monthlySavings)}</strong>
              <small>Monthly savings</small>
            </span>
            <span>
              <strong>{formatCurrency(timeline.upfront)}</strong>
              <small>Upfront cash</small>
            </span>
          </div>
        </>
      ) : (
        <div className="provider-mix-empty" role="status">
          Run a comparison with reserved, Savings Plan, or CUD evidence to populate the ROI
          timeline.
        </div>
      )}
    </article>
  );
}

function breakEvenTimelineModel(
  comparison: ComparisonResult | null,
  serverTimelines?: ComparisonAnalyticsResponse['commitmentRoiTimelines'],
): BreakEvenTimelineModel | null {
  const serverTimeline = serverBreakEvenTimelineModel(
    serverTimelines,
    comparison?.cheapestProviderId,
  );

  if (serverTimeline) {
    return serverTimeline;
  }

  const candidates =
    comparison?.providers
      .map((provider) => {
        const commitment = bestCommitmentModel(provider);
        const onDemandMonthly =
          executiveModelMonthlyCost(provider, 'on-demand') ?? provider.totals.monthly;

        return {
          provider,
          commitment,
          onDemandMonthly,
          committedMonthly: commitment?.model.monthlyCostUsd,
        };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          provider: ComparisonProviderResult;
          commitment: NonNullable<ReturnType<typeof bestCommitmentModel>>;
          onDemandMonthly: number;
          committedMonthly: number;
        } =>
          Boolean(candidate.commitment) &&
          candidate.committedMonthly !== undefined &&
          candidate.onDemandMonthly > candidate.committedMonthly,
      ) ?? [];
  const selected = [...candidates].sort(
    (left, right) => left.committedMonthly - right.committedMonthly,
  )[0];

  if (!selected) {
    return null;
  }

  const { commitment, onDemandMonthly, provider } = selected;
  const committedMonthly = selected.committedMonthly;
  const monthlySavings = onDemandMonthly - committedMonthly;

  if (monthlySavings <= 0) {
    return null;
  }

  const upfront = commitment.model.upfrontCostUsd ?? 0;
  const breakEvenMonth = upfront > 0 ? Math.ceil(upfront / monthlySavings) : 0;
  const termMonths =
    commitment.model.commitmentTermMonths ?? commitmentTermMonths(commitment.model.model);
  const horizonMonths = Math.min(36, Math.max(termMonths, breakEvenMonth, 12));
  const yMax = roundCurrency(
    Math.max(onDemandMonthly * horizonMonths, upfront + committedMonthly * horizonMonths) * 1.08,
  );
  const months = breakEvenMonthsForHorizon(horizonMonths);
  const pointFor = (month: number, cost: number) => chartPoint(month, cost, horizonMonths, yMax);

  return {
    providerId: provider.providerId,
    providerLabel: providerLabel(provider.providerId),
    pricingLabel: commitment.model.displayName ?? pricingModelSummaryLabel(commitment.model.model),
    horizonMonths,
    breakEvenMonth,
    yMax,
    onDemandMonthly: roundCurrency(onDemandMonthly),
    committedMonthly: roundCurrency(committedMonthly),
    monthlySavings: roundCurrency(monthlySavings),
    upfront: roundCurrency(upfront),
    onDemandPoints: months
      .map((month) => pointFor(month, onDemandMonthly * month))
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
    committedPoints: months
      .map((month) => pointFor(month, upfront + committedMonthly * month))
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
    breakEvenPoint:
      breakEvenMonth > 0 && breakEvenMonth <= horizonMonths
        ? pointFor(breakEvenMonth, onDemandMonthly * breakEvenMonth)
        : undefined,
  };
}

function ExecutiveCostWaterfall({
  analytics,
  comparison,
}: {
  analytics?: ComparisonAnalyticsResponse | null;
  comparison: ComparisonResult | null;
}) {
  const provider = comparison?.providers.find(
    (candidate) => candidate.providerId === comparison.cheapestProviderId,
  );
  const serverComposition = analytics?.costComposition.find(
    (composition) => composition.providerId === provider?.providerId,
  );
  const steps = costWaterfallSteps(provider, serverComposition);
  const total = provider?.totals.monthly ?? 0;

  return (
    <article className="executive-waterfall-card">
      <div className="executive-card-heading">
        <span>Cost composition waterfall</span>
        <strong>
          {provider ? `${providerLabel(provider.providerId)} monthly build-up` : 'Pending'}
        </strong>
      </div>
      {provider && steps.length > 0 ? (
        <div className="executive-waterfall" aria-label="Cost composition waterfall bars">
          {steps.map((step) => (
            <div className="waterfall-row" key={step.label}>
              <span>{step.label}</span>
              <div className="waterfall-track" aria-hidden="true">
                <i style={{ width: `${step.percent}%` }} />
              </div>
              <strong>{formatCurrency(step.value)}</strong>
            </div>
          ))}
          <div className="waterfall-total">
            <span>Total</span>
            <strong>{formatCurrency(total)}</strong>
          </div>
        </div>
      ) : (
        <div className="provider-mix-empty" role="status">
          Run a comparison to populate cost composition.
        </div>
      )}
    </article>
  );
}

function costWaterfallSteps(provider?: ComparisonProviderResult): Array<{
  label: string;
  value: number;
  percent: number;
}>;
function costWaterfallSteps(
  provider: ComparisonProviderResult | undefined,
  serverComposition: ComparisonAnalyticsResponse['costComposition'][number] | undefined,
): Array<{
  label: string;
  value: number;
  percent: number;
}>;
function costWaterfallSteps(
  provider?: ComparisonProviderResult,
  serverComposition?: ComparisonAnalyticsResponse['costComposition'][number],
): Array<{
  label: string;
  value: number;
  percent: number;
}> {
  if (!provider || provider.totals.monthly <= 0) {
    return [];
  }

  if (serverComposition && serverComposition.items.length > 0) {
    return serverComposition.items
      .filter((item) => item.monthlyCostUsd > 0.005)
      .map((item) => ({
        label: item.label,
        value: roundCurrency(item.monthlyCostUsd),
        percent: Math.max(4, Math.min(100, item.percentOfProviderTotal)),
      }));
  }

  const breakdown = provider.breakdown;
  const values = [
    [
      'Compute base',
      breakdown?.computeMonthlyCostUsd ?? componentMonthlyTotal(provider, 'compute'),
    ],
    ['Storage', breakdown?.storageMonthlyCostUsd ?? componentMonthlyTotal(provider, 'storage')],
    ['Database', breakdown?.databaseMonthlyCostUsd ?? componentMonthlyTotal(provider, 'database')],
    ['Egress', breakdown?.egressMonthlyCostUsd ?? componentMonthlyTotal(provider, 'egress')],
    [
      'Networking',
      breakdown?.networkingMonthlyCostUsd ?? componentMonthlyTotal(provider, 'networking'),
    ],
    ['Support', breakdown?.supportMonthlyCostUsd ?? componentMonthlyTotal(provider, 'support')],
    [
      'Licensing',
      breakdown?.licensingMonthlyCostUsd ?? componentMonthlyTotal(provider, 'licensing'),
    ],
    [
      'Operations',
      breakdown?.operationsMonthlyCostUsd ?? componentMonthlyTotal(provider, 'operations'),
    ],
  ] as const;
  const accounted = values.reduce((sum, [, value]) => sum + value, 0);
  const other = Math.max(0, provider.totals.monthly - accounted);
  const steps = other > 0.005 ? [...values, ['Other', other] as const] : values;

  return steps
    .filter(([, value]) => value > 0.005)
    .map(([label, value]) => ({
      label,
      value: roundCurrency(value),
      percent: Math.max(4, Math.min(100, (value / provider.totals.monthly) * 100)),
    }));
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

function EngineeringAnalyticsDashboard({
  comparison,
  interval,
}: {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
}) {
  const analytics = useMemo(
    () => engineeringAnalyticsModel(comparison, interval),
    [comparison, interval],
  );

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
      <div className="table-wrap" tabIndex={0} aria-label="Per-service decision matrix table">
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
  serverAnalytics,
}: {
  comparison: ComparisonResult | null;
  form: WorkloadFormState;
  serverAnalytics?: ComparisonAnalyticsResponse | null;
}) {
  const insights = productionDepthInsights(comparison, form);
  const providerDeltas = providerDeltaRows(comparison);
  const computeSpecifications = computeSpecificationRows(comparison, form);
  const regionVariance = regionVarianceRows(
    comparison,
    form,
    serverAnalytics?.regionVarianceHeatMap,
  );
  const commitmentCoverage = commitmentCoverageGapRows(comparison, form);
  const tcoSignals = crossProviderTcoRows(comparison, form, serverAnalytics?.tcoSignals);
  const storageOptimizations = storageOptimizationRows(comparison, form);
  const storageAnatomy = storageAnatomyRows(comparison, form);
  const databaseOptimizations = databaseOptimizationRows(comparison, form);
  const databaseAnatomy = databaseAnatomyRows(comparison, form);
  const runtimeOptimizations = runtimeOptimizationRows(comparison, form);
  const serverlessMemoryCurves = serverlessMemoryCurveRows(comparison, form);
  const appPlatformModels = appPlatformModelRows(comparison, form);
  const operationsOptimizations = operationsOptimizationRows(comparison, form);
  const egressOptimizations = egressOptimizationRows(comparison, form);
  const networkingCosts = networkingCostRows(comparison, serverAnalytics?.egressNetworkingDetails);
  const spotBlendRows = spotBlendOptimizerRows(comparison, form);
  const licenseRows = licenseOptimizationRows(comparison, form);
  const architectureRisks = architectureRiskFlags(
    comparison,
    form,
    serverAnalytics?.finOpsFindings,
  );
  const scenarios = sensitivityScenarioRows(
    comparison,
    form,
    serverAnalytics?.sensitivityScenarios,
  );

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
      <ServerCostCoverageMapPanel rows={serverAnalytics?.costCoverageMap ?? []} />
      <ProviderDeltaAnalysisTable rows={providerDeltas} />
      <ComputeSpecificationPanel rows={computeSpecifications} />
      <RegionVariancePanel rows={regionVariance} />
      <ServerCommitmentExposurePanel rows={serverAnalytics?.commitmentCoverage ?? []} />
      <ServerOptimizationOpportunitiesPanel
        rows={serverAnalytics?.optimizationOpportunities ?? []}
      />
      <CommitmentCoverageGapPanel rows={commitmentCoverage} />
      <CrossProviderTcoPanel rows={tcoSignals} />
      <StorageOptimizationPanel rows={storageOptimizations} />
      <StorageAnatomyPanel rows={storageAnatomy} />
      <DatabaseOptimizationPanel rows={databaseOptimizations} />
      <DatabaseAnatomyPanel rows={databaseAnatomy} />
      <RuntimeOptimizationPanel
        rows={runtimeOptimizations}
        memoryCurveRows={serverlessMemoryCurves}
      />
      <AppPlatformModelPanel rows={appPlatformModels} />
      <OperationsOptimizationPanel rows={operationsOptimizations} />
      <EgressOptimizationPanel rows={egressOptimizations} />
      <NetworkingCostPanel rows={networkingCosts} />
      <SpotBlendOptimizerPanel rows={spotBlendRows} />
      <LicenseOptimizationPanel rows={licenseRows} operatingSystem={form.operatingSystem} />
      <ArchitectureRiskFlagsPanel flags={architectureRisks} />
      <ScenarioSensitivityTable rows={scenarios} />
    </section>
  );
}

function ProviderDeltaAnalysisTable({ rows }: { rows: ProviderDeltaRow[] }) {
  return (
    <div className="provider-delta-analysis" aria-label="Provider delta analysis">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Provider delta analysis</span>
          <h4>Why each service is cheaper</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap provider-delta-wrap"
          tabIndex={0}
          aria-label="Why each service is cheaper table"
        >
          <table className="ranking-table provider-delta-table">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Lowest</th>
                <th scope="col">Gap</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.category}>
                  <td>
                    <strong>{capitalize(row.category)}</strong>
                    <small>{row.coverage}</small>
                  </td>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.lowProviderId}`}>
                      {providerLabel(row.lowProviderId)}
                    </span>
                    <small>{formatCurrency(row.lowMonthly)}/mo</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.monthlyDelta)}/mo</strong>
                    <small>{formatPercent(row.savingsPercent)} below highest</small>
                  </td>
                  <td>
                    <strong>{row.insight}</strong>
                    <small>{row.evidence}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Run a comparison with at least two priced providers per service to explain provider
          deltas.
        </div>
      )}
    </div>
  );
}

function ServerCostCoverageMapPanel({
  rows,
}: {
  rows: ComparisonAnalyticsResponse['costCoverageMap'];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="provider-delta-analysis" aria-label="Backend cost coverage map">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Backend cost coverage map</span>
          <h4>Priced, approximate, and missing cost dimensions</h4>
        </div>
      </div>

      <div
        className="table-wrap provider-delta-wrap"
        tabIndex={0}
        aria-label="Cost dimension coverage table"
      >
        <table className="ranking-table provider-delta-table">
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <th scope="col">Dimension</th>
              <th scope="col">Status</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.providerId}-${row.dimension}`}>
                <td>
                  <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                    {providerLabel(row.providerId)}
                  </span>
                  <small>
                    {row.pricedRows} priced · {row.approximateRows} approximate
                  </small>
                </td>
                <td>
                  <strong>{row.dimension}</strong>
                  <small>
                    {row.monthlyUsd !== undefined
                      ? `${formatCurrency(row.monthlyUsd)}/mo`
                      : 'No priced monthly total'}
                  </small>
                </td>
                <td>
                  <strong>{row.status}</strong>
                  <small>{row.reviewCue}</small>
                </td>
                <td>
                  <small>{row.evidence}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComputeSpecificationPanel({ rows }: { rows: ComputeSpecificationRow[] }) {
  return (
    <div className="compute-specification-panel" aria-label="Compute specification matrix">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Compute specification matrix</span>
          <h4>Family, capacity, network/disk baseline, and architecture economics</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap compute-specification-wrap"
          tabIndex={0}
          aria-label="Compute specification comparison table"
        >
          <table className="ranking-table compute-specification-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Family/spec</th>
                <th scope="col">Requested capacity</th>
                <th scope="col">Network/disk baseline</th>
                <th scope="col">Economics</th>
                <th scope="col">Fit action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.architectureFit}</small>
                  </td>
                  <td>
                    <strong>{row.familyLabel}</strong>
                    <small>{row.evidence}</small>
                  </td>
                  <td>
                    <strong>{row.requestedCapacity}</strong>
                    <small>{row.tenancySignal}</small>
                  </td>
                  <td>
                    <strong>{row.networkBaseline}</strong>
                    <small>{row.diskBaseline}</small>
                  </td>
                  <td>
                    <strong>{row.economics}</strong>
                    <small>{row.armDelta}</small>
                  </td>
                  <td>
                    <strong>{row.recommendation}</strong>
                    <small>Validate exact SKU bandwidth, IOPS, and quota before procurement.</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Compute specification guidance appears after a comparison has provider compute rows.
        </div>
      )}
    </div>
  );
}

function RegionVariancePanel({ rows }: { rows: RegionVarianceRow[] }) {
  return (
    <div className="region-variance-panel" aria-label="Region variance heat map">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Region variance heat map</span>
          <h4>Modeled monthly sensitivity by compliant region</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap region-variance-wrap"
          tabIndex={0}
          aria-label="Region variance monthly sensitivity table"
        >
          <table className="ranking-table region-variance-table">
            <thead>
              <tr>
                <th scope="col">Region</th>
                {PROVIDER_ORDER.map((providerId) => (
                  <th scope="col" key={providerId}>
                    {providerLabel(providerId)}
                  </th>
                ))}
                <th scope="col">Low</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.regionId}>
                  <td>
                    <strong>{row.label}</strong>
                    <small>
                      {row.isSelected ? 'Current comparison region' : row.regionSummary}
                    </small>
                  </td>
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
                        key={`${row.regionId}-${providerId}`}
                      >
                        {provider ? (
                          <>
                            <strong>{formatCurrency(provider.modeledMonthly)}</strong>
                            <small>{formatSignedCurrency(provider.deltaVsSelected)}</small>
                            <small>{provider.providerRegion}</small>
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
                  <td>
                    <strong>{row.evidence}</strong>
                    <small>
                      {formatDecimal(row.multiplier)}x multiplier on current cached totals.
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Region variance is unavailable until a comparison is run for at least one provider.
        </div>
      )}
    </div>
  );
}

function ServerCommitmentExposurePanel({
  rows,
}: {
  rows: ComparisonAnalyticsResponse['commitmentCoverage'];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="commitment-coverage-panel" aria-label="Backend commitment exposure">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Backend commitment exposure</span>
          <h4>0% covered vs target blend vs 100% committed</h4>
        </div>
      </div>
      <div
        className="table-wrap commitment-coverage-wrap"
        tabIndex={0}
        aria-label="Commitment coverage cost table"
      >
        <table className="ranking-table commitment-coverage-table">
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <th scope="col">0% covered</th>
              <th scope="col">Target blend</th>
              <th scope="col">100% covered</th>
              <th scope="col">Exposure</th>
              <th scope="col">Backend recommendation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.providerId}>
                <td>
                  <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                    {providerLabel(row.providerId)}
                  </span>
                  <small>{formatCurrency(row.eligibleMonthlyUsd)}/mo eligible</small>
                </td>
                <td>
                  <strong>{formatCurrency(row.zeroCommitmentMonthlyUsd)}</strong>
                  <small>All on-demand</small>
                </td>
                <td>
                  <strong>{formatCurrency(row.targetBlendMonthlyUsd)}</strong>
                  <small>{formatPercent(row.targetCoveragePercent)} target coverage</small>
                </td>
                <td>
                  <strong>{formatCurrency(row.fullyCommittedMonthlyUsd)}</strong>
                  <small>{formatCurrency(row.maxMonthlySavingsUsd)}/mo max savings</small>
                </td>
                <td>
                  <strong>{formatCurrency(row.targetOnDemandExposureMonthlyUsd)}/mo</strong>
                  <small>{formatPercent(row.exposedPercentOfSpend)} exposed</small>
                </td>
                <td>
                  <strong>{formatCurrency(row.remainingOpportunityMonthlyUsd)}/mo open</strong>
                  <small>{row.recommendation}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ServerOptimizationOpportunitiesPanel({
  rows,
}: {
  rows: ComparisonAnalyticsResponse['optimizationOpportunities'];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="provider-delta-analysis" aria-label="Backend optimization opportunities">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Backend optimization opportunities</span>
          <h4>Top deterministic savings actions</h4>
        </div>
      </div>
      <div
        className="table-wrap provider-delta-wrap"
        tabIndex={0}
        aria-label="Top savings actions table"
      >
        <table className="ranking-table provider-delta-table">
          <thead>
            <tr>
              <th scope="col">Opportunity</th>
              <th scope="col">Savings</th>
              <th scope="col">Priority</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.category}</strong>
                  <small>{row.recommendation}</small>
                </td>
                <td>
                  <strong>
                    {row.estimatedMonthlySavingsUsd !== undefined
                      ? `${formatCurrency(row.estimatedMonthlySavingsUsd)}/mo`
                      : 'Review'}
                  </strong>
                  <small>
                    {row.estimatedAnnualSavingsUsd !== undefined
                      ? `${formatCurrency(row.estimatedAnnualSavingsUsd)}/yr`
                      : 'No modeled dollar impact'}
                  </small>
                </td>
                <td>
                  <strong>{row.priority}</strong>
                  <small>{row.effort} effort</small>
                </td>
                <td>
                  <small>{row.evidence}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CommitmentCoverageGapPanel({ rows }: { rows: CommitmentCoverageGapRow[] }) {
  return (
    <div className="commitment-coverage-panel" aria-label="Commitment coverage gap">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Commitment coverage gap</span>
          <h4>0% on-demand vs target blend vs 100% committed</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap commitment-coverage-wrap"
          tabIndex={0}
          aria-label="Commitment on-demand comparison table"
        >
          <table className="ranking-table commitment-coverage-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">0% covered</th>
                <th scope="col">Target blend</th>
                <th scope="col">100% covered</th>
                <th scope="col">Open gap</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.coverageLabel}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.onDemandMonthly)}</strong>
                    <small>All on-demand</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.targetBlendMonthly)}</strong>
                    <small>{formatPercent(row.targetCoveragePercent)} target coverage</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.committedMonthly)}</strong>
                    <small>{row.commitmentLabel}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.openGapMonthly)}/mo</strong>
                    <small>{formatPercent(row.exposedPercent)} exposed</small>
                  </td>
                  <td>
                    <strong>{row.evidence}</strong>
                    <small>
                      {formatCurrency(row.fullCoverageSavingsMonthly)}/mo max opportunity.
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Commitment coverage gap requires at least one provider with reserved, Savings Plan, or CUD
          pricing evidence.
        </div>
      )}
    </div>
  );
}

function CrossProviderTcoPanel({ rows }: { rows: CrossProviderTcoRow[] }) {
  return (
    <div className="cross-provider-tco-panel" aria-label="Cross-provider TCO signals">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Cross-provider TCO signals</span>
          <h4>Egress exit proxy, support plan, and free-tier fit</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="tco-signal-grid">
          {rows.map((row) => (
            <article
              className={`tco-signal-card tco-signal-${row.providerId}`}
              key={row.providerId}
            >
              <span>{providerLabel(row.providerId)}</span>
              <strong>{formatCurrency(row.threeYearRunRate)}</strong>
              <div className="tco-signal-metrics">
                <small>
                  Egress exit proxy
                  <b>{formatCurrency(row.egressExitProxy)}</b>
                </small>
                <small>
                  Support plan
                  <b>{formatCurrency(row.supportMonthly)}/mo</b>
                </small>
                <small>
                  Licensing
                  <b>{formatCurrency(row.licensingMonthly)}/mo</b>
                </small>
                <small>
                  Free-tier signal
                  <b>{row.freeTierSignal}</b>
                </small>
              </div>
              <p>{row.evidence}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Run a comparison to populate TCO signals beyond infrastructure run-rate.
        </div>
      )}
    </div>
  );
}

function StorageOptimizationPanel({ rows }: { rows: StorageOptimizationRow[] }) {
  return (
    <div className="storage-optimization-panel" aria-label="Storage optimization detail">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Storage optimization detail</span>
          <h4>Storage class, retrieval, snapshots, replication, and performance tuning</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap storage-optimization-wrap"
          tabIndex={0}
          aria-label="Storage optimization table"
        >
          <table className="ranking-table storage-optimization-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Storage share</th>
                <th scope="col">Dominant driver</th>
                <th scope="col">Opportunity</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.usageSignal}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.storageMonthly)}/mo</strong>
                    <small>{formatPercent(row.storageSharePercent)} of provider total</small>
                  </td>
                  <td>
                    <strong>{row.primaryDriver}</strong>
                    <small>{row.driverEvidence}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.monthlySavings)}/mo</strong>
                    <small>
                      {formatCurrency(row.annualSavings)}/yr · {row.effort} effort
                    </small>
                  </td>
                  <td>
                    <strong>{row.recommendation}</strong>
                    <small>{row.evidence}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Storage optimization appears when storage classes, operations, retrieval, snapshots,
          replication, or performance line items become material.
        </div>
      )}
    </div>
  );
}

function StorageAnatomyPanel({ rows }: { rows: StorageAnatomyRow[] }) {
  return (
    <div className="storage-anatomy-panel" aria-label="Storage cost anatomy matrix">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Storage cost anatomy</span>
          <h4>Classes, operations, retrieval, replication, snapshots, and IOPS</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap storage-anatomy-wrap"
          tabIndex={0}
          aria-label="Storage anatomy table"
        >
          <table className="ranking-table storage-anatomy-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Class/type</th>
                <th scope="col">Monthly cost</th>
                <th scope="col">Operations & retrieval</th>
                <th scope="col">Resilience & performance</th>
                <th scope="col">Validation action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.evidence}</small>
                  </td>
                  <td>
                    <strong>{row.storageProfile}</strong>
                    <small>{row.rateEvidence}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.monthly)}/mo</strong>
                    <small>{formatPercent(row.sharePercent)} of provider total</small>
                  </td>
                  <td>
                    <strong>{row.operationsSignal}</strong>
                    <small>Request and retrieval costs stay separate from stored GB.</small>
                  </td>
                  <td>
                    <strong>{row.resilienceSignal}</strong>
                    <small>{row.performanceSignal}</small>
                  </td>
                  <td>
                    <strong>{row.recommendation}</strong>
                    <small>
                      Use provider calculators for final class minimums and rehydration SLAs.
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Storage anatomy appears when storage, request, retrieval, replication, snapshot,
          lifecycle, or database-growth rows are present.
        </div>
      )}
    </div>
  );
}

function DatabaseOptimizationPanel({ rows }: { rows: DatabaseOptimizationRow[] }) {
  return (
    <div className="database-optimization-panel" aria-label="Database optimization detail">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Database optimization detail</span>
          <h4>NoSQL, RU/s, replicas, backups, cache, managed search, and query tuning</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap database-optimization-wrap"
          tabIndex={0}
          aria-label="Database optimization table"
        >
          <table className="ranking-table database-optimization-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Database share</th>
                <th scope="col">Dominant driver</th>
                <th scope="col">Opportunity</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.usageSignal}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.databaseMonthly)}/mo</strong>
                    <small>{formatPercent(row.databaseSharePercent)} of provider total</small>
                  </td>
                  <td>
                    <strong>{row.primaryDriver}</strong>
                    <small>{row.driverEvidence}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.monthlySavings)}/mo</strong>
                    <small>
                      {formatCurrency(row.annualSavings)}/yr · {row.effort} effort
                    </small>
                  </td>
                  <td>
                    <strong>{row.recommendation}</strong>
                    <small>{row.evidence}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Database optimization appears when NoSQL units, RU/s, replicas, backups, IOPS, cache, or
          warehouse query line items become material.
        </div>
      )}
    </div>
  );
}

function DatabaseAnatomyPanel({ rows }: { rows: DatabaseAnatomyRow[] }) {
  return (
    <div className="database-anatomy-panel" aria-label="Database cost anatomy matrix">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Database cost anatomy</span>
          <h4>Relational, NoSQL, cache, warehouse, search, backup, and IOPS</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap database-anatomy-wrap"
          tabIndex={0}
          aria-label="Database anatomy table"
        >
          <table className="ranking-table database-anatomy-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Workload model</th>
                <th scope="col">Monthly cost</th>
                <th scope="col">Capacity model</th>
                <th scope="col">HA / storage</th>
                <th scope="col">Analytics / cache / search</th>
                <th scope="col">Validation action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.evidence}</small>
                  </td>
                  <td>
                    <strong>{row.databaseProfile}</strong>
                    <small>{row.rateEvidence}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.monthly)}/mo</strong>
                    <small>{formatPercent(row.sharePercent)} of provider total</small>
                  </td>
                  <td>
                    <strong>{row.capacitySignal}</strong>
                    <small>Capacity-mode and RU/s math stays separate from storage.</small>
                  </td>
                  <td>
                    <strong>{row.resilienceSignal}</strong>
                    <small>Validate RPO/RTO, backups, and replica traffic.</small>
                  </td>
                  <td>
                    <strong>{row.analyticsSignal}</strong>
                    <small>Search, cache, warehouse storage, and query paths are itemized.</small>
                  </td>
                  <td>
                    <strong>{row.recommendation}</strong>
                    <small>
                      Use provider calculators for engine-specific limits and discounts.
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Database anatomy appears when relational, NoSQL, cache, warehouse, search, backup, IOPS,
          or replica rows are present.
        </div>
      )}
    </div>
  );
}

function RuntimeOptimizationPanel({
  rows,
  memoryCurveRows,
}: {
  rows: RuntimeOptimizationRow[];
  memoryCurveRows: ServerlessMemoryCurveRow[];
}) {
  return (
    <div className="runtime-optimization-panel" aria-label="Runtime optimization detail">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Runtime optimization detail</span>
          <h4>Functions, memory curve, Kubernetes overhead, registry, and platform fit</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap runtime-optimization-wrap"
          tabIndex={0}
          aria-label="Runtime optimization table"
        >
          <table className="ranking-table runtime-optimization-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Runtime share</th>
                <th scope="col">Dominant driver</th>
                <th scope="col">Opportunity</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.usageSignal}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.runtimeMonthly)}/mo</strong>
                    <small>{formatPercent(row.runtimeSharePercent)} of provider total</small>
                  </td>
                  <td>
                    <strong>{row.primaryDriver}</strong>
                    <small>{row.driverEvidence}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.monthlySavings)}/mo</strong>
                    <small>
                      {formatCurrency(row.annualSavings)}/yr · {row.effort} effort
                    </small>
                  </td>
                  <td>
                    <strong>{row.recommendation}</strong>
                    <small>{row.evidence}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Runtime optimization appears when function duration, invocation volume, Kubernetes
          control-plane/node overhead, or container registry transfer becomes material.
        </div>
      )}

      {memoryCurveRows.length > 0 && (
        <div
          className="table-wrap runtime-memory-curve-wrap"
          tabIndex={0}
          aria-label="Runtime memory curve table"
        >
          <table className="ranking-table runtime-memory-curve-table">
            <caption>Serverless memory-duration curve</caption>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Current shape</th>
                <th scope="col">2x memory break-even</th>
                <th scope="col">Cost signal</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {memoryCurveRows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.usageSignal}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.currentMonthly)}/mo</strong>
                    <small>
                      {formatDecimal(row.currentDurationMs)}ms @{' '}
                      {formatDecimal(row.currentMemoryMb)}MB
                    </small>
                  </td>
                  <td>
                    <strong>
                      {formatDecimal(row.breakEvenMemoryMb)}MB @{' '}
                      {formatDecimal(row.breakEvenDurationMs)}ms
                    </strong>
                    <small>linear GB-second knee</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.modeledMonthly)}/mo</strong>
                    <small>{formatPercent(row.deltaPercent)} delta at break-even</small>
                  </td>
                  <td>
                    <strong>{row.recommendation}</strong>
                    <small>{row.evidence}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AppPlatformModelPanel({ rows }: { rows: AppPlatformModelRow[] }) {
  return (
    <div className="app-platform-model-panel" aria-label="App platform model comparison">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>App platform model comparison</span>
          <h4>App Runner, App Service, and Cloud Run request-based vs always-on posture</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap app-platform-model-wrap"
          tabIndex={0}
          aria-label="App platform model table"
        >
          <table className="ranking-table app-platform-model-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Request-based</th>
                <th scope="col">Always-on</th>
                <th scope="col">Better model</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.usageSignal}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.requestBasedMonthly)}/mo</strong>
                    <small>{row.requestEvidence}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.alwaysOnMonthly)}/mo</strong>
                    <small>{row.alwaysOnEvidence}</small>
                  </td>
                  <td>
                    <strong>{row.winningModel}</strong>
                    <small>
                      {formatCurrency(row.monthlyDelta)}/mo · {formatCurrency(row.annualDelta)}/yr
                      spread
                    </small>
                  </td>
                  <td>
                    <strong>{row.recommendation}</strong>
                    <small>{row.evidence}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          App platform comparison appears when app-hosting requests are configured or App hosting is
          selected in the service catalog.
        </div>
      )}
    </div>
  );
}

function OperationsOptimizationPanel({ rows }: { rows: OperationsOptimizationRow[] }) {
  return (
    <div className="operations-optimization-panel" aria-label="Operations optimization detail">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Operations optimization detail</span>
          <h4>Observability, logging, tracing, secrets, WAF, and security posture controls</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap operations-optimization-wrap"
          tabIndex={0}
          aria-label="Operations optimization table"
        >
          <table className="ranking-table operations-optimization-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Ops share</th>
                <th scope="col">Dominant driver</th>
                <th scope="col">Opportunity</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.usageSignal}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.operationsMonthly)}/mo</strong>
                    <small>{formatPercent(row.operationsSharePercent)} of provider total</small>
                  </td>
                  <td>
                    <strong>{row.primaryDriver}</strong>
                    <small>{row.driverEvidence}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.monthlySavings)}/mo</strong>
                    <small>
                      {formatCurrency(row.annualSavings)}/yr · {row.effort} effort
                    </small>
                  </td>
                  <td>
                    <strong>{row.recommendation}</strong>
                    <small>{row.evidence}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Operations optimization appears when logs, metrics, traces, secrets, WAF, DDoS, or
          security-posture line items become material.
        </div>
      )}
    </div>
  );
}

function EgressOptimizationPanel({ rows }: { rows: EgressOptimizationRow[] }) {
  return (
    <div className="egress-optimization-panel" aria-label="Egress optimization detail">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Egress optimization detail</span>
          <h4>Cache, NAT, private transfer, and high-volume data-out actions</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap egress-optimization-wrap"
          tabIndex={0}
          aria-label="Egress optimization table"
        >
          <table className="ranking-table egress-optimization-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Egress share</th>
                <th scope="col">Dominant driver</th>
                <th scope="col">Opportunity</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.trafficSignal}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.egressMonthly)}/mo</strong>
                    <small>{formatPercent(row.egressSharePercent)} of provider total</small>
                  </td>
                  <td>
                    <strong>{row.primaryDriver}</strong>
                    <small>{row.driverEvidence}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.monthlySavings)}/mo</strong>
                    <small>
                      {formatCurrency(row.monthlySavings * 12)}/yr · {row.effort} effort
                    </small>
                  </td>
                  <td>
                    <strong>{row.recommendation}</strong>
                    <small>{row.evidence}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Egress optimization appears when network or data-transfer line items exceed materiality
          thresholds.
        </div>
      )}
    </div>
  );
}

function NetworkingCostPanel({ rows }: { rows: NetworkingCostRow[] }) {
  return (
    <div className="networking-cost-panel" aria-label="Networking cost itemization">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Networking cost itemization</span>
          <h4>Load balancing, CDN, NAT, DNS, VPN, and private-path charges</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap networking-cost-wrap"
          tabIndex={0}
          aria-label="Networking cost table"
        >
          <table className="ranking-table networking-cost-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Component</th>
                <th scope="col">Monthly cost</th>
                <th scope="col">Rate math</th>
                <th scope="col">Validation action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.volumeEvidence}</small>
                  </td>
                  <td>
                    <strong>{row.component}</strong>
                    <small>{row.evidence}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.monthly)}/mo</strong>
                    <small>{formatPercent(row.sharePercent)} of provider total</small>
                  </td>
                  <td>
                    <strong>{row.rateEvidence}</strong>
                    <small>Provider-modeled network line item</small>
                  </td>
                  <td>
                    <strong>{row.validationAction}</strong>
                    <small>Keep networking separate from compute/storage totals in review.</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Networking itemization appears when provider results include egress, CDN, NAT, DNS, load
          balancer, VPN, or private-connectivity rows.
        </div>
      )}
    </div>
  );
}

function SpotBlendOptimizerPanel({ rows }: { rows: SpotBlendOptimizerRow[] }) {
  return (
    <div className="spot-blend-panel" aria-label="Spot blend optimizer">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Spot blend optimizer</span>
          <h4>Mixed on-demand and interruptible-capacity estimate</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="table-wrap spot-blend-wrap" tabIndex={0} aria-label="Spot blend table">
          <table className="ranking-table spot-blend-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Blend</th>
                <th scope="col">Estimated run-rate</th>
                <th scope="col">Savings</th>
                <th scope="col">Risk note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.providerTerm}</small>
                  </td>
                  <td>
                    <strong>
                      {formatPercent(row.onDemandPercent)} on-demand /{' '}
                      {formatPercent(row.spotPercent)} spot
                    </strong>
                    <small>{row.workloadFit}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.blendedMonthly)}/mo est.</strong>
                    <small>
                      Range {formatCurrency(row.estimatedLowMonthly)}-
                      {formatCurrency(row.estimatedHighMonthly)}/mo
                    </small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.monthlySavings)}/mo</strong>
                    <small>{formatCurrency(row.annualSavings)}/yr vs on-demand</small>
                  </td>
                  <td>
                    <strong>{row.risk} interruption risk</strong>
                    <small>{row.interruptionFrequency}</small>
                    <small>{row.evidence}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          Spot blend optimizer appears when providers expose interruptible-capacity estimates below
          on-demand.
        </div>
      )}
    </div>
  );
}

function LicenseOptimizationPanel({
  operatingSystem,
  rows,
}: {
  operatingSystem: WorkloadFormState['operatingSystem'];
  rows: LicenseOptimizationRow[];
}) {
  return (
    <div className="license-optimization-panel" aria-label="License optimization detail">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>License optimization detail</span>
          <h4>Windows uplift, Linux-equivalent run-rate, and BYOL savings</h4>
        </div>
      </div>

      {rows.length > 0 ? (
        <div
          className="table-wrap license-optimization-wrap"
          tabIndex={0}
          aria-label="License optimization table"
        >
          <table className="ranking-table license-optimization-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Windows run-rate</th>
                <th scope="col">Linux/BYOL equivalent</th>
                <th scope="col">License uplift</th>
                <th scope="col">Optimization note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.providerId}>
                  <td>
                    <span className={`scenario-low-label scenario-low-${row.providerId}`}>
                      {providerLabel(row.providerId)}
                    </span>
                    <small>{row.licensePath}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.windowsMonthly)}</strong>
                    <small>Current modeled total</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.linuxEquivalentMonthly)}</strong>
                    <small>Remove Windows line item</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.monthlySavings)}/mo</strong>
                    <small>{formatCurrency(row.annualSavings)}/yr</small>
                  </td>
                  <td>
                    <strong>{row.recommendation}</strong>
                    <small>{row.evidence}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scenario-sensitivity-empty" role="status">
          {operatingSystem === 'windows'
            ? 'Windows was selected, but this comparison did not expose separate licensing line items.'
            : 'Linux/BYOL selected; no Windows licensing uplift is modeled for this workload.'}
        </div>
      )}
    </div>
  );
}

function ArchitectureRiskFlagsPanel({ flags }: { flags: ArchitectureRiskFlag[] }) {
  return (
    <div className="architecture-risk-panel" aria-label="Architecture risk flags">
      <div className="scenario-sensitivity-heading">
        <div>
          <span>Architecture risk flags</span>
          <h4>Cost behaviors to validate before commitment</h4>
        </div>
      </div>

      <div className="architecture-risk-grid">
        {flags.map((flag) => (
          <article
            className={`architecture-risk-card architecture-risk-${flag.severity}`}
            key={flag.id}
          >
            <span>{flag.severity} risk</span>
            <strong>{flag.title}</strong>
            <b>{flag.signal}</b>
            <p>{flag.evidence}</p>
          </article>
        ))}
      </div>
    </div>
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
        <div
          className="table-wrap scenario-sensitivity-wrap"
          tabIndex={0}
          aria-label="Scenario sensitivity table"
        >
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
  const [columnMode, setColumnMode] = useState<CostMatrixColumnMode>('technical');
  const showTechnicalColumns = columnMode === 'technical';
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
        <label>
          <span>Columns</span>
          <select
            value={columnMode}
            onChange={(event) => setColumnMode(event.target.value as CostMatrixColumnMode)}
          >
            <option value="technical">Technical detail</option>
            <option value="summary">Compact cost view</option>
          </select>
        </label>
      </div>

      <div
        className="table-wrap cost-matrix-wrap"
        tabIndex={0}
        aria-label="Provider service cost matrix table"
      >
        <table className="ranking-table cost-matrix-table">
          <thead>
            <tr>
              <th scope="col">Service</th>
              {showTechnicalColumns ? (
                <>
                  <th scope="col">Category</th>
                  <th scope="col" title={CONFIDENCE_TOOLTIP} aria-label={CONFIDENCE_TOOLTIP}>
                    Confidence
                  </th>
                </>
              ) : null}
              {visibleProviders.flatMap((providerId) =>
                visiblePricingModels.map((model) => (
                  <th
                    scope="col"
                    key={`${providerId}-${model.key}`}
                    title={pricingModelTooltip(model.key)}
                    aria-label={`${providerLabel(providerId)} ${costMatrixPricingModelLabel(
                      model.key,
                    )}. ${pricingModelTooltip(model.key)}`}
                  >
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
                  {showTechnicalColumns ? (
                    <>
                      <td>{capitalize(row.category)}</td>
                      <td
                        className="cost-matrix-confidence"
                        title={CONFIDENCE_TOOLTIP}
                        aria-label={`${row.approximate ? 'Approximate' : 'Mapped'} service confidence. ${CONFIDENCE_TOOLTIP}`}
                      >
                        {row.approximate ? 'Approximate' : 'Mapped'}
                      </td>
                    </>
                  ) : null}
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
                <td
                  colSpan={
                    (showTechnicalColumns ? 3 : 1) +
                    visibleProviders.length * visiblePricingModels.length
                  }
                >
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

function parseCostMatrixSortKey(
  sortBy: CostMatrixSortKey,
): { providerId: ProviderId; pricingModel: PricingModelKey } | null {
  const [providerId, pricingModel] = sortBy.split(':');

  if (!isProviderId(providerId) || !isPricingModelKey(pricingModel)) {
    return null;
  }

  return { providerId, pricingModel };
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

function CostFormulaEvidence({ comparison }: { comparison: ComparisonResult | null }) {
  const rows = costFormulaRows(comparison);

  return (
    <section className="cost-formula-evidence" aria-label="Cost calculation evidence">
      <div className="engineering-dashboard-heading">
        <div>
          <span>Calculation evidence</span>
          <h3>Rate x quantity x time</h3>
        </div>
        <p title={HOURS_PER_MONTH_TOOLTIP}>
          Monthly totals are derived from cached catalog list rates and the shared 730-hours/month
          constant; private discounts, credits, taxes, and actual billed usage are not included.
        </p>
      </div>
      <div className="formula-evidence-grid">
        {rows.map((row) => (
          <article className={`formula-evidence-card formula-${row.providerId}`} key={row.key}>
            <span>
              {providerLabel(row.providerId)} · {capitalize(row.category)}
            </span>
            <strong>{row.description}</strong>
            <p
              title={
                row.formula.includes(`${HOURS_PER_MONTH}`) ? HOURS_PER_MONTH_TOOLTIP : undefined
              }
            >
              {row.formula}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PricingEvidencePanel({
  evidence,
  error,
  isLoading,
}: {
  evidence: ComparisonPricingEvidenceResponse | null;
  error: string | null;
  isLoading: boolean;
}) {
  const rows = evidence?.evidence ?? [];
  const visibleRows = rows.slice(0, 6);

  return (
    <section
      className={`pricing-evidence-panel pricing-evidence-${error ? 'error' : isLoading ? 'loading' : 'ready'}`}
      aria-label="Traceable pricing evidence"
    >
      <div className="engineering-dashboard-heading">
        <div>
          <span>Traceable pricing evidence</span>
          <h3>SKU, source row, rate, math</h3>
        </div>
        <p>
          {error
            ? 'Saved comparison lineage could not be loaded from the API.'
            : isLoading
              ? 'Loading the stored SKU-to-estimate chain for this comparison.'
              : evidence
                ? `${evidence.lineItemCount} line item(s) traced from ${evidence.providerCount} provider result(s), priced as of ${formatDateTime(evidence.pricingAsOf)}.`
                : 'Run a comparison to load stored line item evidence.'}
        </p>
      </div>

      {isLoading ? (
        <div className="pricing-evidence-loading" role="status">
          <LoadingStatus
            title="Syncing pricing evidence"
            detail="Reading stored lineage from the comparison API."
          />
        </div>
      ) : null}

      {error ? (
        <p className="pricing-evidence-error" role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && visibleRows.length > 0 ? (
        <div className="pricing-evidence-grid">
          {visibleRows.map((row) => (
            <article
              className={`pricing-evidence-card pricing-evidence-card-${row.providerId}`}
              key={row.evidenceId}
            >
              <span>
                {providerLabel(row.providerId)} · {capitalize(row.category)}
              </span>
              <strong>{formatCurrency(row.displayedAmounts.monthlyCostUsd)} / mo</strong>
              <p>{row.description}</p>
              <dl>
                <div>
                  <dt>SKU</dt>
                  <dd>{evidenceSkuLabel(row)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{evidenceSourceLabel(row)}</dd>
                </div>
                <div>
                  <dt>Rate</dt>
                  <dd>{evidenceRateLabel(row)}</dd>
                </div>
                <div>
                  <dt>Math</dt>
                  <dd>{row.derivation.expression}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>{capitalize(row.equivalence.confidence)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}

      {!isLoading && !error && rows.length > visibleRows.length ? (
        <p className="pricing-evidence-more">
          {rows.length - visibleRows.length} additional evidence row(s) available through the API.
        </p>
      ) : null}
    </section>
  );
}

function computeSpecificationRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): ComputeSpecificationRow[] {
  if (!comparison) {
    return [];
  }

  const vcpu = Math.max(1, parseInputNumber(form.vcpu) ?? 1);
  const memoryGb = Math.max(1, parseInputNumber(form.memoryGb) ?? 1);
  const fixedInstances = Math.max(1, parseInputNumber(form.instanceCount) ?? 1);
  const minInstances = Math.max(1, parseInputNumber(form.autoscaleMin) ?? fixedInstances);
  const maxInstances = Math.max(
    minInstances,
    parseInputNumber(form.autoscaleMax) ?? fixedInstances,
  );
  const activeInstances = form.scalingType === 'autoscaling' ? maxInstances : fixedInstances;
  const totalVcpu = vcpu * activeInstances;
  const totalMemoryGb = memoryGb * activeInstances;
  const architecture = selectedComputeArchitecture(form);
  const requestedCapacity =
    form.scalingType === 'autoscaling'
      ? `${formatDecimal(minInstances)}-${formatDecimal(maxInstances)} nodes · ${formatDecimal(
          totalVcpu,
        )} vCPU / ${formatDecimal(totalMemoryGb)}GB max`
      : `${formatDecimal(activeInstances)} nodes · ${formatDecimal(totalVcpu)} vCPU / ${formatDecimal(
          totalMemoryGb,
        )}GB`;

  return comparison.providers
    .flatMap((provider) => {
      const computeMonthly = roundCurrency(componentMonthly(provider, 'compute'));

      if (computeMonthly <= 0) {
        return [];
      }

      const profile = COMPUTE_SPEC_PROFILES[form.instanceTier][provider.providerId];
      const familyLabel = computeFamilyLabel(profile, architecture);
      const memoryPerDollar = totalMemoryGb / computeMonthly;
      const hourlyEffective = computeMonthly / HOURS_PER_MONTH;
      const armDelta = computeArchitectureDelta(provider.providerId, computeMonthly, architecture);
      const tenancySignal = computeTenancySignal(form, vcpu, activeInstances);
      const architectureFit =
        architecture === 'gpu'
          ? 'GPU accelerator selected'
          : `${architecture === 'arm64' ? 'ARM' : 'x86'} architecture selected`;

      return [
        {
          providerId: provider.providerId,
          familyLabel,
          architectureFit,
          requestedCapacity,
          networkBaseline: profile.networkBaseline,
          diskBaseline: profile.diskBaseline,
          economics: `${formatDecimal(memoryPerDollar)} GB per $ · ${formatCurrency(
            hourlyEffective,
          )}/hr effective`,
          armDelta,
          tenancySignal,
          recommendation: computeSpecificationRecommendation(
            form,
            architecture,
            provider.providerId,
          ),
          evidence: `${profile.useCase} ${profile.performanceNote}`,
        },
      ];
    })
    .sort(
      (left, right) =>
        PROVIDER_ORDER.indexOf(left.providerId) - PROVIDER_ORDER.indexOf(right.providerId),
    );
}

function storageOptimizationRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): StorageOptimizationRow[] {
  if (!comparison) {
    return [];
  }

  const storageGb = parseInputNumber(form.storageSizeGb) ?? 0;
  const retrievalGb = parseInputNumber(form.monthlyRetrievalGb) ?? 0;
  const requestThousands =
    (parseInputNumber(form.monthlyPutRequestsThousand) ?? 0) +
    (parseInputNumber(form.monthlyGetRequestsThousand) ?? 0) +
    (parseInputNumber(form.monthlyDeleteRequestsThousand) ?? 0) +
    (parseInputNumber(form.monthlyListRequestsThousand) ?? 0);
  const lifecycleTransitions = parseInputNumber(form.lifecycleTransitionsThousand) ?? 0;
  const objectCountThousand = parseInputNumber(form.objectCountThousand) ?? 0;
  const objectRetentionDays = parseInputNumber(form.objectRetentionDays) ?? 0;
  const snapshotSizeGb = parseInputNumber(form.snapshotSizeGb) ?? 0;
  const snapshotRetentionDays = parseInputNumber(form.snapshotRetentionDays) ?? 0;
  const provisionedIops = parseInputNumber(form.provisionedIops) ?? 0;
  const provisionedThroughputMbps = parseInputNumber(form.provisionedThroughputMbps) ?? 0;
  const storageClassLabel = form.storageClass.replace(/-/g, ' ');
  const usageSignalParts = [
    storageGb > 0 ? `${formatDecimal(storageGb)}GB ${storageClassLabel}` : undefined,
    retrievalGb > 0 ? `${formatDecimal(retrievalGb)}GB retrieval` : undefined,
    objectCountThousand > 0
      ? `${formatDecimal(objectCountThousand)}K objects / ${formatDecimal(
          objectRetentionDays,
        )}d retention`
      : undefined,
    requestThousands > 0 ? `${formatDecimal(requestThousands)}K operations` : undefined,
    form.storageReplication !== 'none' ? form.storageReplication.replace('-', ' ') : undefined,
    form.multiAttachEnabled ? 'multi-attach' : undefined,
  ].filter(Boolean);
  const usageSignal = usageSignalParts.join(' · ') || 'Storage rows only';
  const hasAdvancedFormSignal =
    form.storageClass !== 'standard' ||
    retrievalGb > 0 ||
    requestThousands > 0 ||
    objectCountThousand > 0 ||
    form.multiAttachEnabled ||
    lifecycleTransitions > 0 ||
    snapshotSizeGb > 0 ||
    form.storageReplication !== 'none' ||
    provisionedIops > 0 ||
    provisionedThroughputMbps > 0;

  return comparison.providers
    .flatMap((provider) => {
      const storageMonthly = roundCurrency(componentMonthly(provider, 'storage'));
      const storageSharePercent =
        provider.totals.monthly > 0 ? (storageMonthly / provider.totals.monthly) * 100 : 0;
      const storageRows = storageLineItems(provider).sort(
        (left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd,
      );
      const advancedRows = storageRows.filter((lineItem) =>
        storageAdvancedDescriptionMatches(`${lineItem.skuId ?? ''} ${lineItem.description}`),
      );
      const primary = advancedRows[0] ?? storageRows[0];
      const material =
        storageMonthly >= 10 ||
        storageSharePercent >= 10 ||
        hasAdvancedFormSignal ||
        advancedRows.length > 0;

      if (!primary || storageMonthly <= 0 || !material) {
        return [];
      }

      const signal = storageOptimizationSignal(primary, storageMonthly, {
        lifecycleTransitions,
        multiAttachEnabled: form.multiAttachEnabled,
        objectCountThousand,
        objectRetentionDays,
        provisionedIops,
        provisionedThroughputMbps,
        requestThousands,
        retrievalGb,
        snapshotRetentionDays,
        snapshotSizeGb,
        storageClassLabel,
        storageReplication: form.storageReplication,
      });

      return [
        {
          providerId: provider.providerId,
          storageMonthly,
          storageSharePercent,
          usageSignal,
          annualSavings: roundCurrency(signal.monthlySavings * 12),
          ...signal,
        },
      ];
    })
    .sort((left, right) => right.monthlySavings - left.monthlySavings);
}

function storageAnatomyRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): StorageAnatomyRow[] {
  if (!comparison) {
    return [];
  }

  const requestThousands =
    (parseInputNumber(form.monthlyPutRequestsThousand) ?? 0) +
    (parseInputNumber(form.monthlyGetRequestsThousand) ?? 0) +
    (parseInputNumber(form.monthlyDeleteRequestsThousand) ?? 0) +
    (parseInputNumber(form.monthlyListRequestsThousand) ?? 0);
  const retrievalGb = parseInputNumber(form.monthlyRetrievalGb) ?? 0;
  const objectCountThousand = parseInputNumber(form.objectCountThousand) ?? 0;
  const objectRetentionDays = parseInputNumber(form.objectRetentionDays) ?? 0;
  const snapshotSizeGb = parseInputNumber(form.snapshotSizeGb) ?? 0;
  const snapshotRetentionDays = parseInputNumber(form.snapshotRetentionDays) ?? 0;
  const lifecycleTransitions = parseInputNumber(form.lifecycleTransitionsThousand) ?? 0;
  const provisionedIops = parseInputNumber(form.provisionedIops) ?? 0;
  const provisionedThroughputMbps = parseInputNumber(form.provisionedThroughputMbps) ?? 0;
  const databaseGrowthGb = parseInputNumber(form.databaseStorageGrowthGbPerMonth) ?? 0;
  const databaseSizeGb = parseInputNumber(form.databaseSizeGb) ?? 0;

  return comparison.providers
    .flatMap((provider) => {
      const storageRows = storageLineItems(provider);
      const databaseStorageRows = databaseStorageLineItems(provider);
      const rows = [...storageRows, ...databaseStorageRows];
      const storageMonthly = roundCurrency(
        rows.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
      );

      if (rows.length === 0 && databaseGrowthGb <= 0) {
        return [];
      }

      const dimensionTotals = storageDimensionTotals(rows);
      const sharePercent =
        provider.totals.monthly > 0 ? (storageMonthly / provider.totals.monthly) * 100 : 0;
      const primary = [...rows].sort(
        (left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd,
      )[0];

      return [
        {
          providerId: provider.providerId,
          storageProfile: storageAnatomyProfile(form),
          monthly: storageMonthly,
          sharePercent,
          operationsSignal: storageOperationsSignal({
            objectCountThousand,
            operationMonthly: dimensionTotals.operations,
            requestThousands,
            retrievalGb,
            retrievalMonthly: dimensionTotals.retrieval,
          }),
          resilienceSignal: storageResilienceSignal({
            lifecycleMonthly: dimensionTotals.lifecycle,
            lifecycleTransitions,
            objectRetentionDays,
            replicationMonthly: dimensionTotals.replication,
            snapshotMonthly: dimensionTotals.snapshot,
            snapshotRetentionDays,
            snapshotSizeGb,
            storageReplication: form.storageReplication,
          }),
          performanceSignal: storagePerformanceSignal({
            databaseGrowthGb,
            databaseSizeGb,
            multiAttachEnabled: form.multiAttachEnabled,
            performanceMonthly: dimensionTotals.performance,
            provisionedIops,
            provisionedThroughputMbps,
          }),
          rateEvidence: storageRateEvidence(primary),
          recommendation: storageAnatomyRecommendation(dimensionTotals, {
            databaseGrowthGb,
            lifecycleTransitions,
            provisionedIops,
            requestThousands,
            retrievalGb,
            snapshotSizeGb,
            storageReplication: form.storageReplication,
          }),
          evidence: `${rows.length} storage-related line item(s); ${storageDimensionSummary(
            dimensionTotals,
          )}.`,
        },
      ];
    })
    .sort(
      (left, right) =>
        PROVIDER_ORDER.indexOf(left.providerId) - PROVIDER_ORDER.indexOf(right.providerId),
    );
}

function storageAnatomyProfile(form: WorkloadFormState): string {
  return `${capitalize(form.storageType.replace(/-/g, ' '))} · ${storageClassDisplayName(
    form.storageClass,
  )}`;
}

function databaseOptimizationRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): DatabaseOptimizationRow[] {
  if (!comparison) {
    return [];
  }

  const databaseSizeGb = parseInputNumber(form.databaseSizeGb) ?? 0;
  const backupGb = parseInputNumber(form.databaseBackupStorageGb) ?? 0;
  const backupDays = parseInputNumber(form.databaseBackupRetentionDays) ?? 0;
  const provisionedIops = parseInputNumber(form.databaseProvisionedIops) ?? 0;
  const readReplicas = parseInputNumber(form.databaseReadReplicaCount) ?? 0;
  const replicaTransferGb = parseInputNumber(form.databaseCrossRegionReplicaTransferGb) ?? 0;
  const nosqlReadsMillion = parseInputNumber(form.databaseNosqlReadRequestUnitsMillion) ?? 0;
  const nosqlWritesMillion = parseInputNumber(form.databaseNosqlWriteRequestUnitsMillion) ?? 0;
  const ruPerSecond = parseInputNumber(form.databaseRuPerSecond) ?? 0;
  const queryDataTb = parseInputNumber(form.databaseQueryDataTb) ?? 0;
  const cacheReplicas = parseInputNumber(form.databaseCacheReplicaCount) ?? 0;
  const storageGrowthGb = parseInputNumber(form.databaseStorageGrowthGbPerMonth) ?? 0;
  const searchNodes = parseInputNumber(form.databaseSearchNodeCount) ?? 0;
  const searchStorageGb = parseInputNumber(form.databaseSearchStorageGb) ?? 0;
  const searchQueriesMillion = parseInputNumber(form.databaseSearchQueriesMillion) ?? 0;
  const warehouseStorageGb = parseInputNumber(form.analyticsWarehouseStorageGb) ?? 0;
  const warehouseQueryTb = parseInputNumber(form.analyticsWarehouseQueryTb) ?? 0;
  const databaseEngineLabel = form.databaseEngine.replace(/_/g, ' ');
  const usageSignalParts = [
    form.databaseEnabled ? databaseEngineLabel : undefined,
    databaseSizeGb > 0 ? `${formatDecimal(databaseSizeGb)}GB data` : undefined,
    ruPerSecond > 0 ? `${formatDecimal(ruPerSecond)} RU/s` : undefined,
    nosqlReadsMillion + nosqlWritesMillion > 0
      ? `${formatDecimal(nosqlReadsMillion + nosqlWritesMillion)}M NoSQL units`
      : undefined,
    queryDataTb + warehouseQueryTb > 0
      ? `${formatDecimal(queryDataTb + warehouseQueryTb)}TB query`
      : undefined,
    readReplicas + cacheReplicas > 0
      ? `${formatDecimal(readReplicas + cacheReplicas)} replica nodes`
      : undefined,
    searchNodes + searchStorageGb + searchQueriesMillion > 0
      ? `${formatDecimal(searchNodes)} search nodes · ${formatDecimal(searchStorageGb)}GB index`
      : undefined,
  ].filter(Boolean);
  const usageSignal = usageSignalParts.join(' · ') || 'Database rows only';
  const hasAdvancedFormSignal =
    backupGb > 0 ||
    provisionedIops > 0 ||
    readReplicas > 0 ||
    replicaTransferGb > 0 ||
    nosqlReadsMillion + nosqlWritesMillion > 0 ||
    ruPerSecond > 0 ||
    queryDataTb > 0 ||
    cacheReplicas > 0 ||
    storageGrowthGb > 0 ||
    searchNodes + searchStorageGb + searchQueriesMillion > 0 ||
    warehouseStorageGb > 0 ||
    warehouseQueryTb > 0;

  return comparison.providers
    .flatMap((provider) => {
      const databaseRows = databaseIntelligenceLineItems(provider).sort(
        (left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd,
      );
      const advancedRows = databaseRows.filter((lineItem) =>
        databaseAdvancedDescriptionMatches(`${lineItem.skuId ?? ''} ${lineItem.description}`),
      );
      const primary = advancedRows[0] ?? databaseRows[0];
      const databaseMonthly = roundCurrency(
        databaseRows.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
      );
      const databaseSharePercent =
        provider.totals.monthly > 0 ? (databaseMonthly / provider.totals.monthly) * 100 : 0;
      const material =
        databaseMonthly >= 10 ||
        databaseSharePercent >= 10 ||
        hasAdvancedFormSignal ||
        advancedRows.length > 0;

      if (!primary || databaseMonthly <= 0 || !material) {
        return [];
      }

      const signal = databaseOptimizationSignal(primary, databaseMonthly, {
        backupDays,
        backupGb,
        cacheReplicas,
        databaseEngineLabel,
        nosqlReadsMillion,
        nosqlWritesMillion,
        provisionedIops,
        queryDataTb: queryDataTb + warehouseQueryTb,
        readReplicas,
        replicaTransferGb,
        ruPerSecond,
        searchNodes,
        searchQueriesMillion,
        searchStorageGb,
        storageGrowthGb,
        warehouseStorageGb,
      });

      return [
        {
          providerId: provider.providerId,
          databaseMonthly,
          databaseSharePercent,
          usageSignal,
          annualSavings: roundCurrency(signal.monthlySavings * 12),
          ...signal,
        },
      ];
    })
    .sort((left, right) => right.monthlySavings - left.monthlySavings);
}

function databaseAnatomyRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): DatabaseAnatomyRow[] {
  if (!comparison) {
    return [];
  }

  const databaseSizeGb = parseInputNumber(form.databaseSizeGb) ?? 0;
  const backupGb = parseInputNumber(form.databaseBackupStorageGb) ?? 0;
  const backupDays = parseInputNumber(form.databaseBackupRetentionDays) ?? 0;
  const provisionedIops = parseInputNumber(form.databaseProvisionedIops) ?? 0;
  const readReplicas = parseInputNumber(form.databaseReadReplicaCount) ?? 0;
  const replicaTransferGb = parseInputNumber(form.databaseCrossRegionReplicaTransferGb) ?? 0;
  const nosqlReadsMillion = parseInputNumber(form.databaseNosqlReadRequestUnitsMillion) ?? 0;
  const nosqlWritesMillion = parseInputNumber(form.databaseNosqlWriteRequestUnitsMillion) ?? 0;
  const ruPerSecond = parseInputNumber(form.databaseRuPerSecond) ?? 0;
  const queryDataTb = parseInputNumber(form.databaseQueryDataTb) ?? 0;
  const cacheReplicas = parseInputNumber(form.databaseCacheReplicaCount) ?? 0;
  const storageGrowthGb = parseInputNumber(form.databaseStorageGrowthGbPerMonth) ?? 0;
  const searchNodes = parseInputNumber(form.databaseSearchNodeCount) ?? 0;
  const searchStorageGb = parseInputNumber(form.databaseSearchStorageGb) ?? 0;
  const searchQueriesMillion = parseInputNumber(form.databaseSearchQueriesMillion) ?? 0;
  const warehouseStorageGb = parseInputNumber(form.analyticsWarehouseStorageGb) ?? 0;
  const warehouseQueryTb = parseInputNumber(form.analyticsWarehouseQueryTb) ?? 0;

  return comparison.providers
    .flatMap((provider) => {
      const rows = databaseIntelligenceLineItems(provider);
      const monthly = roundCurrency(
        rows.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
      );

      if (rows.length === 0) {
        return [];
      }

      const dimensions = databaseDimensionTotals(rows);
      const primary = [...rows].sort(
        (left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd,
      )[0];

      return [
        {
          providerId: provider.providerId,
          databaseProfile: databaseAnatomyProfile(form),
          monthly,
          sharePercent: provider.totals.monthly > 0 ? (monthly / provider.totals.monthly) * 100 : 0,
          capacitySignal: databaseCapacitySignal({
            dimensions,
            nosqlReadsMillion,
            nosqlWritesMillion,
            ruPerSecond,
          }),
          resilienceSignal: databaseResilienceSignal({
            backupDays,
            backupGb,
            dimensions,
            provisionedIops,
            readReplicas,
            replicaTransferGb,
            storageGrowthGb,
          }),
          analyticsSignal: databaseAnalyticsSignal({
            cacheReplicas,
            dimensions,
            queryDataTb,
            searchNodes,
            searchQueriesMillion,
            searchStorageGb,
            warehouseQueryTb,
            warehouseStorageGb,
          }),
          rateEvidence: databaseRateEvidence(primary),
          recommendation: databaseAnatomyRecommendation(dimensions, {
            cacheReplicas,
            provisionedIops,
            queryDataTb: queryDataTb + warehouseQueryTb,
            readReplicas,
            ruPerSecond,
            searchNodes,
            storageGrowthGb,
          }),
          evidence: `${rows.length} database-related line item(s); ${databaseDimensionSummary(
            dimensions,
          )}. ${databaseSizeGb > 0 ? `${formatDecimal(databaseSizeGb)}GB configured data` : ''}`,
        },
      ];
    })
    .sort(
      (left, right) =>
        PROVIDER_ORDER.indexOf(left.providerId) - PROVIDER_ORDER.indexOf(right.providerId),
    );
}

function serverlessMemoryCurveRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): ServerlessMemoryCurveRow[] {
  if (!comparison) {
    return [];
  }

  const requestsMillion = parseInputNumber(form.functionInvocationsMillion) ?? 0;
  const currentDurationMs = parseInputNumber(form.functionDurationMs) ?? 0;
  const currentMemoryMb = parseInputNumber(form.functionMemoryMb) ?? 0;

  if (requestsMillion <= 0 || currentDurationMs <= 0 || currentMemoryMb <= 0) {
    return [];
  }

  const hasServerlessRows = comparison.providers.some((provider) =>
    provider.lineItems.some((lineItem) =>
      `${lineItem.skuId ?? ''} ${lineItem.description}`.toLowerCase().includes('serverless'),
    ),
  );
  const serverlessSelected =
    form.selectedServiceFamilyId === 'serverless-functions' ||
    form.selectedServiceFamilyIds.includes('serverless-functions');

  if (!hasServerlessRows && !serverlessSelected) {
    return [];
  }

  const breakEvenMemoryMb = currentMemoryMb * 2;
  const breakEvenDurationMs = (currentDurationMs * currentMemoryMb) / breakEvenMemoryMb;
  const usageSignal = `${formatDecimal(requestsMillion)}M invocations`;

  return comparison.providers
    .map((provider) => {
      const currentMonthly = serverlessFunctionMonthly(provider.providerId, {
        requestsMillion,
        durationMs: currentDurationMs,
        memoryMb: currentMemoryMb,
      });
      const modeledMonthly = serverlessFunctionMonthly(provider.providerId, {
        requestsMillion,
        durationMs: breakEvenDurationMs,
        memoryMb: breakEvenMemoryMb,
      });
      const deltaPercent =
        currentMonthly > 0 ? ((modeledMonthly - currentMonthly) / currentMonthly) * 100 : 0;

      return {
        providerId: provider.providerId,
        currentMonthly,
        modeledMonthly,
        currentMemoryMb,
        currentDurationMs,
        breakEvenMemoryMb,
        breakEvenDurationMs,
        deltaPercent,
        usageSignal,
        recommendation: `Benchmark ${formatDecimal(breakEvenMemoryMb)}MB; keep duration at or below ${formatDecimal(
          breakEvenDurationMs,
        )}ms to improve latency without raising compute cost.`,
        evidence: `${SERVERLESS_FUNCTION_RATES[provider.providerId].evidence} ${formatDecimal(
          breakEvenMemoryMb,
        )}MB is the linear break-even point for the configured ${formatDecimal(
          currentDurationMs,
        )}ms @ ${formatDecimal(currentMemoryMb)}MB function.`,
      };
    })
    .filter((row) => row.currentMonthly > 0 || row.modeledMonthly > 0);
}

function appPlatformModelRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): AppPlatformModelRow[] {
  if (!comparison) {
    return [];
  }

  const requestsMillion = parseInputNumber(form.appPlatformRequestsMillion) ?? 0;
  const durationMs = parseInputNumber(form.appPlatformRequestDurationMs) ?? 400;
  const vcpu = parseInputNumber(form.appPlatformVcpu) ?? 1;
  const memoryGb = parseInputNumber(form.appPlatformMemoryGb) ?? 0.5;
  const alwaysOnHours = parseInputNumber(form.appPlatformAlwaysOnHours) ?? HOURS_PER_MONTH;
  const minInstances = parseInputNumber(form.appPlatformMinInstances) ?? 1;
  const hasAppPlatformLineItems = comparison.providers.some((provider) =>
    provider.lineItems.some((lineItem) =>
      `${lineItem.skuId ?? ''} ${lineItem.description}`.toLowerCase().includes('app platform'),
    ),
  );
  const appPlatformSelected =
    form.selectedServiceFamilyIds.includes('app-platform') ||
    form.selectedServiceFamilyIds.includes('serverless-containers');

  if (requestsMillion <= 0 && !hasAppPlatformLineItems && !appPlatformSelected) {
    return [];
  }

  const usageSignal =
    requestsMillion > 0
      ? `${formatDecimal(requestsMillion)}M requests · ${formatDecimal(durationMs)}ms · ${formatDecimal(
          vcpu,
        )} vCPU / ${formatDecimal(memoryGb)}GB`
      : 'App-hosting service catalog selection';

  return comparison.providers
    .map((provider) => {
      const requestLineMonthly = roundCurrency(
        provider.lineItems
          .filter((lineItem) => lineItem.skuId?.startsWith('modeled-app-platform-request'))
          .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
      );
      const requestBasedMonthly =
        requestLineMonthly > 0
          ? requestLineMonthly
          : appPlatformRequestMonthly(provider.providerId, {
              durationMs,
              memoryGb,
              requestsMillion,
              vcpu,
            });
      const alwaysOnMonthly = appPlatformAlwaysOnMonthly(provider.providerId, {
        alwaysOnHours,
        memoryGb,
        minInstances,
        vcpu,
      });
      const winningModel: AppPlatformModelRow['winningModel'] =
        requestBasedMonthly <= alwaysOnMonthly ? 'Request-based' : 'Always-on';
      const monthlyDelta = roundCurrency(Math.abs(alwaysOnMonthly - requestBasedMonthly));
      const annualDelta = roundCurrency(monthlyDelta * 12);
      const rates = APP_PLATFORM_MODEL_RATES[provider.providerId];
      const recommendation =
        winningModel === 'Request-based'
          ? `Keep scale-to-zero/request-based posture; always-on would add ${formatCurrency(
              monthlyDelta,
            )}/mo at this traffic level.`
          : `Use always-on/provisioned app capacity for steady traffic; request-based metering is ${formatCurrency(
              monthlyDelta,
            )}/mo higher at this shape.`;

      return {
        providerId: provider.providerId,
        requestBasedMonthly,
        alwaysOnMonthly,
        winningModel,
        monthlyDelta,
        annualDelta,
        usageSignal,
        requestEvidence: `${formatDecimal(requestsMillion)}M requests at ${formatDecimal(
          durationMs,
        )}ms, ${formatDecimal(vcpu)} vCPU, ${formatDecimal(memoryGb)}GB.`,
        alwaysOnEvidence: `${formatDecimal(minInstances)} instance(s) for ${formatDecimal(
          alwaysOnHours,
        )} hrs/mo.`,
        recommendation,
        evidence: rates.evidence,
      };
    })
    .filter((row) => row.requestBasedMonthly > 0 || row.alwaysOnMonthly > 0)
    .sort((left, right) => right.monthlyDelta - left.monthlyDelta);
}

function egressOptimizationRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): EgressOptimizationRow[] {
  if (!comparison) {
    return [];
  }

  const configuredEgressGb = parseInputNumber(form.monthlyEgressGb) ?? 0;
  const cdnTrafficGb = parseInputNumber(form.cdnTrafficGb) ?? 0;
  const crossAzGb = parseInputNumber(form.crossAzTransferGb) ?? 0;
  const interRegionGb = parseInputNumber(form.interRegionTransferGb) ?? 0;
  const natGb = parseInputNumber(form.natGatewayGb) ?? 0;
  const vpnTransferGb = parseInputNumber(form.vpnDataTransferGb) ?? 0;
  const privateCircuitTransferGb = parseInputNumber(form.privateCircuitDataTransferGb) ?? 0;
  const cacheHit = clampNumber(parseInputNumber(form.cdnCacheHitRatioPercent) ?? 85, 0, 100);
  const trafficSignalParts = [
    configuredEgressGb > 0 ? `${formatDecimal(configuredEgressGb)}GB internet` : undefined,
    cdnTrafficGb > 0 ? `${formatDecimal(cdnTrafficGb)}GB CDN` : undefined,
    crossAzGb + interRegionGb + natGb + vpnTransferGb + privateCircuitTransferGb > 0
      ? `${formatDecimal(
          crossAzGb + interRegionGb + natGb + vpnTransferGb + privateCircuitTransferGb,
        )}GB private path`
      : undefined,
  ].filter(Boolean);
  const trafficSignal = trafficSignalParts.join(' · ') || 'Network rows only';

  return comparison.providers
    .flatMap((provider) => {
      const egressMonthly = roundCurrency(componentMonthly(provider, 'egress'));
      const egressSharePercent =
        provider.totals.monthly > 0 ? (egressMonthly / provider.totals.monthly) * 100 : 0;
      const networkRows = networkLineItems(provider).sort(
        (left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd,
      );
      const primary = networkRows[0];
      const material =
        egressMonthly >= 25 ||
        egressSharePercent >= 15 ||
        configuredEgressGb >= 500 ||
        cdnTrafficGb >= 500 ||
        crossAzGb + interRegionGb + natGb + vpnTransferGb + privateCircuitTransferGb >= 500;

      if (!primary || !material) {
        return [];
      }

      const signal = egressOptimizationSignal(primary, egressMonthly, {
        cacheHit,
        cdnTrafficGb,
        configuredEgressGb,
        privateTransferGb:
          crossAzGb + interRegionGb + natGb + vpnTransferGb + privateCircuitTransferGb,
        tieredGb: networkRows.reduce((sum, lineItem) => sum + lineItemTierBillableGb(lineItem), 0),
      });

      return [
        {
          providerId: provider.providerId,
          egressMonthly,
          egressSharePercent,
          trafficSignal,
          ...signal,
        },
      ];
    })
    .sort((left, right) => right.monthlySavings - left.monthlySavings);
}

function networkingCostRows(
  comparison: ComparisonResult | null,
  serverRows?: ComparisonAnalyticsResponse['egressNetworkingDetails'],
): NetworkingCostRow[] {
  if (serverRows && serverRows.length > 0) {
    return serverRows
      .map((row) => ({
        id: row.id,
        providerId: row.providerId,
        component: row.networkComponent,
        monthly: row.monthlyCostUsd,
        sharePercent: row.shareOfProviderTotalPercent,
        rateEvidence:
          row.rateUsd !== undefined
            ? `${formatCurrency(row.rateUsd)} per ${row.unit ?? 'unit'}`
            : row.evidence,
        volumeEvidence: [row.region, row.unit].filter(Boolean).join(' · ') || 'Provider default',
        validationAction: networkingValidationAction(row.networkComponent),
        evidence: row.description || row.evidence,
      }))
      .sort((left, right) => {
        const providerDelta =
          PROVIDER_ORDER.indexOf(left.providerId) - PROVIDER_ORDER.indexOf(right.providerId);

        return providerDelta !== 0 ? providerDelta : right.monthly - left.monthly;
      });
  }

  if (!comparison) {
    return [];
  }

  return comparison.providers
    .flatMap((provider) =>
      networkLineItems(provider).map((lineItem, index) => {
        const component = networkingComponentLabel(lineItem);
        const sharePercent =
          provider.totals.monthly > 0
            ? (lineItem.baseMonthlyCostUsd / provider.totals.monthly) * 100
            : 0;

        return {
          id: `${provider.providerId}-${index}-${lineItem.skuId ?? lineItem.description}`,
          providerId: provider.providerId,
          component,
          monthly: roundCurrency(lineItem.baseMonthlyCostUsd),
          sharePercent,
          rateEvidence: networkingRateEvidence(lineItem),
          volumeEvidence: networkingVolumeEvidence(lineItem),
          validationAction: networkingValidationAction(component),
          evidence: lineItem.description,
        };
      }),
    )
    .sort((left, right) => {
      const providerDelta =
        PROVIDER_ORDER.indexOf(left.providerId) - PROVIDER_ORDER.indexOf(right.providerId);

      return providerDelta !== 0 ? providerDelta : right.monthly - left.monthly;
    });
}

function licenseOptimizationRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): LicenseOptimizationRow[] {
  if (!comparison || form.operatingSystem !== 'windows') {
    return [];
  }

  return comparison.providers
    .flatMap((provider) => {
      const licensingMonthly = roundCurrency(componentMonthly(provider, 'licensing'));

      if (licensingMonthly <= 0) {
        return [];
      }

      const linuxEquivalentMonthly = roundCurrency(
        Math.max(0, provider.totals.monthly - licensingMonthly),
      );
      const recommendation =
        provider.providerId === 'azure'
          ? 'Validate Azure Hybrid Benefit or BYOL entitlement before committing.'
          : 'Validate Linux migration or BYOL license mobility before committing.';

      return [
        {
          providerId: provider.providerId,
          windowsMonthly: roundCurrency(provider.totals.monthly),
          linuxEquivalentMonthly,
          monthlySavings: licensingMonthly,
          annualSavings: roundCurrency(licensingMonthly * 12),
          licensePath: provider.providerId === 'azure' ? 'Hybrid Benefit / BYOL' : 'Linux / BYOL',
          recommendation,
          evidence: `${providerLabel(provider.providerId)} exposes ${formatCurrency(
            licensingMonthly,
          )}/mo as an explicit Windows licensing line item.`,
        },
      ];
    })
    .sort((left, right) => right.monthlySavings - left.monthlySavings);
}

function architectureRiskFlags(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
  serverFindings?: ComparisonAnalyticsResponse['finOpsFindings'],
): ArchitectureRiskFlag[] {
  const flags: ArchitectureRiskFlag[] = [];
  const egressGb = parseInputNumber(form.monthlyEgressGb) ?? 0;
  const crossAzGb = parseInputNumber(form.crossAzTransferGb) ?? 0;
  const interRegionGb = parseInputNumber(form.interRegionTransferGb) ?? 0;
  const natGb = parseInputNumber(form.natGatewayGb) ?? 0;
  const ruPerSecond = parseInputNumber(form.databaseRuPerSecond) ?? 0;
  const nosqlReads = parseInputNumber(form.databaseNosqlReadRequestUnitsMillion) ?? 0;
  const nosqlWrites = parseInputNumber(form.databaseNosqlWriteRequestUnitsMillion) ?? 0;
  const databaseSizeGb = parseInputNumber(form.databaseSizeGb) ?? 0;
  const databaseGrowthGb = parseInputNumber(form.databaseStorageGrowthGbPerMonth) ?? 0;
  const databaseReplicaTransferGb =
    parseInputNumber(form.databaseCrossRegionReplicaTransferGb) ?? 0;
  const searchNodes = parseInputNumber(form.databaseSearchNodeCount) ?? 0;
  const searchStorageGb = parseInputNumber(form.databaseSearchStorageGb) ?? 0;
  const searchQueriesMillion = parseInputNumber(form.databaseSearchQueriesMillion) ?? 0;
  const maxEgressShare = maxComponentShare(comparison, 'egress');

  if (egressGb >= 500 || maxEgressShare >= 20) {
    flags.push({
      id: 'data-transfer-concentration',
      title: 'Data-transfer concentration',
      severity: egressGb >= 1000 || maxEgressShare >= 35 ? 'high' : 'medium',
      signal:
        maxEgressShare > 0
          ? `${formatDecimal(maxEgressShare)}% of provider spend`
          : `${formatDecimal(egressGb)}GB/mo`,
      evidence: form.cdn
        ? 'Egress is material even with CDN enabled; validate cache hit ratio, origin paths, NAT, and cross-region traffic.'
        : 'Egress is material and CDN is off; direct internet data transfer can dominate the bill as usage grows.',
    });
  }

  if (crossAzGb > 0 || interRegionGb > 0 || natGb > 0) {
    flags.push({
      id: 'private-network-transfer',
      title: 'Private network transfer exposure',
      severity: interRegionGb >= 500 || natGb >= 1000 ? 'high' : 'medium',
      signal: `${formatDecimal(crossAzGb + interRegionGb + natGb)}GB/mo`,
      evidence:
        'Cross-AZ, inter-region, and NAT-processed traffic are separate cost paths; validate routing before HA design sign-off.',
    });
  }

  if (
    form.databaseEnabled &&
    (form.databaseEngine === 'generic_nosql' ||
      form.databaseEngine === 'mongodb' ||
      ruPerSecond > 0 ||
      nosqlReads + nosqlWrites > 0)
  ) {
    flags.push({
      id: 'nosql-throughput-model',
      title: 'NoSQL throughput model',
      severity: ruPerSecond >= 4000 || nosqlReads + nosqlWrites >= 100 ? 'high' : 'medium',
      signal:
        ruPerSecond > 0
          ? `${formatDecimal(ruPerSecond)} RU/s`
          : `${formatDecimal(nosqlReads + nosqlWrites)}M units/mo`,
      evidence:
        'DynamoDB on-demand and Cosmos DB RU/s pricing can spike or waste capacity; validate provisioned-vs-on-demand break-even with observed traffic.',
    });
  }

  if (databaseGrowthGb > 0 && databaseSizeGb > 0) {
    const annualGrowthPercent = (databaseGrowthGb * 12 * 100) / databaseSizeGb;

    if (annualGrowthPercent >= 50) {
      flags.push({
        id: 'database-growth-pressure',
        title: 'Database storage growth pressure',
        severity: annualGrowthPercent >= 100 ? 'high' : 'medium',
        signal: `${formatPercent(annualGrowthPercent)} annual growth`,
        evidence:
          'Storage autoscaling, backup retention, replica transfer, and IOPS can grow faster than the base database instance cost.',
      });
    }
  }

  if (searchNodes > 0 || searchStorageGb > 0 || searchQueriesMillion > 0) {
    flags.push({
      id: 'managed-search-scaling-model',
      title: 'Managed search scaling model',
      severity:
        searchNodes >= 3 || searchStorageGb >= 500 || searchQueriesMillion >= 50
          ? 'high'
          : 'medium',
      signal: `${formatDecimal(searchNodes)} nodes · ${formatDecimal(searchStorageGb)}GB index`,
      evidence:
        'Search pricing can hinge on replicas, partitions, semantic ranking, index retention, and query volume; validate capacity mode before production indexing.',
    });
  }

  if (
    form.multiRegion ||
    form.storageReplication === 'cross-region' ||
    databaseReplicaTransferGb > 0
  ) {
    flags.push({
      id: 'cross-region-resilience',
      title: 'Cross-region resilience premium',
      severity: form.multiRegion || databaseReplicaTransferGb >= 500 ? 'high' : 'medium',
      signal:
        databaseReplicaTransferGb > 0
          ? `${formatDecimal(databaseReplicaTransferGb)}GB replica transfer`
          : form.multiRegion
            ? 'Multi-region enabled'
            : 'Cross-region replication',
      evidence:
        'Active-active, cross-region replication, and replica data transfer can multiply network and storage costs beyond the base service price.',
    });
  }

  const approximateRows =
    comparison?.providers.reduce(
      (count, provider) =>
        count + provider.lineItems.filter((lineItem) => lineItem.isApproximate).length,
      0,
    ) ?? 0;

  if (approximateRows > 0) {
    flags.push({
      id: 'mapping-equivalence',
      title: 'Approximate provider equivalence',
      severity: 'medium',
      signal: `${approximateRows} mapping(s)`,
      evidence:
        'Approximate mappings should be reviewed by a solution architect before using the comparison in a client proposal.',
    });
  }

  return mergedArchitectureRiskFlags(flags, serverFindings);
}

function mergedArchitectureRiskFlags(
  localFlags: ArchitectureRiskFlag[],
  serverFindings?: ComparisonAnalyticsResponse['finOpsFindings'],
): ArchitectureRiskFlag[] {
  const backendFlags = (serverFindings ?? []).map(finOpsFindingRiskFlag);
  const localSignalFlags =
    backendFlags.length > 0
      ? localFlags.filter((flag) => flag.id !== 'no-material-risk')
      : localFlags;
  const merged = [...backendFlags, ...localSignalFlags].sort(
    (left, right) => riskSeverityRank(right.severity) - riskSeverityRank(left.severity),
  );

  if (merged.length > 0) {
    return merged.slice(0, 6);
  }

  return [
    {
      id: 'no-material-risk',
      title: 'No material architecture risk flags',
      severity: 'low',
      signal: 'Low',
      evidence:
        'Current inputs do not cross deterministic thresholds for NoSQL throughput, egress concentration, fast data growth, cross-region transfer, or backend FinOps findings.',
    },
  ];
}

function commitmentCoverageGapRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): CommitmentCoverageGapRow[] {
  if (!comparison) {
    return [];
  }

  const targetCoveragePercent = clampNumber(
    parseInputNumber(form.commitmentPreferencePercent) ?? 0,
    0,
    100,
  );
  const targetCoverageRate = targetCoveragePercent / 100;
  const exposedPercent = 100 - targetCoveragePercent;

  return comparison.providers
    .flatMap((provider) => {
      const commitment = bestCommitmentModel(provider);
      const onDemandMonthly =
        executiveModelMonthlyCost(provider, 'on-demand') ?? provider.totals.monthly;

      if (
        !commitment ||
        commitment.model.monthlyCostUsd === undefined ||
        onDemandMonthly <= commitment.model.monthlyCostUsd
      ) {
        return [];
      }

      const committedMonthly = commitment.model.monthlyCostUsd;
      const targetBlendMonthly = roundCurrency(
        onDemandMonthly * (1 - targetCoverageRate) + committedMonthly * targetCoverageRate,
      );
      const fullCoverageSavingsMonthly = roundCurrency(onDemandMonthly - committedMonthly);
      const openGapMonthly = roundCurrency(targetBlendMonthly - committedMonthly);

      return [
        {
          providerId: provider.providerId,
          onDemandMonthly: roundCurrency(onDemandMonthly),
          targetBlendMonthly,
          committedMonthly: roundCurrency(committedMonthly),
          targetCoveragePercent,
          exposedPercent,
          openGapMonthly,
          fullCoverageSavingsMonthly,
          commitmentLabel:
            commitment.model.displayName ?? pricingModelSummaryLabel(commitment.model.model),
          coverageLabel:
            targetCoveragePercent === 100
              ? 'Fully covered target'
              : `${formatPercent(exposedPercent)} on-demand exposure remains`,
          evidence: `${providerLabel(provider.providerId)} can move from ${formatCurrency(
            onDemandMonthly,
          )}/mo on-demand to ${formatCurrency(committedMonthly)}/mo at 100% eligible coverage.`,
        },
      ];
    })
    .sort((left, right) => right.openGapMonthly - left.openGapMonthly);
}

function crossProviderTcoRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
  serverSignals?: ComparisonAnalyticsResponse['tcoSignals'],
): CrossProviderTcoRow[] {
  if (!comparison) {
    return [];
  }

  const serverSignalsByProvider = new Map(
    (serverSignals ?? []).map((signal) => [signal.providerId, signal]),
  );
  const environment = form.environment;
  const storageGb = parseInputNumber(form.storageSizeGb) ?? 0;
  const egressGb = parseInputNumber(form.monthlyEgressGb) ?? 0;
  const instanceCount = parseInputNumber(form.instanceCount) ?? 0;
  const freeTierCandidate =
    environment !== 'production' && instanceCount <= 1 && storageGb <= 30 && egressGb <= 100;

  return comparison.providers.map((provider) => {
    const serverSignal = serverSignalsByProvider.get(provider.providerId);
    const egressExitProxy = roundCurrency(
      serverSignal?.egressLockInMonthlyUsd ?? componentMonthly(provider, 'egress'),
    );
    const supportMonthly = roundCurrency(
      serverSignal?.supportMonthlyUsd ?? componentMonthly(provider, 'support'),
    );
    const licensingMonthly = roundCurrency(
      serverSignal?.licensingMonthlyUsd ?? componentMonthly(provider, 'licensing'),
    );
    const bestCommitment = bestCommitmentModel(provider);
    const committedMonthly = bestCommitment?.model.monthlyCostUsd;
    const monthlyRunRate =
      committedMonthly !== undefined && committedMonthly < provider.totals.monthly
        ? committedMonthly
        : provider.totals.monthly;
    const threeYearRunRate = roundCurrency(
      monthlyRunRate * 36 + (bestCommitment?.model.upfrontCostUsd ?? 0),
    );
    const freeTierSignal = serverSignal
      ? capitalize(serverSignal.freeTierApplicability)
      : freeTierCandidate
        ? 'Candidate'
        : environment === 'production'
          ? 'Unlikely'
          : 'Limited';
    const evidence = serverSignal
      ? [
          serverSignal.note,
          supportMonthly > 0
            ? 'Backend analytics includes support-plan exposure.'
            : 'Backend analytics did not find material support-plan exposure.',
          licensingMonthly > 0
            ? 'OS/licensing exposure is modeled explicitly.'
            : 'No material OS/licensing exposure is modeled.',
        ].join(' ')
      : [
          egressExitProxy > provider.totals.monthly * 0.2
            ? 'Data-out is a material migration-away cost proxy.'
            : 'Data-out proxy is not the dominant TCO driver.',
          supportMonthly > 0
            ? 'Support is modeled as an explicit provider line item.'
            : 'Support plan is not priced for this provider response.',
          freeTierCandidate
            ? 'Small non-production profile may qualify for introductory/free-tier review.'
            : 'Scale, production posture, or data transfer likely exceeds free-tier assumptions.',
        ].join(' ');

    return {
      providerId: provider.providerId,
      threeYearRunRate,
      egressExitProxy,
      supportMonthly,
      licensingMonthly,
      freeTierSignal,
      evidence,
    };
  });
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
  const rightSizingRate = form.usagePattern === 'bursty' ? rightSizingSavingsRate(utilization) : 0;
  const rightSizingMonthly =
    rightSizingRate > 0 ? roundCurrency(computeMonthly * rightSizingRate) : undefined;
  const rightsizingSignal =
    rightSizingMonthly !== undefined
      ? `Save ${formatCurrency(rightSizingMonthly)}/mo`
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
      detail:
        rightSizingMonthly !== undefined
          ? `${formatDecimal(utilization ?? 0)}% average utilization implies a ${formatPercent(
              rightSizingRate * 100,
            )} compute-spend review before commitment.`
          : `${capitalize(form.usagePattern.replace('_', ' '))} usage with ${form.scalingType} capacity. Validate CPU, memory, and peak concurrency before commitment.`,
      tone:
        rightSizingMonthly !== undefined
          ? utilization !== undefined && utilization <= 25
            ? 'risk'
            : 'review'
          : rightsizingSignal === 'Autoscaling ready'
            ? 'good'
            : 'review',
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
  serverRows?: ComparisonAnalyticsResponse['sensitivityScenarios'],
): SensitivityScenarioRow[] {
  if (serverRows && serverRows.length > 0) {
    return backendSensitivityScenarioRows(serverRows);
  }

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

function maxComponentShare(comparison: ComparisonResult | null, component: CostComponent): number {
  if (!comparison) {
    return 0;
  }

  return comparison.providers.reduce((maxShare, provider) => {
    if (provider.totals.monthly <= 0) {
      return maxShare;
    }

    const share = (componentMonthly(provider, component) / provider.totals.monthly) * 100;

    return Math.max(maxShare, share);
  }, 0);
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
      <Suspense fallback={<div className="engineering-bar-chart-shell">Loading charts…</div>}>
        {analytics.providers.map((provider) => (
          <EngineeringProviderServiceChart
            key={provider.providerId}
            provider={provider}
            compact={compact}
          />
        ))}
      </Suspense>
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
  // FE-1: these rebuild every provider x line-item dataset. Without memoisation
  // they were recomputed on every parent re-render (i.e. every keystroke).
  const providerResults = useMemo(
    () =>
      new Map<ProviderId, ComparisonProviderResult>(
        comparison?.providers.map((provider) => [provider.providerId, provider]) ?? [],
      ),
    [comparison],
  );
  const summaries = useMemo(
    () => providerCostSummaries(comparison, interval),
    [comparison, interval],
  );

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

function TerraformGenerationPanel({
  client,
  comparison,
  form,
}: {
  client: PolyCostClient;
  comparison: ComparisonResult | null;
  form: WorkloadFormState;
}) {
  const [targetCloud, setTargetCloud] = useState<TerraformTargetCloud>(
    comparison?.cheapestProviderId ?? 'aws',
  );
  const [runtimeTarget, setRuntimeTarget] = useState<TerraformRuntimeTarget>('vm');
  const [networkTopology, setNetworkTopology] = useState<TerraformNetworkTopology>(
    form.environment === 'production' || form.databaseEnabled || form.loadBalancer
      ? 'private'
      : 'public',
  );
  const [availabilityMode, setAvailabilityMode] = useState<TerraformAvailabilityMode>(
    terraformAvailabilityModeFromForm(form),
  );
  const [bundle, setBundle] = useState<TerraformGenerationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    if (comparison?.cheapestProviderId) {
      setTargetCloud(comparison.cheapestProviderId);
    }
  }, [comparison?.comparisonId, comparison?.cheapestProviderId]);

  useEffect(() => {
    setNetworkTopology(
      form.environment === 'production' || form.databaseEnabled || form.loadBalancer
        ? 'private'
        : 'public',
    );
    setAvailabilityMode(terraformAvailabilityModeFromForm(form));
  }, [
    comparison?.comparisonId,
    form.databaseEnabled,
    form.environment,
    form.loadBalancer,
    form.multiAz,
    form.multiRegion,
  ]);

  async function handleGenerateTerraform() {
    if (!comparison) {
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const nws = buildNwsFromForm(form, 'structured_form');
      const result = await client.generateTerraform({
        targetCloud,
        nws,
        workspaceName: form.workloadName.trim() || comparison.requirements?.workloadName,
        options: {
          runtimeTarget,
          networkTopology,
          availabilityMode,
          includePolicyPack: true,
          includeModuleScaffold: true,
        },
      });
      setBundle(result);
    } catch (terraformError) {
      setBundle(null);
      setGenerationError(formatApiError(terraformError));
    } finally {
      setIsGenerating(false);
    }
  }

  function handleDownloadArchive() {
    if (!bundle) {
      return;
    }

    downloadBlob(
      base64ToBlob(bundle.archive.contentBase64, bundle.archive.mimeType),
      bundle.archive.filename,
    );
  }

  function handleDownloadBundleJson() {
    if (!bundle) {
      return;
    }

    downloadBlob(
      new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      }),
      `${bundle.bundleName}.json`,
    );
  }

  const selectedProviderTotal = comparison?.providers.find(
    (provider) => provider.providerId === targetCloud,
  )?.totals.monthly;
  const previewFile = bundle?.files.find((file) => file.path === 'main.tf') ?? bundle?.files[0];

  return (
    <section className="terraform-generation-panel" aria-label="Terraform generation">
      <div className="terraform-generation-heading">
        <div>
          <span>Infrastructure as Code</span>
          <h3>Terraform starter bundle</h3>
          <p>
            Generate a provider-specific baseline from the reviewed workload. PolyCost validates
            static safety signals here; run Terraform init, fmt, validate, and plan in your target
            account before treating it as deployable.
          </p>
        </div>
        {bundle ? (
          <span className={`terraform-status terraform-status-${bundle.validation.status}`}>
            {capitalize(bundle.validation.status)}
          </span>
        ) : null}
      </div>

      <div className="terraform-target-grid" role="radiogroup" aria-label="Terraform target cloud">
        {PROVIDER_ORDER.map((providerId) => (
          <button
            key={providerId}
            type="button"
            className={[
              'terraform-target-card',
              `terraform-target-${providerId}`,
              providerId === targetCloud ? 'is-selected' : undefined,
            ]
              .filter(Boolean)
              .join(' ')}
            role="radio"
            aria-checked={providerId === targetCloud}
            onClick={() => {
              setTargetCloud(providerId);
              setBundle(null);
              setGenerationError(null);
            }}
          >
            <span>{providerLabel(providerId)}</span>
            <strong>
              {comparison
                ? selectedProviderTotal !== undefined && providerId === targetCloud
                  ? formatCurrency(selectedProviderTotal)
                  : formatCurrency(
                      comparison.providers.find((provider) => provider.providerId === providerId)
                        ?.totals.monthly ?? 0,
                    )
                : 'Pending'}
            </strong>
            <small>{providerTerraformResourceLabel(providerId)}</small>
          </button>
        ))}
      </div>

      <div className="terraform-option-grid" aria-label="Terraform generation profile">
        <label>
          <span>Runtime</span>
          <select
            value={runtimeTarget}
            onChange={(event) => {
              setRuntimeTarget(event.target.value as TerraformRuntimeTarget);
              setBundle(null);
            }}
          >
            {TERRAFORM_RUNTIME_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Topology</span>
          <select
            value={networkTopology}
            onChange={(event) => {
              setNetworkTopology(event.target.value as TerraformNetworkTopology);
              setBundle(null);
            }}
          >
            {TERRAFORM_NETWORK_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Availability</span>
          <select
            value={availabilityMode}
            onChange={(event) => {
              setAvailabilityMode(event.target.value as TerraformAvailabilityMode);
              setBundle(null);
            }}
          >
            {TERRAFORM_AVAILABILITY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="terraform-generation-actions">
        <Button
          type="button"
          variant="primary"
          onClick={handleGenerateTerraform}
          disabled={!comparison || isGenerating}
          loading={isGenerating}
          loadingLabel="Generating Terraform..."
        >
          <TerraformIcon />
          Generate Terraform
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleDownloadArchive}
          disabled={!bundle || isGenerating}
        >
          <DownloadIcon />
          Download Terraform ZIP
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleDownloadBundleJson}
          disabled={!bundle || isGenerating}
        >
          <DownloadIcon />
          Download evidence JSON
        </Button>
      </div>

      {generationError ? <p className="terraform-generation-error">{generationError}</p> : null}

      {bundle ? (
        <div className="terraform-result-grid">
          <div className="terraform-result-summary">
            <span>
              {providerLabel(bundle.targetCloud)} · {bundle.region}
            </span>
            <strong>{bundle.bundleName}</strong>
            <div className="terraform-resource-chips" aria-label="Generated Terraform resources">
              <span>{runtimeProfileLabel(bundle.generationProfile.runtimeTarget)}</span>
              <span>{topologyProfileLabel(bundle.generationProfile.networkTopology)}</span>
              <span>{availabilityProfileLabel(bundle.generationProfile.availabilityMode)}</span>
              <span>{bundle.resourceSummary.computeInstances} VM</span>
              <span>{bundle.resourceSummary.objectStorageBuckets} object store</span>
              <span>{bundle.resourceSummary.relationalDatabases} database</span>
              <span>{bundle.files.length} files</span>
              <span>{formatFileSize(bundle.archive.sizeBytes)} ZIP</span>
            </div>
          </div>

          <div className="terraform-validation-list" aria-label="Terraform validation checks">
            {bundle.validation.checks.map((check) => (
              <span key={check.id} className={`terraform-check terraform-check-${check.status}`}>
                {check.id}
              </span>
            ))}
          </div>

          <div className="terraform-file-list" aria-label="Generated Terraform files">
            {bundle.files.map((file) => (
              <span key={file.path}>
                <strong>{file.path}</strong>
                <small>{file.sha256.slice(0, 10)}</small>
              </span>
            ))}
          </div>

          {previewFile ? (
            <div className="terraform-file-preview">
              <strong>{previewFile.path}</strong>
              <pre>{previewTerraformContent(previewFile.content)}</pre>
            </div>
          ) : null}

          <div className="terraform-evidence-columns">
            <TerraformEvidenceList
              title="Mappings"
              items={bundle.serviceMappings.map(mappingLabel)}
            />
            <TerraformEvidenceList title="Assumptions" items={bundle.assumptions.slice(0, 4)} />
            <TerraformEvidenceList title="Security" items={bundle.securityNotes.slice(0, 4)} />
          </div>
        </div>
      ) : (
        <p className="terraform-empty-state">
          Run generation after the cost comparison is ready. The output is a starter IaC bundle with
          backend examples, provider pinning, and explicit review notes.
        </p>
      )}
    </section>
  );
}

function TerraformEvidenceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
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
  const review = useMemo(
    () => buildFinOpsReview(comparison, interval, form),
    [comparison, interval, form],
  );
  const summaries = useMemo(
    () => providerCostSummaries(comparison, interval),
    [comparison, interval],
  );

  return (
    <section className="architecture-workspace" aria-label="Architecture and governance review">
      <SolutionArchitecturePanel review={review.solutionArchitecture} />
      <FinOpsReviewPanel review={review} />
      <CategoryHeatmap summaries={summaries} />
    </section>
  );
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
  const summaries = useMemo(
    () => providerCostSummaries(comparison, interval),
    [comparison, interval],
  );
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
        <div
          className={`confidence-pill confidence-${decision.confidence.toLowerCase()}`}
          title={CONFIDENCE_TOOLTIP}
          aria-label={`Confidence ${decision.confidence}. ${decision.confidenceDetail}. ${CONFIDENCE_TOOLTIP}`}
        >
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
      <div className="table-wrap" tabIndex={0} aria-label="Provider ranking table">
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
      <div className="heatmap-grid" role="table" tabIndex={0} aria-label="Provider category costs">
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

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M12 4l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V7l7-3zM9 12l2 2 4-5" />
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
      ) : mode === 'diagram' ? (
        <path d="M5 6h14v10H5zM8 19h8M8 10h3M13 10h3M11 10l2 3" />
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

function TerraformIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M5 5h6v6H5zM13 5h6v6h-6zM9 13h6v6H9zM11 8h2M12 11v2" />
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

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
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

function readStoredAuthState(): { token: string; expired: boolean } {
  const token = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) ?? '';
  const expiresAt = window.localStorage.getItem(AUTH_SESSION_EXPIRES_AT_STORAGE_KEY) ?? '';

  if (!token) {
    window.localStorage.removeItem(AUTH_SESSION_EXPIRES_AT_STORAGE_KEY);
    return { token: '', expired: false };
  }

  if (isPastIsoTimestamp(expiresAt)) {
    clearStoredAuthToken();
    return { token: '', expired: true };
  }

  return { token, expired: false };
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
    inputMode: sanitizeInputMode(entry.inputMode),
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

function readStoredRequirementSession(): StoredRequirementSession | undefined {
  try {
    const stored = window.sessionStorage.getItem(REQUIREMENT_SESSION_STORAGE_KEY);
    if (!stored) {
      return undefined;
    }

    const parsed = JSON.parse(stored) as Partial<StoredRequirementSession>;
    const inputMode: InputMode = sanitizeInputMode(parsed.inputMode);
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

function serviceRequirementForManualClassification(
  nodeId: string,
  serviceType: string,
): ServiceRequirement {
  const option = diagramServiceOptionForType(serviceType);
  const assumedDefaults = manualAssumptionsForService(option.serviceCategory, option.serviceType);

  return {
    serviceCategory: option.serviceCategory,
    serviceType: option.serviceType,
    quantity: 1,
    scaleParams: {
      confidence: 'low',
      reason: 'manual diagram review classification',
      diagramNodeId: nodeId,
      assumedDefaultCount: assumedDefaults.length,
    },
  };
}

function serviceLabelForType(serviceType: string): string {
  return diagramServiceOptionForType(serviceType).label;
}
