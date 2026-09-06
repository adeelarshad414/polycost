import { describe, it, expect } from '@jest/globals';
import { NestFactory } from '@nestjs/core';
import { DomainMetricsService } from './domain-metrics.service.js';
import { MetricsService } from './metrics.service.js';
import { ObservabilityModule } from './observability.module.js';

function build(): { domain: DomainMetricsService; render: () => Promise<string> } {
  const metrics = new MetricsService({ collectDefaults: false });
  return { domain: new DomainMetricsService(metrics), render: () => metrics.render() };
}

function samples(text: string, metric: string): string[] {
  return text.split('\n').filter((line) => line.startsWith(`${metric}{`));
}

describe('DomainMetricsService', () => {
  it('renders onto the same registry as the HTTP metrics', async () => {
    const metrics = new MetricsService({ collectDefaults: false });
    const domain = new DomainMetricsService(metrics);

    metrics.observeRequest({ method: 'GET', route: '/a', status: 200, durationSeconds: 0 });
    domain.recordVaultRead('success');

    const rendered = await metrics.render();

    expect(rendered).toContain('http_requests_total{');
    expect(rendered).toContain('vault_reads_total{outcome="success"} 1');
  });

  describe('pricing ETL', () => {
    it('records the run, its duration and each row outcome', async () => {
      const { domain, render } = build();

      domain.recordEtlProvider({
        provider: 'aws',
        status: 'partial',
        durationSeconds: 42,
        recordsUpdated: 100,
        recordsRejected: 3,
        recordsSkipped: 7,
        completedAtSeconds: 1_700_000_000,
      });

      const rendered = await render();

      expect(rendered).toContain('pricing_etl_runs_total{provider="aws",status="partial"} 1');
      expect(rendered).toContain('pricing_etl_records_total{provider="aws",outcome="updated"} 100');
      expect(rendered).toContain('pricing_etl_records_total{provider="aws",outcome="rejected"} 3');
      expect(rendered).toContain('pricing_etl_records_total{provider="aws",outcome="skipped"} 7');
      expect(rendered).toContain('pricing_etl_duration_seconds_count{provider="aws"} 1');
    });

    it('publishes a freshness timestamp on success so alerts can fire on staleness', async () => {
      const { domain, render } = build();

      domain.recordEtlProvider({
        provider: 'gcp',
        status: 'success',
        durationSeconds: 10,
        recordsUpdated: 5,
        recordsRejected: 0,
        recordsSkipped: 0,
        completedAtSeconds: 1_700_000_000,
      });

      expect(await render()).toContain(
        'pricing_etl_last_success_timestamp_seconds{provider="gcp"} 1700000000',
      );
    });

    it('leaves the freshness gauge untouched when a refresh fails', async () => {
      const { domain, render } = build();

      domain.recordEtlProvider({
        provider: 'azure',
        status: 'success',
        durationSeconds: 1,
        recordsUpdated: 1,
        recordsRejected: 0,
        recordsSkipped: 0,
        completedAtSeconds: 1_700_000_000,
      });
      domain.recordEtlProvider({
        provider: 'azure',
        status: 'failed',
        durationSeconds: 1,
        recordsUpdated: 0,
        recordsRejected: 0,
        recordsSkipped: 0,
        completedAtSeconds: 1_800_000_000,
      });

      // A failed run must not look like fresh data, or the staleness alert is
      // silenced by the very failure it exists to catch.
      expect(await render()).toContain(
        'pricing_etl_last_success_timestamp_seconds{provider="azure"} 1700000000',
      );
    });

    it('skips zero row counts rather than emitting empty series', async () => {
      const { domain, render } = build();

      domain.recordEtlProvider({
        provider: 'aws',
        status: 'success',
        durationSeconds: 1,
        recordsUpdated: 4,
        recordsRejected: 0,
        recordsSkipped: 0,
        completedAtSeconds: 1,
      });

      expect(samples(await render(), 'pricing_etl_records_total')).toHaveLength(1);
    });

    it('ignores negative and non-finite row counts instead of throwing', async () => {
      const { domain, render } = build();

      // Row counts originate in provider responses, so they are not trusted.
      // prom-client throws on a negative increment, which would abort the ETL.
      expect(() =>
        domain.recordEtlProvider({
          provider: 'aws',
          status: 'success',
          durationSeconds: 1,
          recordsUpdated: -5,
          recordsRejected: Number.NaN,
          recordsSkipped: Number.POSITIVE_INFINITY,
          completedAtSeconds: 1,
        }),
      ).not.toThrow();

      expect(samples(await render(), 'pricing_etl_records_total')).toHaveLength(0);
    });

    it('accumulates across repeated refreshes of the same provider', async () => {
      const { domain, render } = build();

      for (let i = 0; i < 3; i += 1) {
        domain.recordEtlProvider({
          provider: 'aws',
          status: 'success',
          durationSeconds: 2,
          recordsUpdated: 10,
          recordsRejected: 0,
          recordsSkipped: 0,
          completedAtSeconds: 1,
        });
      }

      const rendered = await render();

      expect(rendered).toContain('pricing_etl_runs_total{provider="aws",status="success"} 3');
      expect(rendered).toContain('pricing_etl_records_total{provider="aws",outcome="updated"} 30');
    });
  });

  describe('vault, auth and exports', () => {
    it('separates vault successes from failures', async () => {
      const { domain, render } = build();

      domain.recordVaultRead('success');
      domain.recordVaultRead('failure');
      domain.recordVaultRead('failure');

      const rendered = await render();

      expect(rendered).toContain('vault_reads_total{outcome="success"} 1');
      expect(rendered).toContain('vault_reads_total{outcome="failure"} 2');
    });

    it('distinguishes a bad password from a locked account', async () => {
      const { domain, render } = build();

      domain.recordAuthAttempt('success');
      domain.recordAuthAttempt('invalid_credentials');
      domain.recordAuthAttempt('locked');
      domain.recordAuthLockout();

      const rendered = await render();

      expect(rendered).toContain('auth_attempts_total{outcome="invalid_credentials"} 1');
      expect(rendered).toContain('auth_attempts_total{outcome="locked"} 1');
      expect(rendered).toContain('auth_lockouts_total 1');
    });

    it('records export outcome and duration by format', async () => {
      const { domain, render } = build();

      domain.recordExport({ format: 'pdf', outcome: 'success', durationSeconds: 0.4 });
      domain.recordExport({ format: 'csv', outcome: 'failure', durationSeconds: 0.1 });

      const rendered = await render();

      expect(rendered).toContain('report_exports_total{format="pdf",outcome="success"} 1');
      expect(rendered).toContain('report_exports_total{format="csv",outcome="failure"} 1');
      expect(rendered).toContain('report_export_duration_seconds_count{format="pdf"} 1');
    });
  });

  describe('diagram parsing', () => {
    it('records confidence and unresolved/ignored node counts', async () => {
      const { domain, render } = build();

      domain.recordDiagramParse({
        format: 'drawio',
        confidence: 'low',
        unresolvedCount: 4,
        ignoredCount: 2,
      });

      const rendered = await render();

      expect(rendered).toContain('diagram_parses_total{format="drawio",confidence="low"} 1');
      expect(rendered).toContain('diagram_parse_unresolved_nodes_total{format="drawio"} 4');
      expect(rendered).toContain('diagram_parse_ignored_nodes_total{format="drawio"} 2');
    });

    it('emits no node series for a clean parse', async () => {
      const { domain, render } = build();

      domain.recordDiagramParse({
        format: 'mermaid',
        confidence: 'high',
        unresolvedCount: 0,
        ignoredCount: 0,
      });

      const rendered = await render();

      expect(samples(rendered, 'diagram_parse_unresolved_nodes_total')).toHaveLength(0);
      expect(rendered).toContain('diagram_parses_total{format="mermaid",confidence="high"} 1');
    });
  });

  describe('cardinality', () => {
    // The reason every instrument lives in one file. Provider, format, outcome
    // and confidence are all closed vocabularies; nothing here is keyed by a
    // workload, tenant, user or file name.
    it('keeps ETL series bounded by provider count, not by run count', async () => {
      const { domain, render } = build();

      for (let i = 0; i < 200; i += 1) {
        domain.recordEtlProvider({
          provider: ['aws', 'gcp', 'azure'][i % 3],
          status: 'success',
          durationSeconds: 1,
          recordsUpdated: 1,
          recordsRejected: 0,
          recordsSkipped: 0,
          completedAtSeconds: i,
        });
      }

      expect(samples(await render(), 'pricing_etl_runs_total')).toHaveLength(3);
      expect(samples(await render(), 'pricing_etl_last_success_timestamp_seconds')).toHaveLength(3);
    });
  });

  it('resolves through the DI container', async () => {
    const context = await NestFactory.createApplicationContext(ObservabilityModule, {
      logger: false,
      abortOnError: false,
    });

    try {
      expect(context.get(DomainMetricsService)).toBeInstanceOf(DomainMetricsService);
    } finally {
      await context.close();
    }
  });
});
