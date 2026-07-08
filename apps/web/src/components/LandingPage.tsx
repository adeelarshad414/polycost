import { useState } from 'react';
import { POLYCOST_HERO_SUBHEAD, POLYCOST_TAGLINE } from '../brand';
import { AccentChoice, ResolvedTheme, ThemeChoice } from '../theme';
import { ComparisonProviderResult, ComparisonResult, PROVIDER_ORDER, ProviderId } from '../types';
import { WorkloadFormState } from '../workload';
import { Button } from './Button';
import { ThemeSwitcher } from './ThemeSwitcher';

interface LandingPageProps {
  comparison: ComparisonResult | null;
  form: WorkloadFormState;
  resolvedTheme: ResolvedTheme;
  themeChoice: ThemeChoice;
  accentChoice: AccentChoice;
  onStartComparing: () => void;
  onThemeChange: (choice: ThemeChoice) => void;
  onAccentChange: (choice: AccentChoice) => void;
  onViewDemo: () => void;
  onSignIn: () => void;
}

interface LandingProviderCard {
  providerId: ProviderId;
  label: string;
  region: string;
  total?: number;
  deltaFromLowest?: number;
  isBestValue: boolean;
  isUnavailable: boolean;
}

const NAV_LINKS = [
  { href: '#requirements', label: 'Compare' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#docs', label: 'Docs' },
];

export function LandingPage({
  comparison,
  form,
  resolvedTheme,
  themeChoice,
  accentChoice,
  onStartComparing,
  onThemeChange,
  onAccentChange,
  onViewDemo,
  onSignIn,
}: LandingPageProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const cards = landingProviderCards(comparison, form);

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <section className="landing-page" aria-labelledby="page-title">
      <header className="landing-nav">
        <a className="landing-logo-link" href="#top" aria-label="PolyCost home">
          <img src={logoSrcForTheme(resolvedTheme)} alt="PolyCost" />
        </a>

        <nav
          className={isMenuOpen ? 'landing-links is-open' : 'landing-links'}
          id="landing-menu"
          aria-label="Primary"
        >
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={closeMenu}>
              {link.label}
            </a>
          ))}
          <ThemeSwitcher
            className="landing-theme-switcher"
            themeChoice={themeChoice}
            accentChoice={accentChoice}
            onThemeChange={onThemeChange}
            onAccentChange={onAccentChange}
          />
        </nav>

        <div className="landing-actions">
          <Button
            type="button"
            variant="icon"
            size="compact"
            className="landing-menu-button"
            aria-label="Toggle navigation menu"
            aria-expanded={isMenuOpen}
            aria-controls="landing-menu"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <MenuIcon />
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="landing-auth-button"
            onClick={onSignIn}
          >
            <SignInIcon />
            <span className="landing-action-text">Sign in</span>
          </Button>
          <Button
            type="button"
            variant="primary"
            className="landing-start-button"
            onClick={onStartComparing}
          >
            <SparkIcon />
            <span className="landing-action-text">Get started</span>
          </Button>
        </div>
      </header>

      <div className="landing-hero" id="top">
        <div className="landing-status-pill">
          <span aria-hidden="true" />
          Now comparing 40+ regions
        </div>
        <h1 id="page-title" aria-label={POLYCOST_TAGLINE}>
          <span>Multi-cloud cost clarity,</span>
          <span>in one place.</span>
        </h1>
        <p aria-label={POLYCOST_HERO_SUBHEAD}>
          <span>Compare AWS, Azure, and GCP costs —</span>
          <span>instantly.</span>
        </p>
        <div className="landing-hero-actions">
          <Button type="button" variant="primary" onClick={onStartComparing}>
            Start comparing
          </Button>
          <Button type="button" variant="secondary" onClick={onViewDemo}>
            View live demo
          </Button>
        </div>
      </div>

      <section className="landing-comparison" id="pricing" aria-label="Live cloud comparison">
        {cards.map((card) => (
          <LandingComparisonCard
            key={card.providerId}
            card={card}
            hasComparison={Boolean(comparison)}
          />
        ))}
      </section>
    </section>
  );
}

function logoSrcForTheme(resolvedTheme: ResolvedTheme): string {
  return resolvedTheme === 'dark'
    ? '/brand/polycost-lockup-dark.svg'
    : '/brand/polycost-lockup.svg';
}

function LandingComparisonCard({
  card,
  hasComparison,
}: {
  card: LandingProviderCard;
  hasComparison: boolean;
}) {
  return (
    <article
      className={[
        'landing-provider-card',
        `landing-provider-card-${card.providerId}`,
        card.isBestValue ? 'is-best-value' : undefined,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-busy={!hasComparison}
      aria-label={landingCardAccessibleLabel(card)}
      tabIndex={0}
    >
      {card.isBestValue ? <span className="landing-best-badge">Best value</span> : null}
      <div className="landing-card-header">
        <span className={`landing-provider-label landing-provider-label-${card.providerId}`}>
          {card.label} / {card.region}
        </span>
      </div>
      <div className="landing-price">
        {card.total !== undefined ? (
          <>
            {formatCurrency(card.total)}
            <span>/mo</span>
          </>
        ) : (
          <ProviderEstimateLoader providerId={card.providerId} label="Estimating" />
        )}
      </div>
      <p className={deltaClassName(card)}>
        {card.total !== undefined
          ? deltaText(card)
          : card.isUnavailable
            ? 'Pricing unavailable for this provider.'
            : 'Run a workload comparison below.'}
      </p>
    </article>
  );
}

function ProviderEstimateLoader({ providerId, label }: { providerId: ProviderId; label: string }) {
  return (
    <span
      className={`provider-pending provider-pending-${providerId}`}
      aria-label={`${providerLabel(providerId)} estimate pending`}
    >
      <span>{label}</span>
      <span className="provider-pending-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

function landingCardAccessibleLabel(card: LandingProviderCard): string {
  if (card.total === undefined) {
    const state = card.isUnavailable
      ? 'Pricing unavailable for this provider.'
      : 'Run a workload comparison below.';
    return `${card.label} cost summary for ${card.region}. Pricing pending. ${state}`;
  }

  return `${card.label} cost summary for ${card.region}. ${formatCurrency(card.total)} per month. ${deltaText(card)}`;
}

function landingProviderCards(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): LandingProviderCard[] {
  const providerResults = new Map<ProviderId, ComparisonProviderResult>(
    comparison?.providers.map((provider) => [provider.providerId, provider]) ?? [],
  );
  const availableTotals = PROVIDER_ORDER.map(
    (providerId) => providerResults.get(providerId)?.totals.monthly,
  ).filter((total): total is number => total !== undefined);
  const lowestTotal = availableTotals.length > 0 ? Math.min(...availableTotals) : undefined;
  const region = form.regionPreference.trim() || 'default region';

  return PROVIDER_ORDER.map((providerId) => {
    const provider = providerResults.get(providerId);
    const total = provider?.totals.monthly;

    return {
      providerId,
      label: providerLabel(providerId),
      region,
      total,
      deltaFromLowest:
        total !== undefined && lowestTotal !== undefined
          ? roundCurrency(total - lowestTotal)
          : undefined,
      isBestValue: Boolean(
        comparison && comparison.cheapestProviderId === providerId && total !== undefined,
      ),
      isUnavailable: Boolean(comparison && !provider),
    };
  });
}

function deltaClassName(card: LandingProviderCard): string {
  if (card.deltaFromLowest === undefined || card.deltaFromLowest === 0) {
    return 'landing-delta landing-delta-down';
  }

  return 'landing-delta landing-delta-up';
}

function deltaText(card: LandingProviderCard): string {
  if (card.deltaFromLowest === undefined || card.deltaFromLowest === 0) {
    return '↓ Lowest monthly estimate';
  }

  return `↑ ${formatCurrency(card.deltaFromLowest)} over best value`;
}

function providerLabel(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'AWS';
    case 'azure':
      return 'Azure';
    case 'gcp':
      return 'GCP';
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="landing-button-icon">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function SignInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="landing-button-icon">
      <path d="M10 6h8v12h-8M4 12h10M11 9l3 3-3 3" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="landing-button-icon">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" />
    </svg>
  );
}
