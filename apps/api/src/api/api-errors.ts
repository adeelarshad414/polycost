import { ProviderId } from '../adapters/common/cloud-provider-adapter';

export interface ApiErrorDetail {
  field?: string;
  issue: string;
}

export class ApiValidationError extends Error {
  constructor(
    message: string,
    readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ApiNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ApiUnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'ApiUnauthorizedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RateLimitExceededError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = 'RateLimitExceededError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class LiveRefreshUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveRefreshUnavailableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PricingStatusResponse {
  providers: Array<{
    providerId: ProviderId;
    lastSuccessfulRun?: string;
    status: 'success' | 'partial' | 'failed';
    recordsUpdated: number;
    recordsRejected: number;
    recordsSkipped: number;
  }>;
}

export interface DataHealthResponse {
  generatedAt: string;
  freshnessPolicyHours: number;
  overallStatus: 'fresh' | 'stale' | 'degraded';
  alertCount: number;
  alerts: Array<{
    providerId?: ProviderId;
    severity: 'warning' | 'critical';
    message: string;
  }>;
  providers: Array<{
    providerId: ProviderId;
    status: 'success' | 'partial' | 'failed';
    freshness: 'fresh' | 'stale' | 'missing' | 'failed';
    lastSuccessfulRun?: string;
    ageHours?: number;
    recordsUpdated: number;
    recordsRejected: number;
    recordsSkipped: number;
    cache: {
      catalogRows: number;
      currentRateRows: number;
      latestCatalogSyncAt?: string;
      latestRateSyncAt?: string;
      ageHours?: number;
      freshness: 'fresh' | 'stale' | 'missing';
      syncStatusCounts: {
        success: number;
        partial: number;
        failed: number;
      };
    };
    message: string;
  }>;
}
