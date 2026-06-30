import { NormalizedWorkloadSpec } from './types';
import {
  DEFAULT_SELECTED_SERVICE_FAMILY_IDS,
  serviceCatalogTraceability,
  serviceFamilyIdsFromTraceability,
} from './service-catalog';
import {
  canonicalRegionForRegionPreference,
  DEFAULT_COMPARISON_REGION,
} from './region-normalization';

export type WorkloadType = NormalizedWorkloadSpec['workload']['type'];
export type StorageType = NormalizedWorkloadSpec['storage'][number]['type'];
export type DatabaseEngine = NormalizedWorkloadSpec['database'][number]['engine'];

export interface WorkloadFormState {
  workloadName: string;
  workloadType: WorkloadType;
  regionPreference: string;
  dailyActiveUsers: string;
  peakConcurrentUsers: string;
  computeRole: string;
  vcpu: string;
  memoryGb: string;
  instanceCount: string;
  scalingType: 'fixed' | 'autoscaling';
  autoscaleMin: string;
  autoscaleMax: string;
  storageEnabled: boolean;
  storageRole: string;
  storageType: StorageType;
  storageSizeGb: string;
  storageAccessPattern: 'frequent' | 'infrequent' | 'archive';
  databaseEnabled: boolean;
  databaseRole: string;
  databaseEngine: DatabaseEngine;
  databaseSizeGb: string;
  databaseHighAvailability: boolean;
  monthlyEgressGb: string;
  cdn: boolean;
  loadBalancer: boolean;
  selectedServiceFamilyIds: string[];
  multiAz: boolean;
  multiRegion: boolean;
  slaTarget: string;
}

export interface WorkloadFormIssue {
  field: keyof WorkloadFormState;
  message: string;
}

type NumericWorkloadFormField =
  | 'dailyActiveUsers'
  | 'peakConcurrentUsers'
  | 'vcpu'
  | 'memoryGb'
  | 'instanceCount'
  | 'autoscaleMin'
  | 'autoscaleMax'
  | 'storageSizeGb'
  | 'databaseSizeGb'
  | 'monthlyEgressGb';

export const sampleNaturalLanguageInput =
  'A web app for 5,000 daily users with two web servers, a Postgres database, 250GB of upload storage, CDN, load balancing, and multi-AZ availability.';

export const defaultWorkloadForm: WorkloadFormState = {
  workloadName: 'Customer portal',
  workloadType: 'web_app',
  regionPreference: DEFAULT_COMPARISON_REGION,
  dailyActiveUsers: '5000',
  peakConcurrentUsers: '600',
  computeRole: 'web',
  vcpu: '2',
  memoryGb: '4',
  instanceCount: '2',
  scalingType: 'fixed',
  autoscaleMin: '2',
  autoscaleMax: '6',
  storageEnabled: true,
  storageRole: 'uploads',
  storageType: 'object',
  storageSizeGb: '250',
  storageAccessPattern: 'frequent',
  databaseEnabled: true,
  databaseRole: 'primary',
  databaseEngine: 'postgres',
  databaseSizeGb: '100',
  databaseHighAvailability: true,
  monthlyEgressGb: '750',
  cdn: true,
  loadBalancer: true,
  selectedServiceFamilyIds: DEFAULT_SELECTED_SERVICE_FAMILY_IDS,
  multiAz: true,
  multiRegion: false,
  slaTarget: '99.9%',
};

export function validateWorkloadForm(form: WorkloadFormState): WorkloadFormIssue[] {
  const issues: WorkloadFormIssue[] = [];

  requirePositiveNumber(issues, form, 'vcpu', 'vCPU must be greater than 0.');
  requirePositiveNumber(issues, form, 'memoryGb', 'Memory must be greater than 0.');
  requirePositiveInteger(issues, form, 'instanceCount', 'Instances must be a whole number above 0.');
  optionalNonNegativeIntegerField(
    issues,
    form,
    'dailyActiveUsers',
    'Daily users must be a whole number 0 or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'peakConcurrentUsers',
    'Peak users must be a whole number 0 or higher.',
  );

  if (form.scalingType === 'autoscaling') {
    requirePositiveInteger(issues, form, 'autoscaleMin', 'Scale min must be a whole number above 0.');
    requirePositiveInteger(issues, form, 'autoscaleMax', 'Scale max must be a whole number above 0.');

    const autoscaleMin = parseOptionalNumber(form.autoscaleMin);
    const autoscaleMax = parseOptionalNumber(form.autoscaleMax);

    if (
      autoscaleMin !== undefined &&
      autoscaleMax !== undefined &&
      autoscaleMin > 0 &&
      autoscaleMax > 0 &&
      Number.isInteger(autoscaleMin) &&
      Number.isInteger(autoscaleMax) &&
      autoscaleMax < autoscaleMin
    ) {
      issues.push({
        field: 'autoscaleMax',
        message: 'Scale max must be greater than or equal to scale min.',
      });
    }
  }

  if (form.storageEnabled) {
    requirePositiveNumber(issues, form, 'storageSizeGb', 'Storage must be greater than 0 GB.');
  }

  if (form.databaseEnabled) {
    optionalPositiveNumberField(
      issues,
      form,
      'databaseSizeGb',
      'Database size must be greater than 0 GB when provided.',
    );
  }

  optionalNonNegativeNumberField(
    issues,
    form,
    'monthlyEgressGb',
    'Egress must be 0 GB or higher.',
  );

  return issues;
}

export function buildNwsFromForm(
  form: WorkloadFormState,
  source: 'structured_form' | 'natural_language' = 'structured_form',
  rawInput?: string,
): NormalizedWorkloadSpec {
  const compute = {
    role: form.computeRole.trim() || 'web',
    ...optionalPositiveNumber('vcpu', form.vcpu),
    ...optionalPositiveNumber('memoryGb', form.memoryGb),
    ...optionalPositiveInteger('instanceCount', form.instanceCount),
    scalingType: form.scalingType,
    ...(form.scalingType === 'autoscaling'
      ? {
          autoscalingRange: {
            min: parseNonNegativeInteger(form.autoscaleMin, 1),
            max: parseNonNegativeInteger(form.autoscaleMax, 3),
          },
        }
      : {}),
  };

  return {
    schemaVersion: '1.0',
    metadata: {
      sourceType: source,
      ...(rawInput ? { rawInput } : {}),
      createdAt: new Date().toISOString(),
    },
    workload: {
      ...(form.workloadName.trim() ? { name: form.workloadName.trim() } : {}),
      type: form.workloadType,
      expectedUsers: {
        ...optionalNonNegativeInteger('dailyActiveUsers', form.dailyActiveUsers),
        ...optionalNonNegativeInteger('peakConcurrentUsers', form.peakConcurrentUsers),
      },
      region: normalizedRegionPreference(form.regionPreference),
    },
    compute: [compute],
    storage: form.storageEnabled
      ? [
          {
            role: form.storageRole.trim() || 'storage',
            type: form.storageType,
            sizeGb: parsePositiveNumber(form.storageSizeGb, 1),
            accessPattern: form.storageAccessPattern,
          },
        ]
      : [],
    database: form.databaseEnabled
      ? [
          {
            role: form.databaseRole.trim() || 'database',
            engine: form.databaseEngine,
            ...optionalPositiveNumber('sizeGb', form.databaseSizeGb),
            highAvailability: form.databaseHighAvailability,
          },
        ]
      : [],
    network: {
      ...optionalNonNegativeNumber('estimatedMonthlyEgressGb', form.monthlyEgressGb),
      cdn: form.cdn,
      loadBalancer: form.loadBalancer,
    },
    availability: {
      multiAz: form.multiAz,
      multiRegion: form.multiRegion,
      ...(form.slaTarget.trim() ? { slaTarget: form.slaTarget.trim() } : {}),
    },
    sourceTraceability: serviceCatalogTraceability(form.selectedServiceFamilyIds),
  };
}

export function formFromNws(nws: NormalizedWorkloadSpec): WorkloadFormState {
  const compute = nws.compute[0];
  const storage = nws.storage[0];
  const database = nws.database[0];

  return {
    ...defaultWorkloadForm,
    workloadName: nws.workload.name ?? defaultWorkloadForm.workloadName,
    workloadType: nws.workload.type,
    regionPreference: nws.workload.region.preference ?? '',
    dailyActiveUsers: numberToInput(nws.workload.expectedUsers?.dailyActiveUsers),
    peakConcurrentUsers: numberToInput(nws.workload.expectedUsers?.peakConcurrentUsers),
    computeRole: compute?.role ?? defaultWorkloadForm.computeRole,
    vcpu: numberToInput(compute?.vcpu),
    memoryGb: numberToInput(compute?.memoryGb),
    instanceCount: numberToInput(compute?.instanceCount),
    scalingType: compute?.scalingType ?? defaultWorkloadForm.scalingType,
    autoscaleMin: numberToInput(compute?.autoscalingRange?.min),
    autoscaleMax: numberToInput(compute?.autoscalingRange?.max),
    storageEnabled: Boolean(storage),
    storageRole: storage?.role ?? defaultWorkloadForm.storageRole,
    storageType: storage?.type ?? defaultWorkloadForm.storageType,
    storageSizeGb: numberToInput(storage?.sizeGb),
    storageAccessPattern: storage?.accessPattern ?? defaultWorkloadForm.storageAccessPattern,
    databaseEnabled: Boolean(database),
    databaseRole: database?.role ?? defaultWorkloadForm.databaseRole,
    databaseEngine: database?.engine ?? defaultWorkloadForm.databaseEngine,
    databaseSizeGb: numberToInput(database?.sizeGb),
    databaseHighAvailability:
      database?.highAvailability ?? defaultWorkloadForm.databaseHighAvailability,
    monthlyEgressGb: numberToInput(nws.network.estimatedMonthlyEgressGb),
    cdn: nws.network.cdn,
    loadBalancer: nws.network.loadBalancer,
    selectedServiceFamilyIds: serviceFamilyIdsFromTraceability(nws.sourceTraceability),
    multiAz: nws.availability.multiAz,
    multiRegion: nws.availability.multiRegion,
    slaTarget: nws.availability.slaTarget ?? '',
  };
}

function normalizedRegionPreference(
  regionPreference: string,
): NormalizedWorkloadSpec['workload']['region'] {
  const trimmedPreference = regionPreference.trim();
  const canonicalPreference = canonicalRegionForRegionPreference(trimmedPreference);
  const preference = canonicalPreference ?? trimmedPreference;

  return {
    ...(preference ? { preference } : {}),
    isDefault: !preference,
  };
}

function optionalPositiveNumber<K extends string>(
  key: K,
  value: string,
): Partial<Record<K, number>> {
  const parsed = parseOptionalNumber(value);
  return parsed && parsed > 0 ? ({ [key]: parsed } as Record<K, number>) : {};
}

function optionalNonNegativeNumber<K extends string>(
  key: K,
  value: string,
): Partial<Record<K, number>> {
  const parsed = parseOptionalNumber(value);
  return parsed !== undefined && parsed >= 0 ? ({ [key]: parsed } as Record<K, number>) : {};
}

function optionalPositiveInteger<K extends string>(
  key: K,
  value: string,
): Partial<Record<K, number>> {
  const parsed = parseOptionalNumber(value);
  return parsed && parsed > 0 ? ({ [key]: Math.round(parsed) } as Record<K, number>) : {};
}

function optionalNonNegativeInteger<K extends string>(
  key: K,
  value: string,
): Partial<Record<K, number>> {
  const parsed = parseOptionalNumber(value);
  return parsed !== undefined && parsed >= 0
    ? ({ [key]: Math.round(parsed) } as Record<K, number>)
    : {};
}

function parsePositiveNumber(value: string, fallback: number): number {
  const parsed = parseOptionalNumber(value);
  return parsed && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: string, fallback: number): number {
  const parsed = parseOptionalNumber(value);
  return parsed !== undefined && parsed >= 0 ? Math.round(parsed) : fallback;
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.replace(/,/g, '').trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberToInput(value: number | undefined): string {
  return value === undefined ? '' : value.toString();
}

function requirePositiveNumber(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  message: string,
): void {
  const parsed = parseOptionalNumber(formNumericValue(form, field));

  if (parsed === undefined || parsed <= 0) {
    issues.push({ field, message });
  }
}

function requirePositiveInteger(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  message: string,
): void {
  const parsed = parseOptionalNumber(formNumericValue(form, field));

  if (parsed === undefined || parsed <= 0 || !Number.isInteger(parsed)) {
    issues.push({ field, message });
  }
}

function optionalPositiveNumberField(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  message: string,
): void {
  const value = formNumericValue(form, field).trim();

  if (!value) {
    return;
  }

  const parsed = parseOptionalNumber(value);

  if (parsed === undefined || parsed <= 0) {
    issues.push({ field, message });
  }
}

function optionalNonNegativeNumberField(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  message: string,
): void {
  const value = formNumericValue(form, field).trim();

  if (!value) {
    return;
  }

  const parsed = parseOptionalNumber(value);

  if (parsed === undefined || parsed < 0) {
    issues.push({ field, message });
  }
}

function optionalNonNegativeIntegerField(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  message: string,
): void {
  const value = formNumericValue(form, field).trim();

  if (!value) {
    return;
  }

  const parsed = parseOptionalNumber(value);

  if (parsed === undefined || parsed < 0 || !Number.isInteger(parsed)) {
    issues.push({ field, message });
  }
}

function formNumericValue(form: WorkloadFormState, field: NumericWorkloadFormField): string {
  switch (field) {
    case 'dailyActiveUsers':
      return form.dailyActiveUsers;
    case 'peakConcurrentUsers':
      return form.peakConcurrentUsers;
    case 'vcpu':
      return form.vcpu;
    case 'memoryGb':
      return form.memoryGb;
    case 'instanceCount':
      return form.instanceCount;
    case 'autoscaleMin':
      return form.autoscaleMin;
    case 'autoscaleMax':
      return form.autoscaleMax;
    case 'storageSizeGb':
      return form.storageSizeGb;
    case 'databaseSizeGb':
      return form.databaseSizeGb;
    case 'monthlyEgressGb':
      return form.monthlyEgressGb;
  }
}
