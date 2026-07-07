import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import path from 'node:path';

const root = process.cwd();
const apiOrigin =
  process.env.POLYCOST_API_ORIGIN ?? `http://localhost:${process.env.API_PORT ?? '3001'}`;
const webOrigin =
  process.env.POLYCOST_WEB_BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? '3000'}`;
const fixtureRoot = path.join(root, 'fixtures/diagrams');
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? 'chrome';
const templateThresholdMs = Number(process.env.POLYCOST_TEMPLATE_JOURNEY_MAX_MS ?? 60_000);
const diagramThresholdMs = Number(process.env.POLYCOST_DIAGRAM_JOURNEY_MAX_MS ?? 180_000);
const authThresholdMs = Number(process.env.POLYCOST_AUTH_JOURNEY_MAX_MS ?? 60_000);
const verifyRedisDown = process.env.POLYCOST_VERIFY_REDIS_DOWN !== '0';
const transcriptPath =
  process.env.POLYCOST_LIVE_VERIFY_TRANSCRIPT_PATH ??
  path.join(root, '.tmp/live-verification/latest.json');

const transcript = {
  schemaVersion: '1.0',
  startedAt: new Date().toISOString(),
  status: 'running',
  apiOrigin,
  webOrigin,
  browserChannel,
  thresholdsMs: {
    templateToRecommendation: templateThresholdMs,
    diagramToPdf: diagramThresholdMs,
    workspaceAuth: authThresholdMs,
  },
  verifyRedisDown,
  journeys: [],
  events: [],
};
const sensitiveTranscriptKeys = new Set([
  'authorization',
  'authorizationUrl',
  'clientSecret',
  'inviteToken',
  'inviteUrl',
  'password',
  'redirectUrl',
  'state',
  'token',
]);

let browser;

try {
  browser = await chromium.launch({
    channel: browserChannel,
    headless: true,
  });

  const template = await verifyTemplateRecommendationJourney();
  transcript.journeys.push(template);
  const diagram = await verifyDiagramToPdfJourney();
  transcript.journeys.push(diagram);
  const auth = await verifyWorkspaceAuthJourney();
  transcript.journeys.push(auth);
  const redis = verifyRedisDown ? await verifyRedisDegradation() : undefined;

  transcript.status = 'passed';
  transcript.completedAt = new Date().toISOString();
  if (redis) {
    transcript.redisDegradation = redis;
  }

  console.log('Live verification passed.');
  console.log(
    `- Template to recommendation: ${template.durationMs}ms (limit ${templateThresholdMs}ms)`,
  );
  console.log(`- Diagram to PDF: ${diagram.durationMs}ms (limit ${diagramThresholdMs}ms)`);
  console.log(`- Workspace auth/RBAC: ${auth.durationMs}ms (limit ${authThresholdMs}ms)`);
  if (redis) {
    console.log(
      `- Redis-down degradation: /health=${redis.healthStatus}, /health/deep=${redis.deepHealthStatus}, data-health HTTP ${redis.dataHealthStatus}`,
    );
  }
} catch (error) {
  transcript.status = 'failed';
  transcript.completedAt = new Date().toISOString();
  transcript.error =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: 'UnknownError', message: String(error) };
  throw error;
} finally {
  if (browser) {
    await browser.close();
  }
  await writeTranscript();
}

async function verifyTemplateRecommendationJourney() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const startedAt = Date.now();
  const steps = [];
  const markStep = (label) => {
    steps.push({ label, atMs: Date.now() - startedAt });
  };

  try {
    await page.goto(webOrigin, { waitUntil: 'domcontentloaded' });
    markStep('opened home page');
    await page.getByRole('button', { name: /web app tier/i }).click();
    markStep('selected web app tier template');
    await page.getByRole('button', { name: /compare costs/i }).click();
    markStep('submitted comparison');
    await page.getByLabel('Provider cost summary').waitFor({
      state: 'visible',
      timeout: templateThresholdMs,
    });
    markStep('provider cost summary visible');
    await page.getByText('Executive monthly baseline').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    markStep('executive recommendation visible');

    const quickActions = page.getByLabel('Comparison quick actions');
    await quickActions.waitFor({ state: 'visible', timeout: 15_000 });
    markStep('comparison quick actions visible');

    await page.getByRole('button', { name: /show full breakdown/i }).click();
    await page.getByRole('button', { name: /hide full breakdown/i }).waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    markStep('expanded full breakdown');

    await page.getByRole('button', { name: /3yr reserved/i }).click();
    markStep('selected reserved 3yr pricing model');

    const downloads = [];
    downloads.push(
      await downloadReport(page, quickActions, {
        buttonName: /^PDF$/,
        notice: 'PDF report generated and downloaded.',
        extension: '.pdf',
        format: 'pdf',
        markStep,
      }),
    );
    downloads.push(
      await downloadReport(page, quickActions, {
        buttonName: /^CSV$/,
        notice: 'CSV report generated and downloaded.',
        extension: '.csv',
        format: 'csv',
        markStep,
      }),
    );
    downloads.push(
      await downloadReport(page, quickActions, {
        buttonName: /^Excel$/,
        notice: 'XLSX report generated and downloaded.',
        extension: '.xlsx',
        format: 'xlsx',
        markStep,
      }),
    );

    await page
      .getByLabel('Region and scale what-if')
      .getByRole('button', { name: /run what-if/i })
      .click();
    await page.getByText(/Scenario comparison .* was generated/).waitFor({
      state: 'visible',
      timeout: 45_000,
    });
    markStep('ran cached region and scale what-if');

    await page.getByRole('button', { name: /create & copy link/i }).click();
    await page.getByText('Public report ready.').waitFor({
      state: 'visible',
      timeout: 45_000,
    });
    markStep('created read-only share link');
    const shareText = await page
      .getByText(/token .+ ·/)
      .first()
      .textContent();
    const shareToken = shareText?.match(/token\s+([A-Za-z0-9._-]+)/)?.[1];
    if (!shareToken) {
      throw new Error(`Expected share token in public report text, got ${shareText ?? 'empty'}`);
    }

    await expectNoHorizontalOverflow(page, 'template recommendation desktop');
    markStep('desktop overflow check passed');

    const durationMs = Date.now() - startedAt;
    assertWithin(durationMs, templateThresholdMs, 'template-to-recommendation journey');

    return {
      name: 'template-to-recommendation',
      status: 'passed',
      durationMs,
      thresholdMs: templateThresholdMs,
      steps,
      pricingModel: 'reserved-3yr',
      exports: downloads,
      whatIf: {
        status: 'passed',
        evidence: 'Scenario comparison generated from existing reviewed form',
      },
      share: {
        status: 'passed',
        tokenPrefix: shareToken.slice(0, 8),
      },
    };
  } finally {
    await context.close();
  }
}

async function verifyDiagramToPdfJourney() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const startedAt = Date.now();
  const steps = [];
  const markStep = (label) => {
    steps.push({ label, atMs: Date.now() - startedAt });
  };

  try {
    await page.goto(webOrigin, { waitUntil: 'domcontentloaded' });
    markStep('opened home page');
    await page.getByRole('tab', { name: /upload diagram/i }).click();
    markStep('opened diagram upload tab');
    await page
      .getByLabel(/upload architecture diagram/i)
      .setInputFiles(path.join(fixtureRoot, 'drawio/web-app.drawio'));
    await page.getByText('Loaded from web-app.drawio').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    markStep('uploaded draw.io fixture');
    await page
      .locator('.diagram-import-panel')
      .getByRole('button', { name: /^Parse diagram$/ })
      .click();
    markStep('submitted diagram parse');
    await page.getByLabel('Diagram parse review').waitFor({
      state: 'visible',
      timeout: 45_000,
    });
    await page.getByText('Parser confidence').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    markStep('diagram review visible');
    await page.getByRole('button', { name: /^Compare costs$/ }).click();
    markStep('submitted comparison from diagram review');
    await page.getByLabel('Provider cost summary').waitFor({
      state: 'visible',
      timeout: 45_000,
    });
    markStep('provider cost summary visible');

    const quickActions = page.getByLabel('Comparison quick actions');
    await quickActions.waitFor({ state: 'visible', timeout: 15_000 });
    markStep('comparison quick actions visible');

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await quickActions.getByRole('button', { name: /^PDF$/ }).click();
    markStep('requested PDF export');
    await page
      .locator('.status-message')
      .filter({ hasText: 'PDF report generated and downloaded.' })
      .waitFor({ state: 'visible', timeout: 60_000 });
    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename();
    if (!suggestedName.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Expected a PDF download, got ${suggestedName}`);
    }
    markStep(`PDF downloaded: ${suggestedName}`);
    await expectNoHorizontalOverflow(page, 'diagram-to-PDF desktop');
    markStep('desktop overflow check passed');

    const durationMs = Date.now() - startedAt;
    assertWithin(durationMs, diagramThresholdMs, 'diagram-to-PDF journey');

    return {
      name: 'diagram-to-PDF',
      status: 'passed',
      durationMs,
      thresholdMs: diagramThresholdMs,
      steps,
      download: {
        suggestedFilename: suggestedName,
      },
    };
  } finally {
    await context.close();
  }
}

async function verifyWorkspaceAuthJourney() {
  const startedAt = Date.now();
  const steps = [];
  const markStep = (label) => {
    steps.push({ label, atMs: Date.now() - startedAt });
  };
  const suffix = randomUUID().slice(0, 8);
  const password = `LiveVerifyPassw0rd!-${suffix}`;
  const ownerEmail = `owner-${suffix}@example.com`;
  const memberEmail = `member-${suffix}@example.com`;

  const owner = await apiJson('/api/v1/auth/register', {
    method: 'POST',
    body: {
      email: ownerEmail,
      password,
      displayName: 'Live Verify Owner',
      teamName: `Live Verify Team ${suffix}`,
    },
    label: 'owner registration',
  });
  const teamId = owner?.team?.id;
  if (!teamId || owner.team?.role !== 'owner' || !owner.token) {
    throw new Error(`Owner registration returned unexpected payload: ${redactedJson(owner)}`);
  }
  markStep('registered owner account and workspace');

  const ownerMe = await apiJson('/api/v1/auth/me', {
    token: owner.token,
    label: 'owner current session',
  });
  if (ownerMe?.activeTeam?.id !== teamId || ownerMe.activeTeam?.role !== 'owner') {
    throw new Error(`Owner session did not hydrate workspace role: ${redactedJson(ownerMe)}`);
  }
  markStep('hydrated owner session and active team role');

  const sessions = await apiJson('/api/v1/auth/sessions', {
    token: owner.token,
    label: 'owner session list',
  });
  if (!Array.isArray(sessions) || !sessions.some((session) => session.current)) {
    throw new Error(
      `Owner sessions did not include the current session: ${redactedJson(sessions)}`,
    );
  }
  markStep('listed current server-side session');

  const invitation = await apiJson(`/api/v1/auth/teams/${teamId}/invitations`, {
    method: 'POST',
    token: owner.token,
    body: {
      email: memberEmail,
      role: 'member',
    },
    label: 'member invitation',
  });
  if (invitation?.status !== 'pending' || invitation.role !== 'member' || !invitation.inviteToken) {
    throw new Error(`Invitation returned unexpected payload: ${redactedJson(invitation)}`);
  }
  markStep('created pending member invitation');

  const preview = await apiJson(
    `/api/v1/auth/invitations/preview/${encodeURIComponent(invitation.inviteToken)}`,
    {
      label: 'invitation preview',
    },
  );
  if (preview?.status !== 'pending' || preview.email !== memberEmail || preview.teamId !== teamId) {
    throw new Error(`Invitation preview returned unexpected payload: ${redactedJson(preview)}`);
  }
  markStep('previewed invitation landing state');

  const member = await apiJson('/api/v1/auth/register', {
    method: 'POST',
    body: {
      email: memberEmail,
      password,
      displayName: 'Live Verify Member',
      teamName: `Live Verify Member ${suffix}`,
    },
    label: 'member registration',
  });
  if (!member?.token || !member.account?.id) {
    throw new Error(`Member registration returned unexpected payload: ${redactedJson(member)}`);
  }
  markStep('registered invited member account');

  const acceptedInvitation = await apiJson('/api/v1/auth/invitations/accept', {
    method: 'POST',
    token: member.token,
    body: {
      token: invitation.inviteToken,
    },
    label: 'invitation acceptance',
  });
  if (
    acceptedInvitation?.status !== 'accepted' ||
    acceptedInvitation.acceptedByAccountId !== member.account.id
  ) {
    throw new Error(
      `Invitation acceptance returned unexpected payload: ${redactedJson(acceptedInvitation)}`,
    );
  }
  markStep('accepted invitation into owner workspace');

  const members = await apiJson(`/api/v1/auth/teams/${teamId}/members`, {
    token: owner.token,
    label: 'team member list',
  });
  const invitedMember = Array.isArray(members)
    ? members.find((candidate) => candidate.email === memberEmail)
    : undefined;
  if (
    !invitedMember ||
    invitedMember.accountId !== member.account.id ||
    invitedMember.role !== 'member'
  ) {
    throw new Error(`Team member list did not include accepted member: ${redactedJson(members)}`);
  }
  markStep('confirmed member appears in workspace member list');

  const promoted = await apiJson(`/api/v1/auth/teams/${teamId}/members/${member.account.id}`, {
    method: 'PATCH',
    token: owner.token,
    body: { role: 'admin' },
    label: 'member promotion',
  });
  if (promoted?.role !== 'admin') {
    throw new Error(`Role promotion returned unexpected payload: ${redactedJson(promoted)}`);
  }
  markStep('promoted member to admin');

  const demoted = await apiJson(`/api/v1/auth/teams/${teamId}/members/${member.account.id}`, {
    method: 'PATCH',
    token: owner.token,
    body: { role: 'member' },
    label: 'member demotion',
  });
  if (demoted?.role !== 'member') {
    throw new Error(`Role demotion returned unexpected payload: ${redactedJson(demoted)}`);
  }
  markStep('demoted member back to member');

  const ssoProvider = {
    providerType: 'oidc',
    displayName: 'PolyCost Live Mock OIDC',
    issuerUrl: 'https://mock-idp.polycost.local',
    clientId: 'polycost-live-verification',
  };
  await apiJson(`/api/v1/auth/teams/${teamId}/sso/providers`, {
    method: 'POST',
    token: owner.token,
    body: ssoProvider,
    label: 'OIDC provider configuration',
  });
  markStep('configured mock OIDC provider');

  const ssoTest = await apiJson(`/api/v1/auth/teams/${teamId}/sso/test-connection`, {
    method: 'POST',
    token: owner.token,
    body: ssoProvider,
    label: 'OIDC provider test connection',
  });
  if (ssoTest?.ok !== true || ssoTest.providerType !== 'oidc') {
    throw new Error(`OIDC test connection returned unexpected payload: ${redactedJson(ssoTest)}`);
  }
  markStep('verified mock OIDC provider connection');

  const ssoStart = await apiJson('/api/v1/auth/sso/oidc/start', {
    method: 'POST',
    body: {
      teamId,
      email: memberEmail,
    },
    label: 'OIDC start',
  });
  if (!ssoStart?.authorizationUrl || ssoStart.providerType !== 'oidc') {
    throw new Error(`OIDC start returned unexpected payload: ${redactedJson(ssoStart)}`);
  }
  markStep('started mock OIDC login');

  const authorize = await apiJson(ssoStart.authorizationUrl, {
    label: 'mock OIDC authorization',
  });
  if (!authorize?.redirectUrl || authorize.email !== memberEmail) {
    throw new Error(`OIDC authorization returned unexpected payload: ${redactedJson(authorize)}`);
  }
  markStep('completed mock OIDC authorization');

  const teamScopedMember = await apiJson(authorize.redirectUrl, {
    label: 'mock OIDC callback',
  });
  if (
    !teamScopedMember?.token ||
    teamScopedMember.team?.id !== teamId ||
    teamScopedMember.team?.role !== 'member' ||
    teamScopedMember.sso?.stateVerified !== true
  ) {
    throw new Error(`OIDC callback returned unexpected payload: ${redactedJson(teamScopedMember)}`);
  }
  markStep('completed mock OIDC callback with team-scoped member session');

  const forbidden = await apiJson('/api/v1/billing/imports/provider-export', {
    method: 'POST',
    token: teamScopedMember.token,
    body: {
      provider: 'aws',
      sourceType: 'aws-cur',
      billingPeriodStart: '2026-07-01',
      billingPeriodEnd: '2026-07-31',
      content:
        'lineItem/ProductCode,lineItem/UsageStartDate,lineItem/UnblendedCost\nAmazonEC2,2026-07-01T00:00:00Z,12.34\n',
      encoding: 'text',
      fileName: 'live-rbac-denial.csv',
    },
    expectedStatus: 403,
    label: 'member billing import RBAC denial',
  });
  if (forbidden?.error?.code !== 'FORBIDDEN') {
    throw new Error(`RBAC denial returned unexpected payload: ${redactedJson(forbidden)}`);
  }
  markStep('confirmed structured 403 for member-only billing import attempt');

  const revoked = await apiJson('/api/v1/auth/sessions/revoke-other', {
    method: 'POST',
    token: owner.token,
    label: 'revoke other sessions',
  });
  if (typeof revoked?.revoked !== 'number') {
    throw new Error(`Session revocation returned unexpected payload: ${redactedJson(revoked)}`);
  }
  markStep('verified server-side revoke-other-sessions endpoint');

  const durationMs = Date.now() - startedAt;
  assertWithin(durationMs, authThresholdMs, 'workspace auth/RBAC journey');

  return {
    name: 'workspace-auth-rbac-sso',
    status: 'passed',
    durationMs,
    thresholdMs: authThresholdMs,
    steps,
    workspace: {
      teamId,
      ownerRole: owner.team.role,
      memberRole: demoted.role,
      invitationStatus: acceptedInvitation.status,
      sessionsListed: sessions.length,
      revokeOtherSessionsStatus: 'passed',
    },
    rbac: {
      deniedEndpoint: '/api/v1/billing/imports/provider-export',
      rbacDeniedStatus: 403,
      errorCode: forbidden.error.code,
    },
    sso: {
      providerType: 'oidc',
      mode: ssoStart.mode,
      stateVerified: teamScopedMember.sso.stateVerified,
    },
  };
}

async function downloadReport(
  page,
  quickActions,
  { buttonName, notice, extension, format, markStep },
) {
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await quickActions.getByRole('button', { name: buttonName }).click();
  markStep(`requested ${format} export`);
  await page.locator('.status-message').filter({ hasText: notice }).waitFor({
    state: 'visible',
    timeout: 60_000,
  });

  const download = await downloadPromise;
  const suggestedFilename = download.suggestedFilename();
  if (!suggestedFilename.toLowerCase().endsWith(extension)) {
    throw new Error(`Expected ${format} download ending ${extension}, got ${suggestedFilename}`);
  }

  markStep(`${format} downloaded: ${suggestedFilename}`);

  return {
    format,
    suggestedFilename,
  };
}

async function verifyRedisDegradation() {
  const startedAt = Date.now();
  recordEvent('redis-degradation', 'initial health check');
  await expectJson(`${apiOrigin}/health`, 'initial health', (body) => body.status === 'ok');

  recordEvent('redis-degradation', 'stopping redis');
  run('docker', ['compose', 'stop', 'redis']);

  try {
    recordEvent('redis-degradation', 'waiting for degraded health');
    const health = await waitForJson(`${apiOrigin}/health`, 'degraded health', (body) => {
      return body.status === 'degraded' && body.dependencies?.cache?.status === 'degraded';
    });
    const deepHealth = await waitForJson(
      `${apiOrigin}/health/deep`,
      'degraded deep health',
      (body) => {
        return (
          ['degraded', 'critical'].includes(body.status) &&
          body.dependencies?.cache?.status === 'degraded'
        );
      },
    );
    const dataHealth = await fetch(`${apiOrigin}/api/v1/data-health`);
    if (!dataHealth.ok) {
      throw new Error(`data-health returned HTTP ${dataHealth.status} while Redis was stopped`);
    }
    await dataHealth.json();
    recordEvent('redis-degradation', 'data-health remained available');

    return {
      status: 'passed',
      durationMs: Date.now() - startedAt,
      healthStatus: health.status,
      deepHealthStatus: deepHealth.status,
      dataHealthStatus: dataHealth.status,
    };
  } finally {
    recordEvent('redis-degradation', 'restarting redis');
    run('docker', ['compose', 'start', 'redis'], { allowFailure: true });
    await waitForJson(`${apiOrigin}/health`, 'restored health', (body) => body.status === 'ok');
    recordEvent('redis-degradation', 'redis restored');
  }
}

async function expectJson(url, label, predicate) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }

  const body = await response.json();
  if (!predicate(body)) {
    throw new Error(`${label} returned unexpected payload: ${JSON.stringify(body)}`);
  }

  return body;
}

async function waitForJson(url, label, predicate) {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await expectJson(url, label, predicate);
    } catch (error) {
      lastError = error;
    }

    await delay(1_000);
  }

  throw lastError ?? new Error(`${label} was not ready`);
}

async function apiJson(
  pathOrUrl,
  { method = 'GET', token, body, expectedStatus, label = pathOrUrl, headers = {} } = {},
) {
  const expectedStatuses = Array.isArray(expectedStatus)
    ? expectedStatus
    : [expectedStatus ?? (method.toUpperCase() === 'POST' ? [200, 201] : 200)].flat();
  const requestHeaders = {
    accept: 'application/json',
    ...headers,
  };
  if (body !== undefined) {
    requestHeaders['content-type'] = 'application/json';
  }
  if (token) {
    requestHeaders.authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildApiUrl(pathOrUrl), {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `${label} returned non-JSON HTTP ${response.status}: ${text.slice(0, 200)} (${error.message})`,
      );
    }
  }

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${label} returned HTTP ${response.status}, expected ${expectedStatuses.join('/')}: ${redactedJson(parsed)}`,
    );
  }

  return parsed;
}

function buildApiUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const url = new URL(pathOrUrl);
    if (url.pathname.startsWith('/api/v1/')) {
      const origin = new URL(apiOrigin);
      url.protocol = origin.protocol;
      url.host = origin.host;
      return url.toString();
    }

    return pathOrUrl;
  }

  return `${apiOrigin}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

function redactedJson(value) {
  return JSON.stringify(value, (key, nestedValue) =>
    sensitiveTranscriptKeys.has(key) ? '[redacted]' : nestedValue,
  );
}

async function expectNoHorizontalOverflow(page, label) {
  const overflowPixels = await page.evaluate(() => {
    const rootElement = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(rootElement.scrollWidth, body.scrollWidth);
    const viewportWidth = Math.max(rootElement.clientWidth, window.innerWidth);

    return scrollWidth - viewportWidth;
  });

  if (overflowPixels > 1) {
    throw new Error(`${label} has ${overflowPixels}px horizontal overflow`);
  }
}

function assertWithin(durationMs, thresholdMs, label) {
  if (durationMs > thresholdMs) {
    throw new Error(`${label} took ${durationMs}ms, exceeding ${thresholdMs}ms`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    if (options.allowFailure) {
      console.warn(`${command} ${args.join(' ')} failed: ${result.error.message}`);
      return result;
    }

    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }

  return result;
}

function recordEvent(scope, message, details = {}) {
  transcript.events.push({
    scope,
    message,
    at: new Date().toISOString(),
    ...details,
  });
}

async function writeTranscript() {
  transcript.completedAt ??= new Date().toISOString();
  await mkdir(path.dirname(transcriptPath), { recursive: true });
  await writeFile(`${transcriptPath}.tmp`, `${JSON.stringify(transcript, null, 2)}\n`, 'utf8');
  await writeFile(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`, 'utf8');
  console.log(`Live verification transcript written to ${transcriptPath}`);
}

function delay(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
