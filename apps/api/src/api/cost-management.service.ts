import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiNotFoundError, ApiUnauthorizedError } from './api-errors.js';
import { ApiDatabaseRepository } from './api-database.repository.js';
import { hashPassword, verifyPassword } from './password-hash.js';
import {
  AlertRecord,
  BudgetInput,
  BudgetRecord,
  CachedPricingCompareQuery,
  CachedPricingCompareRow,
  CachedPricingTerm,
  ExchangeRatesResponse,
  ShareLinkAnalyticsResponse,
  ShareLinkEventInput,
  ShareLinkInput,
  ShareLinkResponse,
  SharedReportResponse,
  WorkloadCostBreakdown,
  WorkloadInput,
  WorkloadRecord,
} from './cost-management.types.js';

export interface ShareLinkViewContext {
  countryCode?: string;
  section?: string;
  userAgent?: string;
}

@Injectable()
export class CostManagementService {
  constructor(
    private readonly repository: ApiDatabaseRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly tokenFactory: () => string = () => randomBytes(32).toString('base64url'),
  ) {}

  createWorkload(input: WorkloadInput, ownerTeamId: string | null = null): Promise<WorkloadRecord> {
    return this.repository.createWorkload(input, ownerTeamId);
  }

  compareCachedPricing(query: CachedPricingCompareQuery): Promise<CachedPricingCompareRow[]> {
    return this.repository.compareCachedPricing(query);
  }

  async getWorkloadCostBreakdown(
    workloadId: string,
    term: CachedPricingTerm,
  ): Promise<WorkloadCostBreakdown> {
    const breakdown = await this.repository.getWorkloadCostBreakdown(workloadId, term);

    if (!breakdown) {
      throw new ApiNotFoundError(`Workload ${workloadId} was not found`);
    }

    return breakdown;
  }

  async createBudget(input: BudgetInput): Promise<BudgetRecord> {
    await this.ensureWorkload(input.workloadId);

    return this.repository.createBudget(input);
  }

  listAlerts(workloadId: string): Promise<AlertRecord[]> {
    return this.repository.listAlerts(workloadId);
  }

  async updateAlertDismissed(alertId: string, dismissed: boolean): Promise<AlertRecord> {
    const alert = await this.repository.updateAlertDismissed(alertId, dismissed);

    if (!alert) {
      throw new ApiNotFoundError(`Alert ${alertId} was not found`);
    }

    return alert;
  }

  async createShareLink(input: ShareLinkInput): Promise<ShareLinkResponse> {
    await this.ensureWorkload(input.workloadId);

    // Audit M-02: only sha256(token) is stored; the raw token goes back to the
    // creator once, in the URL, and is never persisted.
    const token = this.tokenFactory();
    const expiresAt = new Date(
      this.now().getTime() + input.expiresInDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    await this.repository.createShareLink({
      token: hashShareToken(token),
      workloadId: input.workloadId,
      watermark: input.watermark,
      pricingModel: input.pricingModel,
      granularity: input.granularity,
      // Salted scrypt, like account passwords. Links created before this
      // change keep their legacy unsalted hash, which passwordMatches accepts.
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      expiresAt,
    });

    return {
      token,
      url: `/api/v1/share/${token}`,
    };
  }

  async getSharedReport(
    token: string,
    password?: string,
    viewContext: ShareLinkViewContext = {},
  ): Promise<SharedReportResponse> {
    const shareLink = await this.repository.getActiveShareLink(hashShareToken(token));

    if (!shareLink) {
      throw new ApiNotFoundError('Share link was not found or has expired');
    }

    if (shareLink.passwordHash && !(await passwordMatches(password, shareLink.passwordHash))) {
      throw new ApiUnauthorizedError('Share link password is required or invalid');
    }

    const workload = await this.ensureWorkload(shareLink.workloadId);
    const breakdown = await this.getWorkloadCostBreakdown(
      workload.id,
      cachedPricingTermForShareModel(shareLink.pricingModel),
    );

    await this.repository.recordShareLinkEvent(
      toShareLinkEvent(shareLink.token, viewContext, this.now()),
    );

    return {
      token,
      watermark: shareLink.watermark,
      expiresAt: shareLink.expiresAt,
      pricingModel: shareLink.pricingModel,
      granularity: shareLink.granularity,
      passwordProtected: Boolean(shareLink.passwordHash),
      workload,
      breakdown,
    };
  }

  async getShareLinkAnalytics(token: string): Promise<ShareLinkAnalyticsResponse> {
    const analytics = await this.repository.getShareLinkAnalytics(hashShareToken(token));

    if (!analytics) {
      throw new ApiNotFoundError('Share link was not found');
    }

    // The repository only knows the hash; report the token the caller holds.
    return { ...analytics, token };
  }

  async revokeShareLink(token: string): Promise<ShareLinkResponse> {
    const revoked = await this.repository.revokeShareLink(
      hashShareToken(token),
      this.now().toISOString(),
    );

    if (!revoked) {
      throw new ApiNotFoundError('Share link was not found');
    }

    return {
      token,
      url: `/api/v1/share/${token}`,
    };
  }

  getExchangeRates(baseCurrency: string): Promise<ExchangeRatesResponse> {
    return this.repository.getExchangeRates(baseCurrency);
  }

  private async ensureWorkload(workloadId: string): Promise<WorkloadRecord> {
    const workload = await this.repository.getWorkload(workloadId);

    if (!workload) {
      throw new ApiNotFoundError(`Workload ${workloadId} was not found`);
    }

    return workload;
  }
}

/** sha256 hex of a share token: what share_links.token stores (migration 043). */
export function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * The pre-M-02 format: unsalted sha256 hex. Verify-only, never written, and
 * time-bounded: migration 043 capped every existing link at 90 days, so no
 * link carrying one of these hashes outlives that window.
 */
function legacySharePasswordHash(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}

function toShareLinkEvent(
  token: string,
  context: ShareLinkViewContext,
  viewedAt: Date,
): ShareLinkEventInput {
  const countryCode = context.countryCode?.trim().toUpperCase();
  // The section is caller-supplied (now a POST body field, so it can be
  // megabytes). Bound it before any regex, and trim dashes without a
  // backtracking pattern: `/-+$/` is polynomial on a long run of '-'.
  const section = (context.section ?? 'summary')
    .slice(0, 256)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
  const normalizedSection = trimDashes(section).slice(0, 64) || 'summary';

  return {
    token,
    ...(countryCode && /^[A-Z]{2}$/.test(countryCode) ? { countryCode } : {}),
    section: normalizedSection,
    ...(context.userAgent
      ? { userAgentHash: createHash('sha256').update(context.userAgent, 'utf8').digest('hex') }
      : {}),
    viewedAt: viewedAt.toISOString(),
  };
}

function trimDashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '-') start += 1;
  while (end > start && value[end - 1] === '-') end -= 1;
  return value.slice(start, end);
}

async function passwordMatches(
  password: string | undefined,
  expectedHash: string,
): Promise<boolean> {
  if (!password) {
    return false;
  }

  if (expectedHash.startsWith('scrypt:')) {
    return verifyPassword(password, expectedHash);
  }

  const candidate = Buffer.from(legacySharePasswordHash(password), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');

  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function cachedPricingTermForShareModel(
  pricingModel: ShareLinkInput['pricingModel'],
): CachedPricingTerm {
  if (pricingModel === 'reserved-1yr') {
    return 'reserved_1yr';
  }

  if (pricingModel === 'reserved-3yr') {
    return 'reserved_3yr';
  }

  if (pricingModel === 'savings-plan') {
    return 'savings_plan';
  }

  if (pricingModel === 'spot') {
    return 'spot';
  }

  return 'on_demand';
}
