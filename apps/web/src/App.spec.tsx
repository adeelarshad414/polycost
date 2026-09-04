import React, { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { App, ComparisonView, ScrollProgressBar } from './App';
import { PolyCostClient, PolyCostApiError } from './api-client';
import {
  BackendHealthResponse,
  ComparisonResult,
  DataHealthResponse,
  DiagramParseResult,
  NormalizedWorkloadSpec,
  ParsedNwsDraft,
  PricingStatusResponse,
  RegionCatalogResponse,
  ReportExportJobResponse,
  TerraformGenerationResult,
} from './types';
import { intervalMultiplierFromMonthly } from './cost-time';
import { buildNwsFromForm, defaultWorkloadForm } from './workload';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const comparisonResult: ComparisonResult = {
  comparisonId: '11111111-1111-4111-8111-111111111111',
  pricingAsOf: '2026-06-29T00:00:00.000Z',
  cheapestProviderId: 'gcp',
  providers: [provider('aws', 42), provider('azure', 38), provider('gcp', 30, true)],
};

// Clear ALL persisted state between tests. Removing a hand-maintained list of
// keys let polycost-pricing-model leak between tests: a test that selected a
// commitment term left it set, so a later test asserting the default
// 'on-demand' export failed depending on execution order (jest --randomize
// reproduced it every run). Clearing wholesale fixes this and any future key.
function clearPolyCostStorage(): void {
  window.localStorage.clear();
  window.sessionStorage.clear();
}

describe('App', () => {
  const originalCreateObjectUrl = window.URL.createObjectURL;
  const originalRevokeObjectUrl = window.URL.revokeObjectURL;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    clearPolyCostStorage();
    window.history.pushState({}, '', '/');
    window.URL.createObjectURL = jest.fn(() => 'blob:polycost-report');
    window.URL.revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectUrl;
    window.URL.revokeObjectURL = originalRevokeObjectUrl;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.themeChoice = 'light';
    clearPolyCostStorage();
    window.history.pushState({}, '', '/');
  });

  it('runs the structured-form comparison flow', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    expect(text(container)).toContain('Multi-cloud cost clarity, in one place.');
    expect(buttonByText(container, 'Guided form').getAttribute('aria-selected')).toBe('true');
    expect(buttonByText(container, 'Paste / parse').getAttribute('aria-selected')).toBe('false');
    expect(buttonByText(container, 'Compare costs')).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector('.landing-comparison')).toBeNull();
    expect(container.querySelector('.comparison-toolbar')).toBeNull();
    expect(container.querySelector('.workbench-results')).toBeNull();
    expect(container.querySelector<HTMLDetailsElement>('.initial-optional-estimate')?.open).toBe(
      false,
    );

    await click(buttonByText(container, 'Compare costs'));
    await settleAsyncEffects();

    expect(text(container)).toContain('Requirements');
    expect(text(container)).toContain('Manual entry');
    expect(text(container)).toContain(
      'Web app · Virtual machines · 2 vCPU · 4GB · US East (AWS us-east-1 · Azure eastus · GCP us-east1)',
    );
    expect(text(container)).toContain('Best value');
    expect(text(container)).toContain('Monthly estimate');
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(3);

    // The detail used to sit behind one collapsed disclosure. It is a tab strip
    // now: four panels, exactly one visible, the rest present but hidden so the
    // report still prints whole.
    const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
    const panels = Array.from(container.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    expect(tabs).toHaveLength(4);
    expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(panels.filter((panel) => !panel.hasAttribute('hidden'))).toHaveLength(1);
    expect(client.validateWorkload).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: '1.0',
        workload: expect.objectContaining({ type: 'web_app' }),
        compute: [expect.objectContaining({ instanceCount: 1, memoryGb: 4, vcpu: 2 })],
        storage: [],
      }),
    );
    expect(client.createComparison).toHaveBeenCalled();
    expect(client.getComparisonAnalytics).toHaveBeenCalledWith(comparisonResult.comparisonId);
    expect(client.getComparisonPricingEvidence).toHaveBeenCalledWith(comparisonResult.comparisonId);
    expect(text(container)).not.toContain('Comparison ready.');
    expect(text(container)).toContain('Server analytics');
    expect(text(container)).toContain('Coverage');
    expect(text(container)).toContain('Deltas');
    expect(text(container)).toContain('Findings');
    expect(text(container)).toContain('AWS');
    expect(text(container)).toContain('Azure');
    expect(text(container)).toContain('GCP');
    expect(
      JSON.parse(window.localStorage.getItem('polycost-comparison-history-v1') ?? '[]')[0],
    ).toMatchObject({
      comparisonId: comparisonResult.comparisonId,
      cheapestProviderId: 'gcp',
      providerCount: 3,
    });
    expect(text(container)).toContain('Executive monthly baseline');
    expect(text(container)).toContain('Provider mix');
    expect(text(container)).toContain('Cost composition waterfall');
    expect(text(container)).toContain('Backend compute base');
    expect(text(container)).toContain('Pricing model comparison');
    expect(text(container)).toContain('On-demand vs commitments');
    expect(text(container)).toContain('Break-even timeline');
    expect(text(container)).toContain('Backend committed use');
    expect(container.querySelectorAll('.executive-provider-card')).toHaveLength(3);
    expect(container.querySelector('.executive-pricing-bars')).toBeInstanceOf(HTMLElement);
    expect(container.querySelector('.executive-break-even-card')).toBeInstanceOf(HTMLElement);
    expect(text(container)).toContain('Server projection');
    expect(text(container)).toContain('$90.00 over 90 days');
    expect(container.querySelector('.recharts-wrapper')).toBeInstanceOf(HTMLElement);
    // The disclosure is a tab strip now; its four labels replace that title.
    expect(text(container)).toContain('Executive brief');
    expect(text(container)).toContain('Cost controls');
    expect(text(container)).toContain('Calculators & exports');
    // These used to assert the collapsed disclosure rendered nothing. Panels now
    // stay mounted so the report still prints whole, so the contract is that
    // inactive content is HIDDEN rather than absent - present for print and for
    // assistive tech that follows the tab, invisible on screen.
    const hiddenText = Array.from(
      container.querySelectorAll<HTMLElement>('[role="tabpanel"][hidden]'),
    )
      .map((panel) => panel.textContent ?? '')
      .join(' ');

    expect(hiddenText).toContain('Engineering cost controls');
    expect(hiddenText).toContain('Service driver split');
    expect(hiddenText).toContain('Architecture & engineering evidence');
    expect(hiddenText).not.toContain('Executive decision brief');
    // Same reasoning: these live in hidden panels rather than being unrendered.
    const calculatorLink = container.querySelector<HTMLAnchorElement>(
      'a[href="https://calculator.aws/#/"]',
    );
    expect(calculatorLink?.closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(true);
    expect(hiddenText).toContain('Resource name');
    expect(hiddenText).toContain('Export CSV');
    expect(text(container)).not.toContain('SKU/spec pending API field');

    unmount();
  });

  it('signs into the workspace control center and loads team readiness data', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    // Hidden until asked for; the header button is the way in.
    expect(text(container)).not.toContain('Actuals reconciliation');
    await openWorkspace(container);

    expect(text(container)).toContain('Workspace session');
    expect(text(container)).toContain('Actuals reconciliation');

    await submitForm(container.querySelector<HTMLFormElement>('.workspace-auth-form'));
    await settleAsyncEffects();
    await settleAsyncEffects();

    expect(client.login).toHaveBeenCalledWith({
      email: 'architect@example.com',
      password: 'correct horse battery staple',
    });
    expect(window.localStorage.getItem('polycost-auth-session-v1')).toBe('session-token');
    expect(client.getCurrentSession).toHaveBeenCalledWith('session-token');
    expect(client.listAccountSessions).toHaveBeenCalledWith('session-token');
    expect(client.listTeamMembers).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      'session-token',
    );
    expect(client.listTeamInvitations).toHaveBeenCalled();
    expect(client.listTeamScimTokens).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      'session-token',
    );
    expect(client.listTeamScimUsers).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      'session-token',
    );
    expect(client.getSsoStatus).toHaveBeenCalledWith('session-token');
    expect(text(container)).toContain('Architecture team · owner');
    expect(text(container)).toContain('Architect');
    expect(window.localStorage.getItem('polycost-auth-session-expires-at-v1')).toBe(
      '2099-07-07T00:00:00.000Z',
    );
    expect(text(container)).toContain('Session active');
    expect(text(container)).toContain('No silent refresh');
    expect(selectByWorkspaceLabel(container, 'Active team').value).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
    expect(text(container)).toContain('OIDC ready · SAML ready');
    expect(text(container)).toContain('SCIM provisioning');
    expect(text(container)).toContain('0 active tokens · 0 active users');
    expect(text(container)).toContain('Current · last seen');
    expect(text(container)).toContain('expires');
    expect(text(container)).toContain('Other · last seen');

    await click(buttonByText(container, 'Sign out other devices'));
    expect(client.revokeOtherSessions).toHaveBeenCalledWith('session-token');
    expect(text(container)).not.toContain('Other · last seen');

    await click(buttonByText(container, 'Sign out'));
    expect(client.logout).toHaveBeenCalledWith('session-token');
    expect(window.localStorage.getItem('polycost-auth-session-v1')).toBeNull();

    unmount();
  });

  it('keeps the panels that loaded when one workspace directory call fails (FE-5)', async () => {
    const client = clientMock({
      listTeamAuditEvents: jest.fn(async () => {
        throw new PolyCostApiError(503, 'AUDIT_UNAVAILABLE', 'audit log temporarily unavailable');
      }),
    });
    const { container, unmount } = render(<App client={client} />);
    await openWorkspace(container);

    await submitForm(container.querySelector<HTMLFormElement>('.workspace-auth-form'));
    await settleAsyncEffects();
    await settleAsyncEffects();

    // The audit call rejected, but the five that succeeded must still render —
    // under the old Promise.all this would have discarded all of them.
    expect(client.listTeamAuditEvents).toHaveBeenCalled();
    expect(text(container)).toContain('OIDC ready · SAML ready');
    expect(text(container)).toContain('SCIM provisioning');
    expect(text(container)).toContain('Architecture team · owner');

    unmount();
  });

  it('clears expired stored workspace sessions while leaving anonymous comparison usable', async () => {
    window.localStorage.setItem('polycost-auth-session-v1', 'expired-token');
    window.localStorage.setItem('polycost-auth-session-expires-at-v1', '2000-01-01T00:00:00.000Z');
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();

    expect(client.getCurrentSession).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('polycost-auth-session-v1')).toBeNull();
    expect(window.localStorage.getItem('polycost-auth-session-expires-at-v1')).toBeNull();
    expect(text(container)).toContain('Workspace session expired');
    expect(text(container)).toContain('Anonymous comparisons still work');

    await click(buttonByText(container, 'Compare costs'));
    await settleAsyncEffects();

    expect(client.createComparison).toHaveBeenCalled();
    expect(text(container)).toContain('GCP leads at $30.00');

    unmount();
  });

  it('executes team invite, role, remove, and invite-acceptance actions', async () => {
    window.localStorage.setItem('polycost-auth-session-v1', 'session-token');
    const client = clientMock({
      listTeamMembers: jest.fn(async () => [
        {
          accountId: '11111111-1111-4111-8111-111111111111',
          email: 'architect@example.com',
          displayName: 'Architect',
          role: 'owner' as const,
          createdAt: '2026-07-06T00:00:00.000Z',
        },
        {
          accountId: '22222222-aaaa-4aaa-8aaa-222222222222',
          email: 'analyst@example.com',
          displayName: 'FinOps Analyst',
          role: 'member' as const,
          createdAt: '2026-07-06T00:00:00.000Z',
        },
      ]),
      updateTeamMemberRole: jest.fn(async (_teamId, accountId, role) => ({
        accountId,
        email: 'analyst@example.com',
        displayName: 'FinOps Analyst',
        role,
        createdAt: '2026-07-06T00:00:00.000Z',
      })),
    });
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();
    await settleAsyncEffects();

    await changeInput(inputByWorkspaceLabel(container, 'Invite email'), 'new-finops@example.com');
    await changeSelect(selectByWorkspaceLabel(container, 'Role'), 'admin');
    await submitForm(formContainingText(container, 'Invite email'));

    expect(client.inviteTeamMember).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      {
        email: 'new-finops@example.com',
        role: 'admin',
      },
      'session-token',
    );
    expect(text(container)).toContain('Invite token: invite-token');
    expect(text(container)).toContain('new-finops@example.com');
    expect(text(container)).toContain('admin invite');

    const memberRoleSelect = selectByAriaLabel(container, 'Change role for analyst@example.com');

    await changeSelect(memberRoleSelect, 'admin');
    expect(client.updateTeamMemberRole).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '22222222-aaaa-4aaa-8aaa-222222222222',
      'admin',
      'session-token',
    );
    expect(text(container)).toContain('Admin');

    await click(buttonByAriaLabel(container, 'Remove analyst@example.com'));
    expect(client.removeTeamMember).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '22222222-aaaa-4aaa-8aaa-222222222222',
      'session-token',
    );
    expect(text(container)).not.toContain('FinOps Analyst');

    await changeInput(inputByWorkspaceLabel(container, 'Accept invite token'), 'invite-token');
    await submitForm(formContainingText(container, 'Accept invite token'));
    expect(client.acceptTeamInvitation).toHaveBeenCalledWith('invite-token', 'session-token');

    unmount();
  });

  it('creates and revokes SCIM tokens from team admin controls', async () => {
    window.localStorage.setItem('polycost-auth-session-v1', 'session-token');
    const createdScimToken = {
      id: 'scim-token-1',
      teamId: '22222222-2222-4222-8222-222222222222',
      displayName: 'Okta production SCIM',
      tokenPrefix: 'pc_scim_new',
      token: 'pc_scim_new-secret',
      createdAt: '2026-07-09T00:00:00.000Z',
    };
    const persistedCreatedScimToken = {
      id: createdScimToken.id,
      teamId: createdScimToken.teamId,
      displayName: createdScimToken.displayName,
      tokenPrefix: createdScimToken.tokenPrefix,
      createdAt: createdScimToken.createdAt,
    };
    const existingScimToken = {
      id: 'scim-token-existing',
      teamId: '22222222-2222-4222-8222-222222222222',
      displayName: 'Okta staging SCIM',
      tokenPrefix: 'pc_scim_stage',
      createdAt: '2026-07-08T00:00:00.000Z',
      lastUsedAt: '2026-07-09T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
    };
    const revokedScimToken = {
      ...persistedCreatedScimToken,
      revokedAt: '2026-07-09T01:00:00.000Z',
    };
    const client = clientMock({
      listTeamScimTokens: jest
        .fn()
        .mockResolvedValueOnce([existingScimToken])
        .mockResolvedValueOnce([persistedCreatedScimToken, existingScimToken])
        .mockResolvedValueOnce([revokedScimToken, existingScimToken]),
      listTeamScimUsers: jest.fn(async () => [
        {
          id: 'scim-user-1',
          teamId: '22222222-2222-4222-8222-222222222222',
          externalId: 'idp-user-1',
          accountId: '44444444-4444-4444-8444-444444444444',
          userName: 'engineer@example.com',
          displayName: 'Platform Engineer',
          active: true,
          createdAt: '2026-07-09T00:00:00.000Z',
          updatedAt: '2026-07-09T00:15:00.000Z',
        },
      ]),
      createTeamScimToken: jest.fn(async () => createdScimToken),
      revokeTeamScimToken: jest.fn(async () => revokedScimToken),
    });
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();
    await settleAsyncEffects();

    expect(text(container)).toContain('1 active tokens · 1 active users');
    expect(text(container)).toContain('Okta staging SCIM');
    expect(text(container)).toContain('Platform Engineer');

    await changeInput(inputByWorkspaceLabel(container, 'SCIM token name'), 'Okta production SCIM');
    await submitForm(formContainingText(container, 'SCIM token name'));
    await settleAsyncEffects();

    expect(client.createTeamScimToken).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      { displayName: 'Okta production SCIM' },
      'session-token',
    );
    expect(text(container)).toContain('SCIM token: pc_scim_new-secret');
    expect(text(container)).toContain('2 active tokens · 1 active users');

    await click(buttonByAriaLabel(container, 'Revoke SCIM token Okta production SCIM'));
    await settleAsyncEffects();

    expect(client.revokeTeamScimToken).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      'scim-token-1',
      'session-token',
    );
    expect(text(container)).not.toContain('SCIM token: pc_scim_new-secret');
    expect(text(container)).toContain('1 active tokens · 1 active users');

    unmount();
  });

  it('shows invite delivery status when webhook delivery hides raw tokens', async () => {
    window.localStorage.setItem('polycost-auth-session-v1', 'session-token');
    const client = clientMock({
      inviteTeamMember: jest.fn(async (_teamId, input) => ({
        id: '99999999-9999-4999-8999-999999999999',
        teamId: '22222222-2222-4222-8222-222222222222',
        email: input.email,
        role: input.role,
        status: 'pending' as const,
        invitedByAccountId: '11111111-1111-4111-8111-111111111111',
        expiresAt: '2026-07-13T00:00:00.000Z',
        createdAt: '2026-07-06T00:00:00.000Z',
        delivery: {
          mode: 'webhook' as const,
          status: 'accepted' as const,
          message: 'Invite delivery webhook accepted the invitation.',
          tokenExposedInResponse: false,
          deliveredAt: '2026-07-06T00:00:01.000Z',
        },
      })),
    });
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();
    await settleAsyncEffects();

    await changeInput(inputByWorkspaceLabel(container, 'Invite email'), 'delivered@example.com');
    await submitForm(formContainingText(container, 'Invite email'));

    expect(text(container)).toContain('Delivery: Invite delivery webhook accepted the invitation.');
    expect(text(container)).not.toContain('Invite token:');

    unmount();
  });

  it('executes account lifecycle, team settings, invite revoke, and SSO actions', async () => {
    window.localStorage.setItem('polycost-auth-session-v1', 'session-token');
    const client = clientMock({
      listTeamInvitations: jest.fn(async () => [
        {
          id: '88888888-8888-4888-8888-888888888888',
          teamId: '22222222-2222-4222-8222-222222222222',
          email: 'finops@example.com',
          role: 'member' as const,
          status: 'pending' as const,
          invitedByAccountId: '11111111-1111-4111-8111-111111111111',
          expiresAt: '2026-07-13T00:00:00.000Z',
          createdAt: '2026-07-06T00:00:00.000Z',
        },
      ]),
    });
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();
    await settleAsyncEffects();

    await changeInput(inputByWorkspaceLabel(container, 'Profile email'), 'principal@example.com');
    await changeInput(inputByWorkspaceLabel(container, 'Display name'), 'Principal Architect');
    await changeInput(
      inputByWorkspaceLabel(container, 'Current password (email changes)'),
      'current-password',
    );
    await submitForm(formContainingText(container, 'Profile email'));

    expect(client.updateAccountProfile).toHaveBeenCalledWith(
      {
        email: 'principal@example.com',
        displayName: 'Principal Architect',
        currentPassword: 'current-password',
      },
      'session-token',
    );

    await changeInput(inputByWorkspaceLabel(container, 'Current password'), 'current-password');
    await changeInput(inputByWorkspaceLabel(container, 'New password'), 'new-password-1234');
    await submitForm(formContainingText(container, 'New password'));

    expect(client.changePassword).toHaveBeenCalledWith(
      {
        currentPassword: 'current-password',
        newPassword: 'new-password-1234',
      },
      'session-token',
    );

    await click(buttonByText(container, 'Resend'));
    expect(client.resendTeamInvitation).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '88888888-8888-4888-8888-888888888888',
      'session-token',
    );
    expect(text(container)).toContain('Invite token: refreshed-invite-token');

    await click(buttonByText(container, 'Revoke'));
    expect(client.revokeTeamInvitation).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '88888888-8888-4888-8888-888888888888',
      'session-token',
    );
    expect(text(container)).not.toContain('finops@example.com');

    await changeInput(inputByWorkspaceLabel(container, 'Issuer URL'), 'https://idp.example.com');
    await changeInput(inputByWorkspaceLabel(container, 'Client ID'), 'polycost-client');
    await submitForm(formContainingText(container, 'SSO provider'));

    expect(client.configureSsoProvider).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      expect.objectContaining({
        providerType: 'oidc',
        issuerUrl: 'https://idp.example.com',
        clientId: 'polycost-client',
      }),
      'session-token',
    );
    expect(text(container)).toContain('OIDC configured · SAML ready');

    await click(buttonByText(container, 'Test connection'));
    expect(client.testSsoConnection).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      expect.objectContaining({
        providerType: 'oidc',
        issuerUrl: 'https://idp.example.com',
      }),
      'session-token',
    );

    await changeInput(inputByWorkspaceLabel(container, 'New team'), 'Platform Council');
    await submitForm(formContainingText(container, 'New team'));
    await settleAsyncEffects();

    expect(client.createTeam).toHaveBeenCalledWith(
      {
        teamName: 'Platform Council',
      },
      'session-token',
    );
    expect(client.switchActiveTeam).toHaveBeenCalledWith(
      '55555555-5555-4555-8555-555555555555',
      'session-token',
    );
    expect(selectByWorkspaceLabel(container, 'Active team').value).toBe(
      '55555555-5555-4555-8555-555555555555',
    );
    expect(text(container)).toContain('Team created and selected: Platform Council.');

    await changeInput(inputByWorkspaceLabel(container, 'Current team name'), 'Platform Guild');
    await submitForm(formContainingText(container, 'Current team name'));

    expect(client.updateTeamSettings).toHaveBeenCalledWith(
      '55555555-5555-4555-8555-555555555555',
      {
        teamName: 'Platform Guild',
      },
      'session-token',
    );

    await changeInput(inputByWorkspaceLabel(container, 'Delete confirmation'), 'DELETE');
    await changeInput(
      inputByWorkspaceLabel(container, 'Delete current password'),
      'current-password',
    );
    await submitForm(formContainingText(container, 'Delete confirmation'));

    expect(client.deleteAccount).toHaveBeenCalledWith(
      {
        confirmation: 'DELETE',
        currentPassword: 'current-password',
      },
      'session-token',
    );
    expect(window.localStorage.getItem('polycost-auth-session-v1')).toBeNull();

    unmount();
  });

  it('starts and completes the mock OIDC workspace session flow', async () => {
    window.localStorage.setItem('polycost-auth-session-v1', 'session-token');
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();
    await settleAsyncEffects();

    await changeInput(inputByWorkspaceLabel(container, 'Mock OIDC email'), 'sso-user@example.com');
    await click(buttonByText(container, 'Start mock OIDC'));

    expect(client.startMockOidcLogin).toHaveBeenCalledWith({
      teamId: '22222222-2222-4222-8222-222222222222',
      email: 'sso-user@example.com',
    });
    expect(text(container)).toContain('Mock authorization:');
    expect(text(container)).toContain('/api/v1/auth/sso/mock/oidc/authorize');

    await click(buttonByText(container, 'Complete callback'));
    await settleAsyncEffects();

    expect(client.completeMockOidcCallback).toHaveBeenCalledWith({
      state: 'signed',
      email: 'sso-user@example.com',
    });
    expect(window.localStorage.getItem('polycost-auth-session-v1')).toBe('sso-session-token');
    expect(window.localStorage.getItem('polycost-auth-session-expires-at-v1')).toBe(
      '2099-07-07T00:00:00.000Z',
    );
    expect(client.getCurrentSession).toHaveBeenCalledWith('sso-session-token');

    unmount();
  });

  it('imports provider billing exports and reconciles them after a comparison exists', async () => {
    window.localStorage.setItem('polycost-auth-session-v1', 'session-token');
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();
    await click(buttonByText(container, 'Compare costs'));
    await settleAsyncEffects();
    await settleAsyncEffects();

    await changeSelect(selectByWorkspaceLabel(container, 'Provider'), 'azure');
    await submitForm(container.querySelector<HTMLFormElement>('.workspace-billing-panel'));

    expect(client.importProviderBillingExport).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'azure',
        sourceType: 'azure-cost-management',
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        content: expect.stringContaining('Virtual Machines'),
      }),
      'session-token',
    );
    expect(client.reconcileBillingImport).toHaveBeenCalledWith(
      '55555555-5555-4555-8555-555555555555',
      comparisonResult.comparisonId,
      'session-token',
    );
    expect(text(container)).toContain('variance-warning');
    expect(text(container)).toContain('$7.00 variance');
    expect(text(container)).toContain('reconciled evidence ready');
    expect(text(container)).toContain('100% source fingerprinted');
    expect(text(container)).toContain('100% SKU matched');
    expect(text(container)).toContain('Usage-comparable variance $0.00');
    expect(text(container)).toContain('Invoice-grade readiness: invoice grade blocked');
    expect(text(container)).toContain('3 missing');
    expect(text(container)).toContain('2 partial');
    expect(text(container)).toContain(
      'Invoice blockers: Provider invoice control total, Commitment amortization evidence, Private pricing and discount proof',
    );
    expect(text(container)).toContain('Commitments: 4 rows');
    expect(text(container)).toContain('net -$2.00');
    expect(text(container)).toContain('discount -$25.00');
    expect(text(container)).toContain(
      'Commitment evidence needed: 4 inventory · 2 amortization · 4 allocation',
    );
    expect(text(container)).toContain('Adjustments: tax $8.00');
    expect(text(container)).toContain('Artifact metadata: 0 registered · 0 verified');

    await click(buttonByText(container, 'Register invoice artifact'));
    await settleAsyncEffects();

    expect(client.registerInvoiceGradeArtifact).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      expect.objectContaining({
        type: 'provider-invoice',
        displayName: 'AWS invoice control packet',
        reference: 'demo://invoice-artifacts/66666666-6666-4666-8666-666666666666',
        controlTotalUsd: 107,
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
      }),
      'session-token',
    );
    expect(text(container)).toContain(
      'Artifact metadata: 1 registered · 0 verified · metadata registered not verified',
    );
    expect(text(container)).toContain('Artifact file not stored yet');
    expect(text(container)).toContain('Artifact metadata is registered for traceability only');

    await click(buttonByText(container, 'Store artifact file'));
    await settleAsyncEffects();

    expect(client.uploadInvoiceArtifactBlob).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      expect.objectContaining({
        fileName: 'aws-invoice-control-66666666.txt',
        mimeType: 'text/plain',
        encoding: 'text',
        retentionDays: 365,
        legalHold: false,
        content: expect.stringContaining('artifact_id=artifact-1'),
      }),
      'session-token',
    );
    expect(text(container)).toContain('Stored file: aws-invoice-control-66666666.txt');
    expect(text(container)).toContain('sha256 dddddddddddd');
    expect(text(container)).toContain('Governance: scan passed');
    expect(text(container)).toContain('legal hold off');
    expect(text(container)).toContain('KMS required for production');
    expect(text(container)).toContain('Review queue: not requested');

    await click(buttonByText(container, 'Place legal hold'));
    await settleAsyncEffects();

    expect(client.setInvoiceArtifactLegalHold).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      expect.objectContaining({
        legalHold: true,
        reason: 'Placed from workspace demo panel before retention enforcement.',
      }),
      'session-token',
    );
    expect(text(container)).toContain('legal hold on');
    expect(text(container)).toContain('Release legal hold');

    await click(buttonByText(container, 'Send to review'));
    await settleAsyncEffects();

    expect(client.updateInvoiceArtifactReview).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      expect.objectContaining({
        reviewStatus: 'pending',
        reviewer: 'finance-review@example.com',
        notes: 'Submitted from workspace panel for finance/legal artifact review.',
      }),
      'session-token',
    );
    expect(text(container)).toContain('Review queue: pending');
    expect(text(container)).toContain('finance-review@example.com');
    expect(text(container)).toContain('pending 1');

    await click(buttonByText(container, 'Approve review'));
    await settleAsyncEffects();

    expect(client.updateInvoiceArtifactReview).toHaveBeenLastCalledWith(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      expect.objectContaining({
        reviewStatus: 'approved',
        reviewer: 'finance-review@example.com',
        evidenceReference: 'review://invoice-artifacts/artifact-1/approved',
      }),
      'session-token',
    );
    expect(text(container)).toContain('Review queue: approved');
    expect(text(container)).toContain('approved 1');
    expect(text(container)).toContain('Policy exception: not requested');

    await click(buttonByText(container, 'Request exception'));
    await settleAsyncEffects();

    expect(client.updateInvoiceArtifactPolicyException).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      expect.objectContaining({
        exceptionStatus: 'requested',
        reviewer: 'risk-review@example.com',
        reason:
          'Requesting a time-boxed policy exception while provider invoice-of-record evidence is still incomplete.',
        notes:
          'Queued for policy owner review with explicit expiry target and invoice-grade caveat.',
      }),
      'session-token',
    );
    expect(text(container)).toContain('Policy exception: requested');
    expect(text(container)).toContain('risk-review@example.com');
    expect(text(container)).toContain('requested 1');

    await click(buttonByText(container, 'Approve exception'));
    await settleAsyncEffects();

    expect(client.updateInvoiceArtifactPolicyException).toHaveBeenLastCalledWith(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      expect.objectContaining({
        exceptionStatus: 'approved',
        reviewer: 'risk-review@example.com',
        reason:
          'Approving a time-boxed exception for demo governance review; invoice-grade validation remains blocked.',
        evidenceReference: 'exception://invoice-artifacts/artifact-1/approved',
      }),
      'session-token',
    );
    expect(text(container)).toContain('Policy exception: approved');
    expect(text(container)).toContain('approved 1');

    await click(buttonByText(container, 'Download stored file'));
    await settleAsyncEffects();

    expect(client.downloadInvoiceArtifactBlob).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      'session-token',
    );
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();

    await click(buttonByText(container, 'Verify artifact evidence'));
    await settleAsyncEffects();

    expect(client.verifyInvoiceGradeArtifact).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      expect.objectContaining({
        verificationStatus: 'verified',
        evidenceReference: 'review://invoice-artifacts/artifact-1',
        controlTotalUsd: 107,
        sha256: 'd'.repeat(64),
      }),
      'session-token',
    );
    expect(text(container)).toContain(
      'Artifact metadata: 1 registered · 1 verified · registered with verified artifacts',
    );

    await click(buttonByText(container, 'Validate invoice control'));
    await settleAsyncEffects();

    expect(client.validateInvoiceControlPacket).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      expect.objectContaining({
        acceptedVarianceUsd: 0.01,
        evidenceReference: 'invoice-control://invoice-artifacts/artifact-1',
      }),
      'session-token',
    );
    expect(text(container)).toContain(
      'Invoice control: matched · reconciliation delta $0.00 · import delta $0.00 · period matched',
    );

    await click(buttonByText(container, 'Download evidence packet'));
    await settleAsyncEffects();

    expect(client.exportInvoiceEvidencePacket).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      'session-token',
    );
    expect(window.URL.createObjectURL).toHaveBeenLastCalledWith(expect.any(Blob));
    expect(text(container)).toContain(
      'Invoice evidence packet downloaded (blocked; sha256 ffffffffffff).',
    );

    unmount();
  });

  it('guards billing import until sign-in and supports workspace registration', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);
    await openWorkspace(container);

    await submitForm(container.querySelector<HTMLFormElement>('.workspace-billing-panel'));

    expect(text(container)).toContain('Sign in before importing provider billing exports.');
    expect(client.importProviderBillingExport).not.toHaveBeenCalled();

    await click(buttonByText(container, 'Register'));

    expect(text(container)).toContain('Display name');
    expect(text(container)).toContain('Team name');

    await changeInput(inputByWorkspaceLabel(container, 'Display name'), 'Platform Owner');
    await changeInput(inputByWorkspaceLabel(container, 'Team name'), 'Coverage Team');
    await submitForm(container.querySelector<HTMLFormElement>('.workspace-auth-form'));
    await settleAsyncEffects();
    await settleAsyncEffects();

    expect(client.register).toHaveBeenCalledWith({
      email: 'architect@example.com',
      password: 'correct horse battery staple',
      displayName: 'Platform Owner',
      teamName: 'Coverage Team',
    });
    expect(window.localStorage.getItem('polycost-auth-session-v1')).toBe('session-token');
    expect(text(container)).toContain('Workspace registered.');

    unmount();
  });

  it('shows the team admin empty state for member workspace sessions', async () => {
    window.localStorage.setItem('polycost-auth-session-v1', 'session-token');
    const client = clientMock({
      getCurrentSession: jest.fn(async () => ({
        account: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'architect@example.com',
          displayName: 'Viewer',
        },
        activeTeam: {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Architecture team',
          role: 'member' as const,
        },
        teams: [
          {
            teamId: '22222222-2222-4222-8222-222222222222',
            teamName: 'Architecture team',
            role: 'member' as const,
          },
        ],
        session: {
          id: '33333333-3333-4333-8333-333333333333',
          expiresAt: '2026-07-07T00:00:00.000Z',
        },
      })),
    });
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();
    await settleAsyncEffects();

    expect(text(container)).toContain('Architecture team · member');
    expect(text(container)).toContain('Admin required');
    expect(text(container)).toContain(
      'Sign in as a team owner or admin to manage members, issue invite and SCIM tokens, and review SSO status.',
    );
    expect(text(container)).toContain(
      'Owner or admin role required for billing import and reconciliation.',
    );
    expect(selectByWorkspaceLabel(container, 'Provider').disabled).toBe(true);
    expect(buttonByText(container, 'Import & reconcile').disabled).toBe(true);
    expect(client.listTeamMembers).not.toHaveBeenCalled();
    expect(client.listTeamInvitations).not.toHaveBeenCalled();
    expect(client.listTeamScimTokens).not.toHaveBeenCalled();
    expect(client.listTeamScimUsers).not.toHaveBeenCalled();
    expect(client.getSsoStatus).not.toHaveBeenCalled();

    await submitForm(container.querySelector<HTMLFormElement>('.workspace-billing-panel'));

    expect(text(container)).toContain(
      'Owner or admin role required for billing import and reconciliation.',
    );
    expect(client.importProviderBillingExport).not.toHaveBeenCalled();

    unmount();
  });

  it('surfaces admin RBAC limits in team controls before the API rejects them', async () => {
    window.localStorage.setItem('polycost-auth-session-v1', 'session-token');
    const client = clientMock({
      getCurrentSession: jest.fn(async () => ({
        account: {
          id: '33333333-aaaa-4aaa-8aaa-333333333333',
          email: 'admin@example.com',
          displayName: 'Team Admin',
        },
        activeTeam: {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Architecture team',
          role: 'admin' as const,
        },
        teams: [
          {
            teamId: '22222222-2222-4222-8222-222222222222',
            teamName: 'Architecture team',
            role: 'admin' as const,
          },
        ],
        session: {
          id: '33333333-3333-4333-8333-333333333333',
          expiresAt: '2026-07-07T00:00:00.000Z',
        },
      })),
      listTeamMembers: jest.fn(async () => [
        {
          accountId: '11111111-1111-4111-8111-111111111111',
          email: 'owner@example.com',
          displayName: 'Owner',
          role: 'owner' as const,
          createdAt: '2026-07-06T00:00:00.000Z',
        },
        {
          accountId: '44444444-aaaa-4aaa-8aaa-444444444444',
          email: 'member@example.com',
          displayName: 'Member',
          role: 'member' as const,
          createdAt: '2026-07-06T00:00:00.000Z',
        },
      ]),
    });
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();
    await settleAsyncEffects();

    expect(text(container)).toContain('Architecture team · admin');
    expect(text(container)).toContain('2 members');
    const ownerRoleSelect = selectByAriaLabel(container, 'Change role for owner@example.com');
    const memberRoleSelect = selectByAriaLabel(container, 'Change role for member@example.com');
    const removeOwnerButton = buttonByAriaLabel(container, 'Remove owner@example.com');
    const removeMemberButton = buttonByAriaLabel(container, 'Remove member@example.com');

    expect(ownerRoleSelect.disabled).toBe(true);
    expect(ownerRoleSelect.title).toBe('Only team owners can change roles.');
    expect(memberRoleSelect.disabled).toBe(true);
    expect(removeOwnerButton.disabled).toBe(true);
    expect(removeOwnerButton.title).toBe('Only team owners can remove owners.');
    expect(removeMemberButton.disabled).toBe(false);

    await click(removeMemberButton);
    expect(client.removeTeamMember).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '44444444-aaaa-4aaa-8aaa-444444444444',
      'session-token',
    );

    unmount();
  });

  it('previews expired invite-token landing links before sign-in', async () => {
    window.history.pushState({}, '', '/?invite_token=expired-token');
    const client = clientMock({
      previewTeamInvitation: jest.fn(async () => ({
        status: 'expired' as const,
        email: 'finops@example.com',
        role: 'member' as const,
        teamId: '22222222-2222-4222-8222-222222222222',
        expiresAt: '2026-01-01T00:00:00.000Z',
        message: 'Invitation has expired. Ask a team owner or admin for a new invite.',
      })),
    });
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();

    expect(client.previewTeamInvitation).toHaveBeenCalledWith('expired-token');
    expect(text(container)).toContain('Invite expired · finops@example.com');
    expect(text(container)).toContain('Invitation has expired');

    unmount();
  });

  it('imports provider billing exports without reconciliation before comparison runs', async () => {
    window.localStorage.setItem('polycost-auth-session-v1', 'session-token');
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();
    await settleAsyncEffects();
    await changeSelect(selectByWorkspaceLabel(container, 'Provider'), 'gcp');
    await submitForm(container.querySelector<HTMLFormElement>('.workspace-billing-panel'));

    expect(client.importProviderBillingExport).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gcp',
        sourceType: 'gcp-billing-export',
        content: expect.stringContaining('Compute Engine'),
      }),
      'session-token',
    );
    expect(client.reconcileBillingImport).not.toHaveBeenCalled();
    expect(text(container)).toContain('Run a comparison to attach estimate-vs-actual evidence');

    unmount();
  });

  it('applies quick-start architecture templates to the structured form', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    expect(text(container)).toContain('Quick starts');
    await click(templateButtonByText(container, 'Microservices'));

    expect(inputById(container, 'vcpu').value).toBe('4');
    expect(inputById(container, 'memory-gb').value).toBe('16');

    await click(buttonByText(container, 'Compare costs'));

    expect(client.validateWorkload).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: expect.objectContaining({
          name: 'Microservices platform',
          type: 'api_backend',
        }),
        serviceRequirements: expect.arrayContaining([
          expect.objectContaining({
            serviceType: 'container-orchestration',
          }),
          expect.objectContaining({
            serviceType: 'cicd',
          }),
        ]),
      }),
    );

    unmount();
  });

  it('applies compute sizing suggestions from natural-language sizing search', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await changeInput(
      inputById(container, 'initial-compute-sizing-search'),
      '8 vCPU 64GB memory optimized',
    );
    const memorySuggestion = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.compute-sizing-option'),
    ).find((button) => button.textContent?.includes('Memory optimized 8x64'));

    if (!(memorySuggestion instanceof HTMLButtonElement)) {
      throw new Error('Expected memory optimized sizing suggestion');
    }

    await click(memorySuggestion);

    expect(inputById(container, 'vcpu').value).toBe('8');
    expect(inputById(container, 'memory-gb').value).toBe('64');
    expect(selectById(container, 'instance-tier').value).toBe('memory');

    unmount();
  });

  it('seeds editable storage defaults from compute tier changes without overwriting custom storage', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await changeSelect(selectById(container, 'instance-tier'), 'memory');
    expect(inputById(container, 'storage-gb').value).toBe('250');

    await changeInput(inputById(container, 'storage-gb'), '777');
    await changeSelect(selectById(container, 'instance-tier'), 'accelerated');
    expect(inputById(container, 'storage-gb').value).toBe('777');

    await click(buttonByText(container, 'Compare costs'));
    await settleAsyncEffects();

    expect(client.validateWorkload).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: [expect.objectContaining({ sizeGb: 777 })],
      }),
    );

    unmount();
  });

  it('shows the expanded provider region fallback while the live catalog loads', () => {
    const { container, unmount } = render(<App client={clientMock()} />);
    const regionSelect = selectById(container, 'region');
    const regionOptions = regionSelect.textContent ?? '';

    expect(regionSelect.querySelectorAll('option').length).toBeGreaterThan(120);
    expect(regionOptions).toContain('ap-southeast-7 - Asia Pacific (Thailand)');
    expect(regionOptions).toContain('newzealandnorth - New Zealand North');
    expect(regionOptions).toContain('us-west8 - US West (Phoenix)');

    unmount();
  });

  it('shows provider-specific stale pricing data health warnings', async () => {
    const staleHealth: DataHealthResponse = {
      generatedAt: '2026-07-02T00:00:00.000Z',
      freshnessPolicyHours: 48,
      overallStatus: 'stale',
      alertCount: 1,
      alerts: [
        {
          providerId: 'azure',
          severity: 'warning',
          message: 'Azure pricing data is 72 hours old; refresh before proposal use.',
        },
      ],
      providers: [
        {
          providerId: 'aws',
          status: 'success',
          freshness: 'fresh',
          ageHours: 1,
          recordsUpdated: 12,
          recordsRejected: 0,
          recordsSkipped: 3,
          cache: freshCacheSummary(30, 18),
          message: 'AWS pricing cache is fresh.',
        },
        {
          providerId: 'azure',
          status: 'partial',
          freshness: 'stale',
          ageHours: 72,
          recordsUpdated: 10,
          recordsRejected: 0,
          recordsSkipped: 2,
          cache: { ...freshCacheSummary(24, 12), ageHours: 72, freshness: 'stale' },
          message: 'Azure pricing cache is stale.',
        },
        {
          providerId: 'gcp',
          status: 'success',
          freshness: 'fresh',
          ageHours: 1,
          recordsUpdated: 8,
          recordsRejected: 0,
          recordsSkipped: 1,
          cache: freshCacheSummary(20, 12),
          message: 'GCP pricing cache is fresh.',
        },
      ],
    };
    const client = clientMock({
      getDataHealth: jest.fn(async () => staleHealth),
    });
    const { container, unmount } = render(<App client={client} />);

    await settleAsyncEffects();

    expect(text(container)).toContain('Azure stale (72h old) · refresh before final commitment');
    expect(text(container)).toContain(
      'Azure pricing data is 72 hours old; refresh before proposal use.',
    );

    unmount();
  });

  it('adopts the backend pricing model recommendation after comparison', async () => {
    const recommendedResult: ComparisonResult = {
      ...comparisonResult,
      pricingModelRecommendation: {
        preferredModel: 'reserved-3yr',
        confidence: 'high',
        rationale:
          'Defaulting to 3-year reserved pricing because this is a production workload with 90% commitment preference and all priced providers expose comparable long-term commitment data.',
        sourceSignals: {
          environment: 'production',
          commitmentPreferencePercent: 90,
          flexibilityBias: 'cost-optimized',
        },
      },
    };
    const client = clientMock({
      createComparison: jest.fn(async () => recommendedResult),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));

    expect(window.localStorage.getItem('polycost-pricing-model')).toBe('reserved-3yr');
    expect(text(container)).toContain('Recommended scenario');
    expect(text(container)).toContain('Reserved 3yr');
    expect(text(container)).toContain('Production');
    expect(text(container)).toContain('90% commitment');
    expect(
      JSON.parse(window.localStorage.getItem('polycost-comparison-history-v1') ?? '[]')[0],
    ).toMatchObject({
      pricingModel: 'reserved-3yr',
    });

    unmount();
  });

  it('restores recent comparison history into the guided form', async () => {
    window.localStorage.setItem(
      'polycost-comparison-history-v1',
      JSON.stringify([
        {
          id: 'history-1',
          comparisonId: 'history-1',
          createdAt: '2026-07-01T08:30:00.000Z',
          form: {
            ...defaultWorkloadForm,
            workloadName: 'Restored API',
            workloadType: 'api_backend',
            vcpu: '8',
            memoryGb: '32',
            selectedServiceCategory: 'compute',
            selectedServiceFamilyId: 'vm-compute',
          },
          inputMode: 'describe',
          pricingModel: 'reserved-1yr',
          cheapestProviderId: 'azure',
          serviceCount: 2,
          providerCount: 3,
          monthlyLowestUsd: 123.45,
          summary: 'Restored API · API backend',
        },
      ]),
    );
    const { container, unmount } = render(<App client={clientMock()} />);

    expect(text(container)).toContain('Recent comparisons');
    await click(comparisonHistoryButtonByText(container, 'Restored API'));

    expect(buttonByText(container, 'Guided form').getAttribute('aria-selected')).toBe('true');
    expect(inputById(container, 'vcpu').value).toBe('8');
    expect(inputById(container, 'memory-gb').value).toBe('32');
    expect(window.localStorage.getItem('polycost-pricing-model')).toBe('reserved-1yr');
    expect(text(container)).toContain(
      'Loaded Restored API · API backend. Compare again to refresh pricing.',
    );

    unmount();
  });

  it('blocks invalid guided form values before backend comparison', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await changeInput(inputById(container, 'vcpu'), '0');
    await click(buttonByText(container, 'Compare costs'));

    expect(text(container)).toContain('Fix 1 requirement field before comparing.');
    expect(text(container)).toContain('vCPU must be greater than 0.');
    expect(inputById(container, 'vcpu').getAttribute('aria-invalid')).toBe('true');
    expect(client.validateWorkload).not.toHaveBeenCalled();
    expect(client.createComparison).not.toHaveBeenCalled();

    unmount();
  });

  it('updates the page scroll progress indicator', async () => {
    const originalInnerHeight = window.innerHeight;
    const originalScrollY = window.scrollY;
    const originalScrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'scrollHeight',
    );
    const { container, unmount } = render(<ScrollProgressBar />);

    try {
      Object.defineProperty(document.documentElement, 'scrollHeight', {
        configurable: true,
        value: 2000,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: 1000,
      });
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: 500,
      });

      await act(async () => {
        window.dispatchEvent(new Event('scroll'));
      });

      const progress = container.querySelector('[aria-label="Page scroll progress"]');
      const bar = container.querySelector('.scroll-progress-bar');

      expect(progress).toBeInstanceOf(HTMLElement);
      expect(progress?.getAttribute('role')).toBe('progressbar');
      expect(progress?.getAttribute('aria-valuenow')).toBe('50');
      expect((bar as HTMLElement).style.transform).toBe('scaleX(0.5)');
    } finally {
      unmount();
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      });
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: originalScrollY,
      });

      if (originalScrollHeightDescriptor) {
        Object.defineProperty(
          document.documentElement,
          'scrollHeight',
          originalScrollHeightDescriptor,
        );
      } else {
        Reflect.deleteProperty(document.documentElement, 'scrollHeight');
      }
    }
  });

  it('keeps relocated features reachable through an accessible tab strip', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));
    await settleAsyncEffects();

    // The detail gate is a tablist. This is its accessibility contract: every tab
    // points at a real panel, exactly one is selected, and only the selected tab
    // is in the tab order so the arrow keys own movement between them.
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs).toHaveLength(4);
    expect(
      tabs.every((tab) =>
        Boolean(document.getElementById(tab.getAttribute('aria-controls') ?? '')),
      ),
    ).toBe(true);
    expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);

    const panels = Array.from(container.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    expect(panels.filter((panel) => !panel.hasAttribute('hidden'))).toHaveLength(1);

    await selectResultTab(container, 'Cost controls');
    const controlsTab = tabs.find((tab) => tab.textContent?.trim() === 'Cost controls');
    expect(controlsTab?.getAttribute('aria-selected')).toBe('true');
    expect(
      document
        .getElementById(controlsTab?.getAttribute('aria-controls') ?? '')
        ?.hasAttribute('hidden'),
    ).toBe(false);

    expect(text(container)).toContain('Executive decision brief');
    expect(text(container)).toContain('Export summary');
    expect(text(container)).toContain('Engineering cost controls');
    expect(text(container)).toContain('Service driver split');
    expect(text(container)).toContain('Provider cost by mapped service family');
    expect(text(container)).toContain('Traceable pricing evidence');
    expect(text(container)).toContain('SKU, source row, rate, math');
    expect(text(container)).toContain('m7i.large');
    expect(text(container)).toContain('mock://aws/pricing');
    expect(text(container)).toContain('Backend cost coverage map');
    expect(text(container)).toContain('Backend-modeled baseline region sensitivity.');
    expect(text(container)).toContain('Backend commitment exposure');
    expect(text(container)).toContain('Backend optimization opportunities');
    expect(text(container)).toContain(
      'Backend-ranked provider delta from current cached comparison.',
    );
    expect(text(container)).toContain(
      'Backend-modeled exit exposure starts with GCP egress transfer.',
    );
    expect(text(container)).toContain('Licensing');
    expect(text(container)).toContain('Backend AWS internet egress');
    expect(text(container)).toContain(
      'Backend analytics varied egress traffic by +50% against cached dimension totals.',
    );
    expect(text(container)).toContain('Service driver split');
    expect(text(container)).toContain('EC2');
    expect(text(container)).toContain('VM');
    expect(text(container)).toContain('GCE');
    expect(text(container)).toContain('Filter by tag');

    await click(buttonByText(container, 'Yearly'));
    expect(text(container)).toContain('Yearly estimate');

    await click(buttonByText(container, 'Hourly'));
    expect(text(container)).toContain('Hourly estimate');

    await click(buttonByText(container, '1yr reserved'));
    expect(buttonByText(container, '1yr reserved').getAttribute('aria-pressed')).toBe('true');
    expect(text(container)).toContain('Compute, storage, and data-transfer mix');
    expect(text(container)).toContain(
      'Create a real read-only report link scoped to this workload, pricing model, and time granularity.',
    );
    await click(buttonByText(container, 'Create & copy link'));
    expect(client.createWorkload).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'us-east' }),
    );
    expect(client.createShareLink).toHaveBeenCalledWith({
      workloadId: '22222222-2222-4222-8222-222222222222',
      watermark: true,
      expiresInDays: 30,
      pricingModel: 'reserved-1yr',
      granularity: 'hourly',
    });
    expect(text(container)).toContain('Public report ready.');

    await changeInput(inputById(container, 'budget-threshold-usd'), '10');
    expect(text(container)).toContain('Estimated run-rate exceeds budget threshold.');
    await click(buttonByText(container, 'Dismiss'));
    expect(text(container)).not.toContain('Estimated run-rate exceeds budget threshold.');

    expect(text(container)).toContain('Resource name');
    expect(text(container)).toContain('API JSON');

    expect(
      container.querySelector<HTMLAnchorElement>('a[href="https://calculator.aws/#/"]'),
    ).toBeInstanceOf(HTMLAnchorElement);
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="https://cloud.google.com/compute/docs/regions-zones"]',
      ),
    ).toBeInstanceOf(HTMLAnchorElement);

    await click(buttonByText(container, 'PDF'));
    expect(client.exportComparison).toHaveBeenCalledWith(comparisonResult.comparisonId, 'pdf', {
      interval: 'hourly',
      pricingModel: 'reserved-1yr',
    });
    expect(text(container)).toContain('PDF report generated and downloaded.');
    expect(buttonByText(container, 'PDF downloaded')).toBeInstanceOf(HTMLButtonElement);

    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(3);
    expect(text(container)).toContain('Executive decision brief');
    expect(text(container)).toContain('Export summary');
    expect(text(container)).toContain('Filter by tag');

    // Switching tabs hides the previous panel rather than unmounting it.
    await selectResultTab(container, 'Executive brief');
    const controls = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
      (tab) => tab.textContent?.trim() === 'Cost controls',
    );
    expect(
      document
        .getElementById(controls?.getAttribute('aria-controls') ?? '')
        ?.hasAttribute('hidden'),
    ).toBe(true);

    unmount();
  }, 15_000);

  it('shows loading spinners while compare, refresh, and export actions are pending', async () => {
    const validateDeferred = deferred<{ valid: true }>();
    const refreshDeferred = deferred<ComparisonResult>();
    const exportDeferred = deferred<Blob>();
    const client = clientMock({
      validateWorkload: jest.fn(() => validateDeferred.promise),
      refreshLiveComparison: jest.fn(() => refreshDeferred.promise),
      exportComparison: jest.fn(() => exportDeferred.promise),
    });
    const { container, unmount } = render(<App client={client} />);

    try {
      await click(buttonByText(container, 'Compare costs'));

      expect(
        buttonByText(container, 'Comparing costs...').querySelector('.animate-spin'),
      ).toBeInstanceOf(SVGElement);

      validateDeferred.resolve({ valid: true });
      await act(async () => {
        await validateDeferred.promise;
      });

      await selectResultTab(container, 'Calculators & exports');
      await click(buttonByText(container, 'Refresh live catalog'));

      expect(
        buttonByText(container, 'Refreshing...').querySelector('.animate-spin'),
      ).toBeInstanceOf(SVGElement);

      refreshDeferred.resolve(comparisonResult);
      await act(async () => {
        await refreshDeferred.promise;
      });

      await click(buttonByText(container, 'PDF'));

      expect(
        buttonByText(container, 'Generating PDF...').querySelector('.animate-spin'),
      ).toBeInstanceOf(SVGElement);

      exportDeferred.resolve(new Blob(['report']));
      await act(async () => {
        await exportDeferred.promise;
      });
    } finally {
      unmount();
    }
  });

  it('generates a Terraform bundle from the completed comparison workspace', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));
    await selectResultTab(container, 'Cost controls');
    await click(buttonByText(container, 'Generate Terraform'));
    await settleAsyncEffects();

    expect(client.generateTerraform).toHaveBeenCalledWith(
      expect.objectContaining({
        targetCloud: 'gcp',
        options: expect.objectContaining({
          runtimeTarget: 'vm',
          networkTopology: 'private',
          availabilityMode: 'multi-az',
          includePolicyPack: true,
          includeModuleScaffold: true,
        }),
        nws: expect.objectContaining({
          schemaVersion: '1.0',
          workload: expect.objectContaining({
            type: 'web_app',
          }),
        }),
      }),
    );
    expect(text(container)).toContain('Terraform starter bundle');
    expect(text(container)).toContain('client-portal-gcp-terraform');
    expect(text(container)).toContain('Private topology');
    expect(text(container)).toContain('google_compute_instance.app');
    expect(text(container)).toContain('required-provider-pinned');
    expect(buttonByText(container, 'Download Terraform ZIP')).toBeInstanceOf(HTMLButtonElement);
    expect(buttonByText(container, 'Download evidence JSON')).toBeInstanceOf(HTMLButtonElement);

    unmount();
  });

  it('makes horizontally-scrollable tables keyboard-focusable and labeled (UX-3)', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));
    await selectResultTab(container, 'Cost controls');

    const wrappers = Array.from(
      container.querySelectorAll('.table-wrap, .bulk-service-table-wrap'),
    );
    expect(wrappers.length).toBeGreaterThan(0);
    for (const wrapper of wrappers) {
      // Each overflow-x:auto scroll container must be reachable and scrollable by
      // keyboard, and announced as a labeled region to assistive tech.
      expect(wrapper.getAttribute('tabindex')).toBe('0');
      expect((wrapper.getAttribute('aria-label') ?? '').trim().length).toBeGreaterThan(0);
    }

    unmount();
  });

  it('shows quick refresh API errors on the results page', async () => {
    const client = clientMock({
      refreshLiveComparison: jest.fn(async () => {
        throw new PolyCostApiError(
          503,
          'live_refresh_failed',
          'Live pricing refresh is temporarily unavailable.',
        );
      }),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));
    await click(buttonByText(container, 'Refresh live catalog'));

    expect(client.refreshLiveComparison).toHaveBeenCalledWith(comparisonResult.comparisonId);
    expect(text(container)).toContain('Live pricing refresh is temporarily unavailable.');

    unmount();
  });

  it('clears requirements input and rendered cost breakdowns', async () => {
    const refreshDeferred = deferred<ComparisonResult>();
    const client = clientMock({
      refreshLiveComparison: jest.fn(() => refreshDeferred.promise),
    });
    const { container, unmount } = render(<App client={client} />);

    expect(container.querySelector('#natural-language-input')).toBeNull();

    await click(buttonByText(container, 'Compare costs'));

    expect(text(container)).not.toContain('Comparison ready.');
    expect(container.querySelector('.requirement-summary-strip')).toBeInstanceOf(HTMLElement);
    await selectResultTab(container, 'Cost controls');
    expect(buttonByText(container, 'Refresh live catalog').disabled).toBe(false);
    expect(buttonByText(container, 'PDF').disabled).toBe(false);
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(3);

    await click(buttonByText(container, 'Refresh live catalog'));

    await click(buttonByText(container, 'Clear'));

    expect(text(container)).toContain('Multi-cloud cost clarity, in one place.');
    expect(buttonByText(container, 'Compare costs')).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector('.requirement-summary-strip')).toBeNull();
    expect(container.querySelector('.workbench-results')).toBeNull();
    expect(container.querySelector('.provider-summary-card')).toBeNull();
    expect(container.querySelector('.result-disclosure')).toBeNull();
    expect(text(container)).not.toContain('$42.00');

    refreshDeferred.resolve({
      ...comparisonResult,
      comparisonId: 'stale-refresh-after-clear',
    });
    await act(async () => {
      await refreshDeferred.promise;
    });

    expect(text(container)).toContain('Multi-cloud cost clarity, in one place.');
    expect(container.querySelector('.provider-summary-card')).toBeNull();
    expect(container.querySelector('.result-disclosure')).toBeNull();

    unmount();

    const reloaded = render(<App client={client} />);
    expect(text(reloaded.container)).toContain('Multi-cloud cost clarity, in one place.');
    expect(buttonByText(reloaded.container, 'Compare costs')).toBeInstanceOf(HTMLButtonElement);
    expect(reloaded.container.querySelector('.provider-summary-card')).toBeNull();
    expect(reloaded.container.querySelector('.result-disclosure')).toBeNull();
    reloaded.unmount();
  });

  it('supports form edits, interval changes, refresh, and export', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await changeSelect(selectById(container, 'workload-type'), 'api_backend');
    await changeSelect(selectById(container, 'region'), 'us-west-2');
    await changeInput(inputById(container, 'vcpu'), '4');
    await changeInput(inputById(container, 'memory-gb'), '8');
    await click(buttonByText(container, 'Compare costs'));

    await click(buttonByText(container, 'Edit'));

    expect(container.querySelector('.requirement-summary-strip')).toBeNull();
    expect(container.querySelector('.requirements-edit-panel')).toBeInstanceOf(HTMLElement);
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(0);
    expect(container.querySelector('.result-disclosure')).toBeNull();
    expect(selectById(container, 'type').value).toBe('api_backend');
    expect(selectById(container, 'region').value).toBe('us-west-2');
    expect(inputById(container, 'vcpu').value).toBe('4');
    expect(inputById(container, 'memory-gb').value).toBe('8');

    await changeInput(inputById(container, 'name'), 'Edited portal');
    await changeInput(inputById(container, 'daily-users'), '7000');
    await changeInput(inputById(container, 'peak-users'), '800');
    await changeInput(inputById(container, 'compute-role'), 'api');
    await changeInput(inputById(container, 'vcpu'), '4');
    await changeInput(inputById(container, 'memory-gb'), '8');
    await changeInput(inputById(container, 'instances'), '3');
    await changeSelect(selectById(container, 'scaling'), 'autoscaling');
    await changeInput(inputById(container, 'scale-min'), '2');
    await changeInput(inputById(container, 'scale-max'), '8');
    await click(serviceFamilyCheckboxByLabel(container, 'Generative AI'));
    await click(checkboxByLabel(container, 'Object storage'));
    await click(checkboxByLabel(container, 'Managed database'));
    await click(checkboxByLabel(container, 'CDN'));
    await click(checkboxByLabel(container, 'Load balancer'));
    await click(checkboxByLabel(container, 'Multi-region'));
    await changeInput(inputById(container, 'storage-role'), 'media uploads');
    await changeInput(inputById(container, 'storage-gb'), '512');
    await changeSelect(selectById(container, 'storage-type'), 'file');
    await changeSelect(selectById(container, 'access-pattern'), 'archive');
    await changeInput(inputById(container, 'database-role'), 'orders');
    await changeSelect(selectById(container, 'database'), 'mysql');
    await changeInput(inputById(container, 'database-gb'), '200');
    await click(checkboxByLabel(container, 'Database HA'));
    await changeInput(inputById(container, 'egress-gb-mo'), '900');
    await changeInput(inputById(container, 'sla-target'), '99.95%');

    await click(buttonByText(container, 'Compare'));
    await selectResultTab(container, 'Cost controls');
    await click(buttonByText(container, 'Yearly'));
    await click(buttonByText(container, 'Refresh live catalog'));
    await click(buttonByText(container, 'PDF'));

    expect(client.validateWorkload).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: expect.objectContaining({
          name: 'Edited portal',
          type: 'api_backend',
        }),
        storage: [
          expect.objectContaining({
            accessPattern: 'archive',
            role: 'media uploads',
            type: 'file',
          }),
        ],
        database: [
          expect.objectContaining({
            engine: 'mysql',
            highAvailability: false,
            role: 'orders',
          }),
        ],
        sourceTraceability: expect.arrayContaining([
          {
            nwsPath: 'metadata.serviceCatalog',
            sourceRef: 'serviceCatalog:generative-ai',
          },
        ]),
      }),
    );
    expect(client.refreshLiveComparison).toHaveBeenCalledWith(comparisonResult.comparisonId);
    expect(client.exportComparison).toHaveBeenCalledWith(comparisonResult.comparisonId, 'pdf', {
      interval: 'yearly',
      pricingModel: 'on-demand',
    });

    unmount();
  }, 10_000);

  it('imports bulk service rows into the editable guided form', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));
    await click(buttonByText(container, 'Edit'));

    await changeTextarea(
      textareaById(container, 'bulk-service-input'),
      'Managed Kubernetes, 3, production, shared platform cluster\nS3, 2, standard',
    );

    expect(text(container)).toContain('Bulk service import');
    expect(text(container)).toContain('Managed Kubernetes');
    expect(text(container)).toContain('Object storage');

    await click(buttonByText(container, 'Add matched services'));

    expect(text(container)).toContain('Imported rows');
    expect(text(container)).toContain('Managed Kubernetes');

    await click(buttonByText(container, 'Compare'));

    expect(client.validateWorkload).toHaveBeenLastCalledWith(
      expect.objectContaining({
        serviceRequirements: expect.arrayContaining([
          expect.objectContaining({
            serviceCategory: 'containers',
            serviceType: 'container-orchestration',
            quantity: 3,
            tier: 'production',
            scaleParams: expect.objectContaining({
              bulkImport: true,
              bulkNote: 'shared platform cluster',
            }),
          }),
          expect.objectContaining({
            serviceCategory: 'storage',
            serviceType: 'object-storage',
            quantity: 2,
            tier: 'standard',
          }),
        ]),
      }),
    );

    unmount();
  });

  it('hides submitted results while editing draft requirements', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await changeSelect(selectById(container, 'workload-type'), 'api_backend');
    await changeInput(inputById(container, 'vcpu'), '4');
    await changeInput(inputById(container, 'memory-gb'), '8');
    await click(buttonByText(container, 'Compare costs'));

    expect(text(container)).toContain('API backend · Virtual machines · 4 vCPU · 8GB');

    await click(buttonByText(container, 'Edit'));
    await changeInput(inputById(container, 'vcpu'), '16');
    await changeInput(inputById(container, 'memory-gb'), '64');

    expect(container.querySelector('.requirements-edit-panel')).toBeInstanceOf(HTMLElement);
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(0);
    expect(container.querySelector('.result-disclosure')).toBeNull();
    expect(text(container)).not.toContain('$42.00');

    await click(buttonByText(container, 'Compare'));

    expect(container.querySelector('.requirements-edit-panel')).toBeNull();
    expect(container.querySelector('.requirement-summary-strip')).toBeInstanceOf(HTMLElement);
    expect(text(container)).toContain('API backend · Virtual machines · 16 vCPU · 64GB');
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(3);

    unmount();
  });

  it('parses describe input before creating a comparison', async () => {
    const parsedNws = buildNwsFromForm({
      ...defaultWorkloadForm,
      workloadName: 'Parsed and compared portal',
    });
    const client = clientMock({
      parseWorkload: jest.fn(async () => ({
        draftNws: parsedNws,
        parserConfidence: 'medium' as const,
        fieldsRequiringReview: ['database[0].sizeGb'],
      })),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Paste / parse'));
    await click(buttonByText(container, 'Parse requirements'));

    expect(client.parseWorkload).toHaveBeenCalledWith(expect.stringContaining('web app'));
    expect(client.validateWorkload).not.toHaveBeenCalled();
    expect(client.createComparison).not.toHaveBeenCalled();
    expect(text(container)).toContain('Review checkpoint');
    expect(text(container)).toContain('Interpreted services ready to price');
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe(
      'Parsed and compared portal',
    );
    expect(text(container)).toContain('Parsed with medium confidence. Review 1 field.');

    await click(buttonByText(container, 'Confirm & compare'));

    expect(client.validateWorkload).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ sourceType: 'structured_form' }),
        workload: expect.objectContaining({
          name: 'Parsed and compared portal',
        }),
      }),
    );
    expect(client.createComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: expect.objectContaining({
          name: 'Parsed and compared portal',
        }),
      }),
    );
    expect(text(container)).toContain('Parsed from text');

    await click(buttonByText(container, 'Edit'));
    expect(buttonByText(container, 'Paste / parse').getAttribute('aria-selected')).toBe('true');
    expect(textareaById(container, 'natural-language-input').value).toContain('web app');

    await click(buttonByText(container, 'Guided form'));
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe(
      'Parsed and compared portal',
    );
    expect(text(container)).not.toContain('Comparison ready.');

    unmount();
  });

  it('loads a requirements file into the same parse and review flow', async () => {
    const fileText =
      'Client requirements: web app with 4 app servers, managed Postgres, 500GB object storage, and 1TB egress in US East.';
    const parsedNws = buildNwsFromForm({
      ...defaultWorkloadForm,
      workloadName: 'Uploaded requirements portal',
    });
    const client = clientMock({
      parseWorkload: jest.fn(async () => ({
        draftNws: parsedNws,
        parserConfidence: 'high' as const,
        fieldsRequiringReview: [],
      })),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Paste / parse'));
    const file = new File([fileText], 'client-requirements.md', { type: 'text/markdown' });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: jest.fn(async () => fileText),
    });

    await changeFileInput(inputById(container, 'requirements-file-input'), file);

    expect(textareaById(container, 'natural-language-input').value).toContain('managed Postgres');
    expect(text(container)).toContain('Loaded from client-requirements.md');
    expect(text(container)).toContain(
      'Loaded client-requirements.md. Review the text, then parse requirements.',
    );

    await click(buttonByText(container, 'Parse requirements'));

    expect(client.parseWorkload).toHaveBeenCalledWith(expect.stringContaining('1TB egress'));
    expect(text(container)).toContain('Review checkpoint');
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe(
      'Uploaded requirements portal',
    );

    unmount();
  });

  it('keeps structured CSV and diagram imports behind the Phase 2 parser hook', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Paste / parse'));
    const file = new File(['service,quantity\ncompute,4'], 'architecture.csv', {
      type: 'text/csv',
    });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: jest.fn(async () => 'service,quantity\ncompute,4'),
    });

    await changeFileInput(inputById(container, 'requirements-file-input'), file);

    expect(text(container)).toContain(
      'Upload a plain text, Markdown, JSON, or YAML requirements file.',
    );
    expect(client.parseWorkload).not.toHaveBeenCalled();
    expect(textareaById(container, 'natural-language-input').value).toContain('web app');

    unmount();
  });

  it('parses diagram input into a reviewable editable comparison', async () => {
    const diagramSource =
      'flowchart LR\n  lb[Load Balancer] --> app[Cloud Run app]\n  app --> db[(Postgres 200GB)]';
    const parsedNws = buildNwsFromForm(
      {
        ...defaultWorkloadForm,
        workloadName: 'Diagram portal',
        workloadType: 'api_backend',
        vcpu: '4',
        memoryGb: '16',
      },
      'drawio_diagram',
    );
    const parsedDiagram = diagramParseResult(parsedNws, {
      displayLabel: 'Cloud Run app',
      assumedDefaults: ['general-purpose compute family'],
    });
    parsedDiagram.review.unresolvedClassifications = [
      {
        id: 'unknown',
        displayLabel: 'Legacy appliance',
        reason: 'no service alias matched',
        sourceRef: 'mermaid:line-4-unknown',
      },
    ];
    parsedDiagram.review.ignoredNodes = [
      {
        id: 'note',
        displayLabel: 'Review note',
        reason: 'decorative or grouping shape',
        sourceRef: 'mermaid:line-5-note',
      },
    ];
    parsedDiagram.graph.ignoredNodes = parsedDiagram.review.ignoredNodes;
    const client = clientMock({
      parseDiagram: jest.fn(async () => parsedDiagram),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Upload diagram'));
    expect(buttonByText(container, 'Upload diagram').getAttribute('aria-selected')).toBe('true');
    await changeTextarea(textareaById(container, 'diagram-source'), diagramSource);
    await click(buttonByText(container, 'Parse diagram'));

    expect(client.parseDiagram).toHaveBeenCalledWith(
      expect.objectContaining({
        content: diagramSource,
        encoding: 'text',
        inputFormat: 'auto',
      }),
    );
    expect(text(container)).toContain('Parser confidence');
    expect(text(container)).toContain('Cloud Run app');
    expect(text(container)).toContain('general-purpose compute family');
    expect(text(container)).toContain('Needs classification');
    expect(text(container)).toContain('Legacy appliance');
    expect(text(container)).toContain('Ignored decorative nodes');
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe('Diagram portal');

    await click(buttonByText(container, 'Remove'));
    await changeSelect(selectByAriaLabel(container, 'Classify Legacy appliance'), 'queue');
    await changeSelect(selectByAriaLabel(container, 'Add missing diagram service'), 'cdn');
    await click(buttonByText(container, 'Compare costs'));

    const submittedNws = (client.validateWorkload as jest.Mock).mock
      .calls[0][0] as NormalizedWorkloadSpec;
    expect(submittedNws).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({ sourceType: 'drawio_diagram' }),
      }),
    );
    expect(submittedNws.serviceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceType: 'queue',
          scaleParams: expect.objectContaining({ diagramNodeId: 'unknown' }),
        }),
        expect.objectContaining({
          serviceType: 'cdn',
          scaleParams: expect.objectContaining({ reason: 'manual diagram review classification' }),
        }),
      ]),
    );
    expect(submittedNws.serviceRequirements).not.toEqual(parsedNws.serviceRequirements);
    expect(client.createComparison).toHaveBeenCalled();
    expect(text(container)).toContain('Parsed from diagram');

    unmount();
  });

  it('renders API-provided VSDX SVG visual previews in the diagram review', async () => {
    const parsedNws = buildNwsFromForm(defaultWorkloadForm, 'drawio_diagram');
    const parsedDiagram = diagramParseResult(parsedNws, {
      displayLabel: 'EC2 web',
      assumedDefaults: [],
    });
    parsedDiagram.source.format = 'vsdx';
    parsedDiagram.source.fileName = 'architecture.vsdx';
    parsedDiagram.graph.format = 'vsdx';
    parsedDiagram.graph.visualPreviews = [
      {
        format: 'svg',
        renderingMode: 'approximate-vsdx-svg',
        pageRef: 'visio/pages/page1.xml',
        pageName: 'Page 1',
        width: 10,
        height: 8,
        nodeCount: 2,
        edgeCount: 1,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 8"><text>EC2 web</text></svg>',
        warnings: ['approximate SVG preview from VSDX geometry, not full Visio visual rendering'],
      },
    ];
    const client = clientMock({
      parseDiagram: jest.fn(async () => parsedDiagram),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Upload diagram'));
    await changeTextarea(textareaById(container, 'diagram-source'), 'VSDX fixture');
    await click(buttonByText(container, 'Parse diagram'));

    expect(text(container)).toContain('SVG preview · 2 nodes · 1 links');
    expect(text(container)).toContain(
      'approximate SVG preview from VSDX geometry, not full Visio visual rendering',
    );
    const image = container.querySelector('.diagram-preview-svg') as HTMLImageElement | null;
    expect(image).not.toBeNull();
    expect(image?.alt).toBe('Approximate diagram preview for Page 1');
    expect(image?.src).toContain('data:image/svg+xml');

    unmount();
  });

  it('supports manual diagram review defaults for storage, database, and network services', async () => {
    const parsedNws = buildNwsFromForm(
      {
        ...defaultWorkloadForm,
        workloadName: 'Diagram review lab',
      },
      'drawio_diagram',
    );
    const parsedDiagram = diagramParseResult(parsedNws);
    parsedDiagram.review.unresolvedClassifications = [
      {
        id: 'bucket',
        displayLabel: 'Object bucket',
        reason: 'no stencil metadata',
        sourceRef: 'drawio:node-bucket',
      },
    ];
    parsedDiagram.graph.nodes.push({
      id: 'bucket',
      displayLabel: 'Object bucket',
      kind: 'unknown',
      sourceRef: 'drawio:node-bucket',
    });
    const client = clientMock({
      parseDiagram: jest.fn(async () => parsedDiagram),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Upload diagram'));
    await changeTextarea(textareaById(container, 'diagram-source'), '<mxfile>diagram</mxfile>');
    await click(buttonByText(container, 'Parse diagram'));
    await changeSelect(selectByAriaLabel(container, 'Classify Object bucket'), 'object-storage');
    await changeSelect(
      selectByAriaLabel(container, 'Add missing diagram service'),
      'relational-database',
    );
    await changeSelect(
      selectByAriaLabel(container, 'Add missing diagram service'),
      'load-balancer',
    );

    expect(text(container)).toContain('100 GB storage');
    expect(text(container)).toContain('100 GB database storage');
    expect(text(container)).toContain('730 load-balancer hours per month');

    await click(buttonByText(container, 'Clear'));

    expect(textareaById(container, 'diagram-source').value).toBe('');
    expect(text(container)).not.toContain('100 GB database storage');
    expect(client.createComparison).not.toHaveBeenCalled();

    unmount();
  });

  it('shows a validation message before parsing an empty diagram', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Upload diagram'));
    await click(lastButtonByText(container, 'Parse diagram'));

    expect(text(container)).toContain(
      'Upload a diagram or paste Mermaid, draw.io XML, or Lucid CSV content first.',
    );
    expect(client.parseDiagram).not.toHaveBeenCalled();

    unmount();
  });

  it('loads draw.io diagram files and submits them through the diagram parser', async () => {
    const fileText = '<mxfile><diagram><mxGraphModel /></diagram></mxfile>';
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Upload diagram'));
    const file = new File([fileText], 'architecture.drawio', { type: 'application/xml' });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: jest.fn(async () => fileText),
    });

    await changeFileInput(inputById(container, 'diagram-file'), file);
    expect(text(container)).toContain('Loaded from architecture.drawio');
    expect(text(container)).toContain('draw.io');

    await click(buttonByText(container, 'Parse diagram'));

    expect(client.parseDiagram).toHaveBeenCalledWith(
      expect.objectContaining({
        content: fileText,
        encoding: 'text',
        inputFormat: 'drawio',
        fileName: 'architecture.drawio',
        mimeType: 'application/xml',
      }),
    );

    unmount();
  });

  it('loads Mermaid diagram files as text parser input', async () => {
    const fileText = 'flowchart LR\n  api[API] --> db[(Postgres)]';
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Upload diagram'));
    const file = new File([fileText], 'architecture.mmd', { type: 'text/plain' });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: jest.fn(async () => fileText),
    });

    await changeFileInput(inputById(container, 'diagram-file'), file);
    expect(text(container)).toContain('Loaded from architecture.mmd');
    expect(text(container)).toContain('Mermaid');

    await click(buttonByText(container, 'Parse diagram'));

    expect(client.parseDiagram).toHaveBeenCalledWith(
      expect.objectContaining({
        content: fileText,
        encoding: 'text',
        inputFormat: 'mermaid',
        fileName: 'architecture.mmd',
        mimeType: 'text/plain',
      }),
    );

    unmount();
  });

  it('loads VSDX diagram files as base64 parser input', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Upload diagram'));
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'architecture.vsdx', {
      type: 'application/octet-stream',
    });

    await changeFileInput(inputById(container, 'diagram-file'), file);
    await settleAsyncEffects();
    expect(text(container)).toContain('Loaded from architecture.vsdx');
    expect(text(container)).toContain('VSDX');

    await click(buttonByText(container, 'Parse diagram'));

    expect(client.parseDiagram).toHaveBeenCalledWith(
      expect.objectContaining({
        encoding: 'base64',
        inputFormat: 'vsdx',
        fileName: 'architecture.vsdx',
        mimeType: 'application/octet-stream',
      }),
    );
    expect(String((client.parseDiagram as jest.Mock).mock.calls[0][0].content)).toMatch(/UEsD/);

    unmount();
  });

  it('rejects oversized diagram files before calling the parser', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Upload diagram'));
    const file = new File(['diagram'], 'large.drawio', { type: 'application/xml' });
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: 5 * 1024 * 1024 + 1,
    });

    await changeFileInput(inputById(container, 'diagram-file'), file);

    expect(text(container)).toContain('Upload a diagram file under 5MB.');
    expect(client.parseDiagram).not.toHaveBeenCalled();

    unmount();
  });

  it('parses natural-language input into the editable form', async () => {
    const parsedNws = buildNwsFromForm({
      ...defaultWorkloadForm,
      workloadName: 'Parsed portal',
    });
    const client = clientMock({
      parseWorkload: jest.fn(async () => ({
        draftNws: parsedNws,
        parserConfidence: 'high' as const,
        fieldsRequiringReview: ['compute[0].instanceCount'],
      })),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));
    clearClientCalls(client);
    await click(buttonByText(container, 'Edit'));
    await click(buttonByText(container, 'Paste / parse'));
    await click(buttonByText(container, 'Parse'));

    expect(text(container)).toContain('Parsed with high confidence');
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe('Parsed portal');

    unmount();
  });

  it('renders API errors without clearing the dashboard', async () => {
    const client = clientMock({
      createComparison: jest.fn(async () => {
        throw new PolyCostApiError(503, 'PRICING_UNAVAILABLE', 'No pricing available');
      }),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));

    expect(text(container)).toContain('No pricing available');

    unmount();
  });

  it('renders parse errors without exposing admin-only pricing diagnostics', async () => {
    const client = clientMock({
      parseWorkload: jest.fn(async () => {
        throw new PolyCostApiError(422, 'WORKLOAD_PARSE_ERROR', 'Input was not understood');
      }),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Paste / parse'));
    await click(buttonByText(container, 'Parse requirements'));

    expect(text(container)).toContain('Input was not understood');
    expect(container.querySelector('.initial-home-form')).toBeInstanceOf(HTMLElement);
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(0);
    expect(text(container)).not.toContain('Monthly estimate');
    expect(text(container)).not.toContain('Pricing status restricted');

    unmount();
  });
});

describe('ComparisonView', () => {
  beforeEach(() => {
    window.localStorage.removeItem('polycost-persona-view');
    window.localStorage.removeItem('polycost-dismissed-budget-alerts');
  });

  afterEach(() => {
    window.localStorage.removeItem('polycost-persona-view');
    window.localStorage.removeItem('polycost-dismissed-budget-alerts');
  });

  it('renders an empty pre-comparison state without pricing failure language', () => {
    const { container, unmount } = render(<ComparisonView comparison={null} interval="monthly" />);

    expect(mobileProviderLabels(container)).toEqual(['AWS', 'Azure', 'GCP']);
    expect(text(container)).toContain('Pending');
    expect(text(container)).toContain('Run a comparison to populate AWS service bars.');
    expect(text(container)).toContain('Ready to compare');
    expect(text(container)).toContain('Describe infrastructure');
    expect(text(container)).toContain('Add services to see your comparison');
    expect(text(container)).toContain('Add services');
    expect(container.querySelector('.comparison-empty-illustration')).toBeInstanceOf(SVGSVGElement);
    expect(container.querySelector('.engineering-empty-illustration')).toBeInstanceOf(
      SVGSVGElement,
    );
    expect(
      container
        .querySelector<HTMLAnchorElement>('a[aria-label="Describe your infrastructure above"]')
        ?.getAttribute('href'),
    ).toBe('#requirements');
    expect(
      container
        .querySelector<HTMLAnchorElement>('a[aria-label="Add services to see your comparison"]')
        ?.getAttribute('href'),
    ).toBe('#requirements');
    expect(text(container)).not.toContain('Pricing unavailable');

    unmount();
  });

  it('keeps provider order stable and marks unavailable providers', () => {
    const partialResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'azure',
      providers: [provider('azure', 20)],
    };
    const { container, unmount } = render(
      <ComparisonView comparison={partialResult} interval="monthly" />,
    );

    expect(mobileProviderLabels(container)).toEqual(['AWS', 'Azure', 'GCP']);
    expect(text(container)).toContain('Unavailable');
    expect(text(container)).toContain('Shortlist Azure');
    expect(text(container)).toContain('Trend data not yet available');

    unmount();
  });

  it('renders executive persona metrics and engineering resource rows from shared costs', async () => {
    const tracedComparison: ComparisonResult = {
      ...comparisonResult,
      providers: comparisonResult.providers.map((candidate) =>
        candidate.providerId === 'aws'
          ? {
              ...candidate,
              lineItems: candidate.lineItems.map((lineItem) => ({
                ...lineItem,
                pricingBasis: 'flat',
                pricingTrace: {
                  providerId: 'aws',
                  serviceCategory: lineItem.category,
                  source: 'pricing_catalog',
                  sourceRecordKey: 'aws:ec2:us-east-1:c6i.large',
                  resolvedSkuId: 'pc-aws-compute-001',
                  providerServiceName: 'Amazon EC2',
                  skuDescription: 'Linux shared c6i.large compute',
                  region: 'us-east-1',
                  catalogRegion: 'US East (N. Virginia)',
                  unit: 'vCPU-hour',
                  unitPriceUsd: 0.0425,
                  currency: 'USD',
                  effectiveDate: '2026-07-01T00:00:00.000Z',
                  fetchedAt: '2026-07-06T08:30:00.000Z',
                  pricingBasis: 'flat',
                  isApproximate: false,
                  isEstimate: false,
                },
              })),
            }
          : candidate,
      ),
    };
    const { container, unmount } = render(
      <ComparisonView comparison={tracedComparison} interval="monthly" />,
    );

    expect(text(container)).toContain('$30.00');
    expect(text(container)).toContain('Executive monthly baseline');
    expect(text(container)).toContain('Provider mix');
    expect(text(container)).toContain('$110.00');
    expect(text(container)).toContain('90-day forecast');
    expect(text(container)).toContain('Trend data not yet available');
    expect(text(container)).toContain('Shortlist GCP');
    expect(text(container)).toContain('$360.00');
    expect(text(container)).toContain('$144.00');

    expect(text(container)).toContain('Service driver split');
    expect(text(container)).toContain('EC2');
    expect(text(container)).toContain('VM');
    expect(text(container)).toContain('GCE');
    expect(
      container.querySelectorAll('.engineering-bar-chart-shell .recharts-wrapper').length,
    ).toBeGreaterThanOrEqual(3);
    expect(text(container)).toContain('Filter by tag');
    expect(text(container)).toContain('Backend contract note');
    expect(text(container)).toContain('Resource name');
    expect(text(container)).toContain('Spec / SKU');
    expect(container.querySelector('.confidence-pill')?.getAttribute('title')).toContain(
      'Confidence reflects how closely the equivalent service matches on specs',
    );
    const headerButtons = Array.from(container.querySelectorAll('button'));
    expect(
      headerButtons
        .find((button) => button.getAttribute('aria-label')?.startsWith('Spec / SKU:'))
        ?.getAttribute('title'),
    ).toContain('Resolved SKU, unit, rate, and pricing basis');
    expect(
      headerButtons
        .find((button) => button.getAttribute('aria-label')?.startsWith('Spec / SKU:'))
        ?.closest('th')
        ?.getAttribute('aria-sort'),
    ).toBe('none');
    expect(
      headerButtons
        .find((button) => button.getAttribute('aria-label')?.startsWith('$/mo:'))
        ?.getAttribute('title'),
    ).toContain('Monthly line-item cost');
    expect(text(container)).toContain(
      'Modeled cost driver - provider SKU/rate metadata not returned by API',
    );
    expect(text(container)).toContain('SKU pc-aws-compute-001');
    expect(text(container)).toContain('Source pricing catalog');
    expect(text(container)).toContain('Unit vCPU-hour');
    expect(text(container)).toContain('$0.04/unit');
    expect(text(container)).toContain('Effective Jul 1, 2026');
    expect(text(container)).toContain('Fetched Jul 6, 2026');
    expect(text(container)).toContain('Trace aws:ec2:us-east-1:c6i.large');
    expect(text(container)).toContain('Flat pricing');
    expect(text(container)).not.toContain('Provider SKU detail unavailable');
    expect(text(container)).toContain('aws-compute-01');
    expect(text(container)).toContain('azure-compute-01');
    expect(text(container)).toContain('gcp-compute-01');
    expect(text(container)).toContain('Tag filtering is ready in the UI');

    unmount();
  });

  it('explains comparison workspace loading states with actionable context', async () => {
    const { container, unmount } = render(
      <ComparisonView client={clientMock()} comparison={null} interval="monthly" isLoading />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Refreshing pricing evidence');
    expect(text(container)).toContain(
      'Mapping provider SKUs, totals, export links, and engineering rows from the backend response.',
    );
    expect(text(container)).toContain('Building engineering rows');
    expect(text(container)).toContain('Mapping AWS, Azure, and GCP line items');
    expect(text(container)).toContain('API JSON will activate when this comparison finishes');

    unmount();
  });

  it('keeps long engineering row sets compact until the user expands them', async () => {
    const categories: Array<
      ComparisonResult['providers'][number]['lineItems'][number]['category']
    > = ['compute', 'storage', 'database', 'network', 'support', 'operations'];
    const providerRows = (label: string): Parameters<typeof providerWithItems>[1] =>
      categories.map((category, index) => [
        category,
        `${label} line item ${index + 1}`,
        25 + index,
      ]);
    const longResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        providerWithItems('aws', providerRows('aws')),
        providerWithItems('azure', providerRows('azure')),
        providerWithItems('gcp', providerRows('gcp')),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView comparison={longResult} interval="monthly" />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain(
      'Showing 12 of 18 resource rows sorted by $/mo (descending).',
    );
    await click(buttonByText(container, 'Show all rows (6 more)'));

    expect(text(container)).toContain(
      'Showing 18 of 18 resource rows sorted by $/mo (descending).',
    );
    expect(text(container)).toContain('Collapse to top 12');

    unmount();
  });

  it('renders multi-category comparison rows in engineering mode', async () => {
    const richResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'azure',
      providers: [
        providerWithItems('aws', [
          ['compute', 'aws compute', 50],
          ['storage', 'aws storage', 10],
          ['database', 'aws database', 20],
          ['network', 'aws network', 5],
        ]),
        providerWithItems('azure', [
          ['compute', 'azure compute', 40],
          ['storage', 'azure storage', 8],
          ['database', 'azure database', 18],
          ['network', 'azure network', 4],
        ]),
        providerWithItems('gcp', [
          ['compute', 'gcp compute', 60, true],
          ['storage', 'gcp storage', 12, true],
          ['database', 'gcp database', 30, true],
          ['network', 'gcp network', 6, true],
        ]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView comparison={richResult} interval="monthly" />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Potential savings');
    expect(text(container)).toContain('$456.00');

    expect(text(container)).toContain('EBS / S3');
    expect(text(container)).toContain('Disk / Blob');
    expect(text(container)).toContain('Azure SQL');
    expect(text(container)).toContain('Data transfer');
    expect(text(container)).toContain('Cloud SQL');
    expect(text(container)).toContain('Egress');
    expect(text(container)).toContain('aws compute');
    expect(text(container)).toContain('aws storage');
    expect(text(container)).toContain('aws database');
    expect(text(container)).toContain('aws network');
    expect(text(container)).toContain('azure compute');
    expect(text(container)).toContain('gcp compute');
    expect(text(container)).toContain('$60.00');
    expect(text(container)).toContain('$4.00');

    unmount();
  });

  it('surfaces compute specification matrix with architecture and tenancy economics', async () => {
    const computeResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'gcp',
      providers: [
        providerWithItems('aws', [['compute', 'aws memory compute', 200]]),
        providerWithItems('azure', [['compute', 'azure memory compute', 180]]),
        providerWithItems('gcp', [['compute', 'gcp memory compute', 160]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={computeResult}
        form={{
          ...defaultWorkloadForm,
          instanceTier: 'memory',
          processorArchitecture: 'arm64',
          computeTenancy: 'dedicated-host',
          vcpu: '4',
          memoryGb: '16',
          instanceCount: '3',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Compute specification matrix');
    expect(text(container)).toContain(
      'Family, capacity, network/disk baseline, and architecture economics',
    );
    expect(text(container)).toContain('R7g Graviton3');
    expect(text(container)).toContain('Epsv5 Ampere Altra');
    expect(text(container)).toContain('Tau T2A');
    expect(text(container)).toContain('3 nodes · 12 vCPU / 48GB');
    expect(text(container)).toContain('GB per $');
    expect(text(container)).toContain('Selected ARM vs x86');
    expect(text(container)).toContain('Dedicated host · 16 instance(s) per 64-vCPU reference host');
    expect(text(container)).toContain(
      'Validate host density and license/compliance placement before accepting the per-instance comparison.',
    );

    unmount();
  });

  it('surfaces Windows license optimization detail from licensing line items', async () => {
    const windowsResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'azure',
      providers: [
        providerWithItems('aws', [
          ['compute', 'aws compute', 80],
          ['licensing', 'aws Windows license', 24],
        ]),
        providerWithItems('azure', [
          ['compute', 'azure compute', 70],
          ['licensing', 'azure Windows license', 20],
        ]),
        providerWithItems('gcp', [
          ['compute', 'gcp compute', 85],
          ['licensing', 'gcp Windows license', 22],
        ]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={windowsResult}
        form={{ ...defaultWorkloadForm, operatingSystem: 'windows' }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('License optimization detail');
    expect(text(container)).toContain(
      'Windows uplift, Linux-equivalent run-rate, and BYOL savings',
    );
    expect(text(container)).toContain('Hybrid Benefit / BYOL');
    expect(text(container)).toContain('$24.00/mo');
    expect(text(container)).toContain('$288.00/yr');
    expect(text(container)).toContain('Linux/BYOL equivalent');

    unmount();
  });

  it('surfaces storage optimization detail from modeled storage dimensions', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 40],
      ['storage', 'AWS snapshot retention estimate', 24],
      ['storage', 'AWS archive retrieval estimate', 12],
      ['storage', 'AWS storage operation estimate', 2],
      ['storage', 'AWS cross-region replication estimate', 20],
      ['storage', 'AWS lifecycle transition estimate', 1],
      ['storage', 'AWS provisioned IOPS performance estimate', 15],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'storage',
      skuId: 'modeled-storage-snapshots',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'storage',
      skuId: 'modeled-storage-retrieval',
    };
    awsProvider.lineItems[3] = {
      ...awsProvider.lineItems[3],
      costComponent: 'storage',
      skuId: 'modeled-storage-put-operations',
    };
    awsProvider.lineItems[4] = {
      ...awsProvider.lineItems[4],
      costComponent: 'storage',
      skuId: 'modeled-storage-cross-region-replication',
    };
    awsProvider.lineItems[5] = {
      ...awsProvider.lineItems[5],
      costComponent: 'storage',
      skuId: 'modeled-storage-lifecycle-transitions',
    };
    awsProvider.lineItems[6] = {
      ...awsProvider.lineItems[6],
      costComponent: 'storage',
      skuId: 'modeled-storage-provisioned-iops',
    };
    const storageResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 70]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 75]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={storageResult}
        form={{
          ...defaultWorkloadForm,
          storageEnabled: true,
          storageSizeGb: '1000',
          storageClass: 'archive',
          monthlyPutRequestsThousand: '1',
          monthlyGetRequestsThousand: '1',
          monthlyRetrievalGb: '250',
          lifecycleTransitionsThousand: '20',
          snapshotSizeGb: '500',
          snapshotRetentionDays: '60',
          storageReplication: 'cross-region',
          provisionedIops: '3000',
          provisionedThroughputMbps: '125',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Storage optimization detail');
    expect(text(container)).toContain(
      'Storage class, retrieval, snapshots, replication, and performance tuning',
    );
    expect(text(container)).toContain('Snapshot retention');
    expect(text(container)).toContain(
      '1,000GB archive · 250GB retrieval · 2K operations · cross region',
    );
    expect(text(container)).toContain('$7.20/mo');
    expect(text(container)).toContain('$86.40/yr');
    expect(text(container)).toContain(
      'Reduce retention, deduplicate snapshots, or move older copies to colder tiers.',
    );
    expect(text(container)).toContain('500GB snapshots · 60 days');
    expect(text(container)).toContain('Storage cost anatomy');
    expect(text(container)).toContain(
      'Classes, operations, retrieval, replication, snapshots, and IOPS',
    );
    expect(text(container)).toContain('Object · Archive');
    expect(text(container)).toContain('2K ops ($2.00/mo)');
    expect(text(container)).toContain('250GB retrieval ($12.00/mo)');
    expect(text(container)).toContain('cross region ($20.00/mo)');
    expect(text(container)).toContain('500GB snapshots / 60d ($24.00/mo)');
    expect(text(container)).toContain('20K lifecycle transitions ($1.00/mo)');
    expect(text(container)).toContain('3,000 IOPS / 125 MB/s ($15.00/mo)');
    expect(text(container)).toContain(
      'Review snapshot retention and older-copy tiering before finalizing storage run-rate.',
    );

    unmount();
  });

  it('surfaces database optimization detail from modeled database dimensions', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 40],
      ['database', 'AWS primary RU/s provisioned capacity estimate', 32],
      ['database', 'AWS primary NoSQL write unit estimate', 20],
      ['database', 'AWS primary backup retention estimate', 10],
      ['database', 'AWS primary read replica estimate', 18],
      ['database', 'AWS primary provisioned IOPS estimate', 8],
      ['database', 'AWS cache replica estimate', 12],
      ['database', 'AWS data warehouse query processing estimate', 25],
      ['database', 'Amazon OpenSearch Service capacity estimate', 16],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'database',
      skuId: 'modeled-database-ru-capacity',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'database',
      skuId: 'modeled-database-nosql-write-units',
    };
    awsProvider.lineItems[3] = {
      ...awsProvider.lineItems[3],
      costComponent: 'database',
      skuId: 'modeled-database-backup-storage',
    };
    awsProvider.lineItems[4] = {
      ...awsProvider.lineItems[4],
      costComponent: 'database',
      skuId: 'modeled-database-read-replica',
    };
    awsProvider.lineItems[5] = {
      ...awsProvider.lineItems[5],
      costComponent: 'database',
      skuId: 'modeled-database-iops',
    };
    awsProvider.lineItems[6] = {
      ...awsProvider.lineItems[6],
      costComponent: 'database',
      skuId: 'modeled-database-cache-replica',
    };
    awsProvider.lineItems[7] = {
      ...awsProvider.lineItems[7],
      costComponent: 'database',
      skuId: 'modeled-analytics-warehouse-query',
    };
    awsProvider.lineItems[8] = {
      ...awsProvider.lineItems[8],
      costComponent: 'database',
      skuId: 'modeled-database-search-capacity',
    };
    const databaseResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 70]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 75]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={databaseResult}
        form={{
          ...defaultWorkloadForm,
          databaseEnabled: true,
          databaseEngine: 'generic_nosql',
          databaseSizeGb: '250',
          databaseBackupStorageGb: '100',
          databaseBackupRetentionDays: '30',
          databaseProvisionedIops: '8000',
          databaseReadReplicaCount: '1',
          databaseCrossRegionReplicaTransferGb: '100',
          databaseNosqlReadRequestUnitsMillion: '50',
          databaseNosqlWriteRequestUnitsMillion: '20',
          databaseRuPerSecond: '4000',
          databaseQueryDataTb: '3',
          databaseCacheReplicaCount: '2',
          databaseStorageGrowthGbPerMonth: '30',
          databaseSearchNodeCount: '2',
          databaseSearchStorageGb: '500',
          databaseSearchQueriesMillion: '25',
          analyticsWarehouseStorageGb: '500',
          analyticsWarehouseQueryTb: '4',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Database optimization detail');
    expect(text(container)).toContain(
      'NoSQL, RU/s, replicas, backups, cache, managed search, and query tuning',
    );
    expect(text(container)).toContain('RU/s provisioned capacity');
    expect(text(container)).toContain('generic nosql · 250GB data · 4,000 RU/s · 70M NoSQL units');
    expect(text(container)).toContain('$8.00/mo');
    expect(text(container)).toContain('$96.00/yr');
    expect(text(container)).toContain(
      'Validate RU/s utilization, autoscale limits, and serverless break-even.',
    );
    expect(text(container)).toContain('4,000 RU/s configured');
    expect(text(container)).toContain('Database cost anatomy');
    expect(text(container)).toContain(
      'Relational, NoSQL, cache, warehouse, search, backup, and IOPS',
    );
    expect(text(container)).toContain('generic nosql · HA / multi-zone');
    expect(text(container)).toContain('4,000 RU/s ($32.00/mo)');
    expect(text(container)).toContain('50M reads / 20M writes ($20.00/mo)');
    expect(text(container)).toContain('1 replicas / 100GB transfer ($18.00/mo)');
    expect(text(container)).toContain('100GB backup / 30GB growth ($10.00/mo)');
    expect(text(container)).toContain('8,000 IOPS ($8.00/mo)');
    expect(text(container)).toContain('7TB query / 500GB warehouse ($25.00/mo)');
    expect(text(container)).toContain('2 cache replicas ($12.00/mo)');
    expect(text(container)).toContain('2 search nodes / 500GB index ($16.00/mo)');

    unmount();
  });

  it('surfaces managed-search optimization detail from search database dimensions', async () => {
    const awsProvider = providerWithItems('aws', [
      ['database', 'Amazon OpenSearch Service capacity estimate', 120],
    ]);
    awsProvider.lineItems[0] = {
      ...awsProvider.lineItems[0],
      costComponent: 'database',
      skuId: 'modeled-database-search-capacity',
    };
    const searchResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 70]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 75]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={searchResult}
        form={{
          ...defaultWorkloadForm,
          databaseEnabled: true,
          databaseEngine: 'generic_nosql',
          databaseSizeGb: '500',
          databaseSearchNodeCount: '2',
          databaseSearchStorageGb: '500',
          databaseSearchQueriesMillion: '25',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Managed search capacity');
    expect(text(container)).toContain('2 search nodes · 500GB index');
    expect(text(container)).toContain('$26.40/mo');
    expect(text(container)).toContain('$316.80/yr');
    expect(text(container)).toContain(
      'Right-size search replicas, index lifecycle, and query capacity before scaling search clusters.',
    );

    unmount();
  });

  it('surfaces runtime optimization detail from serverless and container dimensions', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 40],
      ['compute', 'AWS serverless function GB-second estimate', 90],
      ['operations', 'AWS managed Kubernetes control plane estimate', 72],
      ['storage', 'AWS container registry storage estimate', 4],
      ['network', 'AWS container registry egress estimate', 9],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'compute',
      skuId: 'modeled-serverless-function-duration',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'operations',
      skuId: 'modeled-kubernetes-control-plane',
    };
    awsProvider.lineItems[3] = {
      ...awsProvider.lineItems[3],
      costComponent: 'storage',
      skuId: 'modeled-container-registry-storage',
    };
    awsProvider.lineItems[4] = {
      ...awsProvider.lineItems[4],
      costComponent: 'egress',
      skuId: 'modeled-container-registry-egress',
    };
    const runtimeResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 220]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 230]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={runtimeResult}
        form={{
          ...defaultWorkloadForm,
          functionInvocationsMillion: '5',
          functionDurationMs: '200',
          functionMemoryMb: '512',
          kubernetesClusterCount: '2',
          kubernetesWorkerNodeCount: '6',
          registryStorageGb: '40',
          registryEgressGb: '100',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Runtime optimization detail');
    expect(text(container)).toContain(
      'Functions, memory curve, Kubernetes overhead, registry, and platform fit',
    );
    expect(text(container)).toContain('Function duration / memory');
    expect(text(container)).toContain(
      '5M invocations · 200ms @ 512MB · 2 clusters / 6 nodes · 40GB registry · 100GB image egress',
    );
    expect(text(container)).toContain('$22.50/mo');
    expect(text(container)).toContain('$270.00/yr');
    expect(text(container)).toContain(
      'Tune the memory-duration knee and compare functions with always-on containers for steady traffic.',
    );
    expect(text(container)).toContain('5M invocations · 200ms @ 512MB');
    expect(text(container)).toContain('Serverless memory-duration curve');
    expect(text(container)).toContain('1,024MB @ 100ms');
    expect(text(container)).toContain('$9.33/mo');
    expect(text(container)).toContain(
      'Benchmark 1,024MB; keep duration at or below 100ms to improve latency without raising compute cost.',
    );

    unmount();
  });

  it('surfaces app platform request-based versus always-on model comparison', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 25],
      ['compute', 'AWS managed app platform request estimate', 0],
      ['compute', 'AWS managed app platform active vCPU estimate', 71.11],
      ['compute', 'AWS managed app platform active memory estimate', 3.89],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'compute',
      skuId: 'modeled-app-platform-requests',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'compute',
      skuId: 'modeled-app-platform-request-compute',
    };
    awsProvider.lineItems[3] = {
      ...awsProvider.lineItems[3],
      costComponent: 'compute',
      skuId: 'modeled-app-platform-request-memory',
    };
    const appPlatformResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 210]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 190]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={appPlatformResult}
        form={{
          ...defaultWorkloadForm,
          appPlatformRequestsMillion: '10',
          appPlatformRequestDurationMs: '400',
          appPlatformVcpu: '1',
          appPlatformMemoryGb: '0.5',
          appPlatformAlwaysOnHours: '730',
          appPlatformMinInstances: '1',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('App platform model comparison');
    expect(text(container)).toContain(
      'App Runner, App Service, and Cloud Run request-based vs always-on posture',
    );
    expect(text(container)).toContain('10M requests · 400ms · 1 vCPU / 0.5GB');
    expect(text(container)).toContain('$75.00/mo');
    expect(text(container)).toContain('$49.28/mo');
    expect(text(container)).toContain('Always-on');
    expect(text(container)).toContain('$25.72/mo · $308.64/yr spread');
    expect(text(container)).toContain(
      'Use always-on/provisioned app capacity for steady traffic; request-based metering is $25.72/mo higher at this shape.',
    );

    unmount();
  });

  it('surfaces operations optimization detail from observability and secrets dimensions', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 40],
      ['operations', 'AWS log ingestion estimate', 120],
      ['operations', 'AWS log retention storage estimate', 15],
      ['operations', 'AWS managed secrets estimate', 20],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'operations',
      skuId: 'modeled-operations-log-ingestion',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'operations',
      skuId: 'modeled-operations-log-retention',
    };
    awsProvider.lineItems[3] = {
      ...awsProvider.lineItems[3],
      costComponent: 'operations',
      skuId: 'modeled-security-secrets',
    };
    const operationsResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 230]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 240]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={operationsResult}
        form={{
          ...defaultWorkloadForm,
          observabilityLogsIngestGb: '240',
          observabilityLogRetentionGb: '500',
          observabilityMetricsMillion: '25',
          observabilityTracesMillion: '8',
          secretsCount: '50',
          secretApiCallsTenThousand: '300',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Operations optimization detail');
    expect(text(container)).toContain(
      'Observability, logging, tracing, secrets, WAF, and security posture controls',
    );
    expect(text(container)).toContain('Log ingestion volume');
    expect(text(container)).toContain(
      '25M metrics · 240GB logs · 500GB-mo retention · 8M traces · 50 secrets',
    );
    expect(text(container)).toContain('$36.00/mo');
    expect(text(container)).toContain('$432.00/yr');
    expect(text(container)).toContain(
      'Filter debug noise at source, sample high-volume streams, and route low-value logs to cheaper retention.',
    );
    expect(text(container)).toContain('240GB logs ingested/month');

    unmount();
  });

  it('surfaces private connectivity optimization from VPN and circuit network rows', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 40],
      [
        'network',
        'AWS VPN connectivity estimate (2 connection(s), 730 hrs, 1000 GB transfer)',
        163,
      ],
      [
        'network',
        'AWS private circuit estimate (1 circuit(s), 730 port hrs, 2000 GB transfer)',
        259,
      ],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'egress',
      skuId: 'modeled-vpn-connectivity',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'networking',
      skuId: 'modeled-private-circuit',
    };
    const networkResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 500]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 520]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={networkResult}
        form={{
          ...defaultWorkloadForm,
          vpnConnectionCount: '2',
          vpnConnectionHours: '730',
          vpnDataTransferGb: '1000',
          privateCircuitCount: '1',
          privateCircuitPortHours: '730',
          privateCircuitDataTransferGb: '2000',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Egress optimization detail');
    expect(text(container)).toContain('Private circuit');
    expect(text(container)).toContain('3,000GB private path');
    expect(text(container)).toContain('$64.75/mo');
    expect(text(container)).toContain(
      'Validate port speed, redundancy, metered-vs-unlimited transfer, and VPN-to-private-circuit break-even before final network design.',
    );
    expect(text(container)).toContain(
      'Connectivity architecture review models $64.75/mo opportunity at 25% of that private-connectivity baseline.',
    );
    expect(text(container)).toContain('Networking cost itemization');
    expect(text(container)).toContain(
      'Load balancing, CDN, NAT, DNS, VPN, and private-path charges',
    );
    expect(text(container)).toContain('VPN connectivity');
    expect(text(container)).toContain('Private connectivity');
    expect(text(container)).toContain('2 connection(s), 730 hrs, 1000 GB transfer');
    expect(text(container)).toContain('1 circuit(s), 730 port hrs, 2000 GB transfer');
    expect(text(container)).toContain('Monthly modeled subtotal');
    expect(text(container)).toContain(
      'Validate tunnel count, redundancy, transfer volume, and private-circuit break-even.',
    );
    expect(text(container)).toContain(
      'Validate port speed, redundancy, metered transfer, and commitment terms.',
    );

    unmount();
  });

  it('renders FinOps feature additions without fabricating unsupported backend data', async () => {
    const awsRichProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 50],
      ['storage', 'aws storage', 10],
      ['database', 'aws database', 10],
      ['network', 'aws network egress', 30],
    ]);
    awsRichProvider.lineItems[0].pricingModels = [
      {
        model: 'spot',
        available: true,
        estimated: true,
        monthlyCostUsd: 24,
        caveat: 'Spot pricing is interruptible and volatile.',
      },
      {
        model: 'reserved-1yr',
        available: true,
        monthlyCostUsd: 42,
        upfrontOption: 'partial',
        upfrontCostUsd: 120,
      },
    ];
    awsRichProvider.lineItems[3] = {
      ...awsRichProvider.lineItems[3],
      costComponent: 'egress',
      region: 'us-east-1',
      unit: 'GB',
      unitPriceUsd: 0.1,
      pricingBasis: 'tiered',
      egressTiers: [
        {
          tierFromGb: 0,
          tierToGb: 300,
          pricePerGb: 0.1,
          billableGb: 300,
          monthlyCostUsd: 30,
        },
      ],
    };
    const richResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'azure',
      providers: [
        {
          ...awsRichProvider,
          pricingModels: [
            {
              model: 'on-demand',
              available: true,
              monthlyCostUsd: 100,
              savingsPercentVsOnDemand: 0,
            },
            {
              model: 'spot',
              available: true,
              providerTerm: 'EC2 Spot Instances',
              estimated: true,
              volatility: 'volatile',
              monthlyCostUsd: 47.5,
              savingsPercentVsOnDemand: 52.5,
              caveat: 'Spot pricing is interruptible and volatile.',
            },
            {
              model: 'reserved-1yr',
              available: true,
              monthlyCostUsd: 42,
              hourlyCostUsd: 0.06,
              upfrontOption: 'partial',
              upfrontCostUsd: 120,
              commitmentTermMonths: 12,
              savingsPercentVsOnDemand: 58,
            },
          ],
        },
        providerWithItems('azure', [
          ['compute', 'azure compute', 40],
          ['storage', 'azure storage', 8],
          ['database', 'azure database', 17],
          ['network', 'azure network egress', 10],
        ]),
        providerWithItems('gcp', [
          ['compute', 'gcp compute', 60],
          ['storage', 'gcp storage', 12],
          ['database', 'gcp database', 23],
          ['network', 'gcp network egress', 15],
        ]),
      ],
    };
    const whatIfResult: ComparisonResult = {
      ...richResult,
      comparisonId: 'scenario-what-if-123',
      cheapestProviderId: 'azure',
      providers: [
        providerWithItems('aws', [['compute', 'aws what-if compute', 120]]),
        providerWithItems('azure', [['compute', 'azure what-if compute', 90]]),
        providerWithItems('gcp', [['compute', 'gcp what-if compute', 105]]),
      ],
    };
    const client = clientMock({
      createComparison: jest.fn(async () => whatIfResult),
    });
    const analytics = await client.getComparisonAnalytics(richResult.comparisonId);
    const { container, unmount } = render(
      <ComparisonView
        analytics={analytics}
        client={client}
        comparison={richResult}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Commitment scenario controls');
    expect(buttonByText(container, 'On-demand').disabled).toBe(false);
    expect(buttonByText(container, '1yr reserved').disabled).toBe(false);
    expect(buttonByText(container, '3yr reserved').disabled).toBe(false);
    expect(buttonByText(container, 'Spot').disabled).toBe(false);
    expect(buttonByText(container, 'Spot').getAttribute('title')).toContain(
      'Spot pricing models interruptible capacity',
    );
    expect(buttonByText(container, 'Savings plan').disabled).toBe(false);
    expect(text(container)).toContain('Full cost matrix');
    expect(text(container)).toContain('AWS On-demand');
    expect(text(container)).toContain('Azure 1yr');
    expect(
      Array.from(container.querySelectorAll('th'))
        .find((header) => header.textContent?.includes('AWS Spot'))
        ?.getAttribute('title'),
    ).toContain('estimate ranges');
    expect(text(container)).toContain('Columns');
    expect(text(container)).toContain('Compact cost view');
    const columnModeSelect = selectByOptionValue(container, 'summary');
    await changeSelect(columnModeSelect, 'summary');
    expect(columnModeSelect.value).toBe('summary');
    expect(text(container)).toContain('$24.00 est.');
    expect(text(container)).toContain('$42.00');
    expect(text(container)).toContain('Production-depth analytics');
    expect(text(container)).toContain('AWS commitment ROI');
    expect(text(container)).toContain('Month 3');
    expect(text(container)).toContain('Break-even');
    expect(text(container)).toContain('Provider delta analysis');
    expect(text(container)).toContain('Why each service is cheaper');
    expect(text(container)).toContain('Azure is 33% lower than GCP for compute.');
    expect(text(container)).toContain('Region variance heat map');
    expect(text(container)).toContain('Modeled monthly sensitivity by compliant region');
    expect(text(container)).toContain('Backend-modeled baseline region sensitivity.');
    expect(text(container)).toContain('Commitment coverage gap');
    expect(text(container)).toContain('0% on-demand vs target blend vs 100% committed');
    expect(text(container)).toContain('$20.30/mo');
    expect(text(container)).toContain('35% exposed');
    expect(text(container)).toContain('Cross-provider TCO signals');
    expect(text(container)).toContain('Egress exit proxy');
    expect(text(container)).toContain('Free-tier signal');
    expect(text(container)).toContain('Data-out proxy');
    expect(text(container)).toContain('Egress optimization detail');
    expect(text(container)).toContain(
      'Cache, NAT, private transfer, and high-volume data-out actions',
    );
    expect(text(container)).toContain('Internet egress');
    expect(text(container)).toContain(
      'Evaluate CDN offload, cache-control, and same-region data access.',
    );
    expect(text(container)).toContain('Spot blend optimizer');
    expect(text(container)).toContain('Mixed on-demand and interruptible-capacity estimate');
    expect(text(container)).toContain('80% on-demand / 20% spot');
    expect(text(container)).toContain('$89.50/mo est.');
    expect(text(container)).toContain('High interruption risk');
    expect(text(container)).toContain('daily-to-weekly planning band');
    expect(text(container)).toContain('20% interruptible share');
    expect(text(container)).toContain('Architecture risk flags');
    expect(text(container)).toContain('Cost behaviors to validate before commitment');
    expect(text(container)).toContain('Backend egress driver');
    expect(text(container)).toContain(
      'Backend FinOps finding: Backend identified egress driver from cached totals.',
    );
    expect(text(container)).toContain('Data-transfer concentration');
    expect(text(container)).toContain('Scenario sensitivity');
    expect(text(container)).toContain('Provider winner under operational shocks');
    expect(text(container)).toContain('Egress traffic +50%');
    expect(text(container)).toContain(
      'Backend analytics varied egress traffic by +50% against cached dimension totals.',
    );
    expect(text(container)).toContain('Payment and TCO detail');
    expect(text(container)).toContain('Commitment scenario monthly, hourly, and term view');
    expect(
      Array.from(container.querySelectorAll('th'))
        .find((header) => header.textContent?.includes('Effective hourly'))
        ?.getAttribute('title'),
    ).toContain('blended hourly cost');
    expect(text(container)).toContain('Upfront cash');
    expect(text(container)).toContain('$120.00');
    expect(text(container)).toContain('$624.00');
    expect(text(container)).toContain('upfront $120.00');
    expect(text(container)).toContain('Region and scale what-if');
    expect(text(container)).toContain('Cache-backed rerun without natural-language reparse');
    expect(text(container)).toContain('Egress tiered breakdown');
    expect(text(container)).toContain('0-300 GB');
    expect(text(container)).toContain('Best:');
    await click(buttonByText(container, 'Run what-if'));
    expect(client.parseWorkload).not.toHaveBeenCalled();
    expect(client.createComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: expect.objectContaining({
          region: expect.objectContaining({
            preference: 'us-east',
          }),
        }),
        compute: [
          expect.objectContaining({
            instanceCount: 3,
          }),
        ],
      }),
    );
    expect(text(container)).toContain('Scenario comparison scenario-what-if-123');
    expect(text(container)).toContain('+$15.00');
    await click(buttonByText(container, 'Spot'));
    expect(text(container)).toContain('Est. $38.00-$57.00');
    expect(text(container)).toContain('estimated $38.00-$57.00/mo range');
    await click(buttonByText(container, '3yr reserved'));
    expect(text(container)).toContain('3yr reserved: Not available for this configuration.');
    expect(text(container)).toContain('Compute, storage, and data-transfer mix');
    expect(text(container)).toContain('Egress/data transfer');
    expect(text(container)).toContain('Egress risk: $30.00 is 200% above the lowest provider.');
    expect(text(container)).toContain(
      'Create a real read-only report link scoped to this workload, pricing model, and time granularity.',
    );
    expect(client.getExchangeRates).toHaveBeenCalledWith('USD');
    expect(text(container)).toContain('Exchange rates');

    await changeInput(inputById(container, 'budget-threshold-usd'), '70');

    expect(text(container)).toContain('Estimated run-rate exceeds budget threshold.');
    expect(text(container)).toContain('scheduled backend evaluator runs');
    await click(buttonByText(container, 'Save backend budget'));
    expect(client.createBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        thresholdUsd: 70,
        alertOnAnomalyPercent: 20,
      }),
    );
    expect(text(container)).toContain('Backend budget saved.');

    await click(buttonByText(container, 'Dismiss'));

    expect(text(container)).not.toContain('Estimated run-rate exceeds budget threshold.');

    unmount();
  });
});

function render(ui: React.ReactElement): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | undefined;

  act(() => {
    root = createRoot(container);
    flushSync(() => root?.render(ui));
  });

  return {
    container,
    unmount: () => {
      act(() => {
        flushSync(() => root?.unmount());
      });
      container.remove();
    },
  };
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

async function submitForm(form: HTMLFormElement | null): Promise<void> {
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Expected form to exist');
  }

  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

async function settleAsyncEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function changeInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function changeTextarea(textarea: HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function changeSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function changeFileInput(input: HTMLInputElement, file: File): Promise<void> {
  await act(async () => {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function inputById(container: HTMLElement, id: string): HTMLInputElement {
  const input = container.querySelector(`#${id}`);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Input not found: ${id}`);
  }

  return input;
}

function textareaById(container: HTMLElement, id: string): HTMLTextAreaElement {
  const textarea = container.querySelector(`#${id}`);

  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error(`Textarea not found: ${id}`);
  }

  return textarea;
}

function selectById(container: HTMLElement, id: string): HTMLSelectElement {
  const select = container.querySelector(`#${id}`);

  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Select not found: ${id}`);
  }

  return select;
}

function selectByOptionValue(container: HTMLElement, value: string): HTMLSelectElement {
  const select = Array.from(container.querySelectorAll('select')).find(
    (candidate): candidate is HTMLSelectElement =>
      candidate instanceof HTMLSelectElement &&
      Array.from(candidate.options).some((option) => option.value === value),
  );

  if (!select) {
    throw new Error(`Select not found for option value: ${value}`);
  }

  return select;
}

function selectByAriaLabel(container: HTMLElement, label: string): HTMLSelectElement {
  const select = Array.from(container.querySelectorAll('select')).find(
    (candidate): candidate is HTMLSelectElement =>
      candidate instanceof HTMLSelectElement && candidate.getAttribute('aria-label') === label,
  );

  if (!select) {
    throw new Error(`Select not found for aria-label: ${label}`);
  }

  return select;
}

function inputByWorkspaceLabel(container: HTMLElement, label: string): HTMLInputElement {
  const input = workspaceFieldByLabel(container, label).querySelector('input');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Workspace input not found: ${label}`);
  }

  return input;
}

function selectByWorkspaceLabel(container: HTMLElement, label: string): HTMLSelectElement {
  const select = workspaceFieldByLabel(container, label).querySelector('select');

  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Workspace select not found: ${label}`);
  }

  return select;
}

function workspaceFieldByLabel(container: HTMLElement, label: string): HTMLLabelElement {
  const field = Array.from(container.querySelectorAll<HTMLLabelElement>('.workspace-field')).find(
    (candidate) => candidate.querySelector('span')?.textContent?.trim() === label,
  );

  if (!(field instanceof HTMLLabelElement)) {
    throw new Error(`Workspace field not found: ${label}`);
  }

  return field;
}

function formContainingText(container: HTMLElement, label: string): HTMLFormElement {
  const form = Array.from(container.querySelectorAll<HTMLFormElement>('form')).find((candidate) =>
    candidate.textContent?.includes(label),
  );

  if (!(form instanceof HTMLFormElement)) {
    throw new Error(`Form not found containing: ${label}`);
  }

  return form;
}

function checkboxByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const field = Array.from(container.querySelectorAll('.checkbox-field')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  const input = field?.querySelector('input');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Checkbox not found: ${label}`);
  }

  return input;
}

function serviceFamilyCheckboxByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const field = Array.from(container.querySelectorAll('.service-family-card')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  const input = field?.querySelector('input');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Service family not found: ${label}`);
  }

  return input;
}

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

function buttonByAriaLabel(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate): candidate is HTMLButtonElement =>
      candidate instanceof HTMLButtonElement && candidate.getAttribute('aria-label') === label,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found for aria-label: ${label}`);
  }

  return button;
}

function lastButtonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button')).filter(
    (candidate): candidate is HTMLButtonElement =>
      candidate instanceof HTMLButtonElement && candidate.textContent?.trim() === label,
  );
  const button = buttons.at(-1);

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

function templateButtonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.architecture-template-button'),
  ).find((candidate) => candidate.textContent?.includes(label));

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Template button not found: ${label}`);
  }

  return button;
}

function comparisonHistoryButtonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.comparison-history-row'),
  ).find((candidate) => candidate.textContent?.includes(label));

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Comparison history button not found: ${label}`);
  }

  return button;
}

/**
 * Selects a result tab.
 *
 * Replaces the old "expand the disclosure" step: the comparison detail is a tab
 * strip now, so reaching a panel means choosing it the way a user does.
 */
async function selectResultTab(container: HTMLElement, label: string): Promise<void> {
  const tab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );

  if (!tab) {
    throw new Error(`Result tab not found: ${label}`);
  }

  await click(tab);
}

function mobileProviderLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.mobile-total-bar > span')).map((providerTotal) => {
    const value = providerTotal.textContent ?? '';
    const provider = ['AWS', 'Azure', 'GCP'].find((candidate) => value.startsWith(candidate));

    return provider ?? value;
  });
}

function clearClientCalls(client: PolyCostClient): void {
  [
    client.parseWorkload,
    client.parseDiagram,
    client.validateWorkload,
    client.createComparison,
    client.getComparisonAnalytics,
    client.refreshLiveComparison,
    client.createExportJob,
    client.getExportJob,
    client.downloadExportJob,
    client.exportComparison,
  ].forEach((method) => {
    if (jest.isMockFunction(method)) {
      method.mockClear();
    }
  });
}

function text(container: HTMLElement): string {
  return container.textContent ?? '';
}

/**
 * Reveals the workspace control center.
 *
 * It is hidden on the landing page now - an anonymous visitor should see the
 * product, not a sign-in form and two "Admin required" panels - so anything
 * exercising it has to open it the way a user does.
 */
async function openWorkspace(container: HTMLElement): Promise<void> {
  const signIn = [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Sign in',
  );

  if (!signIn) {
    throw new Error('header Sign in button not found');
  }

  await click(signIn);
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function freshCacheSummary(
  catalogRows: number,
  currentRateRows: number,
): DataHealthResponse['providers'][number]['cache'] {
  return {
    catalogRows,
    currentRateRows,
    latestCatalogSyncAt: '2026-06-30T23:00:00.000Z',
    latestRateSyncAt: '2026-06-30T23:00:00.000Z',
    ageHours: 1,
    freshness: 'fresh',
    syncStatusCounts: {
      success: catalogRows + currentRateRows,
      partial: 0,
      failed: 0,
    },
  };
}

function diagramParseResult(
  draftNws: DiagramParseResult['draftNws'],
  component: {
    displayLabel: string;
    assumedDefaults: string[];
  } = {
    displayLabel: 'Diagram service',
    assumedDefaults: [],
  },
): DiagramParseResult {
  return {
    importId: '77777777-7777-4777-8777-777777777777',
    parserConfidence: 'high',
    fieldsRequiringReview: component.assumedDefaults,
    source: {
      format: 'mermaid',
      fileName: 'diagram.mmd',
      sizeBytes: 256,
      sha256: 'a'.repeat(64),
      parsedAt: '2026-07-02T00:00:00.000Z',
      persisted: false,
      tempFileStored: true,
      expiresAt: '2026-07-03T00:00:00.000Z',
    },
    graph: {
      format: 'mermaid',
      nodes: [
        {
          id: 'app',
          displayLabel: component.displayLabel,
          kind: 'resource',
          sourceRef: 'mermaid:line-2-app',
        },
      ],
      edges: [{ id: 'edge-1', sourceId: 'lb', targetId: 'app' }],
      ignoredNodes: [],
    },
    review: {
      components: [
        {
          nodeId: 'app',
          displayLabel: component.displayLabel,
          serviceCategory: 'compute',
          serviceType: 'container-app',
          confidence: 'moderate',
          sourceRef: 'mermaid:line-2-app',
          assumedDefaults: component.assumedDefaults,
          evidence: 'Label matched alias /container/ -> container-app',
          editable: true,
        },
      ],
      unresolvedClassifications: [],
      ignoredNodes: [],
      assumedDefaults: component.assumedDefaults,
    },
    draftNws: {
      ...draftNws,
      serviceRequirements: draftNws.serviceRequirements?.map((requirement) => ({
        ...requirement,
        scaleParams: {
          ...requirement.scaleParams,
          diagramNodeId: 'app',
        },
      })),
    },
  };
}

function clientMock(overrides: Partial<PolyCostClient> = {}): PolyCostClient {
  const parsed: ParsedNwsDraft = {
    draftNws: buildNwsFromForm(defaultWorkloadForm),
    parserConfidence: 'medium',
    fieldsRequiringReview: [],
  };
  const pricingStatus: PricingStatusResponse = {
    providers: [
      {
        providerId: 'aws',
        status: 'success',
        recordsUpdated: 0,
        recordsRejected: 0,
        recordsSkipped: 0,
      },
      {
        providerId: 'azure',
        status: 'success',
        recordsUpdated: 0,
        recordsRejected: 0,
        recordsSkipped: 0,
      },
      {
        providerId: 'gcp',
        status: 'success',
        recordsUpdated: 0,
        recordsRejected: 0,
        recordsSkipped: 0,
      },
    ],
  };
  const backendHealth: BackendHealthResponse = {
    status: 'ok',
    service: 'polycost-api',
  };
  const dataHealth: DataHealthResponse = {
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
        lastSuccessfulRun: '2026-06-30T23:00:00.000Z',
        cache: freshCacheSummary(30, 18),
        message: 'Pricing cache refreshed 1h ago across 30 catalog rows and 18 current rate rows.',
      },
      {
        providerId: 'azure',
        status: 'success',
        freshness: 'fresh',
        ageHours: 1,
        recordsUpdated: 10,
        recordsRejected: 0,
        recordsSkipped: 2,
        lastSuccessfulRun: '2026-06-30T23:00:00.000Z',
        cache: freshCacheSummary(24, 15),
        message: 'Pricing cache refreshed 1h ago across 24 catalog rows and 15 current rate rows.',
      },
      {
        providerId: 'gcp',
        status: 'success',
        freshness: 'fresh',
        ageHours: 1,
        recordsUpdated: 8,
        recordsRejected: 0,
        recordsSkipped: 1,
        lastSuccessfulRun: '2026-06-30T23:00:00.000Z',
        cache: freshCacheSummary(20, 12),
        message: 'Pricing cache refreshed 1h ago across 20 catalog rows and 12 current rate rows.',
      },
    ],
  };
  const pendingRegionCatalog = new Promise<RegionCatalogResponse>(() => undefined);
  const reportExportJob: ReportExportJobResponse = {
    jobId: '66666666-6666-4666-8666-666666666666',
    comparisonId: comparisonResult.comparisonId,
    format: 'pdf',
    interval: 'monthly',
    pricingModel: 'on-demand',
    status: 'completed',
    fileName: 'polycost-comparison.pdf',
    contentType: 'application/pdf',
    createdAt: '2026-07-01T00:00:00.000Z',
    startedAt: '2026-07-01T00:00:01.000Z',
    completedAt: '2026-07-01T00:00:02.000Z',
    statusUrl: `/api/v1/comparisons/${comparisonResult.comparisonId}/export-jobs/66666666-6666-4666-8666-666666666666`,
    downloadUrl: `/api/v1/comparisons/${comparisonResult.comparisonId}/export-jobs/66666666-6666-4666-8666-666666666666/download`,
  };
  const terraformBundle: TerraformGenerationResult = {
    targetCloud: 'gcp',
    generatedAt: '2026-07-07T00:00:00.000Z',
    bundleName: 'client-portal-gcp-terraform',
    workspaceName: 'client-portal',
    region: 'us-central1',
    generationProfile: {
      runtimeTarget: 'vm',
      networkTopology: 'private',
      availabilityMode: 'multi-az',
      policyPackIncluded: true,
      moduleScaffoldIncluded: true,
    },
    source: {
      schemaVersion: '1.0',
      workloadName: 'Client Portal',
      workloadType: 'web_app',
      sourceType: 'structured_form',
    },
    resourceSummary: {
      computeInstances: 1,
      objectStorageBuckets: 1,
      blockStorageVolumes: 0,
      fileShares: 0,
      relationalDatabases: 1,
      loadBalancers: 1,
      cdnEnabled: false,
      multiAz: true,
      multiRegion: false,
    },
    serviceMappings: [
      {
        requirement: 'compute',
        terraformResource: 'google_compute_instance.app',
        confidence: 'direct',
        note: 'NWS compute maps to VM compute.',
      },
    ],
    files: [
      {
        path: 'versions.tf',
        content:
          'terraform {\n  required_providers {\n    google = {\n      source = "hashicorp/google"\n    }\n  }\n}\n',
        sha256: 'a'.repeat(64),
      },
      {
        path: 'main.tf',
        content: 'resource "google_compute_instance" "app" {\n  name = "client-portal"\n}\n',
        sha256: 'b'.repeat(64),
      },
    ],
    archive: {
      filename: 'client-portal-gcp-terraform.zip',
      format: 'zip',
      mimeType: 'application/zip',
      contentBase64: 'UEsDBAoAAAAAAAEAIQAAAAAA',
      sha256: 'c'.repeat(64),
      sizeBytes: 256,
    },
    validation: {
      status: 'passed',
      executionMode: 'static-plus-policy',
      checks: [
        {
          id: 'required-provider-pinned',
          status: 'passed',
          message: 'Provider is pinned.',
        },
      ],
      commands: [
        {
          command: 'terraform validate',
          status: 'not-run',
          message: 'Run after terraform init.',
        },
      ],
    },
    assumptions: ['Compute Engine is the baseline compute target.'],
    securityNotes: ['GCP credentials are not written into generated Terraform files.'],
    nextSteps: ['Run terraform fmt -check and terraform validate.'],
  };

  return {
    getHealth: jest.fn(async () => backendHealth),
    getDataHealth: jest.fn(async () => dataHealth),
    register: jest.fn(async () => ({
      token: 'session-token',
      expiresAt: '2099-07-07T00:00:00.000Z',
      account: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'architect@example.com',
      },
      team: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Architecture team',
        role: 'owner' as const,
      },
    })),
    login: jest.fn(async () => ({
      token: 'session-token',
      expiresAt: '2099-07-07T00:00:00.000Z',
      account: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'architect@example.com',
      },
      team: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Architecture team',
        role: 'owner' as const,
      },
    })),
    getCurrentSession: jest.fn(async () => ({
      account: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'architect@example.com',
      },
      activeTeam: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Architecture team',
        role: 'owner' as const,
      },
      teams: [
        {
          teamId: '22222222-2222-4222-8222-222222222222',
          teamName: 'Architecture team',
          role: 'owner' as const,
        },
      ],
      session: {
        id: '33333333-3333-4333-8333-333333333333',
        expiresAt: '2099-07-07T00:00:00.000Z',
      },
    })),
    logout: jest.fn(async () => ({ revoked: true as const })),
    updateAccountProfile: jest.fn(async (input) => ({
      id: '11111111-1111-4111-8111-111111111111',
      email: input.email,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      status: 'active' as const,
    })),
    changePassword: jest.fn(async () => ({ changed: true as const })),
    deleteAccount: jest.fn(async () => ({ deleted: true as const })),
    listAccountSessions: jest.fn(async () => [
      {
        id: '33333333-3333-4333-8333-333333333333',
        current: true,
        createdAt: '2026-07-06T00:00:00.000Z',
        lastSeenAt: '2026-07-06T00:10:00.000Z',
        expiresAt: '2099-07-07T00:00:00.000Z',
        hasUserAgent: true,
        hasIp: true,
      },
      {
        id: '99999999-9999-4999-8999-999999999999',
        current: false,
        createdAt: '2026-07-05T00:00:00.000Z',
        lastSeenAt: '2026-07-05T00:10:00.000Z',
        expiresAt: '2099-07-07T00:00:00.000Z',
        hasUserAgent: true,
        hasIp: false,
      },
    ]),
    revokeOtherSessions: jest.fn(async () => ({ revoked: 1 })),
    switchActiveTeam: jest.fn(async (teamId) => ({
      activeTeam:
        teamId === '55555555-5555-4555-8555-555555555555'
          ? {
              id: '55555555-5555-4555-8555-555555555555',
              name: 'Platform Council',
              role: 'owner' as const,
            }
          : {
              id: '22222222-2222-4222-8222-222222222222',
              name: 'Architecture team',
              role: 'owner' as const,
            },
      session: {
        id: '33333333-3333-4333-8333-333333333333',
        expiresAt: '2099-07-07T00:00:00.000Z',
      },
    })),
    createTeam: jest.fn(async (input) => ({
      teamId: '55555555-5555-4555-8555-555555555555',
      teamName: input.teamName,
      plan: 'oss' as const,
      role: 'owner' as const,
      updatedAt: '2026-07-06T00:00:00.000Z',
    })),
    updateTeamSettings: jest.fn(async (_teamId, input) => ({
      teamId: '22222222-2222-4222-8222-222222222222',
      teamName: input.teamName,
      plan: 'oss' as const,
      role: 'owner' as const,
      updatedAt: '2026-07-06T00:00:00.000Z',
    })),
    listTeamMembers: jest.fn(async () => [
      {
        accountId: '11111111-1111-4111-8111-111111111111',
        email: 'architect@example.com',
        displayName: 'Architect',
        role: 'owner' as const,
        createdAt: '2026-07-06T00:00:00.000Z',
      },
    ]),
    inviteTeamMember: jest.fn(async (_teamId, input) => ({
      id: '88888888-8888-4888-8888-888888888888',
      teamId: '22222222-2222-4222-8222-222222222222',
      email: input.email,
      role: input.role,
      status: 'pending' as const,
      invitedByAccountId: '11111111-1111-4111-8111-111111111111',
      expiresAt: '2026-07-13T00:00:00.000Z',
      createdAt: '2026-07-06T00:00:00.000Z',
      inviteToken: 'invite-token',
      inviteUrl: 'http://localhost:3001/?invite_token=invite-token',
    })),
    listTeamInvitations: jest.fn(async () => []),
    listTeamAuditEvents: jest.fn(async () => [
      {
        id: 'audit-1',
        teamId: '22222222-2222-4222-8222-222222222222',
        actorAccountId: '11111111-1111-4111-8111-111111111111',
        actorEmail: 'architect@example.com',
        action: 'team.invitation.created' as const,
        targetType: 'invitation' as const,
        targetId: '88888888-8888-4888-8888-888888888888',
        metadata: {},
        createdAt: '2026-07-06T00:00:01.000Z',
      },
    ]),
    listTeamScimTokens: jest.fn(async () => []),
    listTeamScimUsers: jest.fn(async () => []),
    createTeamScimToken: jest.fn(async (_teamId, input) => ({
      id: 'scim-token-1',
      teamId: '22222222-2222-4222-8222-222222222222',
      displayName: input.displayName,
      tokenPrefix: 'pc_scim_new',
      token: 'pc_scim_new-secret',
      createdAt: '2026-07-09T00:00:00.000Z',
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    })),
    revokeTeamScimToken: jest.fn(async (_teamId, tokenId) => ({
      id: tokenId,
      teamId: '22222222-2222-4222-8222-222222222222',
      displayName: 'Okta production SCIM',
      tokenPrefix: 'pc_scim_new',
      createdAt: '2026-07-09T00:00:00.000Z',
      revokedAt: '2026-07-09T01:00:00.000Z',
    })),
    resendTeamInvitation: jest.fn(async () => ({
      id: '88888888-8888-4888-8888-888888888888',
      teamId: '22222222-2222-4222-8222-222222222222',
      email: 'finops@example.com',
      role: 'member' as const,
      status: 'pending' as const,
      invitedByAccountId: '11111111-1111-4111-8111-111111111111',
      expiresAt: '2026-07-13T00:00:00.000Z',
      createdAt: '2026-07-06T00:05:00.000Z',
      inviteToken: 'refreshed-invite-token',
      inviteUrl: 'http://localhost:3001/?invite_token=refreshed-invite-token',
    })),
    revokeTeamInvitation: jest.fn(async () => ({
      id: '88888888-8888-4888-8888-888888888888',
      teamId: '22222222-2222-4222-8222-222222222222',
      email: 'finops@example.com',
      role: 'member' as const,
      status: 'revoked' as const,
      invitedByAccountId: '11111111-1111-4111-8111-111111111111',
      expiresAt: '2026-07-13T00:00:00.000Z',
      createdAt: '2026-07-06T00:00:00.000Z',
      revokedAt: '2026-07-06T00:00:01.000Z',
    })),
    acceptTeamInvitation: jest.fn(async () => ({
      id: '88888888-8888-4888-8888-888888888888',
      teamId: '22222222-2222-4222-8222-222222222222',
      email: 'architect@example.com',
      role: 'member' as const,
      status: 'accepted' as const,
      invitedByAccountId: '11111111-1111-4111-8111-111111111111',
      acceptedByAccountId: '11111111-1111-4111-8111-111111111111',
      expiresAt: '2026-07-13T00:00:00.000Z',
      createdAt: '2026-07-06T00:00:00.000Z',
      acceptedAt: '2026-07-06T00:00:01.000Z',
    })),
    updateTeamMemberRole: jest.fn(async (_teamId, accountId, role) => ({
      accountId,
      email: 'architect@example.com',
      displayName: 'Architect',
      role,
      createdAt: '2026-07-06T00:00:00.000Z',
    })),
    removeTeamMember: jest.fn(async () => ({ removed: true as const })),
    getSsoStatus: jest.fn(async () => ({
      localLoginEnabled: true,
      oidcConfigured: false,
      samlConfigured: false,
      configuredProviders: [],
      callbackUrls: {
        oidc: 'http://localhost:3001/api/v1/auth/sso/oidc/callback',
        saml: 'http://localhost:3001/api/v1/auth/sso/saml/acs',
      },
    })),
    previewTeamInvitation: jest.fn(async () => ({
      status: 'pending' as const,
      email: 'finops@example.com',
      role: 'member' as const,
      teamId: '22222222-2222-4222-8222-222222222222',
      expiresAt: '2026-07-13T00:00:00.000Z',
      message: 'Invitation is ready to accept after sign-in.',
    })),
    startMockOidcLogin: jest.fn(async () => ({
      providerType: 'oidc' as const,
      mode: 'mock' as const,
      authorizationUrl: 'http://localhost:3001/api/v1/auth/sso/mock/oidc/authorize?state=signed',
      callbackUrl: 'http://localhost:3001/api/v1/auth/sso/oidc/callback',
      state: 'signed',
      expiresAt: '2026-07-06T00:10:00.000Z',
    })),
    completeMockOidcCallback: jest.fn(async () => ({
      token: 'sso-session-token',
      expiresAt: '2099-07-07T00:00:00.000Z',
      account: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'finops@example.com',
      },
      sso: {
        providerType: 'oidc' as const,
        issuerUrl: 'https://idp.example.com',
        subjectHash: 'a'.repeat(64),
        stateVerified: true as const,
      },
    })),
    configureSsoProvider: jest.fn(async (teamId, input) => ({
      providerType: input.providerType,
      displayName: input.displayName,
      issuerUrl: input.issuerUrl,
      status: 'configured' as const,
    })),
    testSsoConnection: jest.fn(async (_teamId, input) => ({
      ok: true,
      providerType: input.providerType,
      issuerUrl: input.issuerUrl,
      checkedAt: '2026-07-06T00:00:00.000Z',
      message: 'Mock SSO connection accepted.',
    })),
    parseWorkload: jest.fn(async () => parsed),
    parseDiagram: jest.fn(async () => ({
      importId: '77777777-7777-4777-8777-777777777777',
      parserConfidence: 'high' as const,
      fieldsRequiringReview: [],
      source: {
        format: 'mermaid' as const,
        fileName: 'diagram.mmd',
        sizeBytes: 256,
        sha256: 'a'.repeat(64),
        parsedAt: '2026-07-02T00:00:00.000Z',
        persisted: false,
        tempFileStored: true,
        expiresAt: '2026-07-03T00:00:00.000Z',
      },
      graph: {
        format: 'mermaid' as const,
        nodes: [],
        edges: [],
        ignoredNodes: [],
      },
      review: {
        components: [],
        unresolvedClassifications: [],
        ignoredNodes: [],
        assumedDefaults: [],
      },
      draftNws: parsed.draftNws,
    })),
    validateWorkload: jest.fn(async () => ({ valid: true as const })),
    createComparison: jest.fn(async () => comparisonResult),
    generateTerraform: jest.fn(async () => terraformBundle),
    getComparisonAnalytics: jest.fn(async () => ({
      comparisonId: comparisonResult.comparisonId,
      generatedAt: '2026-07-02T12:00:00.000Z',
      pricingAsOf: comparisonResult.pricingAsOf,
      executiveForecast: {
        horizonDays: 90 as const,
        assumption: '90-day projection uses current monthly run rate x 3.',
        providerForecasts: [
          {
            providerId: 'gcp' as const,
            monthlyRunRateUsd: 30,
            ninetyDayRunRateUsd: 90,
            annualizedRunRateUsd: 360,
          },
        ],
      },
      costCoverageMap: [
        {
          providerId: 'gcp' as const,
          dimension: 'Compute families and sizing',
          status: 'Covered',
          pricedRows: 1,
          approximateRows: 0,
          monthlyUsd: 30,
          evidence: 'gcp compute row is priced.',
          reviewCue: 'Validate family.',
        },
      ],
      costComposition: [
        {
          providerId: 'gcp' as const,
          totalMonthlyUsd: 30,
          items: [
            {
              dimension: 'compute' as const,
              label: 'Backend compute base',
              monthlyCostUsd: 30,
              percentOfProviderTotal: 100,
              runningMonthlyUsd: 30,
              topDriver: 'gcp compute',
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
          evidence: 'Backend-modeled baseline region sensitivity.',
          isSelected: true,
          complianceEligible: true,
          lowestProviderId: 'gcp' as const,
          providers: [
            {
              providerId: 'aws' as const,
              providerRegion: 'us-east-1',
              modeledMonthlyUsd: 42,
              deltaVsSelectedMonthlyUsd: 0,
              isLowest: false,
            },
            {
              providerId: 'azure' as const,
              providerRegion: 'eastus',
              modeledMonthlyUsd: 38,
              deltaVsSelectedMonthlyUsd: 0,
              isLowest: false,
            },
            {
              providerId: 'gcp' as const,
              providerRegion: 'us-east1',
              modeledMonthlyUsd: 30,
              deltaVsSelectedMonthlyUsd: 0,
              isLowest: true,
            },
          ],
        },
      ],
      egressNetworkingDetails: [
        {
          id: 'aws-egress-1',
          providerId: 'aws' as const,
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
          variable: 'egress_traffic' as const,
          label: 'Egress traffic',
          changePercent: 50,
          providerId: 'aws' as const,
          baselineMonthlyUsd: 42,
          adjustedMonthlyUsd: 48,
          deltaMonthlyUsd: 6,
        },
        {
          variable: 'egress_traffic' as const,
          label: 'Egress traffic',
          changePercent: 50,
          providerId: 'azure' as const,
          baselineMonthlyUsd: 38,
          adjustedMonthlyUsd: 41,
          deltaMonthlyUsd: 3,
        },
        {
          variable: 'egress_traffic' as const,
          label: 'Egress traffic',
          changePercent: 50,
          providerId: 'gcp' as const,
          baselineMonthlyUsd: 30,
          adjustedMonthlyUsd: 35,
          deltaMonthlyUsd: 5,
        },
      ],
      commitmentRoiTimelines: [
        {
          providerId: 'gcp' as const,
          pricingModel: 'savings-plan' as const,
          label: 'Backend committed use',
          baselineMonthlyUsd: 30,
          committedMonthlyUsd: 24,
          upfrontCostUsd: 12,
          monthlySavingsUsd: 6,
          breakEvenMonth: 2,
          points: [
            {
              month: 1,
              onDemandCumulativeUsd: 30,
              committedCumulativeUsd: 36,
              savingsUsd: -6,
            },
            {
              month: 6,
              onDemandCumulativeUsd: 180,
              committedCumulativeUsd: 156,
              savingsUsd: 24,
            },
            {
              month: 12,
              onDemandCumulativeUsd: 360,
              committedCumulativeUsd: 300,
              savingsUsd: 60,
            },
          ],
        },
      ],
      commitmentCoverage: [
        {
          providerId: 'gcp' as const,
          eligibleMonthlyUsd: 30,
          coveredPercentOfSpend: 100,
          onDemandExposureMonthlyUsd: 0,
          zeroCommitmentMonthlyUsd: 30,
          targetCoveragePercent: 70,
          targetBlendMonthlyUsd: 24,
          fullyCommittedMonthlyUsd: 21,
          ineligibleMonthlyUsd: 0,
          targetOnDemandExposureMonthlyUsd: 9,
          exposedPercentOfSpend: 30,
          targetSavingsMonthlyUsd: 6,
          remainingOpportunityMonthlyUsd: 3,
          maxMonthlySavingsUsd: 9,
          recommendation:
            'gcp can move from $30/mo at 0% commitment coverage to $21/mo at 100%; target blend is $24/mo.',
        },
      ],
      tcoSignals: [
        {
          providerId: 'gcp' as const,
          egressLockInMonthlyUsd: 8,
          supportMonthlyUsd: 3,
          licensingMonthlyUsd: 2,
          freeTierApplicability: 'possible' as const,
          note: 'Backend-modeled exit exposure starts with GCP egress transfer.',
        },
      ],
      optimizationOpportunities: [
        {
          id: 'provider-selection-1',
          category: 'Provider selection',
          recommendation: 'Shortlist GCP before committing to AWS.',
          estimatedMonthlySavingsUsd: 12,
          estimatedAnnualSavingsUsd: 144,
          priority: 'High' as const,
          effort: 'Medium' as const,
          evidence: 'Backend-ranked provider delta from current cached comparison.',
        },
      ],
      finOpsFindings: [
        {
          id: 'gcp-egress-driver',
          severity: 'warning' as const,
          category: 'egress' as const,
          title: 'Backend egress driver',
          recommendation: 'Backend identified egress driver from cached totals.',
          estimatedMonthlyImpactUsd: 8,
          providerId: 'gcp' as const,
        },
      ],
    })),
    getComparisonPricingEvidence: jest.fn(async () => ({
      comparisonId: comparisonResult.comparisonId,
      pricingAsOf: comparisonResult.pricingAsOf,
      generatedAt: '2026-07-02T12:00:00.000Z',
      providerCount: 1,
      lineItemCount: 1,
      evidence: [
        {
          evidenceId: 'aws:0:test-trace',
          providerId: 'aws' as const,
          lineItemIndex: 0,
          category: 'compute' as const,
          description: 'aws compute',
          displayedAmounts: {
            monthlyCostUsd: 42,
            hourlyCostUsd: 42 * intervalMultiplierFromMonthly('hourly'),
            providerTotals: comparisonResult.providers[0]!.totals,
          },
          sku: {
            resolvedSkuId: 'm7i.large',
            sourceSkuId: 'aws-compute-m7i-large',
            providerServiceName: 'AmazonEC2',
            region: 'us-east-1',
            catalogRegion: 'us-east-1',
          },
          rate: {
            source: 'pricing_catalog',
            sourceRecordKey: 'test-trace',
            sourceEndpoint: 'mock://aws/pricing',
            sourceRecordId: 'aws-compute-m7i-large',
            transformVersion: 'mock-v1',
            sourcePayloadHash: 'a'.repeat(64),
            unit: 'hour',
            unitPriceUsd: 0.057534,
            currency: 'USD',
            effectiveDate: '2026-07-01T00:00:00.000Z',
            fetchedAt: '2026-07-02T00:00:00.000Z',
            pricingBasis: 'flat' as const,
          },
          derivation: {
            expression: '0.057534 hourly USD x 730 monthly hours',
            hourlyCostUsd: 42 * intervalMultiplierFromMonthly('hourly'),
            monthlyCostUsd: 42,
            monthlyHours: 730,
          },
          equivalence: {
            confidence: 'direct' as const,
            isApproximate: false,
            isEstimate: false,
          },
        },
      ],
    })),
    refreshLiveComparison: jest.fn(async () => comparisonResult),
    createExportJob: jest.fn(async () => reportExportJob),
    getExportJob: jest.fn(async () => reportExportJob),
    downloadExportJob: jest.fn(async () => new Blob(['report'])),
    exportComparison: jest.fn(async () => new Blob(['report'])),
    getPricingStatus: jest.fn(async () => pricingStatus),
    getPricingModels: jest.fn(async () => ({
      defaultModel: 'on-demand' as const,
      generatedAt: '2026-06-30T00:00:00.000Z',
      models: [],
    })),
    getPricingModelsForService: jest.fn(async () => ({
      schemaVersion: 2 as const,
      provider: 'aws' as const,
      service: 'compute',
      region: 'us-east-1',
      generatedAt: '2026-06-30T00:00:00.000Z',
      models: [
        {
          code: 'reserved_1yr' as const,
          label: 'Reserved (1-Year)',
          termMonths: 12,
          requiresPaymentOption: true,
          isEstimateOnly: false,
          paymentOptions: [
            { code: 'no_upfront' as const, label: 'No upfront' },
            { code: 'partial_upfront' as const, label: 'Partial upfront' },
            { code: 'all_upfront' as const, label: 'All upfront' },
          ],
          defaultPaymentOption: 'no_upfront' as const,
        },
        {
          code: 'reserved_3yr' as const,
          label: 'Reserved (3-Year)',
          termMonths: 36,
          requiresPaymentOption: true,
          isEstimateOnly: false,
          paymentOptions: [
            { code: 'no_upfront' as const, label: 'No upfront' },
            { code: 'partial_upfront' as const, label: 'Partial upfront' },
            { code: 'all_upfront' as const, label: 'All upfront' },
          ],
          defaultPaymentOption: 'no_upfront' as const,
        },
        {
          code: 'savings_plan_1yr' as const,
          label: 'Savings Plan / CUD (1-Year)',
          termMonths: 12,
          requiresPaymentOption: true,
          isEstimateOnly: false,
          paymentOptions: [
            { code: 'no_upfront' as const, label: 'No upfront' },
            { code: 'partial_upfront' as const, label: 'Partial upfront' },
            { code: 'all_upfront' as const, label: 'All upfront' },
          ],
          defaultPaymentOption: 'no_upfront' as const,
        },
      ],
    })),
    getRegionCatalog: jest.fn(() => pendingRegionCatalog),
    createWorkload: jest.fn(async (input) => ({
      ...input,
      id: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-06-29T00:00:00.000Z',
      updatedAt: '2026-06-29T00:00:00.000Z',
    })),
    createShareLink: jest.fn(async () => ({
      token: 'public-token-123',
      url: '/api/v1/share/public-token-123',
    })),
    revokeShareLink: jest.fn(async () => ({
      token: 'public-token-123',
      url: '/api/v1/share/public-token-123',
    })),
    getShareLinkAnalytics: jest.fn(async () => ({
      token: 'public-token-123',
      totalViews: 0,
      countryViews: [],
      sectionViews: [],
    })),
    getSharedReport: jest.fn(async () => ({
      token: 'public-token-123',
      watermark: true,
      expiresAt: '2026-07-29T00:00:00.000Z',
      pricingModel: 'on-demand' as const,
      granularity: 'monthly' as const,
      passwordProtected: false,
      workload: {
        id: '22222222-2222-4222-8222-222222222222',
        instanceFamily: 'general-purpose' as const,
        vcpu: 2,
        memoryGb: 4,
        region: 'us-east',
        instanceCount: 2,
        hoursPerMonth: 730,
        storageGb: 250,
        storageTier: 'standard' as const,
        egressGbPerMonth: 750,
        createdAt: '2026-06-29T00:00:00.000Z',
        updatedAt: '2026-06-29T00:00:00.000Z',
      },
      breakdown: {
        workloadId: '22222222-2222-4222-8222-222222222222',
        term: 'on_demand' as const,
        providers: [
          {
            provider: 'aws' as const,
            region: 'us-east-1',
            compute: 20,
            storage: 10,
            egress: 5,
            total: 35,
            currency: 'USD' as const,
          },
        ],
      },
    })),
    createBudget: jest.fn(async (input) => ({
      ...input,
      id: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-06-29T00:00:00.000Z',
      updatedAt: '2026-06-29T00:00:00.000Z',
    })),
    listAlerts: jest.fn(async (workloadId = '22222222-2222-4222-8222-222222222222') => [
      {
        id: '44444444-4444-4444-8444-444444444444',
        workloadId,
        budgetId: '33333333-3333-4333-8333-333333333333',
        alertType: 'budget_threshold' as const,
        message: 'Modeled monthly cost exceeds budget threshold.',
        thresholdUsd: 70,
        observedUsd: 75,
        dismissed: false,
        triggeredAt: '2026-06-29T00:00:00.000Z',
      },
    ]),
    updateAlertDismissed: jest.fn(async (alertId) => ({
      id: alertId,
      workloadId: '22222222-2222-4222-8222-222222222222',
      budgetId: '33333333-3333-4333-8333-333333333333',
      alertType: 'budget_threshold' as const,
      message: 'Modeled monthly cost exceeds budget threshold.',
      thresholdUsd: 70,
      observedUsd: 75,
      dismissed: true,
      dismissedAt: '2026-06-29T00:00:00.000Z',
      triggeredAt: '2026-06-29T00:00:00.000Z',
    })),
    getExchangeRates: jest.fn(async () => ({
      base: 'USD',
      lastUpdated: '2026-06-29T00:00:00.000Z',
      rates: {
        PKR: 278,
        EUR: 0.93,
        GBP: 0.79,
      },
    })),
    importBillingActuals: jest.fn(async () => ({
      importRun: {
        id: '55555555-5555-4555-8555-555555555555',
        teamId: '22222222-2222-4222-8222-222222222222',
        provider: 'aws' as const,
        sourceType: 'aws-cur' as const,
        status: 'completed' as const,
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
    })),
    importProviderBillingExport: jest.fn(async () => ({
      importRun: {
        id: '55555555-5555-4555-8555-555555555555',
        teamId: '22222222-2222-4222-8222-222222222222',
        provider: 'aws' as const,
        sourceType: 'aws-cur' as const,
        status: 'completed' as const,
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
    })),
    reconcileBillingImport: jest.fn(async () => ({
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceCoverage: {
          sourceFingerprintPercent: 100,
          skuMatchPercent: 100,
        },
        invoiceAdjustmentSummary: {
          adjustmentCostUsd: 6,
          adjustmentLineItemCount: 4,
          commitmentLineItemCount: 4,
          commitmentNetCostUsd: -2,
          commitmentEvidence: {
            status: 'provider-inventory-required',
            rowsRequiringProviderInventory: 4,
            rowsRequiringAmortizationPeriod: 2,
            rowsRequiringAllocationEvidence: 4,
            categories: [
              {
                kind: 'savings-plan',
                treatment: 'covered-usage',
                rowCount: 1,
                totalCostUsd: 0,
              },
              {
                kind: 'savings-plan',
                treatment: 'discount',
                rowCount: 1,
                totalCostUsd: -25,
              },
              {
                kind: 'reserved-capacity',
                treatment: 'fee',
                rowCount: 1,
                totalCostUsd: 20,
              },
              {
                kind: 'reserved-capacity',
                treatment: 'unused',
                rowCount: 1,
                totalCostUsd: 3,
              },
            ],
            caveats: [
              'Provider commitment inventory is required before treating this as invoice-grade amortization evidence.',
            ],
          },
          estimateComparableVarianceUsd: 0,
          categories: [
            {
              category: 'usage',
              rowCount: 1,
              totalCostUsd: 100,
            },
            {
              category: 'commitment-covered-usage',
              rowCount: 1,
              totalCostUsd: 0,
            },
            {
              category: 'commitment-discount',
              rowCount: 1,
              totalCostUsd: -25,
            },
            {
              category: 'commitment-fee',
              rowCount: 1,
              totalCostUsd: 20,
            },
            {
              category: 'commitment-amortization',
              rowCount: 1,
              totalCostUsd: 3,
            },
            {
              category: 'tax',
              rowCount: 1,
              totalCostUsd: 8,
            },
          ],
        },
        invoiceGradeReadiness: {
          status: 'invoice-grade-blocked',
          presentCount: 3,
          partialCount: 2,
          missingCount: 3,
          notApplicableCount: 1,
          blockers: [
            'Provider invoice control total',
            'Commitment amortization evidence',
            'Private pricing and discount proof',
          ],
          requiredArtifacts: [
            'AWS invoice PDF/tax invoice, CUR manifest, payer-account billing period, and Cost Explorer control total.',
          ],
          checks: [
            {
              id: 'provider-invoice-control',
              label: 'Provider invoice control total',
              status: 'missing',
              evidence:
                'PolyCost has normalized provider export rows, not the provider invoice of record.',
              requiredArtifact:
                'AWS invoice PDF/tax invoice, CUR manifest, payer-account billing period, and Cost Explorer control total.',
            },
          ],
        },
        invoiceMatchSummary: {
          readiness: 'reconciled-evidence-ready',
          caveats: [
            'Reconciliation compares provider-export actuals with PolyCost estimate evidence; it is not an invoice-of-record.',
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    })),
    listBillingReconciliations: jest.fn(async () => []),
    listInvoiceArtifactReviews: jest.fn(async () => [
      {
        importRunId: '55555555-5555-4555-8555-555555555555',
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        comparisonId: comparisonResult.comparisonId,
        provider: 'aws' as const,
        artifactId: 'artifact-1',
        artifactType: 'provider-invoice' as const,
        displayName: 'AWS invoice control packet',
        verificationStatus: 'registered' as const,
        reviewStatus: 'pending' as const,
        artifactBlobStored: true,
        legalHold: false,
        reviewer: 'finance-review@example.com',
      },
    ]),
    listInvoiceArtifactPolicyExceptions: jest.fn(async () => [
      {
        importRunId: '55555555-5555-4555-8555-555555555555',
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        comparisonId: comparisonResult.comparisonId,
        provider: 'aws' as const,
        artifactId: 'artifact-1',
        artifactType: 'provider-invoice' as const,
        displayName: 'AWS invoice control packet',
        verificationStatus: 'registered' as const,
        reviewStatus: 'approved' as const,
        exceptionStatus: 'requested' as const,
        artifactBlobStored: true,
        legalHold: false,
        reviewer: 'risk-review@example.com',
      },
    ]),
    exportInvoiceEvidencePacket: jest.fn(async () => ({
      packetVersion: 'invoice-evidence-packet/v1' as const,
      packetStatus: 'blocked' as const,
      generatedAt: '2026-07-08T00:00:00.000Z',
      integrity: {
        schemaVersion: 'invoice-evidence-packet-integrity/v1' as const,
        canonicalization: 'stable-json:v1' as const,
        digestAlgorithm: 'sha256' as const,
        payloadDigestSha256: 'f'.repeat(64),
        payloadByteLength: 2048,
        subject: {
          reconciliationId: '66666666-6666-4666-8666-666666666666',
          importRunId: '55555555-5555-4555-8555-555555555555',
          comparisonId: comparisonResult.comparisonId,
          provider: 'aws' as const,
        },
        artifactCount: 1,
        storedArtifactCount: 1,
        verifiedArtifactCount: 1,
        caveatCount: 1,
        disclaimerCount: 1,
        generatedAt: '2026-07-08T00:00:00.000Z',
      },
      reconciliation: {
        id: '66666666-6666-4666-8666-666666666666',
        importRunId: '55555555-5555-4555-8555-555555555555',
        comparisonId: comparisonResult.comparisonId,
        provider: 'aws' as const,
        estimatedTotalUsd: 100,
        invoicedTotalUsd: 107,
        varianceUsd: 7,
        variancePercent: 7,
        status: 'variance-warning' as const,
        createdAt: '2026-07-06T00:00:02.000Z',
      },
      importRun: {
        id: '55555555-5555-4555-8555-555555555555',
        provider: 'aws' as const,
        sourceType: 'aws-cur' as const,
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        originalFileSha256: 'a'.repeat(64),
        rowsAccepted: 1,
        rowsRejected: 0,
        totalCostUsd: 107,
        createdAt: '2026-07-06T00:00:00.000Z',
      },
      readiness: {
        status: 'invoice-grade-blocked',
      },
      matchSummary: {
        readiness: 'reconciled-evidence-ready',
      },
      artifactRegister: {
        registeredCount: 1,
        verifiedCount: 1,
      },
      artifactGovernance: {
        schemaVersion: 'invoice-evidence-governance/v1' as const,
        generatedAt: '2026-07-08T00:00:00.000Z',
        storageReadiness: {
          storageBackend: 'database-bytea' as const,
          scannerMode: 'eicar-signature-only' as const,
          retentionEnforcementMode: 'report-only' as const,
          productionReady: false,
          credentialSource: 'database-connection' as const,
          gaps: [
            'database-bytea keeps artifact bytes in Postgres and is not invoice-grade storage',
          ],
        },
        accessControls: {
          requiresBillingAdmin: true as const,
          teamScoped: true,
          rawArtifactBytesExcluded: true as const,
          packetExportAuditAction: 'billing.reconciliation.evidence_packet_exported' as const,
          artifactDownloadAuditAction: 'billing.reconciliation.artifact_blob_downloaded' as const,
          verifierCommand: 'npm run invoice:evidence:verify -- <packet.json>' as const,
        },
        storagePosture: {
          storageBackends: ['database-bytea' as const],
          storedArtifactCount: 1,
          governanceManifestCount: 0,
          databaseStoredCount: 1,
          externalObjectStoreCount: 0,
          customerManagedKmsCount: 0,
          missingKmsCount: 1,
          retentionPolicyCount: 0,
          expiredRetentionCount: 0,
          legalHoldCount: 0,
          malwareScanPassedCount: 0,
          malwareScanFailedCount: 0,
          malwareScannerEngines: [],
        },
        productionGates: {
          externalObjectStorageReady: false,
          customerManagedKmsReady: false,
          malwareScanningReady: false,
          retentionPolicyReady: false,
          retentionDeletionReady: false,
          packetIntegrityReady: true as const,
          auditTrailReady: true,
        },
        gaps: ['one or more stored artifacts are missing governance manifests'],
      },
      receipt: {
        schemaVersion: 'invoice-evidence-receipt/v1' as const,
        mode: 'metadata-only' as const,
        status: 'metadata-only' as const,
        issuedAt: '2026-07-08T00:00:00.000Z',
        subject: {
          reconciliationId: '66666666-6666-4666-8666-666666666666',
          importRunId: '55555555-5555-4555-8555-555555555555',
          comparisonId: comparisonResult.comparisonId,
          provider: 'aws' as const,
        },
        basePayloadDigestSha256: 'e'.repeat(64),
        basePayloadByteLength: 1536,
        wormReadiness: {
          retentionMode: 'not-configured' as const,
          configured: false,
          objectStorageConfigured: false,
          customerManagedKmsConfigured: false,
          scannerWebhookConfigured: false,
          retentionDeleteExpiredConfigured: false,
          auditExportWebhookConfigured: false,
          signedReceiptConfigured: false,
          gaps: ['signed evidence receipt is not configured'],
        },
        caveats: ['Receipt is metadata-only because signed receipt configuration is not enabled.'],
      },
      artifacts: [
        {
          id: 'artifact-1',
          provider: 'aws' as const,
          type: 'provider-invoice' as const,
          displayName: 'AWS invoice control packet',
          reference: 'demo://invoice-artifacts/66666666-6666-4666-8666-666666666666',
          verificationStatus: 'verified' as const,
          registeredAt: '2026-07-06T00:00:03.000Z',
          stored: true,
          reviewed: true,
          invoiceControlValidationStatus: 'matched' as const,
          controlTotalUsd: 107,
          verificationControlTotalUsd: 107,
          invoiceControlTotalDeltaUsd: 0,
          invoiceControlImportDeltaUsd: 0,
          invoiceControlPeriodMatched: true,
        },
      ],
      controls: {
        registeredCount: 1,
        verifiedCount: 1,
        storedCount: 1,
        reviewApprovedCount: 1,
        policyExceptionApprovedCount: 1,
        policyExceptionExpiredCount: 0,
        invoiceControlMatchedCount: 1,
        invoiceControlVarianceWarningCount: 0,
        invoiceControlMismatchCount: 0,
        invoiceControlNotRunCount: 0,
      },
      caveats: ['Provider invoice rendering remains outside PolyCost.'],
      disclaimers: [
        'This packet is metadata-only and intentionally excludes raw invoice artifact bytes.',
      ],
    })),
    registerInvoiceGradeArtifact: jest.fn(async () => ({
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceCoverage: {
          sourceFingerprintPercent: 100,
          skuMatchPercent: 100,
        },
        invoiceAdjustmentSummary: {
          adjustmentCostUsd: 6,
          adjustmentLineItemCount: 4,
          commitmentLineItemCount: 4,
          commitmentNetCostUsd: -2,
          commitmentEvidence: {
            rowsRequiringProviderInventory: 4,
            rowsRequiringAmortizationPeriod: 2,
            rowsRequiringAllocationEvidence: 4,
          },
          estimateComparableVarianceUsd: 0,
          categories: [
            {
              category: 'usage',
              rowCount: 1,
              totalCostUsd: 100,
            },
          ],
        },
        invoiceGradeReadiness: {
          status: 'invoice-grade-blocked',
          missingCount: 3,
          partialCount: 2,
          blockers: ['Provider invoice control total'],
          artifactRegisterStatus: 'metadata-registered-not-verified',
          registeredArtifactCount: 1,
          verifiedArtifactCount: 0,
        },
        invoiceGradeArtifactRegister: {
          status: 'metadata-registered-not-verified',
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'AWS invoice control packet',
              reference: 'demo://invoice-artifacts/66666666-6666-4666-8666-666666666666',
              controlTotalUsd: 107,
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
            },
          ],
          caveats: [
            'Artifact metadata is registered for traceability only; files, contracts, and invoice controls are not verified by PolyCost yet.',
          ],
        },
        invoiceMatchSummary: {
          readiness: 'reconciled-evidence-ready',
          caveats: [
            'Reconciliation compares provider-export actuals with PolyCost estimate evidence; it is not an invoice-of-record.',
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    })),
    uploadInvoiceArtifactBlob: jest.fn(async () => ({
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceCoverage: {
          sourceFingerprintPercent: 100,
          skuMatchPercent: 100,
        },
        invoiceAdjustmentSummary: {
          adjustmentCostUsd: 6,
          adjustmentLineItemCount: 4,
          commitmentLineItemCount: 4,
          commitmentNetCostUsd: -2,
          commitmentEvidence: {
            rowsRequiringProviderInventory: 4,
            rowsRequiringAmortizationPeriod: 2,
            rowsRequiringAllocationEvidence: 4,
          },
          estimateComparableVarianceUsd: 0,
          categories: [
            {
              category: 'usage',
              rowCount: 1,
              totalCostUsd: 100,
            },
          ],
        },
        invoiceGradeReadiness: {
          status: 'invoice-grade-blocked',
          missingCount: 3,
          partialCount: 2,
          blockers: ['Provider invoice control total'],
          artifactRegisterStatus: 'metadata-registered-not-verified',
          registeredArtifactCount: 1,
          verifiedArtifactCount: 0,
        },
        invoiceGradeArtifactRegister: {
          status: 'metadata-registered-not-verified',
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'AWS invoice control packet',
              reference: 'demo://invoice-artifacts/66666666-6666-4666-8666-666666666666',
              sha256: 'd'.repeat(64),
              controlTotalUsd: 107,
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'database-bytea',
                fileName: 'aws-invoice-control-66666666.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 210,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                uploadedByAccountId: '11111111-1111-4111-8111-111111111111',
                governance: {
                  storageProfile: {
                    storageBackend: 'database-bytea',
                    encryptionStatus: 'database-managed',
                    kmsKeyRequiredForProduction: true,
                  },
                  retentionPolicy: {
                    retentionUntil: '2027-07-06T00:00:05.000Z',
                    retentionDays: 365,
                    legalHold: false,
                  },
                  malwareScan: {
                    status: 'passed',
                    scanner: 'polycost-eicar-signature-v1',
                    checkedAt: '2026-07-06T00:00:05.000Z',
                    findings: [],
                  },
                },
              },
            },
          ],
          caveats: [
            'Artifact metadata is registered for traceability only; files, contracts, and invoice controls are not verified by PolyCost yet.',
          ],
        },
        invoiceMatchSummary: {
          readiness: 'reconciled-evidence-ready',
          caveats: [
            'Reconciliation compares provider-export actuals with PolyCost estimate evidence; it is not an invoice-of-record.',
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    })),
    setInvoiceArtifactLegalHold: jest.fn(async (_reconciliationId, _artifactId, input) => ({
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceCoverage: {
          sourceFingerprintPercent: 100,
          skuMatchPercent: 100,
        },
        invoiceAdjustmentSummary: {
          adjustmentCostUsd: 6,
          adjustmentLineItemCount: 4,
          commitmentLineItemCount: 4,
          commitmentNetCostUsd: -2,
          commitmentEvidence: {
            rowsRequiringProviderInventory: 4,
            rowsRequiringAmortizationPeriod: 2,
            rowsRequiringAllocationEvidence: 4,
          },
          estimateComparableVarianceUsd: 0,
          categories: [
            {
              category: 'usage',
              rowCount: 1,
              totalCostUsd: 100,
            },
          ],
        },
        invoiceGradeReadiness: {
          status: 'invoice-grade-blocked',
          missingCount: 3,
          partialCount: 2,
          blockers: ['Provider invoice control total'],
          artifactRegisterStatus: 'metadata-registered-not-verified',
          registeredArtifactCount: 1,
          verifiedArtifactCount: 0,
        },
        invoiceGradeArtifactRegister: {
          status: 'metadata-registered-not-verified',
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'AWS invoice control packet',
              reference: 'demo://invoice-artifacts/66666666-6666-4666-8666-666666666666',
              sha256: 'd'.repeat(64),
              controlTotalUsd: 107,
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'database-bytea',
                fileName: 'aws-invoice-control-66666666.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 210,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                uploadedByAccountId: '11111111-1111-4111-8111-111111111111',
                legalHoldUpdatedAt: '2026-07-06T00:00:06.000Z',
                legalHoldReason: input.reason,
                governance: {
                  storageProfile: {
                    storageBackend: 'database-bytea',
                    encryptionStatus: 'database-managed',
                    kmsKeyRequiredForProduction: true,
                  },
                  retentionPolicy: {
                    retentionUntil: '2027-07-06T00:00:05.000Z',
                    retentionDays: 365,
                    legalHold: input.legalHold,
                  },
                  malwareScan: {
                    status: 'passed',
                    scanner: 'polycost-eicar-signature-v1',
                    checkedAt: '2026-07-06T00:00:05.000Z',
                    findings: [],
                  },
                },
              },
            },
          ],
          caveats: [
            'Artifact metadata is registered for traceability only; files, contracts, and invoice controls are not verified by PolyCost yet.',
          ],
        },
        invoiceMatchSummary: {
          readiness: 'reconciled-evidence-ready',
          caveats: [
            'Reconciliation compares provider-export actuals with PolyCost estimate evidence; it is not an invoice-of-record.',
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    })),
    updateInvoiceArtifactReview: jest.fn(async (_reconciliationId, _artifactId, input) => ({
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceCoverage: {
          sourceFingerprintPercent: 100,
          skuMatchPercent: 100,
        },
        invoiceAdjustmentSummary: {
          adjustmentCostUsd: 6,
          adjustmentLineItemCount: 4,
          commitmentLineItemCount: 4,
          commitmentNetCostUsd: -2,
          commitmentEvidence: {
            rowsRequiringProviderInventory: 4,
            rowsRequiringAmortizationPeriod: 2,
            rowsRequiringAllocationEvidence: 4,
          },
          estimateComparableVarianceUsd: 0,
          categories: [
            {
              category: 'usage',
              rowCount: 1,
              totalCostUsd: 100,
            },
          ],
        },
        invoiceGradeReadiness: {
          status: 'invoice-grade-blocked',
          missingCount: 3,
          partialCount: 2,
          blockers: ['Provider invoice control total'],
          artifactRegisterStatus: 'metadata-registered-not-verified',
          registeredArtifactCount: 1,
          verifiedArtifactCount: 0,
        },
        invoiceGradeArtifactRegister: {
          status: 'metadata-registered-not-verified',
          registeredCount: 1,
          verifiedCount: 0,
          reviewPendingCount: input.reviewStatus === 'pending' ? 1 : 0,
          reviewApprovedCount: input.reviewStatus === 'approved' ? 1 : 0,
          reviewRejectedCount: input.reviewStatus === 'rejected' ? 1 : 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'AWS invoice control packet',
              reference: 'demo://invoice-artifacts/66666666-6666-4666-8666-666666666666',
              sha256: 'd'.repeat(64),
              controlTotalUsd: 107,
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
              reviewStatus: input.reviewStatus,
              reviewReviewer: input.reviewer,
              reviewRequestedAt: '2026-07-06T00:00:06.000Z',
              reviewRequestedByAccountId: '11111111-1111-4111-8111-111111111111',
              reviewedAt: input.reviewStatus === 'pending' ? undefined : '2026-07-06T00:00:07.000Z',
              reviewedByAccountId:
                input.reviewStatus === 'pending'
                  ? undefined
                  : '11111111-1111-4111-8111-111111111111',
              reviewEvidenceReference: input.evidenceReference,
              reviewNotes: input.notes,
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'database-bytea',
                fileName: 'aws-invoice-control-66666666.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 210,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                uploadedByAccountId: '11111111-1111-4111-8111-111111111111',
                legalHoldUpdatedAt: '2026-07-06T00:00:06.000Z',
                legalHoldReason: 'Placed from workspace demo panel before retention enforcement.',
                governance: {
                  storageProfile: {
                    storageBackend: 'database-bytea',
                    encryptionStatus: 'database-managed',
                    kmsKeyRequiredForProduction: true,
                  },
                  retentionPolicy: {
                    retentionUntil: '2027-07-06T00:00:05.000Z',
                    retentionDays: 365,
                    legalHold: true,
                  },
                  malwareScan: {
                    status: 'passed',
                    scanner: 'polycost-eicar-signature-v1',
                    checkedAt: '2026-07-06T00:00:05.000Z',
                    findings: [],
                  },
                },
              },
            },
          ],
          caveats: [
            'Artifact metadata is registered for traceability only; files, contracts, and invoice controls are not verified by PolyCost yet.',
          ],
        },
        invoiceMatchSummary: {
          readiness: 'reconciled-evidence-ready',
          caveats: [
            'Reconciliation compares provider-export actuals with PolyCost estimate evidence; it is not an invoice-of-record.',
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    })),
    updateInvoiceArtifactPolicyException: jest.fn(
      async (_reconciliationId, _artifactId, input) => ({
        id: '66666666-6666-4666-8666-666666666666',
        importRunId: '55555555-5555-4555-8555-555555555555',
        comparisonId: comparisonResult.comparisonId,
        provider: 'aws' as const,
        estimatedTotalUsd: 100,
        invoicedTotalUsd: 107,
        varianceUsd: 7,
        variancePercent: 7,
        status: 'variance-warning' as const,
        evidence: {
          invoiceCoverage: {
            sourceFingerprintPercent: 100,
            skuMatchPercent: 100,
          },
          invoiceAdjustmentSummary: {
            adjustmentCostUsd: 6,
            adjustmentLineItemCount: 4,
            commitmentLineItemCount: 4,
            commitmentNetCostUsd: -2,
            commitmentEvidence: {
              rowsRequiringProviderInventory: 4,
              rowsRequiringAmortizationPeriod: 2,
              rowsRequiringAllocationEvidence: 4,
            },
            estimateComparableVarianceUsd: 0,
            categories: [
              {
                category: 'usage',
                rowCount: 1,
                totalCostUsd: 100,
              },
            ],
          },
          invoiceGradeReadiness: {
            status: 'invoice-grade-blocked',
            missingCount: 3,
            partialCount: 2,
            blockers: ['Provider invoice control total'],
            artifactRegisterStatus: 'metadata-registered-not-verified',
            registeredArtifactCount: 1,
            verifiedArtifactCount: 0,
          },
          invoiceGradeArtifactRegister: {
            status: 'metadata-registered-not-verified',
            registeredCount: 1,
            verifiedCount: 0,
            reviewApprovedCount: 1,
            policyExceptionRequestedCount: input.exceptionStatus === 'requested' ? 1 : 0,
            policyExceptionApprovedCount: input.exceptionStatus === 'approved' ? 1 : 0,
            policyExceptionRejectedCount: input.exceptionStatus === 'rejected' ? 1 : 0,
            policyExceptionExpiredCount: 0,
            artifacts: [
              {
                id: 'artifact-1',
                provider: 'aws',
                type: 'provider-invoice',
                displayName: 'AWS invoice control packet',
                reference: 'demo://invoice-artifacts/66666666-6666-4666-8666-666666666666',
                sha256: 'd'.repeat(64),
                controlTotalUsd: 107,
                verificationStatus: 'registered',
                registeredAt: '2026-07-06T00:00:03.000Z',
                reviewStatus: 'approved',
                reviewReviewer: 'finance-review@example.com',
                reviewRequestedAt: '2026-07-06T00:00:06.000Z',
                reviewRequestedByAccountId: '11111111-1111-4111-8111-111111111111',
                reviewedAt: '2026-07-06T00:00:07.000Z',
                reviewedByAccountId: '11111111-1111-4111-8111-111111111111',
                policyExceptionStatus: input.exceptionStatus,
                policyExceptionReviewer: input.reviewer,
                policyExceptionReason: input.reason,
                policyExceptionRequestedAt: '2026-07-06T00:00:08.000Z',
                policyExceptionRequestedByAccountId: '11111111-1111-4111-8111-111111111111',
                policyExceptionExpiresAt: input.expiresAt,
                policyExceptionDecidedAt:
                  input.exceptionStatus === 'requested' ? undefined : '2026-07-06T00:00:09.000Z',
                policyExceptionDecidedByAccountId:
                  input.exceptionStatus === 'requested'
                    ? undefined
                    : '11111111-1111-4111-8111-111111111111',
                policyExceptionEvidenceReference: input.evidenceReference,
                policyExceptionNotes: input.notes,
                storedBlob: {
                  storageStatus: 'stored',
                  storageMode: 'database-bytea',
                  fileName: 'aws-invoice-control-66666666.txt',
                  mimeType: 'text/plain',
                  contentSha256: 'd'.repeat(64),
                  contentSizeBytes: 210,
                  uploadedAt: '2026-07-06T00:00:05.000Z',
                  uploadedByAccountId: '11111111-1111-4111-8111-111111111111',
                  legalHoldUpdatedAt: '2026-07-06T00:00:06.000Z',
                  legalHoldReason: 'Placed from workspace demo panel before retention enforcement.',
                  governance: {
                    storageProfile: {
                      storageBackend: 'database-bytea',
                      encryptionStatus: 'database-managed',
                      kmsKeyRequiredForProduction: true,
                    },
                    retentionPolicy: {
                      retentionUntil: '2027-07-06T00:00:05.000Z',
                      retentionDays: 365,
                      legalHold: true,
                    },
                    malwareScan: {
                      status: 'passed',
                      scanner: 'polycost-eicar-signature-v1',
                      checkedAt: '2026-07-06T00:00:05.000Z',
                      findings: [],
                    },
                  },
                },
              },
            ],
            caveats: [
              'Artifact metadata is registered for traceability only; files, contracts, and invoice controls are not verified by PolyCost yet.',
            ],
          },
          invoiceMatchSummary: {
            readiness: 'reconciled-evidence-ready',
            caveats: [
              'Reconciliation compares provider-export actuals with PolyCost estimate evidence; it is not an invoice-of-record.',
            ],
          },
        },
        createdAt: '2026-07-06T00:00:02.000Z',
      }),
    ),
    downloadInvoiceArtifactBlob: jest.fn(async () => ({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      reconciliationId: '66666666-6666-4666-8666-666666666666',
      artifactId: 'artifact-1',
      teamId: '22222222-2222-4222-8222-222222222222',
      fileName: 'aws-invoice-control-66666666.txt',
      mimeType: 'text/plain',
      contentSha256: 'd'.repeat(64),
      contentSizeBytes: 7,
      contentBase64: 'aW52b2ljZQ==',
      uploadedByAccountId: '11111111-1111-4111-8111-111111111111',
      uploadedAt: '2026-07-06T00:00:05.000Z',
      storageProfile: {
        storageBackend: 'database-bytea' as const,
        encryptionStatus: 'database-managed' as const,
        kmsKeyRequiredForProduction: true,
      },
      retentionPolicy: {
        retentionUntil: '2027-07-06T00:00:05.000Z',
        retentionDays: 365,
        legalHold: false,
      },
      malwareScan: {
        status: 'passed' as const,
        scanner: 'polycost-eicar-signature-v1',
        checkedAt: '2026-07-06T00:00:05.000Z',
        findings: [],
      },
    })),
    getInvoiceArtifactStorageReadiness: jest.fn(async () => ({
      storageBackend: 'database-bytea' as const,
      scannerMode: 'eicar-signature-only' as const,
      retentionEnforcementMode: 'report-only' as const,
      productionReady: false,
      credentialSource: 'database-connection' as const,
      gaps: ['database-bytea keeps artifact bytes in Postgres and is not invoice-grade storage'],
    })),
    enforceInvoiceArtifactRetention: jest.fn(async () => ({
      mode: 'report-only' as const,
      evaluatedAt: '2026-07-08T00:00:00.000Z',
      dryRun: true,
      storageBackend: 'database-bytea' as const,
      expiredCandidates: 0,
      legalHoldSkipped: 0,
      deleted: 0,
    })),
    verifyInvoiceGradeArtifact: jest.fn(async () => ({
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceCoverage: {
          sourceFingerprintPercent: 100,
          skuMatchPercent: 100,
        },
        invoiceAdjustmentSummary: {
          adjustmentCostUsd: 6,
          adjustmentLineItemCount: 4,
          commitmentLineItemCount: 4,
          commitmentNetCostUsd: -2,
          commitmentEvidence: {
            rowsRequiringProviderInventory: 4,
            rowsRequiringAmortizationPeriod: 2,
            rowsRequiringAllocationEvidence: 4,
          },
          estimateComparableVarianceUsd: 0,
          categories: [
            {
              category: 'usage',
              rowCount: 1,
              totalCostUsd: 100,
            },
          ],
        },
        invoiceGradeReadiness: {
          status: 'invoice-grade-blocked',
          missingCount: 2,
          partialCount: 3,
          blockers: ['Private pricing and discount proof'],
          artifactRegisterStatus: 'registered-with-verified-artifacts',
          registeredArtifactCount: 1,
          verifiedArtifactCount: 1,
        },
        invoiceGradeArtifactRegister: {
          status: 'registered-with-verified-artifacts',
          registeredCount: 1,
          verifiedCount: 1,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'AWS invoice control packet',
              reference: 'demo://invoice-artifacts/66666666-6666-4666-8666-666666666666',
              sha256: 'd'.repeat(64),
              controlTotalUsd: 107,
              verificationStatus: 'verified',
              registeredAt: '2026-07-06T00:00:03.000Z',
              verifiedAt: '2026-07-06T00:00:04.000Z',
              verificationEvidenceReference: 'review://invoice-artifacts/artifact-1',
              verifiedSha256: 'd'.repeat(64),
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'database-bytea',
                fileName: 'aws-invoice-control-66666666.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 210,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                uploadedByAccountId: '11111111-1111-4111-8111-111111111111',
                governance: {
                  storageProfile: {
                    storageBackend: 'database-bytea',
                    encryptionStatus: 'database-managed',
                    kmsKeyRequiredForProduction: true,
                  },
                  retentionPolicy: {
                    retentionUntil: '2027-07-06T00:00:05.000Z',
                    retentionDays: 365,
                    legalHold: false,
                  },
                  malwareScan: {
                    status: 'passed',
                    scanner: 'polycost-eicar-signature-v1',
                    checkedAt: '2026-07-06T00:00:05.000Z',
                    findings: [],
                  },
                },
              },
            },
          ],
          caveats: [
            'Artifact metadata is registered for traceability only; files, contracts, and invoice controls are not verified by PolyCost yet.',
          ],
        },
        invoiceMatchSummary: {
          readiness: 'reconciled-evidence-ready',
          caveats: [
            'Reconciliation compares provider-export actuals with PolyCost estimate evidence; it is not an invoice-of-record.',
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    })),
    validateInvoiceControlPacket: jest.fn(async (_reconciliationId, _artifactId, input) => ({
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceCoverage: {
          sourceFingerprintPercent: 100,
          skuMatchPercent: 100,
        },
        invoiceAdjustmentSummary: {
          adjustmentCostUsd: 6,
          adjustmentLineItemCount: 4,
          commitmentLineItemCount: 4,
          commitmentNetCostUsd: -2,
          commitmentEvidence: {
            rowsRequiringProviderInventory: 4,
            rowsRequiringAmortizationPeriod: 2,
            rowsRequiringAllocationEvidence: 4,
          },
          estimateComparableVarianceUsd: 0,
          categories: [
            {
              category: 'usage',
              rowCount: 1,
              totalCostUsd: 100,
            },
          ],
        },
        invoiceGradeReadiness: {
          status: 'invoice-grade-blocked',
          missingCount: 2,
          partialCount: 3,
          blockers: ['Private pricing and discount proof'],
          artifactRegisterStatus: 'registered-with-verified-artifacts',
          registeredArtifactCount: 1,
          verifiedArtifactCount: 1,
        },
        invoiceGradeArtifactRegister: {
          status: 'registered-with-verified-artifacts',
          registeredCount: 1,
          verifiedCount: 1,
          invoiceControlMatchedCount: 1,
          invoiceControlVarianceWarningCount: 0,
          invoiceControlMismatchCount: 0,
          invoiceControlNotRunCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'AWS invoice control packet',
              reference: 'demo://invoice-artifacts/66666666-6666-4666-8666-666666666666',
              sha256: 'd'.repeat(64),
              controlTotalUsd: 107,
              verificationControlTotalUsd: 107,
              verificationStatus: 'verified',
              invoiceControlValidationStatus: 'matched',
              invoiceControlAcceptedVarianceUsd: input.acceptedVarianceUsd,
              invoiceControlEvidenceReference: input.evidenceReference,
              invoiceControlTotalDeltaUsd: 0,
              invoiceControlImportDeltaUsd: 0,
              invoiceControlPeriodMatched: true,
              invoiceControlValidatedAt: '2026-07-06T00:00:10.000Z',
              invoiceControlValidatedByAccountId: '11111111-1111-4111-8111-111111111111',
              registeredAt: '2026-07-06T00:00:03.000Z',
              verifiedAt: '2026-07-06T00:00:04.000Z',
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'database-bytea',
                fileName: 'aws-invoice-control-66666666.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 210,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                uploadedByAccountId: '11111111-1111-4111-8111-111111111111',
                governance: {
                  storageProfile: {
                    storageBackend: 'database-bytea',
                    encryptionStatus: 'database-managed',
                    kmsKeyRequiredForProduction: true,
                  },
                  retentionPolicy: {
                    retentionUntil: '2027-07-06T00:00:05.000Z',
                    retentionDays: 365,
                    legalHold: false,
                  },
                  malwareScan: {
                    status: 'passed',
                    scanner: 'polycost-eicar-signature-v1',
                    checkedAt: '2026-07-06T00:00:05.000Z',
                    findings: [],
                  },
                },
              },
            },
          ],
          caveats: [
            'Artifact metadata is registered for traceability; stored and verified control packets can be matched against imported and reconciled totals but are not provider-authenticated invoice rendering.',
          ],
        },
        invoiceMatchSummary: {
          readiness: 'reconciled-evidence-ready',
          caveats: [
            'Reconciliation compares provider-export actuals with PolyCost estimate evidence; it is not an invoice-of-record.',
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    })),
    ...overrides,
  };
}

function provider(
  providerId: ComparisonResult['providers'][number]['providerId'],
  monthly: number,
  approximate = false,
): ComparisonResult['providers'][number] {
  return {
    providerId,
    lineItems: [
      {
        category: 'compute',
        description: `${providerId} compute`,
        isApproximate: approximate,
        baseMonthlyCostUsd: monthly,
      },
    ],
    totals: {
      hourly: monthly * intervalMultiplierFromMonthly('hourly'),
      daily: monthly * intervalMultiplierFromMonthly('daily'),
      weekly: monthly * intervalMultiplierFromMonthly('weekly'),
      monthly,
      quarterly: monthly * intervalMultiplierFromMonthly('quarterly'),
      yearly: monthly * intervalMultiplierFromMonthly('yearly'),
    },
  };
}

function providerWithItems(
  providerId: ComparisonResult['providers'][number]['providerId'],
  lineItems: Array<
    [
      ComparisonResult['providers'][number]['lineItems'][number]['category'],
      string,
      number,
      boolean?,
    ]
  >,
): ComparisonResult['providers'][number] {
  const monthly = lineItems.reduce((sum, [, , cost]) => sum + cost, 0);

  return {
    providerId,
    lineItems: lineItems.map(([category, description, baseMonthlyCostUsd, isApproximate]) => ({
      category,
      description,
      isApproximate: Boolean(isApproximate),
      baseMonthlyCostUsd,
    })),
    totals: {
      hourly: monthly * intervalMultiplierFromMonthly('hourly'),
      daily: monthly * intervalMultiplierFromMonthly('daily'),
      weekly: monthly * intervalMultiplierFromMonthly('weekly'),
      monthly,
      quarterly: monthly * intervalMultiplierFromMonthly('quarterly'),
      yearly: monthly * intervalMultiplierFromMonthly('yearly'),
    },
  };
}
