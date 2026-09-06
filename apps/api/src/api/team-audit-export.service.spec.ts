import { describe, it, expect, jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { ApiDatabaseRepository, TeamAuditExportClaimRecord } from './api-database.repository.js';
import { TeamAuditExportService } from './team-audit-export.service.js';

// Matches the alias the sibling delivery specs declare; the service takes this
// shape, and typing the double against it means a signature change breaks here.
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const ranAt = new Date('2026-07-08T00:00:00.000Z');
const auditExportRecord: TeamAuditExportClaimRecord = {
  exportId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  auditEventId: '99999999-9999-4999-8999-999999999999',
  destination: 'webhook',
  status: 'processing',
  attempts: 1,
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
  auditEvent: {
    id: '99999999-9999-4999-8999-999999999999',
    teamId: '22222222-2222-4222-8222-222222222222',
    actorAccountId: '11111111-1111-4111-8111-111111111111',
    actorEmail: 'architect@example.com',
    action: 'team.invitation.created',
    targetType: 'invitation',
    targetId: '88888888-8888-4888-8888-888888888888',
    metadata: {
      email: 'finops@example.com',
      role: 'member',
      status: 'pending',
    },
    createdAt: '2026-07-08T00:00:00.000Z',
  },
};

describe('TeamAuditExportService', () => {
  it('skips export when audit webhook mode is disabled', async () => {
    const repository = repositoryMock();
    const fetcher = jest.fn<FetchLike>();
    const service = new TeamAuditExportService(
      configService({
        AUTH_AUDIT_EXPORT_MODE: 'disabled',
      }),
      repository as unknown as ApiDatabaseRepository,
      fetcher,
      () => ranAt,
    );

    await expect(service.flushPendingExports()).resolves.toEqual({
      status: 'skipped',
      claimed: 0,
      delivered: 0,
      failed: 0,
      deadLettered: 0,
      ranAt: ranAt.toISOString(),
      reason: 'audit export webhook mode is disabled',
    });
    expect(repository.claimPendingTeamAuditExports).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends signed audit events and marks delivered exports', async () => {
    const repository = repositoryMock({
      claimPendingTeamAuditExports: jest.fn<ApiDatabaseRepository['claimPendingTeamAuditExports']>(
        async () => [auditExportRecord],
      ),
    });
    const fetcher = jest.fn(async () => ({ ok: true, status: 202 }) as Response);
    const service = new TeamAuditExportService(
      configService(),
      repository as unknown as ApiDatabaseRepository,
      fetcher,
      () => ranAt,
    );

    await expect(service.flushPendingExports()).resolves.toEqual({
      status: 'success',
      claimed: 1,
      delivered: 1,
      failed: 0,
      deadLettered: 0,
      ranAt: ranAt.toISOString(),
    });

    expect(repository.claimPendingTeamAuditExports).toHaveBeenCalledWith({
      now: ranAt.toISOString(),
      limit: 50,
      maxAttempts: 5,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = String(request.body);
    const signature = createHmac('sha256', 'production-audit-export-secret')
      .update(body)
      .digest('hex');

    expect(url).toBe('https://siem.example.com/polycost/audit-events');
    expect(request.headers).toEqual(
      expect.objectContaining({
        'content-type': 'application/json',
        'user-agent': 'polycost-audit-export/1.0',
        'x-polycost-event': 'team_audit_event.recorded',
        'x-polycost-audit-export-id': auditExportRecord.exportId,
        'x-polycost-signature-sha256': signature,
      }),
    );
    expect(JSON.parse(body)).toEqual({
      event: 'team_audit_event.recorded',
      exportId: auditExportRecord.exportId,
      auditEvent: auditExportRecord.auditEvent,
    });
    expect(repository.markTeamAuditExportDelivered).toHaveBeenCalledWith({
      exportId: auditExportRecord.exportId,
      deliveredAt: ranAt.toISOString(),
    });
    expect(repository.markTeamAuditExportFailed).not.toHaveBeenCalled();
  });

  it('retries failed exports and counts dead-lettered rows', async () => {
    const repository = repositoryMock({
      claimPendingTeamAuditExports: jest.fn<ApiDatabaseRepository['claimPendingTeamAuditExports']>(
        async () => [
          {
            ...auditExportRecord,
            attempts: 5,
          },
        ],
      ),
      markTeamAuditExportFailed: jest.fn<ApiDatabaseRepository['markTeamAuditExportFailed']>(
        async () => 'failed',
      ),
    });
    const fetcher = jest.fn(async () => ({ ok: false, status: 503 }) as Response);
    const service = new TeamAuditExportService(
      configService(),
      repository as unknown as ApiDatabaseRepository,
      fetcher,
      () => ranAt,
    );

    await expect(service.flushPendingExports()).resolves.toEqual({
      status: 'success',
      claimed: 1,
      delivered: 0,
      failed: 1,
      deadLettered: 1,
      ranAt: ranAt.toISOString(),
    });
    expect(repository.markTeamAuditExportFailed).toHaveBeenCalledWith({
      exportId: auditExportRecord.exportId,
      error: 'Audit export webhook returned HTTP 503.',
      nextAttemptAt: '2026-07-08T00:32:00.000Z',
      maxAttempts: 5,
    });
  });
});

function repositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    claimPendingTeamAuditExports: jest.fn<ApiDatabaseRepository['claimPendingTeamAuditExports']>(
      async () => [],
    ),
    markTeamAuditExportDelivered: jest.fn<ApiDatabaseRepository['markTeamAuditExportDelivered']>(
      async () => undefined,
    ),
    markTeamAuditExportFailed: jest.fn<ApiDatabaseRepository['markTeamAuditExportFailed']>(
      async () => 'pending',
    ),
    ...overrides,
  };
}

function configService(overrides: Partial<AppConfig> = {}): ConfigService<AppConfig, true> {
  const values: Partial<AppConfig> = {
    AUTH_AUDIT_EXPORT_MODE: 'webhook',
    AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'https://siem.example.com/polycost/audit-events',
    AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: 'production-audit-export-secret',
    AUTH_AUDIT_EXPORT_BATCH_SIZE: 50,
    AUTH_AUDIT_EXPORT_MAX_ATTEMPTS: 5,
    ...overrides,
  };

  return {
    get: jest.fn<ConfigService['get']>((key: keyof AppConfig) => {
      switch (key) {
        case 'AUTH_AUDIT_EXPORT_MODE':
          return values.AUTH_AUDIT_EXPORT_MODE;
        case 'AUTH_AUDIT_EXPORT_WEBHOOK_URL':
          return values.AUTH_AUDIT_EXPORT_WEBHOOK_URL;
        case 'AUTH_AUDIT_EXPORT_WEBHOOK_SECRET':
          return values.AUTH_AUDIT_EXPORT_WEBHOOK_SECRET;
        case 'AUTH_AUDIT_EXPORT_BATCH_SIZE':
          return values.AUTH_AUDIT_EXPORT_BATCH_SIZE;
        case 'AUTH_AUDIT_EXPORT_MAX_ATTEMPTS':
          return values.AUTH_AUDIT_EXPORT_MAX_ATTEMPTS;
        default:
          return undefined;
      }
    }),
  } as unknown as ConfigService<AppConfig, true>;
}
