import { readFileSync } from 'node:fs';

import {
  configuredApiBaseUrl,
  createPolyCostClient,
  formatApiError,
  PolyCostApiError,
} from './api-client';
import { DiagramParseRequest, DiagramParseResult } from './types';
import { buildNwsFromForm, defaultWorkloadForm } from './workload';

const originalFetch = global.fetch;

describe('api client', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reads configured base URL from document metadata', () => {
    const meta = document.createElement('meta');
    meta.name = 'polycost-api-base-url';
    meta.content = 'http://api.test/api/v1/';
    document.head.appendChild(meta);

    expect(configuredApiBaseUrl()).toBe('http://api.test/api/v1');
  });

  it('falls back when Vite did not inject a URL', () => {
    const meta = document.createElement('meta');
    meta.name = 'polycost-api-base-url';
    meta.content = '%VITE_API_BASE_URL%';
    document.head.appendChild(meta);

    expect(configuredApiBaseUrl()).toBe('/api/v1');
  });

  it('exposes the Docker build API base through Vite HTML env replacement', () => {
    const html = readFileSync('index.html', 'utf8');

    expect(html).toContain('name="polycost-api-base-url" content="%VITE_API_BASE_URL%"');
  });

  it('sends comparison requests with cached-pricing options', async () => {
    const nws = buildNwsFromForm(defaultWorkloadForm);
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        comparisonId: 'comparison-1',
        pricingAsOf: '2026-06-29T00:00:00.000Z',
        cheapestProviderId: 'aws',
        providers: [],
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await client.createComparison(nws);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/comparisons',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          nws,
          options: {
            useLivePricing: false,
          },
        }),
      }),
    );
  });

  it('fetches backend comparison analytics for saved results', async () => {
    const analytics = {
      comparisonId: 'comparison-1',
      generatedAt: '2026-07-02T12:00:00.000Z',
      pricingAsOf: '2026-07-02T00:00:00.000Z',
      executiveForecast: {
        horizonDays: 90,
        assumption: '90-day projection uses current monthly run rate x 3.',
        providerForecasts: [
          {
            providerId: 'aws',
            monthlyRunRateUsd: 100,
            ninetyDayRunRateUsd: 300,
            annualizedRunRateUsd: 1200,
          },
        ],
      },
      costCoverageMap: [
        {
          providerId: 'aws',
          dimension: 'Compute families and sizing',
          status: 'Covered',
          pricedRows: 1,
          approximateRows: 0,
          monthlyUsd: 80,
          evidence: 'aws compute row is priced.',
          reviewCue: 'Validate family.',
        },
      ],
      costComposition: [
        {
          providerId: 'aws',
          totalMonthlyUsd: 100,
          items: [
            {
              dimension: 'compute',
              label: 'Compute',
              monthlyCostUsd: 80,
              percentOfProviderTotal: 80,
              runningMonthlyUsd: 80,
            },
          ],
        },
      ],
      providerDeltaAnalysis: [],
      regionVarianceHeatMap: [
        {
          comparisonRegion: 'us-east',
          label: 'US East',
          regionSummary: 'AWS us-east-1 · Azure eastus · GCP us-east1',
          multiplier: 1,
          evidence: 'Baseline North America pricing sensitivity.',
          isSelected: true,
          complianceEligible: true,
          lowestProviderId: 'aws',
          providers: [
            {
              providerId: 'aws',
              providerRegion: 'us-east-1',
              modeledMonthlyUsd: 100,
              deltaVsSelectedMonthlyUsd: 0,
              isLowest: true,
            },
          ],
        },
      ],
      egressNetworkingDetails: [
        {
          id: 'aws-egress-1',
          providerId: 'aws',
          networkComponent: 'egress',
          description: 'Backend AWS internet egress',
          region: 'us-east-1',
          monthlyCostUsd: 12,
          shareOfProviderTotalPercent: 12,
          unit: 'GB',
          rateUsd: 0.09,
          evidence: 'Backend network tier evidence.',
        },
      ],
      sensitivityScenarios: [
        {
          variable: 'egress_traffic',
          label: 'Egress traffic',
          changePercent: 50,
          providerId: 'aws',
          baselineMonthlyUsd: 100,
          adjustedMonthlyUsd: 106,
          deltaMonthlyUsd: 6,
        },
      ],
      commitmentRoiTimelines: [],
      commitmentCoverage: [
        {
          providerId: 'aws',
          eligibleMonthlyUsd: 80,
          coveredPercentOfSpend: 80,
          onDemandExposureMonthlyUsd: 20,
          zeroCommitmentMonthlyUsd: 100,
          targetCoveragePercent: 70,
          targetBlendMonthlyUsd: 86,
          fullyCommittedMonthlyUsd: 80,
          ineligibleMonthlyUsd: 20,
          targetOnDemandExposureMonthlyUsd: 44,
          exposedPercentOfSpend: 44,
          targetSavingsMonthlyUsd: 14,
          remainingOpportunityMonthlyUsd: 6,
          maxMonthlySavingsUsd: 20,
          recommendation:
            'aws can move from $100/mo at 0% commitment coverage to $80/mo at 100%; target blend is $86/mo.',
        },
      ],
      tcoSignals: [],
      optimizationOpportunities: [
        {
          id: 'provider-selection-1',
          category: 'Provider selection',
          recommendation: 'Shortlist aws before committing to gcp.',
          estimatedMonthlySavingsUsd: 20,
          estimatedAnnualSavingsUsd: 240,
          priority: 'High',
          effort: 'Medium',
          evidence: 'Provider delta from current cached comparison.',
        },
      ],
      finOpsFindings: [],
    };
    const fetchMock = jest.fn(async () => jsonResponse(analytics));
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.getComparisonAnalytics('comparison-1')).resolves.toEqual(analytics);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/comparisons/comparison-1/analytics',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('wires authenticated session and billing actuals routes with bearer headers', async () => {
    const session = {
      token: 'session-token',
      expiresAt: '2026-07-07T00:00:00.000Z',
      account: {
        id: 'account-1',
        email: 'architect@example.com',
      },
      team: {
        id: 'team-1',
        name: 'Architecture team',
        role: 'owner',
      },
    };
    const billingImport = {
      importRun: {
        id: 'import-1',
        teamId: 'team-1',
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
      },
      acceptedRows: 1,
      rejectedRows: 0,
      lineItems: [],
    };
    const reconciliation = {
      id: 'reconciliation-1',
      importRunId: 'import-1',
      comparisonId: 'comparison-1',
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {},
      createdAt: '2026-07-06T00:00:02.000Z',
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(session))
      .mockResolvedValueOnce(
        jsonResponse({
          account: session.account,
          activeTeam: session.team,
          teams: [{ teamId: 'team-1', teamName: 'Architecture team', role: 'owner' }],
          session: { id: 'session-1', expiresAt: session.expiresAt },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(billingImport))
      .mockResolvedValueOnce(jsonResponse(reconciliation))
      .mockResolvedValueOnce(jsonResponse([reconciliation]));
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(
      client.register({
        email: 'architect@example.com',
        password: 'correct horse battery staple',
        teamName: 'Architecture team',
      }),
    ).resolves.toEqual(session);
    await expect(client.getCurrentSession('session-token')).resolves.toEqual(
      expect.objectContaining({
        activeTeam: session.team,
      }),
    );
    await expect(
      client.importBillingActuals(
        {
          provider: 'aws',
          sourceType: 'aws-cur',
          billingPeriodStart: '2026-06-01',
          billingPeriodEnd: '2026-06-30',
          rows: [{ serviceName: 'AmazonEC2', costUsd: 107 }],
        },
        'session-token',
      ),
    ).resolves.toEqual(billingImport);
    await expect(
      client.reconcileBillingImport('import-1', 'comparison-1', 'session-token'),
    ).resolves.toEqual(reconciliation);
    await expect(client.listBillingReconciliations('import-1', 'session-token')).resolves.toEqual([
      reconciliation,
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer session-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/billing/imports',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer session-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/api/v1/billing/imports/import-1/reconcile',
      expect.objectContaining({
        body: JSON.stringify({ comparisonId: 'comparison-1' }),
      }),
    );
  });

  it('wires team administration, SSO status, and provider export import routes', async () => {
    const member = {
      accountId: 'account-1',
      email: 'architect@example.com',
      role: 'owner',
      createdAt: '2026-07-06T00:00:00.000Z',
    };
    const invitation = {
      id: 'invite-1',
      teamId: 'team-1',
      email: 'finops@example.com',
      role: 'viewer',
      status: 'pending',
      invitedByAccountId: 'account-1',
      expiresAt: '2026-07-13T00:00:00.000Z',
      createdAt: '2026-07-06T00:00:00.000Z',
      inviteToken: 'invite-token',
    };
    const ssoStatus = {
      localLoginEnabled: true,
      oidcConfigured: false,
      samlConfigured: false,
      configuredProviders: [],
      callbackUrls: {
        oidc: 'http://localhost:3001/api/v1/auth/sso/oidc/callback',
        saml: 'http://localhost:3001/api/v1/auth/sso/saml/acs',
      },
    };
    const billingImport = {
      importRun: {
        id: 'import-1',
        teamId: 'team-1',
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
      },
      acceptedRows: 1,
      rejectedRows: 0,
      lineItems: [],
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse([member]))
      .mockResolvedValueOnce(jsonResponse(invitation))
      .mockResolvedValueOnce(jsonResponse([invitation]))
      .mockResolvedValueOnce(jsonResponse(invitation))
      .mockResolvedValueOnce(jsonResponse({ ...member, role: 'admin' }))
      .mockResolvedValueOnce(jsonResponse({ removed: true }))
      .mockResolvedValueOnce(jsonResponse(ssoStatus))
      .mockResolvedValueOnce(jsonResponse(billingImport));
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.listTeamMembers('team-1', 'session-token')).resolves.toEqual([member]);
    await expect(
      client.inviteTeamMember(
        'team-1',
        { email: 'finops@example.com', role: 'viewer' },
        'session-token',
      ),
    ).resolves.toEqual(invitation);
    await expect(client.listTeamInvitations('team-1', 'session-token')).resolves.toEqual([
      invitation,
    ]);
    await expect(client.acceptTeamInvitation('invite-token', 'session-token')).resolves.toEqual(
      invitation,
    );
    await expect(
      client.updateTeamMemberRole('team-1', 'account-1', 'admin', 'session-token'),
    ).resolves.toEqual(expect.objectContaining({ role: 'admin' }));
    await expect(client.removeTeamMember('team-1', 'account-1', 'session-token')).resolves.toEqual({
      removed: true,
    });
    await expect(client.getSsoStatus('session-token')).resolves.toEqual(ssoStatus);
    await expect(
      client.importProviderBillingExport(
        {
          provider: 'aws',
          sourceType: 'aws-cur',
          billingPeriodStart: '2026-06-01',
          billingPeriodEnd: '2026-06-30',
          content: 'lineItem/ProductCode,lineItem/NetUnblendedCost\nAmazonEC2,107',
        },
        'session-token',
      ),
    ).resolves.toEqual(billingImport);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/auth/teams/team-1/invitations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'finops@example.com', role: 'viewer' }),
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://api.test/api/v1/auth/teams/team-1/members/account-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ role: 'admin' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      'http://api.test/api/v1/billing/imports/provider-export',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
      }),
    );
  });

  it('maps API error envelopes', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Bad request',
            details: [{ field: 'nws', issue: 'required' }],
          },
        },
        400,
      ),
    ) as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.validateWorkload(buildNwsFromForm(defaultWorkloadForm))).rejects.toEqual(
      expect.objectContaining({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Bad request',
        details: [{ field: 'nws', issue: 'required' }],
      }) as PolyCostApiError,
    );
  });

  it('explains plain HTTP failures without exposing raw status copy', async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, 405)) as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.createComparison(buildNwsFromForm(defaultWorkloadForm))).rejects.toEqual(
      expect.objectContaining({
        status: 405,
        code: 'HTTP_ERROR',
        message:
          'PolyCost reached a server that does not accept this API action. Check that the web app is pointed at the PolyCost API service, then try again.',
      }) as PolyCostApiError,
    );
  });

  it('downloads binary exports through the async export-job flow', async () => {
    const blob = new Blob(['csv']);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          jobId: 'job-1',
          comparisonId: 'comparison-1',
          format: 'csv',
          interval: 'quarterly',
          pricingModel: 'reserved-3yr',
          status: 'completed',
          fileName: 'polycost-comparison.csv',
          contentType: 'text/csv',
          createdAt: '2026-07-01T00:00:00.000Z',
          completedAt: '2026-07-01T00:00:01.000Z',
          statusUrl: '/api/v1/comparisons/comparison-1/export-jobs/job-1',
          downloadUrl: '/api/v1/comparisons/comparison-1/export-jobs/job-1/download',
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: jest.fn(async () => blob),
      } as unknown as Response);
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(
      client.exportComparison('comparison-1', 'csv', {
        interval: 'quarterly',
        pricingModel: 'reserved-3yr',
      }),
    ).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/comparisons/comparison-1/export-jobs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          format: 'csv',
          interval: 'quarterly',
          pricingModel: 'reserved-3yr',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/comparisons/comparison-1/export-jobs/job-1/download',
    );
  });

  it('creates, reads, and downloads report export jobs', async () => {
    const blob = new Blob(['xlsx']);
    const pendingJob = {
      jobId: 'job-1',
      comparisonId: 'comparison-1',
      format: 'xlsx',
      interval: 'monthly',
      pricingModel: 'on-demand',
      status: 'pending',
      createdAt: '2026-07-01T00:00:00.000Z',
      statusUrl: '/api/v1/comparisons/comparison-1/export-jobs/job-1',
    };
    const completedJob = {
      ...pendingJob,
      status: 'completed',
      fileName: 'polycost-comparison.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      completedAt: '2026-07-01T00:00:01.000Z',
      downloadUrl: '/api/v1/comparisons/comparison-1/export-jobs/job-1/download',
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(pendingJob))
      .mockResolvedValueOnce(jsonResponse(completedJob))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: jest.fn(async () => blob),
      } as unknown as Response);
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(
      client.createExportJob('comparison-1', 'xlsx', {
        interval: 'monthly',
        pricingModel: 'on-demand',
      }),
    ).resolves.toEqual(pendingJob);
    await expect(client.getExportJob('comparison-1', 'job-1')).resolves.toEqual(completedJob);
    await expect(client.downloadExportJob('comparison-1', 'job-1')).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/comparisons/comparison-1/export-jobs',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/comparisons/comparison-1/export-jobs/job-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/comparisons/comparison-1/export-jobs/job-1/download',
    );
  });

  it('fetches API health from the backend root', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        status: 'ok',
        service: 'polycost-api',
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.getHealth()).resolves.toEqual({
      status: 'ok',
      service: 'polycost-api',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('fetches API health when the configured base URL is relative', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        status: 'ok',
        service: 'polycost-api',
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('/api/v1');

    await expect(client.getHealth()).resolves.toEqual({
      status: 'ok',
      service: 'polycost-api',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('fetches the live cloud region catalog', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        generatedAt: '2026-06-29T00:00:00.000Z',
        cacheTtlSeconds: 43_200,
        providers: [
          {
            providerId: 'aws',
            label: 'AWS',
            source: 'live',
            sourceUrl: 'https://b0.p.awsstatic.com/locations/1.0/aws/current/locations.json',
            calculatorUrl: 'https://calculator.aws/#/',
            regions: [
              {
                providerId: 'aws',
                id: 'us-east-1',
                label: 'US East (N. Virginia)',
                source: 'live',
              },
            ],
          },
        ],
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.getRegionCatalog()).resolves.toEqual(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: 'aws',
            calculatorUrl: 'https://calculator.aws/#/',
          }),
        ]),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/regions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('fetches public pricing data health', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        generatedAt: '2026-07-01T00:00:00.000Z',
        freshnessPolicyHours: 48,
        overallStatus: 'fresh',
        alertCount: 0,
        alerts: [],
        providers: [
          {
            providerId: 'aws',
            status: 'success',
            freshness: 'fresh',
            ageHours: 1,
            recordsUpdated: 12,
            recordsRejected: 0,
            recordsSkipped: 3,
            cache: {
              catalogRows: 30,
              currentRateRows: 18,
              latestCatalogSyncAt: '2026-06-30T23:00:00.000Z',
              latestRateSyncAt: '2026-06-30T23:00:00.000Z',
              ageHours: 1,
              freshness: 'fresh',
              syncStatusCounts: {
                success: 48,
                partial: 0,
                failed: 0,
              },
            },
            message:
              'Pricing cache refreshed 1h ago across 30 catalog rows and 18 current rate rows.',
          },
        ],
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.getDataHealth()).resolves.toEqual(
      expect.objectContaining({
        overallStatus: 'fresh',
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: 'aws',
            freshness: 'fresh',
          }),
        ]),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/data-health',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('fetches pricing model metadata', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        defaultModel: 'on-demand',
        generatedAt: '2026-06-30T00:00:00.000Z',
        models: [
          {
            model: 'spot',
            cachedTerm: 'spot',
            label: 'Spot',
            default: false,
            volatility: 'volatile',
            providerTerms: {
              aws: 'EC2 Spot Instances',
              azure: 'Azure Spot VMs',
              gcp: 'Google Cloud Spot VMs',
            },
            caveat: 'Spot prices are interruptible and volatile.',
          },
        ],
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.getPricingModels()).resolves.toEqual(
      expect.objectContaining({
        defaultModel: 'on-demand',
        models: expect.arrayContaining([
          expect.objectContaining({
            model: 'spot',
            volatility: 'volatile',
          }),
        ]),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/pricing/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('fetches provider/service pricing model metadata for dynamic selectors', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        schemaVersion: 2,
        provider: 'aws',
        service: 'compute',
        region: 'us-east-1',
        generatedAt: '2026-06-30T00:00:00.000Z',
        models: [
          {
            code: 'reserved_3yr',
            label: 'Reserved (3-Year)',
            termMonths: 36,
            requiresPaymentOption: true,
            isEstimateOnly: false,
            paymentOptions: [{ code: 'no_upfront', label: 'No upfront' }],
            defaultPaymentOption: 'no_upfront',
          },
        ],
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.getPricingModelsForService('aws', 'compute', 'us-east-1')).resolves.toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        models: expect.arrayContaining([
          expect.objectContaining({
            code: 'reserved_3yr',
          }),
        ]),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/pricing/aws/compute/models?region=us-east-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('creates workload-scoped share links and resolves public reports', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'workload-1',
          instanceFamily: 'general-purpose',
          vcpu: 2,
          memoryGb: 4,
          region: 'us-east',
          instanceCount: 2,
          hoursPerMonth: 730,
          storageGb: 250,
          storageTier: 'standard',
          egressGbPerMonth: 750,
          createdAt: '2026-06-29T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          token: 'public-token',
          url: '/api/v1/share/public-token',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          token: 'public-token',
          watermark: true,
          expiresAt: '2026-07-29T00:00:00.000Z',
          pricingModel: 'reserved-3yr',
          granularity: 'yearly',
          passwordProtected: true,
          workload: {},
          breakdown: {},
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          token: 'public-token',
          totalViews: 2,
          lastViewedAt: '2026-07-01T00:00:00.000Z',
          countryViews: [{ countryCode: 'US', views: 2 }],
          sectionViews: [
            {
              section: 'summary',
              views: 2,
              lastViewedAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        }),
      );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await client.createWorkload({
      instanceFamily: 'general-purpose',
      vcpu: 2,
      memoryGb: 4,
      region: 'us-east',
      instanceCount: 2,
      hoursPerMonth: 730,
      storageGb: 250,
      storageTier: 'standard',
      egressGbPerMonth: 750,
    });
    await client.createShareLink({
      workloadId: 'workload-1',
      watermark: true,
      expiresInDays: 30,
      pricingModel: 'reserved-3yr',
      granularity: 'yearly',
      password: 'client-demo',
    });
    await client.getSharedReport('public-token', 'client-demo');
    await client.getShareLinkAnalytics('public-token');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/workloads',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/share-links',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          workloadId: 'workload-1',
          watermark: true,
          expiresInDays: 30,
          pricingModel: 'reserved-3yr',
          granularity: 'yearly',
          password: 'client-demo',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/share/public-token?password=client-demo',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/api/v1/share-links/public-token/analytics',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('parses diagram uploads through the diagram ingestion endpoint', async () => {
    const diagramParseResult: DiagramParseResult = {
      importId: 'diagram-1',
      parserConfidence: 'medium',
      fieldsRequiringReview: ['diagram.nodes.web'],
      source: {
        format: 'drawio',
        fileName: 'web-app.drawio',
        mimeType: 'application/xml',
        sizeBytes: 128,
        sha256: 'a'.repeat(64),
        parsedAt: '2026-07-06T00:00:00.000Z',
        persisted: true,
        tempFileStored: true,
        expiresAt: '2026-07-07T00:00:00.000Z',
      },
      graph: {
        format: 'drawio',
        nodes: [
          {
            id: 'web',
            displayLabel: 'Web tier',
            kind: 'resource',
            sourceRef: 'drawio:web',
          },
        ],
        edges: [
          {
            id: 'edge-1',
            sourceId: 'web',
            targetId: 'db',
            displayLabel: 'traffic',
          },
        ],
        ignoredNodes: [],
      },
      review: {
        components: [
          {
            nodeId: 'web',
            displayLabel: 'Web tier',
            serviceCategory: 'compute',
            serviceType: 'vm-compute',
            confidence: 'high',
            sourceRef: 'drawio:web',
            assumedDefaults: ['2 vCPU'],
            editable: true,
          },
        ],
        unresolvedClassifications: [],
        ignoredNodes: [],
        assumedDefaults: ['2 vCPU'],
      },
      draftNws: buildNwsFromForm(defaultWorkloadForm, 'drawio_diagram'),
    };
    const payload: DiagramParseRequest = {
      content: '<mxfile><diagram><mxGraphModel /></diagram></mxfile>',
      fileName: 'web-app.drawio',
      inputFormat: 'drawio',
      encoding: 'text',
    };
    const fetchMock = jest.fn(async () => jsonResponse(diagramParseResult));
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.parseDiagram(payload)).resolves.toEqual(diagramParseResult);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/parse/diagram',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('uses budget, alert, and exchange-rate endpoints', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'budget-1',
          workloadId: 'workload-1',
          thresholdUsd: 500,
          alertOnAnomalyPercent: 20,
          createdAt: '2026-06-29T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 'alert-1',
            workloadId: 'workload-1',
            budgetId: 'budget-1',
            alertType: 'budget_threshold',
            message: 'Budget exceeded',
            dismissed: false,
            triggeredAt: '2026-06-29T00:00:00.000Z',
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'alert-1',
          workloadId: 'workload-1',
          budgetId: 'budget-1',
          alertType: 'budget_threshold',
          message: 'Budget exceeded',
          dismissed: true,
          triggeredAt: '2026-06-29T00:00:00.000Z',
          dismissedAt: '2026-06-29T01:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          base: 'USD',
          lastUpdated: '2026-06-29T00:00:00.000Z',
          rates: {
            PKR: 278,
          },
        }),
      );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await client.createBudget({
      workloadId: 'workload-1',
      thresholdUsd: 500,
      alertOnAnomalyPercent: 20,
    });
    await client.listAlerts('workload-1');
    await client.updateAlertDismissed('alert-1', true);
    await client.getExchangeRates('USD');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/budgets',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/alerts?workloadId=workload-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/alerts/alert-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ dismissed: true }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/api/v1/exchange-rates?base=USD',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('uses default optional query parameters when omitted', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'public-token', workload: {}, breakdown: {} }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          base: 'USD',
          lastUpdated: '2026-06-29T00:00:00.000Z',
          rates: {
            EUR: 0.93,
          },
        }),
      );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await client.getSharedReport('public-token');
    await client.listAlerts();
    await client.getExchangeRates();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/share/public-token',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/alerts',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/exchange-rates?base=USD',
      expect.any(Object),
    );
  });

  it('maps failed binary export downloads through safe API errors', async () => {
    global.fetch = jest.fn(
      async () =>
        ({
          ok: false,
          status: 503,
          json: jest.fn(async () => {
            throw new Error('invalid json');
          }),
        }) as unknown as Response,
    ) as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.downloadExportJob('comparison-1', 'job-1')).rejects.toEqual(
      expect.objectContaining({
        status: 503,
        code: 'HTTP_ERROR',
        message:
          'The PolyCost API is temporarily unavailable. Confirm the backend service is running, then try again.',
      }) as PolyCostApiError,
    );
  });

  it('formats unknown and API errors for UI display', () => {
    expect(
      formatApiError(
        new PolyCostApiError(400, 'VALIDATION_ERROR', 'Invalid NWS', [
          {
            issue: 'compute is required',
          },
        ]),
      ),
    ).toBe('Invalid NWS compute is required');
    expect(formatApiError(new Error('Broken'))).toBe('Broken');
    expect(formatApiError(new Error('[object Object]'))).toBe(
      'PolyCost hit an unexpected browser-side issue while preparing the request. Refresh the page and try again.',
    );
    expect(formatApiError(new Error('Error: hidden stack\n    at run (/tmp/app.js:1:2)'))).toBe(
      'PolyCost hit an unexpected browser-side issue while preparing the request. Refresh the page and try again.',
    );
    expect(formatApiError(new Error('TypeError: Region picker failed'))).toBe(
      'Region picker failed',
    );
    expect(formatApiError(new PolyCostApiError(400, 'BAD_BODY', '[object Object]'))).toBe(
      'PolyCost could not use that request. Review the workload inputs and try again.',
    );
    expect(formatApiError(new PolyCostApiError(422, 'BAD_BODY', '{"message":"bad"}'))).toBe(
      'PolyCost could not validate that workload. Review the highlighted fields and try again.',
    );
    expect(formatApiError(new PolyCostApiError(401, 'AUTH', ''))).toBe(
      'PolyCost needs a signed-in session for this request. Sign in again, then retry.',
    );
    expect(formatApiError(new PolyCostApiError(403, 'FORBIDDEN', ''))).toBe(
      'PolyCost reached the API, but this account does not have access to that action.',
    );
    expect(formatApiError(new PolyCostApiError(404, 'MISSING', ''))).toBe(
      'PolyCost could not find the requested API resource. Refresh the page and try again.',
    );
    expect(formatApiError(new PolyCostApiError(408, 'TIMEOUT', ''))).toBe(
      'The PolyCost API took too long to respond. Retry once the pricing service catches up.',
    );
    expect(formatApiError(new PolyCostApiError(409, 'CONFLICT', ''))).toBe(
      'PolyCost could not complete the request because the saved comparison changed. Refresh the comparison and try again.',
    );
    expect(formatApiError(new PolyCostApiError(429, 'RATE_LIMITED', ''))).toBe(
      'The PolyCost API is receiving too many requests right now. Wait a moment, then retry.',
    );
    expect(formatApiError(new PolyCostApiError(500, 'SERVER_ERROR', ''))).toBe(
      'The PolyCost API hit a server-side problem while processing this request. Try again after refreshing pricing data.',
    );
    expect(formatApiError(new PolyCostApiError(418, 'TEAPOT', ''))).toBe(
      'PolyCost could not complete the API request (HTTP 418). Refresh the page and try again.',
    );
    expect(formatApiError(new TypeError('Failed to fetch'))).toBe(
      'PolyCost could not reach the API service. Start the backend or check the API base URL, then try again.',
    );
    expect(formatApiError(new Error('   '))).toBe(
      'PolyCost hit an unexpected browser-side issue while preparing the request. Refresh the page and try again.',
    );
    expect(formatApiError('bad')).toBe(
      'PolyCost hit an unexpected browser-side issue while preparing the request. Refresh the page and try again.',
    );
  });

  it('parses workload and refreshes live comparisons', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          draftNws: buildNwsFromForm(defaultWorkloadForm),
          parserConfidence: 'high',
          fieldsRequiringReview: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          comparisonId: 'comparison-2',
          pricingAsOf: '2026-06-29T00:00:00.000Z',
          cheapestProviderId: 'aws',
          providers: [],
        }),
      );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await client.parseWorkload('web app');
    await client.refreshLiveComparison('comparison-2');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/workload/parse',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/comparisons/comparison-2/refresh-live',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toEqual(
      expect.objectContaining({ 'Content-Type': 'application/json' }),
    );
    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toBeUndefined();
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).not.toEqual(
      expect.objectContaining({ 'Content-Type': 'application/json' }),
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  const bodyText = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => JSON.parse(bodyText) as unknown),
    blob: jest.fn(async () => new Blob([bodyText])),
  } as unknown as Response;
}
