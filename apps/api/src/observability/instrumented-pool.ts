import { DomainMetricsService } from './domain-metrics.service';

interface QueryResultLike<T> {
  rows: T[];
  rowCount: number | null;
}

interface QueryRunner {
  query<T = unknown>(text: string, values?: unknown[]): Promise<QueryResultLike<T>>;
}

/**
 * The common shape of the four pool interfaces the repositories declare
 * independently. They are structurally compatible; this is the intersection the
 * wrapper needs.
 */
export interface InstrumentablePool extends QueryRunner {
  end(): Promise<void>;
  connect?(): Promise<QueryRunner & { release(): void }>;
}

const KNOWN_OPERATIONS = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'with',
  'begin',
  'commit',
  'rollback',
  'create',
  'alter',
  'drop',
]);

/**
 * Reduces a statement to its leading keyword.
 *
 * The SQL text itself must never become a label - it is effectively unbounded
 * and would embed query fragments into an unauthenticated endpoint. A closed
 * set of verbs keeps this at a dozen values, with anything unrecognised folded
 * into 'other'.
 */
export function queryOperation(sql: string): string {
  const firstWord = sql.trim().replace(/^\(+/, '').split(/\s+/, 1)[0]?.toLowerCase() ?? '';

  return KNOWN_OPERATIONS.has(firstWord) ? firstWord : 'other';
}

/**
 * Wraps a pg Pool so every statement is timed and counted.
 *
 * Implemented as a Proxy rather than a hand-written delegate so that properties
 * the wrapper does not know about - pg's own totalCount/idleCount/waitingCount,
 * event emitter methods - keep working untouched.
 *
 * connect() is wrapped too: the API repository runs transactions through a
 * checked-out client, and those statements would otherwise go uncounted.
 */
export function instrumentPool<P extends InstrumentablePool>(
  pool: P,
  metrics: DomainMetricsService,
  poolName: string,
): P {
  const timedQuery = async <T>(
    runner: QueryRunner,
    text: string,
    values?: unknown[],
  ): Promise<QueryResultLike<T>> => {
    const startedAt = process.hrtime.bigint();
    let outcome: 'success' | 'failure' = 'failure';

    try {
      const result = await runner.query<T>(text, values);
      outcome = 'success';
      return result;
    } finally {
      metrics.recordDbQuery({
        pool: poolName,
        operation: queryOperation(text),
        outcome,
        durationSeconds: Number(process.hrtime.bigint() - startedAt) / 1e9,
      });
    }
  };

  return new Proxy(pool, {
    get(target, property, receiver) {
      if (property === 'query') {
        return <T>(text: string, values?: unknown[]) =>
          timedQuery<T>(target as QueryRunner, text, values);
      }

      if (property === 'connect' && typeof target.connect === 'function') {
        return async () => {
          const client = await target.connect!();

          return new Proxy(client, {
            get(clientTarget, clientProperty) {
              if (clientProperty === 'query') {
                return <T>(text: string, values?: unknown[]) =>
                  timedQuery<T>(clientTarget, text, values);
              }

              const value = Reflect.get(clientTarget, clientProperty) as unknown;
              return typeof value === 'function' ? value.bind(clientTarget) : value;
            },
          });
        };
      }

      const value = Reflect.get(target, property, receiver) as unknown;
      // Bound to the pool: pg's methods rely on their own `this`, which the
      // Proxy would otherwise replace with the handler's receiver.
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
