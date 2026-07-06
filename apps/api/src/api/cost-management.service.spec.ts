import { ApiNotFoundError, ApiUnauthorizedError } from './api-errors';
import { CostManagementService } from './cost-management.service';
import { ShareLinkRecord, WorkloadCostBreakdown, WorkloadRecord } from './cost-management.types';

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
    const service = new CostManagementService(repositoryMock() as never);

    await expect(service.getSharedReport(shareLink.token)).resolves.toEqual({
      token: shareLink.token,
      watermark: true,
      expiresAt: shareLink.expiresAt,
      pricingModel: 'reserved-3yr',
      granularity: 'yearly',
      passwordProtected: false,
      workload,
      breakdown,
    });
  });

  it('enforces password-protected shared reports and revokes active tokens', async () => {
    const protectedShareLink: ShareLinkRecord = {
      ...shareLink,
      passwordHash: 'b7a8c8e152719b77eae7427ed619b63293589940c877c3a2122e4b642307cc29',
    };
    const repository = repositoryMock({
      getActiveShareLink: jest.fn(async () => protectedShareLink),
      revokeShareLink: jest.fn(async () => protectedShareLink),
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

  it('fails clearly for missing workloads and expired share links', async () => {
    const repository = repositoryMock({
      getWorkload: jest.fn(async () => undefined),
      getActiveShareLink: jest.fn(async () => undefined),
    });
    const service = new CostManagementService(repository as never);

    await expect(
      service.createBudget({
        workloadId: workload.id,
        thresholdUsd: 500,
      }),
    ).rejects.toThrow(ApiNotFoundError);
    await expect(service.getSharedReport(shareLink.token)).rejects.toThrow(ApiNotFoundError);
  });
});

function repositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    createWorkload: jest.fn(async () => workload),
    getWorkload: jest.fn(async () => workload),
    compareCachedPricing: jest.fn(async () => []),
    getWorkloadCostBreakdown: jest.fn(async () => breakdown),
    createBudget: jest.fn(),
    listAlerts: jest.fn(),
    updateAlertDismissed: jest.fn(),
    createShareLink: jest.fn(async () => shareLink),
    getActiveShareLink: jest.fn(async () => shareLink),
    revokeShareLink: jest.fn(async () => shareLink),
    getExchangeRates: jest.fn(),
    ...overrides,
  };
}
