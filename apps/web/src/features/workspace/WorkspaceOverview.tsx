import { VarianceChart } from '../../charts';
import { Button } from '../../components/Button';
import { Card, EmptyState, KpiTile } from '../../components/ui';
import { formatCurrency, formatPercent } from '../../lib/format';
import type {
  AuthMeResponse,
  InvoiceReconciliationRecord,
  ProviderId,
  TeamAuditEventRecord,
  TeamInvitationRecord,
  TeamMemberRecord,
} from '../../types';

const PROVIDER_NAME = new Map<ProviderId, string>([
  ['aws', 'AWS'],
  ['azure', 'Azure'],
  ['gcp', 'GCP'],
]);

const STATUS_COPY = new Map<InvoiceReconciliationRecord['status'], string>([
  ['matched', 'Matches the estimate'],
  ['variance-warning', 'Worth a look'],
  ['variance-critical', 'Needs review'],
  ['unmatched', 'Could not be matched'],
]);

/**
 * Workspace overview (UI-5): the signed-in landing view. Team, pending invites,
 * the latest estimate-vs-invoice reconciliation on a diverging chart, and the
 * most recent audit activity, with one clear next step when data is missing.
 */
export function WorkspaceOverview({
  session,
  members,
  invitations,
  auditEvents,
  reconciliation,
  onNavigate,
}: {
  session: AuthMeResponse | null;
  members: TeamMemberRecord[];
  invitations: TeamInvitationRecord[];
  auditEvents: TeamAuditEventRecord[];
  reconciliation: InvoiceReconciliationRecord | null;
  onNavigate: (section: 'account' | 'team' | 'reconciliation') => void;
}) {
  if (!session) {
    return (
      <EmptyState
        title="Sign in to see your team's workspace"
        description="Team members, invoice reconciliation and the audit trail appear here once you are signed in."
        action={
          <Button type="button" variant="primary" onClick={() => onNavigate('account')}>
            Go to sign in
          </Button>
        }
      />
    );
  }

  const pendingInvites = invitations.filter((invitation) => invitation.status === 'pending');
  const providerName = reconciliation
    ? (PROVIDER_NAME.get(reconciliation.provider) ?? reconciliation.provider)
    : undefined;
  const varianceTone =
    reconciliation?.status === 'variance-critical' || reconciliation?.status === 'unmatched'
      ? 'attention'
      : reconciliation?.status === 'matched'
        ? 'positive'
        : 'neutral';

  return (
    <div className="workspace-overview">
      <div className="workspace-kpis" aria-label="Workspace figures">
        <KpiTile
          label="Team"
          value={session.activeTeam?.name ?? 'No team yet'}
          detail={
            session.activeTeam
              ? `${members.length} member${members.length === 1 ? '' : 's'} · you are ${session.activeTeam.role}`
              : 'Create or join a team to share comparisons'
          }
        />
        <KpiTile
          label="Pending invites"
          value={String(pendingInvites.length)}
          detail={
            pendingInvites.length > 0
              ? `Oldest expires ${new Date(
                  Math.min(...pendingInvites.map((invite) => Date.parse(invite.expiresAt))),
                ).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : 'Nobody is waiting to join'
          }
          tone={pendingInvites.length > 0 ? 'attention' : 'neutral'}
        />
        <KpiTile
          label="Latest invoice"
          value={reconciliation ? formatCurrency(reconciliation.invoicedTotalUsd) : '—'}
          detail={
            reconciliation
              ? `${providerName} · estimated ${formatCurrency(reconciliation.estimatedTotalUsd)}`
              : 'No bill imported yet'
          }
          providerId={reconciliation?.provider}
        />
        <KpiTile
          label="Variance"
          value={
            reconciliation
              ? `${reconciliation.varianceUsd >= 0 ? '+' : '−'}${formatPercent(
                  Math.abs(reconciliation.variancePercent),
                )}`
              : '—'
          }
          detail={
            reconciliation ? (STATUS_COPY.get(reconciliation.status) ?? reconciliation.status) : '—'
          }
          tone={varianceTone}
        />
      </div>

      <div className="workspace-overview-grid">
        {reconciliation ? (
          <VarianceChart
            rows={[
              {
                key: reconciliation.id,
                label: providerName ?? reconciliation.provider,
                estimate: reconciliation.estimatedTotalUsd,
                actual: reconciliation.invoicedTotalUsd,
              },
            ]}
          />
        ) : (
          <Card eyebrow="Estimate vs invoice" title="Compare a real bill with the estimate">
            <EmptyState
              title="No bill imported yet"
              description="Import an AWS CUR, Azure Cost Management or GCP billing export to see how the invoice compares."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onNavigate('reconciliation')}
                >
                  Import a bill
                </Button>
              }
            />
          </Card>
        )}

        <Card
          eyebrow="Audit trail"
          title="Recent activity"
          actions={
            <Button type="button" variant="link" onClick={() => onNavigate('team')}>
              View team
            </Button>
          }
        >
          {auditEvents.length > 0 ? (
            <ol className="workspace-activity">
              {auditEvents.slice(0, 5).map((event) => (
                <li key={event.id}>
                  <strong>{humanizeAction(event.action)}</strong>
                  <span>
                    {event.actorEmail ?? 'System'} ·{' '}
                    {new Date(event.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="workspace-activity-empty">No team activity recorded yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

/** "team.member.role_changed" reads as "Team member role changed". */
export function humanizeAction(action: string): string {
  const words = action.replace(/[._-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
