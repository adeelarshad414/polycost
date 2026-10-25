import { useEffect, useState } from 'react';
import { formatApiError, type PolyCostClient } from '../../api-client';
import { Card, EmptyState, Skeleton } from '../../components/ui';
import { comparisonPath, openComparisonRoute } from '../../lib/comparison-route';
import { formatCurrency } from '../../lib/format';
import type { TeamComparisonSummary } from '../../types';

const PROVIDER_NAME: Record<string, string> = { aws: 'AWS', azure: 'Azure', gcp: 'GCP' };

/**
 * ADR-0001 §3.7: the active team's comparisons, kept server-side, so a team
 * member can open what a colleague compared. Local history stays per-browser;
 * this list is the shared one.
 */
export function TeamComparisonsCard({
  client,
  teamId,
  teamName,
}: {
  client: PolyCostClient;
  teamId: string;
  teamName: string;
}) {
  const [rows, setRows] = useState<TeamComparisonSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    client
      .listTeamComparisons(20)
      .then((next) => {
        if (live) setRows(next);
      })
      .catch((listError) => {
        if (live) setError(formatApiError(listError));
      });
    return () => {
      live = false;
    };
  }, [client, teamId]);

  return (
    <Card eyebrow="Team comparisons" title={`Saved in ${teamName}`}>
      {error ? (
        <p className="team-comparisons-error" role="alert">
          {error}
        </p>
      ) : rows === null ? (
        <Skeleton lines={3} label="Loading team comparisons" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No team comparisons yet"
          description="Comparisons you run while signed in are saved to this team, and every member can open them here."
        />
      ) : (
        <ol className="team-comparisons">
          {rows.map((row) => (
            <li key={row.comparisonId}>
              <a
                href={comparisonPath(row.comparisonId)}
                onClick={(event) => {
                  event.preventDefault();
                  openComparisonRoute(row.comparisonId);
                }}
              >
                {comparisonTitle(row)}
              </a>
              <span>
                {comparisonDetail(row)} ·{' '}
                {new Date(row.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function comparisonTitle(row: TeamComparisonSummary): string {
  if (row.workloadName) return row.workloadName;
  if (row.workloadType) {
    const words = row.workloadType.replace(/[_-]+/g, ' ');
    return `${words.charAt(0).toUpperCase()}${words.slice(1)} workload`;
  }
  return 'Comparison';
}

export function comparisonDetail(row: TeamComparisonSummary): string {
  const provider = row.cheapestProviderId
    ? (PROVIDER_NAME[row.cheapestProviderId] ?? row.cheapestProviderId)
    : undefined;
  if (provider && row.cheapestMonthlyUsd !== null) {
    return `${provider} lowest at ${formatCurrency(row.cheapestMonthlyUsd)}/mo`;
  }
  return `${row.providerCount} provider${row.providerCount === 1 ? '' : 's'} compared`;
}
