import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * RED metrics (Rate, Errors, Duration) for HTTP traffic, plus Node process
 * defaults.
 *
 * Uses a dedicated Registry rather than the global one so tests can construct
 * an isolated instance; the global registry is process-wide state and would
 * leak metrics between test cases.
 */
@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  private readonly requests: Counter<'method' | 'route' | 'status'>;
  private readonly errors: Counter<'method' | 'route' | 'status'>;
  private readonly duration: Histogram<'method' | 'route' | 'status'>;

  constructor(options: { collectDefaults?: boolean } = {}) {
    this.requests = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests handled, labelled by method, route and status.',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.errors = new Counter({
      name: 'http_request_errors_total',
      help: 'HTTP requests that returned a 4xx or 5xx status.',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.duration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds.',
      labelNames: ['method', 'route', 'status'],
      // Buckets skewed to the fast end: a comparison should complete well under
      // a second, so the interesting signal is where the tail starts.
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    if (options.collectDefaults !== false) {
      collectDefaultMetrics({ register: this.registry });
    }
  }

  observeRequest(input: {
    method: string;
    route: string;
    status: number;
    durationSeconds: number;
  }): void {
    const labels = {
      method: input.method.toUpperCase(),
      route: input.route,
      status: String(input.status),
    };

    this.requests.inc(labels);
    this.duration.observe(labels, input.durationSeconds);

    if (input.status >= 400) {
      this.errors.inc(labels);
    }
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}

/**
 * Collapses a concrete URL into its route template.
 *
 * Recording raw paths would make every UUID its own label value, so a handful of
 * endpoints could produce unbounded time series and exhaust Prometheus memory -
 * the classic cardinality explosion.
 */
export function normalizeRoute(url: string): string {
  const path = url.split('?')[0];

  return (
    path
      .split('/')
      .map((segment) => {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
          return ':id';
        }
        if (/^\d+$/.test(segment)) {
          return ':n';
        }
        if (/^[0-9a-f]{32,}$/i.test(segment)) {
          return ':hash';
        }
        return segment;
      })
      .join('/') || '/'
  );
}
