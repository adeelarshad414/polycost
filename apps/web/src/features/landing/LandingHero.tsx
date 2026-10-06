import { ProviderComparisonBar } from '../../charts';
import { Button } from '../../components/Button';
import { CompareIcon, UploadIcon } from '../../components/icons';
import { Iris } from '../../components/brand/Iris';
import { Badge } from '../../components/ui';
import type { DataHealthResponse } from '../../types';

/**
 * Landing hero (UI-6). Leads with what the product returns: the headline and
 * two ways in on the left, a clearly labelled sample result on the right, and
 * proof points read from the live pricing-data endpoint rather than marketing
 * numbers.
 */
export function LandingHero({
  title,
  subtitle,
  dataHealth,
  onStart,
  onUploadDiagram,
}: {
  title: string;
  subtitle: string;
  dataHealth: DataHealthResponse | null;
  onStart: () => void;
  onUploadDiagram: () => void;
}) {
  const priceCount =
    dataHealth?.providers.reduce((sum, provider) => sum + provider.cache.currentRateRows, 0) ?? 0;
  const freshest = dataHealth?.providers
    .map((provider) => provider.ageHours)
    .filter((age): age is number => age !== undefined)
    .sort((a, b) => a - b)[0];

  return (
    <section className="home-hero" aria-labelledby="page-title">
      <div className="home-hero-copy">
        <div className="home-hero-intro">
          <Iris pose="welcome" size={96} className="home-hero-iris" />
          <span className="home-hero-eyebrow">Multi-cloud cost comparison</span>
        </div>
        <h1 id="page-title">{title}</h1>
        <p className="home-hero-subtitle">{subtitle}</p>
        <div className="home-hero-actions">
          <Button type="button" variant="primary" size="hero" onClick={onStart}>
            <CompareIcon />
            Start a comparison
          </Button>
          <Button type="button" variant="secondary" size="hero" onClick={onUploadDiagram}>
            <UploadIcon />
            Upload a diagram
          </Button>
        </div>
        <dl className="home-proof" aria-label="What PolyCost compares">
          <div>
            <dt>Clouds compared</dt>
            <dd>
              <span className="home-proof-value">3</span>
              <span className="home-proof-detail">AWS · Azure · GCP</span>
            </dd>
          </div>
          <div>
            <dt>Prices on file</dt>
            <dd>
              <span className="home-proof-value">
                {priceCount > 0 ? priceCount.toLocaleString('en-US') : '—'}
              </span>
              <span className="home-proof-detail">current catalog rows</span>
            </dd>
          </div>
          <div>
            <dt>Last refresh</dt>
            <dd>
              <span className="home-proof-value">
                {freshest === undefined ? '—' : ageLabel(freshest)}
              </span>
              <span className="home-proof-detail">most recent provider sync</span>
            </dd>
          </div>
        </dl>
      </div>

      <figure className="home-sample" aria-label="Sample result">
        <figcaption className="home-sample-caption">
          <Badge tone="estimate">Sample result</Badge>
          <span>Web app tier · 2 vCPU · 4 GB · US East</span>
        </figcaption>
        <div className="home-sample-verdict">
          <span className="home-sample-eyebrow">Recommendation</span>
          <strong>Azure is the lowest-cost option</strong>
          <span className="home-sample-price">
            $122.96 <small>/ month</small>
          </span>
          <span className="home-sample-deltas">
            <Badge tone="success">7.5% below AWS</Badge>
            <Badge tone="success">76% below GCP</Badge>
          </span>
        </div>
        <ProviderComparisonBar
          title="Provider comparison (sample)"
          headingLevel={2}
          quotes={[
            { providerId: 'aws', value: 132.94 },
            { providerId: 'azure', value: 122.96 },
            { providerId: 'gcp', value: 521.55 },
          ]}
        />
      </figure>
    </section>
  );
}

function ageLabel(hours: number): string {
  if (hours < 1) {
    return '<1 h';
  }
  if (hours < 48) {
    return `${Math.round(hours)} h`;
  }
  return `${Math.round(hours / 24)} d`;
}
