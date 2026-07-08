import {
  ApiErrorDetail,
  AccountSessionRecord,
  AccountProfileResponse,
  AlertRecord,
  AuthMeResponse,
  AuthSessionResponse,
  BackendHealthResponse,
  BudgetInput,
  BudgetRecord,
  BillingImportInput,
  BillingImportResponse,
  BillingProviderExportInput,
  ComparisonAnalyticsResponse,
  ComparisonPricingEvidenceResponse,
  ComparisonResult,
  DataHealthResponse,
  DiagramParseRequest,
  DiagramParseResult,
  ExchangeRatesResponse,
  IntervalKey,
  InvoiceReconciliationRecord,
  NormalizedWorkloadSpec,
  ParsedNwsDraft,
  PricingModelCatalogResponse,
  PricingModelsForServiceResponse,
  PricingModelKey,
  PricingStatusResponse,
  RegionCatalogResponse,
  ReportExportJobResponse,
  ReportFormat,
  SharedReportResponse,
  ShareLinkAnalyticsResponse,
  ShareLinkResponse,
  SsoCallbackResponse,
  SsoConfigurationStatus,
  SsoConnectionTestResult,
  SsoStartResponse,
  TeamAuditEventRecord,
  TeamSwitchResponse,
  TeamSettingsRecord,
  TeamInvitationRecord,
  TeamInvitationPreview,
  TeamMemberRecord,
  TeamRole,
  TerraformGenerateOptions,
  TerraformGenerationResult,
  TerraformTargetCloud,
  WorkloadInput,
  WorkloadRecord,
} from './types';

const DEFAULT_API_BASE_URL = '/api/v1';
const EXPORT_JOB_POLL_INTERVAL_MS = 500;
const EXPORT_JOB_MAX_ATTEMPTS = 120;
const GENERIC_BROWSER_ERROR_MESSAGE =
  'PolyCost hit an unexpected browser-side issue while preparing the request. Refresh the page and try again.';

interface ExportComparisonOptions {
  interval?: IntervalKey;
  pricingModel?: PricingModelKey;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: ApiErrorDetail[];
  };
}

export class PolyCostApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'PolyCostApiError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PolyCostClient {
  getHealth(): Promise<BackendHealthResponse>;
  getDataHealth(): Promise<DataHealthResponse>;
  register(input: {
    email: string;
    password: string;
    displayName?: string;
    teamName?: string;
  }): Promise<AuthSessionResponse>;
  login(input: { email: string; password: string }): Promise<AuthSessionResponse>;
  getCurrentSession(token: string): Promise<AuthMeResponse>;
  logout(token: string): Promise<{ revoked: true }>;
  updateAccountProfile(
    input: { email: string; displayName?: string; currentPassword?: string },
    token: string,
  ): Promise<AccountProfileResponse>;
  changePassword(
    input: { currentPassword: string; newPassword: string },
    token: string,
  ): Promise<{ changed: true }>;
  deleteAccount(
    input: { currentPassword: string; confirmation: 'DELETE' },
    token: string,
  ): Promise<{ deleted: true }>;
  listAccountSessions(token: string): Promise<AccountSessionRecord[]>;
  revokeOtherSessions(token: string): Promise<{ revoked: number }>;
  switchActiveTeam(teamId: string, token: string): Promise<TeamSwitchResponse>;
  createTeam(input: { teamName: string }, token: string): Promise<TeamSettingsRecord>;
  updateTeamSettings(
    teamId: string,
    input: { teamName: string },
    token: string,
  ): Promise<TeamSettingsRecord>;
  listTeamMembers(teamId: string, token: string): Promise<TeamMemberRecord[]>;
  inviteTeamMember(
    teamId: string,
    input: { email: string; role: Exclude<TeamRole, 'owner'> },
    token: string,
  ): Promise<TeamInvitationRecord>;
  listTeamInvitations(teamId: string, token: string): Promise<TeamInvitationRecord[]>;
  revokeTeamInvitation(
    teamId: string,
    invitationId: string,
    token: string,
  ): Promise<TeamInvitationRecord>;
  resendTeamInvitation(
    teamId: string,
    invitationId: string,
    token: string,
  ): Promise<TeamInvitationRecord>;
  listTeamAuditEvents(teamId: string, token: string): Promise<TeamAuditEventRecord[]>;
  previewTeamInvitation(tokenValue: string): Promise<TeamInvitationPreview>;
  acceptTeamInvitation(tokenValue: string, token: string): Promise<TeamInvitationRecord>;
  updateTeamMemberRole(
    teamId: string,
    accountId: string,
    role: TeamRole,
    token: string,
  ): Promise<TeamMemberRecord>;
  removeTeamMember(teamId: string, accountId: string, token: string): Promise<{ removed: true }>;
  getSsoStatus(token: string): Promise<SsoConfigurationStatus>;
  startMockOidcLogin(input: { teamId: string; email?: string }): Promise<SsoStartResponse>;
  completeMockOidcCallback(input: {
    state: string;
    email?: string;
    displayName?: string;
  }): Promise<SsoCallbackResponse>;
  configureSsoProvider(
    teamId: string,
    input: {
      providerType: 'oidc' | 'saml';
      displayName: string;
      issuerUrl: string;
      clientId?: string;
      clientSecret?: string;
    },
    token: string,
  ): Promise<SsoConfigurationStatus['configuredProviders'][number]>;
  testSsoConnection(
    teamId: string,
    input: {
      providerType: 'oidc' | 'saml';
      displayName: string;
      issuerUrl: string;
      clientId?: string;
      clientSecret?: string;
    },
    token: string,
  ): Promise<SsoConnectionTestResult>;
  parseWorkload(input: string): Promise<ParsedNwsDraft>;
  parseDiagram(input: DiagramParseRequest): Promise<DiagramParseResult>;
  validateWorkload(nws: NormalizedWorkloadSpec): Promise<{ valid: true }>;
  createComparison(nws: NormalizedWorkloadSpec): Promise<ComparisonResult>;
  generateTerraform(input: {
    targetCloud: TerraformTargetCloud;
    nws: NormalizedWorkloadSpec;
    workspaceName?: string;
    region?: string;
    options?: TerraformGenerateOptions;
  }): Promise<TerraformGenerationResult>;
  getComparisonAnalytics(comparisonId: string): Promise<ComparisonAnalyticsResponse>;
  getComparisonPricingEvidence(comparisonId: string): Promise<ComparisonPricingEvidenceResponse>;
  refreshLiveComparison(comparisonId: string): Promise<ComparisonResult>;
  createExportJob(
    comparisonId: string,
    format: ReportFormat,
    options?: ExportComparisonOptions,
  ): Promise<ReportExportJobResponse>;
  getExportJob(comparisonId: string, jobId: string): Promise<ReportExportJobResponse>;
  downloadExportJob(comparisonId: string, jobId: string): Promise<Blob>;
  exportComparison(
    comparisonId: string,
    format: ReportFormat,
    options?: ExportComparisonOptions,
  ): Promise<Blob>;
  getPricingStatus(): Promise<PricingStatusResponse>;
  getPricingModels(): Promise<PricingModelCatalogResponse>;
  getPricingModelsForService(
    provider: string,
    service: string,
    region: string,
  ): Promise<PricingModelsForServiceResponse>;
  getRegionCatalog(): Promise<RegionCatalogResponse>;
  createWorkload(input: WorkloadInput): Promise<WorkloadRecord>;
  createShareLink(input: {
    workloadId: string;
    watermark: boolean;
    expiresInDays: number;
    pricingModel: string;
    granularity: string;
    password?: string;
  }): Promise<ShareLinkResponse>;
  revokeShareLink(token: string): Promise<ShareLinkResponse>;
  getShareLinkAnalytics(token: string): Promise<ShareLinkAnalyticsResponse>;
  getSharedReport(token: string, password?: string): Promise<SharedReportResponse>;
  createBudget(input: BudgetInput): Promise<BudgetRecord>;
  listAlerts(workloadId?: string): Promise<AlertRecord[]>;
  updateAlertDismissed(alertId: string, dismissed: boolean): Promise<AlertRecord>;
  getExchangeRates(base?: string): Promise<ExchangeRatesResponse>;
  importBillingActuals(input: BillingImportInput, token: string): Promise<BillingImportResponse>;
  importProviderBillingExport(
    input: BillingProviderExportInput,
    token: string,
  ): Promise<BillingImportResponse>;
  reconcileBillingImport(
    importRunId: string,
    comparisonId: string,
    token: string,
  ): Promise<InvoiceReconciliationRecord>;
  listBillingReconciliations(
    importRunId: string,
    token: string,
  ): Promise<InvoiceReconciliationRecord[]>;
}

export function configuredApiBaseUrl(documentRef: Document = document): string {
  const configured = documentRef
    .querySelector<HTMLMetaElement>('meta[name="polycost-api-base-url"]')
    ?.content.trim();

  if (!configured || configured.startsWith('%')) {
    return DEFAULT_API_BASE_URL;
  }

  return configured.replace(/\/$/, '');
}

export function createPolyCostClient(baseUrl = configuredApiBaseUrl()): PolyCostClient {
  return {
    getHealth() {
      return requestJson<BackendHealthResponse>(apiRootHealthUrl(baseUrl));
    },
    getDataHealth() {
      return requestJson<DataHealthResponse>(baseUrl, '/data-health');
    },
    register(input) {
      return requestJson<AuthSessionResponse>(baseUrl, '/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    login(input) {
      return requestJson<AuthSessionResponse>(baseUrl, '/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    getCurrentSession(token) {
      return requestJson<AuthMeResponse>(baseUrl, '/auth/me', {
        headers: authorizationHeaders(token),
      });
    },
    logout(token) {
      return requestJson<{ revoked: true }>(baseUrl, '/auth/logout', {
        method: 'POST',
        headers: authorizationHeaders(token),
      });
    },
    updateAccountProfile(input, token) {
      return requestJson<AccountProfileResponse>(baseUrl, '/auth/profile', {
        method: 'PATCH',
        headers: authorizationHeaders(token),
        body: JSON.stringify(input),
      });
    },
    changePassword(input, token) {
      return requestJson<{ changed: true }>(baseUrl, '/auth/password', {
        method: 'POST',
        headers: authorizationHeaders(token),
        body: JSON.stringify(input),
      });
    },
    deleteAccount(input, token) {
      return requestJson<{ deleted: true }>(baseUrl, '/auth/account', {
        method: 'DELETE',
        headers: authorizationHeaders(token),
        body: JSON.stringify(input),
      });
    },
    listAccountSessions(token) {
      return requestJson<AccountSessionRecord[]>(baseUrl, '/auth/sessions', {
        headers: authorizationHeaders(token),
      });
    },
    revokeOtherSessions(token) {
      return requestJson<{ revoked: number }>(baseUrl, '/auth/sessions/revoke-other', {
        method: 'POST',
        headers: authorizationHeaders(token),
      });
    },
    switchActiveTeam(teamId, token) {
      return requestJson<TeamSwitchResponse>(baseUrl, '/auth/sessions/team', {
        method: 'POST',
        headers: authorizationHeaders(token),
        body: JSON.stringify({ teamId }),
      });
    },
    createTeam(input, token) {
      return requestJson<TeamSettingsRecord>(baseUrl, '/auth/teams', {
        method: 'POST',
        headers: authorizationHeaders(token),
        body: JSON.stringify(input),
      });
    },
    updateTeamSettings(teamId, input, token) {
      return requestJson<TeamSettingsRecord>(baseUrl, `/auth/teams/${encodeURIComponent(teamId)}`, {
        method: 'PATCH',
        headers: authorizationHeaders(token),
        body: JSON.stringify(input),
      });
    },
    listTeamMembers(teamId, token) {
      return requestJson<TeamMemberRecord[]>(
        baseUrl,
        `/auth/teams/${encodeURIComponent(teamId)}/members`,
        {
          headers: authorizationHeaders(token),
        },
      );
    },
    inviteTeamMember(teamId, input, token) {
      return requestJson<TeamInvitationRecord>(
        baseUrl,
        `/auth/teams/${encodeURIComponent(teamId)}/invitations`,
        {
          method: 'POST',
          headers: authorizationHeaders(token),
          body: JSON.stringify(input),
        },
      );
    },
    listTeamInvitations(teamId, token) {
      return requestJson<TeamInvitationRecord[]>(
        baseUrl,
        `/auth/teams/${encodeURIComponent(teamId)}/invitations`,
        {
          headers: authorizationHeaders(token),
        },
      );
    },
    revokeTeamInvitation(teamId, invitationId, token) {
      return requestJson<TeamInvitationRecord>(
        baseUrl,
        `/auth/teams/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(
          invitationId,
        )}/revoke`,
        {
          method: 'POST',
          headers: authorizationHeaders(token),
        },
      );
    },
    resendTeamInvitation(teamId, invitationId, token) {
      return requestJson<TeamInvitationRecord>(
        baseUrl,
        `/auth/teams/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(
          invitationId,
        )}/resend`,
        {
          method: 'POST',
          headers: authorizationHeaders(token),
        },
      );
    },
    listTeamAuditEvents(teamId, token) {
      return requestJson<TeamAuditEventRecord[]>(
        baseUrl,
        `/auth/teams/${encodeURIComponent(teamId)}/audit-events?limit=25`,
        {
          headers: authorizationHeaders(token),
        },
      );
    },
    acceptTeamInvitation(tokenValue, token) {
      return requestJson<TeamInvitationRecord>(baseUrl, '/auth/invitations/accept', {
        method: 'POST',
        headers: authorizationHeaders(token),
        body: JSON.stringify({ token: tokenValue }),
      });
    },
    previewTeamInvitation(tokenValue) {
      return requestJson<TeamInvitationPreview>(
        baseUrl,
        `/auth/invitations/preview/${encodeURIComponent(tokenValue)}`,
      );
    },
    updateTeamMemberRole(teamId, accountId, role, token) {
      return requestJson<TeamMemberRecord>(
        baseUrl,
        `/auth/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(accountId)}`,
        {
          method: 'PATCH',
          headers: authorizationHeaders(token),
          body: JSON.stringify({ role }),
        },
      );
    },
    removeTeamMember(teamId, accountId, token) {
      return requestJson<{ removed: true }>(
        baseUrl,
        `/auth/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(accountId)}`,
        {
          method: 'DELETE',
          headers: authorizationHeaders(token),
        },
      );
    },
    getSsoStatus(token) {
      return requestJson<SsoConfigurationStatus>(baseUrl, '/auth/sso/status', {
        headers: authorizationHeaders(token),
      });
    },
    startMockOidcLogin(input) {
      return requestJson<SsoStartResponse>(baseUrl, '/auth/sso/oidc/start', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    completeMockOidcCallback(input) {
      const params = new URLSearchParams({
        state: input.state,
      });

      if (input.email) {
        params.set('email', input.email);
      }
      if (input.displayName) {
        params.set('displayName', input.displayName);
      }

      return requestJson<SsoCallbackResponse>(
        baseUrl,
        `/auth/sso/oidc/callback?${params.toString()}`,
      );
    },
    configureSsoProvider(teamId, input, token) {
      return requestJson<SsoConfigurationStatus['configuredProviders'][number]>(
        baseUrl,
        `/auth/teams/${encodeURIComponent(teamId)}/sso/providers`,
        {
          method: 'POST',
          headers: authorizationHeaders(token),
          body: JSON.stringify(input),
        },
      );
    },
    testSsoConnection(teamId, input, token) {
      return requestJson<SsoConnectionTestResult>(
        baseUrl,
        `/auth/teams/${encodeURIComponent(teamId)}/sso/test-connection`,
        {
          method: 'POST',
          headers: authorizationHeaders(token),
          body: JSON.stringify(input),
        },
      );
    },
    parseWorkload(input) {
      return requestJson<ParsedNwsDraft>(baseUrl, '/workload/parse', {
        method: 'POST',
        body: JSON.stringify({ naturalLanguageInput: input }),
      });
    },
    parseDiagram(input) {
      return requestJson<DiagramParseResult>(baseUrl, '/parse/diagram', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    validateWorkload(nws) {
      return requestJson<{ valid: true }>(baseUrl, '/workload/validate', {
        method: 'POST',
        body: JSON.stringify(nws),
      });
    },
    createComparison(nws) {
      return requestJson<ComparisonResult>(baseUrl, '/comparisons', {
        method: 'POST',
        body: JSON.stringify({
          nws,
          options: {
            useLivePricing: false,
          },
        }),
      });
    },
    generateTerraform(input) {
      return requestJson<TerraformGenerationResult>(baseUrl, '/terraform/generate', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    getComparisonAnalytics(comparisonId) {
      return requestJson<ComparisonAnalyticsResponse>(
        baseUrl,
        `/comparisons/${encodeURIComponent(comparisonId)}/analytics`,
      );
    },
    getComparisonPricingEvidence(comparisonId) {
      return requestJson<ComparisonPricingEvidenceResponse>(
        baseUrl,
        `/comparisons/${encodeURIComponent(comparisonId)}/evidence`,
      );
    },
    refreshLiveComparison(comparisonId) {
      return requestJson<ComparisonResult>(baseUrl, `/comparisons/${comparisonId}/refresh-live`, {
        method: 'POST',
      });
    },
    createExportJob(comparisonId, format, options = {}) {
      return createExportJobRequest(baseUrl, comparisonId, format, options);
    },
    getExportJob(comparisonId, jobId) {
      return getExportJobRequest(baseUrl, comparisonId, jobId);
    },
    downloadExportJob(comparisonId, jobId) {
      return downloadExportJobRequest(baseUrl, comparisonId, jobId);
    },
    async exportComparison(comparisonId, format, options = {}) {
      const job = await createExportJobRequest(baseUrl, comparisonId, format, options);
      const completedJob = await pollExportJob(baseUrl, comparisonId, job);

      return downloadExportJobRequest(baseUrl, comparisonId, completedJob.jobId);
    },
    getPricingStatus() {
      return requestJson<PricingStatusResponse>(baseUrl, '/pricing/status');
    },
    getPricingModels() {
      return requestJson<PricingModelCatalogResponse>(baseUrl, '/pricing/models');
    },
    getPricingModelsForService(provider, service, region) {
      return requestJson<PricingModelsForServiceResponse>(
        baseUrl,
        `/pricing/${encodeURIComponent(provider)}/${encodeURIComponent(
          service,
        )}/models?region=${encodeURIComponent(region)}`,
      );
    },
    getRegionCatalog() {
      return requestJson<RegionCatalogResponse>(baseUrl, '/regions');
    },
    createWorkload(input) {
      return requestJson<WorkloadRecord>(baseUrl, '/workloads', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    createShareLink(input) {
      return requestJson<ShareLinkResponse>(baseUrl, '/share-links', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    revokeShareLink(token) {
      return requestJson<ShareLinkResponse>(
        baseUrl,
        `/share-links/${encodeURIComponent(token)}/revoke`,
        {
          method: 'POST',
        },
      );
    },
    getShareLinkAnalytics(token) {
      return requestJson<ShareLinkAnalyticsResponse>(
        baseUrl,
        `/share-links/${encodeURIComponent(token)}/analytics`,
      );
    },
    getSharedReport(token, password) {
      const query = password ? `?password=${encodeURIComponent(password)}` : '';
      return requestJson<SharedReportResponse>(
        baseUrl,
        `/share/${encodeURIComponent(token)}${query}`,
      );
    },
    createBudget(input) {
      return requestJson<BudgetRecord>(baseUrl, '/budgets', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    listAlerts(workloadId) {
      const query = workloadId ? `?workloadId=${encodeURIComponent(workloadId)}` : '';
      return requestJson<AlertRecord[]>(baseUrl, `/alerts${query}`);
    },
    updateAlertDismissed(alertId, dismissed) {
      return requestJson<AlertRecord>(baseUrl, `/alerts/${encodeURIComponent(alertId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ dismissed }),
      });
    },
    getExchangeRates(base = 'USD') {
      return requestJson<ExchangeRatesResponse>(
        baseUrl,
        `/exchange-rates?base=${encodeURIComponent(base)}`,
      );
    },
    importBillingActuals(input, token) {
      return requestJson<BillingImportResponse>(baseUrl, '/billing/imports', {
        method: 'POST',
        headers: authorizationHeaders(token),
        body: JSON.stringify(input),
      });
    },
    importProviderBillingExport(input, token) {
      return requestJson<BillingImportResponse>(baseUrl, '/billing/imports/provider-export', {
        method: 'POST',
        headers: authorizationHeaders(token),
        body: JSON.stringify(input),
      });
    },
    reconcileBillingImport(importRunId, comparisonId, token) {
      return requestJson<InvoiceReconciliationRecord>(
        baseUrl,
        `/billing/imports/${encodeURIComponent(importRunId)}/reconcile`,
        {
          method: 'POST',
          headers: authorizationHeaders(token),
          body: JSON.stringify({ comparisonId }),
        },
      );
    },
    listBillingReconciliations(importRunId, token) {
      return requestJson<InvoiceReconciliationRecord[]>(
        baseUrl,
        `/billing/imports/${encodeURIComponent(importRunId)}/reconciliation`,
        {
          headers: authorizationHeaders(token),
        },
      );
    },
  };
}

function authorizationHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function createExportJobRequest(
  baseUrl: string,
  comparisonId: string,
  format: ReportFormat,
  options: ExportComparisonOptions,
): Promise<ReportExportJobResponse> {
  return requestJson<ReportExportJobResponse>(
    baseUrl,
    `/comparisons/${encodeURIComponent(comparisonId)}/export-jobs`,
    {
      method: 'POST',
      body: JSON.stringify({
        format,
        interval: options.interval,
        pricingModel: options.pricingModel,
      }),
    },
  );
}

function getExportJobRequest(
  baseUrl: string,
  comparisonId: string,
  jobId: string,
): Promise<ReportExportJobResponse> {
  return requestJson<ReportExportJobResponse>(
    baseUrl,
    `/comparisons/${encodeURIComponent(comparisonId)}/export-jobs/${encodeURIComponent(jobId)}`,
  );
}

async function downloadExportJobRequest(
  baseUrl: string,
  comparisonId: string,
  jobId: string,
): Promise<Blob> {
  const response = await fetch(
    `${baseUrl}/comparisons/${encodeURIComponent(comparisonId)}/export-jobs/${encodeURIComponent(
      jobId,
    )}/download`,
  );

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.blob();
}

async function pollExportJob(
  baseUrl: string,
  comparisonId: string,
  initialJob: ReportExportJobResponse,
): Promise<ReportExportJobResponse> {
  let job = initialJob;

  for (let attempt = 0; attempt < EXPORT_JOB_MAX_ATTEMPTS; attempt += 1) {
    if (job.status === 'completed') {
      return job;
    }

    if (job.status === 'failed') {
      throw new PolyCostApiError(
        422,
        'EXPORT_JOB_FAILED',
        job.errorMessage ?? 'Report generation failed. Try again after refreshing the comparison.',
      );
    }

    await delay(EXPORT_JOB_POLL_INTERVAL_MS);
    job = await getExportJobRequest(baseUrl, comparisonId, job.jobId);
  }

  throw new PolyCostApiError(
    408,
    'EXPORT_JOB_TIMEOUT',
    'Report generation is still running. Try the download again in a moment.',
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function apiRootHealthUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    url.pathname = url.pathname.replace(/\/api\/v1\/?$/, '/health');
    url.search = '';
    url.hash = '';

    return url.toString();
  } catch {
    return `${baseUrl.replace(/\/api\/v1\/?$/, '')}/health`;
  }
}

async function requestJson<T>(
  baseUrlOrAbsoluteUrl: string,
  path = '',
  init: RequestInit = {},
): Promise<T> {
  const headers = normalizeHeaders(init.headers);
  const method = init.method?.toUpperCase() ?? 'GET';

  if (
    (init.body !== undefined || method === 'GET' || method === 'HEAD') &&
    !hasHeader(headers, 'Content-Type')
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrlOrAbsoluteUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as T;
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}

function hasHeader(headers: Record<string, string>, headerName: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === headerName.toLowerCase());
}

async function toApiError(response: Response): Promise<PolyCostApiError> {
  let body: ApiErrorEnvelope = {};

  try {
    body = (await response.json()) as ApiErrorEnvelope;
  } catch {
    body = {};
  }

  return new PolyCostApiError(
    response.status,
    body.error?.code ?? 'HTTP_ERROR',
    body.error?.message ?? fallbackHttpErrorMessage(response.status),
    body.error?.details ?? [],
  );
}

export function formatApiError(error: unknown): string {
  if (error instanceof PolyCostApiError) {
    const message = safeUserFacingErrorMessage(
      error.message,
      fallbackHttpErrorMessage(error.status),
    );
    const details = error.details
      .map((detail) => safeUserFacingErrorMessage(detail.issue, ''))
      .filter(Boolean)
      .join(' ');

    return details ? `${message} ${details}` : message;
  }

  if (error instanceof Error) {
    if (isNetworkFetchError(error)) {
      return 'PolyCost could not reach the API service. Start the backend or check the API base URL, then try again.';
    }

    return safeUserFacingErrorMessage(error.message, GENERIC_BROWSER_ERROR_MESSAGE);
  }

  return GENERIC_BROWSER_ERROR_MESSAGE;
}

function safeUserFacingErrorMessage(message: string, fallback: string): string {
  const trimmed = message.trim();

  if (!trimmed || looksLikeRawTechnicalError(trimmed)) {
    return fallback;
  }

  const firstLine = trimmed.split(/\r?\n/)[0]?.trim() ?? '';

  if (!firstLine || looksLikeRawTechnicalError(firstLine)) {
    return fallback;
  }

  return firstLine.replace(/^(Error|TypeError|SyntaxError|ReferenceError):\s+/u, '').slice(0, 280);
}

function looksLikeRawTechnicalError(message: string): boolean {
  const compact = message.trim();

  return (
    compact.includes('[object Object]') ||
    /\bat\s+\S+\s+\([^)]*:\d+:\d+\)/u.test(message) ||
    /\bat\s+[^(\n]+:\d+:\d+/u.test(message) ||
    (compact.startsWith('{') && compact.endsWith('}'))
  );
}

function fallbackHttpErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'PolyCost could not use that request. Review the workload inputs and try again.';
    case 401:
      return 'PolyCost needs a signed-in session for this request. Sign in again, then retry.';
    case 403:
      return 'PolyCost reached the API, but this account does not have access to that action.';
    case 404:
      return 'PolyCost could not find the requested API resource. Refresh the page and try again.';
    case 405:
      return 'PolyCost reached a server that does not accept this API action. Check that the web app is pointed at the PolyCost API service, then try again.';
    case 408:
      return 'The PolyCost API took too long to respond. Retry once the pricing service catches up.';
    case 409:
      return 'PolyCost could not complete the request because the saved comparison changed. Refresh the comparison and try again.';
    case 422:
      return 'PolyCost could not validate that workload. Review the highlighted fields and try again.';
    case 429:
      return 'The PolyCost API is receiving too many requests right now. Wait a moment, then retry.';
    case 500:
      return 'The PolyCost API hit a server-side problem while processing this request. Try again after refreshing pricing data.';
    case 502:
    case 503:
    case 504:
      return 'The PolyCost API is temporarily unavailable. Confirm the backend service is running, then try again.';
    default:
      return `PolyCost could not complete the API request (HTTP ${status}). Refresh the page and try again.`;
  }
}

function isNetworkFetchError(error: Error): boolean {
  return (
    error instanceof TypeError &&
    /failed to fetch|networkerror|load failed|fetch failed/i.test(error.message)
  );
}

export const polyCostClient = createPolyCostClient();
