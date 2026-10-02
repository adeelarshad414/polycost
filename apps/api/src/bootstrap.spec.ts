import { describe, it, expect, jest } from '@jest/globals';
import {
  CREDENTIAL_ROUTE_BODY_LIMIT_BYTES,
  configureApp,
  corsOriginsFromConfig,
  registerCredentialBodyLimits,
} from './bootstrap.js';

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

// H-03: the global 8 MB body limit (sized for diagrams) applied to login too.
describe('credential route body limits', () => {
  function routeHook() {
    let hook: ((route: { url?: string; bodyLimit?: number }) => void) | undefined;
    registerCredentialBodyLimits({
      addHook: (_name, handler) => {
        hook = handler;
      },
    });
    return hook!;
  }

  it.each(['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/password'])(
    'caps %s at 16 KB',
    (url) => {
      const route: { url: string; bodyLimit?: number } = { url };
      routeHook()(route);
      expect(route.bodyLimit).toBe(CREDENTIAL_ROUTE_BODY_LIMIT_BYTES);
    },
  );

  it('leaves other routes on the global limit', () => {
    const route: { url: string; bodyLimit?: number } = { url: '/api/v1/diagrams/parse' };
    routeHook()(route);
    expect(route.bodyLimit).toBeUndefined();
  });
});
