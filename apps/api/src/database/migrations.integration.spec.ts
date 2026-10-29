import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Pool } from 'pg';
import {
  APP_ROLE,
  CONTAINER_STARTUP_TIMEOUT_MS,
  ETL_ROLE,
  MigratedPostgres,
  repoRoot,
  startMigratedPostgres,
} from '../testing/postgres-container.js';

/**
 * The migrator and every migration, against a real Postgres (audit H-11).
 * `db:validate` only lints file names and lock-safety; this proves the files
 * apply, in order, on an empty database, and that the migrator's guarantees
 * (idempotence, checksums) hold.
 */
describe('database migrations (integration)', () => {
  let db: MigratedPostgres;

  beforeAll(async () => {
    db = await startMigratedPostgres();
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await db?.stop();
  });

  const migrationVersions = () =>
    readdirSync(path.join(repoRoot(), 'database/migrations'))
      .filter((file) => /^\d{3}_.+\.sql$/.test(file))
      .map((file) => file.slice(0, 3))
      .sort();

  it('applies every migration on an empty database and records each with a checksum', async () => {
    const applied = await db.admin.query<{ version: string; checksum: string | null }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version',
    );

    expect(applied.rows.map((row) => row.version)).toEqual(migrationVersions());
    expect(applied.rows.filter((row) => !/^[0-9a-f]{64}$/.test(row.checksum ?? ''))).toEqual([]);
  });

  it('is a no-op the second time, and a dry run finds nothing pending', async () => {
    const again = await db.migrate();
    expect(again.exitCode).toBe(0);
    expect(again.output).not.toContain('applying');

    const dryRun = await db.migrate({ MIGRATE_DRY_RUN: '1' });
    expect(dryRun.exitCode).toBe(0);
    expect(dryRun.output).not.toContain('pending ');
    expect(dryRun.output).toContain('dry run complete');
  });

  it('refuses to run when an applied migration was edited afterwards', async () => {
    const [{ checksum }] = (
      await db.admin.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE version = '047'",
      )
    ).rows;
    await db.admin.query("UPDATE schema_migrations SET checksum = 'edited' WHERE version = '047'");
    try {
      const result = await db.migrate();
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('047_reconciliation_variance_nullable.sql changed after');
    } finally {
      await db.admin.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2', [
        checksum,
        '047',
      ]);
    }
  });

  it('creates the least-privilege roles, and neither can change the schema', async () => {
    for (const [role, table] of [
      [APP_ROLE, 'comparisons'],
      [ETL_ROLE, 'pricing_catalog'],
    ] as const) {
      const pool = new Pool({
        host: db.container.getHost(),
        port: db.container.getPort(),
        database: db.container.getDatabase(),
        user: role.user,
        password: role.password,
        max: 1,
      });
      try {
        await expect(pool.query(`SELECT 1 FROM ${table} LIMIT 1`)).resolves.toBeDefined();
        await expect(pool.query('CREATE TABLE intruder (id int)')).rejects.toThrow(
          /permission denied/,
        );
      } finally {
        await pool.end();
      }
    }
  });

  it('leaves the columns the code relies on in the shape it expects', async () => {
    const columns = await db.admin.query<{
      table_name: string;
      column_name: string;
      is_nullable: 'YES' | 'NO';
      data_type: string;
    }>(
      `SELECT table_name, column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name, column_name) IN (
           ('invoice_reconciliation_results', 'variance_percent'),
           ('comparisons', 'expires_at'),
           ('comparisons', 'team_id'),
           ('comparisons', 'write_key_hash'),
           ('team_domains', 'status'),
           ('account_sessions', 'expires_at')
         )
       ORDER BY table_name, column_name`,
    );
    const shape = Object.fromEntries(
      columns.rows.map((row) => [
        `${row.table_name}.${row.column_name}`,
        `${row.data_type}${row.is_nullable === 'YES' ? ' null' : ''}`,
      ]),
    );

    expect(shape).toEqual({
      // 047 (M-04): no variance against a $0 estimate.
      'invoice_reconciliation_results.variance_percent': 'numeric null',
      // 045 (P2-1c) and 042 (UTC timestamps).
      'comparisons.expires_at': 'timestamp with time zone null',
      'comparisons.team_id': 'uuid null',
      'comparisons.write_key_hash': 'text null',
      'team_domains.status': expect.any(String),
      'account_sessions.expires_at': 'timestamp with time zone',
    });
  });
});
