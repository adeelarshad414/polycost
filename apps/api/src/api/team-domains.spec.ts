import { describe, it, expect, jest } from '@jest/globals';
import type { TeamDomainRow } from './api-database.repository.js';
import type { AuthIdentity } from './auth.types.js';
import {
  emailDomain,
  normalizeDomain,
  txtRecordsContain,
  verificationRecordName,
  verificationRecordValue,
} from './team-domains.js';
import { TeamDomainsService, toRecord } from './team-domains.service.js';

// Audit H-01: a team proves it owns an email domain before SCIM may provision it.

const TEAM = '22222222-2222-4222-8222-222222222222';
const DOMAIN_ID = '55555555-5555-4555-8555-555555555555';
const admin = { accountId: 'acct', teamId: TEAM, role: 'admin' } as AuthIdentity;
const member = { accountId: 'acct', teamId: TEAM, role: 'member' } as AuthIdentity;

function row(overrides: Partial<TeamDomainRow> = {}): TeamDomainRow {
  return {
    id: DOMAIN_ID,
    team_id: TEAM,
    domain: 'acme.com',
    verification_token: 'abc123',
    status: 'pending',
    created_at: new Date('2026-10-27T00:00:00Z'),
    last_checked_at: null,
    verified_at: null,
    ...overrides,
  };
}

describe('domain helpers', () => {
  it.each([
    ['  @Acme.COM. ', 'acme.com'],
    ['mail.acme.co.uk', 'mail.acme.co.uk'],
    ['bücher.de', 'xn--bcher-kva.de'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeDomain(input)).toEqual({ domain: expected });
  });

  it.each([
    '',
    'acme',
    'acme..com',
    '-acme.com',
    '10.0.0.1',
    'a'.repeat(250) + '.com',
    'ac me.com',
  ])('rejects %j', (input) => {
    expect(normalizeDomain(input)).toEqual({ problem: 'invalid' });
  });

  it('refuses shared mailbox domains, and reserved example domains outside development', () => {
    expect(normalizeDomain('gmail.com')).toEqual({ problem: 'consumer' });
    expect(normalizeDomain('example.com')).toEqual({ problem: 'consumer' });
    expect(normalizeDomain('example.com', { allowReserved: true })).toEqual({
      domain: 'example.com',
    });
    expect(normalizeDomain('gmail.com', { allowReserved: true })).toEqual({ problem: 'consumer' });
  });

  it('reads the domain of an email address', () => {
    expect(emailDomain('Jane.Doe@Acme.com')).toBe('acme.com');
    expect(emailDomain('no-at-sign')).toBeUndefined();
  });

  it('matches the TXT record across DNS string chunks', () => {
    const value = verificationRecordValue('abc123');
    expect(verificationRecordName('acme.com')).toBe('_polycost-verification.acme.com');
    expect(txtRecordsContain([['v=spf1 -all'], ['polycost-verif', 'ication=abc123']], value)).toBe(
      true,
    );
    expect(txtRecordsContain([['polycost-verification=other']], value)).toBe(false);
  });
});

describe('TeamDomainsService', () => {
  function build(
    options: {
      mode?: 'dns' | 'development-auto';
      txt?: string[][] | Error;
      existing?: TeamDomainRow;
      verified?: TeamDomainRow | 'taken';
      membershipRole?: string;
    } = {},
  ) {
    const repository = {
      listTeamDomains: jest.fn(async () => [row()]),
      getTeamDomain: jest.fn(async () => options.existing ?? row()),
      createTeamDomain: jest.fn(async (input: { domain: string }) =>
        input.domain === 'taken.com' ? undefined : row({ domain: input.domain }),
      ),
      recordTeamDomainCheck: jest.fn<(teamId: string, domainId: string) => Promise<void>>(
        async () => undefined,
      ),
      markTeamDomainVerified: jest.fn(
        async () =>
          options.verified ??
          row({ status: 'verified', verified_at: new Date('2026-10-27T01:00:00Z') }),
      ),
      deleteTeamDomain: jest.fn(async () => row()),
      getTeamMembership: jest.fn(async () =>
        options.membershipRole ? { role: options.membershipRole } : undefined,
      ),
    };
    const config = { get: () => options.mode ?? 'dns' };
    const resolver = jest.fn<(name: string) => Promise<string[][]>>(async () => {
      if (options.txt instanceof Error) throw options.txt;
      return options.txt ?? [];
    });
    return {
      service: new TeamDomainsService(repository as never, config as never, resolver),
      repository,
      resolver,
    };
  }

  it('adds a normalised domain with its TXT record', async () => {
    const { service, repository } = build();
    const added = await service.add(TEAM, { domain: 'ACME.com' }, admin);

    expect(added.domain).toBe('acme.com');
    expect(added.verificationRecord.name).toBe('_polycost-verification.acme.com');
    const [input] = repository.createTeamDomain.mock.calls[0] as unknown as [
      { verificationToken: string },
    ];
    expect(input.verificationToken).toMatch(/^[0-9a-f]{32}$/);
  });

  it.each([
    [{ domain: 'gmail.com' }, 'Shared mailbox domains'],
    [{ domain: 'not a domain' }, 'Enter a domain name'],
    [{}, 'Enter a domain name'],
  ])('refuses %j', async (body, message) => {
    await expect(build().service.add(TEAM, body, admin)).rejects.toThrow(message);
  });

  it('refuses a domain the team already has', async () => {
    await expect(build().service.add(TEAM, { domain: 'taken.com' }, admin)).rejects.toThrow(
      'already on this team',
    );
  });

  it('verifies when the TXT record is published', async () => {
    const { service, resolver } = build({ txt: [['polycost-verification=abc123']] });
    await expect(service.verify(TEAM, DOMAIN_ID, admin)).resolves.toMatchObject({
      status: 'verified',
    });
    expect(resolver).toHaveBeenCalledWith('_polycost-verification.acme.com');
  });

  it.each([
    ['a different value', [['polycost-verification=wrong']]],
    ['no record', new Error('ENOTFOUND')],
  ])('stays pending with %s, and records the check', async (_label, txt) => {
    const { service, repository } = build({ txt });
    await expect(service.verify(TEAM, DOMAIN_ID, admin)).rejects.toThrow(
      'The TXT record was not found at _polycost-verification.acme.com',
    );
    expect(repository.recordTeamDomainCheck).toHaveBeenCalledWith(TEAM, DOMAIN_ID);
    expect(repository.markTeamDomainVerified).not.toHaveBeenCalled();
  });

  it('skips DNS only in development-auto mode', async () => {
    const { service, resolver } = build({ mode: 'development-auto' });
    await expect(service.verify(TEAM, DOMAIN_ID, admin)).resolves.toMatchObject({
      status: 'verified',
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('refuses a domain another team holds verified', async () => {
    const { service } = build({ txt: [['polycost-verification=abc123']], verified: 'taken' });
    await expect(service.verify(TEAM, DOMAIN_ID, admin)).rejects.toThrow(
      'already verified by another team',
    );
  });

  it('needs an owner or admin of that team', async () => {
    await expect(build().service.list(TEAM, member)).rejects.toThrow('Team admin access');
    const otherTeam = { accountId: 'acct', teamId: 'other', role: 'owner' } as AuthIdentity;
    await expect(build().service.remove(TEAM, DOMAIN_ID, otherTeam)).rejects.toThrow(
      'Team admin access',
    );
    await expect(
      build({ membershipRole: 'owner' }).service.remove(TEAM, DOMAIN_ID, otherTeam),
    ).resolves.toMatchObject({ domain: 'acme.com' });
  });

  it('maps rows to records with optional timestamps', () => {
    expect(toRecord(row())).not.toHaveProperty('verifiedAt');
    expect(
      toRecord(row({ status: 'verified', verified_at: new Date('2026-10-27T01:00:00Z') })),
    ).toMatchObject({ verifiedAt: '2026-10-27T01:00:00.000Z' });
  });
});
