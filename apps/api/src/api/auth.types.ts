export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface AccountTeamMembership {
  teamId: string;
  teamName: string;
  role: TeamRole;
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

export interface RequestWithAuth {
  headers?: Record<string, unknown>;
  ip?: string;
  auth?: AuthIdentity;
}
