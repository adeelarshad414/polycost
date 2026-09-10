/*
  The signed-in workspace: authentication, team and membership management, SSO
  and SCIM configuration, account sessions, and provider billing import with
  invoice reconciliation.

  Lifted out of App.tsx as part of the K-8 decomposition. It was 2,596 lines -
  roughly a sixth of that file - and it earns its own module rather than a
  further split into pieces: it is one screen with one authenticated session at
  its centre, and every panel below reads or writes that session. The interface
  is five props, and nothing outside it reaches into this state.
*/
import { useEffect, useState, type FormEvent } from 'react';
import { formatApiError, type PolyCostClient } from './../api-client';
import { Button } from './Button';
import { SessionLoader, type LoadingStep } from './LoadingExperience';
import { TextField } from './fields';
import { CompareIcon, ParseIcon, ShieldIcon, SignInIcon } from './icons';
import { reconciliationEvidenceSummary, workspaceSessionStatus } from './../lib/comparison-models';
import { formatCurrency, formatSignedCurrency } from './../lib/format';
import { clearStoredAuthToken, storeAuthSession } from './../lib/optimization-signals';
import {
  activeTeamToMembership,
  base64ToBlob,
  downloadBlob,
  formatDateTime,
  formatFileSize,
  futureIsoTimestamp,
  inviteDeliveryNotice,
  isSessionExpiredError,
  memberRemoveControlState,
  memberRoleControlState,
  mergeTeamMemberships,
  providerExportSample,
  providerLabel,
  readInviteTokenFromUrl,
  sourceTypeForProvider,
  teamAuditActionLabel,
  teamAuditEventDetail,
  teamRoleLabel,
} from './../lib/workload-analysis';
import type {
  AccountSessionRecord,
  AuthMeResponse,
  BillingImportResponse,
  BillingProviderExportInput,
  CreatedTeamScimTokenRecord,
  InvoiceArtifactBlobUploadInput,
  InvoiceArtifactLegalHoldInput,
  InvoiceArtifactPolicyExceptionInput,
  InvoiceArtifactPolicyExceptionStatus,
  InvoiceArtifactReviewInput,
  InvoiceArtifactReviewStatus,
  InvoiceControlValidationInput,
  InvoiceGradeArtifactRegistrationInput,
  InvoiceGradeArtifactVerificationInput,
  InvoiceReconciliationRecord,
  ProviderId,
  SsoConfigurationStatus,
  SsoStartResponse,
  TeamAuditEventRecord,
  TeamInvitationPreview,
  TeamInvitationRecord,
  TeamMemberRecord,
  TeamRole,
  TeamScimTokenRecord,
  TeamScimUserRecord,
  TeamSwitchResponse,
} from './../types';

export function WorkspaceControlCenter({
  client,
  comparisonId,
  initialStoredAuth,
  onNotice,
  onError,
}: {
  client: PolyCostClient;
  comparisonId?: string;
  /** Read once by App; see the note there on the clearing side effect. */
  initialStoredAuth: { token: string; expired: boolean };
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [token, setToken] = useState(initialStoredAuth.token);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(initialStoredAuth.expired);
  const [session, setSession] = useState<AuthMeResponse | null>(null);
  const [email, setEmail] = useState('architect@example.com');
  const [password, setPassword] = useState('correct horse battery staple');
  const [displayName, setDisplayName] = useState('Architecture Lead');
  const [teamName, setTeamName] = useState('PolyCost demo team');
  const [profileEmail, setProfileEmail] = useState('architect@example.com');
  const [profileDisplayName, setProfileDisplayName] = useState('Architecture Lead');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleteCurrentPassword, setDeleteCurrentPassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [newTeamName, setNewTeamName] = useState('Platform cost office');
  const [teamSettingsName, setTeamSettingsName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [isSessionHydrating, setIsSessionHydrating] = useState(Boolean(initialStoredAuth.token));
  const [workspaceBusy, setWorkspaceBusy] = useState<string | null>(null);
  const [isWorkspaceDirectoryLoading, setIsWorkspaceDirectoryLoading] = useState(false);
  const [workspaceDirectoryError, setWorkspaceDirectoryError] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitationRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<TeamAuditEventRecord[]>([]);
  const [scimTokens, setScimTokens] = useState<TeamScimTokenRecord[]>([]);
  const [scimUsers, setScimUsers] = useState<TeamScimUserRecord[]>([]);
  const [accountSessions, setAccountSessions] = useState<AccountSessionRecord[]>([]);
  const [ssoStatus, setSsoStatus] = useState<SsoConfigurationStatus | null>(null);
  const [inviteEmail, setInviteEmail] = useState('finops@example.com');
  const [inviteRole, setInviteRole] = useState<Exclude<TeamRole, 'owner'>>('member');
  const [lastInviteToken, setLastInviteToken] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [lastInviteDelivery, setLastInviteDelivery] = useState<
    TeamInvitationRecord['delivery'] | null
  >(null);
  const [landingInviteToken] = useState(() => readInviteTokenFromUrl());
  const [acceptToken, setAcceptToken] = useState(landingInviteToken);
  const [invitePreview, setInvitePreview] = useState<TeamInvitationPreview | null>(null);
  const [ssoProviderType, setSsoProviderType] = useState<'oidc' | 'saml'>('oidc');
  const [ssoDisplayName, setSsoDisplayName] = useState('Corporate OIDC');
  const [ssoIssuerUrl, setSsoIssuerUrl] = useState('https://idp.example.com');
  const [ssoClientId, setSsoClientId] = useState('polycost-demo-client');
  const [ssoClientSecret, setSsoClientSecret] = useState('CHANGE_ME_DEV_ONLY');
  const [ssoLoginEmail, setSsoLoginEmail] = useState('finops@example.com');
  const [ssoStart, setSsoStart] = useState<SsoStartResponse | null>(null);
  const [scimTokenDisplayName, setScimTokenDisplayName] = useState('Okta production SCIM');
  const [scimTokenExpiresAt, setScimTokenExpiresAt] = useState('');
  const [createdScimToken, setCreatedScimToken] = useState<CreatedTeamScimTokenRecord | null>(null);
  const [provider, setProvider] = useState<ProviderId>('aws');
  const [billingPeriodStart, setBillingPeriodStart] = useState('2026-06-01');
  const [billingPeriodEnd, setBillingPeriodEnd] = useState('2026-06-30');
  const [exportContent, setExportContent] = useState(() => providerExportSample('aws'));
  const [billingImport, setBillingImport] = useState<BillingImportResponse | null>(null);
  const [reconciliation, setReconciliation] = useState<InvoiceReconciliationRecord | null>(null);
  const activeTeam = session?.activeTeam;
  const activeTeamOptions = session?.teams ?? [];
  const canManageTeam = activeTeam?.role === 'owner' || activeTeam?.role === 'admin';
  const billingAccessMessage = !token
    ? 'Sign in before importing provider billing exports.'
    : !activeTeam
      ? 'Join or create a team before importing provider billing exports.'
      : !canManageTeam
        ? 'Owner or admin role required for billing import and reconciliation.'
        : null;
  const ownerCount = members.filter((member) => member.role === 'owner').length;
  const activeScimTokenCount = scimTokens.filter((scimToken) => !scimToken.revokedAt).length;
  const activeScimUserCount = scimUsers.filter((scimUser) => scimUser.active).length;
  const sourceType = sourceTypeForProvider(provider);
  const sessionStatus = session ? workspaceSessionStatus(session.session.expiresAt) : null;
  const reconciliationSummary = reconciliation
    ? reconciliationEvidenceSummary(reconciliation)
    : null;
  const sessionHydrationSteps: LoadingStep[] = [
    { id: 'stored-token', label: 'Reading stored session', state: 'done' },
    { id: 'verify-session', label: 'Verifying workspace access', state: 'active' },
    { id: 'prepare-workspace', label: 'Preparing account controls', state: 'pending' },
  ];
  const workspaceDirectorySteps: LoadingStep[] = [
    { id: 'session', label: 'Workspace session verified', state: 'done' },
    {
      id: 'team-directory',
      label: 'Syncing team directory',
      state: workspaceDirectoryError ? 'failed' : isWorkspaceDirectoryLoading ? 'active' : 'done',
      detail: workspaceDirectoryError ?? undefined,
    },
    {
      id: 'sso-readiness',
      label: 'Checking SSO readiness',
      state: workspaceDirectoryError ? 'pending' : isWorkspaceDirectoryLoading ? 'pending' : 'done',
    },
    {
      id: 'scim-provisioning',
      label: 'Checking SCIM provisioning',
      state: workspaceDirectoryError ? 'pending' : isWorkspaceDirectoryLoading ? 'pending' : 'done',
    },
    {
      id: 'audit-trail',
      label: 'Loading audit trail',
      state: workspaceDirectoryError ? 'pending' : isWorkspaceDirectoryLoading ? 'pending' : 'done',
    },
  ];

  useEffect(() => {
    if (!landingInviteToken) {
      return undefined;
    }

    let isMounted = true;

    void client
      .previewTeamInvitation(landingInviteToken)
      .then((preview) => {
        if (isMounted) {
          setInvitePreview(preview);
        }
      })
      .catch(() => {
        if (isMounted) {
          setInvitePreview({
            status: 'invalid',
            message: 'Invitation token was not found.',
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, landingInviteToken]);

  useEffect(() => {
    if (!token) {
      setSession(null);
      setIsSessionHydrating(false);
      setMembers([]);
      setInvitations([]);
      setAuditEvents([]);
      setScimTokens([]);
      setScimUsers([]);
      setAccountSessions([]);
      setSsoStatus(null);
      return undefined;
    }

    let isMounted = true;

    setIsSessionHydrating(true);
    void client
      .getCurrentSession(token)
      .then((currentSession) => {
        if (!isMounted) {
          return;
        }

        setSession(currentSession);
        storeAuthSession(token, currentSession.session.expiresAt);
        setSessionExpiredNotice(false);
        setProfileEmail(currentSession.account.email);
        setProfileDisplayName(currentSession.account.displayName ?? '');
        setTeamSettingsName(currentSession.activeTeam?.name ?? '');
        onError(null);
      })
      .catch((sessionError) => {
        if (!isMounted) {
          return;
        }

        clearStoredAuthToken();
        setToken('');
        setSession(null);
        setAccountSessions([]);
        setSessionExpiredNotice(isSessionExpiredError(sessionError));
        onError(formatApiError(sessionError));
      })
      .finally(() => {
        if (isMounted) {
          setIsSessionHydrating(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, onError, token]);

  useEffect(() => {
    if (!token || !session) {
      setAccountSessions([]);
      return undefined;
    }

    let isMounted = true;

    void client
      .listAccountSessions(token)
      .then((sessions) => {
        if (isMounted) {
          setAccountSessions(sessions);
        }
      })
      .catch((sessionsError) => {
        if (isMounted) {
          onError(formatApiError(sessionsError));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, onError, session, token]);

  useEffect(() => {
    setTeamSettingsName(activeTeam?.name ?? '');
  }, [activeTeam?.name]);

  useEffect(() => {
    if (!token || !activeTeam || !canManageTeam) {
      setIsWorkspaceDirectoryLoading(false);
      setWorkspaceDirectoryError(null);
      setMembers([]);
      setInvitations([]);
      setAuditEvents([]);
      setScimTokens([]);
      setScimUsers([]);
      setSsoStatus(null);
      setCreatedScimToken(null);
      return undefined;
    }

    let isMounted = true;

    setIsWorkspaceDirectoryLoading(true);
    setWorkspaceDirectoryError(null);
    // Settle each panel independently: a single failing endpoint must not
    // discard the five that succeeded (FE-5). Successful panels render their
    // data; failures leave prior data intact and surface a message.
    void Promise.allSettled([
      client.listTeamMembers(activeTeam.id, token),
      client.listTeamInvitations(activeTeam.id, token),
      client.listTeamAuditEvents(activeTeam.id, token),
      client.listTeamScimTokens(activeTeam.id, token),
      client.listTeamScimUsers(activeTeam.id, token),
      client.getSsoStatus(token),
    ])
      .then((results) => {
        if (!isMounted) {
          return;
        }

        const [membersR, invitationsR, auditR, scimTokensR, scimUsersR, ssoR] = results;
        if (membersR.status === 'fulfilled') setMembers(membersR.value);
        if (invitationsR.status === 'fulfilled') setInvitations(invitationsR.value);
        if (auditR.status === 'fulfilled') setAuditEvents(auditR.value);
        if (scimTokensR.status === 'fulfilled') setScimTokens(scimTokensR.value);
        if (scimUsersR.status === 'fulfilled') setScimUsers(scimUsersR.value);
        if (ssoR.status === 'fulfilled') setSsoStatus(ssoR.value);

        const failures = results.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );

        if (failures.length === 0) {
          setWorkspaceDirectoryError(null);
          return;
        }

        const message = formatApiError(failures[0].reason);
        setWorkspaceDirectoryError(message);
        // Only escalate to the global banner when nothing loaded; a partial
        // failure stays scoped to the workspace panel so good data still shows.
        if (failures.length === results.length) {
          onError(message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsWorkspaceDirectoryLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeTeam?.id, canManageTeam, client, onError, token]);

  async function handleAuthSubmit(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    onError(null);
    onNotice(null);

    try {
      const response =
        authMode === 'register'
          ? await client.register({
              email,
              password,
              displayName,
              teamName,
            })
          : await client.login({ email, password });

      storeAuthSession(response.token, response.expiresAt);
      setToken(response.token);
      setSessionExpiredNotice(false);
      onNotice(
        authMode === 'register'
          ? 'Workspace registered. Team controls and billing import are now available.'
          : 'Signed in. Team controls and billing import are now available.',
      );
    } catch (authError) {
      onError(formatApiError(authError));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    setAuthBusy(true);
    try {
      if (token) {
        await client.logout(token);
      }
    } catch {
      // Local token cleanup is still correct if the server session has already expired.
    } finally {
      clearStoredAuthToken();
      setToken('');
      setSession(null);
      setAccountSessions([]);
      setSessionExpiredNotice(false);
      setAuthBusy(false);
      onNotice('Signed out of the workspace.');
    }
  }

  async function handleRevokeOtherSessions() {
    if (!token) {
      return;
    }

    setWorkspaceBusy('revoke-sessions');
    onError(null);

    try {
      const result = await client.revokeOtherSessions(token);
      setAccountSessions((current) => current.filter((accountSession) => accountSession.current));
      onNotice(`Signed out ${result.revoked} other session${result.revoked === 1 ? '' : 's'}.`);
    } catch (sessionError) {
      onError(formatApiError(sessionError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  function clearWorkspaceScopedState() {
    setMembers([]);
    setInvitations([]);
    setAuditEvents([]);
    setScimTokens([]);
    setScimUsers([]);
    setCreatedScimToken(null);
    setSsoStatus(null);
    setSsoStart(null);
    setBillingImport(null);
    setReconciliation(null);
  }

  async function refreshTeamAuditEvents() {
    if (!token || !activeTeam || !canManageTeam) {
      return;
    }

    try {
      setAuditEvents(await client.listTeamAuditEvents(activeTeam.id, token));
    } catch (auditError) {
      onError(formatApiError(auditError));
    }
  }

  async function refreshScimPosture() {
    if (!token || !activeTeam || !canManageTeam) {
      return;
    }

    try {
      const [nextTokens, nextUsers] = await Promise.all([
        client.listTeamScimTokens(activeTeam.id, token),
        client.listTeamScimUsers(activeTeam.id, token),
      ]);
      setScimTokens(nextTokens);
      setScimUsers(nextUsers);
    } catch (scimError) {
      onError(formatApiError(scimError));
    }
  }

  function applyActiveTeamSwitch(
    switched: TeamSwitchResponse,
    extraMembership?: AuthMeResponse['teams'][number],
  ) {
    setSession((current) =>
      current
        ? {
            ...current,
            activeTeam: switched.activeTeam,
            teams: mergeTeamMemberships(current.teams, [
              activeTeamToMembership(switched.activeTeam),
              ...(extraMembership ? [extraMembership] : []),
            ]),
            session: {
              ...current.session,
              ...switched.session,
            },
          }
        : current,
    );
    setTeamSettingsName(switched.activeTeam.name);
    clearWorkspaceScopedState();
  }

  async function handleActiveTeamSwitch(teamId: string) {
    if (!token || !session || !teamId || teamId === activeTeam?.id) {
      return;
    }

    setWorkspaceBusy('switch-team');
    onError(null);

    try {
      const switched = await client.switchActiveTeam(teamId, token);
      applyActiveTeamSwitch(switched);
      onNotice(`Active workspace switched to ${switched.activeTeam.name}.`);
    } catch (switchError) {
      onError(formatApiError(switchError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleProfileUpdate(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setWorkspaceBusy('profile');
    onError(null);

    try {
      const updated = await client.updateAccountProfile(
        {
          email: profileEmail,
          displayName: profileDisplayName,
          ...(profileEmail !== session?.account.email
            ? { currentPassword: profileCurrentPassword }
            : {}),
        },
        token,
      );
      setProfileCurrentPassword('');
      setSession((current) =>
        current
          ? {
              ...current,
              account: {
                ...current.account,
                email: updated.email,
                displayName: updated.displayName,
              },
            }
          : current,
      );
      onNotice('Account profile updated.');
    } catch (profileError) {
      onError(formatApiError(profileError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handlePasswordChange(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setWorkspaceBusy('password');
    onError(null);

    try {
      await client.changePassword(
        {
          currentPassword: profileCurrentPassword,
          newPassword,
        },
        token,
      );
      setProfileCurrentPassword('');
      setNewPassword('');
      onNotice('Password changed. Existing sessions remain visible for review.');
    } catch (passwordError) {
      onError(formatApiError(passwordError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleAccountDeletion(event: FormEvent) {
    event.preventDefault();
    if (!token || deleteConfirmation !== 'DELETE') {
      return;
    }

    setWorkspaceBusy('delete-account');
    onError(null);

    try {
      await client.deleteAccount(
        {
          currentPassword: deleteCurrentPassword,
          confirmation: 'DELETE',
        },
        token,
      );
      clearStoredAuthToken();
      setToken('');
      setSession(null);
      setSessionExpiredNotice(false);
      setDeleteCurrentPassword('');
      setDeleteConfirmation('');
      onNotice('Account disabled and active sessions revoked.');
    } catch (deleteError) {
      onError(formatApiError(deleteError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleCreateTeam(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setWorkspaceBusy('create-team');
    onError(null);

    try {
      const created = await client.createTeam({ teamName: newTeamName }, token);
      const switched = await client.switchActiveTeam(created.teamId, token);
      applyActiveTeamSwitch(switched, {
        teamId: created.teamId,
        teamName: created.teamName,
        role: created.role,
      });
      onNotice(`Team created and selected: ${created.teamName}.`);
    } catch (teamError) {
      onError(formatApiError(teamError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleTeamSettingsUpdate(event: FormEvent) {
    event.preventDefault();
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy('team-settings');
    onError(null);

    try {
      const updated = await client.updateTeamSettings(
        activeTeam.id,
        { teamName: teamSettingsName },
        token,
      );
      setSession((current) =>
        current
          ? {
              ...current,
              activeTeam: {
                id: updated.teamId,
                name: updated.teamName,
                role: updated.role,
              },
              teams: current.teams.map((team) =>
                team.teamId === updated.teamId
                  ? {
                      ...team,
                      teamName: updated.teamName,
                      role: updated.role,
                    }
                  : team,
              ),
            }
          : current,
      );
      await refreshTeamAuditEvents();
      onNotice('Team settings updated.');
    } catch (settingsError) {
      onError(formatApiError(settingsError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy('invite');
    onError(null);

    try {
      const invitation = await client.inviteTeamMember(
        activeTeam.id,
        {
          email: inviteEmail,
          role: inviteRole,
        },
        token,
      );
      setInvitations((current) => [
        invitation,
        ...current.filter((currentInvitation) => currentInvitation.id !== invitation.id),
      ]);
      setLastInviteToken(invitation.inviteToken ?? null);
      setLastInviteUrl(invitation.inviteUrl ?? null);
      setLastInviteDelivery(invitation.delivery ?? null);
      await refreshTeamAuditEvents();
      onNotice(inviteDeliveryNotice(invitation, 'created'));
    } catch (inviteError) {
      onError(formatApiError(inviteError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleAcceptInvitation(event: FormEvent) {
    event.preventDefault();
    if (!token || !acceptToken.trim()) {
      return;
    }

    setWorkspaceBusy('accept-invite');
    onError(null);

    try {
      const accepted = await client.acceptTeamInvitation(acceptToken, token);
      setAcceptToken('');
      setInvitations((current) =>
        current.map((invitation) => (invitation.id === accepted.id ? accepted : invitation)),
      );
      setInvitePreview((current) =>
        current
          ? {
              ...current,
              status: accepted.status,
              acceptedAt: accepted.acceptedAt,
              message: 'Invitation has been accepted.',
            }
          : current,
      );
      onNotice('Invitation accepted. Sign in again if you want to switch the active team session.');
    } catch (acceptError) {
      onError(formatApiError(acceptError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy(`revoke-invite-${invitationId}`);
    onError(null);

    try {
      const revoked = await client.revokeTeamInvitation(activeTeam.id, invitationId, token);
      setInvitations((current) =>
        current.map((invitation) => (invitation.id === revoked.id ? revoked : invitation)),
      );
      await refreshTeamAuditEvents();
      onNotice('Invitation revoked.');
    } catch (inviteError) {
      onError(formatApiError(inviteError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleResendInvitation(invitationId: string) {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy(`resend-invite-${invitationId}`);
    onError(null);

    try {
      const invitation = await client.resendTeamInvitation(activeTeam.id, invitationId, token);
      setInvitations((current) => [
        invitation,
        ...current.filter((currentInvitation) => currentInvitation.id !== invitation.id),
      ]);
      setLastInviteToken(invitation.inviteToken ?? null);
      setLastInviteUrl(invitation.inviteUrl ?? null);
      setLastInviteDelivery(invitation.delivery ?? null);
      await refreshTeamAuditEvents();
      onNotice(inviteDeliveryNotice(invitation, 'refreshed'));
    } catch (inviteError) {
      onError(formatApiError(inviteError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleCreateScimToken(event: FormEvent) {
    event.preventDefault();
    if (!token || !activeTeam || !scimTokenDisplayName.trim()) {
      return;
    }

    setWorkspaceBusy('scim-token-create');
    onError(null);

    try {
      const created = await client.createTeamScimToken(
        activeTeam.id,
        {
          displayName: scimTokenDisplayName,
          ...(scimTokenExpiresAt ? { expiresAt: new Date(scimTokenExpiresAt).toISOString() } : {}),
        },
        token,
      );
      setCreatedScimToken(created);
      setScimTokens((current) => [
        created,
        ...current.filter((scimToken) => scimToken.id !== created.id),
      ]);
      setScimTokenExpiresAt('');
      await refreshScimPosture();
      await refreshTeamAuditEvents();
      onNotice('SCIM token created. Copy it now; PolyCost will not show it again.');
    } catch (scimError) {
      onError(formatApiError(scimError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleRevokeScimToken(tokenId: string) {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy(`scim-token-revoke-${tokenId}`);
    onError(null);

    try {
      const revoked = await client.revokeTeamScimToken(activeTeam.id, tokenId, token);
      setScimTokens((current) =>
        current.map((scimToken) => (scimToken.id === revoked.id ? revoked : scimToken)),
      );
      setCreatedScimToken((current) => (current?.id === revoked.id ? null : current));
      await refreshScimPosture();
      await refreshTeamAuditEvents();
      onNotice('SCIM token revoked.');
    } catch (scimError) {
      onError(formatApiError(scimError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleRoleChange(accountId: string, role: TeamRole) {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy(`role-${accountId}`);
    onError(null);

    try {
      const updated = await client.updateTeamMemberRole(activeTeam.id, accountId, role, token);
      setMembers((current) =>
        current.map((member) => (member.accountId === updated.accountId ? updated : member)),
      );
      if (session?.account.id === updated.accountId) {
        setSession((current) =>
          current
            ? {
                ...current,
                activeTeam: current.activeTeam
                  ? {
                      ...current.activeTeam,
                      role: updated.role,
                    }
                  : current.activeTeam,
                teams: current.teams.map((team) =>
                  team.teamId === activeTeam.id
                    ? {
                        ...team,
                        role: updated.role,
                      }
                    : team,
                ),
              }
            : current,
        );
      }
      await refreshTeamAuditEvents();
      onNotice('Team role updated.');
    } catch (roleError) {
      onError(formatApiError(roleError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleRemoveMember(accountId: string) {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy(`remove-${accountId}`);
    onError(null);

    try {
      await client.removeTeamMember(activeTeam.id, accountId, token);
      setMembers((current) => current.filter((member) => member.accountId !== accountId));
      await refreshTeamAuditEvents();
      onNotice('Team member removed.');
    } catch (removeError) {
      onError(formatApiError(removeError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleConfigureSso(event: FormEvent) {
    event.preventDefault();
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy('sso-configure');
    onError(null);

    try {
      const configured = await client.configureSsoProvider(
        activeTeam.id,
        {
          providerType: ssoProviderType,
          displayName: ssoDisplayName,
          issuerUrl: ssoIssuerUrl,
          clientId: ssoClientId,
          clientSecret: ssoClientSecret,
        },
        token,
      );
      setSsoStatus((current) =>
        current
          ? {
              ...current,
              oidcConfigured: configured.providerType === 'oidc' ? true : current.oidcConfigured,
              samlConfigured: configured.providerType === 'saml' ? true : current.samlConfigured,
              configuredProviders: [
                configured,
                ...current.configuredProviders.filter(
                  (providerConfig) => providerConfig.providerType !== configured.providerType,
                ),
              ],
            }
          : current,
      );
      await refreshTeamAuditEvents();
      onNotice('SSO provider configuration saved.');
    } catch (ssoError) {
      onError(formatApiError(ssoError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleTestSsoConnection() {
    if (!token || !activeTeam) {
      return;
    }

    setWorkspaceBusy('sso-test');
    onError(null);

    try {
      const result = await client.testSsoConnection(
        activeTeam.id,
        {
          providerType: ssoProviderType,
          displayName: ssoDisplayName,
          issuerUrl: ssoIssuerUrl,
          clientId: ssoClientId,
          clientSecret: ssoClientSecret,
        },
        token,
      );
      onNotice(result.message);
    } catch (ssoError) {
      onError(formatApiError(ssoError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleStartMockOidcLogin() {
    if (!activeTeam) {
      return;
    }

    setWorkspaceBusy('sso-start');
    onError(null);

    try {
      const emailHint = ssoLoginEmail || session?.account.email;
      const start = await client.startMockOidcLogin({
        teamId: activeTeam.id,
        ...(emailHint ? { email: emailHint } : {}),
      });

      setSsoStart(start);
      onNotice('Mock OIDC authorization URL generated.');
    } catch (ssoError) {
      onError(formatApiError(ssoError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleCompleteMockOidcCallback() {
    if (!ssoStart) {
      return;
    }

    setWorkspaceBusy('sso-complete');
    onError(null);

    try {
      const emailHint = ssoLoginEmail || session?.account.email;
      const displayNameHint = profileDisplayName || undefined;
      const response = await client.completeMockOidcCallback({
        state: ssoStart.state,
        ...(emailHint ? { email: emailHint } : {}),
        ...(displayNameHint ? { displayName: displayNameHint } : {}),
      });

      storeAuthSession(response.token, response.expiresAt);
      setToken(response.token);
      setSessionExpiredNotice(false);
      setSsoStart(null);
      onNotice('Mock OIDC callback verified and workspace session issued.');
    } catch (ssoError) {
      onError(formatApiError(ssoError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleImportProviderExport(event: FormEvent) {
    event.preventDefault();
    if (!token || billingAccessMessage) {
      onError(billingAccessMessage ?? 'Sign in before importing provider billing exports.');
      return;
    }

    setWorkspaceBusy('billing-import');
    setBillingImport(null);
    setReconciliation(null);
    onError(null);

    try {
      const input: BillingProviderExportInput = {
        provider,
        sourceType,
        billingPeriodStart,
        billingPeriodEnd,
        content: exportContent,
        encoding: 'text',
        fileName: `${provider}-billing-export.csv`,
      };
      const imported = await client.importProviderBillingExport(input, token);
      setBillingImport(imported);

      if (comparisonId) {
        const reconciled = await client.reconcileBillingImport(
          imported.importRun.id,
          comparisonId,
          token,
        );
        setReconciliation(reconciled);
      }

      await refreshTeamAuditEvents();
      onNotice(
        comparisonId
          ? 'Provider export imported and reconciled against the active comparison.'
          : 'Provider export imported. Run a comparison to reconcile estimate versus actuals.',
      );
    } catch (billingError) {
      onError(formatApiError(billingError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleRegisterInvoiceArtifact() {
    if (!token || billingAccessMessage || !reconciliation) {
      onError(
        billingAccessMessage ??
          'Run an estimate-vs-actual reconciliation before registering invoice artifacts.',
      );
      return;
    }

    setWorkspaceBusy('billing-artifact');
    onError(null);

    try {
      const artifactInput: InvoiceGradeArtifactRegistrationInput = {
        type: 'provider-invoice',
        displayName: `${providerLabel(reconciliation.provider)} invoice control packet`,
        reference: `demo://invoice-artifacts/${reconciliation.id}`,
        controlTotalUsd: reconciliation.invoicedTotalUsd,
        billingPeriodStart,
        billingPeriodEnd,
        notes:
          'Metadata registration only. Invoice files, contracts, tax, commitment, and allocation evidence still require independent verification.',
      };
      const updated = await client.registerInvoiceGradeArtifact(
        reconciliation.id,
        artifactInput,
        token,
      );
      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice('Invoice artifact metadata registered. Verification is still required.');
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleStoreInvoiceArtifactBlob() {
    if (!token || billingAccessMessage || !reconciliation || !reconciliationSummary?.artifactId) {
      onError(
        billingAccessMessage ??
          'Register invoice artifact metadata before storing the invoice evidence file.',
      );
      return;
    }

    setWorkspaceBusy('billing-artifact-upload');
    onError(null);

    try {
      const artifactInput: InvoiceArtifactBlobUploadInput = {
        fileName: `${reconciliation.provider}-invoice-control-${reconciliation.id.slice(0, 8)}.txt`,
        mimeType: 'text/plain',
        encoding: 'text',
        retentionDays: 365,
        legalHold: false,
        content: [
          'PolyCost invoice artifact control packet',
          `reconciliation_id=${reconciliation.id}`,
          `artifact_id=${reconciliationSummary.artifactId}`,
          `provider=${reconciliation.provider}`,
          `billing_period=${billingPeriodStart}/${billingPeriodEnd}`,
          `invoiced_total_usd=${reconciliation.invoicedTotalUsd}`,
          `variance_usd=${reconciliation.varianceUsd}`,
        ].join('\n'),
      };
      const updated = await client.uploadInvoiceArtifactBlob(
        reconciliation.id,
        reconciliationSummary.artifactId,
        artifactInput,
        token,
      );

      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice('Invoice artifact file stored with checksum and audit metadata.');
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleDownloadInvoiceArtifactBlob() {
    if (!token || billingAccessMessage || !reconciliation || !reconciliationSummary?.artifactId) {
      onError(
        billingAccessMessage ??
          'Store an invoice artifact file before downloading the evidence attachment.',
      );
      return;
    }

    setWorkspaceBusy('billing-artifact-download');
    onError(null);

    try {
      const artifactBlob = await client.downloadInvoiceArtifactBlob(
        reconciliation.id,
        reconciliationSummary.artifactId,
        token,
      );
      if (!artifactBlob.contentBase64) {
        throw new Error('Stored artifact bytes were not returned by the API.');
      }
      downloadBlob(
        base64ToBlob(artifactBlob.contentBase64, artifactBlob.mimeType),
        artifactBlob.fileName,
      );
      onNotice(
        `Downloaded stored artifact ${artifactBlob.fileName} (${formatFileSize(
          artifactBlob.contentSizeBytes,
        )}).`,
      );
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleToggleInvoiceArtifactLegalHold() {
    if (
      !token ||
      billingAccessMessage ||
      !reconciliation ||
      !reconciliationSummary?.artifactId ||
      !reconciliationSummary.artifactBlobStored
    ) {
      onError(
        billingAccessMessage ?? 'Store an invoice artifact file before changing legal hold state.',
      );
      return;
    }

    const nextLegalHold = !reconciliationSummary.artifactLegalHold;

    setWorkspaceBusy('billing-artifact-legal-hold');
    onError(null);

    try {
      const legalHoldInput: InvoiceArtifactLegalHoldInput = {
        legalHold: nextLegalHold,
        reason: nextLegalHold
          ? 'Placed from workspace demo panel before retention enforcement.'
          : 'Released from workspace demo panel after review evidence was checked.',
      };
      const updated = await client.setInvoiceArtifactLegalHold(
        reconciliation.id,
        reconciliationSummary.artifactId,
        legalHoldInput,
        token,
      );

      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice(
        nextLegalHold
          ? 'Legal hold placed. Retention purge will skip this artifact until released.'
          : 'Legal hold released. Retention policy can apply again after review.',
      );
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleUpdateInvoiceArtifactReview(reviewStatus: InvoiceArtifactReviewStatus) {
    if (
      !token ||
      billingAccessMessage ||
      !reconciliation ||
      !reconciliationSummary?.artifactId ||
      !reconciliationSummary.artifactBlobStored ||
      reviewStatus === 'not-requested'
    ) {
      onError(
        billingAccessMessage ??
          'Store an invoice artifact file before changing review workflow state.',
      );
      return;
    }

    setWorkspaceBusy(`billing-artifact-review-${reviewStatus}`);
    onError(null);

    try {
      const reviewInput: InvoiceArtifactReviewInput = {
        reviewStatus,
        reviewer: 'finance-review@example.com',
        ...(reviewStatus === 'pending'
          ? {
              notes: 'Submitted from workspace panel for finance/legal artifact review.',
            }
          : {
              evidenceReference: `review://invoice-artifacts/${reconciliationSummary.artifactId}/${reviewStatus}`,
              notes:
                reviewStatus === 'approved'
                  ? 'Demo reviewer approved artifact governance packet after checksum and retention review.'
                  : 'Demo reviewer rejected artifact packet; provider invoice-of-record evidence is still incomplete.',
            }),
      };
      const updated = await client.updateInvoiceArtifactReview(
        reconciliation.id,
        reconciliationSummary.artifactId,
        reviewInput,
        token,
      );

      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice(
        reviewStatus === 'pending'
          ? 'Invoice artifact sent to the review queue.'
          : `Invoice artifact review ${reviewStatus}.`,
      );
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleUpdateInvoiceArtifactPolicyException(
    exceptionStatus: InvoiceArtifactPolicyExceptionStatus,
  ) {
    if (
      !token ||
      billingAccessMessage ||
      !reconciliation ||
      !reconciliationSummary?.artifactId ||
      !reconciliationSummary.artifactBlobStored ||
      exceptionStatus === 'not-requested' ||
      exceptionStatus === 'expired'
    ) {
      onError(
        billingAccessMessage ??
          'Store an invoice artifact file before changing policy exception state.',
      );
      return;
    }

    setWorkspaceBusy(`billing-artifact-exception-${exceptionStatus}`);
    onError(null);

    try {
      const artifactId = reconciliationSummary.artifactId;
      const exceptionInput: InvoiceArtifactPolicyExceptionInput = {
        exceptionStatus,
        reviewer: 'risk-review@example.com',
        reason:
          exceptionStatus === 'requested'
            ? 'Requesting a time-boxed policy exception while provider invoice-of-record evidence is still incomplete.'
            : exceptionStatus === 'approved'
              ? 'Approving a time-boxed exception for demo governance review; invoice-grade validation remains blocked.'
              : 'Rejecting the exception because provider invoice-of-record evidence remains insufficient.',
        ...(exceptionStatus === 'approved'
          ? {
              expiresAt: futureIsoTimestamp(30),
              evidenceReference: `exception://invoice-artifacts/${artifactId}/approved`,
              notes:
                'Approved as a temporary risk acceptance only. This does not mark the artifact invoice-grade verified.',
            }
          : exceptionStatus === 'rejected'
            ? {
                evidenceReference: `exception://invoice-artifacts/${artifactId}/rejected`,
                notes:
                  'Exception rejected; collect provider invoice controls before relying on invoice-grade evidence.',
              }
            : {
                expiresAt: futureIsoTimestamp(14),
                notes:
                  'Queued for policy owner review with explicit expiry target and invoice-grade caveat.',
              }),
      };
      const updated = await client.updateInvoiceArtifactPolicyException(
        reconciliation.id,
        artifactId,
        exceptionInput,
        token,
      );

      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice(
        exceptionStatus === 'requested'
          ? 'Policy exception requested for this artifact.'
          : `Policy exception ${exceptionStatus}.`,
      );
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleVerifyInvoiceArtifact() {
    if (!token || billingAccessMessage || !reconciliation || !reconciliationSummary?.artifactId) {
      onError(
        billingAccessMessage ??
          'Register invoice artifact metadata before marking an artifact verified.',
      );
      return;
    }

    setWorkspaceBusy('billing-artifact-verify');
    onError(null);

    try {
      const verificationInput: InvoiceGradeArtifactVerificationInput = {
        verificationStatus: 'verified',
        evidenceReference: `review://invoice-artifacts/${reconciliationSummary.artifactId}`,
        controlTotalUsd: reconciliation.invoicedTotalUsd,
        ...(reconciliationSummary.artifactBlobSha256
          ? { sha256: reconciliationSummary.artifactBlobSha256 }
          : {}),
        notes:
          'Demo verification based on stored artifact checksum and matching invoice control total. Full provider contract verification remains future scope.',
      };
      const updated = await client.verifyInvoiceGradeArtifact(
        reconciliation.id,
        reconciliationSummary.artifactId,
        verificationInput,
        token,
      );
      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice('Invoice artifact verification evidence recorded.');
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleValidateInvoiceControlPacket() {
    if (
      !token ||
      billingAccessMessage ||
      !reconciliation ||
      !reconciliationSummary?.artifactId ||
      !reconciliationSummary.artifactBlobStored ||
      reconciliationSummary.artifactVerifiedCount < 1
    ) {
      onError(
        billingAccessMessage ??
          'Store and verify an invoice artifact before validating invoice control totals.',
      );
      return;
    }

    setWorkspaceBusy('billing-invoice-control-validate');
    onError(null);

    try {
      const validationInput: InvoiceControlValidationInput = {
        acceptedVarianceUsd: 0.01,
        evidenceReference: `invoice-control://invoice-artifacts/${reconciliationSummary.artifactId}`,
        notes:
          'Control packet validation compares stored artifact total against imported actuals and reconciliation totals.',
      };
      const updated = await client.validateInvoiceControlPacket(
        reconciliation.id,
        reconciliationSummary.artifactId,
        validationInput,
        token,
      );
      const updatedSummary = reconciliationEvidenceSummary(updated);

      setReconciliation(updated);
      await refreshTeamAuditEvents();
      onNotice(
        `Invoice control validation ${updatedSummary.artifactInvoiceControlValidationStatus.replace(
          '-',
          ' ',
        )}.`,
      );
    } catch (artifactError) {
      onError(formatApiError(artifactError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  async function handleDownloadInvoiceEvidencePacket() {
    if (!token || billingAccessMessage || !reconciliation) {
      onError(
        billingAccessMessage ??
          'Run an estimate-vs-actual reconciliation before downloading an evidence packet.',
      );
      return;
    }

    setWorkspaceBusy('billing-evidence-packet');
    onError(null);

    try {
      const packet = await client.exportInvoiceEvidencePacket(reconciliation.id, token);
      const digestPrefix = packet.integrity.payloadDigestSha256.slice(0, 12);

      downloadBlob(
        new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' }),
        `polycost-invoice-evidence-${reconciliation.id.slice(0, 8)}-${digestPrefix}.json`,
      );
      onNotice(
        `Invoice evidence packet downloaded (${packet.packetStatus.replace(
          '-',
          ' ',
        )}; sha256 ${digestPrefix}).`,
      );
    } catch (packetError) {
      onError(formatApiError(packetError));
    } finally {
      setWorkspaceBusy(null);
    }
  }

  return (
    <section className="workspace-control-center" id="workspace" aria-label="Workspace controls">
      <div className="workspace-control-heading">
        <div>
          <span>Production hardening layer</span>
          <h2>Account, team, SSO readiness, and invoice reconciliation foundation</h2>
        </div>
        <strong>{session ? session.account.email : 'Local session required'}</strong>
      </div>

      <div className="workspace-control-grid">
        <section className="workspace-panel">
          <div className="workspace-panel-heading">
            <span>Workspace session</span>
            <strong>
              {session ? 'Connected' : authMode === 'register' ? 'Register' : 'Sign in'}
            </strong>
          </div>
          {invitePreview ? (
            <div className={`workspace-invite-preview is-${invitePreview.status}`}>
              <strong>
                Invite {invitePreview.status}
                {invitePreview.email ? ` · ${invitePreview.email}` : ''}
              </strong>
              <span>{invitePreview.message}</span>
            </div>
          ) : null}
          {sessionExpiredNotice && !session ? (
            <div className="workspace-session-policy is-expired" role="status">
              <strong>Workspace session expired</strong>
              <span>
                Anonymous comparisons still work. Sign in again for team, SSO, and billing-export
                controls.
              </span>
            </div>
          ) : null}
          {isSessionHydrating && token && !session ? (
            <SessionLoader
              compact
              phase="Verifying workspace access"
              steps={sessionHydrationSteps}
            />
          ) : session ? (
            <div className="workspace-session-summary">
              <span>{session.account.displayName ?? session.account.email}</span>
              <strong>
                {activeTeam ? `${activeTeam.name} · ${activeTeam.role}` : 'No active team'}
              </strong>
              {sessionStatus ? (
                <div className={`workspace-session-policy is-${sessionStatus.tone}`} role="status">
                  <strong>{sessionStatus.label}</strong>
                  <span>{sessionStatus.detail}</span>
                </div>
              ) : null}
              {activeTeamOptions.length > 0 ? (
                <label className="workspace-field">
                  <span>Active team</span>
                  <select
                    aria-label="Active team"
                    value={activeTeam?.id ?? ''}
                    disabled={workspaceBusy === 'switch-team'}
                    onChange={(event) => void handleActiveTeamSwitch(event.currentTarget.value)}
                  >
                    {activeTeamOptions.map((team) => (
                      <option key={team.teamId} value={team.teamId}>
                        {team.teamName} · {teamRoleLabel(team.role)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <form className="workspace-inline-form" onSubmit={handleProfileUpdate}>
                <label className="workspace-field">
                  <span>Profile email</span>
                  <input
                    value={profileEmail}
                    onChange={(event) => setProfileEmail(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Display name</span>
                  <input
                    value={profileDisplayName}
                    onChange={(event) => setProfileDisplayName(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Current password (email changes)</span>
                  <input
                    type="password"
                    value={profileCurrentPassword}
                    onChange={(event) => setProfileCurrentPassword(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'profile'}
                  loadingLabel="Saving..."
                >
                  Save profile
                </Button>
              </form>
              <form className="workspace-inline-form" onSubmit={handlePasswordChange}>
                <label className="workspace-field">
                  <span>Current password</span>
                  <input
                    type="password"
                    value={profileCurrentPassword}
                    onChange={(event) => setProfileCurrentPassword(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>New password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'password'}
                  loadingLabel="Changing..."
                >
                  Change password
                </Button>
              </form>
              <div className="workspace-session-list" aria-label="Active account sessions">
                {accountSessions.slice(0, 3).map((accountSession) => (
                  <span key={accountSession.id}>
                    {accountSession.current ? 'Current' : 'Other'} · last seen{' '}
                    {formatDateTime(accountSession.lastSeenAt)} · expires{' '}
                    {formatDateTime(accountSession.expiresAt)}
                  </span>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleRevokeOtherSessions()}
                loading={workspaceBusy === 'revoke-sessions'}
                disabled={accountSessions.filter((item) => !item.current).length === 0}
              >
                <ShieldIcon />
                Sign out other devices
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleLogout()}
                loading={authBusy}
              >
                <SignInIcon />
                Sign out
              </Button>
              <form className="workspace-inline-form" onSubmit={handleAccountDeletion}>
                <label className="workspace-field">
                  <span>Delete confirmation</span>
                  <input
                    value={deleteConfirmation}
                    placeholder="DELETE"
                    onChange={(event) => setDeleteConfirmation(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Delete current password</span>
                  <input
                    type="password"
                    value={deleteCurrentPassword}
                    onChange={(event) => setDeleteCurrentPassword(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'delete-account'}
                  loadingLabel="Disabling..."
                  disabled={deleteConfirmation !== 'DELETE'}
                >
                  Disable account
                </Button>
              </form>
            </div>
          ) : (
            <form className="workspace-auth-form" onSubmit={handleAuthSubmit}>
              <div className="workspace-auth-toggle" role="group" aria-label="Authentication mode">
                <button
                  type="button"
                  className={authMode === 'login' ? 'is-active' : ''}
                  aria-pressed={authMode === 'login'}
                  onClick={() => setAuthMode('login')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={authMode === 'register' ? 'is-active' : ''}
                  aria-pressed={authMode === 'register'}
                  onClick={() => setAuthMode('register')}
                >
                  Register
                </button>
              </div>
              <label className="workspace-field">
                <span>Email</span>
                <input value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
              </label>
              <label className="workspace-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                />
              </label>
              {authMode === 'register' ? (
                <>
                  <label className="workspace-field">
                    <span>Display name</span>
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.currentTarget.value)}
                    />
                  </label>
                  <label className="workspace-field">
                    <span>Team name</span>
                    <input
                      value={teamName}
                      onChange={(event) => setTeamName(event.currentTarget.value)}
                    />
                  </label>
                </>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                loading={authBusy}
                loadingLabel="Connecting..."
              >
                <SignInIcon />
                {authMode === 'register' ? 'Create workspace' : 'Sign in'}
              </Button>
            </form>
          )}
        </section>

        <section className="workspace-panel">
          <div className="workspace-panel-heading">
            <span>Team access</span>
            <strong>{canManageTeam ? `${members.length} members` : 'Admin required'}</strong>
          </div>
          {canManageTeam && activeTeam && session && token ? (
            <>
              {isWorkspaceDirectoryLoading || workspaceDirectoryError ? (
                <SessionLoader
                  compact
                  identity={{
                    name: session.account.displayName ?? session.account.email,
                    detail: `${activeTeam.name} · ${activeTeam.role}`,
                  }}
                  phase={
                    workspaceDirectoryError
                      ? 'Workspace sync needs attention'
                      : 'Syncing team access'
                  }
                  steps={workspaceDirectorySteps}
                  trustCue={Boolean(token && session)}
                  error={workspaceDirectoryError}
                />
              ) : null}
              <form className="workspace-inline-form" onSubmit={handleCreateTeam}>
                <label className="workspace-field">
                  <span>New team</span>
                  <input
                    value={newTeamName}
                    onChange={(event) => setNewTeamName(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'create-team'}
                  loadingLabel="Creating..."
                >
                  Create team
                </Button>
              </form>
              <form className="workspace-inline-form" onSubmit={handleTeamSettingsUpdate}>
                <label className="workspace-field">
                  <span>Current team name</span>
                  <input
                    value={teamSettingsName}
                    onChange={(event) => setTeamSettingsName(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'team-settings'}
                  loadingLabel="Saving..."
                >
                  Save team
                </Button>
              </form>
              <div className="workspace-role-guide" aria-label="Role permissions">
                <span>Owner: billing, SSO, roles, deletion</span>
                <span>Admin: members, invites, SSO setup</span>
                <span>Member: comparisons and shared evidence</span>
              </div>
              <form className="workspace-inline-form" onSubmit={handleInvite}>
                <label className="workspace-field">
                  <span>Invite email</span>
                  <input
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Role</span>
                  <select
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(event.currentTarget.value as Exclude<TeamRole, 'owner'>)
                    }
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'invite'}
                  loadingLabel="Inviting..."
                >
                  <ParseIcon />
                  Invite
                </Button>
              </form>
              {lastInviteToken ? (
                <p className="workspace-token-output">
                  Invite token: {lastInviteToken}
                  {lastInviteUrl ? ` · URL: ${lastInviteUrl}` : ''}
                </p>
              ) : null}
              {lastInviteDelivery ? (
                <p className={`workspace-delivery-output is-${lastInviteDelivery.status}`}>
                  Delivery: {lastInviteDelivery.message}
                  {lastInviteDelivery.deliveredAt
                    ? ` · ${formatDateTime(lastInviteDelivery.deliveredAt)}`
                    : ''}
                </p>
              ) : null}
              <div className="workspace-member-list">
                {members.map((member) => {
                  const roleControl = memberRoleControlState({
                    actorRole: activeTeam.role,
                    currentAccountId: session.account.id,
                    member,
                    ownerCount,
                    busyKey: workspaceBusy,
                  });
                  const removeControl = memberRemoveControlState({
                    actorRole: activeTeam.role,
                    currentAccountId: session.account.id,
                    member,
                    ownerCount,
                    busyKey: workspaceBusy,
                  });

                  return (
                    <div className="workspace-member-row" key={member.accountId}>
                      <span>
                        <strong>{member.displayName ?? member.email}</strong>
                        <small>{member.email}</small>
                      </span>
                      <span className={`workspace-role-badge is-${member.role}`}>
                        {teamRoleLabel(member.role)}
                      </span>
                      <select
                        value={member.role}
                        aria-label={`Change role for ${member.email}`}
                        disabled={roleControl.disabled}
                        title={roleControl.reason}
                        onChange={(event) =>
                          void handleRoleChange(
                            member.accountId,
                            event.currentTarget.value as TeamRole,
                          )
                        }
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                      <Button
                        type="button"
                        variant="destructiveQuiet"
                        size="compact"
                        className="workspace-link-button"
                        aria-label={`Remove ${member.email}`}
                        disabled={removeControl.disabled}
                        title={removeControl.reason}
                        onClick={() => void handleRemoveMember(member.accountId)}
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="workspace-member-list" aria-label="Team invitations">
                {invitations
                  .filter(
                    (invitation) =>
                      invitation.status === 'pending' || invitation.status === 'expired',
                  )
                  .slice(0, 4)
                  .map((invitation) => (
                    <div className="workspace-member-row" key={invitation.id}>
                      <span>
                        <strong>{invitation.email}</strong>
                        <small>
                          {invitation.role} invite · {invitation.status} · expires{' '}
                          {formatDateTime(invitation.expiresAt)}
                        </small>
                      </span>
                      <span className="workspace-row-actions">
                        {invitation.status === 'pending' || invitation.status === 'expired' ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            loading={workspaceBusy === `resend-invite-${invitation.id}`}
                            loadingLabel="Refreshing..."
                            onClick={() => void handleResendInvitation(invitation.id)}
                          >
                            Resend
                          </Button>
                        ) : null}
                        {invitation.status === 'pending' ? (
                          <Button
                            type="button"
                            variant="destructiveQuiet"
                            size="compact"
                            className="workspace-link-button"
                            disabled={workspaceBusy === `revoke-invite-${invitation.id}`}
                            onClick={() => void handleRevokeInvitation(invitation.id)}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </span>
                    </div>
                  ))}
              </div>
              <form className="workspace-inline-form" onSubmit={handleAcceptInvitation}>
                <label className="workspace-field workspace-field-wide">
                  <span>Accept invite token</span>
                  <input
                    value={acceptToken}
                    onChange={(event) => setAcceptToken(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'accept-invite'}
                  loadingLabel="Accepting..."
                >
                  Accept
                </Button>
              </form>
              <div className="workspace-sso-status">
                <span>SSO readiness</span>
                <strong>
                  OIDC {ssoStatus?.oidcConfigured ? 'configured' : 'ready'} · SAML{' '}
                  {ssoStatus?.samlConfigured ? 'configured' : 'ready'}
                </strong>
                <small>
                  {invitations.filter((item) => item.status === 'pending').length} pending
                  invitations
                  {ssoStatus?.callbackUrls.oidc
                    ? ` · OIDC callback ${ssoStatus.callbackUrls.oidc}`
                    : ''}
                </small>
              </div>
              <div className="workspace-sso-status workspace-scim-status">
                <span>SCIM provisioning</span>
                <strong>
                  {activeScimTokenCount} active tokens · {activeScimUserCount} active users
                </strong>
                <small>
                  Tokens are shown once, then stored as hashes. Provisioned IdP users attach to this
                  team directory.
                </small>
              </div>
              <form className="workspace-inline-form" onSubmit={handleCreateScimToken}>
                <label className="workspace-field">
                  <span>SCIM token name</span>
                  <input
                    value={scimTokenDisplayName}
                    onChange={(event) => setScimTokenDisplayName(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Expires at (optional)</span>
                  <input
                    type="datetime-local"
                    value={scimTokenExpiresAt}
                    onChange={(event) => setScimTokenExpiresAt(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'scim-token-create'}
                  loadingLabel="Creating..."
                  disabled={!scimTokenDisplayName.trim()}
                >
                  Create SCIM token
                </Button>
              </form>
              {createdScimToken ? (
                <p className="workspace-token-output workspace-sensitive-token" role="status">
                  SCIM token: {createdScimToken.token} · Copy now. It will not be shown again.
                </p>
              ) : null}
              <div className="workspace-scim-grid">
                <div className="workspace-member-list workspace-scim-list" aria-label="SCIM tokens">
                  {scimTokens.length > 0 ? (
                    scimTokens.slice(0, 4).map((scimToken) => (
                      <div
                        className={`workspace-member-row ${scimToken.revokedAt ? 'is-muted' : ''}`}
                        key={scimToken.id}
                      >
                        <span>
                          <strong>{scimToken.displayName}</strong>
                          <small>
                            Prefix {scimToken.tokenPrefix} · created{' '}
                            {formatDateTime(scimToken.createdAt)}
                            {scimToken.lastUsedAt
                              ? ` · last used ${formatDateTime(scimToken.lastUsedAt)}`
                              : ' · never used'}
                            {scimToken.expiresAt
                              ? ` · expires ${formatDateTime(scimToken.expiresAt)}`
                              : ' · no expiry'}
                          </small>
                        </span>
                        <span
                          className={`workspace-role-badge ${
                            scimToken.revokedAt ? 'is-disabled' : 'is-admin'
                          }`}
                        >
                          {scimToken.revokedAt ? 'Revoked' : 'Active'}
                        </span>
                        {!scimToken.revokedAt ? (
                          <Button
                            type="button"
                            variant="destructiveQuiet"
                            size="compact"
                            className="workspace-link-button"
                            aria-label={`Revoke SCIM token ${scimToken.displayName}`}
                            loading={workspaceBusy === `scim-token-revoke-${scimToken.id}`}
                            loadingLabel="Revoking..."
                            onClick={() => void handleRevokeScimToken(scimToken.id)}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="workspace-empty-state">No SCIM tokens created yet.</p>
                  )}
                </div>
                <div
                  className="workspace-member-list workspace-scim-list"
                  aria-label="SCIM provisioned users"
                >
                  {scimUsers.length > 0 ? (
                    scimUsers.slice(0, 4).map((scimUser) => (
                      <div
                        className={`workspace-member-row ${scimUser.active ? '' : 'is-muted'}`}
                        key={scimUser.id}
                      >
                        <span>
                          <strong>{scimUser.displayName ?? scimUser.userName}</strong>
                          <small>
                            {scimUser.userName} · external {scimUser.externalId} · updated{' '}
                            {formatDateTime(scimUser.updatedAt)}
                          </small>
                        </span>
                        <span
                          className={`workspace-role-badge ${
                            scimUser.active ? 'is-member' : 'is-disabled'
                          }`}
                        >
                          {scimUser.active ? 'Active' : 'Deactivated'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="workspace-empty-state">
                      Provisioned IdP users will appear here after SCIM sync.
                    </p>
                  )}
                </div>
              </div>
              <div className="workspace-inline-form">
                <label className="workspace-field">
                  <span>Mock OIDC email</span>
                  <input
                    value={ssoLoginEmail}
                    onChange={(event) => setSsoLoginEmail(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  loading={workspaceBusy === 'sso-start'}
                  loadingLabel="Starting..."
                  onClick={() => void handleStartMockOidcLogin()}
                >
                  Start mock OIDC
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={workspaceBusy === 'sso-complete'}
                  loadingLabel="Completing..."
                  disabled={!ssoStart}
                  onClick={() => void handleCompleteMockOidcCallback()}
                >
                  Complete callback
                </Button>
              </div>
              {ssoStart ? (
                <p className="workspace-token-output">
                  Mock authorization: {ssoStart.authorizationUrl} · callback {ssoStart.callbackUrl}{' '}
                  · state expires {formatDateTime(ssoStart.expiresAt)}
                </p>
              ) : null}
              <form className="workspace-inline-form" onSubmit={handleConfigureSso}>
                <label className="workspace-field">
                  <span>SSO provider</span>
                  <select
                    value={ssoProviderType}
                    onChange={(event) =>
                      setSsoProviderType(event.currentTarget.value as 'oidc' | 'saml')
                    }
                  >
                    <option value="oidc">OIDC</option>
                    <option value="saml">SAML</option>
                  </select>
                </label>
                <label className="workspace-field">
                  <span>Display name</span>
                  <input
                    value={ssoDisplayName}
                    onChange={(event) => setSsoDisplayName(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field workspace-field-wide">
                  <span>Issuer URL</span>
                  <input
                    value={ssoIssuerUrl}
                    onChange={(event) => setSsoIssuerUrl(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Client ID</span>
                  <input
                    value={ssoClientId}
                    onChange={(event) => setSsoClientId(event.currentTarget.value)}
                  />
                </label>
                <label className="workspace-field">
                  <span>Client secret</span>
                  <input
                    type="password"
                    value={ssoClientSecret}
                    onChange={(event) => setSsoClientSecret(event.currentTarget.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={workspaceBusy === 'sso-configure'}
                  loadingLabel="Saving..."
                >
                  Save SSO
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={workspaceBusy === 'sso-test'}
                  loadingLabel="Testing..."
                  onClick={() => void handleTestSsoConnection()}
                >
                  Test connection
                </Button>
              </form>
              <div className="workspace-audit-list" aria-label="Team audit trail">
                <div className="workspace-audit-heading">
                  <span>Recent audit trail</span>
                  <strong>{auditEvents.length} events</strong>
                </div>
                {auditEvents.length > 0 ? (
                  auditEvents.slice(0, 6).map((event) => (
                    <div className="workspace-audit-row" key={event.id}>
                      <span>
                        <strong>{teamAuditActionLabel(event.action)}</strong>
                        <small>{teamAuditEventDetail(event)}</small>
                      </span>
                      <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                    </div>
                  ))
                ) : (
                  <p className="workspace-empty-state">
                    Team, SSO, invite, and billing actions will appear here after the first audited
                    change.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="workspace-empty-state">
              Sign in as a team owner or admin to manage members, issue invite and SCIM tokens, and
              review SSO status.
            </p>
          )}
        </section>

        <form
          className="workspace-panel workspace-billing-panel"
          onSubmit={handleImportProviderExport}
        >
          <div className="workspace-panel-heading">
            <span>Actuals reconciliation</span>
            <strong>
              {billingImport
                ? `${billingImport.acceptedRows} rows imported`
                : billingAccessMessage
                  ? 'Admin required'
                  : 'Provider export'}
            </strong>
          </div>
          {billingAccessMessage ? (
            <p className="workspace-empty-state">{billingAccessMessage}</p>
          ) : null}
          <div className="workspace-billing-controls">
            <label className="workspace-field">
              <span>Provider</span>
              <select
                value={provider}
                disabled={Boolean(billingAccessMessage)}
                onChange={(event) => {
                  const nextProvider = event.currentTarget.value as ProviderId;
                  setProvider(nextProvider);
                  setExportContent(providerExportSample(nextProvider));
                }}
              >
                <option value="aws">AWS CUR</option>
                <option value="azure">Azure Cost Management</option>
                <option value="gcp">GCP Billing Export</option>
              </select>
            </label>
            <TextField
              label="Billing period start"
              value={billingPeriodStart}
              disabled={Boolean(billingAccessMessage)}
              onChange={setBillingPeriodStart}
            />
            <TextField
              label="Billing period end"
              value={billingPeriodEnd}
              disabled={Boolean(billingAccessMessage)}
              onChange={setBillingPeriodEnd}
            />
          </div>
          <label className="workspace-field workspace-export-field">
            <span>{sourceType} CSV or JSON content</span>
            <textarea
              value={exportContent}
              disabled={Boolean(billingAccessMessage)}
              onChange={(event) => setExportContent(event.currentTarget.value)}
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            loading={workspaceBusy === 'billing-import'}
            loadingLabel="Importing actuals..."
            disabled={Boolean(billingAccessMessage)}
          >
            <CompareIcon />
            Import & reconcile
          </Button>
          {billingImport ? (
            <div className="workspace-reconciliation-result">
              <span>Import {billingImport.importRun.id.slice(0, 8)}</span>
              <strong>{formatCurrency(billingImport.importRun.totalCostUsd)}</strong>
              <small>
                {reconciliation
                  ? `${reconciliation.status} · ${formatCurrency(
                      reconciliation.varianceUsd,
                    )} variance`
                  : 'Run a comparison to attach estimate-vs-actual evidence'}
              </small>
              {reconciliationSummary ? (
                <div className="workspace-reconciliation-audit">
                  <span>{reconciliationSummary.readiness}</span>
                  <small>
                    {reconciliationSummary.sourceFingerprintPercent}% source fingerprinted ·{' '}
                    {reconciliationSummary.skuMatchPercent}% SKU matched
                  </small>
                  <small>
                    Usage-comparable variance{' '}
                    {formatCurrency(reconciliationSummary.estimateComparableVarianceUsd)} ·{' '}
                    {reconciliationSummary.adjustmentLineItemCount} adjustment rows (
                    {formatCurrency(reconciliationSummary.adjustmentCostUsd)})
                  </small>
                  <small>
                    Invoice-grade readiness: {reconciliationSummary.invoiceGradeStatus} ·{' '}
                    {reconciliationSummary.invoiceGradeMissingCount} missing ·{' '}
                    {reconciliationSummary.invoiceGradePartialCount} partial
                  </small>
                  {reconciliationSummary.invoiceGradeBlockers.length > 0 ? (
                    <small>
                      Invoice blockers: {reconciliationSummary.invoiceGradeBlockers.join(', ')}
                    </small>
                  ) : null}
                  <small>
                    Artifact metadata: {reconciliationSummary.artifactRegisteredCount} registered ·{' '}
                    {reconciliationSummary.artifactVerifiedCount} verified ·{' '}
                    {reconciliationSummary.artifactRegisterStatus}
                  </small>
                  {reconciliationSummary.artifactBlobStored ? (
                    <>
                      <small>
                        Stored file: {reconciliationSummary.artifactBlobFileName} ·{' '}
                        {formatFileSize(reconciliationSummary.artifactBlobSizeBytes)} · sha256{' '}
                        {reconciliationSummary.artifactBlobSha256?.slice(0, 12)}
                      </small>
                      <small>
                        Governance: scan {reconciliationSummary.artifactMalwareScanStatus} · retain
                        until {formatDateTime(reconciliationSummary.artifactRetentionUntil)} · legal
                        hold {reconciliationSummary.artifactLegalHold ? 'on' : 'off'} ·{' '}
                        {reconciliationSummary.artifactKmsRequiredForProduction
                          ? 'KMS required for production'
                          : 'KMS reference recorded'}
                      </small>
                      <small>
                        Review queue: {reconciliationSummary.artifactReviewStatus.replace('-', ' ')}
                        {reconciliationSummary.artifactReviewReviewer
                          ? ` · ${reconciliationSummary.artifactReviewReviewer}`
                          : ''}{' '}
                        · pending {reconciliationSummary.artifactReviewPendingCount} · approved{' '}
                        {reconciliationSummary.artifactReviewApprovedCount} · rejected{' '}
                        {reconciliationSummary.artifactReviewRejectedCount}
                      </small>
                      <small>
                        Policy exception:{' '}
                        {reconciliationSummary.artifactPolicyExceptionStatus.replace('-', ' ')}
                        {reconciliationSummary.artifactPolicyExceptionReviewer
                          ? ` · ${reconciliationSummary.artifactPolicyExceptionReviewer}`
                          : ''}
                        {reconciliationSummary.artifactPolicyExceptionExpiresAt
                          ? ` · expires ${formatDateTime(
                              reconciliationSummary.artifactPolicyExceptionExpiresAt,
                            )}`
                          : ''}{' '}
                        · requested {reconciliationSummary.artifactPolicyExceptionRequestedCount} ·
                        approved {reconciliationSummary.artifactPolicyExceptionApprovedCount} ·
                        rejected {reconciliationSummary.artifactPolicyExceptionRejectedCount} ·
                        expired {reconciliationSummary.artifactPolicyExceptionExpiredCount}
                      </small>
                      <small>
                        Invoice control:{' '}
                        {reconciliationSummary.artifactInvoiceControlValidationStatus.replace(
                          '-',
                          ' ',
                        )}{' '}
                        · reconciliation delta{' '}
                        {formatSignedCurrency(
                          reconciliationSummary.artifactInvoiceControlTotalDeltaUsd,
                        )}{' '}
                        · import delta{' '}
                        {formatSignedCurrency(
                          reconciliationSummary.artifactInvoiceControlImportDeltaUsd,
                        )}{' '}
                        · period{' '}
                        {reconciliationSummary.artifactInvoiceControlValidationStatus === 'not-run'
                          ? 'pending'
                          : reconciliationSummary.artifactInvoiceControlPeriodMatched
                            ? 'matched'
                            : 'not matched'}{' '}
                        {reconciliationSummary.artifactInvoiceControlValidatedAt
                          ? `· ${formatDateTime(
                              reconciliationSummary.artifactInvoiceControlValidatedAt,
                            )}`
                          : ''}
                      </small>
                    </>
                  ) : reconciliationSummary.artifactId ? (
                    <small>
                      Artifact file not stored yet. Metadata is registered, but no evidence blob is
                      attached.
                    </small>
                  ) : null}
                  <small>{reconciliationSummary.artifactPrimaryCaveat}</small>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    loading={workspaceBusy === 'billing-evidence-packet'}
                    loadingLabel="Preparing packet..."
                    disabled={Boolean(billingAccessMessage)}
                    onClick={handleDownloadInvoiceEvidencePacket}
                  >
                    <CompareIcon />
                    Download evidence packet
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    loading={workspaceBusy === 'billing-artifact'}
                    loadingLabel="Registering artifact..."
                    disabled={Boolean(billingAccessMessage)}
                    onClick={handleRegisterInvoiceArtifact}
                  >
                    <CompareIcon />
                    Register invoice artifact
                  </Button>
                  {reconciliationSummary.artifactId && !reconciliationSummary.artifactBlobStored ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-upload'}
                      loadingLabel="Storing artifact..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={handleStoreInvoiceArtifactBlob}
                    >
                      <CompareIcon />
                      Store artifact file
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId && reconciliationSummary.artifactBlobStored ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-download'}
                      loadingLabel="Opening artifact..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={handleDownloadInvoiceArtifactBlob}
                    >
                      <CompareIcon />
                      Download stored file
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId && reconciliationSummary.artifactBlobStored ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-legal-hold'}
                      loadingLabel={
                        reconciliationSummary.artifactLegalHold
                          ? 'Releasing legal hold...'
                          : 'Placing legal hold...'
                      }
                      disabled={Boolean(billingAccessMessage)}
                      onClick={handleToggleInvoiceArtifactLegalHold}
                    >
                      <CompareIcon />
                      {reconciliationSummary.artifactLegalHold
                        ? 'Release legal hold'
                        : 'Place legal hold'}
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactBlobStored &&
                  reconciliationSummary.artifactReviewStatus === 'not-requested' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-review-pending'}
                      loadingLabel="Sending to review..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={() => void handleUpdateInvoiceArtifactReview('pending')}
                    >
                      <CompareIcon />
                      Send to review
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactBlobStored &&
                  reconciliationSummary.artifactReviewStatus === 'pending' ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        loading={workspaceBusy === 'billing-artifact-review-approved'}
                        loadingLabel="Approving review..."
                        disabled={Boolean(billingAccessMessage)}
                        onClick={() => void handleUpdateInvoiceArtifactReview('approved')}
                      >
                        <CompareIcon />
                        Approve review
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        loading={workspaceBusy === 'billing-artifact-review-rejected'}
                        loadingLabel="Rejecting review..."
                        disabled={Boolean(billingAccessMessage)}
                        onClick={() => void handleUpdateInvoiceArtifactReview('rejected')}
                      >
                        <CompareIcon />
                        Reject review
                      </Button>
                    </>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactBlobStored &&
                  (reconciliationSummary.artifactPolicyExceptionStatus === 'not-requested' ||
                    reconciliationSummary.artifactPolicyExceptionStatus === 'expired') ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-exception-requested'}
                      loadingLabel="Requesting exception..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={() => void handleUpdateInvoiceArtifactPolicyException('requested')}
                    >
                      <CompareIcon />
                      Request exception
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactBlobStored &&
                  reconciliationSummary.artifactPolicyExceptionStatus === 'requested' ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        loading={workspaceBusy === 'billing-artifact-exception-approved'}
                        loadingLabel="Approving exception..."
                        disabled={Boolean(billingAccessMessage)}
                        onClick={() => void handleUpdateInvoiceArtifactPolicyException('approved')}
                      >
                        <CompareIcon />
                        Approve exception
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        loading={workspaceBusy === 'billing-artifact-exception-rejected'}
                        loadingLabel="Rejecting exception..."
                        disabled={Boolean(billingAccessMessage)}
                        onClick={() => void handleUpdateInvoiceArtifactPolicyException('rejected')}
                      >
                        <CompareIcon />
                        Reject exception
                      </Button>
                    </>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactVerifiedCount <
                    reconciliationSummary.artifactRegisteredCount ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-artifact-verify'}
                      loadingLabel="Verifying artifact..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={handleVerifyInvoiceArtifact}
                    >
                      <CompareIcon />
                      Verify artifact evidence
                    </Button>
                  ) : null}
                  {reconciliationSummary.artifactId &&
                  reconciliationSummary.artifactBlobStored &&
                  reconciliationSummary.artifactVerifiedCount > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      loading={workspaceBusy === 'billing-invoice-control-validate'}
                      loadingLabel="Validating controls..."
                      disabled={Boolean(billingAccessMessage)}
                      onClick={handleValidateInvoiceControlPacket}
                    >
                      <CompareIcon />
                      Validate invoice control
                    </Button>
                  ) : null}
                  {reconciliationSummary.commitmentLineItemCount > 0 ? (
                    <>
                      <small>
                        Commitments: {reconciliationSummary.commitmentLineItemCount} rows · net{' '}
                        {formatCurrency(reconciliationSummary.commitmentNetCostUsd)}
                        {reconciliationSummary.commitmentCategories.length > 0
                          ? ` (${reconciliationSummary.commitmentCategories.join(', ')})`
                          : ''}
                      </small>
                      <small>
                        Commitment evidence needed:{' '}
                        {reconciliationSummary.commitmentRowsRequiringProviderInventory} inventory ·{' '}
                        {reconciliationSummary.commitmentRowsRequiringAmortizationPeriod}{' '}
                        amortization ·{' '}
                        {reconciliationSummary.commitmentRowsRequiringAllocationEvidence} allocation
                      </small>
                    </>
                  ) : null}
                  {reconciliationSummary.adjustmentCategories.length > 0 ? (
                    <small>
                      Adjustments: {reconciliationSummary.adjustmentCategories.join(', ')}
                    </small>
                  ) : null}
                  <small>{reconciliationSummary.primaryCaveat}</small>
                </div>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
