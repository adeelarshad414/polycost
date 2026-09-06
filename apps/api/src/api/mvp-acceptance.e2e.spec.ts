/* eslint-disable security/detect-non-literal-fs-filename -- Reviewed 2026-07-06: E2E fixture reads are resolved under repository fixture roots; see docs/SECURITY-SUPPRESSIONS.md. */
import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { env } from 'node:process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ComparisonResult } from '../comparison/comparison.types.js';
import { DiagramParseResult } from '../diagram-parser/diagram-parser.types.js';
import { NormalizedWorkloadSpec } from '../nws/nws.types.js';
import {
  AuthMeResponse,
  AuthSessionResponse,
  SsoCallbackResponse,
  SsoStartResponse,
  TeamInvitationPreview,
  TeamInvitationRecord,
  TeamMemberRecord,
} from './auth.types.js';
import { ComparisonPricingEvidenceResponse } from './comparison-application.service.js';
import {
  ShareLinkAnalyticsResponse,
  SharedReportResponse,
  ShareLinkResponse,
  WorkloadRecord,
} from './cost-management.types.js';
import { RegionCatalogResponse } from './regions.types.js';

const API_ORIGIN = env.POLYCOST_API_ORIGIN ?? `http://localhost:${env.API_PORT ?? '3001'}`;
const API_BASE_URL = env.POLYCOST_API_BASE_URL ?? `${API_ORIGIN}/api/v1`;
const WEB_BASE_URL = env.POLYCOST_WEB_BASE_URL ?? `http://localhost:${env.WEB_PORT ?? '3000'}`;
const DIAGRAM_FIXTURE_ROOT = resolve(__dirname, '../../../../fixtures/diagrams');

interface ParsedNwsDraftResponse {
  draftNws: NormalizedWorkloadSpec;
  parserConfidence: 'high' | 'medium' | 'low';
  fieldsRequiringReview: string[];
}

jest.setTimeout(60_000);

describe('MVP acceptance criteria E2E', () => {
  let structuredComparison: ComparisonResult;

  beforeAll(async () => {
    await expectApiHealth();
    structuredComparison = await createComparison(buildStructuredWorkload('Phase 10 baseline'));
  }, 60_000);

  it('serves the frontend shell from the Compose stack without a manual seed step', async () => {
    const html = await requestText(WEB_BASE_URL);

    expect(html).toContain('PolyCost');
    expect(html).toContain('<div id="root">');
    expectProviderComparison(structuredComparison);
  });

  it('turns plain-English requirements into a three-cloud comparison', async () => {
    const parsed = await requestJson<ParsedNwsDraftResponse>('/workload/parse', {
      method: 'POST',
      body: JSON.stringify({
        naturalLanguageInput:
          'Estimate a web app for 12000 daily users and 900 peak users in us-east-1 with 4 web servers, 4 vCPU, 16 GB memory, 500 GB object storage, PostgreSQL database, 1200 GB monthly egress, CDN, load balancer, and multi-AZ high availability.',
      }),
    });

    expect(parsed.draftNws.metadata.sourceType).toBe('natural_language');
    expect(['high', 'medium', 'low']).toContain(parsed.parserConfidence);
    expect(Array.isArray(parsed.fieldsRequiringReview)).toBe(true);

    await requestJson<{ valid: true }>('/workload/validate', {
      method: 'POST',
      body: JSON.stringify(parsed.draftNws),
    });

    const comparison = await createComparison(parsed.draftNws);

    expectProviderComparison(comparison);
    expect(comparison.providers.some((provider) => provider.lineItems.length > 0)).toBe(true);
  });

  it('refreshes an existing comparison against the current pricing catalog', async () => {
    const refreshed = await requestJson<ComparisonResult>(
      `/comparisons/${structuredComparison.comparisonId}/refresh-live`,
      {
        method: 'POST',
      },
    );

    expectProviderComparison(refreshed);
    expect(refreshed.comparisonId).not.toBe(structuredComparison.comparisonId);
    expect(Date.parse(refreshed.pricingAsOf)).not.toBeNaN();
  });

  it('serves live cloud region metadata and official calculator links', async () => {
    const catalog = await requestJson<RegionCatalogResponse>('/regions');

    expect(catalog.providers.map((provider) => provider.providerId).sort()).toEqual([
      'aws',
      'azure',
      'gcp',
    ]);
    expect(catalog.providers.every((provider) => provider.regions.length > 0)).toBe(true);
    expect(catalog.providers.find((provider) => provider.providerId === 'aws')?.calculatorUrl).toBe(
      'https://calculator.aws/#/',
    );
    expect(
      catalog.providers.find((provider) => provider.providerId === 'azure')?.calculatorUrl,
    ).toBe('https://azure.microsoft.com/en-us/pricing/calculator/');
    expect(catalog.providers.find((provider) => provider.providerId === 'gcp')?.calculatorUrl).toBe(
      'https://cloud.google.com/products/calculator',
    );
  });

  it('exports the same comparison as PDF, CSV, and Excel downloads', async () => {
    const pdf = await requestDownload(
      `/comparisons/${structuredComparison.comparisonId}/export?format=pdf`,
    );
    const csv = await requestDownload(
      `/comparisons/${structuredComparison.comparisonId}/export?format=csv`,
    );
    const xlsx = await requestDownload(
      `/comparisons/${structuredComparison.comparisonId}/export?format=xlsx`,
    );

    expect(pdf.contentType).toContain('application/pdf');
    expect(pdf.text.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(500);

    expect(csv.contentType).toContain('text/csv');
    expect(csv.text).toContain('Comparison ID,');
    expect(csv.text).toContain(
      'Provider,Daily USD,Weekly USD,Monthly USD,Quarterly USD,Yearly USD',
    );
    expect(csv.text).toContain('Provider,Category,Description,Approximate,Monthly USD');

    expect(xlsx.contentType).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(xlsx.text.startsWith('PK')).toBe(true);
    expect(xlsx.text).toContain('[Content_Types].xml');
    expect(xlsx.byteLength).toBeGreaterThan(500);
  });

  it('expands SKU evidence and opens a passworded public share report read-only', async () => {
    const evidence = await requestJson<ComparisonPricingEvidenceResponse>(
      `/comparisons/${structuredComparison.comparisonId}/evidence`,
    );
    const firstEvidenceRow = evidence.evidence[0];

    expect(evidence.comparisonId).toBe(structuredComparison.comparisonId);
    expect(evidence.providerCount).toBe(3);
    expect(evidence.lineItemCount).toBeGreaterThanOrEqual(3);
    expect(firstEvidenceRow).toEqual(
      expect.objectContaining({
        evidenceId: expect.any(String),
        providerId: expect.stringMatching(/^(aws|azure|gcp)$/),
        description: expect.any(String),
        displayedAmounts: expect.objectContaining({
          monthlyCostUsd: expect.any(Number),
          providerTotals: expect.objectContaining({
            monthly: expect.any(Number),
            yearly: expect.any(Number),
          }),
        }),
        rate: expect.objectContaining({
          source: expect.any(String),
          sourceRecordKey: expect.any(String),
        }),
        derivation: expect.objectContaining({
          expression: expect.stringContaining('730'),
          monthlyCostUsd: expect.any(Number),
        }),
        equivalence: expect.objectContaining({
          confidence: expect.stringMatching(/^(direct|approximate|modeled)$/),
        }),
      }),
    );
    expect(
      firstEvidenceRow?.sku.resolvedSkuId ??
        firstEvidenceRow?.sku.sourceSkuId ??
        firstEvidenceRow?.sku.rateSourceSkuId,
    ).toEqual(expect.any(String));
    expect(firstEvidenceRow?.rate.sourceEndpoint ?? firstEvidenceRow?.rate.sourceRecordId).toEqual(
      expect.any(String),
    );
    expect(firstEvidenceRow?.derivation.monthlyCostUsd).toBeGreaterThan(0);
    expect(firstEvidenceRow?.displayedAmounts.monthlyCostUsd).toBeGreaterThan(0);

    const workload = await requestJson<WorkloadRecord>('/workloads', {
      method: 'POST',
      body: JSON.stringify({
        instanceFamily: 'general-purpose',
        vcpu: 4,
        memoryGb: 16,
        region: 'us-east',
        instanceCount: 2,
        hoursPerMonth: 730,
        storageGb: 500,
        storageTier: 'standard',
        egressGbPerMonth: 1200,
      }),
    });
    const password = `client-demo-${randomUUID()}`;
    const share = await requestJson<ShareLinkResponse>('/share-links', {
      method: 'POST',
      body: JSON.stringify({
        workloadId: workload.id,
        watermark: true,
        expiresInDays: 30,
        pricingModel: 'reserved-3yr',
        granularity: 'yearly',
        password,
      }),
    });

    expect(share.token).toEqual(expect.any(String));
    expect(share.url).toContain(share.token);

    const report = await requestJson<SharedReportResponse>(
      `/share/${encodeURIComponent(share.token)}?password=${encodeURIComponent(
        password,
      )}&section=summary`,
      {
        headers: {
          'user-agent': 'polycost-e2e',
          'cf-ipcountry': 'US',
        },
      },
    );

    expect(report).toEqual(
      expect.objectContaining({
        token: share.token,
        watermark: true,
        pricingModel: 'reserved-3yr',
        granularity: 'yearly',
        passwordProtected: true,
      }),
    );
    expect(report.workload.id).toBe(workload.id);
    expect(report.breakdown.workloadId).toBe(workload.id);
    expect(report.breakdown.providers.map((provider) => provider.provider).sort()).toEqual([
      'aws',
      'azure',
      'gcp',
    ]);

    const analytics = await requestJson<ShareLinkAnalyticsResponse>(
      `/share-links/${encodeURIComponent(share.token)}/analytics`,
    );
    expect(analytics.token).toBe(share.token);
    expect(analytics.totalViews).toBeGreaterThanOrEqual(1);
    expect(analytics.sectionViews.some((view) => view.section === 'summary')).toBe(true);

    await requestJson<ShareLinkResponse>(`/share-links/${encodeURIComponent(share.token)}/revoke`, {
      method: 'POST',
    });
    const revoked = await requestRaw(
      `/share/${encodeURIComponent(share.token)}?password=${encodeURIComponent(password)}`,
    );
    expect(revoked.status).toBe(404);
  });

  it('labels non-native equivalents when the requirement names an AWS-specific service', async () => {
    const comparison = await createComparison(
      buildStructuredWorkload('Phase 10 Aurora portability', 'Amazon Aurora PostgreSQL'),
    );
    const azure = comparison.providers.find((provider) => provider.providerId === 'azure');
    const gcp = comparison.providers.find((provider) => provider.providerId === 'gcp');

    expectProviderComparison(comparison);
    expect(azure?.lineItems.some((lineItem) => lineItem.category === 'database')).toBe(true);
    expect(gcp?.lineItems.some((lineItem) => lineItem.category === 'database')).toBe(true);
    expect(
      azure?.lineItems.some(
        (lineItem) => lineItem.category === 'database' && lineItem.isApproximate,
      ),
    ).toBe(true);
    expect(
      gcp?.lineItems.some((lineItem) => lineItem.category === 'database' && lineItem.isApproximate),
    ).toBe(true);
  });

  it.each([
    ['Mermaid', 'mermaid/web-app.mmd', 'text', 'mermaid'],
    ['draw.io', 'drawio/web-app.drawio', 'text', 'drawio'],
    ['Lucid CSV', 'lucid/lucid-export.csv', 'text', 'lucid_csv'],
    ['VSDX', 'vsdx/simple.vsdx', 'base64', 'vsdx'],
  ] as const)(
    'parses %s diagram fixtures through the versioned API and prices the result',
    async (_label, fixturePath, encoding, expectedFormat) => {
      const parsed = await parseDiagramFixture(fixturePath, encoding);

      expect(parsed.source.format).toBe(expectedFormat);
      expect(parsed.source.tempFileStored).toBe(true);
      expect(parsed.source.expiresAt).toEqual(expect.any(String));
      expect(parsed.graph.nodes.length).toBeGreaterThan(0);
      expect(parsed.review.components.length).toBeGreaterThan(0);
      expect(parsed.draftNws.metadata.sourceType).toBe('drawio_diagram');
      expect(parsed.draftNws.serviceRequirements?.length).toBeGreaterThan(0);

      const comparison = await createComparison(parsed.draftNws);

      expectProviderComparison(comparison);
    },
    60_000,
  );

  it.each([
    ['XXE draw.io XML', 'malicious/xxe.drawio', 'text'],
    ['deflate bomb draw.io XML', 'malicious/deflate-bomb.drawio', 'text'],
    ['PNG renamed as draw.io', 'malicious/png-renamed.drawio', 'base64'],
    ['zip bomb VSDX', 'malicious/zip-bomb.vsdx', 'base64'],
  ] as const)('rejects malicious diagram fixture: %s', async (_label, fixturePath, encoding) => {
    const response = await fetch(`${API_BASE_URL}/parse/diagram`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: readDiagramFixture(fixturePath, encoding),
        encoding,
        fileName: fixturePath,
      }),
    });

    expect(response.ok).toBe(false);
    expect([400, 422]).toContain(response.status);

    const health = await requestJson<{ status: string }>(`${API_ORIGIN}/health`);
    expect(health.status).toBe('ok');
  });

  it('runs signup, invite, role-change, mock SSO, and member RBAC denial end to end', async () => {
    const suffix = randomUUID().slice(0, 8);
    const ownerEmail = `owner-${suffix}@example.com`;
    const memberEmail = `member-${suffix}@example.com`;
    const password = 'correct horse battery staple';
    const owner = await requestJson<AuthSessionResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: ownerEmail,
        password,
        displayName: 'E2E Owner',
        teamName: `PolyCost E2E ${suffix}`,
      }),
    });
    const teamId = owner.team?.id;

    expect(teamId).toEqual(expect.any(String));
    expect(owner.team?.role).toBe('owner');

    const ownerMe = await requestJson<AuthMeResponse>('/auth/me', {
      headers: authHeaders(owner.token),
    });
    expect(ownerMe.activeTeam).toEqual(
      expect.objectContaining({
        id: teamId,
        role: 'owner',
      }),
    );

    const invitation = await requestJson<TeamInvitationRecord>(
      `/auth/teams/${teamId}/invitations`,
      {
        method: 'POST',
        headers: authHeaders(owner.token),
        body: JSON.stringify({
          email: memberEmail,
          role: 'member',
        }),
      },
    );

    expect(invitation.status).toBe('pending');
    expect(invitation.role).toBe('member');
    expect(invitation.inviteToken).toEqual(expect.any(String));

    const preview = await requestJson<TeamInvitationPreview>(
      `/auth/invitations/preview/${encodeURIComponent(invitation.inviteToken!)}`,
    );
    expect(preview).toEqual(
      expect.objectContaining({
        status: 'pending',
        email: memberEmail,
        role: 'member',
        teamId,
      }),
    );

    const member = await requestJson<AuthSessionResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: memberEmail,
        password,
        displayName: 'E2E Member',
        teamName: `Member personal ${suffix}`,
      }),
    });
    await requestJson<TeamInvitationRecord>('/auth/invitations/accept', {
      method: 'POST',
      headers: authHeaders(member.token),
      body: JSON.stringify({
        token: invitation.inviteToken,
      }),
    });

    const membersAfterAccept = await requestJson<TeamMemberRecord[]>(
      `/auth/teams/${teamId}/members`,
      {
        headers: authHeaders(owner.token),
      },
    );
    const invitedMember = membersAfterAccept.find((candidate) => candidate.email === memberEmail);
    expect(invitedMember).toEqual(
      expect.objectContaining({
        accountId: member.account.id,
        role: 'member',
      }),
    );

    const promoted = await requestJson<TeamMemberRecord>(
      `/auth/teams/${teamId}/members/${member.account.id}`,
      {
        method: 'PATCH',
        headers: authHeaders(owner.token),
        body: JSON.stringify({ role: 'admin' }),
      },
    );
    expect(promoted.role).toBe('admin');

    const demoted = await requestJson<TeamMemberRecord>(
      `/auth/teams/${teamId}/members/${member.account.id}`,
      {
        method: 'PATCH',
        headers: authHeaders(owner.token),
        body: JSON.stringify({ role: 'member' }),
      },
    );
    expect(demoted.role).toBe('member');

    await requestJson(`/auth/teams/${teamId}/sso/providers`, {
      method: 'POST',
      headers: authHeaders(owner.token),
      body: JSON.stringify({
        providerType: 'oidc',
        displayName: 'PolyCost Mock OIDC',
        issuerUrl: 'https://mock-idp.polycost.local',
        clientId: 'polycost-e2e-client',
      }),
    });
    const ssoStart = await requestJson<SsoStartResponse>('/auth/sso/oidc/start', {
      method: 'POST',
      body: JSON.stringify({
        teamId,
        email: memberEmail,
      }),
    });
    const authorize = await requestJson<{ redirectUrl: string; state: string; email: string }>(
      ssoStart.authorizationUrl,
    );
    expect(authorize.email).toBe(memberEmail);

    const teamScopedMember = await requestJson<SsoCallbackResponse>(authorize.redirectUrl);
    expect(teamScopedMember.team).toEqual(
      expect.objectContaining({
        id: teamId,
        role: 'member',
      }),
    );
    expect(teamScopedMember.sso.stateVerified).toBe(true);

    const forbidden = await requestRaw('/billing/imports/provider-export', {
      method: 'POST',
      headers: authHeaders(teamScopedMember.token),
      body: JSON.stringify({
        provider: 'aws',
        sourceType: 'aws-cur',
        billingPeriodStart: '2026-07-01',
        billingPeriodEnd: '2026-07-31',
        content:
          'lineItem/ProductCode,lineItem/UsageStartDate,lineItem/UnblendedCost\nAmazonEC2,2026-07-01T00:00:00Z,12.34\n',
        encoding: 'text',
        fileName: 'aws-cur-e2e.csv',
      }),
    });
    const error = await forbidden.json();

    expect(forbidden.status).toBe(403);
    expect(error).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: expect.stringContaining('Team admin access is required'),
      },
    });
  });
});

async function expectApiHealth(): Promise<void> {
  const health = await requestJson<{
    status: string;
    service: string;
    dependencies?: unknown;
  }>(`${API_ORIGIN}/health`);

  expect(health).toMatchObject({
    status: 'ok',
    service: 'polycost-api',
  });
  expect(health.dependencies).toBeDefined();
}

async function createComparison(nws: NormalizedWorkloadSpec): Promise<ComparisonResult> {
  await requestJson<{ valid: true }>('/workload/validate', {
    method: 'POST',
    body: JSON.stringify(nws),
  });

  return requestJson<ComparisonResult>('/comparisons', {
    method: 'POST',
    body: JSON.stringify({
      nws,
      options: {
        useLivePricing: false,
      },
    }),
  });
}

async function parseDiagramFixture(
  fixturePath: string,
  encoding: 'text' | 'base64',
): Promise<DiagramParseResult> {
  return requestJson<DiagramParseResult>('/parse/diagram', {
    method: 'POST',
    body: JSON.stringify({
      content: readDiagramFixture(fixturePath, encoding),
      encoding,
      fileName: fixturePath,
    }),
  });
}

function readDiagramFixture(fixturePath: string, encoding: 'text' | 'base64'): string {
  const buffer = readFileSync(resolve(DIAGRAM_FIXTURE_ROOT, fixturePath));

  return encoding === 'base64' ? buffer.toString('base64') : buffer.toString('utf8');
}

async function requestJson<T>(pathOrUrl: string, init?: RequestInit): Promise<T> {
  const response = await request(pathOrUrl, init);
  const text = await response.text();

  return JSON.parse(text) as T;
}

async function requestText(pathOrUrl: string, init?: RequestInit): Promise<string> {
  const response = await request(pathOrUrl, init);

  return response.text();
}

async function requestDownload(pathOrUrl: string): Promise<{
  byteLength: number;
  contentType: string;
  text: string;
}> {
  const response = await request(pathOrUrl);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    byteLength: buffer.length,
    contentType: response.headers.get('content-type') ?? '',
    text: buffer.toString('utf8'),
  };
}

async function request(pathOrUrl: string, init?: RequestInit): Promise<Response> {
  const headers =
    init?.body === undefined
      ? init?.headers
      : {
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        };
  const response = await fetch(toUrl(pathOrUrl), {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `E2E request failed: ${response.status} ${response.statusText} ${await response.text()}`,
    );
  }

  return response;
}

async function requestRaw(pathOrUrl: string, init?: RequestInit): Promise<Response> {
  const headers =
    init?.body === undefined
      ? init?.headers
      : {
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        };

  return fetch(toUrl(pathOrUrl), {
    ...init,
    headers,
  });
}

function toUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http')) {
    const url = new URL(pathOrUrl);

    if (url.pathname.startsWith('/api/v1/')) {
      const origin = new URL(API_ORIGIN);
      url.protocol = origin.protocol;
      url.host = origin.host;
      return url.toString();
    }

    return pathOrUrl;
  }

  return `${API_BASE_URL}${pathOrUrl}`;
}

function expectProviderComparison(result: ComparisonResult): void {
  expect(result.comparisonId).toEqual(expect.any(String));
  expect(Date.parse(result.pricingAsOf)).not.toBeNaN();
  expect(['aws', 'azure', 'gcp']).toContain(result.cheapestProviderId);
  expect(result.providers.map((provider) => provider.providerId).sort()).toEqual([
    'aws',
    'azure',
    'gcp',
  ]);

  result.providers.forEach((provider) => {
    expect(provider.lineItems.length).toBeGreaterThan(0);
    expect(provider.totals.daily).toBeGreaterThan(0);
    expect(provider.totals.weekly).toBeGreaterThan(0);
    expect(provider.totals.monthly).toBeGreaterThan(0);
    expect(provider.totals.quarterly).toBeGreaterThan(0);
    expect(provider.totals.yearly).toBeGreaterThan(0);
  });
}

function authHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
  };
}

function buildStructuredWorkload(
  name: string,
  databasePreference?: string,
): NormalizedWorkloadSpec {
  return {
    schemaVersion: '1.0',
    metadata: {
      sourceType: 'structured_form',
      createdAt: '2026-06-29T00:00:00.000Z',
    },
    workload: {
      name,
      type: 'web_app',
      expectedUsers: {
        dailyActiveUsers: 5000,
        peakConcurrentUsers: 600,
      },
      region: {
        preference: 'us-east-1',
        isDefault: false,
      },
    },
    compute: [
      {
        role: 'web',
        vcpu: 2,
        memoryGb: 4,
        instanceCount: 2,
        scalingType: 'fixed',
      },
    ],
    storage: [
      {
        role: 'uploads',
        type: 'object',
        sizeGb: 250,
        accessPattern: 'frequent',
      },
    ],
    database: [
      {
        role: 'primary',
        engine: 'postgres',
        sizeGb: 100,
        highAvailability: true,
        ...(databasePreference ? { managedServicePreference: databasePreference } : {}),
      },
    ],
    network: {
      estimatedMonthlyEgressGb: 750,
      cdn: true,
      loadBalancer: true,
    },
    availability: {
      multiAz: true,
      multiRegion: false,
      slaTarget: '99.9%',
    },
  };
}
