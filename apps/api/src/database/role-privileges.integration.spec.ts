import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  APP_ROLE,
  CONTAINER_STARTUP_TIMEOUT_MS,
  ETL_ROLE,
  MigratedPostgres,
  startMigratedPostgres,
} from '../testing/postgres-container.js';

type Privilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Every table a repository writes, and the privilege that needs, checked
 * against the grants the migrations actually leave behind (audit H-11).
 *
 * The unit tests mock the pool, so a missing GRANT was invisible until a
 * request failed in production with "permission denied". This found four:
 * claiming an anonymous comparison, the retention sweep (stamp and delete) and
 * reconciliation evidence updates all ran as polycost_app without the
 * privilege they needed (fixed in migration 048).
 */
const REPOSITORIES: Array<{ file: string; role: string; dynamic: Array<[string, Privilege]> }> = [
  {
    file: 'api/api-database.repository.ts',
    role: APP_ROLE.user,
    // Statements that build the table name at run time, which the scan below
    // cannot see. Keep in step with claimResource and pruneExpiredData.
    dynamic: [
      ['comparisons', 'UPDATE'],
      ['workloads', 'UPDATE'],
      ['comparisons', 'DELETE'],
      ['workloads', 'DELETE'],
      ['team_audit_event_exports', 'DELETE'],
      ['comparison_audit_logs', 'DELETE'],
      ['account_sessions', 'DELETE'],
      ['exchange_rates', 'DELETE'],
      ['pricing_etl_runs', 'DELETE'],
      ['team_audit_events', 'DELETE'],
    ],
  },
  { file: 'pricing-models/pricing-rates.repository.ts', role: APP_ROLE.user, dynamic: [] },
  { file: 'diagram-parser/diagram-import.repository.ts', role: APP_ROLE.user, dynamic: [] },
  { file: 'database/pricing-catalog.repository.ts', role: ETL_ROLE.user, dynamic: [] },
];

/** Table privileges implied by the SQL in one source file. */
export function requiredPrivileges(source: string): Array<[string, Privilege]> {
  const required: Array<[string, Privilege]> = [];
  // Each SQL statement in these files is one template literal.
  for (const [, sql] of source.matchAll(/`([^`]*)`/g)) {
    for (const [, table] of sql.matchAll(/\bINSERT\s+INTO\s+([a-z_]+)/gi)) {
      required.push([table, 'INSERT']);
      if (/\bON\s+CONFLICT\b[\s\S]*\bDO\s+UPDATE\b/i.test(sql)) {
        required.push([table, 'UPDATE']);
      }
    }
    for (const [, table] of sql.matchAll(/^\s*UPDATE\s+([a-z_]+)\s/gim)) {
      required.push([table, 'UPDATE']);
    }
    for (const [, table] of sql.matchAll(/\bDELETE\s+FROM\s+([a-z_]+)/gi)) {
      required.push([table, 'DELETE']);
    }
    for (const [, table] of sql.matchAll(/\bFROM\s+([a-z_]+)\b/gi)) {
      required.push([table, 'SELECT']);
    }
    // Row locks need UPDATE on the locked table.
    const locked = /\bFROM\s+([a-z_]+)\b[\s\S]*\bFOR\s+(NO\s+KEY\s+)?UPDATE\b/i.exec(sql);
    if (locked) {
      required.push([locked[1], 'UPDATE']);
    }
  }
  return required;
}

describe('database role privileges (integration)', () => {
  let db: MigratedPostgres;

  beforeAll(async () => {
    db = await startMigratedPostgres();
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await db?.stop();
  });

  it.each(REPOSITORIES)(
    '$role holds every privilege $file needs',
    async ({ file, role, dynamic }) => {
      const source = readFileSync(path.join(process.cwd(), 'src', file), 'utf8');
      const tables = new Set(
        (
          await db.admin.query<{ tablename: string }>(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
          )
        ).rows.map((row) => row.tablename),
      );
      const required = [...requiredPrivileges(source), ...dynamic]
        // `FROM` also matches words in comments and CTE names; only real tables count.
        .filter(([table]) => tables.has(table))
        .map(([table, privilege]) => `${table}:${privilege}`);

      const missing: string[] = [];
      for (const entry of new Set(required)) {
        const [table, privilege] = entry.split(':');
        const result = await db.admin.query<{ granted: boolean }>(
          'SELECT has_table_privilege($1, $2, $3) AS granted',
          [role, `public.${table}`, privilege],
        );
        if (!result.rows[0].granted) {
          missing.push(entry);
        }
      }

      expect(missing.sort()).toEqual([]);
    },
  );

  it('reads the SQL shapes it is meant to', () => {
    const sample = [
      '`INSERT INTO a (x) VALUES (1) ON CONFLICT (x) DO UPDATE SET x = 2`',
      '`UPDATE b SET x = 1`',
      '`DELETE FROM c WHERE x = 1`',
      '`SELECT x FROM d WHERE y = 1 FOR UPDATE`',
    ].join('\n');

    expect(requiredPrivileges(sample)).toEqual([
      ['a', 'INSERT'],
      ['a', 'UPDATE'],
      ['b', 'UPDATE'],
      ['c', 'DELETE'],
      ['c', 'SELECT'],
      ['d', 'SELECT'],
      ['d', 'UPDATE'],
    ]);
  });
});
