import { MetricsController } from './metrics.controller';
import { MetricsService, normalizeRoute } from './metrics.service';
import { registerMetricsHook } from '../bootstrap';

// Default process metrics are skipped in these tests: they add ~50 series of
// noise to every render() assertion and are prom-client's code, not ours.
function service(): MetricsService {
  return new MetricsService({ collectDefaults: false });
}

function sampleFor(text: string, metric: string): string[] {
  return text.split('\n').filter((line) => line.startsWith(`${metric}{`));
}

describe('MetricsService', () => {
  it('counts a successful request without touching the error counter', async () => {
    const metrics = service();
    metrics.observeRequest({ method: 'get', route: '/health', status: 200, durationSeconds: 0.02 });

    const rendered = await metrics.render();

    expect(rendered).toContain('http_requests_total{method="GET",route="/health",status="200"} 1');
    expect(sampleFor(rendered, 'http_request_errors_total')).toHaveLength(0);
  });

  it('increments the error counter for 4xx and 5xx only', async () => {
    const metrics = service();
    metrics.observeRequest({ method: 'GET', route: '/a', status: 200, durationSeconds: 0.01 });
    metrics.observeRequest({ method: 'GET', route: '/a', status: 399, durationSeconds: 0.01 });
    metrics.observeRequest({ method: 'GET', route: '/a', status: 404, durationSeconds: 0.01 });
    metrics.observeRequest({ method: 'GET', route: '/a', status: 500, durationSeconds: 0.01 });

    const rendered = await metrics.render();

    expect(rendered).toContain('http_request_errors_total{method="GET",route="/a",status="404"} 1');
    expect(rendered).toContain('http_request_errors_total{method="GET",route="/a",status="500"} 1');
    expect(sampleFor(rendered, 'http_request_errors_total')).toHaveLength(2);
  });

  it('accumulates repeated requests on the same label set', async () => {
    const metrics = service();
    for (let i = 0; i < 3; i += 1) {
      metrics.observeRequest({ method: 'POST', route: '/x', status: 201, durationSeconds: 0.1 });
    }

    expect(await metrics.render()).toContain(
      'http_requests_total{method="POST",route="/x",status="201"} 3',
    );
  });

  it('records duration into the histogram buckets', async () => {
    const metrics = service();
    metrics.observeRequest({ method: 'GET', route: '/slow', status: 200, durationSeconds: 0.3 });

    const rendered = await metrics.render();

    // 0.3s falls above the 0.25 bucket and at/below 0.5.
    expect(rendered).toContain(
      'http_request_duration_seconds_bucket{le="0.25",method="GET",route="/slow",status="200"} 0',
    );
    expect(rendered).toContain(
      'http_request_duration_seconds_bucket{le="0.5",method="GET",route="/slow",status="200"} 1',
    );
    expect(rendered).toContain(
      'http_request_duration_seconds_count{method="GET",route="/slow",status="200"} 1',
    );
  });

  it('normalises the method so GET and get are one series', async () => {
    const metrics = service();
    metrics.observeRequest({ method: 'get', route: '/a', status: 200, durationSeconds: 0 });
    metrics.observeRequest({ method: 'GET', route: '/a', status: 200, durationSeconds: 0 });

    expect(await metrics.render()).toContain(
      'http_requests_total{method="GET",route="/a",status="200"} 2',
    );
  });

  it('exposes the Prometheus text content type', () => {
    expect(service().contentType()).toContain('text/plain');
  });

  it('keeps each instance isolated from the global registry', async () => {
    const first = service();
    first.observeRequest({ method: 'GET', route: '/a', status: 200, durationSeconds: 0 });

    expect(await service().render()).not.toContain('http_requests_total{');
  });
});

describe('normalizeRoute', () => {
  it('collapses UUID path segments so each id is not its own series', () => {
    expect(normalizeRoute('/api/v1/comparisons/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(
      '/api/v1/comparisons/:id',
    );
  });

  it('collapses numeric segments', () => {
    expect(normalizeRoute('/api/v1/runs/42/steps/7')).toBe('/api/v1/runs/:n/steps/:n');
  });

  it('collapses long hex digests', () => {
    expect(normalizeRoute(`/artifacts/${'a'.repeat(64)}`)).toBe('/artifacts/:hash');
  });

  it('drops the query string', () => {
    expect(normalizeRoute('/api/v1/pricing?provider=aws&region=us-east-1')).toBe('/api/v1/pricing');
  });

  it('leaves a static route untouched', () => {
    expect(normalizeRoute('/health/live')).toBe('/health/live');
  });

  it('maps the bare root to /', () => {
    expect(normalizeRoute('/')).toBe('/');
  });

  it('bounds cardinality: many distinct ids produce one series', async () => {
    const metrics = service();
    for (let i = 0; i < 50; i += 1) {
      metrics.observeRequest({
        method: 'GET',
        route: normalizeRoute(`/api/v1/comparisons/${i}`),
        status: 200,
        durationSeconds: 0,
      });
    }

    expect(sampleFor(await metrics.render(), 'http_requests_total')).toHaveLength(1);
  });
});

describe('MetricsController', () => {
  it('renders the registry and sets the Prometheus content type', async () => {
    const metrics = service();
    metrics.observeRequest({ method: 'GET', route: '/a', status: 200, durationSeconds: 0 });

    const header = jest.fn();
    const body = await new MetricsController(metrics).metrics({ header });

    expect(body).toContain('http_requests_total{method="GET",route="/a",status="200"} 1');
    expect(header).toHaveBeenCalledWith('Content-Type', metrics.contentType());
  });
});

describe('registerMetricsHook', () => {
  type Hook = (req: never, reply: never, done: () => void) => void;

  function fakeInstance() {
    const hooks: Record<string, Hook> = {};
    return {
      hooks,
      addHook(name: string, handler: Hook) {
        hooks[name] = handler;
        return this;
      },
    };
  }

  async function drive(request: unknown, reply: unknown) {
    const metrics = service();
    const instance = fakeInstance();
    registerMetricsHook(instance as never, metrics);

    instance.hooks.onRequest!(request as never, reply as never, () => {});
    instance.hooks.onResponse!(request as never, reply as never, () => {});

    return metrics.render();
  }

  it('prefers the matched route template over the raw URL', async () => {
    const rendered = await drive(
      { method: 'GET', url: '/api/v1/things/abc', routeOptions: { url: '/api/v1/things/:key' } },
      { statusCode: 200 },
    );

    expect(rendered).toContain('route="/api/v1/things/:key"');
  });

  it('falls back to a normalised URL when no route matched (404s)', async () => {
    const rendered = await drive({ method: 'GET', url: '/nope/12345' }, { statusCode: 404 });

    expect(rendered).toContain('http_requests_total{method="GET",route="/nope/:n",status="404"} 1');
    expect(rendered).toContain('http_request_errors_total{method="GET",route="/nope/:n"');
  });

  it('records a duration even when the onRequest hook never ran', async () => {
    const metrics = service();
    const instance = fakeInstance();
    registerMetricsHook(instance as never, metrics);

    // Fastify skips onRequest for some early-rejected requests; the hook must
    // still record rather than throw on the missing start time.
    instance.hooks.onResponse!(
      { method: 'GET', url: '/a' } as never,
      { statusCode: 200 } as never,
      () => {},
    );

    expect(await metrics.render()).toContain(
      'http_request_duration_seconds_count{method="GET",route="/a",status="200"} 1',
    );
  });

  it('calls done() so the request lifecycle continues', () => {
    const instance = fakeInstance();
    registerMetricsHook(instance as never, service());

    const onRequestDone = jest.fn();
    const onResponseDone = jest.fn();
    instance.hooks.onRequest!({ method: 'GET', url: '/a' } as never, {} as never, onRequestDone);
    instance.hooks.onResponse!(
      { method: 'GET', url: '/a' } as never,
      { statusCode: 200 } as never,
      onResponseDone,
    );

    expect(onRequestDone).toHaveBeenCalledTimes(1);
    expect(onResponseDone).toHaveBeenCalledTimes(1);
  });
});
