import { FormEvent, useEffect, useMemo, useState } from 'react';
import { formatApiError, polyCostClient, PolyCostClient } from '../api-client';
import { Button } from './Button';
import { hourlyFromMonthly, intervalMultiplierFromMonthly } from '../cost-time';
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
  PricingModelsForServiceResponse,
  ProviderId,
  ShareLinkAnalyticsResponse,
  SharedReportResponse,
  StoragePricingTier,
  WorkloadInput,
} from '../types';
import {
  canonicalRegionForRegionPreference,
  COMPARISON_REGION_GROUPS,
  DEFAULT_COMPARISON_REGION,
} from '../region-normalization';
import { buildNwsFromForm, WorkloadFormState } from '../workload';

type CurrencyCode = 'USD' | 'PKR' | 'EUR' | 'GBP';

interface PricingModelOption {
  key: PricingModelKey;
  label: string;
  detail: string;
  caveat: string;
}

type PaymentOptionKey = 'no_upfront' | 'partial_upfront' | 'all_upfront';

interface PaymentOption {
  key: PaymentOptionKey;
  label: string;
  detail: string;
}

interface CurrencyOption {
  code: CurrencyCode;
  label: string;
  locale: string;
  available: boolean;
  rate: number;
}

interface BreakdownPart {
  key: 'compute' | 'storage' | 'egress' | 'networking' | 'support' | 'licensing' | 'operations';
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

type WhatIfStatus = 'idle' | 'running' | 'ready';

const SCALE_SCENARIOS = [
  { value: 50, label: '50% scale' },
  { value: 75, label: '75% scale' },
  { value: 100, label: 'Current scale' },
  { value: 125, label: '125% scale' },
  { value: 150, label: '150% scale' },
  { value: 200, label: '200% scale' },
] as const;

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

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    key: 'no_upfront',
    label: 'No upfront',
    detail: 'No initial payment; higher effective hourly commitment rate.',
  },
  {
    key: 'partial_upfront',
    label: 'Partial upfront',
    detail: 'Balances cash timing with a lower effective hourly rate.',
  },
  {
    key: 'all_upfront',
    label: 'All upfront',
    detail: 'Lowest effective rate when capital commitment is acceptable.',
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
  pricingModelPreference = 'on-demand',
  onPricingModelPreferenceChange,
}: {
  client?: PolyCostClient;
  comparison: ComparisonResult | null;
  form: WorkloadFormState;
  interval: IntervalKey;
  isLoading?: boolean;
  pricingModelPreference?: PricingModelKey;
  onPricingModelPreferenceChange?: (model: PricingModelKey) => void;
}) {
  const [pricingModel, setPricingModel] = useState<PricingModelKey>(pricingModelPreference);
  const [paymentOption, setPaymentOption] = useState<PaymentOptionKey>('no_upfront');
  const [budgetThreshold, setBudgetThreshold] = useState('');
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>(() => readDismissedAlerts());
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [sharePassword, setSharePassword] = useState('');
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>('USD');
  const [shareLink, setShareLink] = useState<GeneratedShareLink | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'creating' | 'ready' | 'copied'>('idle');
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopyWarning, setShareCopyWarning] = useState<string | null>(null);
  const [shareAnalytics, setShareAnalytics] = useState<ShareLinkAnalyticsResponse | null>(null);
  const [shareAnalyticsError, setShareAnalyticsError] = useState<string | null>(null);
  const [isLoadingShareAnalytics, setIsLoadingShareAnalytics] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRatesResponse | null>(null);
  const [exchangeRateError, setExchangeRateError] = useState<string | null>(null);
  const [isLoadingExchangeRates, setIsLoadingExchangeRates] = useState(true);
  const [pricingModelsForService, setPricingModelsForService] =
    useState<PricingModelsForServiceResponse | null>(null);
  const [pricingModelsError, setPricingModelsError] = useState<string | null>(null);
  const [isLoadingPricingModels, setIsLoadingPricingModels] = useState(false);
  const [whatIfRegion, setWhatIfRegion] = useState(
    canonicalRegionForRegionPreference(form.regionPreference) ?? DEFAULT_COMPARISON_REGION,
  );
  const [whatIfScalePercent, setWhatIfScalePercent] = useState(125);
  const [whatIfResult, setWhatIfResult] = useState<ComparisonResult | null>(null);
  const [whatIfStatus, setWhatIfStatus] = useState<WhatIfStatus>('idle');
  const [whatIfError, setWhatIfError] = useState<string | null>(null);
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
  const paymentOptionRequired = requiresPaymentOption(pricingModel);
  const dynamicPaymentOptions = useMemo(
    () => paymentOptionsForModel(pricingModelsForService, pricingModel),
    [pricingModelsForService, pricingModel],
  );
  const paymentOptions = dynamicPaymentOptions.length > 0 ? dynamicPaymentOptions : PAYMENT_OPTIONS;
  const selectedPaymentOption =
    paymentOptions.find((option) => option.key === paymentOption) ?? paymentOptions[0];

  useEffect(() => {
    setPricingModel(pricingModelPreference);
  }, [pricingModelPreference]);

  useEffect(() => {
    setWhatIfRegion(
      canonicalRegionForRegionPreference(form.regionPreference) ?? DEFAULT_COMPARISON_REGION,
    );
    setWhatIfResult(null);
    setWhatIfStatus('idle');
    setWhatIfError(null);
  }, [comparison?.comparisonId, form]);

  useEffect(() => {
    const region =
      canonicalRegionForRegionPreference(form.regionPreference) ?? DEFAULT_COMPARISON_REGION;
    let isActive = true;

    setIsLoadingPricingModels(true);
    setPricingModelsError(null);

    client
      .getPricingModelsForService('aws', 'compute', region)
      .then((metadata) => {
        if (!isActive) {
          return;
        }

        setPricingModelsForService(metadata);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setPricingModelsForService(null);
        setPricingModelsError(formatApiError(error));
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingPricingModels(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [client, form.regionPreference]);

  useEffect(() => {
    if (!paymentOptions.some((option) => option.key === paymentOption)) {
      setPaymentOption(paymentOptions[0]?.key ?? 'no_upfront');
    }
  }, [paymentOption, paymentOptions]);

  useEffect(() => {
    setShareLink(null);
    setShareStatus('idle');
    setShareError(null);
  }, [comparison?.comparisonId, watermarkEnabled, interval, pricingModel, sharePassword]);

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
    setShareCopyWarning(null);

    try {
      const workload = await client.createWorkload(workloadInputFromForm(form));
      const share = await client.createShareLink({
        workloadId: workload.id,
        watermark: watermarkEnabled,
        expiresInDays: 30,
        pricingModel,
        granularity: interval,
        ...(sharePassword.trim() ? { password: sharePassword.trim() } : {}),
      });
      const publicUrl = publicShareUrl(share.url, share.token, interval, pricingModel);

      setShareLink({ token: share.token, publicUrl });
      void refreshShareAnalytics(share.token);
      try {
        await copyToClipboard(publicUrl);
        setShareStatus('copied');
      } catch {
        setShareStatus('ready');
        setShareCopyWarning(
          'Link created, but the browser blocked clipboard copy. Use the report link above.',
        );
      }
    } catch (error) {
      setShareStatus('idle');
      setShareError(formatApiError(error));
    }
  }

  async function refreshShareAnalytics(token: string) {
    setIsLoadingShareAnalytics(true);
    setShareAnalyticsError(null);

    try {
      setShareAnalytics(await client.getShareLinkAnalytics(token));
    } catch (error) {
      setShareAnalyticsError(formatApiError(error));
    } finally {
      setIsLoadingShareAnalytics(false);
    }
  }

  async function revokeCurrentShareLink() {
    if (!shareLink || shareStatus === 'creating') {
      return;
    }

    setShareStatus('creating');
    setShareError(null);
    setShareCopyWarning(null);

    try {
      await client.revokeShareLink(shareLink.token);
      setShareLink(null);
      setShareAnalytics(null);
      setShareAnalyticsError(null);
      setShareStatus('idle');
    } catch (error) {
      setShareStatus('ready');
      setShareError(formatApiError(error));
    }
  }

  function updatePricingModel(nextPricingModel: PricingModelKey) {
    setPricingModel(nextPricingModel);
    onPricingModelPreferenceChange?.(nextPricingModel);
  }

  async function runWhatIfScenario() {
    if (!comparison || whatIfStatus === 'running') {
      return;
    }

    setWhatIfStatus('running');
    setWhatIfError(null);

    try {
      const scenarioForm = scenarioFormFromWhatIf(form, whatIfRegion, whatIfScalePercent);
      const result = await client.createComparison(buildNwsFromForm(scenarioForm));

      setWhatIfResult(result);
      setWhatIfStatus('ready');
    } catch (error) {
      setWhatIfResult(null);
      setWhatIfStatus('idle');
      setWhatIfError(formatApiError(error));
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
                onClick={() => updatePricingModel(model.key)}
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
          {paymentOptionRequired ? (
            <>
              {' '}
              Payment option:{' '}
              <strong className="text-text-primary">{selectedPaymentOption.label}</strong>.
            </>
          ) : null}
        </p>

        {paymentOptionRequired ? (
          <div
            className="grid gap-2 rounded-lg border border-border bg-surface-0 p-3"
            aria-label="Payment option"
          >
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <strong className="text-sm font-semibold text-text-primary">Payment option</strong>
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {isLoadingPricingModels
                  ? 'Loading model metadata'
                  : pricingModelsError
                    ? 'Fallback options'
                    : 'Dynamic model metadata'}
              </span>
            </div>
            <div
              className="grid min-h-11 grid-cols-1 rounded-lg border border-border bg-surface-1 p-1 shadow-inner sm:grid-cols-3"
              role="group"
              aria-label="Reserved payment option"
            >
              {paymentOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={paymentOption === option.key}
                  title={option.detail}
                  onClick={() => setPaymentOption(option.key)}
                  className={[
                    'inline-flex min-h-10 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary',
                    paymentOption === option.key
                      ? 'bg-text-primary text-surface-1 shadow-sm'
                      : 'text-text-secondary hover:bg-surface-0 hover:text-text-primary',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {pricingModelsError ? (
              <p className="text-xs font-semibold text-text-muted">
                Backend model metadata unavailable: {pricingModelsError}
              </p>
            ) : null}
          </div>
        ) : null}

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
                {provider ? (
                  <PricingModelDeltaCue
                    provider={provider}
                    selectedModel={selectedModelCost}
                    currency={currency}
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

        <CommitmentTcoPanel
          comparison={comparison}
          currency={currency}
          selectedPaymentOption={selectedPaymentOption}
        />

        <WhatIfScenarioPanel
          baseline={comparison}
          currency={currency}
          pricingModel={pricingModel}
          result={whatIfResult}
          selectedRegion={whatIfRegion}
          selectedScalePercent={whatIfScalePercent}
          status={whatIfStatus}
          error={whatIfError}
          onRegionChange={setWhatIfRegion}
          onScaleChange={setWhatIfScalePercent}
          onRun={() => void runWhatIfScenario()}
        />
      </div>

      <WorkloadBreakdown
        currency={currency}
        comparison={comparison}
        form={form}
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
          <label className="grid gap-1 text-sm font-semibold text-text-primary">
            <span>Optional link password</span>
            <input
              type="password"
              value={sharePassword}
              onChange={(event) => setSharePassword(event.currentTarget.value)}
              placeholder="Leave blank for open read-only link"
              className="min-h-11 rounded-lg border border-border bg-surface-0 px-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
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
                · token {shareLink.token} · {pricingModelLabel(pricingModel)} ·{' '}
                {capitalize(interval)}
                {sharePassword.trim() ? ' · password protected' : ''}
              </>
            ) : (
              <>
                Create a real read-only report link scoped to this workload, pricing model, and time
                granularity. Links expire after 30 days and resolve through the backend share-token
                API.
              </>
            )}
          </div>
          {shareLink ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-3 text-xs font-semibold text-text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>
                Recipient activity:{' '}
                <strong className="text-text-primary">
                  {isLoadingShareAnalytics
                    ? 'refreshing...'
                    : shareAnalytics
                      ? shareAnalyticsSummary(shareAnalytics)
                      : 'no views recorded yet'}
                </strong>
                {shareAnalyticsError ? ` · analytics unavailable: ${shareAnalyticsError}` : ''}
              </span>
              <button
                type="button"
                className="self-start text-action-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-text-muted sm:self-auto"
                disabled={isLoadingShareAnalytics}
                onClick={() => void refreshShareAnalytics(shareLink.token)}
              >
                Refresh views
              </button>
            </div>
          ) : null}
          {shareError ? (
            <div
              className="rounded-lg border border-action-destructive bg-surface-0 p-3 text-sm text-text-primary"
              role="alert"
            >
              <strong>Share link failed.</strong> {shareError}
            </div>
          ) : null}
          {shareCopyWarning ? (
            <div className="rounded-lg border border-border bg-surface-0 p-3 text-sm text-text-secondary">
              <strong className="text-text-primary">Link ready.</strong> {shareCopyWarning}
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
              disabled={!shareLink || shareStatus === 'creating'}
              loading={shareStatus === 'creating' && Boolean(shareLink)}
              loadingLabel="Revoking..."
              onClick={() => void revokeCurrentShareLink()}
            >
              <RevokeIcon />
              Revoke
            </Button>
          </div>
          <p className="text-xs font-semibold text-text-muted">
            Current mode: {watermarkEnabled ? 'branded report' : 'white-label ready'} ·{' '}
            {shareStatus === 'copied' ? 'link copied' : 'ready for secure sharing'} ·{' '}
            {sharePassword.trim() ? 'password will be required' : 'no password set'}
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
          Best:{' '}
          {bestModel.providerTerm ?? bestModel.displayName ?? pricingModelLabel(bestModel.model)}{' '}
          saves {formatPercent(bestModel.savingsPercentVsOnDemand)}
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

function PricingModelDeltaCue({
  provider,
  selectedModel,
  currency,
}: {
  provider: ComparisonProviderResult;
  selectedModel?: PricingModelCost;
  currency: CurrencyOption;
}) {
  const onDemand = providerModelCost(provider, 'on-demand');

  if (
    !selectedModel?.available ||
    selectedModel.model === 'on-demand' ||
    selectedModel.monthlyCostUsd === undefined ||
    onDemand?.monthlyCostUsd === undefined
  ) {
    return null;
  }

  const delta = selectedModel.monthlyCostUsd - onDemand.monthlyCostUsd;
  const percent =
    onDemand.monthlyCostUsd > 0 ? Math.abs((delta / onDemand.monthlyCostUsd) * 100) : 0;
  const savesMoney = delta < 0;

  return (
    <div
      className={[
        'mt-2 rounded-lg border px-2 py-1 text-xs font-semibold',
        savesMoney
          ? 'border-[color:var(--pc-success)] bg-[color:var(--pc-success-soft)] text-text-primary'
          : 'border-[color:var(--pc-warning)] bg-[color:var(--pc-warning-soft)] text-text-primary',
      ].join(' ')}
    >
      What-if delta: {savesMoney ? 'saves' : 'adds'} {formatMoney(Math.abs(delta), currency)}/mo vs
      on-demand ({formatPercent(percent)}).
    </div>
  );
}

function CommitmentTcoPanel({
  comparison,
  currency,
  selectedPaymentOption,
}: {
  comparison: ComparisonResult | null;
  currency: CurrencyOption;
  selectedPaymentOption?: PaymentOption;
}) {
  const rows = comparison ? commitmentTcoRows(comparison) : [];

  return (
    <section
      className="grid gap-3 rounded-lg border border-border bg-surface-0 p-3"
      aria-label="Commitment payment and total cost of ownership"
    >
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Payment and TCO detail
          </p>
          <h3 className="mt-1 text-base font-semibold text-text-primary">
            Commitment scenario monthly, hourly, and term view
          </h3>
        </div>
        <span className="rounded-full border border-border bg-surface-1 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Payment lens: {selectedPaymentOption?.label ?? 'Provider default'}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-[1080px] w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-surface-1 text-left text-xs font-bold uppercase tracking-wide text-text-muted">
              <th className="border-b border-border px-3 py-2">Provider</th>
              <th className="border-b border-border px-3 py-2">Model</th>
              <th className="border-b border-border px-3 py-2 text-right">Effective hourly</th>
              <th className="border-b border-border px-3 py-2 text-right">Monthly recurring</th>
              <th className="border-b border-border px-3 py-2 text-right">Upfront cash</th>
              <th className="border-b border-border px-3 py-2">Payment option</th>
              <th className="border-b border-border px-3 py-2">Term</th>
              <th className="border-b border-border px-3 py-2 text-right">Term TCO</th>
              <th className="border-b border-border px-3 py-2 text-right">Savings</th>
              <th className="border-b border-border px-3 py-2">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={`${row.providerId}-${row.model}`}>
                  <td className="border-b border-border px-3 py-2 font-semibold text-text-primary">
                    {providerLabel(row.providerId)}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-text-secondary">
                    {pricingModelLabel(row.model)}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right font-mono text-text-primary">
                    {row.available && row.hourlyCostUsd !== undefined
                      ? formatMoney(row.hourlyCostUsd, currency)
                      : 'N/A'}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right font-mono text-text-primary">
                    {row.available && row.monthlyCostUsd !== undefined
                      ? formatMoney(row.monthlyCostUsd, currency)
                      : 'N/A'}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right font-mono text-text-primary">
                    {row.available && row.upfrontCostUsd !== undefined
                      ? formatMoney(row.upfrontCostUsd, currency)
                      : 'N/A'}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-text-secondary">
                    {row.paymentOption}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-text-secondary">
                    {row.term}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right font-mono text-text-primary">
                    {row.termTotalUsd !== undefined
                      ? formatMoney(row.termTotalUsd, currency)
                      : 'N/A'}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right font-mono text-text-primary">
                    {row.savingsPercentVsOnDemand !== undefined
                      ? formatPercent(row.savingsPercentVsOnDemand)
                      : 'N/A'}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-text-secondary">
                    {row.evidence}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-3 text-text-secondary" colSpan={10}>
                  Run a comparison to populate commitment payment and TCO evidence.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-5 text-text-muted">
        Upfront cash amounts are shown only when provider catalog evidence exposes them. Otherwise
        PolyCost reports the selected payment option and effective recurring run-rate without
        inventing an upfront charge.
      </p>
    </section>
  );
}

function WhatIfScenarioPanel({
  baseline,
  currency,
  error,
  onRegionChange,
  onRun,
  onScaleChange,
  pricingModel,
  result,
  selectedRegion,
  selectedScalePercent,
  status,
}: {
  baseline: ComparisonResult | null;
  currency: CurrencyOption;
  error: string | null;
  onRegionChange: (region: string) => void;
  onRun: () => void;
  onScaleChange: (scalePercent: number) => void;
  pricingModel: PricingModelKey;
  result: ComparisonResult | null;
  selectedRegion: string;
  selectedScalePercent: number;
  status: WhatIfStatus;
}) {
  const baselineSummary = selectedScenarioSummary(baseline, pricingModel);
  const resultSummary = selectedScenarioSummary(result, pricingModel);
  const delta =
    baselineSummary?.monthlyCostUsd !== undefined && resultSummary?.monthlyCostUsd !== undefined
      ? resultSummary.monthlyCostUsd - baselineSummary.monthlyCostUsd
      : undefined;
  const annualDelta = delta !== undefined ? delta * 12 : undefined;

  return (
    <section
      className="grid gap-3 rounded-lg border border-border bg-surface-0 p-3"
      aria-label="Region and scale what-if"
    >
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Region and scale what-if
          </p>
          <h3 className="mt-1 text-base font-semibold text-text-primary">
            Cache-backed rerun without natural-language reparse
          </h3>
        </div>
        <span className="rounded-full border border-border bg-surface-1 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {pricingModelLabel(pricingModel)} scenario
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="grid gap-1 text-sm font-semibold text-text-primary">
          <span>Target region group</span>
          <select
            value={selectedRegion}
            onChange={(event) => onRegionChange(event.currentTarget.value)}
            className="min-h-11 rounded-lg border border-border bg-surface-1 px-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
          >
            {COMPARISON_REGION_GROUPS.map((group) => (
              <option value={group.id} key={group.id}>
                {group.label} · AWS {group.providerRegions.aws} · Azure{' '}
                {group.providerRegions.azure} · GCP {group.providerRegions.gcp}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-text-primary">
          <span>Scale assumption</span>
          <select
            value={selectedScalePercent}
            onChange={(event) => onScaleChange(Number.parseInt(event.currentTarget.value, 10))}
            className="min-h-11 rounded-lg border border-border bg-surface-1 px-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
          >
            {SCALE_SCENARIOS.map((scenario) => (
              <option value={scenario.value} key={scenario.value}>
                {scenario.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={!baseline || status === 'running'}
          loading={status === 'running'}
          loadingLabel="Running what-if..."
          onClick={onRun}
        >
          <ScenarioIcon />
          Run what-if
        </Button>
      </div>

      {error ? (
        <div
          className="rounded-lg border border-action-destructive bg-surface-1 p-3 text-sm text-text-primary"
          role="alert"
        >
          <strong>What-if failed.</strong> {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <InfoTile
          label="Baseline"
          value={
            baselineSummary
              ? `${providerLabel(baselineSummary.providerId)} ${formatMoney(
                  baselineSummary.monthlyCostUsd,
                  currency,
                )}`
              : 'Pending'
          }
          detail="Current interpreted service set."
        />
        <InfoTile
          label="Scenario"
          value={
            resultSummary
              ? `${providerLabel(resultSummary.providerId)} ${formatMoney(
                  resultSummary.monthlyCostUsd,
                  currency,
                )}`
              : status === 'running'
                ? 'Running'
                : 'Not run'
          }
          detail={`${selectedScalePercent}% scale in ${selectedRegion}.`}
        />
        <InfoTile
          label="Before / after delta"
          value={delta !== undefined ? formatSignedMoney(delta, currency) : 'Pending'}
          detail={
            annualDelta !== undefined
              ? `${formatSignedMoney(annualDelta, currency)} annualized.`
              : 'Run what-if to calculate delta.'
          }
        />
      </div>

      {result ? (
        <p className="text-xs leading-5 text-text-muted">
          Scenario comparison {result.comparisonId} was generated from the existing reviewed form
          via the cached comparison API. Natural-language parsing was not invoked.
        </p>
      ) : (
        <p className="text-xs leading-5 text-text-muted">
          This clones the reviewed requirement model, adjusts region and scale fields, and calls the
          same cache-backed comparison endpoint used by the main result.
        </p>
      )}
    </section>
  );
}

function WorkloadBreakdown({
  comparison,
  currency,
  form,
  interval,
  pricingModel,
  isLoading,
}: {
  comparison: ComparisonResult | null;
  currency: CurrencyOption;
  form: WorkloadFormState;
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

      <EgressTierAudit comparison={comparison} currency={currency} form={form} />

      <p className="text-xs leading-5 text-text-muted">
        Egress covers direct public-internet transfer only. Inter-region transfer, cross-service
        transfer, CDN edge pricing, and archive retrieval fees stay outside this v1 scoped model.
      </p>
    </section>
  );
}

function EgressTierAudit({
  comparison,
  currency,
  form,
}: {
  comparison: ComparisonResult | null;
  currency: CurrencyOption;
  form: WorkloadFormState;
}) {
  const rows = egressTierAuditRows(comparison, form);

  return (
    <section
      className="grid gap-3 rounded-lg border border-border bg-surface-0 p-3"
      aria-label="Egress tiered breakdown"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Egress tiered breakdown
        </p>
        <h4 className="mt-1 text-base font-semibold text-text-primary">
          Provider transfer tiers and effective blended rate
        </h4>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-[860px] w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-surface-1 text-left text-xs font-bold uppercase tracking-wide text-text-muted">
              <th className="border-b border-border px-3 py-2">Provider</th>
              <th className="border-b border-border px-3 py-2">Region</th>
              <th className="border-b border-border px-3 py-2">Tier band</th>
              <th className="border-b border-border px-3 py-2 text-right">Billable GB</th>
              <th className="border-b border-border px-3 py-2 text-right">Rate / GB</th>
              <th className="border-b border-border px-3 py-2 text-right">Tier subtotal</th>
              <th className="border-b border-border px-3 py-2 text-right">Effective blended</th>
              <th className="border-b border-border px-3 py-2">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.key}>
                  <td className="border-b border-border px-3 py-2 font-semibold text-text-primary">
                    {providerLabel(row.providerId)}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-text-secondary">
                    {row.region}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-text-secondary">
                    {row.tierBand}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right font-mono text-text-primary">
                    {formatRate(row.billableGb)}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right font-mono text-text-primary">
                    {formatMoney(row.pricePerGb, currency)}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right font-mono text-text-primary">
                    {formatMoney(row.monthlyCostUsd, currency)}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right font-mono text-text-primary">
                    {row.effectiveBlendedRateUsd !== undefined
                      ? formatMoney(row.effectiveBlendedRateUsd, currency)
                      : 'N/A'}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-text-secondary">
                    {row.evidence}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-3 text-text-secondary" colSpan={8}>
                  No tiered egress rows were published for this comparison. Flat egress line items
                  still appear in the provider cost breakdown above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface CommitmentTcoRow {
  providerId: ProviderId;
  model: PricingModelKey;
  available: boolean;
  hourlyCostUsd?: number;
  monthlyCostUsd?: number;
  upfrontCostUsd?: number;
  paymentOption: string;
  term: string;
  termTotalUsd?: number;
  savingsPercentVsOnDemand?: number;
  evidence: string;
}

interface EgressTierAuditRow {
  key: string;
  providerId: ProviderId;
  region: string;
  tierBand: string;
  billableGb: number;
  pricePerGb: number;
  monthlyCostUsd: number;
  effectiveBlendedRateUsd?: number;
  evidence: string;
}

interface SelectedScenarioSummary {
  providerId: ProviderId;
  monthlyCostUsd: number;
}

function selectedScenarioSummary(
  comparison: ComparisonResult | null,
  pricingModel: PricingModelKey,
): SelectedScenarioSummary | undefined {
  return comparison?.providers
    .map((provider) => ({
      providerId: provider.providerId,
      modelCost: providerModelCost(provider, pricingModel),
    }))
    .filter(
      (
        row,
      ): row is {
        providerId: ProviderId;
        modelCost: PricingModelCost & { monthlyCostUsd: number };
      } => row.modelCost.available && row.modelCost.monthlyCostUsd !== undefined,
    )
    .map((row) => ({
      providerId: row.providerId,
      monthlyCostUsd: row.modelCost.monthlyCostUsd,
    }))
    .sort((left, right) => left.monthlyCostUsd - right.monthlyCostUsd)[0];
}

function commitmentTcoRows(comparison: ComparisonResult): CommitmentTcoRow[] {
  return PROVIDER_ORDER.flatMap((providerId) => {
    const provider = comparison.providers.find((candidate) => candidate.providerId === providerId);

    if (!provider) {
      return [];
    }

    return PRICING_MODELS.map((pricingModel) => {
      const modelCost = providerModelCost(provider, pricingModel.key);
      const termMonths = termMonthsForModel(modelCost);
      const monthlyCostUsd = modelCost.available ? modelCost.monthlyCostUsd : undefined;
      const hourlyCostUsd =
        modelCost.available && monthlyCostUsd !== undefined
          ? (modelCost.hourlyCostUsd ?? hourlyFromMonthly(monthlyCostUsd))
          : undefined;
      const termTotalUsd =
        monthlyCostUsd !== undefined && termMonths !== undefined
          ? roundCurrency(monthlyCostUsd * termMonths + (modelCost.upfrontCostUsd ?? 0))
          : undefined;

      return {
        providerId,
        model: pricingModel.key,
        available: modelCost.available,
        ...(hourlyCostUsd !== undefined ? { hourlyCostUsd } : {}),
        ...(monthlyCostUsd !== undefined ? { monthlyCostUsd } : {}),
        ...(modelCost.upfrontCostUsd !== undefined
          ? { upfrontCostUsd: modelCost.upfrontCostUsd }
          : {}),
        paymentOption: paymentOptionEvidence(modelCost),
        term: termMonths !== undefined ? `${termMonths} months` : termEvidence(pricingModel.key),
        ...(termTotalUsd !== undefined ? { termTotalUsd } : {}),
        ...(modelCost.savingsPercentVsOnDemand !== undefined
          ? { savingsPercentVsOnDemand: modelCost.savingsPercentVsOnDemand }
          : {}),
        evidence: commitmentEvidence(modelCost),
      };
    });
  });
}

function termMonthsForModel(modelCost: PricingModelCost): number | undefined {
  if (modelCost.commitmentTermMonths !== undefined) {
    return modelCost.commitmentTermMonths;
  }

  if (modelCost.model === 'reserved-1yr' || modelCost.model === 'savings-plan') {
    return 12;
  }

  if (modelCost.model === 'reserved-3yr') {
    return 36;
  }

  return undefined;
}

function paymentOptionEvidence(modelCost: PricingModelCost): string {
  if (!modelCost.available) {
    return 'N/A';
  }

  if (modelCost.upfrontOption === 'all') {
    return 'All upfront';
  }

  if (modelCost.upfrontOption === 'partial') {
    return 'Partial upfront';
  }

  if (modelCost.upfrontOption === 'none') {
    return 'No upfront';
  }

  if (requiresPaymentOption(modelCost.model)) {
    return 'Provider default / not published';
  }

  return 'No commitment';
}

function termEvidence(model: PricingModelKey): string {
  if (model === 'spot') {
    return 'Interruptible';
  }

  return 'No fixed term';
}

function commitmentEvidence(modelCost: PricingModelCost): string {
  if (!modelCost.available) {
    return modelCost.unavailableReason ?? 'Not available for this configuration.';
  }

  const evidence = [
    modelCost.providerTerm ?? modelCost.displayName ?? pricingModelLabel(modelCost.model),
    modelCost.upfrontCostUsd !== undefined
      ? `upfront ${formatMoney(modelCost.upfrontCostUsd, USD_CURRENCY)}`
      : undefined,
    modelCost.estimated ? 'estimate' : undefined,
    modelCost.volatility === 'volatile' ? 'volatile' : undefined,
    modelCost.caveat,
  ].filter(Boolean);

  return evidence.join(' · ');
}

function egressTierAuditRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): EgressTierAuditRow[] {
  const requestedGb = nonNegativeNumberOrDefault(form.monthlyEgressGb, 0);

  return (
    comparison?.providers.flatMap((provider) =>
      provider.lineItems
        .filter((lineItem) => lineItemComponent(lineItem) === 'egress')
        .flatMap((lineItem, lineItemIndex) => {
          const tierRows =
            lineItem.egressTiers?.map((tier, tierIndex) => ({
              key: `${provider.providerId}-${lineItemIndex}-${tierIndex}`,
              providerId: provider.providerId,
              region: lineItem.region ?? 'Provider default',
              tierBand: tierBandLabel(tier.tierFromGb, tier.tierToGb),
              billableGb: tier.billableGb,
              pricePerGb: tier.pricePerGb,
              monthlyCostUsd: tier.monthlyCostUsd,
              effectiveBlendedRateUsd:
                requestedGb > 0
                  ? roundCurrency(lineItem.baseMonthlyCostUsd / requestedGb)
                  : undefined,
              evidence: `${lineItem.pricingBasis ?? 'tiered'} catalog tier · ${lineItem.description}`,
            })) ?? [];

          if (tierRows.length > 0) {
            return tierRows;
          }

          if (lineItem.baseMonthlyCostUsd <= 0) {
            return [];
          }

          const effectiveRate =
            requestedGb > 0 ? lineItem.baseMonthlyCostUsd / requestedGb : undefined;

          return [
            {
              key: `${provider.providerId}-${lineItemIndex}-flat`,
              providerId: provider.providerId,
              region: lineItem.region ?? 'Provider default',
              tierBand: lineItem.pricingBasis === 'tiered' ? 'Tier subtotal' : 'Flat / blended',
              billableGb: requestedGb,
              pricePerGb: lineItem.unitPriceUsd ?? effectiveRate ?? 0,
              monthlyCostUsd: lineItem.baseMonthlyCostUsd,
              ...(effectiveRate !== undefined
                ? { effectiveBlendedRateUsd: roundCurrency(effectiveRate) }
                : {}),
              evidence:
                lineItem.pricingBasis === 'tiered'
                  ? 'Tiered subtotal published without tier-band trace rows.'
                  : `${lineItem.unit ?? 'unit'} line item · ${lineItem.description}`,
            },
          ];
        }),
    ) ?? []
  );
}

function tierBandLabel(tierFromGb: number, tierToGb?: number): string {
  return tierToGb !== undefined
    ? `${formatRate(tierFromGb)}-${formatRate(tierToGb)} GB`
    : `${formatRate(tierFromGb)}+ GB`;
}

function scenarioFormFromWhatIf(
  form: WorkloadFormState,
  regionPreference: string,
  scalePercent: number,
): WorkloadFormState {
  return {
    ...form,
    regionPreference,
    dailyActiveUsers: scaleNumericField(form.dailyActiveUsers, scalePercent, {
      integer: true,
      min: 0,
    }),
    peakConcurrentUsers: scaleNumericField(form.peakConcurrentUsers, scalePercent, {
      integer: true,
      min: 0,
    }),
    instanceCount: scaleNumericField(form.instanceCount, scalePercent, { integer: true, min: 1 }),
    autoscaleMin: scaleNumericField(form.autoscaleMin, scalePercent, { integer: true, min: 1 }),
    autoscaleMax: scaleNumericField(form.autoscaleMax, scalePercent, { integer: true, min: 1 }),
    storageSizeGb: scaleNumericField(form.storageSizeGb, scalePercent, { min: 0 }),
    databaseSizeGb: scaleNumericField(form.databaseSizeGb, scalePercent, { min: 0 }),
    monthlyEgressGb: scaleNumericField(form.monthlyEgressGb, scalePercent, { min: 0 }),
  };
}

function scaleNumericField(
  value: string,
  scalePercent: number,
  options: { integer?: boolean; min: number },
): string {
  if (!value.trim()) {
    return value;
  }

  const parsed = Number.parseFloat(value.replace(/,/g, '').trim());

  if (!Number.isFinite(parsed)) {
    return value;
  }

  const scaled = Math.max(options.min, parsed * (scalePercent / 100));

  if (options.integer) {
    return Math.round(scaled).toString();
  }

  return roundCurrency(scaled).toString();
}

function workloadInputFromForm(form: WorkloadFormState): WorkloadInput {
  const vcpu = positiveNumberOrDefault(form.vcpu, 2);
  const memoryGb = positiveNumberOrDefault(form.memoryGb, 4);

  return {
    instanceFamily: instanceFamilyForWorkload(form.instanceTier, vcpu, memoryGb),
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
  instanceTier: WorkloadFormState['instanceTier'],
  vcpu: number,
  memoryGb: number,
): NormalizedInstanceFamily {
  switch (instanceTier) {
    case 'compute':
      return 'compute-optimized';
    case 'memory':
      return 'memory-optimized';
    case 'storage':
      return 'storage-optimized';
    case 'accelerated':
      return 'accelerated-computing';
    case 'small':
      return 'burstable';
    case 'balanced':
      return 'general-purpose';
    case 'custom':
      break;
  }

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

function publicShareUrl(
  apiShareUrl: string,
  token: string,
  interval: IntervalKey,
  pricingModel: PricingModelKey,
): string {
  const tokenFromUrl = apiShareUrl.match(/\/share\/([^/?#]+)/)?.[1] ?? token;
  const publicPath = `/share/${tokenFromUrl}`;
  const url = new URL(publicPath, window.location.origin);

  url.searchParams.set('interval', interval);
  url.searchParams.set('pricingModel', pricingModel);

  return url.toString();
}

function shareAnalyticsSummary(analytics: ShareLinkAnalyticsResponse): string {
  const viewLabel = analytics.totalViews === 1 ? 'view' : 'views';
  const lastViewed = analytics.lastViewedAt
    ? `, last viewed ${formatReportDate(analytics.lastViewedAt)}`
    : '';

  return `${analytics.totalViews} ${viewLabel}${lastViewed}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  const [password, setPassword] = useState('');
  const [submittedPassword, setSubmittedPassword] = useState<string | undefined>();

  useEffect(() => {
    let isActive = true;

    setReport(null);
    setError(null);

    client
      .getSharedReport(token, submittedPassword)
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
  }, [client, submittedPassword, token]);

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    setSubmittedPassword(password.trim() || undefined);
  }

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
            {error.toLowerCase().includes('password') ? (
              <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={submitPassword}>
                <label className="sr-only" htmlFor="share-password">
                  Share password
                </label>
                <input
                  id="share-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  placeholder="Enter share password"
                  className="min-h-11 rounded-lg border border-border bg-surface-1 px-3 text-sm text-text-primary"
                />
                <Button type="submit" variant="primary">
                  Open report
                </Button>
              </form>
            ) : null}
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
              <InfoTile
                label="Shared scenario"
                value={`${pricingModelLabel(report.pricingModel)} · ${capitalize(report.granularity)}`}
                detail={report.passwordProtected ? 'Password protected.' : 'Open read-only link.'}
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
  const networkingMonthly =
    provider.breakdown?.networkingMonthlyCostUsd ?? componentTotal(provider, 'networking');
  const databaseMonthly = databaseMonthlyCost(provider);
  const supportMonthly =
    provider.breakdown?.supportMonthlyCostUsd ?? componentTotal(provider, 'support');
  const licensingMonthly =
    provider.breakdown?.licensingMonthlyCostUsd ?? componentTotal(provider, 'licensing');
  const operationsMonthly =
    provider.breakdown?.operationsMonthlyCostUsd ?? componentTotal(provider, 'operations');
  const selectedModelCost = providerModelCost(provider, pricingModel);
  const selectedComputeMonthly =
    selectedModelCost.available && selectedModelCost.monthlyCostUsd !== undefined
      ? Math.max(
          0,
          selectedModelCost.monthlyCostUsd -
            storageMonthly -
            egressMonthly -
            networkingMonthly -
            databaseMonthly -
            supportMonthly -
            licensingMonthly -
            operationsMonthly,
        )
      : (provider.breakdown?.computeMonthlyCostUsd ?? componentTotal(provider, 'compute'));
  const compute = selectedComputeMonthly * multiplier;
  const storage = storageMonthly * multiplier;
  const egress = egressMonthly * multiplier;
  const networking = networkingMonthly * multiplier;
  const support = supportMonthly * multiplier;
  const licensing = licensingMonthly * multiplier;
  const operations = operationsMonthly * multiplier;
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
    {
      key: 'networking',
      label: 'Networking',
      total: roundCurrency(networking),
      className: 'bg-cyan-500',
    },
    {
      key: 'support',
      label: 'Support plan',
      total: roundCurrency(support),
      className: 'bg-amber-500',
    },
    {
      key: 'licensing',
      label: 'OS licensing',
      total: roundCurrency(licensing),
      className: 'bg-sky-500',
    },
    {
      key: 'operations',
      label: 'Resilience ops',
      total: roundCurrency(operations),
      className: 'bg-emerald-500',
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
      hourlyCostUsd: provider.totals.hourly ?? hourlyFromMonthly(provider.totals.monthly),
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

  if (modelCost.model === 'spot' && modelCost.estimated) {
    return formatSpotEstimateRange(modelCost, interval, currency);
  }

  if (interval === 'hourly') {
    return formatMoney(
      modelCost.hourlyCostUsd ?? hourlyFromMonthly(modelCost.monthlyCostUsd),
      currency,
    );
  }

  return formatMoney(modelCost.monthlyCostUsd * intervalCostMultiplier(interval), currency);
}

function formatSpotEstimateRange(
  modelCost: PricingModelCost,
  interval: IntervalKey,
  currency: CurrencyOption,
): string {
  const baseCost =
    interval === 'hourly'
      ? (modelCost.hourlyCostUsd ?? hourlyFromMonthly(modelCost.monthlyCostUsd ?? 0))
      : (modelCost.monthlyCostUsd ?? 0) * intervalCostMultiplier(interval);

  return `Est. ${formatMoney(baseCost * 0.8, currency)}-${formatMoney(baseCost * 1.2, currency)}`;
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

  if (selected.model === 'spot' && selected.estimated) {
    const low = selected.monthlyCostUsd * 0.8;
    const high = selected.monthlyCostUsd * 1.2;

    return `${label}: estimated ${formatMoney(low, currency)}-${formatMoney(high, currency)}/mo range · volatile interruptible capacity`;
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

function requiresPaymentOption(model: PricingModelKey): boolean {
  return model === 'reserved-1yr' || model === 'reserved-3yr' || model === 'savings-plan';
}

function paymentOptionsForModel(
  metadata: PricingModelsForServiceResponse | null,
  model: PricingModelKey,
): PaymentOption[] {
  const termCode = pricingTermCodeForModel(model);
  const options = metadata?.models.find((item) => item.code === termCode)?.paymentOptions ?? [];

  return options
    .filter(
      (option): option is { code: PaymentOptionKey; label: string } =>
        option.code === 'no_upfront' ||
        option.code === 'partial_upfront' ||
        option.code === 'all_upfront',
    )
    .map((option) => ({
      key: option.code,
      label: option.label,
      detail: paymentOptionDetail(option.code),
    }));
}

function pricingTermCodeForModel(
  model: PricingModelKey,
): PricingModelsForServiceResponse['models'][number]['code'] {
  switch (model) {
    case 'reserved-1yr':
      return 'reserved_1yr';
    case 'reserved-3yr':
      return 'reserved_3yr';
    case 'savings-plan':
      return 'savings_plan_1yr';
    case 'spot':
      return 'spot_estimate';
    case 'on-demand':
      return 'on_demand';
  }
}

function paymentOptionDetail(option: PaymentOptionKey): string {
  return (
    PAYMENT_OPTIONS.find((item) => item.key === option)?.detail ??
    'Provider-specific commitment payment option.'
  );
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

function ScenarioIcon() {
  return <IconPath path="M4 7h9a4 4 0 0 1 0 8H8M8 11l-4 4 4 4M14 5l2-2 2 2M16 3v10" />;
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
  return intervalMultiplierFromMonthly(interval);
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

function formatSignedMoney(value: number, currency: CurrencyOption): string {
  if (value === 0) {
    return formatMoney(0, currency);
  }

  return `${value > 0 ? '+' : '-'}${formatMoney(Math.abs(value), currency)}`;
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
