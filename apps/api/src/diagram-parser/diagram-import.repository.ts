import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { AppConfig } from '../config/config.schema';
import { SecretsReader, SecretsService } from '../secrets/secrets.service';
import { DiagramImportRecordInput } from './diagram-parser.types';

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

const defaultPgPoolFactory: PgPoolFactory = (config) => new Pool(config);

@Injectable()
export class DiagramImportRepository implements OnModuleDestroy {
  private pool?: PgPoolLike;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    @Inject(SecretsService)
    private readonly secretsReader: SecretsReader,
    private readonly poolFactory: PgPoolFactory = defaultPgPoolFactory,
  ) {}

  async save(input: DiagramImportRecordInput): Promise<boolean> {
    await (
      await this.getPool()
    ).query(
      `
        INSERT INTO diagram_imports (
          id,
          format,
          file_name,
          mime_type,
          size_bytes,
          sha256,
          temp_file_ref,
          parser_confidence,
          unresolved_count,
          ignored_count,
          graph_snapshot,
          nws_snapshot,
          expires_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11::jsonb,
          $12::jsonb,
          COALESCE($13::timestamptz, now() + interval '24 hours')
        )
      `,
      [
        input.importId,
        input.format,
        input.fileName ?? null,
        input.mimeType ?? null,
        input.sizeBytes,
        input.sha256,
        input.tempFileRef ?? null,
        input.parserConfidence,
        input.unresolvedCount,
        input.ignoredCount,
        JSON.stringify(input.graph),
        JSON.stringify(input.draftNws),
        input.expiresAt ?? null,
      ],
    );

    return true;
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
