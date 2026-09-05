import { Injectable, Logger } from '@nestjs/common';
import { ProviderId } from '../adapters/common/cloud-provider-adapter';
import { ApiDatabaseRepository } from '../api/api-database.repository';
import { BudgetEvaluationRecord, WorkloadCostBreakdown } from '../api/cost-management.types';
import { TeamAuditExportService, TeamAuditExportSummary } from '../api/team-audit-export.service';
import type { ExchangeRateClient } from './exchange-rate.client';
import {
  AlertEvaluationSummary,
  CurrencySyncSummary,
  DataRetentionSweepJobSummary,
  ShareLinkCleanupSummary,
} from './cost-management-jobs.types';
import { DataRetentionMode, DataRetentionWindows } from '../api/api-database.repository';

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class CostManagementJobsService {
  private readonly logger = new Logger(CostManagementJobsService.name);

  constructor(
    private readonly repository: ApiDatabaseRepository,
    private readonly exchangeRateClient: ExchangeRateClient,
    private readonly auditExportService?: TeamAuditExportService,
  ) {}

  async syncCurrencyRates(baseCurrency = 'USD'): Promise<CurrencySyncSummary> {
    const snapshot = await this.exchangeRateClient.fetchLatest(baseCurrency);
    const recordsUpdated = await this.repository.upsertExchangeRates({
      baseCurrency: snapshot.baseCurrency,
      rates: snapshot.rates,
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
    });

    this.logger.log(
      `Currency sync cached ${recordsUpdated} ${snapshot.baseCurrency} exchange-rate rows from ${snapshot.source}`,
    );

    return {
      status: 'success',
      baseCurrency: snapshot.baseCurrency,
      quoteCurrencyCount: Object.keys(snapshot.rates).length,
      recordsUpdated,
      fetchedAt: snapshot.fetchedAt,
      source: snapshot.source,
    };
  }

  async evaluateBudgetAlerts(): Promise<AlertEvaluationSummary> {
    const budgets = await this.repository.listBudgetsForEvaluation();
    let observationsCreated = 0;
    let alertsCreated = 0;
    let budgetsSkippedWithoutPricing = 0;

    for (const record of budgets) {
      const observed = await this.evaluateBudget(record);

      observationsCreated += observed.observationCreated ? 1 : 0;
      alertsCreated += observed.alertsCreated;
      budgetsSkippedWithoutPricing += observed.skippedWithoutPricing ? 1 : 0;
    }

    this.logger.log(
      `Budget alert evaluation completed for ${budgets.length} budgets; created ${alertsCreated} alerts`,
    );

    return {
      status: 'success',
      budgetsEvaluated: budgets.length,
      observationsCreated,
      alertsCreated,
      budgetsSkippedWithoutPricing,
    };
  }

  async cleanupExpiredShareLinks(): Promise<ShareLinkCleanupSummary> {
    const ranAt = new Date().toISOString();
    const revokedLinks = await this.repository.cleanupExpiredShareLinks(ranAt);

    this.logger.log(`Share-link cleanup revoked ${revokedLinks} expired links`);

    return {
      status: 'success',
      revokedLinks,
      ranAt,
    };
  }

  // DB-2: prune append-only tables past their retention window. Options are
  // supplied by the scheduler (which owns ConfigService) so this service keeps
  // its existing DI signature. Defaults are report-only, so this logs what would
  // be removed until an operator explicitly opts into deletion.
  async runDataRetentionSweep(options: {
    mode: DataRetentionMode;
    windows: DataRetentionWindows;
    maxRowsPerTable: number;
  }): Promise<DataRetentionSweepJobSummary> {
    const result = await this.repository.pruneExpiredData({
      now: new Date().toISOString(),
      mode: options.mode,
      windows: options.windows,
      maxRowsPerTable: options.maxRowsPerTable,
    });

    this.logger.log(
      result.mode === 'delete-expired'
        ? `Data retention sweep deleted ${result.totalDeletedRows} of ${result.totalEligibleRows} expired rows`
        : `Data retention sweep (report-only) found ${result.totalEligibleRows} expired rows; set DATA_RETENTION_ENFORCEMENT_MODE=delete-expired to prune them`,
    );

    return {
      status: 'success',
      mode: result.mode,
      ranAt: result.ranAt,
      totalEligibleRows: result.totalEligibleRows,
      totalDeletedRows: result.totalDeletedRows,
      tables: result.tables,
    };
  }

  async flushPendingAuditExports(): Promise<TeamAuditExportSummary> {
    if (!this.auditExportService) {
      return {
        status: 'skipped',
        claimed: 0,
        delivered: 0,
        failed: 0,
        deadLettered: 0,
        ranAt: new Date().toISOString(),
        reason: 'audit export service is not configured',
      };
    }

    return this.auditExportService.flushPendingExports();
  }

  private async evaluateBudget(record: BudgetEvaluationRecord): Promise<{
    observationCreated: boolean;
    alertsCreated: number;
    skippedWithoutPricing: boolean;
  }> {
    const breakdown = await this.repository.getWorkloadCostBreakdown(
      record.workload.id,
      'on_demand',
    );
    const modeledSpend = breakdown ? selectModeledSpend(breakdown) : undefined;

    if (!modeledSpend) {
      this.logger.warn(
        `Skipping budget ${record.budget.id}; workload ${record.workload.id} has no non-zero cached provider pricing`,
      );

      return {
        observationCreated: false,
        alertsCreated: 0,
        skippedWithoutPricing: true,
      };
    }

    const observedAt = new Date();
    const currentObservation = await this.repository.insertCostObservation({
      workloadId: record.workload.id,
      budgetId: record.budget.id,
      term: 'on_demand',
      provider: modeledSpend.provider,
      observedMonthlyUsd: modeledSpend.totalUsd,
      observedAt: observedAt.toISOString(),
    });
    let alertsCreated = 0;

    if (modeledSpend.totalUsd > record.budget.thresholdUsd) {
      const alert = await this.repository.createAlertIfNotActive({
        workloadId: record.workload.id,
        budgetId: record.budget.id,
        alertType: 'budget_threshold',
        message: `Modeled monthly cost ${formatUsd(modeledSpend.totalUsd)} exceeds budget threshold ${formatUsd(record.budget.thresholdUsd)} using ${modeledSpend.provider.toUpperCase()} as the current lowest-cost provider.`,
        thresholdUsd: record.budget.thresholdUsd,
        observedUsd: modeledSpend.totalUsd,
      });

      alertsCreated += alert ? 1 : 0;
    }

    if (record.budget.alertOnAnomalyPercent) {
      const previousObservation = await this.repository.getLatestCostObservationBefore({
        workloadId: record.workload.id,
        budgetId: record.budget.id,
        observedBefore: new Date(observedAt.getTime() - WEEK_IN_MS).toISOString(),
      });
      const previousUsd = previousObservation?.observedMonthlyUsd ?? 0;

      if (previousUsd > 0) {
        const anomalyPercent = roundCurrency(
          ((currentObservation.observedMonthlyUsd - previousUsd) / previousUsd) * 100,
        );

        if (anomalyPercent >= record.budget.alertOnAnomalyPercent) {
          const alert = await this.repository.createAlertIfNotActive({
            workloadId: record.workload.id,
            budgetId: record.budget.id,
            alertType: 'anomaly',
            message: `Modeled monthly cost increased ${anomalyPercent}% week over week, above the ${record.budget.alertOnAnomalyPercent}% anomaly threshold.`,
            observedUsd: currentObservation.observedMonthlyUsd,
            anomalyPercent,
          });

          alertsCreated += alert ? 1 : 0;
        }
      }
    }

    return {
      observationCreated: true,
      alertsCreated,
      skippedWithoutPricing: false,
    };
  }
}

function selectModeledSpend(
  breakdown: WorkloadCostBreakdown,
): { provider: ProviderId; totalUsd: number } | undefined {
  return breakdown.providers
    .filter((providerBreakdown) => providerBreakdown.total > 0)
    .map((providerBreakdown) => ({
      provider: providerBreakdown.provider,
      totalUsd: providerBreakdown.total,
    }))
    .sort((left, right) => left.totalUsd - right.totalUsd)[0];
}

function formatUsd(value: number): string {
  return `$${roundCurrency(value).toFixed(2)}`;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
