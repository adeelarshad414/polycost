import { useEffect, useMemo, useState } from 'react';
import { formatApiError, polyCostClient, PolyCostClient } from '../api-client';
import { Button } from './Button';
import {
  AlertRecord,
  BudgetRecord,
  ComparisonProviderResult,
  ComparisonResult,
  CostComponent,
  ExchangeRatesResponse,
  IntervalKey,
  NormalizedInstanceFamily,
  PROVIDER_ORDER,
  PricingModelCost,
  PricingModelKey,
  ProviderId,
  SharedReportResponse,
  StoragePricingTier,
  WorkloadInput,
} from '../types';
import {
  canonicalRegionForRegionPreference,
  DEFAULT_COMPARISON_REGION,
} from '../region-normalization';
import { WorkloadFormState } from '../workload';

type CurrencyCode = 'USD' | 'PKR' | 'EUR' | 'GBP';

interface PricingModelOption {
  key: PricingModelKey;
  label: string;
  detail: string;
  caveat: string;
}

interface CurrencyOption {
  code: CurrencyCode;
  label: string;
  locale: string;
  available: boolean;
  rate: number;
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

interface GeneratedShareLink {
  token: string;
  publicUrl: string;
}

const PRICING_MODELS: PricingModelOption[] = [
  {
    key: 'on-demand',
    label: 'On-demand',
    detail: 'Current cached USD on-demand pricing.',
    caveat: 'No commitment. Current default behavior remains unchanged.',
  },
  {
    key: 'reserved-1yr',
    label: '1yr reserved',
    detail: 'Uses cached one-year reservation, Savings Plan, or committed-use rows when present.',
    caveat: 'Provider reservations and CUDs are not identical; validate payment options.',
  },
  {
    key: 'reserved-3yr',
    label: '3yr reserved',
    detail: 'Uses cached three-year reservation, Savings Plan, or committed-use rows when present.',
    caveat: 'Longer commitments can save more but reduce flexibility.',
  },
  {
    key: 'spot',
    label: 'Spot',
    detail: 'Modeled interruptible compute estimate unless live catalog rows are present.',
    caveat: 'Volatile and interruptible. Use only for fault-tolerant workloads.',
  },
  {
    key: 'savings-plan',
    label: 'Savings plan',
    detail: 'AWS Savings Plans, Azure reservations, or GCP committed-use discount scenarios.',
    caveat: 'Commitment programs differ materially by provider.',
  },
];

const USD_CURRENCY: CurrencyOption = {
  code: 'USD',
  label: 'USD',
  locale: 'en-US',
  available: true,
  rate: 1,
};

const CURRENCY_OPTIONS: Array<Pick<CurrencyOption, 'code' | 'label' | 'locale'>> = [
  { code: 'USD', label: 'USD', locale: 'en-US' },
  { code: 'PKR', label: 'PKR', locale: 'en-PK' },
  { code: 'EUR', label: 'EUR', locale: 'de-DE' },
  { code: 'GBP', label: 'GBP', locale: 'en-GB' },
];

const DISMISSED_ALERT_STORAGE_KEY = 'polycost-dismissed-budget-alerts';

export function FinOpsFeatureLayer({
  client = polyCostClient,
  comparison,
  form,
  interval,
  isLoading = false,
}: {
  client?: PolyCostClient;
  comparison: ComparisonResult | null;
  form: WorkloadFormState;
  interval: IntervalKey;
  isLoading?: boolean;
}) {
  const [pricingModel, setPricingModel] = useState<PricingModelKey>('on-demand');
  const [budgetThreshold, setBudgetThreshold] = useState('');
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>(() => readDismissedAlerts());
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>('USD');
  const [shareLink, setShareLink] = useState<GeneratedShareLink | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'creating' | 'ready' | 'copied'>('idle');
  const [shareError, setShareError] = useState<string | null>(null);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRatesResponse | null>(null);
  const [exchangeRateError, setExchangeRateError] = useState<string | null>(null);
  const [isLoadingExchangeRates, setIsLoadingExchangeRates] = useState(true);
  const [budgetRecord, setBudgetRecord] = useState<BudgetRecord | null>(null);
  const [backendAlerts, setBackendAlerts] = useState<AlertRecord[]>([]);
  const [budgetStatus, setBudgetStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const currencyOptions = useMemo(() => currencyOptionsFromRates(exchangeRates), [exchangeRates]);
  const selectedPricingModelOption =
    PRICING_MODELS.find((model) => model.key === pricingModel) ?? PRICING_MODELS[0];
  const selectedCurrency =
    currencyOptions.find((option) => option.code === currencyCode) ?? USD_CURRENCY;
  const currency = selectedCurrency.available ? selectedCurrency : USD_CURRENCY;
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

  useEffect(() => {
    setShareLink(null);
    setShareStatus('idle');
    setShareError(null);
  }, [comparison?.comparisonId, watermarkEnabled]);

  useEffect(() => {
    let isActive = true;

    setIsLoadingExchangeRates(true);
    setExchangeRateError(null);

    client
      .getExchangeRates('USD')
      .then((rates) => {
        if (!isActive) {
          return;
        }

        setExchangeRates(rates);
        setExchangeRateError(null);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setExchangeRates(null);
        setExchangeRateError(formatApiError(error));
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingExchangeRates(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [client]);

  useEffect(() => {
    if (!selectedCurrency.available) {
      setCurrencyCode('USD');
    }
  }, [selectedCurrency.available]);

  useEffect(() => {
    setBudgetRecord(null);
    setBackendAlerts([]);
    setBudgetStatus('idle');
    setBudgetError(null);
  }, [budgetThreshold, comparison?.comparisonId]);

  function dismissBudgetAlert() {
    if (!budgetAlertId) {
      return;
    }

    const nextDismissedAlerts = [...dismissedAlerts, budgetAlertId];
    setDismissedAlerts(nextDismissedAlerts);
    storeDismissedAlerts(nextDismissedAlerts);
  }

  async function saveBackendBudget() {
    if (!comparison || parsedThreshold === undefined || budgetStatus === 'saving') {
      return;
    }

    setBudgetStatus('saving');
    setBudgetError(null);

    try {
      const workload = await client.createWorkload(workloadInputFromForm(form));
      const budget = await client.createBudget({
        workloadId: workload.id,
        thresholdUsd: parsedThreshold,
        alertOnAnomalyPercent: 20,
      });
      const alerts = await client.listAlerts(workload.id);

      setBudgetRecord(budget);
      setBackendAlerts(alerts);
      setBudgetStatus('saved');
    } catch (error) {
      setBudgetStatus('idle');
      setBudgetError(formatApiError(error));
    }
  }

  async function dismissBackendAlert(alertId: string) {
    try {
      const updatedAlert = await client.updateAlertDismissed(alertId, true);
      setBackendAlerts((alerts) =>
        alerts.map((alert) => (alert.id === updatedAlert.id ? updatedAlert : alert)),
      );
      setBudgetError(null);
    } catch (error) {
      setBudgetError(formatApiError(error));
    }
  }

  async function createAndCopyShareLink() {
    if (!comparison || shareStatus === 'creating') {
      return;
    }

    setShareStatus('creating');
    setShareError(null);

    try {
      const workload = await client.createWorkload(workloadInputFromForm(form));
      const share = await client.createShareLink({
        workloadId: workload.id,
        watermark: watermarkEnabled,
        expiresInDays: 30,
      });
      const publicUrl = publicShareUrl(share.url, share.token);

      await copyToClipboard(publicUrl);
      setShareLink({ token: share.token, publicUrl });
      setShareStatus('copied');
    } catch (error) {
      setShareStatus('idle');
      setShareError(formatApiError(error));
    }
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
            className="grid min-h-11 grid-cols-1 rounded-lg border border-border bg-surface-0 p-1 shadow-inner sm:inline-grid sm:grid-cols-2 xl:grid-cols-5"
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
        <p className="rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm leading-5 text-text-secondary">
          <strong className="text-text-primary">{selectedPricingModelOption.label}:</strong>{' '}
          {selectedPricingModelOption.caveat}
        </p>

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
                  <ProviderTextHeading providerId={providerId} />
                  <strong className="font-mono text-base text-text-primary">
                    {selectedModelCost
                      ? formatModelCost(selectedModelCost, interval, currency)
                      : 'Pending'}
                  </strong>
                </div>
                {provider ? (
                  <PricingModelSavingsCue
                    bestModel={bestSavingsModel(provider)}
                    selectedModel={selectedModelCost}
                  />
                ) : null}
                <p className="mt-2 text-sm leading-5 text-text-secondary">
                  {provider
                    ? pricingModelSummary(provider, pricingModel, currency)
                    : `${selectedPricingModelOption.label}: pending comparison data.`}
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
            <div className="grid min-w-[220px] gap-1 text-sm font-semibold text-text-primary">
              <label htmlFor="budget-threshold-usd">Monthly budget threshold</label>
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
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={
                !comparison ||
                parsedThreshold === undefined ||
                isLoading ||
                budgetStatus === 'saving'
              }
              loading={budgetStatus === 'saving'}
              loadingLabel="Saving budget..."
              onClick={saveBackendBudget}
            >
              <BudgetIcon />
              Save backend budget
            </Button>
            <span className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface-0 px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              20% anomaly threshold
            </span>
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
                    guardrail before the scheduled backend evaluator runs.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={dismissBudgetAlert}>
                  Dismiss
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-0 p-3 text-sm text-text-secondary">
              Enter a threshold to run an instant estimate guardrail. Save it to create a real
              backend budget; scheduled evaluation can then populate threshold and anomaly alerts.
            </div>
          )}
          {budgetError ? (
            <div
              className="rounded-lg border border-action-destructive bg-surface-0 p-3 text-sm text-text-primary"
              role="alert"
            >
              <strong>Budget workflow failed.</strong> {budgetError}
            </div>
          ) : null}
          {budgetRecord ? (
            <div className="grid gap-3 rounded-lg border border-border bg-surface-0 p-3 text-sm text-text-secondary">
              <div>
                <strong className="text-text-primary">Backend budget saved.</strong>{' '}
                {formatMoney(budgetRecord.thresholdUsd, currency)} threshold · workload{' '}
                {budgetRecord.workloadId}
              </div>
              {backendAlerts.length > 0 ? (
                <div className="grid gap-2">
                  {backendAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-1 p-2 md:flex-row md:items-center md:justify-between"
                    >
                      <span>
                        <strong className="text-text-primary">
                          {alert.alertType === 'anomaly' ? 'Anomaly' : 'Budget threshold'}
                        </strong>{' '}
                        {alert.message}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={alert.dismissed}
                        onClick={() => void dismissBackendAlert(alert.id)}
                      >
                        {alert.dismissed ? 'Dismissed' : 'Dismiss'}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <span>
                  No active backend alerts returned yet. The scheduled evaluator creates alert rows;
                  notification delivery remains outside the V1 UI.
                </span>
              )}
            </div>
          ) : null}
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
            {shareLink ? (
              <>
                <strong className="text-text-primary">Public report ready.</strong>{' '}
                <a
                  href={shareLink.publicUrl}
                  className="font-semibold text-action-primary underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open read-only report
                </a>{' '}
                · token {shareLink.token}
              </>
            ) : (
              <>
                Create a real read-only report link scoped to this workload. Links expire after 30
                days and resolve through the backend share-token API.
              </>
            )}
          </div>
          {shareError ? (
            <div
              className="rounded-lg border border-action-destructive bg-surface-0 p-3 text-sm text-text-primary"
              role="alert"
            >
              <strong>Share link failed.</strong> {shareError}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!comparison || isLoading || shareStatus === 'creating'}
              loading={shareStatus === 'creating'}
              loadingLabel="Creating link..."
              onClick={createAndCopyShareLink}
            >
              <ShareIcon />
              {shareLink ? 'Copy fresh link' : 'Create & copy link'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled
              title="Backend revoke endpoint is not exposed in the V1 share-link contract."
            >
              <RevokeIcon />
              Revoke
            </Button>
          </div>
          <p className="text-xs font-semibold text-text-muted">
            Current mode: {watermarkEnabled ? 'branded report' : 'white-label ready'} ·{' '}
            {shareStatus === 'copied' ? 'link copied' : 'revoke requires backend support'}
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
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code} disabled={!option.available}>
                  {option.label}
                  {option.available ? '' : ' - rate unavailable'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <InfoTile
            label="Active currency"
            value={currency.code}
            detail={
              currency.code === 'USD'
                ? 'USD is the cached pricing base currency.'
                : `1 USD = ${formatRate(currency.rate)} ${currency.code}`
            }
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
            value={
              isLoadingExchangeRates
                ? 'Loading'
                : exchangeRates && Object.keys(exchangeRates.rates).length > 0
                  ? `${Object.keys(exchangeRates.rates).length} rates`
                  : 'USD only'
            }
            detail={
              exchangeRateError ??
              (exchangeRates?.lastUpdated
                ? `Cached ${formatReportDate(exchangeRates.lastUpdated)}`
                : 'Backend returned no quote-currency rows.')
            }
          />
        </div>
      </section>
    </section>
  );
}

function PricingModelSavingsCue({
  bestModel,
  selectedModel,
}: {
  bestModel?: PricingModelCost;
  selectedModel?: PricingModelCost;
}) {
  if (!bestModel && !selectedModel?.caveat) {
    return null;
  }

  return (
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold">
      {bestModel?.savingsPercentVsOnDemand !== undefined ? (
        <span className="rounded-full border border-[color:var(--pc-success)] bg-[color:var(--pc-success-soft)] px-2 py-1 text-text-primary">
          Best: {bestModel.providerTerm ?? bestModel.displayName ?? pricingModelLabel(bestModel.model)} saves{' '}
          {formatPercent(bestModel.savingsPercentVsOnDemand)}
        </span>
      ) : null}
      {selectedModel?.caveat ? (
        <span
          className="inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-surface-1 px-2 py-1 text-text-secondary"
          title={selectedModel.caveat}
        >
          <InfoIcon />
          Caveat
        </span>
      ) : null}
    </div>
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
                <ProviderTextHeading providerId={providerId} />
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

function workloadInputFromForm(form: WorkloadFormState): WorkloadInput {
  const vcpu = positiveNumberOrDefault(form.vcpu, 2);
  const memoryGb = positiveNumberOrDefault(form.memoryGb, 4);

  return {
    instanceFamily: instanceFamilyForWorkload(vcpu, memoryGb),
    vcpu,
    memoryGb,
    region: canonicalRegionForRegionPreference(form.regionPreference) ?? DEFAULT_COMPARISON_REGION,
    instanceCount: Math.round(positiveNumberOrDefault(form.instanceCount, 1)),
    hoursPerMonth: 730,
    storageGb: form.storageEnabled ? nonNegativeNumberOrDefault(form.storageSizeGb, 0) : 0,
    storageTier: storageTierForAccessPattern(form.storageAccessPattern),
    egressGbPerMonth: nonNegativeNumberOrDefault(form.monthlyEgressGb, 0),
  };
}

function instanceFamilyForWorkload(
  vcpu: number,
  memoryGb: number,
): NormalizedInstanceFamily {
  if (memoryGb / Math.max(vcpu, 1) >= 6) {
    return 'memory-optimized';
  }

  if (vcpu >= 8) {
    return 'compute-optimized';
  }

  return 'general-purpose';
}

function storageTierForAccessPattern(
  accessPattern: WorkloadFormState['storageAccessPattern'],
): StoragePricingTier {
  if (accessPattern === 'archive') {
    return 'archive';
  }

  if (accessPattern === 'infrequent') {
    return 'infrequent_access';
  }

  return 'standard';
}

function positiveNumberOrDefault(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value.replace(/,/g, '').trim());

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumberOrDefault(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value.replace(/,/g, '').trim());

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function publicShareUrl(apiShareUrl: string, token: string): string {
  const tokenFromUrl = apiShareUrl.match(/\/share\/([^/?#]+)/)?.[1] ?? token;
  const publicPath = `/share/${tokenFromUrl}`;

  return new URL(publicPath, window.location.origin).toString();
}

async function copyToClipboard(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    return;
  }

  await navigator.clipboard.writeText(value);
}

export function SharedReportPlaceholder({
  client = polyCostClient,
  token,
}: {
  client?: PolyCostClient;
  token: string;
}) {
  const [report, setReport] = useState<SharedReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    setReport(null);
    setError(null);

    client
      .getSharedReport(token)
      .then((nextReport) => {
        if (isActive) {
          setReport(nextReport);
        }
      })
      .catch((nextError) => {
        if (isActive) {
          setError(formatApiError(nextError));
        }
      });

    return () => {
      isActive = false;
    };
  }, [client, token]);

  return (
    <main className="min-h-screen bg-surface-0 px-4 py-8 text-text-primary">
      <section className="mx-auto grid max-w-4xl gap-4 rounded-lg border border-border bg-surface-1 p-6 shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              PolyCost shared report
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-text-primary">
              Read-only cloud cost report
            </h1>
          </div>
          <span className="rounded-full border border-border bg-surface-0 px-3 py-1 text-xs font-semibold text-text-muted">
            /share/{token}
          </span>
        </div>

        {error ? (
          <div
            className="rounded-lg border border-action-destructive bg-surface-0 p-4 text-sm leading-6 text-text-primary"
            role="alert"
          >
            <strong>Shared report unavailable.</strong> {error}
          </div>
        ) : null}

        {!report && !error ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Shared report loading">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-lg border border-border bg-surface-0 motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : null}

        {report ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <InfoTile
                label="Token"
                value={report.token}
                detail="Public, read-only, and scoped to this workload."
              />
              <InfoTile
                label="Expires"
                value={formatReportDate(report.expiresAt)}
                detail="Expired or revoked tokens return no report data."
              />
              <InfoTile
                label="Watermark"
                value={report.watermark ? 'Enabled' : 'Disabled'}
                detail="Controls branded report presentation only."
              />
            </div>

            <section className="rounded-lg border border-border bg-surface-0 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Workload scope
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <InfoTile
                  label="Region"
                  value={report.workload.region}
                  detail="Canonical comparison region."
                />
                <InfoTile
                  label="Compute"
                  value={`${report.workload.instanceCount} x ${report.workload.vcpu} vCPU`}
                  detail={`${report.workload.memoryGb} GB RAM per instance.`}
                />
                <InfoTile
                  label="Storage"
                  value={`${report.workload.storageGb} GB`}
                  detail={report.workload.storageTier.replace(/_/g, ' ')}
                />
                <InfoTile
                  label="Egress"
                  value={`${report.workload.egressGbPerMonth} GB/mo`}
                  detail="Public internet transfer estimate."
                />
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface-0 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Provider breakdown
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {report.breakdown.providers.map((provider) => (
                  <article
                    key={provider.provider}
                    className="rounded-lg border border-border bg-surface-1 p-3"
                  >
                    <ProviderTextHeading providerId={provider.provider} />
                    <strong className="mt-3 block font-mono text-xl text-text-primary">
                      {formatMoney(provider.total, USD_CURRENCY)}
                    </strong>
                    <dl className="mt-3 grid gap-2 text-sm text-text-secondary">
                      <div className="flex justify-between gap-3">
                        <dt>Compute</dt>
                        <dd>{formatMoney(provider.compute, USD_CURRENCY)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Storage</dt>
                        <dd>{formatMoney(provider.storage, USD_CURRENCY)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Egress</dt>
                        <dd>{formatMoney(provider.egress, USD_CURRENCY)}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-xs text-text-muted">Region: {provider.region}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
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
      hourlyCostUsd: provider.totals.hourly ?? provider.totals.monthly / 730,
      monthlyCostUsd: provider.totals.monthly,
    };
  }

  return {
    model: pricingModel,
    available: false,
    unavailableReason: 'Not available for this configuration.',
  };
}

function bestSavingsModel(provider: ComparisonProviderResult): PricingModelCost | undefined {
  return provider.pricingModels
    ?.filter(
      (model) =>
        model.model !== 'on-demand' &&
        model.available &&
        model.monthlyCostUsd !== undefined &&
        model.savingsPercentVsOnDemand !== undefined,
    )
    .sort((left, right) => {
      const rightSavings = right.savingsPercentVsOnDemand ?? 0;
      const leftSavings = left.savingsPercentVsOnDemand ?? 0;

      return rightSavings - leftSavings;
    })[0];
}

function formatModelCost(
  modelCost: PricingModelCost,
  interval: IntervalKey,
  currency: CurrencyOption,
): string {
  if (!modelCost.available || modelCost.monthlyCostUsd === undefined) {
    return 'Not available';
  }

  if (interval === 'hourly') {
    return formatMoney(modelCost.hourlyCostUsd ?? modelCost.monthlyCostUsd / 730, currency);
  }

  return formatMoney(modelCost.monthlyCostUsd * intervalCostMultiplier(interval), currency);
}

function pricingModelSummary(
  provider: ComparisonProviderResult,
  pricingModel: PricingModelKey,
  currency: CurrencyOption,
): string {
  const onDemand = providerModelCost(provider, 'on-demand');
  const selected = providerModelCost(provider, pricingModel);
  const label = selected.providerTerm ?? selected.displayName ?? pricingModelLabel(pricingModel);

  if (!selected.available || selected.monthlyCostUsd === undefined) {
    return `${label}: ${selected.unavailableReason ?? 'Not available for this configuration.'}`;
  }

  if (
    !onDemand.available ||
    onDemand.monthlyCostUsd === undefined ||
    onDemand.monthlyCostUsd <= 0
  ) {
    return `${label}: ${formatMoney(selected.monthlyCostUsd, currency)}/mo`;
  }

  const savings =
    selected.savingsPercentVsOnDemand ??
    Math.max(
      0,
      ((onDemand.monthlyCostUsd - selected.monthlyCostUsd) / onDemand.monthlyCostUsd) * 100,
    );
  const flags = [
    selected.estimated ? 'estimated' : undefined,
    selected.volatility === 'volatile' ? 'volatile' : undefined,
  ].filter(Boolean);

  return `${label}: ${formatMoney(selected.monthlyCostUsd, currency)}/mo · saves ${formatPercent(savings)}${flags.length > 0 ? ` · ${flags.join(', ')}` : ''}`;
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
  if (model === 'spot') {
    return <IconPath path="M13 2 4 14h7l-1 8 9-12h-7z" />;
  }

  if (model === 'savings-plan') {
    return <IconPath path="M4 12a8 8 0 1 0 8-8M4 12h5M12 4v5M8 16h8M10 12h6" />;
  }

  if (model === 'reserved-3yr') {
    return <IconPath path="M5 5h14v14H5zM8 9h8M8 13h8M8 17h5" />;
  }

  if (model === 'reserved-1yr') {
    return <IconPath path="M6 4h12v16l-6-3-6 3zM9 9h6" />;
  }

  return <IconPath path="M4 12h16M12 4v16M7 7h10v10H7z" />;
}

function pricingModelLabel(model: PricingModelKey): string {
  return PRICING_MODELS.find((option) => option.key === model)?.label ?? model;
}

function ShareIcon() {
  return <IconPath path="M8 12h8M15 8l4 4-4 4M5 5h6M5 19h6M5 5v14" />;
}

function RevokeIcon() {
  return <IconPath path="M6 6l12 12M18 6 6 18M12 3a9 9 0 1 1-9 9 9 9 0 0 1 9-9z" />;
}

function BudgetIcon() {
  return <IconPath path="M5 6h14v12H5zM8 10h8M8 14h4M16 14h1" />;
}

function InfoIcon() {
  return <IconPath path="M12 17v-5M12 8h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />;
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

function ProviderTextHeading({ providerId }: { providerId: ProviderId }) {
  return (
    <span className={`provider-mini-heading provider-mini-heading-${providerId}`}>
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
    case 'hourly':
      return 1 / 730;
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

function currencyOptionsFromRates(rates: ExchangeRatesResponse | null): CurrencyOption[] {
  return CURRENCY_OPTIONS.map((option) => {
    if (option.code === 'USD') {
      return USD_CURRENCY;
    }

    const rate = rates?.rates[option.code];

    return {
      ...option,
      available: typeof rate === 'number' && Number.isFinite(rate) && rate > 0,
      rate: typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1,
    };
  });
}

function formatReportDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(date);
}

function formatMoney(value: number, currency: CurrencyOption): string {
  return new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    maximumFractionDigits: 2,
  }).format(value * currency.rate);
}

function formatRate(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 2 : 4,
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
