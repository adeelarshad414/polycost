import { ProviderId } from '../adapters/common/cloud-provider-adapter';
import { NormalizedWorkloadSpec } from '../nws/nws.types';

export type TerraformTargetCloud = ProviderId;
export type TerraformValidationStatus = 'passed' | 'warning' | 'failed';
export type TerraformCommandStatus = 'not-run' | 'passed' | 'failed';
export type TerraformRuntimeTarget = 'vm' | 'containers' | 'serverless' | 'kubernetes';
export type TerraformNetworkTopology = 'public' | 'private' | 'landing-zone';
export type TerraformAvailabilityMode =
  'single-region' | 'multi-az' | 'multi-region-dr' | 'active-active';

export interface TerraformGenerateOptions {
  runtimeTarget?: TerraformRuntimeTarget;
  networkTopology?: TerraformNetworkTopology;
  availabilityMode?: TerraformAvailabilityMode;
  includePolicyPack?: boolean;
  includeModuleScaffold?: boolean;
}

export interface TerraformGenerationProfile {
  runtimeTarget: TerraformRuntimeTarget;
  networkTopology: TerraformNetworkTopology;
  availabilityMode: TerraformAvailabilityMode;
  policyPackIncluded: boolean;
  moduleScaffoldIncluded: boolean;
}

export interface TerraformGenerateInput {
  targetCloud: TerraformTargetCloud;
  nws: unknown;
  workspaceName?: string;
  region?: string;
  options?: TerraformGenerateOptions;
}

export interface TerraformGeneratedFile {
  path: string;
  content: string;
  sha256: string;
}

export interface TerraformValidationCheck {
  id: string;
  status: TerraformValidationStatus;
  message: string;
}

export interface TerraformValidationCommand {
  command: string;
  status: TerraformCommandStatus;
  message: string;
}

export interface TerraformGenerationValidation {
  status: TerraformValidationStatus;
  executionMode: 'static' | 'static-plus-policy';
  checks: TerraformValidationCheck[];
  commands: TerraformValidationCommand[];
}

export interface TerraformResourceSummary {
  computeInstances: number;
  objectStorageBuckets: number;
  blockStorageVolumes: number;
  fileShares: number;
  relationalDatabases: number;
  loadBalancers: number;
  cdnEnabled: boolean;
  multiAz: boolean;
  multiRegion: boolean;
}

export interface TerraformGenerationResult {
  targetCloud: TerraformTargetCloud;
  generatedAt: string;
  bundleName: string;
  workspaceName: string;
  region: string;
  generationProfile: TerraformGenerationProfile;
  source: {
    schemaVersion: NormalizedWorkloadSpec['schemaVersion'];
    workloadName?: string;
    workloadType: NormalizedWorkloadSpec['workload']['type'];
    sourceType: NormalizedWorkloadSpec['metadata']['sourceType'];
  };
  resourceSummary: TerraformResourceSummary;
  serviceMappings: Array<{
    requirement: string;
    terraformResource: string;
    confidence: 'direct' | 'approximate' | 'manual-review';
    note: string;
  }>;
  files: TerraformGeneratedFile[];
  validation: TerraformGenerationValidation;
  assumptions: string[];
  securityNotes: string[];
  nextSteps: string[];
}
