import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { ProviderId } from '../adapters/common/cloud-provider-adapter';
import { ComparisonResult } from '../comparison/comparison.types';
import { AppConfig } from '../config/config.schema';
import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { SecretsReader, SecretsService } from '../secrets/secrets.service';
import { PricingStatusResponse } from './api-errors';

interface QueryResultLike<T> {
  rows: T[];
  rowCount: number | null;
}

export interface PgPoolLike {
  query<T = unknown>(text: string, values?: unknown[]): Promise<QueryResultLike<T>>;
  end(): Promise<void>;
}

interface PgPoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export type PgPoolFactory = (config: PgPoolConfig) => PgPoolLike;

export interface ComparisonSnapshot {
  nwsSnapshot: NormalizedWorkloadSpec;
  resultSnapshot: ComparisonResult;
}

interface ComparisonSnapshotRow {
  nws_snapshot: NormalizedWorkloadSpec;
  result_snapshot: ComparisonResult;
}

interface PricingStatusRow {
  provider: ProviderId;
  status: 'success' | 'partial' | 'failed';
  last_successful_run: Date | null;
}

const PROVIDERS: ProviderId[] = ['aws', 'azure', 'gcp'];

const defaultPgPoolFactory: PgPoolFactory = (config) => new Pool(config);

@Injectable()
export class ApiDatabaseRepository implements OnModuleDestroy {
  private pool?: PgPoolLike;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    @Inject(SecretsService)
    private readonly secretsReader: SecretsReader,
    private readonly poolFactory: PgPoolFactory = defaultPgPoolFactory,
  ) {}

  async saveComparison(
    nwsSnapshot: NormalizedWorkloadSpec,
    resultSnapshot: ComparisonResult,
  ): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        INSERT INTO comparisons (
          id,
          nws_snapshot,
          result_snapshot,
          pricing_as_of
        )
        VALUES ($1, $2::jsonb, $3::jsonb, $4)
      `,
      [
        resultSnapshot.comparisonId,
        JSON.stringify(nwsSnapshot),
        JSON.stringify(resultSnapshot),
        resultSnapshot.pricingAsOf,
      ],
    );
  }

  async getComparison(comparisonId: string): Promise<ComparisonSnapshot | undefined> {
    const result = await (
      await this.getPool()
    ).query<ComparisonSnapshotRow>(
      `
        SELECT nws_snapshot,
               result_snapshot
        FROM comparisons
        WHERE id = $1
      `,
      [comparisonId],
    );

    const row = result.rows[0];

    return row
      ? {
          nwsSnapshot: row.nws_snapshot,
          resultSnapshot: row.result_snapshot,
        }
      : undefined;
  }

  async getPricingStatus(): Promise<PricingStatusResponse> {
    const result = await (
      await this.getPool()
    ).query<PricingStatusRow>(
      `
        WITH latest AS (
          SELECT DISTINCT ON (provider)
                 provider,
                 status
          FROM pricing_etl_runs
          ORDER BY provider, started_at DESC
        ),
        successful AS (
          SELECT provider,
                 MAX(completed_at) AS last_successful_run
          FROM pricing_etl_runs
          WHERE status = 'success'
          GROUP BY provider
        )
        SELECT latest.provider,
               latest.status,
               successful.last_successful_run
        FROM latest
        LEFT JOIN successful
          ON successful.provider = latest.provider
      `,
    );
    const byProvider = new Map(result.rows.map((row) => [row.provider, row]));

    return {
      providers: PROVIDERS.map((providerId) => {
        const row = byProvider.get(providerId);

        return {
          providerId,
          status: row?.status ?? 'failed',
          ...(row?.last_successful_run
            ? { lastSuccessfulRun: row.last_successful_run.toISOString() }
            : {}),
        };
      }),
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  private async getPool(): Promise<PgPoolLike> {
    if (!this.pool) {
      this.pool = this.poolFactory({
        host: this.configService.get('DB_HOST', { infer: true }),
        port: this.configService.get('DB_PORT', { infer: true }),
        database: this.configService.get('DB_NAME', { infer: true }),
        user: await this.secretsReader.getSecret('polycost/db', 'username'),
        password: await this.secretsReader.getSecret('polycost/db', 'password'),
      });
    }

    return this.pool;
  }
}
