import {
  ApiErrorDetail,
  BackendHealthResponse,
  ComparisonResult,
  NormalizedWorkloadSpec,
  ParsedNwsDraft,
  PricingStatusResponse,
  RegionCatalogResponse,
  ReportFormat,
} from './types';

const DEFAULT_API_BASE_URL = 'http://localhost:3001/api/v1';

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
  getRegionCatalog(): Promise<RegionCatalogResponse>;
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
    getRegionCatalog() {
      return requestJson<RegionCatalogResponse>(baseUrl, '/regions');
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
