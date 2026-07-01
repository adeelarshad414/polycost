import {
  ApiErrorDetail,
  AlertRecord,
  BackendHealthResponse,
  BudgetInput,
  BudgetRecord,
  ComparisonAnalyticsResponse,
  ComparisonResult,
  DataHealthResponse,
  ExchangeRatesResponse,
  IntervalKey,
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
  WorkloadInput,
  WorkloadRecord,
} from './types';

const DEFAULT_API_BASE_URL = '/api/v1';
const EXPORT_JOB_POLL_INTERVAL_MS = 500;
const EXPORT_JOB_MAX_ATTEMPTS = 120;

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
  parseWorkload(input: string): Promise<ParsedNwsDraft>;
  validateWorkload(nws: NormalizedWorkloadSpec): Promise<{ valid: true }>;
  createComparison(nws: NormalizedWorkloadSpec): Promise<ComparisonResult>;
  getComparisonAnalytics(comparisonId: string): Promise<ComparisonAnalyticsResponse>;
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
    parseWorkload(input) {
      return requestJson<ParsedNwsDraft>(baseUrl, '/workload/parse', {
        method: 'POST',
        body: JSON.stringify({ naturalLanguageInput: input }),
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
    getComparisonAnalytics(comparisonId) {
      return requestJson<ComparisonAnalyticsResponse>(
        baseUrl,
        `/comparisons/${encodeURIComponent(comparisonId)}/analytics`,
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
    body.error?.message ?? `Request failed with status ${response.status}`,
    body.error?.details ?? [],
  );
}

export function formatApiError(error: unknown): string {
  if (error instanceof PolyCostApiError) {
    const details = error.details.map((detail) => detail.issue).join(' ');
    return details ? `${error.message} ${details}` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected application error';
}

export const polyCostClient = createPolyCostClient();
