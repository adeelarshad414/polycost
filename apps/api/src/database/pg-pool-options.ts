import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/config.schema.js';

/**
 * Connection-pool settings shared by every Postgres pool (audit M-06).
 *
 * Each repository used to build `new Pool({ host, port, database, user,
 * password })` with node-postgres defaults: 10 connections per pool, no
 * timeouts and no TLS. With four pools per process and two replicas that is 80
 * connections the database never agreed to, and a stuck query holds one
 * forever. These options cap the pool, bound every query server-side, and turn
 * on TLS when the database requires it.
 */
export type PgPoolName = 'api' | 'pricing_catalog' | 'pricing_rates' | 'diagram_import';

export interface PgPoolTuning {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  /** Server-side limit per statement, sent as a startup parameter. */
  statement_timeout: number;
  /** Shows up in pg_stat_activity, so a slow query names its pool. */
  application_name: string;
  ssl?: false | { rejectUnauthorized: boolean; ca?: string };
}

export function pgPoolTuning(
  configService: Pick<ConfigService<AppConfig, true>, 'get'>,
  pool: PgPoolName,
): PgPoolTuning {
  const get = <K extends keyof AppConfig>(key: K, fallback: AppConfig[K]): AppConfig[K] =>
    (configService.get(key, { infer: true }) as AppConfig[K] | undefined) ?? fallback;

  // The ETL pool runs bulk upserts and the catalog prune, which legitimately
  // take longer than a request-path query.
  const statementTimeout =
    pool === 'pricing_catalog'
      ? get('DB_ETL_STATEMENT_TIMEOUT_MS', 300_000)
      : get('DB_STATEMENT_TIMEOUT_MS', 30_000);

  return {
    max: get('DB_POOL_MAX', 5),
    idleTimeoutMillis: get('DB_POOL_IDLE_TIMEOUT_MS', 30_000),
    connectionTimeoutMillis: get('DB_CONNECTION_TIMEOUT_MS', 5_000),
    statement_timeout: statementTimeout,
    application_name: `polycost-${pool}`,
    ...sslOptions(get('DB_SSL_MODE', 'disable'), get('DB_SSL_CA', undefined)),
  };
}

function sslOptions(
  mode: AppConfig['DB_SSL_MODE'],
  ca: string | undefined,
): Pick<PgPoolTuning, 'ssl'> {
  switch (mode) {
    case 'require':
      // Encrypted, but the server certificate is not verified (libpq's
      // sslmode=require). Use verify-full wherever a CA bundle is available.
      return { ssl: { rejectUnauthorized: false } };
    case 'verify-full':
      return { ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } };
    default:
      return {};
  }
}
