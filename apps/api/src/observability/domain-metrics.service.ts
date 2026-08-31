import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { MetricsService } from './metrics.service';

/**
 * Business metrics for the golden signals declared in docs/RUNBOOK.md.
 *
 * Every domain instrument lives here rather than at its call site, for one
 * reason: label cardinality is the failure mode that takes Prometheus down, and
 * it is only reviewable if the full label vocabulary sits in a single file. Call
 * sites get a named method with a closed union of outcomes, so a caller cannot
 * invent a new label value - or pass an unbounded one such as a workload id,
 * tenant id or file name - without editing this file.
 *
 * Instruments share MetricsService's registry so they render on the same scrape.
 */

export type EtlStatus = 'success' | 'partial' | 'failed';
export type EtlRecordOutcome = 'updated' | 'rejected' | 'skipped';
export type VaultOutcome = 'success' | 'failure';
export type AuthOutcome = 'success' | 'invalid_credentials' | 'locked';
export type ExportOutcome = 'success' | 'failure';

@Injectable()
export class DomainMetricsService {
  private readonly etlRuns: Counter<'provider' | 'status'>;
  private readonly etlRecords: Counter<'provider' | 'outcome'>;
  private readonly etlDuration: Histogram<'provider'>;
  private readonly etlLastSuccess: Gauge<'provider'>;
  private readonly vaultReads: Counter<'outcome'>;
  private readonly authAttempts: Counter<'outcome'>;
  private readonly authLockouts: Counter<string>;
  private readonly exports: Counter<'format' | 'outcome'>;
  private readonly exportDuration: Histogram<'format'>;
  private readonly diagramParses: Counter<'format' | 'confidence'>;
  private readonly diagramUnresolved: Counter<'format'>;
  private readonly diagramIgnored: Counter<'format'>;

  constructor(metrics: MetricsService) {
    const registers = [metrics.registry];

    this.etlRuns = new Counter({
      name: 'pricing_etl_runs_total',
      help: 'Pricing ETL provider refreshes, by provider and terminal status.',
      labelNames: ['provider', 'status'],
      registers,
    });

    this.etlRecords = new Counter({
      name: 'pricing_etl_records_total',
      help: 'Pricing rows processed by the ETL, by provider and outcome.',
      labelNames: ['provider', 'outcome'],
      registers,
    });

    this.etlDuration = new Histogram({
      name: 'pricing_etl_duration_seconds',
      help: 'Duration of a single provider refresh.',
      labelNames: ['provider'],
      // Provider bulk feeds are slow; the interesting range is minutes, not ms.
      buckets: [1, 5, 15, 30, 60, 120, 300, 600],
      registers,
    });

    this.etlLastSuccess = new Gauge({
      name: 'pricing_etl_last_success_timestamp_seconds',
      help: 'Unix timestamp of the last successful refresh, per provider. Alert on staleness, not on absence.',
      labelNames: ['provider'],
      registers,
    });

    this.vaultReads = new Counter({
      name: 'vault_reads_total',
      help: 'Secret reads from Vault, by outcome.',
      labelNames: ['outcome'],
      registers,
    });

    this.authAttempts = new Counter({
      name: 'auth_attempts_total',
      help: 'Authentication attempts by outcome.',
      labelNames: ['outcome'],
      registers,
    });

    this.authLockouts = new Counter({
      name: 'auth_lockouts_total',
      help: 'Accounts locked after repeated failed authentication.',
      registers,
    });

    this.exports = new Counter({
      name: 'report_exports_total',
      help: 'Report exports by format and outcome.',
      labelNames: ['format', 'outcome'],
      registers,
    });

    this.exportDuration = new Histogram({
      name: 'report_export_duration_seconds',
      help: 'Time to generate a report export, by format.',
      labelNames: ['format'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers,
    });

    this.diagramParses = new Counter({
      name: 'diagram_parses_total',
      help: 'Diagram imports parsed, by input format and parser confidence.',
      labelNames: ['format', 'confidence'],
      registers,
    });

    this.diagramUnresolved = new Counter({
      name: 'diagram_parse_unresolved_nodes_total',
      help: 'Diagram nodes the classifier could not resolve.',
      labelNames: ['format'],
      registers,
    });

    this.diagramIgnored = new Counter({
      name: 'diagram_parse_ignored_nodes_total',
      help: 'Diagram nodes deliberately ignored during parsing.',
      labelNames: ['format'],
      registers,
    });
  }

  recordEtlProvider(input: {
    provider: string;
    status: EtlStatus;
    durationSeconds: number;
    recordsUpdated: number;
    recordsRejected: number;
    recordsSkipped: number;
    completedAtSeconds?: number;
  }): void {
    const provider = { provider: input.provider };

    this.etlRuns.inc({ ...provider, status: input.status });
    this.etlDuration.observe(provider, input.durationSeconds);

    // Counters must not be incremented by negative or non-finite values, which
    // would throw and take down the caller. Row counts come from provider
    // responses, so they are not fully trusted.
    this.incRecords(provider.provider, 'updated', input.recordsUpdated);
    this.incRecords(provider.provider, 'rejected', input.recordsRejected);
    this.incRecords(provider.provider, 'skipped', input.recordsSkipped);

    if (input.status !== 'failed' && input.completedAtSeconds !== undefined) {
      this.etlLastSuccess.set(provider, input.completedAtSeconds);
    }
  }

  private incRecords(provider: string, outcome: EtlRecordOutcome, count: number): void {
    if (Number.isFinite(count) && count > 0) {
      this.etlRecords.inc({ provider, outcome }, count);
    }
  }

  recordVaultRead(outcome: VaultOutcome): void {
    this.vaultReads.inc({ outcome });
  }

  recordAuthAttempt(outcome: AuthOutcome): void {
    this.authAttempts.inc({ outcome });
  }

  recordAuthLockout(): void {
    this.authLockouts.inc();
  }

  recordExport(input: { format: string; outcome: ExportOutcome; durationSeconds: number }): void {
    this.exports.inc({ format: input.format, outcome: input.outcome });
    this.exportDuration.observe({ format: input.format }, input.durationSeconds);
  }

  recordDiagramParse(input: {
    format: string;
    confidence: string;
    unresolvedCount: number;
    ignoredCount: number;
  }): void {
    const format = { format: input.format };

    this.diagramParses.inc({ ...format, confidence: input.confidence });

    if (Number.isFinite(input.unresolvedCount) && input.unresolvedCount > 0) {
      this.diagramUnresolved.inc(format, input.unresolvedCount);
    }
    if (Number.isFinite(input.ignoredCount) && input.ignoredCount > 0) {
      this.diagramIgnored.inc(format, input.ignoredCount);
    }
  }
}
