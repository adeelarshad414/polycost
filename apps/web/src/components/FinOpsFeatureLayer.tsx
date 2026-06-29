import { useMemo, useState } from 'react';
import { Button } from './Button';
import {
  ComparisonProviderResult,
  ComparisonResult,
  CostComponent,
  IntervalKey,
  PROVIDER_ORDER,
  PricingModelCost,
  PricingModelKey,
  ProviderId,
} from '../types';
import { providerMarkSrc } from '../provider-brand';

type CurrencyCode = 'USD' | 'PKR' | 'EUR' | 'GBP';

interface PricingModelOption {
  key: PricingModelKey;
  label: string;
  detail: string;
}

interface CurrencyOption {
  code: CurrencyCode;
  label: string;
  locale: string;
  available: boolean;
}

interface BreakdownPart {
  key: 'compute' | 'storage' | 'egress';
  label: string;
  total: number;
  percent: number;
  className: string;
}

interface EgressWarning {
  providerId: ProviderId;
  amount: number;
  percentOverLowest: number;
}

const PRICING_MODELS: PricingModelOption[] = [
  {
    key: 'on-demand',
    label: 'On-demand',
    detail: 'Current cached USD on-demand pricing.',
  },
  {
    key: 'reserved-1yr',
    label: '1yr reserved',
    detail: 'Uses cached one-year reservation, Savings Plan, or committed-use rows when present.',
  },
  {
    key: 'reserved-3yr',
    label: '3yr reserved',
    detail: 'Uses cached three-year reservation, Savings Plan, or committed-use rows when present.',
  },
];

const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'USD', label: 'USD', locale: 'en-US', available: true },
  { code: 'PKR', label: 'PKR', locale: 'en-PK', available: false },
  { code: 'EUR', label: 'EUR', locale: 'de-DE', available: false },
  { code: 'GBP', label: 'GBP', locale: 'en-GB', available: false },
];

const DISMISSED_ALERT_STORAGE_KEY = 'polycost-dismissed-budget-alerts';

export function FinOpsFeatureLayer({
  comparison,
  interval,
  isLoading = false,
}: {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
  isLoading?: boolean;
}) {
  const [pricingModel, setPricingModel] = useState<PricingModelKey>('on-demand');
  const [budgetThreshold, setBudgetThreshold] = useState('');
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>(() => readDismissedAlerts());
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>('USD');
  const currency =
    CURRENCY_OPTIONS.find((option) => option.code === currencyCode) ?? CURRENCY_OPTIONS[0];
  const providerResults = useMemo(
    () =>
      new Map<ProviderId, ComparisonProviderResult>(
        comparison?.providers.map((provider) => [provider.providerId, provider]) ?? [],
      ),
    [comparison],
  );
  const cheapestProvider = comparison
    ? (providerResults.get(comparison.cheapestProviderId) ?? comparison.providers[0])
    : undefined;
  const cheapestMonthly = cheapestProvider?.totals.monthly;
  const parsedThreshold = parseCurrencyInput(budgetThreshold);
  const budgetAlertId =
    comparison && parsedThreshold !== undefined && cheapestMonthly !== undefined
      ? `estimate-budget:${comparison.comparisonId}:${parsedThreshold}:${cheapestMonthly}`
      : undefined;
  const budgetAlertActive =
    budgetAlertId !== undefined &&
    parsedThreshold !== undefined &&
    cheapestMonthly !== undefined &&
    cheapestMonthly > parsedThreshold &&
    !dismissedAlerts.includes(budgetAlertId);

  function dismissBudgetAlert() {
    if (!budgetAlertId) {
      return;
    }

    const nextDismissedAlerts = [...dismissedAlerts, budgetAlertId];
    setDismissedAlerts(nextDismissedAlerts);
    storeDismissedAlerts(nextDismissedAlerts);
  }

  return (
    <section className="mt-4 grid min-w-0 gap-4" aria-label="FinOps feature controls">
      <div className="grid gap-3 rounded-lg border border-border bg-surface-1 p-3 shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Pricing model
            </p>
            <h2 className="mt-1 text-lg font-semibold text-text-primary">
              Commitment scenario controls
            </h2>
          </div>
          <div
            className="grid min-h-11 grid-cols-1 rounded-lg border border-border bg-surface-0 p-1 shadow-inner sm:inline-grid sm:grid-cols-3"
            role="group"
            aria-label="Pricing model"
          >
            {PRICING_MODELS.map((model) => (
              <button
                key={model.key}
                type="button"
                aria-pressed={pricingModel === model.key}
                title={model.detail}
                onClick={() => setPricingModel(model.key)}
                className={[
                  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary',
                  pricingModel === model.key
                    ? 'bg-text-primary text-surface-1 shadow-sm'
                    : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <PricingModelIcon model={model.key} />
                {model.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {PROVIDER_ORDER.map((providerId) => {
            const provider = providerResults.get(providerId);
            const selectedModelCost = provider
              ? providerModelCost(provider, pricingModel)
              : undefined;

            return (
              <article
                key={providerId}
                className="min-w-0 rounded-lg border border-border bg-surface-0 p-3"
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <ProviderLogoHeading providerId={providerId} />
                  <strong className="font-mono text-base text-text-primary">
                    {selectedModelCost
                      ? formatModelCost(selectedModelCost, interval, currency)
                      : 'Pending'}
                  </strong>
                </div>
                <p className="mt-2 text-sm leading-5 text-text-secondary">
                  {provider
                    ? threeYearReservedSummary(provider, currency)
                    : '3yr reserved: pending comparison data.'}
                </p>
              </article>
            );
          })}
        </div>
      </div>

      <WorkloadBreakdown
        currency={currency}
        comparison={comparison}
        interval={interval}
        pricingModel={pricingModel}
        isLoading={isLoading}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="grid gap-3 rounded-lg border border-border bg-surface-1 p-4 shadow-sm">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Budget alerts
              </p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">
                Estimate guardrail and anomaly readiness
              </h3>
            </div>
            <label className="grid min-w-[220px] gap-1 text-sm font-semibold text-text-primary">
              <span>Monthly budget threshold</span>
              <span className="relative block">
                <input
                  id="budget-threshold-usd"
                  inputMode="decimal"
                  value={budgetThreshold}
                  onChange={(event) => setBudgetThreshold(event.currentTarget.value)}
                  placeholder="USD amount"
                  className="min-h-11 rounded-lg border border-border bg-surface-0 px-3 pr-12 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold uppercase text-text-muted">
                  USD
                </span>
              </span>
            </label>
          </div>

          {budgetAlertActive && parsedThreshold !== undefined && cheapestMonthly !== undefined ? (
            <div
              className="rounded-lg border border-[color:var(--pc-warning)] bg-[color:var(--pc-warning-soft)] p-3 text-sm text-text-primary"
              role="alert"
            >
              <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <strong>Estimated run-rate exceeds budget threshold.</strong>
                  <p className="mt-1 text-text-secondary">
                    Lowest monthly estimate is {formatMoney(cheapestMonthly, currency)} against a{' '}
                    {formatMoney(parsedThreshold, currency)} threshold. This is an estimate
                    guardrail; live anomaly monitoring still needs backend alert infrastructure.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={dismissBudgetAlert}>
                  Dismiss
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-0 p-3 text-sm text-text-secondary">
              Live spend threshold monitoring, week-over-week anomaly detection, and notification
              delivery are backend gaps. This UI stores the estimate threshold and will not invent a
              live alert.
            </div>
          )}
        </section>

        <section className="grid gap-3 rounded-lg border border-border bg-surface-1 p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Share report
            </p>
            <h3 className="mt-1 text-lg font-semibold text-text-primary">
              Read-only link workflow
            </h3>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm font-semibold text-text-primary">
            <span>PolyCost watermark</span>
            <input
              type="checkbox"
              checked={watermarkEnabled}
              onChange={(event) => setWatermarkEnabled(event.currentTarget.checked)}
              className="h-5 min-h-5 w-5 accent-action-primary"
            />
          </label>
          <div className="rounded-lg border border-border bg-surface-0 p-3 text-sm text-text-secondary">
            Share token generation, public token resolution, expiry, and revocation endpoints are
            not present yet. No fake public link has been generated.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled
              title="Requires backend share-token generation."
            >
              <ShareIcon />
              Copy link
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled
              title="Requires backend share-token revocation."
            >
              <RevokeIcon />
              Revoke
            </Button>
          </div>
          <p className="text-xs font-semibold text-text-muted">
            Current mode: {watermarkEnabled ? 'branded report' : 'white-label ready'}
          </p>
        </section>
      </div>

      <section className="grid gap-3 rounded-lg border border-border bg-surface-1 p-4 shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Currency display
            </p>
            <h3 className="mt-1 text-lg font-semibold text-text-primary">
              Locale-safe money formatting
            </h3>
          </div>
          <label className="grid min-w-[220px] gap-1 text-sm font-semibold text-text-primary">
            <span>Display currency</span>
            <select
              value={currencyCode}
              onChange={(event) => setCurrencyCode(event.currentTarget.value as CurrencyCode)}
              className="min-h-11 rounded-lg border border-border bg-surface-0 px-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
            >
              {CURRENCY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code} disabled={!option.available}>
                  {option.label}
                  {option.available ? '' : ' - exchange backend pending'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <InfoTile
            label="Active currency"
            value={currency.code}
            detail="USD is the only live currency returned by the pricing APIs."
          />
          <InfoTile
            label="Lowest monthly"
            value={
              cheapestMonthly !== undefined ? formatMoney(cheapestMonthly, currency) : 'Pending'
            }
            detail="Locale-safe currency formatting."
          />
          <InfoTile
            label="Exchange rates"
            value="Backend pending"
            detail="PKR, EUR, and GBP need a real exchange-rate service with timestamps."
          />
        </div>
      </section>
    </section>
  );
}

function WorkloadBreakdown({
  comparison,
  currency,
  interval,
  pricingModel,
  isLoading,
}: {
  comparison: ComparisonResult | null;
  currency: CurrencyOption;
  interval: IntervalKey;
  pricingModel: PricingModelKey;
  isLoading: boolean;
}) {
  const egressWarnings = egressWarningMap(comparison, interval);

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-surface-1 p-4 shadow-sm">
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Workload cost breakdown
          </p>
          <h3 className="mt-1 text-lg font-semibold text-text-primary">
            Compute, storage, and data-transfer mix
          </h3>
        </div>
        <span className="rounded-full border border-border bg-surface-0 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {isLoading ? 'Refreshing' : 'Real line items'}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {PROVIDER_ORDER.map((providerId) => {
          const provider = comparison?.providers.find((item) => item.providerId === providerId);
          const parts = provider ? breakdownParts(provider, interval, pricingModel) : [];
          const warning = egressWarnings.get(providerId);
          const databaseMonthly = provider ? databaseMonthlyCost(provider) : 0;

          return (
            <article
              key={providerId}
              className="grid min-w-0 gap-3 rounded-lg border border-border bg-surface-0 p-3"
            >
              <div className="flex min-w-0 items-center justify-between gap-3">
                <ProviderLogoHeading providerId={providerId} />
                <strong className="font-mono text-sm text-text-primary">
                  {provider
                    ? formatModelCost(providerModelCost(provider, pricingModel), interval, currency)
                    : 'Pending'}
                </strong>
              </div>

              {provider ? (
                <>
                  <div
                    className="flex h-4 overflow-hidden rounded-full bg-surface-1 shadow-inner"
                    aria-label={`${providerLabel(providerId)} cost breakdown`}
                  >
                    {parts
                      .filter((part) => part.total > 0)
                      .map((part) => (
                        <span
                          key={part.key}
                          className={part.className}
                          style={{ width: `${part.percent}%` }}
                          title={`${part.label}: ${formatMoney(part.total, currency)}`}
                        />
                      ))}
                  </div>
                  <div className="grid gap-2">
                    {parts.map((part) => (
                      <div
                        key={part.key}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                          <span
                            className={['h-2.5 w-2.5 rounded-full', part.className].join(' ')}
                            aria-hidden="true"
                          />
                          {part.label}
                        </span>
                        <strong className="font-mono text-text-primary">
                          {formatMoney(part.total, currency)}
                        </strong>
                      </div>
                    ))}
                  </div>
                  {databaseMonthly > 0 ? (
                    <p className="text-xs leading-5 text-text-muted">
                      Database adds{' '}
                      {formatMoney(databaseMonthly * intervalCostMultiplier(interval), currency)}{' '}
                      outside this scoped compute/storage/egress bar.
                    </p>
                  ) : null}
                  {warning ? (
                    <div className="rounded-lg border border-[color:var(--pc-warning)] bg-[color:var(--pc-warning-soft)] p-2 text-xs font-semibold text-text-primary">
                      Egress risk: {formatMoney(warning.amount, currency)} is{' '}
                      {formatPercent(warning.percentOverLowest)} above the lowest provider.
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-text-secondary">
                  Run a comparison to populate the real category split.
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className="text-xs leading-5 text-text-muted">
        Egress covers direct public-internet transfer only. Inter-region transfer, cross-service
        transfer, CDN edge pricing, and archive retrieval fees stay outside this v1 scoped model.
      </p>
    </section>
  );
}

export function SharedReportPlaceholder({ token }: { token: string }) {
  return (
    <main className="min-h-screen bg-surface-0 px-4 py-8 text-text-primary">
      <section className="mx-auto grid max-w-4xl gap-4 rounded-lg border border-border bg-surface-1 p-6 shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              PolyCost shared report
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-text-primary">
              Read-only report token pending backend resolution
            </h1>
          </div>
          <span className="rounded-full border border-border bg-surface-0 px-3 py-1 text-xs font-semibold text-text-muted">
            /share/{token}
          </span>
        </div>
        <div className="rounded-lg border border-border bg-surface-0 p-4 text-sm leading-6 text-text-secondary">
          This stripped-down view is ready for public report rendering, but the API does not yet
          provide share-token lookup, expiry, revocation, or scoped read-only report data. No
          account navigation or edit controls are shown here.
        </div>
        <InfoTile
          label="Backend gap"
          value="Share token service"
          detail={`Token received: ${token}. The frontend will render the comparison once the API can resolve it.`}
        />
      </section>
    </main>
  );
}

function breakdownParts(
  provider: ComparisonProviderResult,
  interval: IntervalKey,
  pricingModel: PricingModelKey,
): BreakdownPart[] {
  const multiplier = intervalCostMultiplier(interval);
  const storageMonthly =
    provider.breakdown?.storageMonthlyCostUsd ?? componentTotal(provider, 'storage');
  const egressMonthly =
    provider.breakdown?.egressMonthlyCostUsd ?? componentTotal(provider, 'egress');
  const databaseMonthly = databaseMonthlyCost(provider);
  const selectedModelCost = providerModelCost(provider, pricingModel);
  const selectedComputeMonthly =
    selectedModelCost.available && selectedModelCost.monthlyCostUsd !== undefined
      ? Math.max(
          0,
          selectedModelCost.monthlyCostUsd - storageMonthly - egressMonthly - databaseMonthly,
        )
      : (provider.breakdown?.computeMonthlyCostUsd ?? componentTotal(provider, 'compute'));
  const compute = selectedComputeMonthly * multiplier;
  const storage = storageMonthly * multiplier;
  const egress = egressMonthly * multiplier;
  const parts = [
    {
      key: 'compute',
      label: 'Compute',
      total: roundCurrency(compute),
      className: 'bg-brand-orange',
    },
    {
      key: 'storage',
      label: 'Storage',
      total: roundCurrency(storage),
      className: 'bg-brand-blue',
    },
    {
      key: 'egress',
      label: 'Egress/data transfer',
      total: roundCurrency(egress),
      className: 'bg-brand-green',
    },
  ] satisfies Array<Omit<BreakdownPart, 'percent'>>;
  const total = parts.reduce((sum, part) => sum + part.total, 0);

  return parts.map((part) => ({
    ...part,
    percent: total > 0 && part.total > 0 ? Math.max(4, (part.total / total) * 100) : 0,
  }));
}

function egressWarningMap(
  comparison: ComparisonResult | null,
  interval: IntervalKey,
): Map<ProviderId, EgressWarning> {
  const multiplier = intervalCostMultiplier(interval);
  const egressRows =
    comparison?.providers
      .map((provider) => ({
        providerId: provider.providerId,
        amount: roundCurrency(
          (provider.breakdown?.egressMonthlyCostUsd ?? componentTotal(provider, 'egress')) *
            multiplier,
        ),
      }))
      .filter((row) => row.amount > 0) ?? [];

  if (egressRows.length < 2) {
    return new Map();
  }

  const lowest = Math.min(...egressRows.map((row) => row.amount));

  if (lowest <= 0) {
    return new Map();
  }

  return new Map(
    egressRows
      .filter((row) => row.amount > lowest * 1.2)
      .map((row) => [
        row.providerId,
        {
          providerId: row.providerId,
          amount: row.amount,
          percentOverLowest: ((row.amount - lowest) / lowest) * 100,
        },
      ]),
  );
}

function componentTotal(provider: ComparisonProviderResult, component: CostComponent): number {
  return provider.lineItems
    .filter((lineItem) => lineItemComponent(lineItem) === component)
    .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
}

function databaseMonthlyCost(provider: ComparisonProviderResult): number {
  return provider.breakdown?.databaseMonthlyCostUsd ?? componentTotal(provider, 'database');
}

function lineItemComponent(lineItem: ComparisonProviderResult['lineItems'][number]): CostComponent {
  if (lineItem.costComponent) {
    return lineItem.costComponent;
  }

  if (lineItem.category === 'network') {
    return 'egress';
  }

  return lineItem.category;
}

function providerModelCost(
  provider: ComparisonProviderResult,
  pricingModel: PricingModelKey,
): PricingModelCost {
  const model = provider.pricingModels?.find((item) => item.model === pricingModel);

  if (model) {
    return model;
  }

  if (pricingModel === 'on-demand') {
    return {
      model: 'on-demand',
      available: true,
      monthlyCostUsd: provider.totals.monthly,
    };
  }

  return {
    model: pricingModel,
    available: false,
    unavailableReason: 'Not available for this configuration.',
  };
}

function formatModelCost(
  modelCost: PricingModelCost,
  interval: IntervalKey,
  currency: CurrencyOption,
): string {
  if (!modelCost.available || modelCost.monthlyCostUsd === undefined) {
    return 'Not available';
  }

  return formatMoney(modelCost.monthlyCostUsd * intervalCostMultiplier(interval), currency);
}

function threeYearReservedSummary(
  provider: ComparisonProviderResult,
  currency: CurrencyOption,
): string {
  const onDemand = providerModelCost(provider, 'on-demand');
  const reserved = providerModelCost(provider, 'reserved-3yr');

  if (!reserved.available || reserved.monthlyCostUsd === undefined) {
    return `3yr reserved: ${reserved.unavailableReason ?? 'Not available for this configuration.'}`;
  }

  if (
    !onDemand.available ||
    onDemand.monthlyCostUsd === undefined ||
    onDemand.monthlyCostUsd <= 0
  ) {
    return `3yr reserved: ${formatMoney(reserved.monthlyCostUsd, currency)}/mo`;
  }

  const savings = Math.max(
    0,
    ((onDemand.monthlyCostUsd - reserved.monthlyCostUsd) / onDemand.monthlyCostUsd) * 100,
  );

  return `3yr reserved: ${formatMoney(reserved.monthlyCostUsd, currency)}/mo · saves ${formatPercent(savings)}`;
}

function InfoTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="min-w-0 rounded-lg border border-border bg-surface-0 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <strong className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-base text-text-primary">
        {value}
      </strong>
      <span className="mt-1 block text-sm leading-5 text-text-secondary">{detail}</span>
    </article>
  );
}

function PricingModelIcon({ model }: { model: PricingModelKey }) {
  if (model === 'reserved-3yr') {
    return <IconPath path="M5 5h14v14H5zM8 9h8M8 13h8M8 17h5" />;
  }

  if (model === 'reserved-1yr') {
    return <IconPath path="M6 4h12v16l-6-3-6 3zM9 9h6" />;
  }

  return <IconPath path="M4 12h16M12 4v16M7 7h10v10H7z" />;
}

function ShareIcon() {
  return <IconPath path="M8 12h8M15 8l4 4-4 4M5 5h6M5 19h6M5 5v14" />;
}

function RevokeIcon() {
  return <IconPath path="M6 6l12 12M18 6 6 18M12 3a9 9 0 1 1-9 9 9 9 0 0 1 9-9z" />;
}

function IconPath({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <path d={path} />
    </svg>
  );
}

function ProviderLogoHeading({ providerId }: { providerId: ProviderId }) {
  return (
    <span className={`provider-mini-heading provider-mini-heading-${providerId}`}>
      <img src={providerMarkSrc(providerId)} alt="" aria-hidden="true" />
      <span>{providerLabel(providerId)}</span>
    </span>
  );
}

function providerLabel(provider: ProviderId): string {
  switch (provider) {
    case 'aws':
      return 'AWS';
    case 'azure':
      return 'Azure';
    case 'gcp':
      return 'GCP';
  }
}

function intervalCostMultiplier(interval: IntervalKey): number {
  switch (interval) {
    case 'daily':
      return 1 / 30;
    case 'weekly':
      return 7 / 30;
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'yearly':
      return 12;
  }
}

function formatMoney(value: number, currency: CurrencyOption): string {
  return new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
    style: 'percent',
  }).format(value / 100);
}

function parseCurrencyInput(value: string): number | undefined {
  const parsed = Number.parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function readDismissedAlerts(): string[] {
  try {
    const stored = localStorage.getItem(DISMISSED_ALERT_STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as unknown) : [];

    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function storeDismissedAlerts(alertIds: string[]): void {
  try {
    localStorage.setItem(DISMISSED_ALERT_STORAGE_KEY, JSON.stringify(alertIds.slice(-20)));
  } catch {
    // Non-persistent environments keep the in-memory dismissed state.
  }
}
