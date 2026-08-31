import { configureApp, corsOriginsFromConfig } from './bootstrap';

// Regression guard for the graceful-shutdown defect.
//
// Six classes implement onModuleDestroy (four Postgres pools, the pricing-ETL
// scheduler and the cost-management BullMQ scheduler), but Nest does not run any
// of them unless enableShutdownHooks() is called. It was missing, so every
// SIGTERM - i.e. every deploy, restart and scale-down - skipped that cleanup and
// left BullMQ workers undrained.

describe('application bootstrap wiring', () => {
  function appDouble() {
    const addHook = jest.fn();

    return {
      register: jest.fn(async () => undefined),
      enableCors: jest.fn(),
      enableShutdownHooks: jest.fn(),
      get: jest.fn(),
      // configureApp installs the request-correlation hook on the underlying
      // Fastify instance.
      getHttpAdapter: jest.fn(() => ({ getInstance: () => ({ addHook }) })),
      addHook,
    };
  }

  it('enables shutdown hooks so onModuleDestroy runs on SIGTERM', async () => {
    const app = appDouble();

    await configureApp(app as never, ['https://example.test']);

    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
  });

  it('installs the request-correlation hook', async () => {
    const app = appDouble();

    await configureApp(app as never, []);

    expect(app.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
  });

  it('registers helmet and applies the configured CORS origins', async () => {
    const app = appDouble();

    await configureApp(app as never, ['https://a.test', 'https://b.test']);

    expect(app.register).toHaveBeenCalledTimes(1);
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['https://a.test', 'https://b.test'],
    });
  });

  describe('corsOriginsFromConfig', () => {
    it('splits, trims and drops empty entries', () => {
      expect(corsOriginsFromConfig(' https://a.test , https://b.test ,, ')).toEqual([
        'https://a.test',
        'https://b.test',
      ]);
    });

    it('returns an empty list when nothing is configured', () => {
      expect(corsOriginsFromConfig('')).toEqual([]);
    });
  });
});
