import { describe, it, expect, jest } from '@jest/globals';
import { Writable } from 'node:stream';
import {
  REQUEST_ID_HEADER,
  currentRequestId,
  resolveRequestId,
  runWithRequestContext,
} from './request-context.js';
import { StructuredLogger } from './structured-logger.js';
import { registerRequestContext } from '../bootstrap.js';

/** Collects emitted log lines as parsed JSON. */
function captureLogs(): { lines: Record<string, unknown>[]; stream: Writable } {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      String(chunk)
        .split('\n')
        .filter(Boolean)
        .forEach((line) => lines.push(JSON.parse(line) as Record<string, unknown>));
      callback();
    },
  });

  return { lines, stream };
}

describe('request correlation', () => {
  describe('resolveRequestId', () => {
    it('reuses an inbound id so one id can span services', () => {
      expect(resolveRequestId('abc-123')).toBe('abc-123');
    });

    it('generates an id when none is supplied', () => {
      expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
      expect(resolveRequestId('   ')).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('strips characters that would let a caller forge log lines', () => {
      // The header is attacker-controlled and lands in log output; a newline
      // would let a caller inject a fabricated entry.
      expect(resolveRequestId('abc\ninjected=true')).toBe('abcinjectedtrue');
      expect(resolveRequestId('a b\tc')).toBe('abc');
    });

    it('caps an absurdly long inbound id', () => {
      expect(resolveRequestId('x'.repeat(500))).toHaveLength(128);
    });

    it('takes the first value when the header repeats', () => {
      expect(resolveRequestId(['first', 'second'])).toBe('first');
    });
  });

  describe('runWithRequestContext', () => {
    it('exposes the id to code running inside, and nothing outside', async () => {
      expect(currentRequestId()).toBeUndefined();

      await new Promise<void>((resolve) => {
        runWithRequestContext({ requestId: 'req-1' }, () => {
          expect(currentRequestId()).toBe('req-1');
          // Survives an async hop, which is the whole point.
          setTimeout(() => {
            expect(currentRequestId()).toBe('req-1');
            resolve();
          }, 0);
        });
      });

      expect(currentRequestId()).toBeUndefined();
    });
  });

  describe('registerRequestContext', () => {
    it('echoes the correlation id back on the response', () => {
      let hook: ((req: unknown, reply: unknown, done: () => void) => void) | undefined;
      const instance = {
        addHook: (_name: 'onRequest', handler: typeof hook) => {
          hook = handler;
        },
      };

      registerRequestContext(instance as never);

      const header = jest.fn();
      let seenInsideHandler: string | undefined;
      hook!({ headers: { [REQUEST_ID_HEADER]: 'inbound-9' } }, { header }, () => {
        seenInsideHandler = currentRequestId();
      });

      expect(header).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'inbound-9');
      expect(seenInsideHandler).toBe('inbound-9');
    });
  });
});

describe('StructuredLogger', () => {
  it('emits one JSON object per line carrying the request id', () => {
    const { lines, stream } = captureLogs();
    const logger = new StructuredLogger({ destination: stream });

    runWithRequestContext({ requestId: 'req-42' }, () => {
      logger.log('comparison created', 'ComparisonsController');
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      msg: 'comparison created',
      context: 'ComparisonsController',
      requestId: 'req-42',
      service: 'polycost-api',
    });
  });

  it('omits requestId outside a request, rather than inventing one', () => {
    const { lines, stream } = captureLogs();
    new StructuredLogger({ destination: stream }).log('scheduled sweep', 'Jobs');

    expect(lines[0].requestId).toBeUndefined();
    expect(lines[0].msg).toBe('scheduled sweep');
  });

  it('redacts credentials passed as metadata', () => {
    // Defence in depth: a caller logging a whole request or config object must
    // not leak an Authorization header or a token.
    const { lines, stream } = captureLogs();
    const logger = new StructuredLogger({ destination: stream });

    logger.error({ msg: 'upstream rejected', token: 'super-secret', password: 'hunter2' });

    expect(lines[0].token).toBe('[redacted]');
    expect(lines[0].password).toBe('[redacted]');
    expect(lines[0].msg).toBe('upstream rejected');
  });

  it('records the level for each severity', () => {
    const { lines, stream } = captureLogs();
    const logger = new StructuredLogger({ level: 'debug', destination: stream });

    logger.log('a');
    logger.warn('b');
    logger.error('c');
    logger.debug('d');

    expect(lines.map((line) => line.level)).toEqual([30, 40, 50, 20]);
  });
});
