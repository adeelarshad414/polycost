import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { PolyCostClient } from '../../api-client';
import { PolyCostApiError } from '../../api-client';
import { writeKeys } from '../../lib/write-keys';
import type { ResourceOwnership, TeamComparisonSummary } from '../../types';
import { OwnershipBar } from './OwnershipBar';
import { accessSummary, expiryLabel } from './ownership-copy';
import { TeamComparisonsCard, comparisonDetail, comparisonTitle } from './TeamComparisonsCard';

// ADR-0001 §3.7: the tenancy UI.

const ID = '33333333-3333-4333-8333-333333333333';
const DAY = 24 * 60 * 60 * 1000;

function ownership(overrides: Partial<ResourceOwnership> = {}): ResourceOwnership {
  return {
    owner: 'anonymous',
    teamId: null,
    teamName: null,
    expiresAt: new Date(Date.now() + 12 * DAY + 60_000).toISOString(),
    role: null,
    canChange: false,
    canClaim: false,
    ...overrides,
  };
}

function client(overrides: Partial<PolyCostClient> = {}): PolyCostClient {
  return {
    getComparisonOwnership: jest.fn(async () => ownership()),
    claimComparison: jest.fn(async () => ({ comparisonId: ID, teamId: 't1' })),
    listTeamComparisons: jest.fn(async () => []),
    ...overrides,
  } as unknown as PolyCostClient;
}

afterEach(() => {
  writeKeys.clear();
});

describe('ownership copy', () => {
  it('counts down to expiry in whole days', () => {
    const now = Date.parse('2026-10-25T12:00:00Z');
    expect(expiryLabel('2026-11-24T12:00:00Z', now)).toBe('Expires in 30 days');
    expect(expiryLabel('2026-10-26T13:00:00Z', now)).toBe('Expires in 1 day');
    expect(expiryLabel('2026-10-25T13:00:00Z', now)).toBe('Expires within a day');
    expect(expiryLabel('2026-10-25T11:00:00Z', now)).toBe('Expired');
    expect(expiryLabel(null, now)).toBe('Expiry set at the next retention sweep');
  });

  it('explains what this browser can do', () => {
    expect(accessSummary(ownership({ canChange: true }))).toContain('Only this browser');
    expect(accessSummary(ownership())).toContain('View only');
    expect(accessSummary(ownership({ owner: 'team', role: 'viewer', teamName: 'Acme' }))).toContain(
      'viewers can read',
    );
  });
});

describe('OwnershipBar', () => {
  it('shows the team and flags viewers as read-only', async () => {
    const api = client({
      getComparisonOwnership: jest.fn(async () =>
        ownership({
          owner: 'team',
          teamId: 't1',
          teamName: 'Acme',
          role: 'viewer',
          expiresAt: null,
        }),
      ),
    });
    const onOwnershipChange = jest.fn();
    const { container } = render(
      <OwnershipBar client={api} comparisonId={ID} onOwnershipChange={onOwnershipChange} />,
    );

    expect(await screen.findByText('Team: Acme')).toBeTruthy();
    expect(screen.getByText('Viewer')).toBeTruthy();
    expect(screen.queryByText('Copy edit key')).toBeNull();
    expect(onOwnershipChange).toHaveBeenCalledWith(expect.objectContaining({ canChange: false }));
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows the expiry and copies the edit key this browser holds', async () => {
    writeKeys.rememberComparison(ID, 'edit-key-1');
    const writeText = jest.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <OwnershipBar
        client={client({
          getComparisonOwnership: jest.fn(async () => ownership({ canChange: true })),
        })}
        comparisonId={ID}
      />,
    );

    expect(await screen.findByText('Anonymous')).toBeTruthy();
    expect(screen.getByText('Expires in 12 days')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText('Copy edit key'));
    });
    expect(writeText).toHaveBeenCalledWith('edit-key-1');
    expect(screen.getByText('Edit key copied')).toBeTruthy();
  });

  it('shows the key when the clipboard is unavailable', async () => {
    writeKeys.rememberComparison(ID, 'edit-key-2');
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn(async () => Promise.reject(new Error('denied'))) },
    });
    render(
      <OwnershipBar
        client={client({
          getComparisonOwnership: jest.fn(async () => ownership({ canChange: true })),
        })}
        comparisonId={ID}
      />,
    );

    const target = await screen.findByText('Copy edit key');
    await act(async () => {
      fireEvent.click(target);
    });
    expect(screen.getByText('edit-key-2')).toBeTruthy();
  });

  it('accepts a pasted edit key only when the API confirms it', async () => {
    // Initial load, then one answer per pasted key: wrong, then right.
    const getComparisonOwnership = jest
      .fn<Promise<ResourceOwnership>, []>()
      .mockResolvedValueOnce(ownership())
      .mockResolvedValueOnce(ownership())
      .mockResolvedValueOnce(ownership({ canChange: true }));
    const onNotice = jest.fn();
    render(
      <OwnershipBar
        client={client({ getComparisonOwnership })}
        comparisonId={ID}
        onNotice={onNotice}
      />,
    );

    const input = await screen.findByLabelText('Have the edit key?');
    fireEvent.change(input, { target: { value: 'wrong-key' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Use key'));
    });
    expect(screen.getByRole('alert').textContent).toContain('does not match');
    expect(writeKeys.comparisonKey(ID)).toBeUndefined();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'right-key' } });
      fireEvent.click(screen.getByText('Use key'));
    });
    expect(writeKeys.comparisonKey(ID)).toBe('right-key');
    expect(onNotice).toHaveBeenCalledWith('Edit key saved in this browser.');
  });

  it('moves anonymous data into the team', async () => {
    writeKeys.rememberComparison(ID, 'edit-key-3');
    const getComparisonOwnership = jest
      .fn<Promise<ResourceOwnership>, []>()
      .mockResolvedValueOnce(ownership({ canChange: true, canClaim: true }))
      .mockResolvedValueOnce(
        ownership({
          owner: 'team',
          teamId: 't1',
          teamName: 'Acme',
          role: 'member',
          canChange: true,
          expiresAt: null,
        }),
      );
    const api = client({ getComparisonOwnership });
    const onNotice = jest.fn();
    render(<OwnershipBar client={api} comparisonId={ID} onNotice={onNotice} />);

    const target = await screen.findByText('Move to team');
    await act(async () => {
      fireEvent.click(target);
    });

    expect(api.claimComparison).toHaveBeenCalledWith(ID);
    expect(screen.getByText('Team: Acme')).toBeTruthy();
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('no longer expires'));
  });

  it('reports a failed claim', async () => {
    writeKeys.rememberComparison(ID, 'edit-key-4');
    const api = client({
      getComparisonOwnership: jest.fn(async () => ownership({ canChange: true, canClaim: true })),
      claimComparison: jest.fn(async () => {
        throw new PolyCostApiError(403, 'FORBIDDEN', 'Viewers cannot claim data into a team');
      }),
    });
    render(<OwnershipBar client={api} comparisonId={ID} />);

    const target = await screen.findByText('Move to team');
    await act(async () => {
      fireEvent.click(target);
    });
    expect(screen.getByRole('alert').textContent).toContain('Viewers cannot claim');
  });

  it('renders nothing when ownership cannot be read', async () => {
    const onOwnershipChange = jest.fn();
    const { container } = render(
      <OwnershipBar
        client={client({
          getComparisonOwnership: jest.fn(async () => {
            throw new Error('offline');
          }),
        })}
        comparisonId={ID}
        onOwnershipChange={onOwnershipChange}
      />,
    );
    await waitFor(() => expect(onOwnershipChange).toHaveBeenCalledWith(null));
    expect(container.textContent).toBe('');
  });
});

describe('TeamComparisonsCard', () => {
  const rows: TeamComparisonSummary[] = [
    {
      comparisonId: ID,
      createdAt: '2026-10-20T10:00:00Z',
      pricingAsOf: '2026-10-20T00:00:00Z',
      workloadName: 'Checkout',
      workloadType: 'web_app',
      cheapestProviderId: 'gcp',
      cheapestMonthlyUsd: 1234,
      providerCount: 3,
    },
  ];

  it('lists team comparisons and opens one through the compare route', async () => {
    const popstate = jest.fn();
    window.addEventListener('popstate', popstate);
    const api = client({ listTeamComparisons: jest.fn(async () => rows) });
    const { container } = render(<TeamComparisonsCard client={api} teamId="t1" teamName="Acme" />);

    const link = await screen.findByText('Checkout');
    expect(link.getAttribute('href')).toBe(`/compare/${ID}`);
    expect(container.textContent).toContain('GCP lowest at');
    expect((await axe(container)).violations).toEqual([]);

    fireEvent.click(link);
    expect(window.location.pathname).toBe(`/compare/${ID}`);
    expect(popstate).toHaveBeenCalled();
    window.removeEventListener('popstate', popstate);
    window.history.replaceState(null, '', '/');
  });

  it('says how comparisons get here when the list is empty', async () => {
    render(<TeamComparisonsCard client={client()} teamId="t1" teamName="Acme" />);
    expect(await screen.findByText('No team comparisons yet')).toBeTruthy();
  });

  it('shows a load failure', async () => {
    render(
      <TeamComparisonsCard
        client={client({
          listTeamComparisons: jest.fn(async () => {
            throw new PolyCostApiError(403, 'FORBIDDEN', 'You are no longer a member of this team');
          }),
        })}
        teamId="t1"
        teamName="Acme"
      />,
    );
    expect((await screen.findByRole('alert')).textContent).toContain('no longer a member');
  });

  it('titles rows without a name and summarises without prices', () => {
    const bare = { ...rows[0], workloadName: null, cheapestMonthlyUsd: null, providerCount: 1 };
    expect(comparisonTitle(bare as TeamComparisonSummary)).toBe('Web app workload');
    expect(comparisonDetail(bare as TeamComparisonSummary)).toBe('1 provider compared');
    expect(comparisonTitle({ ...bare, workloadType: null } as TeamComparisonSummary)).toBe(
      'Comparison',
    );
  });
});
