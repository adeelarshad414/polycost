import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiDatabaseRepository,
  TeamAuditExportClaimRecord,
  TeamAuditExportStatus,
} from './api-database.repository.js';
import { AppConfig } from '../config/config.schema.js';
import { TeamAuditEventRecord } from './auth.types.js';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type NowProvider = () => Date;
export const TEAM_AUDIT_EXPORT_FETCH = Symbol('TEAM_AUDIT_EXPORT_FETCH');
export const TEAM_AUDIT_EXPORT_NOW = Symbol('TEAM_AUDIT_EXPORT_NOW');

export interface TeamAuditExportSummary {
  status: 'skipped' | 'success';
  claimed: number;
  delivered: number;
  failed: number;
  deadLettered: number;
  ranAt: string;
  reason?: string;
}

interface TeamAuditWebhookPayload {
  event: 'team_audit_event.recorded';
  exportId: string;
  auditEvent: TeamAuditEventRecord;
}

@Injectable()
export class TeamAuditExportService {
  private readonly logger = new Logger(TeamAuditExportService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly repository: ApiDatabaseRepository,
    @Optional()
    @Inject(TEAM_AUDIT_EXPORT_FETCH)
    private readonly fetcher: FetchLike = (input, init) => fetch(input, init),
    @Optional()
    @Inject(TEAM_AUDIT_EXPORT_NOW)
    private readonly nowProvider: NowProvider = () => new Date(),
  ) {}

  async flushPendingExports(): Promise<TeamAuditExportSummary> {
    const ranAt = this.nowProvider().toISOString();
    const mode = this.configService.get('AUTH_AUDIT_EXPORT_MODE', { infer: true });

    if (mode !== 'webhook') {
      return {
        status: 'skipped',
        claimed: 0,
        delivered: 0,
        failed: 0,
        deadLettered: 0,
        ranAt,
        reason: 'audit export webhook mode is disabled',
      };
    }

    const webhookUrl = this.configService.get('AUTH_AUDIT_EXPORT_WEBHOOK_URL', { infer: true });
    const webhookSecret = this.configService.get('AUTH_AUDIT_EXPORT_WEBHOOK_SECRET', {
      infer: true,
    });

    if (!webhookUrl || !webhookSecret) {
      return {
        status: 'skipped',
        claimed: 0,
        delivered: 0,
        failed: 0,
        deadLettered: 0,
        ranAt,
        reason: 'audit export webhook URL or signing secret is missing',
      };
    }

    const maxAttempts = this.configService.get('AUTH_AUDIT_EXPORT_MAX_ATTEMPTS', {
      infer: true,
    });
    const batchSize = this.configService.get('AUTH_AUDIT_EXPORT_BATCH_SIZE', { infer: true });
    const claimedExports = await this.repository.claimPendingTeamAuditExports({
      now: ranAt,
      limit: batchSize,
      maxAttempts,
    });
    let delivered = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const exportRecord of claimedExports) {
      const status = await this.deliverExport({
        exportRecord,
        webhookUrl,
        webhookSecret,
        ranAt,
        maxAttempts,
      });

      if (status === 'delivered') {
        delivered += 1;
      } else if (status === 'failed') {
        failed += 1;
        deadLettered += 1;
      } else {
        failed += 1;
      }
    }

    if (claimedExports.length > 0) {
      this.logger.log(
        `Audit export flushed ${delivered}/${claimedExports.length} events; ${deadLettered} dead-lettered`,
      );
    }

    return {
      status: 'success',
      claimed: claimedExports.length,
      delivered,
      failed,
      deadLettered,
      ranAt,
    };
  }

  private async deliverExport(input: {
    exportRecord: TeamAuditExportClaimRecord;
    webhookUrl: string;
    webhookSecret: string;
    ranAt: string;
    maxAttempts: number;
  }): Promise<TeamAuditExportStatus> {
    const body = JSON.stringify({
      event: 'team_audit_event.recorded',
      exportId: input.exportRecord.exportId,
      auditEvent: input.exportRecord.auditEvent,
    } satisfies TeamAuditWebhookPayload);
    const signature = createHmac('sha256', input.webhookSecret).update(body).digest('hex');

    try {
      const response = await this.fetcher(input.webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'polycost-audit-export/1.0',
          'x-polycost-event': 'team_audit_event.recorded',
          'x-polycost-audit-export-id': input.exportRecord.exportId,
          'x-polycost-signature-sha256': signature,
        },
        body,
      });

      if (response.ok) {
        await this.repository.markTeamAuditExportDelivered({
          exportId: input.exportRecord.exportId,
          deliveredAt: input.ranAt,
        });

        return 'delivered';
      }

      return await this.markFailed(
        input.exportRecord,
        `Audit export webhook returned HTTP ${response.status}.`,
        input.maxAttempts,
      );
    } catch {
      return this.markFailed(
        input.exportRecord,
        'Audit export webhook request failed.',
        input.maxAttempts,
      );
    }
  }

  private async markFailed(
    exportRecord: TeamAuditExportClaimRecord,
    error: string,
    maxAttempts: number,
  ): Promise<TeamAuditExportStatus> {
    const nextAttemptAt = this.nextAttemptAt(exportRecord.attempts).toISOString();
    const status = await this.repository.markTeamAuditExportFailed({
      exportId: exportRecord.exportId,
      error,
      nextAttemptAt,
      maxAttempts,
    });

    return status ?? 'failed';
  }

  private nextAttemptAt(attempts: number): Date {
    const delayMinutes = Math.min(60, 2 ** Math.min(Math.max(attempts, 1), 6));
    return new Date(this.nowProvider().getTime() + delayMinutes * 60_000);
  }
}
