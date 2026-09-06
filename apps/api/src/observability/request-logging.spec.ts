import { describe, it, expect, jest } from '@jest/globals';
import { ApiExceptionFilter } from '../api/api-exception.filter.js';
import { ApiValidationError } from '../api/api-errors.js';
import { ErrorReporter } from './error-reporter.js';
import { MetricsService } from './metrics.service.js';
import { isProbeRoute, registerMetricsHook } from '../bootstrap.js';

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

function drive(request: unknown, reply: unknown) {
  const logger = { log: jest.fn() };
  const instance = fakeInstance();
  registerMetricsHook(
    instance as never,
    new MetricsService({ collectDefaults: false }),
    logger as never,
  );

  instance.hooks.onRequest!(request as never, reply as never, () => {});
  instance.hooks.onResponse!(request as never, reply as never, () => {});

  return logger;
}

describe('request access logging', () => {
  it('logs one line per request with method, route, status and duration', () => {
    const logger = drive(
      { method: 'GET', url: '/api/v1/things/abc', routeOptions: { url: '/api/v1/things/:key' } },
      { statusCode: 200 },
    );

    expect(logger.log).toHaveBeenCalledTimes(1);
    const [payload, context] = logger.log.mock.calls[0] as [Record<string, unknown>, string];

    expect(context).toBe('HttpRequest');
    expect(payload).toMatchObject({
      event: 'http_request',
      method: 'GET',
      route: '/api/v1/things/:key',
      status: 200,
    });
    expect(typeof payload.durationMs).toBe('number');
  });

  it('logs the normalised route, never the raw URL', () => {
    const logger = drive(
      { method: 'GET', url: '/api/v1/comparisons/3f2504e0-4f89-11d3-9a0c-0305e82c3301?token=abc' },
      { statusCode: 404 },
    );

    const [payload] = logger.log.mock.calls[0] as [Record<string, unknown>];

    // A raw URL carries ids and query values straight into the log sink.
    expect(payload.route).toBe('/api/v1/comparisons/:id');
    expect(JSON.stringify(payload)).not.toContain('token=abc');
  });

  it.each([
    '/metrics',
    '/health',
    '/health/live',
    '/health/ready',
    '/health/deep',
    '/api/v1/health/ready',
  ])('does not log the %s probe', (route) => {
    const logger = drive(
      { method: 'GET', url: route, routeOptions: { url: route } },
      {
        statusCode: 200,
      },
    );

    // Probes are polled constantly and would be nearly all the log volume.
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('still records metrics for probes even though it does not log them', async () => {
    const metrics = new MetricsService({ collectDefaults: false });
    const instance = fakeInstance();
    const logger = { log: jest.fn() };
    registerMetricsHook(instance as never, metrics, logger as never);

    const request = { method: 'GET', url: '/metrics', routeOptions: { url: '/metrics' } };
    instance.hooks.onRequest!(request as never, {} as never, () => {});
    instance.hooks.onResponse!(request as never, { statusCode: 200 } as never, () => {});

    expect(logger.log).not.toHaveBeenCalled();
    expect(await metrics.render()).toContain('route="/metrics"');
  });

  it('works when no logger is supplied', () => {
    const instance = fakeInstance();
    registerMetricsHook(instance as never, new MetricsService({ collectDefaults: false }));

    expect(() => {
      instance.hooks.onResponse!(
        { method: 'GET', url: '/a' } as never,
        { statusCode: 200 } as never,
        () => {},
      );
    }).not.toThrow();
  });

  it('classifies probe routes', () => {
    expect(isProbeRoute('/metrics')).toBe(true);
    expect(isProbeRoute('/api/v1/comparisons')).toBe(false);
  });
});

describe('ApiExceptionFilter error reporting', () => {
  function host(replyDouble: ReturnType<typeof reply>) {
    return {
      switchToHttp: () => ({ getResponse: () => replyDouble }),
    } as never;
  }

  function reply() {
    const send = jest.fn();
    return {
      status: jest.fn<(statusCode: number) => { send: typeof send }>(() => ({ send })),
      send,
      header: jest.fn<(name: string, value: string) => void>(),
    };
  }

  it('reports a 500 to the error tracker', () => {
    const reporter = {
      report: jest.fn<ErrorReporter['report']>(async () => undefined),
    } as unknown as ErrorReporter;
    const response = reply();

    new ApiExceptionFilter(reporter).catch(new Error('boom'), host(response));

    expect(reporter.report).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ code: 'INTERNAL_ERROR', statusCode: 500 }),
    );
  });

  it('does not report expected 4xx outcomes', () => {
    const reporter = {
      report: jest.fn<ErrorReporter['report']>(async () => undefined),
    } as unknown as ErrorReporter;

    new ApiExceptionFilter(reporter).catch(
      new ApiValidationError('bad payload', []),
      host(reply()),
    );

    // A validation failure is the API working. Reporting it would bury real
    // defects in noise.
    expect(reporter.report).not.toHaveBeenCalled();
  });

  it('still returns a response when no reporter is configured', () => {
    const response = reply();

    expect(() => new ApiExceptionFilter().catch(new Error('boom'), host(response))).not.toThrow();
    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('does not let a failing reporter break the error response', () => {
    const reporter = {
      report: jest.fn<ErrorReporter['report']>(() => Promise.reject(new Error('collector down'))),
    } as unknown as ErrorReporter;
    const response = reply();

    // report() is not awaited, so a rejection here would otherwise surface as
    // an unhandled rejection on the response path.
    expect(() =>
      new ApiExceptionFilter(reporter).catch(new Error('boom'), host(response)),
    ).not.toThrow();
    expect(response.status).toHaveBeenCalledWith(500);
  });
});
