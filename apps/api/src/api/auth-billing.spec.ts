import { ConfigService } from '@nestjs/config';
import { ComparisonResult } from '../comparison/comparison.types';
import { AppConfig } from '../config/config.schema';
import { ApiForbiddenError, ApiUnauthorizedError } from './api-errors';
import { ApiDatabaseRepository, LocalAccountWithPassword } from './api-database.repository';
import { AuthService } from './auth.service';
import { AuthIdentity } from './auth.types';
import { BillingService } from './billing.service';

const account: LocalAccountWithPassword = {
  accountId: '11111111-1111-4111-8111-111111111111',
  email: 'architect@example.com',
  displayName: 'Architect',
  status: 'active',
  passwordHash:
    'scrypt:v1:16384:8:1:YXJjaGl0ZWN0LXNhbHQ:td9vzKxxq6s6gQ5rObkzT7Hd49DPw_WBqJXarDD_K_c',
  failedAttempts: 0,
  defaultTeam: {
    teamId: '22222222-2222-4222-8222-222222222222',
    teamName: 'Architecture team',
    role: 'owner',
  },
};

const identity: AuthIdentity = {
  accountId: account.accountId,
  email: account.email,
  displayName: account.displayName,
  teamId: account.defaultTeam?.teamId,
  role: 'owner',
  sessionId: '33333333-3333-4333-8333-333333333333',
  expiresAt: '2026-07-07T00:00:00.000Z',
};

const comparisonResult: ComparisonResult = {
  comparisonId: '44444444-4444-4444-8444-444444444444',
  pricingAsOf: '2026-07-06T00:00:00.000Z',
  cheapestProviderId: 'aws',
  providers: [
    {
      providerId: 'aws',
      lineItems: [
        {
          category: 'compute',
          description: 'web compute',
          baseMonthlyCostUsd: 100,
          isApproximate: false,
          skuId: 'sku-compute',
          pricingTrace: {
            providerId: 'aws',
            serviceCategory: 'compute',
            source: 'pricing_rates',
            sourceRecordKey: 'aws:sku-compute:us-east-1:on-demand',
            sourceSkuId: 'sku-compute',
            isApproximate: false,
            isEstimate: false,
          },
        },
      ],
      totals: {
        daily: 3.29,
        weekly: 23.01,
        monthly: 100,
        quarterly: 300,
        yearly: 1200,
      },
    },
  ],
};

describe('AuthService', () => {
  it('registers a local account and returns a bearer token without storing raw secrets', async () => {
    const repository = repositoryMock();
    repository.findLocalAccountByEmail.mockResolvedValue(undefined);
    repository.createLocalAccountWithTeam.mockImplementation(async (input) => ({
      ...account,
      email: input.email,
      passwordHash: input.passwordHash,
      defaultTeam: {
        teamId: account.defaultTeam!.teamId,
        teamName: input.teamName,
        role: 'owner',
      },
    }));
    repository.createSession.mockResolvedValue({
      sessionId: identity.sessionId,
      expiresAt: identity.expiresAt,
    });
    const service = new AuthService(repository as never, configService());

    const session = await service.register(
      {
        email: 'Architect@Example.com',
        password: 'correct horse battery staple',
        displayName: 'Architect',
        teamName: 'Architecture team',
      },
      {
        ip: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(session.token).toEqual(expect.any(String));
    expect(session.token).not.toContain('correct horse');
    expect(repository.createLocalAccountWithTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'architect@example.com',
        externalSubjectHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        passwordHash: expect.stringMatching(/^scrypt:v1:/),
      }),
    );
    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        userAgentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        ipHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('rejects invalid login attempts and records lockout-ready failures', async () => {
    const repository = repositoryMock();
    repository.findLocalAccountByEmail.mockResolvedValue({
      ...account,
      passwordHash:
        'scrypt:v1:16384:8:1:Tm90VGhlUmlnaHRTYWx0:Os6fRvczjT_AZljxB0T2YRrNEKv5szyK7b57lFb2_iA',
      failedAttempts: 4,
    });
    const service = new AuthService(repository as never, configService());

    await expect(
      service.login({
        email: 'architect@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toThrow(ApiUnauthorizedError);
    expect(repository.recordFailedLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: account.accountId,
        failedAttempts: 5,
        lockedUntil: expect.any(String),
      }),
    );
  });

  it('hydrates the current session and account teams from bearer auth', async () => {
    const repository = repositoryMock();
    repository.resolveSession.mockResolvedValue(identity);
    repository.listAccountTeams.mockResolvedValue([account.defaultTeam!]);
    const service = new AuthService(repository as never, configService());
    const current = await service.authenticateRequest({
      headers: {
        authorization: 'Bearer session-token',
      },
    });

    await expect(service.me(current)).resolves.toMatchObject({
      account: {
        id: account.accountId,
        email: account.email,
      },
      activeTeam: {
        id: account.defaultTeam?.teamId,
        role: 'owner',
      },
      session: {
        id: identity.sessionId,
      },
    });
  });
});

describe('BillingService', () => {
  it('imports normalized invoice rows with source and line-item hashes', async () => {
    const repository = repositoryMock();
    repository.createBillingImport.mockImplementation(async (input) => ({
      importRun: {
        id: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: input.importInput.provider,
        sourceType: input.importInput.sourceType,
        status: 'completed',
        billingPeriodStart: input.importInput.billingPeriodStart,
        billingPeriodEnd: input.importInput.billingPeriodEnd,
        originalFileSha256: input.originalFileSha256,
        rowsReceived: input.rows.length,
        rowsAccepted: input.rows.length,
        rowsRejected: 0,
        totalCostUsd: 107,
        createdByAccountId: identity.accountId,
        createdAt: '2026-07-06T00:00:00.000Z',
        completedAt: '2026-07-06T00:00:01.000Z',
      },
      lineItems: input.rows.map((row, index) => ({
        id: `line-${index}`,
        importRunId: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: input.importInput.provider,
        billingPeriodStart: input.importInput.billingPeriodStart,
        billingPeriodEnd: input.importInput.billingPeriodEnd,
        ...row,
        createdAt: '2026-07-06T00:00:01.000Z',
      })),
    }));
    const service = new BillingService(repository as never);

    const result = await service.importActuals(
      {
        provider: 'aws',
        sourceType: 'aws-cur',
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        rows: [
          {
            serviceName: 'AmazonEC2',
            skuId: 'sku-compute',
            costUsd: 107,
            tags: {
              cost_center: 'engineering',
            },
          },
        ],
      },
      identity,
    );

    expect(result.importRun.originalFileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.lineItems[0].lineItemHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.createBillingImport).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: identity.teamId,
        createdByAccountId: identity.accountId,
      }),
    );
  });

  it('reconciles imported actuals against comparison totals with trace evidence', async () => {
    const repository = repositoryMock();
    repository.getBillingImport.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      teamId: identity.teamId,
      provider: 'aws',
      sourceType: 'aws-cur',
      status: 'completed',
      billingPeriodStart: '2026-06-01',
      billingPeriodEnd: '2026-06-30',
      originalFileSha256: 'a'.repeat(64),
      rowsReceived: 1,
      rowsAccepted: 1,
      rowsRejected: 0,
      totalCostUsd: 107,
      createdAt: '2026-07-06T00:00:00.000Z',
    });
    repository.listInvoiceLineItems.mockResolvedValue([
      {
        id: 'line-1',
        importRunId: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: 'aws',
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        serviceName: 'AmazonEC2',
        skuId: 'sku-compute',
        costUsd: 107,
        currency: 'USD',
        tags: {},
        rawPayload: {},
        lineItemHash: 'b'.repeat(64),
        createdAt: '2026-07-06T00:00:01.000Z',
      },
    ]);
    repository.getComparison.mockResolvedValue({
      nwsSnapshot: {} as never,
      resultSnapshot: comparisonResult,
    });
    repository.saveInvoiceReconciliation.mockImplementation(async (input) => ({
      id: '66666666-6666-4666-8666-666666666666',
      createdAt: '2026-07-06T00:00:02.000Z',
      ...input,
    }));
    const service = new BillingService(repository as never);

    await expect(
      service.reconcile(
        '55555555-5555-4555-8555-555555555555',
        {
          comparisonId: comparisonResult.comparisonId,
        },
        identity,
      ),
    ).resolves.toMatchObject({
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: expect.objectContaining({
        invoiceLineItemHashes: ['b'.repeat(64)],
        comparisonTraceKeys: expect.any(Array),
      }),
    });
  });

  it('blocks reconciliation across active team boundaries', async () => {
    const repository = repositoryMock();
    repository.getBillingImport.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      teamId: '77777777-7777-4777-8777-777777777777',
      provider: 'aws',
      sourceType: 'aws-cur',
      status: 'completed',
      billingPeriodStart: '2026-06-01',
      billingPeriodEnd: '2026-06-30',
      originalFileSha256: 'a'.repeat(64),
      rowsReceived: 1,
      rowsAccepted: 1,
      rowsRejected: 0,
      totalCostUsd: 107,
      createdAt: '2026-07-06T00:00:00.000Z',
    });
    const service = new BillingService(repository as never);

    await expect(
      service.reconcile(
        '55555555-5555-4555-8555-555555555555',
        {
          comparisonId: comparisonResult.comparisonId,
        },
        identity,
      ),
    ).rejects.toThrow(ApiForbiddenError);
  });
});

function repositoryMock() {
  return {
    findLocalAccountByEmail: jest.fn(),
    createLocalAccountWithTeam: jest.fn(),
    createSession: jest.fn(),
    recordFailedLogin: jest.fn(),
    resetFailedLogin: jest.fn(),
    resolveSession: jest.fn(),
    listAccountTeams: jest.fn(),
    createBillingImport: jest.fn(),
    getBillingImport: jest.fn(),
    listInvoiceLineItems: jest.fn(),
    getComparison: jest.fn(),
    saveInvoiceReconciliation: jest.fn(),
    listInvoiceReconciliations: jest.fn(),
  } as unknown as jest.Mocked<ApiDatabaseRepository>;
}

function configService(): ConfigService<AppConfig, true> {
  return {
    get: jest.fn((key: keyof AppConfig) => {
      switch (key) {
        case 'AUTH_SESSION_TTL_HOURS':
          return 12;
        case 'AUTH_PASSWORD_MIN_LENGTH':
          return 12;
        case 'AUTH_MAX_FAILED_LOGIN_ATTEMPTS':
          return 5;
        case 'AUTH_LOCKOUT_MINUTES':
          return 15;
        case 'AUTH_LOCAL_REGISTRATION_ENABLED':
          return true;
        default:
          return undefined;
      }
    }),
  } as unknown as ConfigService<AppConfig, true>;
}
