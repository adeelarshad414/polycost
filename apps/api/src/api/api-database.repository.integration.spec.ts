import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ComparisonResult } from '../comparison/comparison.types.js';
import { NormalizedWorkloadSpec } from '../nws/nws.types.js';
import {
  APP_ROLE,
  CONTAINER_STARTUP_TIMEOUT_MS,
  MigratedPostgres,
  startMigratedPostgres,
} from '../testing/postgres-container.js';
import { ApiDatabaseRepository, DataRetentionWindows } from './api-database.repository.js';

/**
 * ApiDatabaseRepository against a migrated Postgres, connected as polycost_app
 * exactly like the running API (audit H-11). The unit spec checks the SQL it
 * sends; this checks the SQL works: constraints, transactions, the role's
 * grants, and that what is written reads back the same.
 */
describe('ApiDatabaseRepository (integration)', () => {
  let db: MigratedPostgres;
  let repository: ApiDatabaseRepository;

  beforeAll(async () => {
    db = await startMigratedPostgres();
    repository = new ApiDatabaseRepository(db.config(), db.secrets(APP_ROLE));
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await repository?.onModuleDestroy();
    await db?.stop();
  });

  // Shaped like a real hash; the column CHECK enforces the format.
  const PASSWORD_HASH = 'scrypt:v1:16384:8:1:c2FsdA:aGFzaA';
  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

  const nws: NormalizedWorkloadSpec = {
    schemaVersion: '1.0',
    metadata: { sourceType: 'structured_form', createdAt: '2026-10-01T00:00:00.000Z' },
    workload: { type: 'web_app', region: { isDefault: true } },
    compute: [{ role: 'web', scalingType: 'fixed' }],
    storage: [],
    database: [],
    network: { cdn: false, loadBalancer: false },
    availability: { multiAz: false, multiRegion: false },
  };

  const comparison = (): ComparisonResult => ({
    comparisonId: randomUUID(),
    pricingAsOf: '2026-10-01T00:00:00.000Z',
    cheapestProviderId: 'aws',
    providers: [
      {
        providerId: 'aws',
        totals: { daily: 2.4, weekly: 16.8, monthly: 73, quarterly: 219, yearly: 876 },
        lineItems: [
          {
            category: 'compute',
            description: 't3.medium',
            isApproximate: false,
            baseHourlyCostUsd: 0.1,
            baseMonthlyCostUsd: 73,
            skuId: 'aws-t3-medium',
            region: 'us-east-1',
          },
        ],
      },
    ],
  });

  let accountCounter = 0;
  const newAccount = async () => {
    accountCounter += 1;
    const email = `owner${accountCounter}-${randomUUID().slice(0, 8)}@example.com`;
    const account = await repository.createLocalAccountWithTeam({
      email,
      displayName: `Owner ${accountCounter}`,
      externalSubjectHash: sha256(email),
      passwordHash: PASSWORD_HASH,
      teamName: `Team ${accountCounter}`,
      teamSlug: `team-${accountCounter}-${randomUUID().slice(0, 8)}`,
    });
    return { ...account, teamId: account.defaultTeam!.teamId };
  };

  describe('comparisons and ownership (ADR-0001)', () => {
    it('saves a comparison with its audit log in one transaction and reads it back', async () => {
      const result = comparison();
      await repository.saveComparisonWithAuditLog(nws, result);

      const stored = await repository.getComparison(result.comparisonId);
      expect(stored?.resultSnapshot).toEqual(result);

      const audit = await db.admin.query<{ provider: string; monthly_cost_usd: string }>(
        'SELECT provider, monthly_cost_usd FROM comparison_audit_logs WHERE comparison_id = $1',
        [result.comparisonId],
      );
      expect(audit.rows).toEqual([{ provider: 'aws', monthly_cost_usd: '73.0000' }]);
    });

    it('rolls the comparison back when its audit log cannot be written', async () => {
      const result = comparison();
      // A negative cost, which the audit-log CHECK constraint rejects.
      result.providers[0].lineItems[0].baseMonthlyCostUsd = -1;

      await expect(repository.saveComparisonWithAuditLog(nws, result)).rejects.toThrow();
      expect(await repository.getComparison(result.comparisonId)).toBeUndefined();
    });

    it('stamps anonymous data with an expiry and leaves team data without one', async () => {
      const owner = await newAccount();
      const anonymous = comparison();
      const owned = comparison();
      await repository.saveComparison(nws, anonymous, undefined, null, sha256('edit-key'));
      await repository.saveComparison(nws, owned, undefined, owner.teamId);

      const anonymousDetails = await repository.getOwnershipDetails(
        'comparison',
        anonymous.comparisonId,
      );
      const days = (Date.parse(anonymousDetails!.expiresAt!) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);

      expect(await repository.getOwnershipDetails('comparison', owned.comparisonId)).toEqual({
        teamId: owner.teamId,
        teamName: expect.stringMatching(/^Team /),
        expiresAt: null,
      });
      expect(await repository.getResourceOwner('comparison', anonymous.comparisonId)).toEqual({
        teamId: null,
        writeKeyHash: sha256('edit-key'),
      });
    });

    it('claims an anonymous comparison into a team exactly once', async () => {
      const owner = await newAccount();
      const other = await newAccount();
      const result = comparison();
      await repository.saveComparisonWithAuditLog(nws, result, null, sha256('edit-key'));

      await expect(
        repository.claimResource('comparison', result.comparisonId, owner.teamId),
      ).resolves.toBe(true);
      await expect(
        repository.claimResource('comparison', result.comparisonId, other.teamId),
      ).resolves.toBe(false);

      expect(await repository.getResourceOwner('comparison', result.comparisonId)).toEqual({
        teamId: owner.teamId,
        writeKeyHash: null,
      });
      const listed = await repository.listTeamComparisons(owner.teamId, 10);
      expect(listed.map((row) => row.comparisonId)).toEqual([result.comparisonId]);
      expect(listed[0]).toMatchObject({ cheapestProviderId: 'aws', cheapestMonthlyUsd: 73 });
    });

    it('reads an expired anonymous comparison as missing', async () => {
      const result = comparison();
      await repository.saveComparison(nws, result);
      await db.admin.query(
        "UPDATE comparisons SET expires_at = now() - interval '1 minute' WHERE id = $1",
        [result.comparisonId],
      );

      expect(await repository.getResourceOwner('comparison', result.comparisonId)).toBeUndefined();
      expect(
        await repository.claimResource(
          'comparison',
          result.comparisonId,
          (await newAccount()).teamId,
        ),
      ).toBe(false);
    });
  });

  describe('accounts, sessions and invitations', () => {
    it('finds an account by its (normalised) email with its default team, and records lockouts', async () => {
      const owner = await newAccount();

      const found = await repository.findLocalAccountByEmail(owner.email);
      expect(found).toMatchObject({
        accountId: owner.accountId,
        status: 'active',
        passwordHash: PASSWORD_HASH,
        failedAttempts: 0,
        defaultTeam: { teamId: owner.teamId, role: 'owner' },
      });

      await repository.recordFailedLogin({
        accountId: owner.accountId,
        failedAttempts: 5,
        lockedUntil: '2099-01-01T00:00:00.000Z',
      });
      expect(await repository.findLocalAccountByEmail(owner.email)).toMatchObject({
        failedAttempts: 5,
        lockedUntil: '2099-01-01T00:00:00.000Z',
      });
    });

    it('resolves a live session, and not once it is revoked or expired', async () => {
      const owner = await newAccount();
      const now = new Date().toISOString();
      const live = await repository.createSession({
        accountId: owner.accountId,
        teamId: owner.teamId,
        tokenHash: sha256('live-session'),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
      await repository.createSession({
        accountId: owner.accountId,
        tokenHash: sha256('expired-session'),
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      });

      expect(await repository.resolveSession(sha256('live-session'), now)).toMatchObject({
        accountId: owner.accountId,
        teamId: owner.teamId,
        role: 'owner',
        sessionId: live.sessionId,
      });
      expect(await repository.resolveSession(sha256('expired-session'), now)).toBeUndefined();

      await repository.revokeSession(live.sessionId, now);
      expect(await repository.resolveSession(sha256('live-session'), now)).toBeUndefined();
    });

    it('accepts an invitation once and makes the invitee a member', async () => {
      const owner = await newAccount();
      const invitee = await newAccount();
      const now = new Date().toISOString();
      const invitation = await repository.createTeamInvitation({
        teamId: owner.teamId,
        email: invitee.email,
        role: 'member',
        tokenHash: sha256('invite-token'),
        invitedByAccountId: owner.accountId,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        audit: {
          actorAccountId: owner.accountId,
          action: 'team.invitation.created',
          targetType: 'invitation',
        },
      });

      const pending = await repository.findPendingInvitationByTokenHash(
        sha256('invite-token'),
        now,
      );
      expect(pending?.id).toBe(invitation.id);

      await repository.acceptTeamInvitation({
        invitationId: invitation.id,
        accountId: invitee.accountId,
        acceptedAt: now,
      });

      expect(await repository.getTeamRole(invitee.accountId, owner.teamId)).toBe('member');
      expect(
        await repository.findPendingInvitationByTokenHash(sha256('invite-token'), now),
      ).toBeUndefined();
      await expect(
        repository.acceptTeamInvitation({
          invitationId: invitation.id,
          accountId: invitee.accountId,
          acceptedAt: now,
        }),
      ).rejects.toThrow();
    });
  });

  describe('team domains (audit H-01)', () => {
    it('lets only one team hold a domain verified', async () => {
      const first = await newAccount();
      const second = await newAccount();
      const domain = `acme-${randomUUID().slice(0, 8)}.example`;

      const firstDomain = await repository.createTeamDomain({
        teamId: first.teamId,
        domain,
        verificationToken: 'token-1',
        createdByAccountId: first.accountId,
      });
      const secondDomain = await repository.createTeamDomain({
        teamId: second.teamId,
        domain,
        verificationToken: 'token-2',
        createdByAccountId: second.accountId,
      });

      expect(
        await repository.markTeamDomainVerified({
          teamId: first.teamId,
          domainId: firstDomain!.id,
          actorAccountId: first.accountId,
        }),
      ).toMatchObject({ status: 'verified', domain });
      expect(
        await repository.markTeamDomainVerified({
          teamId: second.teamId,
          domainId: secondDomain!.id,
          actorAccountId: second.accountId,
        }),
      ).toBe('taken');
      expect((await repository.listTeamDomains(second.teamId))[0].status).toBe('pending');
    });
  });

  describe('share links', () => {
    it('stores only the token hash and stops resolving a revoked link', async () => {
      const workload = await repository.createWorkload({
        instanceFamily: 'general-purpose',
        vcpu: 2,
        memoryGb: 4,
        region: 'us-east-1',
        instanceCount: 1,
        hoursPerMonth: 730,
        storageGb: 0,
        storageTier: 'standard',
        egressGbPerMonth: 0,
      });
      const tokenHash = sha256(`share-${randomUUID()}`);
      await repository.createShareLink({
        token: tokenHash,
        workloadId: workload.id,
        watermark: true,
        pricingModel: 'on-demand',
        granularity: 'monthly',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

      expect(await repository.getActiveShareLink(tokenHash)).toMatchObject({
        workloadId: workload.id,
        watermark: true,
      });
      await repository.revokeShareLink(tokenHash, new Date().toISOString());
      expect(await repository.getActiveShareLink(tokenHash)).toBeUndefined();
    });
  });

  describe('billing reconciliation (audit M-04)', () => {
    it('stores invoice lines exactly and keeps a null variance null', async () => {
      const owner = await newAccount();
      const result = comparison();
      await repository.saveComparison(nws, result, undefined, owner.teamId);
      const rows = Array.from({ length: 10 }, (_, index) => ({
        serviceName: 'AmazonEC2',
        costUsd: 0.1,
        lineItemHash: sha256(`line-${index}`),
      }));

      const imported = await repository.createBillingImport({
        importInput: {
          provider: 'aws',
          sourceType: 'normalized-csv',
          billingPeriodStart: '2026-09-01',
          billingPeriodEnd: '2026-09-30',
          rows,
        },
        originalFileSha256: sha256('invoice.csv'),
        teamId: owner.teamId,
        createdByAccountId: owner.accountId,
        rows,
      });
      const lines = await repository.listInvoiceLineItems(imported.importRun.id);
      expect(lines).toHaveLength(10);
      expect(lines.every((line) => line.costUsd === 0.1)).toBe(true);

      const saved = await repository.saveInvoiceReconciliation({
        importRunId: imported.importRun.id,
        comparisonId: result.comparisonId,
        provider: 'aws',
        estimatedTotalUsd: 0,
        invoicedTotalUsd: 1,
        varianceUsd: 1,
        variancePercent: null,
        status: 'unmatched',
        evidence: { note: 'no estimate' },
      });
      expect((await repository.getInvoiceReconciliation(saved.id))?.variancePercent).toBeNull();

      // Attaching evidence is an UPDATE the app role was missing until migration 048.
      const updated = await repository.updateInvoiceReconciliationEvidence({
        reconciliationId: saved.id,
        evidence: { note: 'no estimate', artifact: 'invoice.pdf' },
        expectedEvidenceHash: saved.evidenceHash,
      });
      expect(updated.evidence).toEqual({ note: 'no estimate', artifact: 'invoice.pdf' });
      await expect(
        repository.updateInvoiceReconciliationEvidence({
          reconciliationId: saved.id,
          evidence: { stale: true },
          expectedEvidenceHash: saved.evidenceHash,
        }),
      ).rejects.toThrow();
    });
  });

  describe('retention sweep', () => {
    const windows: DataRetentionWindows = {
      teamAuditEventDays: 365,
      auditExportDays: 30,
      comparisonAuditLogDays: 365,
      accountSessionDays: 30,
      exchangeRateDays: 90,
      pricingEtlRunDays: 90,
      anonymousGraceDays: 60,
    };
    const sweep = (mode: 'report-only' | 'delete-expired') =>
      repository.pruneExpiredData({
        now: new Date().toISOString(),
        mode,
        windows,
        maxRowsPerTable: 1_000,
      });

    it('stamps legacy anonymous rows, reports in report-only mode and deletes in delete-expired', async () => {
      const owner = await newAccount();
      const legacy = comparison();
      const expired = comparison();
      const owned = comparison();
      await repository.saveComparisonWithAuditLog(nws, legacy);
      await repository.saveComparisonWithAuditLog(nws, expired);
      await repository.saveComparison(nws, owned, undefined, owner.teamId);
      await db.admin.query('UPDATE comparisons SET expires_at = NULL WHERE id = $1', [
        legacy.comparisonId,
      ]);
      await db.admin.query(
        "UPDATE comparisons SET expires_at = now() - interval '1 day' WHERE id = $1",
        [expired.comparisonId],
      );

      const report = await sweep('report-only');
      const comparisonsRow = report.tables.find((row) => row.table === 'comparisons');
      expect(comparisonsRow?.stampedRows).toBeGreaterThanOrEqual(1);
      expect(comparisonsRow?.eligibleRows).toBeGreaterThanOrEqual(1);
      expect(report.totalDeletedRows).toBe(0);
      expect(
        (await repository.getOwnershipDetails('comparison', legacy.comparisonId))?.expiresAt,
      ).not.toBeNull();

      const deleted = await sweep('delete-expired');
      expect(deleted.tables.find((row) => row.table === 'comparisons')?.deletedRows).toBe(
        comparisonsRow?.eligibleRows,
      );
      expect(await repository.getComparison(expired.comparisonId)).toBeUndefined();
      expect(await repository.getComparison(legacy.comparisonId)).toBeDefined();
      expect(await repository.getComparison(owned.comparisonId)).toBeDefined();
      // The audit log went with its comparison (ON DELETE CASCADE).
      const orphaned = await db.admin.query(
        'SELECT 1 FROM comparison_audit_logs WHERE comparison_id = $1',
        [expired.comparisonId],
      );
      expect(orphaned.rowCount).toBe(0);
    });
  });
});
