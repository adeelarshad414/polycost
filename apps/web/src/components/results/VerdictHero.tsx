import type { ReactNode } from 'react';
import { useCountUp } from '../../hooks/useCountUp';
import { formatCurrency, formatPercent } from '../../lib/format';
import type { ComparisonResult, DataHealthResponse, ProviderId } from '../../types';
import { Badge, KpiTile, ProvenancePill } from '../ui';

const PROVIDER_NAME = new Map<ProviderId, string>([
  ['aws', 'AWS'],
  ['azure', 'Azure'],
  ['gcp', 'GCP'],
]);

function providerName(providerId: ProviderId): string {
  return PROVIDER_NAME.get(providerId) ?? providerId;
}

interface RankedQuote {
  providerId: ProviderId;
  monthly: number;
  yearly: number;
}

/** Priced providers, cheapest first. Alternatives are ranked, never summed. */
export function rankedQuotes(comparison: ComparisonResult): RankedQuote[] {
  return comparison.providers
    .filter((provider) => Number.isFinite(provider.totals.monthly))
    .map((provider) => ({
      providerId: provider.providerId,
      monthly: provider.totals.monthly,
      yearly: provider.totals.yearly,
    }))
    .sort((a, b) => a.monthly - b.monthly);
}

/**
 * The answer, first (UI-4): which cloud is cheapest for this workload, by how
 * much against each alternative, and how far the figures can be trusted.
 */
export function VerdictHero({
  comparison,
  provenanceLabel,
  confidence,
  regionLabel,
  actions,
}: {
  comparison: ComparisonResult;
  /** Set when any price is seed or sample data rather than live pricing. */
  provenanceLabel?: string;
  confidence?: 'low' | 'medium' | 'high';
  regionLabel?: string;
  actions?: ReactNode;
}) {
  const ranked = rankedQuotes(comparison);
  const [lowest, ...others] = ranked;

  if (!lowest) {
    return (
      <section className="verdict-hero" aria-label="Comparison verdict">
        <h2 className="verdict-title">No provider could be priced for this workload.</h2>
      </section>
    );
  }

  return (
    <section className="verdict-hero" aria-label="Comparison verdict">
      <div className="verdict-copy">
        <span className="verdict-eyebrow">
          <i
            className={`ui-provider-dot ui-provider-dot-${lowest.providerId}`}
            aria-hidden="true"
          />
          Recommendation{regionLabel ? ` · ${regionLabel}` : ''}
        </span>
        <h2 className="verdict-title">
          {providerName(lowest.providerId)} is the lowest-cost option for this workload
        </h2>
        <p className="verdict-price">
          <AnimatedPrice value={lowest.monthly} />
          <span> / month</span>
        </p>
        <ul className="verdict-deltas" aria-label="Difference to the other providers">
          {others.map((other) => {
            const below = lowest.monthly > 0 ? (other.monthly - lowest.monthly) / other.monthly : 0;
            return (
              <li key={other.providerId}>
                <Badge tone="success">
                  {formatPercent(below * 100)} below {providerName(other.providerId)}
                </Badge>
              </li>
            );
          })}
        </ul>
        <div className="verdict-trust">
          {provenanceLabel ? (
            <ProvenancePill provenance="seed" label={provenanceLabel} />
          ) : (
            <ProvenancePill provenance="live" />
          )}
          {confidence ? <Badge tone="brand">{`${capitalize(confidence)} confidence`}</Badge> : null}
        </div>
      </div>
      {actions ? <div className="verdict-actions">{actions}</div> : null}
    </section>
  );
}

/** Four numbers a decision needs, beside the verdict. */
export function VerdictKpis({
  comparison,
  dataHealth,
}: {
  comparison: ComparisonResult;
  dataHealth: DataHealthResponse | null;
}) {
  const [lowest, runnerUp] = rankedQuotes(comparison);
  if (!lowest) {
    return null;
  }
  const annualSavings = runnerUp ? runnerUp.yearly - lowest.yearly : undefined;
  const freshness = dataHealth?.providers.find(
    (provider) => provider.providerId === lowest.providerId,
  );

  return (
    <div className="verdict-kpis" aria-label="Key figures">
      <KpiTile
        label="Monthly cost"
        value={formatCurrency(lowest.monthly)}
        detail={`${providerName(lowest.providerId)}, lowest of ${comparison.providers.length}`}
        providerId={lowest.providerId}
      />
      <KpiTile
        label="Annual cost"
        value={formatCurrency(lowest.yearly)}
        detail="At today's run rate"
      />
      <KpiTile
        label="Annual savings"
        tone={annualSavings !== undefined && annualSavings > 0 ? 'positive' : 'neutral'}
        value={annualSavings !== undefined ? formatCurrency(annualSavings) : '—'}
        detail={
          runnerUp
            ? `Versus the next-best option, ${providerName(runnerUp.providerId)}`
            : 'Needs a second priced provider'
        }
      />
      <KpiTile
        label="Pricing data"
        tone={freshness && freshness.freshness !== 'fresh' ? 'attention' : 'neutral'}
        value={
          freshness ? (FRESHNESS_LABEL.get(freshness.freshness) ?? freshness.freshness) : 'Unknown'
        }
        detail={
          freshness?.ageHours !== undefined
            ? freshness.freshness === 'failed'
              ? `Latest ${providerName(lowest.providerId)} sync failed; prices are ${ageText(freshness.ageHours)} old`
              : `${providerName(lowest.providerId)} prices updated ${ageText(freshness.ageHours)} ago`
            : 'Freshness not reported'
        }
      />
    </div>
  );
}

const FRESHNESS_LABEL = new Map<string, string>([
  ['fresh', 'Up to date'],
  ['stale', 'Needs refresh'],
  ['failed', 'Sync failed'],
  ['missing', 'Not available'],
]);

function ageText(hours: number): string {
  if (hours < 1) {
    return 'under an hour';
  }
  if (hours < 48) {
    const rounded = Math.round(hours);
    return `${rounded} hour${rounded === 1 ? '' : 's'}`;
  }
  return `${Math.round(hours / 24)} days`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The verdict price counts up once; assistive tech reads only the final figure. */
function AnimatedPrice({ value }: { value: number }) {
  const shown = useCountUp(value);
  return (
    <strong>
      <span aria-hidden="true">{formatCurrency(shown)}</span>
      <span className="sr-only">{formatCurrency(value)}</span>
    </strong>
  );
}
