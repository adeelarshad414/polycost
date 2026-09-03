/**
 * Circuit breaker for outbound provider calls.
 *
 * Live pricing refresh runs on the synchronous user request path. With a
 * provider that is down, each request pays LIVE_PRICING_MAX_ATTEMPTS retries
 * multiplied by PROVIDER_HTTP_TIMEOUT_MS - up to three minutes per reference
 * group - and the existing cache only stores successes, so nothing remembers
 * the failure. Every subsequent request pays it again in full.
 *
 * The breaker gives failure a memory. Once a provider has failed repeatedly it
 * is skipped outright until a cooldown expires, so the comparison degrades to
 * cached pricing in milliseconds instead of hanging.
 *
 *   closed     calls pass through; consecutive failures are counted
 *   open       calls are rejected immediately, no request is made
 *   half-open  after the cooldown, exactly one probe is allowed through
 *
 * A success in half-open closes the circuit and clears the count. A failure
 * re-opens it and restarts the cooldown, so a provider that is still broken is
 * probed at most once per cooldown rather than on every request.
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export class CircuitOpenError extends Error {
  constructor(
    readonly key: string,
    readonly retryAfterMs: number,
  ) {
    super(
      `circuit for ${key} is open after repeated failures; retrying in ${Math.ceil(retryAfterMs / 1000)}s`,
    );
    this.name = 'CircuitOpenError';
  }
}

export interface CircuitBreakerOptions {
  /** Consecutive failures required to open the circuit. */
  failureThreshold?: number;
  /** How long the circuit stays open before a probe is allowed. */
  cooldownMs?: number;
  /** Injected in tests so cooldowns do not need real waiting. */
  now?: () => number;
  onStateChange?: (key: string, state: CircuitState) => void;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;
  private currentState: CircuitState = 'closed';

  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(
    readonly key: string,
    private readonly options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.now = options.now ?? (() => Date.now());
  }

  get state(): CircuitState {
    // Resolved on read rather than by a timer: a timer would keep the process
    // alive and fire for providers nothing is calling any more.
    if (this.currentState === 'open' && this.now() - this.openedAt >= this.cooldownMs) {
      this.transition('half_open');
    }

    return this.currentState;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const state = this.state;

    if (state === 'open') {
      throw new CircuitOpenError(this.key, this.cooldownMs - (this.now() - this.openedAt));
    }

    if (state === 'half_open') {
      // Exactly one probe. Without this, a burst of concurrent requests would
      // all be released at the moment the cooldown expires and hammer a
      // provider that may still be down.
      if (this.probeInFlight) {
        throw new CircuitOpenError(this.key, this.cooldownMs);
      }
      this.probeInFlight = true;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      this.probeInFlight = false;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.currentState !== 'closed') {
      this.transition('closed');
    }
  }

  private onFailure(): void {
    this.failures += 1;

    // A failed probe re-opens immediately rather than waiting to accumulate
    // another full threshold: the provider has just told us it is still down.
    if (this.currentState === 'half_open' || this.failures >= this.failureThreshold) {
      this.openedAt = this.now();
      this.transition('open');
    }
  }

  private transition(state: CircuitState): void {
    if (this.currentState === state) {
      return;
    }

    this.currentState = state;
    this.options.onStateChange?.(this.key, state);
  }
}

/**
 * One breaker per key, created on demand.
 *
 * Keys are provider ids, a closed set, so this cannot grow without bound.
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly options: CircuitBreakerOptions = {}) {}

  get(key: string): CircuitBreaker {
    let breaker = this.breakers.get(key);

    if (!breaker) {
      breaker = new CircuitBreaker(key, this.options);
      this.breakers.set(key, breaker);
    }

    return breaker;
  }

  states(): Record<string, CircuitState> {
    return Object.fromEntries([...this.breakers].map(([key, breaker]) => [key, breaker.state]));
  }
}
