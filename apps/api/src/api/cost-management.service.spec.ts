import { describe, it, expect, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { ApiNotFoundError, ApiUnauthorizedError } from './api-errors.js';
import { CostManagementService } from './cost-management.service.js';
import {
  ShareLinkAnalyticsResponse,
  ShareLinkRecord,
  WorkloadCostBreakdown,
  WorkloadRecord,
} from './cost-management.types.js';
import type { ApiDatabaseRepository } from './api-database.repository.js';

const workload: WorkloadRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  instanceFamily: 'general-purpose',
  vcpu: 4,
  memoryGb: 16,
  region: 'us-east',
  instanceCount: 2,
  hoursPerMonth: 730,
  storageGb: 500,
  storageTier: 'standard',
  egressGbPerMonth: 1200,
  createdAt: '2026-06-29T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z',
};

const breakdown: WorkloadCostBreakdown = {
  workloadId: workload.id,
  term: 'on_demand',
  providers: [],
};

const shareLink: ShareLinkRecord = {
  token: 'test-share-token-123456789012',
  workloadId: workload.id,
  watermark: true,
  pricingModel: 'reserved-3yr',
  granularity: 'yearly',
  expiresAt: '2026-07-30T00:00:00.000Z',
  createdAt: '2026-06-30T00:00:00.000Z',
};

const analytics: ShareLinkAnalyticsResponse = {
  token: shareLink.token,
  totalViews: 2,
  lastViewedAt: '2026-07-01T00:00:00.000Z',
  countryViews: [
    {
      countryCode: 'US',
      views: 2,
    },
  ],
  sectionViews: [
    {
      section: 'summary',
      views: 2,
      lastViewedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
};

describe('CostManagementService', () => {
  it('creates scoped share links with generated tokens and TTLs', async () => {
    const repository = repositoryMock();
    const service = new CostManagementService(
      repository as never,
      () => new Date('2026-06-30T00:00:00.000Z'),
      () => shareLink.token,
    );

    await expect(
      service.createShareLink({
        workloadId: workload.id,
        watermark: true,
        expiresInDays: 30,
        pricingModel: 'reserved-3yr',
        granularity: 'yearly',
        password: 'client-demo',
      }),
    ).resolves.toEqual({
      token: shareLink.token,
      url: `/api/v1/share/${shareLink.token}`,
    });
    expect(repository.getWorkload).toHaveBeenCalledWith(workload.id);
    expect(repository.createShareLink).toHaveBeenCalledWith({
      token: shareLink.token,
      workloadId: workload.id,
      watermark: true,
      pricingModel: 'reserved-3yr',
      granularity: 'yearly',
      passwordHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAt: '2026-07-30T00:00:00.000Z',
    });
  });

  it('returns read-only shared reports scoped to an active token', async () => {
    const repository = repositoryMock();
    const service = new CostManagementService(
      repository as never,
      () => new Date('2026-07-01T00:00:00.000Z'),
    );

    await expect(
      service.getSharedReport(shareLink.token, undefined, {
        countryCode: 'us',
        section: 'Executive Summary',
        userAgent: 'jest',
      }),
    ).resolves.toEqual({
      token: shareLink.token,
      watermark: true,
      expiresAt: shareLink.expiresAt,
      pricingModel: 'reserved-3yr',
      granularity: 'yearly',
      passwordProtected: false,
      workload,
      breakdown,
    });
    expect(repository.recordShareLinkEvent).toHaveBeenCalledWith({
      token: shareLink.token,
      countryCode: 'US',
      section: 'executive-summary',
      userAgentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      viewedAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('enforces password-protected shared reports and revokes active tokens', async () => {
    const protectedShareLink: ShareLinkRecord = {
      ...shareLink,
      passwordHash: hashedPassword('client-demo'),
    };
    const repository = repositoryMock({
      getActiveShareLink: jest.fn<ApiDatabaseRepository['getActiveShareLink']>(
        async () => protectedShareLink,
      ),
      revokeShareLink: jest.fn<ApiDatabaseRepository['revokeShareLink']>(
        async () => protectedShareLink,
      ),
    });
    const service = new CostManagementService(repository as never);

    await expect(service.getSharedReport(shareLink.token)).rejects.toThrow(ApiUnauthorizedError);
    await expect(service.getSharedReport(shareLink.token, 'client-demo')).resolves.toEqual(
      expect.objectContaining({
        passwordProtected: true,
        pricingModel: 'reserved-3yr',
        granularity: 'yearly',
      }),
    );
    await expect(service.revokeShareLink(shareLink.token)).resolves.toEqual({
      token: shareLink.token,
      url: `/api/v1/share/${shareLink.token}`,
    });
    expect(repository.revokeShareLink).toHaveBeenCalledWith(shareLink.token, expect.any(String));
  });

  it('returns aggregate share-link analytics by token', async () => {
    const service = new CostManagementService(repositoryMock() as never);

    await expect(service.getShareLinkAnalytics(shareLink.token)).resolves.toEqual(analytics);
  });

  it('fails clearly for missing workloads and expired share links', async () => {
    const repository = repositoryMock({
      getWorkload: jest.fn<ApiDatabaseRepository['getWorkload']>(async () => undefined),
      getActiveShareLink: jest.fn<ApiDatabaseRepository['getActiveShareLink']>(
        async () => undefined,
      ),
      getShareLinkAnalytics: jest.fn<ApiDatabaseRepository['getShareLinkAnalytics']>(
        async () => undefined,
      ),
    });
    const service = new CostManagementService(repository as never);

    await expect(
      service.createBudget({
        workloadId: workload.id,
        thresholdUsd: 500,
      }),
    ).rejects.toThrow(ApiNotFoundError);
    await expect(service.getSharedReport(shareLink.token)).rejects.toThrow(ApiNotFoundError);
    await expect(service.getShareLinkAnalytics(shareLink.token)).rejects.toThrow(ApiNotFoundError);
  });
});

function repositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    createWorkload: jest.fn<ApiDatabaseRepository['createWorkload']>(async () => workload),
    getWorkload: jest.fn<ApiDatabaseRepository['getWorkload']>(async () => workload),
    compareCachedPricing: jest.fn<ApiDatabaseRepository['compareCachedPricing']>(async () => []),
    getWorkloadCostBreakdown: jest.fn<ApiDatabaseRepository['getWorkloadCostBreakdown']>(
      async () => breakdown,
    ),
    createBudget: jest.fn<ApiDatabaseRepository['createBudget']>(),
    listAlerts: jest.fn<ApiDatabaseRepository['listAlerts']>(),
    updateAlertDismissed: jest.fn<ApiDatabaseRepository['updateAlertDismissed']>(),
    createShareLink: jest.fn<ApiDatabaseRepository['createShareLink']>(async () => shareLink),
    getActiveShareLink: jest.fn<ApiDatabaseRepository['getActiveShareLink']>(async () => shareLink),
    recordShareLinkEvent: jest.fn<ApiDatabaseRepository['recordShareLinkEvent']>(
      async () => undefined,
    ),
    getShareLinkAnalytics: jest.fn<ApiDatabaseRepository['getShareLinkAnalytics']>(
      async () => analytics,
    ),
    revokeShareLink: jest.fn<ApiDatabaseRepository['revokeShareLink']>(async () => shareLink),
    getExchangeRates: jest.fn<ApiDatabaseRepository['getExchangeRates']>(),
    ...overrides,
  };
}

function hashedPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}
