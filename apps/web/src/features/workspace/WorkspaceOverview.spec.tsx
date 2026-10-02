import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type {
  AuthMeResponse,
  InvoiceReconciliationRecord,
  TeamAuditEventRecord,
  TeamInvitationRecord,
  TeamMemberRecord,
} from '../../types';
import { WorkspaceOverview, humanizeAction } from './WorkspaceOverview';

const session = {
  account: { id: 'a1', email: 'owner@example.com' },
  activeTeam: { id: 't1', name: 'Platform Guild', role: 'owner' },
  teams: [],
  session: {},
} as unknown as AuthMeResponse;

const members = [{ accountId: 'a1' }, { accountId: 'a2' }] as unknown as TeamMemberRecord[];
const invitations = [
  { id: 'i1', status: 'pending', expiresAt: '2026-10-08T00:00:00Z' },
  { id: 'i2', status: 'accepted', expiresAt: '2026-10-01T00:00:00Z' },
] as unknown as TeamInvitationRecord[];
const audit = [
  {
    id: 'e1',
    action: 'team.member.role_changed',
    actorEmail: 'owner@example.com',
    createdAt: '2026-09-30T10:00:00Z',
  },
] as unknown as TeamAuditEventRecord[];

function reconciliation(
  status: InvoiceReconciliationRecord['status'],
  variance = 12,
): InvoiceReconciliationRecord {
  return {
    id: 'r1',
    provider: 'aws',
    estimatedTotalUsd: 100,
    invoicedTotalUsd: 100 + variance,
    varianceUsd: variance,
    variancePercent: variance,
    status,
  } as unknown as InvoiceReconciliationRecord;
}

describe('WorkspaceOverview', () => {
  it('asks signed-out visitors to sign in and routes them to the account tab', () => {
    const onNavigate = jest.fn();
    render(
      <WorkspaceOverview
        session={null}
        members={[]}
        invitations={[]}
        auditEvents={[]}
        reconciliation={null}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go to sign in' }));
    expect(onNavigate).toHaveBeenCalledWith('account');
  });

  it('summarises team, invites, the latest invoice and activity', async () => {
    const { container } = render(
      <WorkspaceOverview
        session={session}
        members={members}
        invitations={invitations}
        auditEvents={audit}
        reconciliation={reconciliation('variance-warning')}
        onNavigate={jest.fn()}
      />,
    );

    expect(screen.getByText('Platform Guild')).toBeTruthy();
    expect(screen.getByText('2 members · you are owner')).toBeTruthy();
    expect(screen.getByText('Oldest expires Oct 8')).toBeTruthy();
    expect(screen.getByText('$112.00')).toBeTruthy();
    expect(screen.getByText('+12%')).toBeTruthy();
    expect(screen.getByText('Worth a look')).toBeTruthy();
    expect(screen.getByText('Team member role changed')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Estimate vs invoice' })).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('handles no team, no bill, no activity, and each reconciliation status', () => {
    const onNavigate = jest.fn();
    const { rerender } = render(
      <WorkspaceOverview
        session={{ ...session, activeTeam: undefined } as AuthMeResponse}
        members={[]}
        invitations={[]}
        auditEvents={[]}
        reconciliation={null}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByText('No team yet')).toBeTruthy();
    expect(screen.getByText('Nobody is waiting to join')).toBeTruthy();
    expect(screen.getByText('No team activity recorded yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import a bill' }));
    expect(onNavigate).toHaveBeenCalledWith('reconciliation');
    fireEvent.click(screen.getByRole('button', { name: 'View team' }));
    expect(onNavigate).toHaveBeenCalledWith('team');

    for (const [status, copy] of [
      ['matched', 'Matches the estimate'],
      ['variance-critical', 'Needs review'],
      ['unmatched', 'Could not be matched'],
    ] as const) {
      rerender(
        <WorkspaceOverview
          session={session}
          members={members}
          invitations={[]}
          auditEvents={[]}
          reconciliation={reconciliation(status, -4)}
          onNavigate={onNavigate}
        />,
      );
      expect(screen.getByText(copy)).toBeTruthy();
      expect(screen.getByText('−4%')).toBeTruthy();
    }
  });

  it('humanises audit actions', () => {
    expect(humanizeAction('invoice-artifact.legal_hold')).toBe('Invoice artifact legal hold');
  });
});
