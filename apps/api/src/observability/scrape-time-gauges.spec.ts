import { describe, it, expect, jest } from '@jest/globals';
import { DomainMetricsService } from './domain-metrics.service.js';
import { MetricsService } from './metrics.service.js';
import { InstrumentablePool, instrumentPool, queryOperation } from './instrumented-pool.js';
import { registerQueueDepth } from './queue-depth.js';

function build() {
  const metrics = new MetricsService({ collectDefaults: false });
  return { domain: new DomainMetricsService(metrics), render: () => metrics.render() };
}

function samples(text: string, metric: string): string[] {
  return text.split('\n').filter((line) => line.startsWith(`${metric}{`));
}

const okResult = { rows: [], rowCount: 0 };

// Typed explicitly: inferring from `async () => okResult` would narrow the
// query signature to zero arguments and stop the wrapper's generic matching.
function fakePool(overrides: Partial<InstrumentablePool> = {}): InstrumentablePool {
  return {
    query: async () => okResult,
    end: async () => {},
    ...overrides,
  };
}

describe('queryOperation', () => {
  it.each([
    ['SELECT * FROM pricing_rates', 'select'],
    ['  insert into audit_events values ($1)', 'insert'],
    ['UPDATE teams SET name = $1', 'update'],
    ['DELETE FROM sessions', 'delete'],
    ['WITH latest AS (SELECT 1) SELECT * FROM latest', 'with'],
    ['BEGIN', 'begin'],
    ['(SELECT 1)', 'select'],
  ])('reduces %s to %s', (sql, expected) => {
    expect(queryOperation(sql)).toBe(expected);
  });

  it('folds anything unrecognised into a single bucket', () => {
    expect(queryOperation('VACUUM ANALYZE')).toBe('other');
    expect(queryOperation('')).toBe('other');
  });

  it('never returns the statement text', () => {
    // The SQL is unbounded and would embed query fragments into an
    // unauthenticated /metrics.
    expect(queryOperation("SELECT * FROM accounts WHERE email = 'a@b.c'")).toBe('select');
  });
});

describe('instrumentPool', () => {
  it('times and counts a successful query', async () => {
    const { domain, render } = build();
    const pool = instrumentPool(fakePool(), domain, 'api');

    await pool.query('SELECT 1');

    const rendered = await render();
    expect(rendered).toContain(
      'db_queries_total{pool="api",operation="select",outcome="success"} 1',
    );
    expect(rendered).toContain('db_query_duration_seconds_count{pool="api",operation="select"} 1');
  });

  it('counts a failed query and still rethrows', async () => {
    const { domain, render } = build();
    const pool = instrumentPool(
      fakePool({
        query: async () => {
          throw new Error('deadlock detected');
        },
      }),
      domain,
      'api',
    );

    await expect(pool.query('UPDATE teams SET name = $1')).rejects.toThrow('deadlock detected');

    expect(await render()).toContain(
      'db_queries_total{pool="api",operation="update",outcome="failure"} 1',
    );
  });

  it('passes query arguments through untouched', async () => {
    const { domain } = build();
    const query = jest.fn<(text: string, values?: unknown[]) => Promise<typeof okResult>>(
      async () => okResult,
    );
    const pool = instrumentPool(fakePool({ query }), domain, 'api');

    await pool.query('SELECT $1', ['value']);

    expect(query).toHaveBeenCalledWith('SELECT $1', ['value']);
  });

  it('returns the underlying result', async () => {
    const { domain } = build();
    const rows = [{ id: 1 }];
    const pool = instrumentPool(
      // Generic to satisfy query<T>; the wrapper must return the row set it was
      // given, not a copy.
      fakePool({ query: async <T>() => ({ rows: rows as T[], rowCount: 1 }) }),
      domain,
      'api',
    );

    await expect(pool.query('SELECT 1')).resolves.toEqual({ rows, rowCount: 1 });
  });

  it('measures statements run through a checked-out transaction client', async () => {
    const { domain, render } = build();
    const clientQuery = jest.fn(async () => okResult);
    const release = jest.fn();
    const pool = instrumentPool(
      fakePool({ connect: async () => ({ query: clientQuery, release }) }),
      domain,
      'api',
    );

    const client = await pool.connect!();
    await client.query('BEGIN');
    await client.query('INSERT INTO audit_events VALUES ($1)', ['x']);
    client.release();

    // Transactions run on a client, not the pool; without wrapping connect()
    // every write in a transaction would go uncounted.
    const rendered = await render();
    expect(rendered).toContain(
      'db_queries_total{pool="api",operation="begin",outcome="success"} 1',
    );
    expect(rendered).toContain(
      'db_queries_total{pool="api",operation="insert",outcome="success"} 1',
    );
    expect(release).toHaveBeenCalled();
  });

  it('leaves unrelated pool properties reachable', async () => {
    const { domain } = build();
    const end = jest.fn(async () => {});
    const pool = instrumentPool(Object.assign(fakePool({ end }), { totalCount: 7 }), domain, 'api');

    // A hand-written delegate would drop pg's own pool statistics.
    expect((pool as unknown as { totalCount: number }).totalCount).toBe(7);
    await pool.end();
    expect(end).toHaveBeenCalled();
  });

  it('keeps series bounded per pool regardless of statement count', async () => {
    const { domain, render } = build();
    const pool = instrumentPool(fakePool(), domain, 'api');

    for (let i = 0; i < 50; i += 1) {
      await pool.query(`SELECT * FROM pricing_rates WHERE sku_id = 'sku-${i}'`);
    }

    const rendered = await render();
    expect(samples(rendered, 'db_queries_total')).toHaveLength(1);
    expect(rendered).not.toContain('sku-42');
  });
});

describe('dependency probes', () => {
  it('reports a reachable dependency as up, with its latency', async () => {
    const { domain, render } = build();

    domain.recordDependencyProbe({ dependency: 'db', up: true, latencySeconds: 0.004 });

    const rendered = await render();
    expect(rendered).toContain('dependency_up{dependency="db"} 1');
    expect(rendered).toContain('dependency_probe_duration_seconds_count{dependency="db"} 1');
  });

  it('reports an unreachable dependency as down', async () => {
    const { domain, render } = build();

    domain.recordDependencyProbe({ dependency: 'cache', up: false });

    const rendered = await render();
    expect(rendered).toContain('dependency_up{dependency="cache"} 0');
    // No latency to record when the connection never completed.
    expect(samples(rendered, 'dependency_probe_duration_seconds_count')).toHaveLength(0);
  });

  it('overwrites rather than accumulates, so the gauge shows current state', async () => {
    const { domain, render } = build();

    domain.recordDependencyProbe({ dependency: 'db', up: false });
    domain.recordDependencyProbe({ dependency: 'db', up: true, latencySeconds: 0.002 });

    expect(await render()).toContain('dependency_up{dependency="db"} 1');
  });
});

describe('queue depth', () => {
  it('samples the queue at scrape time', async () => {
    const { domain, render } = build();
    const getJobCounts = jest.fn(async () => ({
      waiting: 3,
      active: 1,
      delayed: 0,
      failed: 2,
    }));
    registerQueueDepth(domain, 'pricing-etl', { getJobCounts });

    const rendered = await render();

    expect(rendered).toContain('job_queue_depth{queue="pricing-etl",state="waiting"} 3');
    expect(rendered).toContain('job_queue_depth{queue="pricing-etl",state="failed"} 2');
    // Read on scrape, not on enqueue.
    expect(getJobCounts).toHaveBeenCalled();
  });

  it('re-reads the queue on every scrape', async () => {
    const { domain, render } = build();
    let waiting = 1;
    registerQueueDepth(domain, 'pricing-etl', {
      getJobCounts: async () => ({ waiting, active: 0, delayed: 0, failed: 0 }),
    });

    expect(await render()).toContain('job_queue_depth{queue="pricing-etl",state="waiting"} 1');
    waiting = 9;
    expect(await render()).toContain('job_queue_depth{queue="pricing-etl",state="waiting"} 9');
  });

  it('does not fail the scrape when the queue is unreachable', async () => {
    const { domain, render } = build();
    registerQueueDepth(domain, 'pricing-etl', {
      getJobCounts: async () => {
        throw new Error('ECONNREFUSED');
      },
    });

    // Redis being down is exactly when the rest of /metrics is most wanted.
    const rendered = await render();
    expect(rendered).toContain('http_requests_total');
    expect(samples(rendered, 'job_queue_depth')).toHaveLength(0);
  });

  it('drops the previous sample when a later read fails, rather than reporting stale depth', async () => {
    const { domain, render } = build();
    let healthy = true;
    registerQueueDepth(domain, 'pricing-etl', {
      getJobCounts: async () => {
        if (!healthy) {
          throw new Error('ECONNREFUSED');
        }
        return { waiting: 5, active: 0, delayed: 0, failed: 0 };
      },
    });

    expect(await render()).toContain('job_queue_depth{queue="pricing-etl",state="waiting"} 5');
    healthy = false;

    // A stale 5 would read as a healthy queue on a dashboard; absent is honest.
    expect(samples(await render(), 'job_queue_depth')).toHaveLength(0);
  });

  it('does not hang the scrape when the queue read never settles', async () => {
    const { domain, render } = build();
    registerQueueDepth(domain, 'pricing-etl', {
      // The real failure mode. ioredis retries a lost connection indefinitely
      // rather than rejecting, so a Redis outage produces a promise that never
      // settles - which hung /metrics entirely until the read was bounded.
      getJobCounts: () => new Promise(() => {}),
    });

    const rendered = await render();

    expect(rendered).toContain('http_requests_total');
    expect(samples(rendered, 'job_queue_depth')).toHaveLength(0);
  }, 10_000);

  it('bounds the scrape when several queues are unreachable at once', async () => {
    const { domain, render } = build();
    for (const queue of ['pricing-etl', 'cost-management', 'third']) {
      registerQueueDepth(domain, queue, { getJobCounts: () => new Promise(() => {}) });
    }

    // Read concurrently, so three dead queues cost one timeout, not three.
    const startedAt = Date.now();
    await render();

    expect(Date.now() - startedAt).toBeLessThan(2_500);
  }, 10_000);

  it('recovers once the queue answers again', async () => {
    const { domain, render } = build();
    let reachable = false;
    registerQueueDepth(domain, 'pricing-etl', {
      getJobCounts: async () => {
        if (!reachable) {
          throw new Error('ECONNREFUSED');
        }
        return { waiting: 4, active: 0, delayed: 0, failed: 0 };
      },
    });

    expect(samples(await render(), 'job_queue_depth')).toHaveLength(0);
    reachable = true;

    expect(await render()).toContain('job_queue_depth{queue="pricing-etl",state="waiting"} 4');
  });

  it('skips a queue whose driver cannot report counts', async () => {
    const { domain, render } = build();
    registerQueueDepth(domain, 'pricing-etl', {});

    // An unreadable queue must not be indistinguishable from an empty one.
    expect(samples(await render(), 'job_queue_depth')).toHaveLength(0);
  });

  it('tracks several queues independently', async () => {
    const { domain, render } = build();
    registerQueueDepth(domain, 'pricing-etl', {
      getJobCounts: async () => ({ waiting: 2, active: 0, delayed: 0, failed: 0 }),
    });
    registerQueueDepth(domain, 'cost-management', {
      getJobCounts: async () => ({ waiting: 7, active: 0, delayed: 0, failed: 0 }),
    });

    const rendered = await render();
    expect(rendered).toContain('job_queue_depth{queue="pricing-etl",state="waiting"} 2');
    expect(rendered).toContain('job_queue_depth{queue="cost-management",state="waiting"} 7');
  });
});
