import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import {
  ApiConflictError,
  ApiForbiddenError,
  ApiNotFoundError,
  ApiValidationError,
} from './api-errors.js';
import { ApiDatabaseRepository, type TeamDomainRow } from './api-database.repository.js';
import type { AuthIdentity, TeamDomainRecord } from './auth.types.js';
import {
  normalizeDomain,
  txtRecordsContain,
  verificationRecordName,
  verificationRecordValue,
} from './team-domains.js';

export type TxtResolver = (name: string) => Promise<string[][]>;
export const TXT_RESOLVER = Symbol('TXT_RESOLVER');

/**
 * Audit H-01: a team proves it owns an email domain before its SCIM token may
 * provision addresses on it. Owners and admins add a domain, publish the TXT
 * record shown, and ask PolyCost to check it.
 */
@Injectable()
export class TeamDomainsService {
  private readonly resolve: TxtResolver;

  constructor(
    private readonly repository: ApiDatabaseRepository,
    private readonly configService: ConfigService<AppConfig, true>,
    @Optional() @Inject(TXT_RESOLVER) resolver?: TxtResolver,
  ) {
    this.resolve = resolver ?? resolveTxt;
  }

  async list(teamId: string, identity: AuthIdentity): Promise<TeamDomainRecord[]> {
    await this.requireTeamAdmin(identity, teamId);
    return (await this.repository.listTeamDomains(teamId)).map(toRecord);
  }

  async add(teamId: string, body: unknown, identity: AuthIdentity): Promise<TeamDomainRecord> {
    await this.requireTeamAdmin(identity, teamId);
    const raw =
      body && typeof body === 'object' && typeof (body as { domain?: unknown }).domain === 'string'
        ? (body as { domain: string }).domain
        : '';
    const normalized = normalizeDomain(raw, { allowReserved: this.developmentAuto() });
    if ('problem' in normalized) {
      throw new ApiValidationError(
        normalized.problem === 'consumer'
          ? 'Shared mailbox domains such as gmail.com cannot belong to a team'
          : 'Enter a domain name such as acme.com',
        [{ field: 'domain', issue: normalized.problem === 'consumer' ? 'not ownable' : 'invalid' }],
      );
    }

    const row = await this.repository.createTeamDomain({
      teamId,
      domain: normalized.domain,
      verificationToken: randomBytes(16).toString('hex'),
      createdByAccountId: identity.accountId,
    });
    if (!row) {
      throw new ApiConflictError(`${normalized.domain} is already on this team`);
    }
    return toRecord(row);
  }

  /** Looks the TXT record up now; verified when it is there. */
  async verify(
    teamId: string,
    domainId: string,
    identity: AuthIdentity,
  ): Promise<TeamDomainRecord> {
    await this.requireTeamAdmin(identity, teamId);
    const row = await this.repository.getTeamDomain(teamId, domainId);
    if (!row) {
      throw new ApiNotFoundError('Domain was not found');
    }
    if (row.status === 'verified') {
      return toRecord(row);
    }

    if (!this.developmentAuto()) {
      const name = verificationRecordName(row.domain);
      const records = await this.resolve(name).catch(() => [] as string[][]);
      if (!txtRecordsContain(records, verificationRecordValue(row.verification_token))) {
        await this.repository.recordTeamDomainCheck(teamId, domainId);
        throw new ApiValidationError(
          `The TXT record was not found at ${name} yet. DNS changes can take a while to appear; try again later.`,
          [{ field: 'domain', issue: 'verification record not found' }],
        );
      }
    }

    const verified = await this.repository.markTeamDomainVerified({
      teamId,
      domainId,
      actorAccountId: identity.accountId,
    });
    if (verified === 'taken') {
      throw new ApiConflictError(`${row.domain} is already verified by another team`);
    }
    if (!verified) {
      throw new ApiNotFoundError('Domain was not found');
    }
    return toRecord(verified);
  }

  async remove(
    teamId: string,
    domainId: string,
    identity: AuthIdentity,
  ): Promise<TeamDomainRecord> {
    await this.requireTeamAdmin(identity, teamId);
    const removed = await this.repository.deleteTeamDomain({
      teamId,
      domainId,
      actorAccountId: identity.accountId,
    });
    if (!removed) {
      throw new ApiNotFoundError('Domain was not found');
    }
    return toRecord(removed);
  }

  private developmentAuto(): boolean {
    return (
      this.configService.get('DOMAIN_VERIFICATION_MODE', { infer: true }) === 'development-auto'
    );
  }

  private async requireTeamAdmin(identity: AuthIdentity, teamId: string): Promise<void> {
    const membership =
      identity.teamId === teamId && identity.role
        ? { role: identity.role }
        : await this.repository.getTeamMembership({ accountId: identity.accountId, teamId });

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      throw new ApiForbiddenError('Team admin access is required');
    }
  }
}

function iso(value: Date | null): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

export function toRecord(row: TeamDomainRow): TeamDomainRecord {
  const lastCheckedAt = iso(row.last_checked_at);
  const verifiedAt = iso(row.verified_at);
  return {
    id: row.id,
    teamId: row.team_id,
    domain: row.domain,
    status: row.status,
    verificationRecord: {
      type: 'TXT',
      name: verificationRecordName(row.domain),
      value: verificationRecordValue(row.verification_token),
    },
    createdAt: new Date(row.created_at).toISOString(),
    ...(lastCheckedAt ? { lastCheckedAt } : {}),
    ...(verifiedAt ? { verifiedAt } : {}),
  };
}
