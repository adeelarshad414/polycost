import { describe, it, expect, jest } from '@jest/globals';
import { CircuitBreaker, CircuitBreakerRegistry, CircuitOpenError } from './circuit-breaker.js';

function clock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

const fail = () => Promise.reject(new Error('provider down'));
const succeed = () => Promise.resolve('ok');

async function driveToOpen(breaker: CircuitBreaker, times = 3) {
  for (let i = 0; i < times; i += 1) {
    await expect(breaker.execute(fail)).rejects.toThrow('provider down');
  }
}

describe('CircuitBreaker', () => {
  it('passes calls through while closed', async () => {
    const breaker = new CircuitBreaker('aws');

    await expect(breaker.execute(succeed)).resolves.toBe('ok');
    expect(breaker.state).toBe('closed');
  });

  it('stays closed below the failure threshold', async () => {
    const breaker = new CircuitBreaker('aws', { failureThreshold: 3 });

    await driveToOpen(breaker, 2);

    expect(breaker.state).toBe('closed');
  });

  it('opens on the threshold failure', async () => {
    const breaker = new CircuitBreaker('aws', { failureThreshold: 3 });

    await driveToOpen(breaker, 3);

    expect(breaker.state).toBe('open');
  });

  it('rejects without calling the provider once open', async () => {
    const breaker = new CircuitBreaker('aws', { failureThreshold: 1 });
    await driveToOpen(breaker, 1);

    const operation = jest.fn(succeed);
    await expect(breaker.execute(operation)).rejects.toThrow(CircuitOpenError);

    // The whole point: no request is made, so a dead provider costs
    // milliseconds instead of retries times timeout.
    expect(operation).not.toHaveBeenCalled();
  });

  it('reports how long until the next probe', async () => {
    const time = clock();
    const breaker = new CircuitBreaker('aws', {
      failureThreshold: 1,
      cooldownMs: 30_000,
      now: time.now,
    });
    await driveToOpen(breaker, 1);
    time.advance(10_000);

    await expect(breaker.execute(succeed)).rejects.toThrow(/retrying in 20s/);
  });

  it('resets consecutive failures on a success', async () => {
    const breaker = new CircuitBreaker('aws', { failureThreshold: 3 });

    await driveToOpen(breaker, 2);
    await breaker.execute(succeed);
    await driveToOpen(breaker, 2);

    // Without the reset, intermittent failures spread over hours would
    // eventually trip the breaker on a healthy provider.
    expect(breaker.state).toBe('closed');
  });

  it('moves to half-open once the cooldown expires', async () => {
    const time = clock();
    const breaker = new CircuitBreaker('aws', {
      failureThreshold: 1,
      cooldownMs: 30_000,
      now: time.now,
    });
    await driveToOpen(breaker, 1);

    expect(breaker.state).toBe('open');
    time.advance(30_000);
    expect(breaker.state).toBe('half_open');
  });

  it('closes again when the probe succeeds', async () => {
    const time = clock();
    const breaker = new CircuitBreaker('aws', {
      failureThreshold: 1,
      cooldownMs: 1_000,
      now: time.now,
    });
    await driveToOpen(breaker, 1);
    time.advance(1_000);

    await expect(breaker.execute(succeed)).resolves.toBe('ok');
    expect(breaker.state).toBe('closed');
  });

  it('re-opens immediately when the probe fails', async () => {
    const time = clock();
    const breaker = new CircuitBreaker('aws', {
      failureThreshold: 5,
      cooldownMs: 1_000,
      now: time.now,
    });
    await driveToOpen(breaker, 5);
    time.advance(1_000);
    expect(breaker.state).toBe('half_open');

    await expect(breaker.execute(fail)).rejects.toThrow('provider down');

    // Not "one more failure toward the threshold" - the provider just said it
    // is still broken, so waiting for four more would let requests through.
    expect(breaker.state).toBe('open');
  });

  it('restarts the cooldown after a failed probe', async () => {
    const time = clock();
    const breaker = new CircuitBreaker('aws', {
      failureThreshold: 1,
      cooldownMs: 1_000,
      now: time.now,
    });
    await driveToOpen(breaker, 1);
    time.advance(1_000);
    await expect(breaker.execute(fail)).rejects.toThrow('provider down');

    time.advance(999);
    expect(breaker.state).toBe('open');
    time.advance(1);
    expect(breaker.state).toBe('half_open');
  });

  it('lets only one probe through at a time', async () => {
    const time = clock();
    const breaker = new CircuitBreaker('aws', {
      failureThreshold: 1,
      cooldownMs: 1_000,
      now: time.now,
    });
    await driveToOpen(breaker, 1);
    time.advance(1_000);

    let release: (value: string) => void = () => {};
    const slow = () => new Promise<string>((resolve) => (release = resolve));

    const probe = breaker.execute(slow);
    // A burst arriving the moment the cooldown expires must not all be
    // released onto a provider that may still be down.
    await expect(breaker.execute(succeed)).rejects.toThrow(CircuitOpenError);

    release('ok');
    await expect(probe).resolves.toBe('ok');
  });

  it('propagates the original error rather than masking it', async () => {
    const breaker = new CircuitBreaker('aws', { failureThreshold: 5 });

    await expect(breaker.execute(() => Promise.reject(new TypeError('bad json')))).rejects.toThrow(
      TypeError,
    );
  });

  it('reports state transitions', async () => {
    const time = clock();
    const onStateChange = jest.fn();
    const breaker = new CircuitBreaker('aws', {
      failureThreshold: 1,
      cooldownMs: 1_000,
      now: time.now,
      onStateChange,
    });

    await driveToOpen(breaker, 1);
    time.advance(1_000);
    void breaker.state;
    await breaker.execute(succeed);

    expect(onStateChange.mock.calls.map(([, state]) => state)).toEqual([
      'open',
      'half_open',
      'closed',
    ]);
  });
});

describe('CircuitBreakerRegistry', () => {
  it('keeps one breaker per key', () => {
    const registry = new CircuitBreakerRegistry();

    expect(registry.get('aws')).toBe(registry.get('aws'));
    expect(registry.get('aws')).not.toBe(registry.get('gcp'));
  });

  it('isolates providers from each other', async () => {
    const registry = new CircuitBreakerRegistry({ failureThreshold: 1 });

    await expect(registry.get('aws').execute(fail)).rejects.toThrow('provider down');

    // One broken provider must not stop comparisons against the others.
    expect(registry.get('aws').state).toBe('open');
    expect(registry.get('gcp').state).toBe('closed');
  });

  it('exposes current states for metrics', async () => {
    const registry = new CircuitBreakerRegistry({ failureThreshold: 1 });
    await expect(registry.get('aws').execute(fail)).rejects.toThrow();
    registry.get('gcp');

    expect(registry.states()).toEqual({ aws: 'open', gcp: 'closed' });
  });
});
