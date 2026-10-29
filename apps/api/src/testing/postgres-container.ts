import { existsSync } from 'node:fs';
import path from 'node:path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/config.schema.js';
import type { SecretsReader } from '../secrets/secrets.service.js';

/**
 * A throwaway Postgres for the integration tier (audit H-11).
 *
 * The database is built exactly the way every real one is: the same image as
 * docker-compose, and the same migrator (docker/postgres/migrate.sh) the
 * initdb hook and the Helm Job run, over every file in database/migrations.
 * Repositories then connect as the least-privilege roles that migration 002
 * creates, so a missing GRANT fails here instead of in production.
 */

/** Same image as the compose `postgres` service. */
export const POSTGRES_IMAGE = 'postgres:16-alpine';

export const APP_ROLE = { user: 'polycost_app', password: 'integration-app-password' };
export const ETL_ROLE = { user: 'polycost_etl', password: 'integration-etl-password' };

const MIGRATIONS_IN_CONTAINER = '/polycost-migrations';
const MIGRATOR_IN_CONTAINER = '/polycost-postgres/migrate.sh';

/** Integration specs run from apps/api, like every other API test. */
export function repoRoot(): string {
  const root = path.resolve(process.cwd(), '../..');
  if (!existsSync(path.join(root, 'database/migrations'))) {
    throw new Error(`Run integration tests from apps/api (no database/migrations under ${root}).`);
  }
  return root;
}

export interface MigratorResult {
  exitCode: number;
  output: string;
}

export interface MigratedPostgres {
  container: StartedPostgreSqlContainer;
  /** Connection settings for a role, in the shape ConfigService + SecretsReader supply. */
  config(overrides?: Partial<AppConfig>): ConfigService<AppConfig, true>;
  secrets(role: typeof APP_ROLE): SecretsReader;
  /** A pool as the bootstrap superuser, for arranging and inspecting state. */
  admin: Pool;
  /** Runs the migrator again, optionally with extra environment. */
  migrate(env?: Record<string, string>): Promise<MigratorResult>;
  stop(): Promise<void>;
}

export async function startMigratedPostgres(): Promise<MigratedPostgres> {
  const root = repoRoot();
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('polycost_integration')
    .withCopyDirectoriesToContainer([
      { source: path.join(root, 'database/migrations'), target: MIGRATIONS_IN_CONTAINER },
    ])
    .withCopyFilesToContainer([
      { source: path.join(root, 'docker/postgres/migrate.sh'), target: MIGRATOR_IN_CONTAINER },
    ])
    .start();

  const migrate = async (env: Record<string, string> = {}): Promise<MigratorResult> => {
    const result = await container.exec(['sh', MIGRATOR_IN_CONTAINER], {
      env: {
        PGUSER: container.getUsername(),
        PGPASSWORD: container.getPassword(),
        PGDATABASE: container.getDatabase(),
        APP_DB_PASSWORD: APP_ROLE.password,
        ETL_DB_PASSWORD: ETL_ROLE.password,
        MIGRATIONS_DIR: MIGRATIONS_IN_CONTAINER,
        ...env,
      },
    });
    return { exitCode: result.exitCode, output: result.output };
  };

  const first = await migrate();
  if (first.exitCode !== 0) {
    await container.stop();
    throw new Error(`Migrations failed on a fresh database:\n${first.output}`);
  }

  const admin = new Pool({ connectionString: container.getConnectionUri(), max: 2 });

  const config = (overrides: Partial<AppConfig> = {}) => {
    const values: Partial<AppConfig> = {
      DB_HOST: container.getHost(),
      DB_PORT: container.getPort(),
      DB_NAME: container.getDatabase(),
      DB_POOL_MAX: 2,
      ...overrides,
    };
    return {
      get: (key: keyof AppConfig) => values[key],
    } as unknown as ConfigService<AppConfig, true>;
  };

  // polycost/db holds username/password for the app and etl_username/etl_password for the ETL.
  const secrets = (role: typeof APP_ROLE): SecretsReader => ({
    getSecret: async (_path: string, key: string) =>
      key.endsWith('username') ? role.user : role.password,
  });

  return {
    container,
    config,
    secrets,
    admin,
    migrate,
    stop: async () => {
      await admin.end();
      await container.stop();
    },
  };
}

/** Starting a container and applying ~50 migrations takes a while on a cold cache. */
export const CONTAINER_STARTUP_TIMEOUT_MS = 180_000;
