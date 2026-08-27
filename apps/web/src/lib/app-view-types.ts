// Shared view-model types extracted from App.tsx (H-F1, slice 2).
//
// These describe the derived shapes the comparison UI works with. Lifting them
// out of the monolith lets the pure helpers that consume them move out too,
// instead of each one holding a reference back into App.tsx.

import { PolyCostClient } from '../api-client';
import { CloudServiceFamily } from '../service-catalog';
import { ComparisonProviderResult, PricingModelKey, ProviderId, ServiceRequirement } from '../types';
import { WorkloadFormState } from '../workload';

export type InputMode = 'describe' | 'form' | 'diagram';

export type BusyAction = 'parse' | 'compare' | 'refresh' | 'export' | null;

export type ServiceCategory = ComparisonProviderResult['lineItems'][number]['category'];

export type ComparisonLineItem = ComparisonProviderResult['lineItems'][number];

export type CostComponent = NonNullable<ComparisonLineItem['costComponent']>;

export type FormSectionTone = 'profile' | 'compute' | 'services' | 'portfolio' | 'data' | 'network';

export type ToggleIconKind = 'storage' | 'database' | 'cdn' | 'loadBalancer' | 'multiAz' | 'multiRegion';

export type CostMatrixCategoryFilter = ServiceCategory | 'all';

export type CostMatrixProviderFilter = ProviderId | 'all';

export type CostMatrixPricingModelFilter = PricingModelKey | 'all';

export type CostMatrixSortKey = 'service' | `${ProviderId}:${PricingModelKey}`;

export type CostMatrixColumnMode = 'summary' | 'technical';

export type ServiceRequirementCategory = ServiceRequirement['serviceCategory'];

export interface ComputeSizePreset {
  id: string;
  label: string;
  tier: WorkloadFormState['instanceTier'];
  vcpu: number;
  memoryGb: number;
  fit: string;
  families: string;
}

export interface ComputeStorageDefault {
  sizeGb: string;
  storageRole: string;
  storageType: WorkloadFormState['storageType'];
  storageAccessPattern: WorkloadFormState['storageAccessPattern'];
  storageClass: WorkloadFormState['storageClass'];
  provisionedIops?: string;
  provisionedThroughputMbps?: string;
}

export interface StoredRequirementSession {
  inputMode: InputMode;
  naturalLanguageInput: string;
  form: WorkloadFormState;
  pricingModel: PricingModelKey;
  requirementsAwaitingReview: boolean;
}

export interface ComparisonHistoryEntry {
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

export interface CategoryCostSummary {
  category: ServiceCategory;
  total: number;
  percentOfTotal: number;
}

export interface ProviderCostSummary {
  providerId: ProviderId;
  total?: number;
  percentOfMax: number;
  deltaFromLowest?: number;
  percentOverLowest?: number;
  approximateCount: number;
  lineItemCount: number;
  categoryTotals: CategoryCostSummary[];
}

export interface ProviderMixDatum {
  providerId: ProviderId;
  name: string;
  value: number;
  percent: number;
  color: string;
}

export interface ExecutiveAnalyticsModel {
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

export interface EngineeringServiceDatum {
  category: ServiceCategory;
  serviceLabel: string;
  value: number;
  percent: number;
  color: string;
}

export interface EngineeringProviderServiceModel {
  providerId: ProviderId;
  total?: number;
  lineItemCount: number;
  approximateCount: number;
  services: EngineeringServiceDatum[];
  dominantService?: EngineeringServiceDatum;
}

export interface EngineeringAnalyticsModel {
  providers: EngineeringProviderServiceModel[];
  pricedProviders: EngineeringProviderServiceModel[];
  totalLineItems: number;
  approximateCount: number;
  topDriver?: {
    providerId: ProviderId;
    service: EngineeringServiceDatum;
  };
}

export interface ExecutiveDecision {
  headline: string;
  subhead: string;
  confidence: 'High' | 'Medium' | 'Low' | 'Pending';
  confidenceDetail: string;
  annualExposure?: number;
  avoidableAnnualSpend?: number;
  lenses: ExecutiveLens[];
}

export interface FinOpsReview {
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

export interface ExecutiveLens {
  role: 'Budget' | 'Delivery' | 'Risk' | 'Governance' | 'Provider';
  label: string;
  value: string;
  detail: string;
}

export interface SolutionArchitectureReview {
  posture: 'Ready for shortlist' | 'Architecture review' | 'Assumptions needed' | 'Pending';
  riskLevel: 'Low' | 'Medium' | 'High' | 'Pending';
  summary: string;
  baselineLabel: string;
  baselineValue: string;
  checkpoints: SolutionArchitectureCheckpoint[];
}

export interface SolutionArchitectureCheckpoint {
  label: string;
  value: string;
  detail: string;
  tone: 'good' | 'review' | 'risk' | 'pending';
}

export interface ProviderFitSummary {
  providerId: ProviderId;
  label: string;
  detail: string;
  tone: 'preferred' | 'review' | 'unavailable';
}

export interface AppProps {
  client?: PolyCostClient;
}

export interface BulkServiceDraftRow {
  line: string;
  query: string;
  quantity: string;
  tier: string;
  note: string;
  family?: CloudServiceFamily;
  status: 'matched' | 'unmatched';
}

export interface ComputeSizingIntent {
  vcpu: number;
  memoryGb: number;
  tier?: WorkloadFormState['instanceTier'];
}

export interface BreakEvenTimelineModel {
  providerId: ProviderId;
  providerLabel: string;
  pricingLabel: string;
  horizonMonths: number;
  breakEvenMonth: number;
  yMax: number;
  onDemandMonthly: number;
  committedMonthly: number;
  monthlySavings: number;
  upfront: number;
  onDemandPoints: string;
  committedPoints: string;
  breakEvenPoint?: {
    x: number;
    y: number;
  };
}

export interface CostMatrixCell {
  available: boolean;
  monthlyCostUsd?: number;
  estimated?: boolean;
  caveat?: string;
}

export interface FullCostMatrixRow {
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

export interface ProductionDepthInsight {
  label: string;
  value: string;
  detail: string;
  tone: 'good' | 'review' | 'risk';
}

export interface SensitivityScenarioProviderCost {
  providerId: ProviderId;
  monthlyCostUsd: number;
  deltaVsBaselineUsd: number;
  isLowest: boolean;
}

export interface SensitivityScenarioRow {
  id: string;
  label: string;
  assumption: string;
  providers: SensitivityScenarioProviderCost[];
  lowestProviderId?: ProviderId;
}

export interface ProviderDeltaRow {
  category: ServiceCategory;
  lowProviderId: ProviderId;
  highProviderId: ProviderId;
  lowMonthly: number;
  highMonthly: number;
  monthlyDelta: number;
  savingsPercent: number;
  coverage: string;
  insight: string;
  evidence: string;
}

export interface ComputeSpecificationProfile {
  x86Family: string;
  armFamily: string;
  gpuFamily?: string;
  useCase: string;
  networkBaseline: string;
  diskBaseline: string;
  performanceNote: string;
}

export interface ComputeSpecificationRow {
  providerId: ProviderId;
  familyLabel: string;
  architectureFit: string;
  requestedCapacity: string;
  networkBaseline: string;
  diskBaseline: string;
  economics: string;
  armDelta: string;
  tenancySignal: string;
  recommendation: string;
  evidence: string;
}

export interface RegionVarianceProviderCost {
  providerId: ProviderId;
  providerRegion: string;
  modeledMonthly: number;
  deltaVsSelected: number;
  isLowest: boolean;
}

export interface RegionVarianceRow {
  regionId: string;
  label: string;
  regionSummary: string;
  multiplier: number;
  evidence: string;
  isSelected: boolean;
  providers: RegionVarianceProviderCost[];
  lowestProviderId?: ProviderId;
}

export interface CommitmentCoverageGapRow {
  providerId: ProviderId;
  onDemandMonthly: number;
  targetBlendMonthly: number;
  committedMonthly: number;
  targetCoveragePercent: number;
  exposedPercent: number;
  openGapMonthly: number;
  fullCoverageSavingsMonthly: number;
  commitmentLabel: string;
  coverageLabel: string;
  evidence: string;
}

export interface CrossProviderTcoRow {
  providerId: ProviderId;
  threeYearRunRate: number;
  egressExitProxy: number;
  supportMonthly: number;
  licensingMonthly: number;
  freeTierSignal: string;
  evidence: string;
}

export interface EgressOptimizationRow {
  providerId: ProviderId;
  egressMonthly: number;
  egressSharePercent: number;
  primaryDriver: string;
  trafficSignal: string;
  monthlySavings: number;
  effort: 'Low' | 'Medium' | 'High';
  recommendation: string;
  driverEvidence: string;
  evidence: string;
}

export interface NetworkingCostRow {
  id: string;
  providerId: ProviderId;
  component: string;
  monthly: number;
  sharePercent: number;
  rateEvidence: string;
  volumeEvidence: string;
  validationAction: string;
  evidence: string;
}

export interface StorageOptimizationRow {
  providerId: ProviderId;
  storageMonthly: number;
  storageSharePercent: number;
  primaryDriver: string;
  usageSignal: string;
  monthlySavings: number;
  annualSavings: number;
  effort: 'Low' | 'Medium' | 'High';
  recommendation: string;
  driverEvidence: string;
  evidence: string;
}

export interface StorageAnatomyRow {
  providerId: ProviderId;
  storageProfile: string;
  monthly: number;
  sharePercent: number;
  operationsSignal: string;
  resilienceSignal: string;
  performanceSignal: string;
  rateEvidence: string;
  recommendation: string;
  evidence: string;
}

export interface DatabaseOptimizationRow {
  providerId: ProviderId;
  databaseMonthly: number;
  databaseSharePercent: number;
  primaryDriver: string;
  usageSignal: string;
  monthlySavings: number;
  annualSavings: number;
  effort: 'Low' | 'Medium' | 'High';
  recommendation: string;
  driverEvidence: string;
  evidence: string;
}

export interface DatabaseAnatomyRow {
  providerId: ProviderId;
  databaseProfile: string;
  monthly: number;
  sharePercent: number;
  capacitySignal: string;
  resilienceSignal: string;
  analyticsSignal: string;
  rateEvidence: string;
  recommendation: string;
  evidence: string;
}

export interface RuntimeOptimizationRow {
  providerId: ProviderId;
  runtimeMonthly: number;
  runtimeSharePercent: number;
  primaryDriver: string;
  usageSignal: string;
  monthlySavings: number;
  annualSavings: number;
  effort: 'Low' | 'Medium' | 'High';
  recommendation: string;
  driverEvidence: string;
  evidence: string;
}

export interface ServerlessFunctionRates {
  requestPerMillion: number;
  gbSecond: number;
  evidence: string;
}

export interface ServerlessMemoryCurveRow {
  providerId: ProviderId;
  currentMonthly: number;
  modeledMonthly: number;
  currentMemoryMb: number;
  currentDurationMs: number;
  breakEvenMemoryMb: number;
  breakEvenDurationMs: number;
  deltaPercent: number;
  usageSignal: string;
  recommendation: string;
  evidence: string;
}

export interface AppPlatformModelRates {
  requestPerMillion: number;
  vcpuHour: number;
  memoryGbHour: number;
  alwaysOnVcpuHour: number;
  alwaysOnMemoryGbHour: number;
  evidence: string;
}

export interface AppPlatformModelRow {
  providerId: ProviderId;
  requestBasedMonthly: number;
  alwaysOnMonthly: number;
  winningModel: 'Request-based' | 'Always-on';
  monthlyDelta: number;
  annualDelta: number;
  usageSignal: string;
  requestEvidence: string;
  alwaysOnEvidence: string;
  recommendation: string;
  evidence: string;
}

export interface OperationsOptimizationRow {
  providerId: ProviderId;
  operationsMonthly: number;
  operationsSharePercent: number;
  primaryDriver: string;
  usageSignal: string;
  monthlySavings: number;
  annualSavings: number;
  effort: 'Low' | 'Medium' | 'High';
  recommendation: string;
  driverEvidence: string;
  evidence: string;
}

export interface SpotBlendOptimizerRow {
  providerId: ProviderId;
  onDemandMonthly: number;
  spotMonthly: number;
  blendedMonthly: number;
  estimatedLowMonthly: number;
  estimatedHighMonthly: number;
  monthlySavings: number;
  annualSavings: number;
  spotPercent: number;
  onDemandPercent: number;
  risk: 'Low' | 'Medium' | 'High';
  interruptionFrequency: string;
  providerTerm: string;
  workloadFit: string;
  evidence: string;
}

export interface LicenseOptimizationRow {
  providerId: ProviderId;
  windowsMonthly: number;
  linuxEquivalentMonthly: number;
  monthlySavings: number;
  annualSavings: number;
  licensePath: string;
  recommendation: string;
  evidence: string;
}

export interface ArchitectureRiskFlag {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  signal: string;
  evidence: string;
}
