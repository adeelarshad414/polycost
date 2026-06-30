import {
  ApiErrorDetail,
  AlertRecord,
  BackendHealthResponse,
  BudgetInput,
  BudgetRecord,
  ComparisonResult,
  ExchangeRatesResponse,
  NormalizedWorkloadSpec,
  ParsedNwsDraft,
  PricingModelCatalogResponse,
  PricingStatusResponse,
  RegionCatalogResponse,
  ReportFormat,
  SharedReportResponse,
  ShareLinkResponse,
  WorkloadInput,
  WorkloadRecord,
} from './types';

const DEFAULT_API_BASE_URL = '/api/v1';

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
  parseWorkload(input: string): Promise<ParsedNwsDraft>;
  validateWorkload(nws: NormalizedWorkloadSpec): Promise<{ valid: true }>;
  createComparison(nws: NormalizedWorkloadSpec): Promise<ComparisonResult>;
  refreshLiveComparison(comparisonId: string): Promise<ComparisonResult>;
  exportComparison(comparisonId: string, format: ReportFormat): Promise<Blob>;
  getPricingStatus(): Promise<PricingStatusResponse>;
  getPricingModels(): Promise<PricingModelCatalogResponse>;
  getRegionCatalog(): Promise<RegionCatalogResponse>;
  createWorkload(input: WorkloadInput): Promise<WorkloadRecord>;
  createShareLink(input: {
    workloadId: string;
    watermark: boolean;
    expiresInDays: number;
  }): Promise<ShareLinkResponse>;
  getSharedReport(token: string): Promise<SharedReportResponse>;
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
    refreshLiveComparison(comparisonId) {
      return requestJson<ComparisonResult>(baseUrl, `/comparisons/${comparisonId}/refresh-live`, {
        method: 'POST',
      });
    },
    async exportComparison(comparisonId, format) {
      const response = await fetch(
        `${baseUrl}/comparisons/${comparisonId}/export?format=${format}`,
      );

      if (!response.ok) {
        throw await toApiError(response);
      }

      return response.blob();
    },
    getPricingStatus() {
      return requestJson<PricingStatusResponse>(baseUrl, '/pricing/status');
    },
    getPricingModels() {
      return requestJson<PricingModelCatalogResponse>(baseUrl, '/pricing/models');
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
    getSharedReport(token) {
      return requestJson<SharedReportResponse>(baseUrl, `/share/${encodeURIComponent(token)}`);
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
  const response = await fetch(`${baseUrlOrAbsoluteUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as T;
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
