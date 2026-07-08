export type TeamRole = 'owner' | 'admin' | 'member';

export interface AccountTeamMembership {
  teamId: string;
  teamName: string;
  role: TeamRole;
}

export interface TeamMemberRecord {
  accountId: string;
  email: string;
  displayName?: string;
  role: TeamRole;
  createdAt: string;
  lastActiveAt?: string;
}

export interface TeamInvitationRecord {
  id: string;
  teamId: string;
  email: string;
  role: Exclude<TeamRole, 'owner'>;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invitedByAccountId: string;
  acceptedByAccountId?: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  inviteToken?: string;
  inviteUrl?: string;
}

export interface TeamInvitationPreview {
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'invalid';
  email?: string;
  role?: Exclude<TeamRole, 'owner'>;
  teamId?: string;
  expiresAt?: string;
  acceptedAt?: string;
  revokedAt?: string;
  message: string;
}

export interface AccountSessionRecord {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string;
  hasUserAgent: boolean;
  hasIp: boolean;
}

export interface AccountProfileResponse {
  id: string;
  email: string;
  displayName?: string;
  status: 'active' | 'disabled' | 'invited';
}

export interface TeamSettingsRecord {
  teamId: string;
  teamName: string;
  plan: 'oss' | 'team' | 'enterprise';
  role: TeamRole;
  updatedAt: string;
}

export interface SsoConfigurationStatus {
  localLoginEnabled: boolean;
  oidcConfigured: boolean;
  samlConfigured: boolean;
  configuredProviders: Array<{
    providerType: 'oidc' | 'saml';
    displayName: string;
    issuerUrl: string;
    status: 'configured' | 'disabled';
  }>;
  callbackUrls: {
    oidc: string;
    saml: string;
  };
}

export interface SsoConnectionTestResult {
  ok: boolean;
  providerType: 'oidc' | 'saml';
  issuerUrl: string;
  checkedAt: string;
  message: string;
}

export interface SsoStartResponse {
  providerType: 'oidc';
  mode: 'mock';
  authorizationUrl: string;
  callbackUrl: string;
  state: string;
  expiresAt: string;
}

export interface SsoCallbackResponse extends AuthSessionResponse {
  sso: {
    providerType: 'oidc';
    issuerUrl: string;
    subjectHash: string;
    stateVerified: true;
  };
}

export interface AuthIdentity {
  accountId: string;
  email: string;
  displayName?: string;
  teamId?: string;
  role?: TeamRole;
  sessionId: string;
  expiresAt: string;
}

export interface AuthSessionResponse {
  token: string;
  expiresAt: string;
  account: {
    id: string;
    email: string;
    displayName?: string;
  };
  team?: {
    id: string;
    name: string;
    role: TeamRole;
  };
}

export interface AuthMeResponse {
  account: {
    id: string;
    email: string;
    displayName?: string;
  };
  activeTeam?: {
    id: string;
    name: string;
    role: TeamRole;
  };
  teams: AccountTeamMembership[];
  session: {
    id: string;
    expiresAt: string;
  };
}

export interface TeamSwitchResponse {
  activeTeam: {
    id: string;
    name: string;
    role: TeamRole;
  };
  session: {
    id: string;
    expiresAt: string;
  };
}

export interface RequestWithAuth {
  headers?: Record<string, unknown>;
  ip?: string;
  auth?: AuthIdentity;
}
