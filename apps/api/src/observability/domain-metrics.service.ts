import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { MetricsService } from './metrics.service.js';

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
export type CircuitState = 'closed' | 'open' | 'half_open';
export type DbQueryOutcome = 'success' | 'failure';

/** Counts BullMQ reports per state; keys are the states we choose to publish. */
export interface QueueDepthCounts {
  waiting?: number;
  active?: number;
  delayed?: number;
  failed?: number;
}

export type QueueDepthSource = () => Promise<QueueDepthCounts>;

/**
 * Upper bound on a single queue read during a scrape.
 *
 * A rejecting read is easy to handle; the dangerous case is one that never
 * settles. ioredis retries a lost connection indefinitely rather than failing,
 * so an unbounded read makes a Redis outage hang /metrics - exactly when the
 * rest of the scrape matters most.
 */
const QUEUE_READ_TIMEOUT_MS = 1_000;

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
  private readonly dbQueries: Counter<'pool' | 'operation' | 'outcome'>;
  private readonly dbQueryDuration: Histogram<'pool' | 'operation'>;
  private readonly dependencyUp: Gauge<'dependency'>;
  private readonly dependencyProbeDuration: Histogram<'dependency'>;
  private readonly queueDepth: Gauge<'queue' | 'state'>;
  private readonly queueDepthSources = new Map<string, QueueDepthSource>();
  private readonly circuitState: Gauge<'provider'>;
  private readonly circuitOpened: Counter<'provider'>;

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

    this.circuitState = new Gauge({
      name: 'provider_circuit_state',
      help: 'Outbound provider circuit breaker: 0 closed, 1 half-open, 2 open.',
      labelNames: ['provider'],
      registers,
    });

    this.circuitOpened = new Counter({
      name: 'provider_circuit_opened_total',
      help: 'Times a provider circuit has opened after repeated failures.',
      labelNames: ['provider'],
      registers,
    });

    this.dbQueries = new Counter({
      name: 'db_queries_total',
      help: 'Postgres statements executed, by pool, operation and outcome.',
      labelNames: ['pool', 'operation', 'outcome'],
      registers,
    });

    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Postgres statement duration, by pool and operation.',
      labelNames: ['pool', 'operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 5],
      registers,
    });

    this.dependencyUp = new Gauge({
      name: 'dependency_up',
      help: 'Whether a backing dependency answered its last health probe (1) or not (0).',
      labelNames: ['dependency'],
      registers,
    });

    this.dependencyProbeDuration = new Histogram({
      name: 'dependency_probe_duration_seconds',
      help: 'Connect latency measured by the health probe, by dependency.',
      labelNames: ['dependency'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
      registers,
    });

    this.queueDepth = new Gauge({
      name: 'job_queue_depth',
      help: 'Jobs in each BullMQ queue by state, sampled at scrape time.',
      labelNames: ['queue', 'state'],
      registers,
      // Collected on scrape rather than incremented on enqueue/dequeue: the
      // queue is the source of truth, and counters would drift the moment a job
      // is retried, stalled or removed by anything other than this process.
      collect: async () => {
        await this.collectQueueDepth();
      },
    });
  }

  /**
   * 0 closed, 1 half-open, 2 open - ordered by severity so a dashboard can
   * alert on `> 0` without enumerating states.
   */
  recordCircuitState(input: { provider: string; state: CircuitState }): void {
    const value = input.state === 'open' ? 2 : input.state === 'half_open' ? 1 : 0;
    this.circuitState.set({ provider: input.provider }, value);

    if (input.state === 'open') {
      // A gauge alone cannot show flapping: a circuit that opens and closes
      // repeatedly reads as healthy on every scrape in between.
      this.circuitOpened.inc({ provider: input.provider });
    }
  }

  recordDbQuery(input: {
    pool: string;
    operation: string;
    outcome: DbQueryOutcome;
    durationSeconds: number;
  }): void {
    this.dbQueries.inc({
      pool: input.pool,
      operation: input.operation,
      outcome: input.outcome,
    });
    this.dbQueryDuration.observe(
      { pool: input.pool, operation: input.operation },
      input.durationSeconds,
    );
  }

  recordDependencyProbe(input: { dependency: string; up: boolean; latencySeconds?: number }): void {
    this.dependencyUp.set({ dependency: input.dependency }, input.up ? 1 : 0);

    if (input.latencySeconds !== undefined && Number.isFinite(input.latencySeconds)) {
      this.dependencyProbeDuration.observe({ dependency: input.dependency }, input.latencySeconds);
    }
  }

  /**
   * Registers a queue for scrape-time sampling. Queues live in their own
   * feature modules, so they push a reader in here rather than this global
   * service importing them and creating a dependency cycle.
   */
  registerQueueDepthSource(queue: string, source: QueueDepthSource): void {
    this.queueDepthSources.set(queue, source);
  }

  private async collectQueueDepth(): Promise<void> {
    // Read every queue concurrently: with a per-queue timeout, doing this
    // serially would let N unreachable queues stack up N timeouts on one scrape.
    await Promise.all(
      [...this.queueDepthSources].map(([queue, source]) => this.collectOneQueue(queue, source)),
    );
  }

  private async collectOneQueue(queue: string, source: QueueDepthSource): Promise<void> {
    try {
      const counts = await withTimeout(source(), QUEUE_READ_TIMEOUT_MS);

      for (const [state, value] of Object.entries(counts)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          this.queueDepth.set({ queue, state }, value);
        }
      }
    } catch {
      // A scrape must never fail or hang because Redis is down - that is
      // precisely when the metrics are most wanted. Leaving the previous sample
      // in place would be a lie, so the queue is reported as unknown by
      // removing its series.
      for (const state of ['waiting', 'active', 'delayed', 'failed']) {
        this.queueDepth.remove({ queue, state });
      }
    }
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

/**
 * Rejects if the wrapped promise has not settled in time.
 *
 * The timer is unref'd so a pending scrape read cannot hold the process open
 * during shutdown.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
    timer.unref?.();
  });

  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
