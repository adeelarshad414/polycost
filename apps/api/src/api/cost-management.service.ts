import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiNotFoundError } from './api-errors';
import { ApiDatabaseRepository } from './api-database.repository';
import {
  AlertRecord,
  BudgetInput,
  BudgetRecord,
  CachedPricingCompareQuery,
  CachedPricingCompareRow,
  CachedPricingTerm,
  ExchangeRatesResponse,
  ShareLinkInput,
  ShareLinkResponse,
  SharedReportResponse,
  WorkloadCostBreakdown,
  WorkloadInput,
  WorkloadRecord,
} from './cost-management.types';

@Injectable()
export class CostManagementService {
  constructor(
    private readonly repository: ApiDatabaseRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly tokenFactory: () => string = () => randomBytes(32).toString('base64url'),
  ) {}

  createWorkload(input: WorkloadInput): Promise<WorkloadRecord> {
    return this.repository.createWorkload(input);
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

  listAlerts(workloadId?: string): Promise<AlertRecord[]> {
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

    const token = this.tokenFactory();
    const expiresAt = new Date(
      this.now().getTime() + input.expiresInDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const shareLink = await this.repository.createShareLink({
      token,
      workloadId: input.workloadId,
      watermark: input.watermark,
      expiresAt,
    });

    return {
      token: shareLink.token,
      url: `/api/v1/share/${shareLink.token}`,
    };
  }

  async getSharedReport(token: string): Promise<SharedReportResponse> {
    const shareLink = await this.repository.getActiveShareLink(token);

    if (!shareLink) {
      throw new ApiNotFoundError('Share link was not found or has expired');
    }

    const workload = await this.ensureWorkload(shareLink.workloadId);
    const breakdown = await this.getWorkloadCostBreakdown(workload.id, 'on_demand');

    return {
      token: shareLink.token,
      watermark: shareLink.watermark,
      expiresAt: shareLink.expiresAt,
      workload,
      breakdown,
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
