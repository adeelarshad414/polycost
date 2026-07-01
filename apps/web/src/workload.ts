import { NormalizedWorkloadSpec, ServiceRequirement } from './types';
import {
  CLOUD_SERVICE_CATALOG,
  DEFAULT_SELECTED_SERVICE_FAMILY_IDS,
  SERVICE_CATALOG_CATEGORIES,
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
  environment: 'production' | 'staging' | 'development' | 'test';
  commitmentPreferencePercent: string;
  dataResidency: string;
  complianceLocked: boolean;
  complianceFrameworks: string;
  operatingSystem: 'linux' | 'windows' | 'byol';
  supportTier: 'none' | 'developer' | 'business' | 'enterprise';
  usagePattern: 'always_on' | 'scheduled' | 'bursty';
  usageHoursPerDay: string;
  usageDaysPerWeek: string;
  averageUtilizationPercent: string;
  tags: string;
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
  selectedServiceCategory: string;
  selectedServiceFamilyId: string;
  instanceTier: string;
  availabilityZoneCount: string;
  selectedServiceFamilyIds: string[];
  multiAz: boolean;
  multiRegion: boolean;
  slaTarget: string;
  faultTolerance: 'single-zone' | 'multi-az' | 'multi-region' | 'active-active';
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
  | 'monthlyEgressGb'
  | 'commitmentPreferencePercent'
  | 'usageHoursPerDay'
  | 'usageDaysPerWeek'
  | 'averageUtilizationPercent';

const serviceCategoryIds = new Set(SERVICE_CATALOG_CATEGORIES.map((category) => category.id));

export const sampleNaturalLanguageInput =
  'A web app for 5,000 daily users with two web servers, a Postgres database, 250GB of upload storage, CDN, load balancing, and multi-AZ availability.';

export const defaultWorkloadForm: WorkloadFormState = {
  workloadName: 'Customer portal',
  workloadType: 'web_app',
  regionPreference: DEFAULT_COMPARISON_REGION,
  environment: 'production',
  commitmentPreferencePercent: '65',
  dataResidency: 'global',
  complianceLocked: false,
  complianceFrameworks: 'SOC 2',
  operatingSystem: 'linux',
  supportTier: 'business',
  usagePattern: 'always_on',
  usageHoursPerDay: '24',
  usageDaysPerWeek: '7',
  averageUtilizationPercent: '85',
  tags: 'team:platform, project:polycost-demo',
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
  selectedServiceCategory: 'compute',
  selectedServiceFamilyId: 'vm-compute',
  instanceTier: 'balanced',
  availabilityZoneCount: '2',
  selectedServiceFamilyIds: DEFAULT_SELECTED_SERVICE_FAMILY_IDS,
  multiAz: true,
  multiRegion: false,
  slaTarget: '99.9%',
  faultTolerance: 'multi-az',
};

export function validateWorkloadForm(form: WorkloadFormState): WorkloadFormIssue[] {
  const issues: WorkloadFormIssue[] = [];

  requirePositiveNumber(issues, form, 'vcpu', 'vCPU must be greater than 0.');
  requirePositiveNumber(issues, form, 'memoryGb', 'Memory must be greater than 0.');
  requirePositiveInteger(
    issues,
    form,
    'instanceCount',
    'Instances must be a whole number above 0.',
  );
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
    requirePositiveInteger(
      issues,
      form,
      'autoscaleMin',
      'Scale min must be a whole number above 0.',
    );
    requirePositiveInteger(
      issues,
      form,
      'autoscaleMax',
      'Scale max must be a whole number above 0.',
    );

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

  optionalNonNegativeNumberField(issues, form, 'monthlyEgressGb', 'Egress must be 0 GB or higher.');
  requireBoundedNumber(
    issues,
    form,
    'commitmentPreferencePercent',
    0,
    100,
    'Commitment preference must be between 0 and 100.',
  );

  if (form.usagePattern === 'scheduled') {
    requireBoundedNumber(
      issues,
      form,
      'usageHoursPerDay',
      1,
      24,
      'Usage hours/day must be between 1 and 24.',
    );
    requireBoundedInteger(
      issues,
      form,
      'usageDaysPerWeek',
      1,
      7,
      'Usage days/week must be a whole number from 1 to 7.',
    );
  }

  if (form.usagePattern === 'bursty') {
    requireBoundedNumber(
      issues,
      form,
      'averageUtilizationPercent',
      1,
      100,
      'Average utilization must be between 1 and 100.',
    );
  }

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
      faultTolerance: form.faultTolerance,
    },
    workloadProfile: {
      environment: form.environment,
      commitmentPreferencePercent: parseBoundedNumber(form.commitmentPreferencePercent, 0, 100, 0),
      dataResidency: {
        scope: form.dataResidency.trim() || 'global',
        complianceLocked: form.complianceLocked,
        ...optionalStringList('frameworks', form.complianceFrameworks),
      },
      operatingSystem: form.operatingSystem,
      supportTier: form.supportTier,
      usagePattern: {
        type: form.usagePattern,
        ...(form.usagePattern === 'scheduled'
          ? {
              hoursPerDay: parseBoundedNumber(form.usageHoursPerDay, 1, 24, 24),
              daysPerWeek: parseBoundedInteger(form.usageDaysPerWeek, 1, 7, 7),
            }
          : {}),
        ...(form.usagePattern === 'bursty'
          ? {
              averageUtilizationPercent: parseBoundedNumber(
                form.averageUtilizationPercent,
                1,
                100,
                55,
              ),
            }
          : {}),
      },
      ...optionalTagList('tags', form.tags),
    },
    serviceRequirements: serviceRequirementsFromForm(form),
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
    environment: nws.workloadProfile?.environment ?? defaultWorkloadForm.environment,
    commitmentPreferencePercent: numberToInput(
      nws.workloadProfile?.commitmentPreferencePercent ??
        Number(defaultWorkloadForm.commitmentPreferencePercent),
    ),
    dataResidency: nws.workloadProfile?.dataResidency?.scope ?? defaultWorkloadForm.dataResidency,
    complianceLocked:
      nws.workloadProfile?.dataResidency?.complianceLocked ?? defaultWorkloadForm.complianceLocked,
    complianceFrameworks:
      nws.workloadProfile?.dataResidency?.frameworks?.join(', ') ??
      defaultWorkloadForm.complianceFrameworks,
    operatingSystem: nws.workloadProfile?.operatingSystem ?? defaultWorkloadForm.operatingSystem,
    supportTier: nws.workloadProfile?.supportTier ?? defaultWorkloadForm.supportTier,
    usagePattern: nws.workloadProfile?.usagePattern?.type ?? defaultWorkloadForm.usagePattern,
    usageHoursPerDay: numberToInput(
      nws.workloadProfile?.usagePattern?.hoursPerDay ??
        Number(defaultWorkloadForm.usageHoursPerDay),
    ),
    usageDaysPerWeek: numberToInput(
      nws.workloadProfile?.usagePattern?.daysPerWeek ??
        Number(defaultWorkloadForm.usageDaysPerWeek),
    ),
    averageUtilizationPercent: numberToInput(
      nws.workloadProfile?.usagePattern?.averageUtilizationPercent ??
        Number(defaultWorkloadForm.averageUtilizationPercent),
    ),
    tags:
      nws.workloadProfile?.tags?.map((tag) => `${tag.key}:${tag.value}`).join(', ') ??
      defaultWorkloadForm.tags,
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
    selectedServiceCategory: primaryServiceRequirement(nws)?.serviceCategory ?? 'compute',
    selectedServiceFamilyId:
      primaryServiceRequirement(nws)?.serviceType ??
      serviceFamilyIdsFromTraceability(nws.sourceTraceability)[0] ??
      'vm-compute',
    instanceTier: primaryServiceRequirement(nws)?.tier ?? defaultWorkloadForm.instanceTier,
    availabilityZoneCount:
      primaryServiceRequirement(nws)?.az?.match(/\d+/)?.[0] ??
      (nws.availability.multiAz ? '2' : '1'),
    selectedServiceFamilyIds:
      nws.serviceRequirements?.length && nws.serviceRequirements.length > 0
        ? orderedRequirementFamilyIds(nws.serviceRequirements)
        : serviceFamilyIdsFromTraceability(nws.sourceTraceability),
    multiAz: nws.availability.multiAz,
    multiRegion: nws.availability.multiRegion,
    slaTarget: nws.availability.slaTarget ?? '',
    faultTolerance:
      nws.availability.faultTolerance ??
      (nws.availability.multiRegion
        ? 'multi-region'
        : nws.availability.multiAz
          ? 'multi-az'
          : 'single-zone'),
  };
}

export function serviceRequirementsFromForm(form: WorkloadFormState): ServiceRequirement[] {
  const selectedIds = orderedRequirementIds(form);
  const region = normalizedRegionPreference(form.regionPreference).preference;
  const availabilityZones = form.multiAz
    ? `${Math.max(2, parseNonNegativeInteger(form.availabilityZoneCount, 2))} zones`
    : 'single-zone';

  return selectedIds.map((serviceType) => {
    const family = CLOUD_SERVICE_CATALOG.find((candidate) => candidate.id === serviceType);
    const serviceCategory = serviceCategoryForFamily(serviceType);

    return {
      serviceCategory,
      serviceType,
      instanceType: instanceTypeForServiceRequirement(serviceType, form),
      tier: tierForServiceRequirement(serviceType, form),
      ...(region ? { region } : {}),
      az: availabilityZones,
      quantity: quantityForServiceRequirement(serviceType, form),
      scaleParams: {
        categoryLabel:
          SERVICE_CATALOG_CATEGORIES.find((category) => category.id === serviceCategory)?.label ??
          serviceCategory,
        providerServices: family
          ? [
              ...family.providerServices.aws,
              ...family.providerServices.azure,
              ...family.providerServices.gcp,
            ].join(' | ')
          : serviceType,
        supportStatus: family?.supportStatus ?? 'mapped',
        environment: form.environment,
        supportTier: form.supportTier,
        operatingSystem: form.operatingSystem,
        dataResidency: form.dataResidency,
        complianceLocked: form.complianceLocked,
        commitmentPreferencePercent: parseBoundedNumber(
          form.commitmentPreferencePercent,
          0,
          100,
          0,
        ),
        usagePattern: form.usagePattern,
        faultTolerance: form.faultTolerance,
        ...(form.scalingType === 'autoscaling'
          ? {
              scalingType: form.scalingType,
              min: parseNonNegativeInteger(form.autoscaleMin, 1),
              max: parseNonNegativeInteger(form.autoscaleMax, 3),
            }
          : { scalingType: form.scalingType }),
      },
    };
  });
}

function orderedRequirementIds(form: WorkloadFormState): string[] {
  const ids = new Set([
    form.selectedServiceFamilyId,
    ...form.selectedServiceFamilyIds,
    ...(form.storageEnabled ? [storageServiceFamilyId(form)] : []),
    ...(form.databaseEnabled ? [databaseServiceFamilyId(form)] : []),
    ...(form.cdn ? ['cdn-edge'] : []),
    ...(form.loadBalancer ? ['load-balancing'] : []),
  ]);

  return CLOUD_SERVICE_CATALOG.filter((family) => ids.has(family.id)).map((family) => family.id);
}

function orderedRequirementFamilyIds(requirements: ServiceRequirement[]): string[] {
  const ids = new Set(requirements.map((requirement) => requirement.serviceType));

  return CLOUD_SERVICE_CATALOG.filter((family) => ids.has(family.id)).map((family) => family.id);
}

function primaryServiceRequirement(nws: NormalizedWorkloadSpec): ServiceRequirement | undefined {
  return nws.serviceRequirements?.find((requirement) =>
    CLOUD_SERVICE_CATALOG.some((family) => family.id === requirement.serviceType),
  );
}

function serviceCategoryForFamily(serviceType: string): ServiceRequirement['serviceCategory'] {
  const family = CLOUD_SERVICE_CATALOG.find((candidate) => candidate.id === serviceType);
  const categoryId = family?.categoryId ?? 'compute';

  return serviceCategoryIds.has(categoryId)
    ? (categoryId as ServiceRequirement['serviceCategory'])
    : 'compute';
}

function quantityForServiceRequirement(serviceType: string, form: WorkloadFormState): number {
  if (serviceType === 'vm-compute' || serviceType === 'autoscaling-compute') {
    return form.scalingType === 'autoscaling'
      ? Math.max(1, parseNonNegativeInteger(form.autoscaleMin, 1))
      : Math.max(1, parseNonNegativeInteger(form.instanceCount, 1));
  }

  return 1;
}

function instanceTypeForServiceRequirement(
  serviceType: string,
  form: WorkloadFormState,
): string | undefined {
  if (serviceType === 'vm-compute' || serviceType === 'autoscaling-compute') {
    return `${form.instanceTier} tier - ${form.vcpu || '?'} vCPU - ${form.memoryGb || '?'}GB`;
  }

  if (serviceType.includes('storage')) {
    return `${form.storageType} - ${form.storageSizeGb || '0'}GB`;
  }

  if (serviceType.includes('database') || serviceType === 'cache') {
    return `${form.databaseEngine} - ${form.databaseSizeGb || 'provider default'}GB`;
  }

  return undefined;
}

function tierForServiceRequirement(
  serviceType: string,
  form: WorkloadFormState,
): string | undefined {
  if (serviceType === 'vm-compute' || serviceType === 'autoscaling-compute') {
    return form.instanceTier;
  }

  if (serviceType.includes('storage')) {
    return form.storageAccessPattern;
  }

  if (serviceType.includes('database') || serviceType === 'cache') {
    return form.databaseHighAvailability ? 'high-availability' : 'standard';
  }

  return undefined;
}

function storageServiceFamilyId(form: WorkloadFormState): string {
  if (form.storageType === 'block') {
    return 'block-storage';
  }

  if (form.storageType === 'file') {
    return 'file-storage';
  }

  return form.storageAccessPattern === 'archive' ? 'archive-storage' : 'object-storage';
}

function databaseServiceFamilyId(form: WorkloadFormState): string {
  return form.databaseEngine === 'redis' ? 'cache' : 'relational-database';
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

function parseBoundedNumber(value: string, min: number, max: number, fallback: number): number {
  const parsed = parseOptionalNumber(value);

  if (parsed === undefined || parsed < min || parsed > max) {
    return fallback;
  }

  return parsed;
}

function parseBoundedInteger(value: string, min: number, max: number, fallback: number): number {
  return Math.round(parseBoundedNumber(value, min, max, fallback));
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

function optionalStringList<K extends string>(key: K, value: string): Partial<Record<K, string[]>> {
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed.length > 0 ? ({ [key]: parsed } as Record<K, string[]>) : {};
}

function optionalTagList<K extends string>(
  key: K,
  value: string,
): Partial<Record<K, Array<{ key: string; value: string }>>> {
  const tags = value
    .split(',')
    .map((item) => item.trim())
    .map((item) => {
      const [tagKey, ...tagValueParts] = item.split(':');
      const tagValue = tagValueParts.join(':').trim();

      return {
        key: tagKey?.trim() ?? '',
        value: tagValue || 'true',
      };
    })
    .filter((tag) => tag.key && tag.value);

  return tags.length > 0
    ? ({ [key]: tags } as Record<K, Array<{ key: string; value: string }>>)
    : {};
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

function requireBoundedNumber(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  min: number,
  max: number,
  message: string,
): void {
  const parsed = parseOptionalNumber(formNumericValue(form, field));

  if (parsed === undefined || parsed < min || parsed > max) {
    issues.push({ field, message });
  }
}

function requireBoundedInteger(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  min: number,
  max: number,
  message: string,
): void {
  const parsed = parseOptionalNumber(formNumericValue(form, field));

  if (parsed === undefined || parsed < min || parsed > max || !Number.isInteger(parsed)) {
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
    case 'commitmentPreferencePercent':
      return form.commitmentPreferencePercent;
    case 'usageHoursPerDay':
      return form.usageHoursPerDay;
    case 'usageDaysPerWeek':
      return form.usageDaysPerWeek;
    case 'averageUtilizationPercent':
      return form.averageUtilizationPercent;
  }
}
