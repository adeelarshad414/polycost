import { act, fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { PolyCostClient } from '../../api-client';
import { PolyCostApiError } from '../../api-client';
import type { TeamDomainRecord } from '../../types';
import { TeamDomainsPanel } from './TeamDomainsPanel';

// Audit H-01: owners and admins prove domain ownership before SCIM provisions it.

function record(overrides: Partial<TeamDomainRecord> = {}): TeamDomainRecord {
  return {
    id: 'd1',
    teamId: 't1',
    domain: 'acme.com',
    status: 'pending',
    verificationRecord: {
      type: 'TXT',
      name: '_polycost-verification.acme.com',
      value: 'polycost-verification=abc',
    },
    createdAt: '2026-10-27T00:00:00Z',
    ...overrides,
  };
}

function client(overrides: Partial<PolyCostClient> = {}) {
  return {
    listTeamDomains: jest.fn(async () => [record()]),
    addTeamDomain: jest.fn(async (_t: string, domain: string) =>
      record({ id: 'd2', domain, verificationRecord: { ...record().verificationRecord } }),
    ),
    verifyTeamDomain: jest.fn(async () =>
      record({ status: 'verified', verifiedAt: '2026-10-27T01:00:00Z' }),
    ),
    removeTeamDomain: jest.fn(async () => record()),
    ...overrides,
  } as unknown as PolyCostClient;
}

describe('TeamDomainsPanel', () => {
  it('shows a pending domain with the TXT record to publish', async () => {
    const { container } = render(
      <TeamDomainsPanel
        client={client()}
        teamId="t1"
        token="cookie-session"
        onNotice={jest.fn()}
      />,
    );

    expect(await screen.findByText('acme.com')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('_polycost-verification.acme.com')).toBeTruthy();
    expect(screen.getByText('polycost-verification=abc')).toBeTruthy();
    expect(screen.getByText('0 verified · 1 pending')).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('adds, verifies and removes a domain', async () => {
    const api = client();
    const onNotice = jest.fn();
    render(<TeamDomainsPanel client={api} teamId="t1" token="tok" onNotice={onNotice} />);
    await screen.findByText('acme.com');

    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: ' beta.io ' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add domain'));
    });
    expect(api.addTeamDomain).toHaveBeenCalledWith('t1', 'beta.io', 'tok');
    expect(screen.getByText('beta.io')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText('Verify acme.com'));
    });
    expect(api.verifyTeamDomain).toHaveBeenCalledWith('t1', 'd1', 'tok');
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(onNotice).toHaveBeenLastCalledWith(
      'acme.com is verified. SCIM can now provision its users.',
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Remove acme.com'));
    });
    expect(api.removeTeamDomain).toHaveBeenCalledWith('t1', 'd1', 'tok');
    expect(screen.queryByText('acme.com')).toBeNull();
  });

  it('explains a failed check and keeps the domain pending', async () => {
    const api = client({
      verifyTeamDomain: jest.fn(async () => {
        throw new PolyCostApiError(400, 'VALIDATION_ERROR', 'The TXT record was not found yet.');
      }),
    });
    render(<TeamDomainsPanel client={api} teamId="t1" token="tok" onNotice={jest.fn()} />);
    const verifyButton = await screen.findByText('Verify acme.com');

    await act(async () => {
      fireEvent.click(verifyButton);
    });

    expect(screen.getByRole('alert').textContent).toContain('TXT record was not found');
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('starts empty with a hint', async () => {
    render(
      <TeamDomainsPanel
        client={client({ listTeamDomains: jest.fn(async () => []) })}
        teamId="t1"
        token="tok"
        onNotice={jest.fn()}
      />,
    );
    expect(await screen.findByText(/No domains yet/)).toBeTruthy();
  });
});
