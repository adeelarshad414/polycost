// Pure workload/comparison analysis helpers extracted from App.tsx (H-F1).
//
// Every function here is a pure data transform: no JSX, no hooks, and no
// reference to any symbol defined in App.tsx. That makes them safe to lift out
// of the monolith and independently testable without rendering the app.

/* eslint-disable security/detect-object-injection -- Reviewed: typed
   provider/form/report lookup maps carried over verbatim from App.tsx. */

import { PolyCostApiError } from '../api-client';
import { hourlyFromMonthly, intervalMultiplierFromMonthly } from '../cost-time';
import { formatCurrency } from '../lib/format';
import { DEFAULT_CALCULATOR_URLS, DEFAULT_REGION_REFERENCE_URLS, FALLBACK_REGION_CATALOG } from '../region-catalog';
import { comparisonRegionLabel, regionPreferenceForResidencyLock } from '../region-normalization';
import { CLOUD_SERVICE_CATALOG, CloudServiceFamily, SERVICE_CATALOG_CATEGORIES, orderedServiceFamilyIds } from '../service-catalog';
import { ResolvedTheme } from '../theme';
import { AuthMeResponse, BillingSourceType, ComparisonAnalyticsResponse, ComparisonPricingEvidenceResponse, ComparisonProviderResult, ComparisonResult, DiagramInputFormat, IntervalKey, InvoiceArtifactPolicyExceptionStatus, InvoiceArtifactReviewStatus, InvoiceControlValidationStatus, PROVIDER_ORDER, PricingModelKey, ProviderId, RegionCatalogResponse, ReportFormat, ServiceRequirement, TeamAuditEventRecord, TeamInvitationRecord, TeamMemberRecord, TeamRole, TeamSwitchResponse, TerraformAvailabilityMode, TerraformGenerationResult, TerraformNetworkTopology, TerraformRuntimeTarget } from '../types';
import { BulkServiceRow, WorkloadFormIssue, WorkloadFormState } from '../workload';

export function activeTeamToMembership(
  activeTeam: TeamSwitchResponse['activeTeam'],
): AuthMeResponse['teams'][number] {
  return {
    teamId: activeTeam.id,
    teamName: activeTeam.name,
    role: activeTeam.role,
  };
}

export function mergeTeamMemberships(
  current: AuthMeResponse['teams'],
  nextMemberships: Array<AuthMeResponse['teams'][number]>,
): AuthMeResponse['teams'] {
  const merged = new Map<string, AuthMeResponse['teams'][number]>();

  for (const team of current) {
    merged.set(team.teamId, team);
  }

  for (const team of nextMemberships) {
    merged.set(team.teamId, team);
  }

  return Array.from(merged.values());
}

export function teamAuditActionLabel(action: TeamAuditEventRecord['action']): string {
  switch (action) {
    case 'team.created':
      return 'Team created';
    case 'team.settings.updated':
      return 'Team settings updated';
    case 'team.invitation.created':
      return 'Invitation created';
    case 'team.invitation.resent':
      return 'Invitation resent';
    case 'team.invitation.revoked':
      return 'Invitation revoked';
    case 'team.invitation.accepted':
      return 'Invitation accepted';
    case 'team.member.role_updated':
      return 'Member role updated';
    case 'team.member.removed':
      return 'Member removed';
    case 'team.sso.configured':
      return 'SSO configured';
    case 'team.scim_token.created':
      return 'SCIM token created';
    case 'team.scim_token.revoked':
      return 'SCIM token revoked';
    case 'team.scim.user_upserted':
      return 'SCIM user provisioned';
    case 'team.scim.user_deactivated':
      return 'SCIM user deactivated';
    case 'billing.import.created':
      return 'Billing import created';
    case 'billing.reconciliation.created':
      return 'Billing reconciliation created';
    case 'billing.reconciliation.artifact_registered':
      return 'Billing artifact registered';
    case 'billing.reconciliation.artifact_verified':
      return 'Billing artifact verified';
    case 'billing.reconciliation.artifact_blob_uploaded':
      return 'Billing artifact file stored';
    case 'billing.reconciliation.artifact_blob_downloaded':
      return 'Billing artifact file downloaded';
    case 'billing.reconciliation.artifact_legal_hold_updated':
      return 'Billing artifact legal hold updated';
    case 'billing.reconciliation.artifact_review_updated':
      return 'Billing artifact review updated';
    case 'billing.reconciliation.artifact_exception_updated':
      return 'Billing artifact policy exception updated';
    case 'billing.reconciliation.evidence_packet_exported':
      return 'Billing evidence packet exported';
    case 'billing.reconciliation.invoice_control_validated':
      return 'Billing invoice control validated';
  }
}

export function teamAuditEventDetail(event: TeamAuditEventRecord): string {
  const actor = event.actorEmail ?? event.actorAccountId ?? 'system';
  const target = event.targetId
    ? `${event.targetType} ${event.targetId.slice(0, 8)}`
    : event.targetType;
  const metadataLabel =
    typeof event.metadata?.displayName === 'string'
      ? event.metadata.displayName
      : typeof event.metadata?.userName === 'string'
        ? event.metadata.userName
        : undefined;

  return metadataLabel ? `${actor} · ${target} · ${metadataLabel}` : `${actor} · ${target}`;
}

export function memberRoleControlState({
  actorRole,
  currentAccountId,
  member,
  ownerCount,
  busyKey,
}: {
  actorRole: TeamRole;
  currentAccountId: string;
  member: TeamMemberRecord;
  ownerCount: number;
  busyKey: string | null;
}): { disabled: boolean; reason: string } {
  if (busyKey === `role-${member.accountId}`) {
    return {
      disabled: true,
      reason: 'Role update is in progress.',
    };
  }

  if (actorRole !== 'owner') {
    return {
      disabled: true,
      reason: 'Only team owners can change roles.',
    };
  }

  if (member.accountId === currentAccountId && member.role === 'owner' && ownerCount <= 1) {
    return {
      disabled: true,
      reason: 'Promote another owner before changing the final owner role.',
    };
  }

  return {
    disabled: false,
    reason: 'Owners can change team roles.',
  };
}

export function memberRemoveControlState({
  actorRole,
  currentAccountId,
  member,
  ownerCount,
  busyKey,
}: {
  actorRole: TeamRole;
  currentAccountId: string;
  member: TeamMemberRecord;
  ownerCount: number;
  busyKey: string | null;
}): { disabled: boolean; reason: string } {
  if (busyKey === `remove-${member.accountId}`) {
    return {
      disabled: true,
      reason: 'Member removal is in progress.',
    };
  }

  if (member.accountId === currentAccountId) {
    return {
      disabled: true,
      reason: 'Use account settings to disable your own account.',
    };
  }

  if (actorRole === 'member') {
    return {
      disabled: true,
      reason: 'Team admin access is required to remove members.',
    };
  }

  if (member.role === 'owner' && actorRole !== 'owner') {
    return {
      disabled: true,
      reason: 'Only team owners can remove owners.',
    };
  }

  if (member.role === 'owner' && ownerCount <= 1) {
    return {
      disabled: true,
      reason: 'At least one team owner must remain.',
    };
  }

  return {
    disabled: false,
    reason: 'Remove this member from the team.',
  };
}

export function teamRoleLabel(role: TeamRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'member':
      return 'Member';
  }
}

export function inviteDeliveryNotice(
  invitation: TeamInvitationRecord,
  action: 'created' | 'refreshed',
): string {
  if (invitation.delivery?.status === 'accepted') {
    return `Invitation ${action}; delivery provider accepted the invite.`;
  }

  if (invitation.delivery?.status === 'failed') {
    return `Invitation ${action}, but delivery failed. Fix delivery settings and resend the invite.`;
  }

  if (invitation.inviteToken) {
    return `Invitation ${action}. The one-time token is shown in the workspace panel for this demo.`;
  }

  return `Invitation ${action}.`;
}

export function editStatusNotice(notice: string | null): string | null {
  const meaningfulNotice = notice?.replace(/ ?Comparison ready\.$/, '').trim();

  return meaningfulNotice ? meaningfulNotice : null;
}

export function initialStatusNotice(notice: string | null): string | null {
  return notice === 'Comparison ready.' ? null : notice;
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function safePreviewColor(value: string | undefined): string | undefined {
  return value && /^#[0-9A-F]{6}$/i.test(value) ? value : undefined;
}

export function validationIssueMap(
  issues: WorkloadFormIssue[],
): Partial<Record<keyof WorkloadFormState, string>> {
  return issues.reduce<Partial<Record<keyof WorkloadFormState, string>>>((map, issue) => {
    map[issue.field] = issue.message;
    return map;
  }, {});
}

export function applyResidencyRegionLock(form: WorkloadFormState): WorkloadFormState {
  if (!form.complianceLocked) {
    return form;
  }

  const lockedRegionPreference = regionPreferenceForResidencyLock(
    form.regionPreference,
    form.dataResidency,
  );

  if (!lockedRegionPreference || lockedRegionPreference === form.regionPreference) {
    return form;
  }

  return {
    ...form,
    regionPreference: lockedRegionPreference,
  };
}

export function providerServicesForFamily(family: CloudServiceFamily, providerId: ProviderId): string[] {
  switch (providerId) {
    case 'aws':
      return family.providerServices.aws;
    case 'azure':
      return family.providerServices.azure;
    case 'gcp':
      return family.providerServices.gcp;
  }
}

export function formWithBulkServiceRows(
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

export function sizingTokenKind(
  char: string,
  currentKind: 'number' | 'word' | null,
): 'number' | 'word' | null {
  const code = char.charCodeAt(0);

  if ((code >= 48 && code <= 57) || (char === '.' && currentKind === 'number')) {
    return 'number';
  }

  if (code >= 97 && code <= 122) {
    return 'word';
  }

  return null;
}

export function sizingTokenAt(tokens: string[], index: number): string {
  if (index < 0) {
    return '';
  }

  return tokens.slice(index, index + 1).join('');
}

export function positiveFormNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function tierFromSizingQuery(lower: string): WorkloadFormState['instanceTier'] | undefined {
  if (/\b(gpu|cuda|ml|machine learning|accelerat)/.test(lower)) {
    return 'accelerated';
  }

  if (/\b(memory|ram|cache|database|db)\b/.test(lower)) {
    return 'memory';
  }

  if (/\b(storage|io|iops|throughput|nvme)\b/.test(lower)) {
    return 'storage';
  }

  if (/\b(compute|cpu|batch)\b/.test(lower)) {
    return 'compute';
  }

  if (/\b(burst|small|dev|test)\b/.test(lower)) {
    return 'small';
  }

  if (/\b(balanced|general|web|api)\b/.test(lower)) {
    return 'balanced';
  }

  return undefined;
}

export function isBulkServiceHeader(line: string, index: number): boolean {
  return index === 0 && /\bservice\b/i.test(line) && /\b(qty|quantity|tier)\b/i.test(line);
}

export function splitBulkServiceLine(line: string): string[] {
  if (line.includes('\t')) {
    return line.split('\t');
  }

  if (line.includes('|')) {
    return line.split('|');
  }

  return line.split(',');
}

export function normalizeServiceSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function orderBulkServiceRows(rows: BulkServiceRow[]): BulkServiceRow[] {
  const rowsByFamily = new Map(rows.map((row) => [row.serviceFamilyId, row]));

  return orderedServiceFamilyIds([...rowsByFamily.keys()])
    .map((id) => rowsByFamily.get(id))
    .filter((row): row is BulkServiceRow => Boolean(row));
}

export function positiveIntegerInput(value: string): string {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : '1';
}

export function bulkServiceRowId(): string {
  return `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function serviceCategoryOptions(): Array<[string, string]> {
  return SERVICE_CATALOG_CATEGORIES.map((category) => [category.id, category.label]);
}

export function firstServiceFamilyIdForCategory(categoryId: string): string | undefined {
  return CLOUD_SERVICE_CATALOG.find((family) => family.categoryId === categoryId)?.id;
}

export function serviceFamilyShortLabel(serviceFamilyId: string): string {
  return (
    CLOUD_SERVICE_CATALOG.find((family) => family.id === serviceFamilyId)?.label ??
    'Selected service'
  );
}

export function workloadTypeLabel(type: WorkloadFormState['workloadType']): string {
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

export function supportTierLabel(supportTier: WorkloadFormState['supportTier']): string {
  switch (supportTier) {
    case 'none':
      return 'No support';
    case 'developer':
      return 'Developer support';
    case 'business':
      return 'Business support';
    case 'enterprise_onramp':
      return 'Enterprise on-ramp support';
    case 'enterprise':
      return 'Enterprise support';
  }
}

export function regionLabelForSummary(value: string, regionCatalog: RegionCatalogResponse | null): string {
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

export function parseFormNumber(value: string): number | undefined {
  const parsed = Number(value.replace(/,/g, '').trim());

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

export function formatDecimal(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value);
}

export function executiveForecastForCheapest(
  analytics: ComparisonAnalyticsResponse | null | undefined,
  comparison: ComparisonResult | null,
): ComparisonAnalyticsResponse['executiveForecast']['providerForecasts'][number] | undefined {
  if (!analytics?.executiveForecast.providerForecasts.length) {
    return undefined;
  }

  const preferredProviderId = comparison?.cheapestProviderId;
  const preferredForecast = analytics.executiveForecast.providerForecasts.find(
    (forecast) => forecast.providerId === preferredProviderId,
  );

  if (preferredForecast) {
    return preferredForecast;
  }

  return [...analytics.executiveForecast.providerForecasts].sort(
    (left, right) => left.ninetyDayRunRateUsd - right.ninetyDayRunRateUsd,
  )[0];
}

export function executiveModelMonthlyCost(
  provider: ComparisonProviderResult,
  pricingModel: PricingModelKey,
): number | undefined {
  if (pricingModel === 'on-demand') {
    return provider.totals.monthly;
  }

  const model = provider.pricingModels?.find((candidate) => candidate.model === pricingModel);

  return model?.available ? model.monthlyCostUsd : undefined;
}

export function breakEvenMonthsForHorizon(horizonMonths: number): number[] {
  return Array.from(
    new Set([0, Math.round(horizonMonths / 3), Math.round((horizonMonths * 2) / 3), horizonMonths]),
  );
}

export function roundChartCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

export function commitmentTermMonths(pricingModel: PricingModelKey): number {
  if (pricingModel === 'reserved-3yr') {
    return 36;
  }

  return 12;
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDER_ORDER.some((providerId) => providerId === value);
}

export function costMatrixPricingModelLabel(pricingModel: PricingModelKey): string {
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

export function evidenceSkuLabel(row: ComparisonPricingEvidenceResponse['evidence'][number]): string {
  return (
    row.sku.resolvedSkuId ??
    row.sku.sourceSkuId ??
    row.sku.rateSourceSkuId ??
    row.sku.providerServiceName ??
    'Modeled service'
  );
}

export function evidenceSourceLabel(row: ComparisonPricingEvidenceResponse['evidence'][number]): string {
  const endpoint = row.rate.sourceEndpoint ?? row.rate.source;
  const sourceId = row.rate.sourceRecordId ?? row.rate.sourceRecordKey;
  const hashSuffix = row.rate.sourcePayloadHash
    ? ` · hash ${row.rate.sourcePayloadHash.slice(0, 10)}`
    : '';

  return sourceId ? `${endpoint} · ${sourceId}${hashSuffix}` : `${endpoint}${hashSuffix}`;
}

export function evidenceRateLabel(row: ComparisonPricingEvidenceResponse['evidence'][number]): string {
  if (row.rate.unitPriceUsd === undefined) {
    return row.rate.source;
  }

  return `${formatCurrency(row.rate.unitPriceUsd)} / ${row.rate.unit ?? 'unit'}`;
}

export function selectedComputeArchitecture(
  form: WorkloadFormState,
): WorkloadFormState['processorArchitecture'] {
  return form.instanceTier === 'accelerated' ? 'gpu' : form.processorArchitecture;
}

export function storageDimensionSummary(
  totals: Record<
    'base' | 'operations' | 'retrieval' | 'replication' | 'lifecycle' | 'snapshot' | 'performance',
    number
  >,
): string {
  const active = Object.entries(totals)
    .filter(([, value]) => value > 0.005)
    .map(([key]) => key);

  return active.length > 0 ? active.join(', ') : 'no priced dimensions above threshold';
}

export function storageAnatomyRecommendation(
  totals: Record<
    'base' | 'operations' | 'retrieval' | 'replication' | 'lifecycle' | 'snapshot' | 'performance',
    number
  >,
  signals: {
    databaseGrowthGb: number;
    lifecycleTransitions: number;
    provisionedIops: number;
    requestThousands: number;
    retrievalGb: number;
    snapshotSizeGb: number;
    storageReplication: WorkloadFormState['storageReplication'];
  },
): string {
  const dominant = Object.entries(totals).sort((left, right) => right[1] - left[1])[0]?.[0];

  if (dominant === 'snapshot' || signals.snapshotSizeGb > 0) {
    return 'Review snapshot retention and older-copy tiering before finalizing storage run-rate.';
  }

  if (dominant === 'retrieval' || signals.retrievalGb > 0) {
    return 'Validate archive retrieval frequency, rehydration time, and warm/cold split.';
  }

  if (dominant === 'replication' || signals.storageReplication !== 'none') {
    return 'Confirm same-region versus cross-region replication matches the DR requirement.';
  }

  if (dominant === 'performance' || signals.provisionedIops > 0) {
    return 'Compare provisioned IOPS and throughput against measured latency requirements.';
  }

  if (dominant === 'operations' || signals.requestThousands > 0) {
    return 'Batch request-heavy workflows and reduce LIST-heavy access paths.';
  }

  if (dominant === 'lifecycle' || signals.lifecycleTransitions > 0) {
    return 'Validate lifecycle transition frequency and minimum-duration break-even.';
  }

  if (signals.databaseGrowthGb > 0) {
    return 'Model database storage autoscaling and backup growth before year-one commitment.';
  }

  return 'Validate storage class, minimum-duration rules, and data-access pattern.';
}

export function databaseAnatomyProfile(form: WorkloadFormState): string {
  const engine = form.databaseEngine.replace(/_/g, ' ');
  const availability = form.databaseHighAvailability ? 'HA / multi-zone' : 'single-zone';

  return `${engine} · ${availability}`;
}

export function networkingValidationAction(component: string): string {
  switch (component) {
    case 'Load balancer capacity':
      return 'Validate LCU/capacity-unit drivers: rules, connections, bandwidth, and hours.';
    case 'NAT gateway processing':
      return 'Confirm private endpoints or route changes can remove NAT hairpin traffic.';
    case 'CDN viewer transfer':
      return 'Validate viewer geography, compression, cache-control, and direct-egress alternative.';
    case 'CDN origin transfer':
      return 'Raise cache hit and keep origins regional to reduce miss traffic.';
    case 'CDN edge requests':
      return 'Validate request volume, HTTP method mix, and cache-key policy.';
    case 'CDN delivery':
      return 'Tune cache hit, origin path, edge requests, and direct-egress alternative.';
    case 'DNS zones and queries':
      return 'Check hosted-zone count, query volume, and resolver forwarding assumptions.';
    case 'VPN connectivity':
      return 'Validate tunnel count, redundancy, transfer volume, and private-circuit break-even.';
    case 'Private connectivity':
      return 'Validate port speed, redundancy, metered transfer, and commitment terms.';
    case 'Cross-AZ transfer':
    case 'Inter-region transfer':
      return 'Confirm placement, replication, and service-to-service traffic paths.';
    default:
      return 'Review provider-specific rate tiers and traffic source before sign-off.';
  }
}

export function spotBlendPercent(form: WorkloadFormState): number {
  if (form.environment === 'production' && form.usagePattern === 'always_on') {
    return 20;
  }

  if (form.environment === 'production') {
    return form.usagePattern === 'bursty' ? 40 : 30;
  }

  if (form.environment === 'development' || form.environment === 'test') {
    return form.usagePattern === 'bursty' ? 60 : 50;
  }

  if (form.environment === 'staging') {
    return form.usagePattern === 'bursty' ? 50 : 40;
  }

  return form.usagePattern === 'bursty' ? 40 : 30;
}

export function spotBlendRisk(
  form: WorkloadFormState,
  spotPercent: number,
  volatility?: NonNullable<ComparisonProviderResult['pricingModels']>[number]['volatility'],
): 'Low' | 'Medium' | 'High' {
  if (form.environment === 'production' && spotPercent >= 40) {
    return 'High';
  }

  if (volatility === 'volatile' || spotPercent >= 50) {
    return 'High';
  }

  if (spotPercent >= 30 || form.environment === 'production') {
    return 'Medium';
  }

  return 'Low';
}

export function networkDescriptionMatches(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'egress',
    'load balancer',
    'nat',
    'cdn',
    'vpn',
    'private circuit',
    'direct connect',
    'expressroute',
    'interconnect',
    'dns',
    'cross-az',
    'inter-region',
  ].some((needle) => normalized.includes(needle));
}

export function storageDescriptionMatches(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'storage',
    'snapshot',
    'archive',
    'retrieval',
    'replication',
    'lifecycle',
    'minimum-duration',
    'monitoring',
    'multi-attach',
    'iops',
    'throughput',
    'object request',
    'put request',
    'get request',
    'list request',
    'delete request',
  ].some((needle) => normalized.includes(needle));
}

export function storageAdvancedDescriptionMatches(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'snapshot',
    'archive',
    'retrieval',
    'replication',
    'lifecycle',
    'minimum-duration',
    'monitoring',
    'multi-attach',
    'iops',
    'throughput',
    'object request',
    'put request',
    'get request',
    'list request',
    'delete request',
  ].some((needle) => normalized.includes(needle));
}

export function databaseDescriptionMatches(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'database',
    'db ',
    'nosql',
    'dynamodb',
    'cosmos',
    'firestore',
    'bigtable',
    'ru/s',
    'read unit',
    'write unit',
    'query processing',
    'warehouse',
    'bigquery',
    'redshift',
    'synapse',
    'replica',
    'standby',
    'backup',
    'iops',
    'cache',
    'redis',
    'growth',
    'search',
    'opensearch',
    'cognitive search',
    'azure ai search',
    'cloud search',
    'vertex ai search',
  ].some((needle) => normalized.includes(needle));
}

export function databaseAdvancedDescriptionMatches(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'nosql',
    'dynamodb',
    'cosmos',
    'firestore',
    'bigtable',
    'ru/s',
    'read unit',
    'write unit',
    'query processing',
    'warehouse',
    'bigquery',
    'redshift',
    'synapse',
    'replica',
    'standby',
    'multi-az',
    'backup',
    'iops',
    'cache',
    'redis',
    'growth',
    'search',
    'opensearch',
    'cognitive search',
    'azure ai search',
    'cloud search',
    'vertex ai search',
  ].some((needle) => normalized.includes(needle));
}

export function runtimeDescriptionMatches(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'serverless function',
    'function request',
    'function duration',
    'gb-second',
    'lambda',
    'cloud functions',
    'azure functions',
    'app platform',
    'app runner',
    'app service',
    'cloud run',
    'kubernetes',
    'container registry',
    'registry storage',
    'registry egress',
    'control plane',
    'node overhead',
  ].some((needle) => normalized.includes(needle));
}

export function runtimeAdvancedDescriptionMatches(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'gb-second',
    'duration',
    'function request',
    'app platform',
    'app runner',
    'app service',
    'cloud run',
    'control plane',
    'node overhead',
    'registry storage',
    'registry egress',
  ].some((needle) => normalized.includes(needle));
}

export function operationsDescriptionMatches(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'monitoring',
    'metric',
    'log ingestion',
    'log retention',
    'alarm',
    'dashboard',
    'trace',
    'secret',
    'security posture',
    'security finding',
    'waf',
    'ddos',
  ].some((needle) => normalized.includes(needle));
}

export function operationsAdvancedDescriptionMatches(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'log ingestion',
    'log retention',
    'metric',
    'trace',
    'secret',
    'waf',
    'ddos',
    'security posture',
    'security finding',
  ].some((needle) => normalized.includes(needle));
}

export function rightSizingSavingsRate(averageUtilizationPercent?: number): number {
  if (averageUtilizationPercent === undefined) {
    return 0;
  }

  if (averageUtilizationPercent <= 25) {
    return 0.35;
  }

  if (averageUtilizationPercent <= 40) {
    return 0.25;
  }

  if (averageUtilizationPercent <= 55) {
    return 0.15;
  }

  return 0;
}

export function bestCommitmentModel(provider: ComparisonProviderResult): {
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

export function shareTokenFromLocation(): string | undefined {
  const match = window.location.pathname.match(/^\/share\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function defaultCalculatorUrl(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return DEFAULT_CALCULATOR_URLS.aws;
    case 'azure':
      return DEFAULT_CALCULATOR_URLS.azure;
    case 'gcp':
      return DEFAULT_CALCULATOR_URLS.gcp;
  }
}

export function regionReferenceUrl(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return DEFAULT_REGION_REFERENCE_URLS.aws;
    case 'azure':
      return DEFAULT_REGION_REFERENCE_URLS.azure;
    case 'gcp':
      return DEFAULT_REGION_REFERENCE_URLS.gcp;
  }
}

export function regionReferenceLabel(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'AWS Regions & AZs';
    case 'azure':
      return 'Azure Regions & AZs';
    case 'gcp':
      return 'GCP Regions & Zones';
  }
}

export function logoSrcForTheme(resolvedTheme: ResolvedTheme): string {
  return resolvedTheme === 'dark'
    ? '/brand/polycost-lockup-dark.svg'
    : '/brand/polycost-lockup.svg';
}

export function providerLabel(provider: ProviderId): string {
  switch (provider) {
    case 'aws':
      return 'AWS';
    case 'azure':
      return 'Azure';
    case 'gcp':
      return 'GCP';
  }
}

export function providerSubtitle(provider: ProviderId): string {
  switch (provider) {
    case 'aws':
      return 'Amazon Web Services';
    case 'azure':
      return 'Microsoft Azure';
    case 'gcp':
      return 'Google Cloud Platform';
  }
}

export function providerTerraformResourceLabel(provider: ProviderId): string {
  switch (provider) {
    case 'aws':
      return 'EC2 · S3 · RDS · ALB';
    case 'azure':
      return 'VM · Storage · PostgreSQL · LB';
    case 'gcp':
      return 'Compute · Storage · Cloud SQL';
  }
}

export function runtimeProfileLabel(runtimeTarget: TerraformRuntimeTarget): string {
  switch (runtimeTarget) {
    case 'vm':
      return 'VM baseline';
    case 'containers':
      return 'Container boundary';
    case 'serverless':
      return 'Serverless boundary';
    case 'kubernetes':
      return 'Kubernetes boundary';
  }
}

export function topologyProfileLabel(networkTopology: TerraformNetworkTopology): string {
  switch (networkTopology) {
    case 'public':
      return 'Public topology';
    case 'private':
      return 'Private topology';
    case 'landing-zone':
      return 'Landing-zone topology';
  }
}

export function availabilityProfileLabel(availabilityMode: TerraformAvailabilityMode): string {
  switch (availabilityMode) {
    case 'single-region':
      return 'Single region';
    case 'multi-az':
      return 'Multi-AZ';
    case 'multi-region-dr':
      return 'Multi-region DR';
    case 'active-active':
      return 'Active-active';
  }
}

export function terraformAvailabilityModeFromForm(form: WorkloadFormState): TerraformAvailabilityMode {
  if (form.faultTolerance === 'active-active') {
    return 'active-active';
  }

  if (form.multiRegion || form.faultTolerance === 'multi-region') {
    return 'multi-region-dr';
  }

  if (form.multiAz || form.faultTolerance === 'multi-az') {
    return 'multi-az';
  }

  return 'single-region';
}

export function previewTerraformContent(content: string): string {
  const lines = content.trimEnd().split('\n');
  const preview = lines.slice(0, 42).join('\n');

  return lines.length > 42 ? `${preview}\n# ... ${lines.length - 42} more lines` : preview;
}

export function mappingLabel(mapping: TerraformGenerationResult['serviceMappings'][number]): string {
  return `${mapping.requirement}: ${mapping.terraformResource} (${mapping.confidence})`;
}

export function costForInterval(provider: ComparisonProviderResult, interval: IntervalKey): number {
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

export function providerChartColor(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'var(--pc-provider-aws)';
    case 'azure':
      return 'var(--pc-provider-azure)';
    case 'gcp':
      return 'var(--pc-provider-gcp)';
  }
}

export function intervalCostMultiplier(interval: IntervalKey): number {
  return intervalMultiplierFromMonthly(interval);
}

export function readInviteTokenFromUrl(): string {
  return new URLSearchParams(window.location.search).get('invite_token')?.trim() ?? '';
}

export function isPastIsoTimestamp(value: string): boolean {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

export function isSessionExpiredError(error: unknown): boolean {
  return (
    error instanceof PolyCostApiError &&
    error.status === 401 &&
    /expired|invalid|unauthorized/i.test(error.message)
  );
}

export function sourceTypeForProvider(provider: ProviderId): BillingSourceType {
  switch (provider) {
    case 'aws':
      return 'aws-cur';
    case 'azure':
      return 'azure-cost-management';
    case 'gcp':
      return 'gcp-billing-export';
  }
}

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function invoiceArtifactReviewStatus(value: unknown): InvoiceArtifactReviewStatus {
  if (
    value === 'pending' ||
    value === 'approved' ||
    value === 'rejected' ||
    value === 'not-requested'
  ) {
    return value;
  }

  return 'not-requested';
}

export function invoiceArtifactPolicyExceptionStatus(
  value: unknown,
  expiresAt: string | undefined,
): InvoiceArtifactPolicyExceptionStatus {
  if (value === 'approved' && expiresAt && Date.parse(expiresAt) <= Date.now()) {
    return 'expired';
  }

  if (
    value === 'requested' ||
    value === 'approved' ||
    value === 'rejected' ||
    value === 'expired' ||
    value === 'not-requested'
  ) {
    return value;
  }

  return 'not-requested';
}

export function invoiceControlValidationStatus(value: unknown): InvoiceControlValidationStatus {
  if (
    value === 'matched' ||
    value === 'variance-warning' ||
    value === 'mismatch' ||
    value === 'not-run'
  ) {
    return value;
  }

  return 'not-run';
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function booleanValue(value: unknown): boolean {
  return value === true;
}

export function providerExportSample(provider: ProviderId): string {
  switch (provider) {
    case 'aws':
      return [
        'lineItem/ProductCode,product/sku,lineItem/UsageStartDate,lineItem/UsageEndDate,lineItem/UsageAmount,pricing/unit,lineItem/NetUnblendedCost,lineItem/CurrencyCode,product/region,lineItem/ResourceId,resourceTags/user:cost_center',
        'AmazonEC2,sku-compute,2026-06-01T00:00:00Z,2026-06-30T23:59:59Z,730,Hrs,107.00,USD,us-east-1,i-1234567890abcdef0,engineering',
      ].join('\n');
    case 'azure':
      return [
        'ServiceName,MeterId,UsageDateTime,Quantity,UnitOfMeasure,CostInUSD,BillingCurrencyCode,ResourceLocation,ResourceId,Tags',
        'Virtual Machines,meter-compute,2026-06-15T00:00:00Z,730,Hours,118.50,USD,eastus,/subscriptions/demo/resourceGroups/app/providers/Microsoft.Compute/virtualMachines/web,"{""cost_center"":""engineering""}"',
      ].join('\n');
    case 'gcp':
      return [
        'service.description,sku.id,usage_start_time,usage_end_time,usage.amount,usage.unit,cost,currency,location.region,resource.name,labels',
        'Compute Engine,sku-compute,2026-06-01T00:00:00Z,2026-06-30T23:59:59Z,730,h,99.90,USD,us-central1,projects/demo/zones/us-central1-a/instances/web,"{""cost_center"":""engineering""}"',
      ].join('\n');
  }
}

export function comparisonHistoryId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `history-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function diagramNodeIdForRequirement(requirement: ServiceRequirement): string | undefined {
  const value = requirement.scaleParams?.diagramNodeId;

  return typeof value === 'string' ? value : undefined;
}

export function diagramFormatFromFile(file: File): DiagramInputFormat | 'auto' {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.vsdx')) {
    return 'vsdx';
  }

  if (lowerName.endsWith('.drawio') || lowerName.endsWith('.xml')) {
    return 'drawio';
  }

  if (lowerName.endsWith('.csv')) {
    return 'lucid_csv';
  }

  if (lowerName.endsWith('.mmd') || lowerName.endsWith('.mermaid')) {
    return 'mermaid';
  }

  return 'auto';
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      resolve(value.replace(/^data:[^,]*,/, ''));
    };
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

export function formatLabel(format: DiagramInputFormat): string {
  switch (format) {
    case 'drawio':
      return 'draw.io';
    case 'lucid_csv':
      return 'Lucid CSV';
    case 'mermaid':
      return 'Mermaid';
    case 'vsdx':
      return 'VSDX';
  }
}

export function reportFormatLabel(format: ReportFormat): string {
  return format === 'xlsx' ? 'Excel' : format.toUpperCase();
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseInputNumber(value: string): number | undefined {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function reviewMessage(confidence: string, fields: string[]): string {
  return fields.length > 0
    ? `Parsed with ${confidence} confidence. Review ${fields.length} field${fields.length === 1 ? '' : 's'}.`
    : `Parsed with ${confidence} confidence.`;
}

export function formValidationSummaryMessage(issues: WorkloadFormIssue[]): string {
  return `Fix ${issues.length} requirement field${issues.length === 1 ? '' : 's'} before comparing. ${issues
    .map((issue) => issue.message)
    .join(' ')}`;
}

export function formatDateTime(value: string | undefined): string {
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

export function futureIsoTimestamp(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

export function formatHistoryTimestamp(value: string): string {
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

export function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function toId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function downloadBlob(blob: Blob, fileName: string): void {
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

export function base64ToBlob(contentBase64: string, mimeType: string): Blob {
  const binary = window.atob(contentBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes}B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)}KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
}
