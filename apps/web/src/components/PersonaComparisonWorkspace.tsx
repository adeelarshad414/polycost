import { useEffect, useMemo, useState } from 'react';
import { configuredApiBaseUrl } from '../api-client';
import { Button } from './Button';
import {
  ComparisonLineItem,
  ComparisonProviderResult,
  ComparisonResult,
  IntervalKey,
  PROVIDER_ORDER,
  ProviderId,
  ReportFormat,
} from '../types';
import { WorkloadFormState } from '../workload';

type PersonaViewMode = 'executive' | 'engineering';
type SortKey = 'resourceName' | 'provider' | 'region' | 'spec' | 'monthlyCost';
type SortDirection = 'asc' | 'desc';

interface PersonaComparisonWorkspaceProps {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
  form: WorkloadFormState;
  isLoading?: boolean;
  error?: string | null;
  exportingFormat?: ReportFormat | null;
  onExport?: (format: ReportFormat) => void;
}

interface PersonaComparisonData {
  comparisonId?: string;
  pricingAsOf?: string;
  providerSummaries: PersonaProviderSummary[];
  rows: EngineeringCostRow[];
  cheapest?: PersonaProviderSummary;
  secondCheapest?: PersonaProviderSummary;
  highest?: PersonaProviderSummary;
  monthlySpread?: number;
  annualForecast?: number;
  activeRegion: string;
  warningMessages: string[];
  missingEngineeringFields: string[];
}

interface PersonaProviderSummary {
  providerId: ProviderId;
  providerName: string;
  monthlyTotal?: number;
  intervalTotal?: number;
  lineItemCount: number;
  approximateCount: number;
}

interface EngineeringCostRow {
  id: string;
  resourceName: string;
  providerId: ProviderId;
  providerName: string;
  category: ComparisonLineItem['category'];
  region: string;
  spec: string;
  monthlyCost: number;
  description: string;
  isApproximate: boolean;
  tags: string[];
}

const PERSONA_VIEW_STORAGE_KEY = 'polycost-persona-view';

export function PersonaComparisonWorkspace({
  comparison,
  interval,
  form,
  isLoading = false,
  error = null,
  exportingFormat = null,
  onExport,
}: PersonaComparisonWorkspaceProps) {
  const [viewMode, setViewMode] = useState<PersonaViewMode>(() => storedPersonaViewMode());
  const [sortKey, setSortKey] = useState<SortKey>('monthlyCost');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [tagFilter, setTagFilter] = useState('all');
  const data = usePersonaComparisonData(comparison, interval, form);

  useEffect(() => {
    storePersonaViewMode(viewMode);
  }, [viewMode]);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    data.rows.forEach((row) => row.tags.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort((left, right) => left.localeCompare(right));
  }, [data.rows]);

  const sortedRows = useMemo(() => {
    const filteredRows =
      tagFilter === 'all' ? data.rows : data.rows.filter((row) => row.tags.includes(tagFilter));

    return [...filteredRows].sort((left, right) => {
      const sortValue = compareRows(left, right, sortKey);
      return sortDirection === 'asc' ? sortValue : sortValue * -1;
    });
  }, [data.rows, sortDirection, sortKey, tagFilter]);

  function handleSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === 'monthlyCost' ? 'desc' : 'asc');
  }

  return (
    <section className="mt-6 min-w-0 space-y-4" aria-label="Persona-aware cost views">
      <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-1 p-3 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">View mode</p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">
            Choose the lens for this comparison
          </h2>
        </div>
        <PersonaViewSwitcher viewMode={viewMode} onViewModeChange={setViewMode} />
      </div>

      <SharedComparisonState data={data} error={error} isLoading={isLoading} />

      {viewMode === 'executive' ? (
        <ExecutivePersonaView
          data={data}
          exportingFormat={exportingFormat}
          isLoading={isLoading}
          onExport={onExport}
        />
      ) : (
        <EngineeringPersonaView
          apiEndpoint={comparisonApiEndpoint(data.comparisonId)}
          data={data}
          exportingFormat={exportingFormat}
          isLoading={isLoading}
          onExport={onExport}
          onSort={handleSort}
          rows={sortedRows}
          sortDirection={sortDirection}
          sortKey={sortKey}
          tagFilter={tagFilter}
          tagOptions={tagOptions}
          onTagFilterChange={setTagFilter}
        />
      )}
    </section>
  );
}

export function usePersonaComparisonData(
  comparison: ComparisonResult | null,
  interval: IntervalKey,
  form: WorkloadFormState,
): PersonaComparisonData {
  return useMemo(() => {
    const providerSummaries = PROVIDER_ORDER.map((providerId): PersonaProviderSummary => {
      const provider = comparison?.providers.find(
        (candidate) => candidate.providerId === providerId,
      );

      return {
        providerId,
        providerName: providerLabel(providerId),
        monthlyTotal: provider?.totals.monthly,
        intervalTotal: provider ? costForInterval(provider, interval) : undefined,
        lineItemCount: provider?.lineItems.length ?? 0,
        approximateCount:
          provider?.lineItems.filter((lineItem) => lineItem.isApproximate).length ?? 0,
      };
    });
    const pricedSummaries = providerSummaries
      .filter((summary): summary is PersonaProviderSummary & { monthlyTotal: number } => {
        return summary.monthlyTotal !== undefined;
      })
      .sort((left, right) => left.monthlyTotal - right.monthlyTotal);
    const activeRegion = form.regionPreference.trim() || 'Provider default region';
    const rows =
      comparison?.providers.flatMap((provider) =>
        provider.lineItems.map((lineItem, index) =>
          engineeringRowFromLineItem(provider.providerId, lineItem, index, activeRegion),
        ),
      ) ?? [];
    const cheapest = pricedSummaries[0];
    const secondCheapest = pricedSummaries[1];
    const highest = pricedSummaries.at(-1);
    const monthlySpread =
      cheapest?.monthlyTotal !== undefined && highest?.monthlyTotal !== undefined
        ? roundCurrency(highest.monthlyTotal - cheapest.monthlyTotal)
        : undefined;

    return {
      comparisonId: comparison?.comparisonId,
      pricingAsOf: comparison?.pricingAsOf,
      providerSummaries,
      rows,
      cheapest,
      secondCheapest,
      highest,
      monthlySpread,
      annualForecast: cheapest ? roundCurrency(cheapest.monthlyTotal * 12) : undefined,
      activeRegion,
      warningMessages: comparison?.warnings?.map((warning) => warning.message) ?? [],
      missingEngineeringFields: [
        'Per-line-item SKU/spec details are not exposed by the comparison API yet.',
        'Per-line-item region is inferred from the workload preference, not returned per row.',
        'Tags are not present in the comparison response yet.',
      ],
    };
  }, [comparison, form.regionPreference, interval]);
}

function PersonaViewSwitcher({
  viewMode,
  onViewModeChange,
}: {
  viewMode: PersonaViewMode;
  onViewModeChange: (viewMode: PersonaViewMode) => void;
}) {
  return (
    <div
      className="grid min-h-11 grid-cols-2 rounded-lg border border-border bg-surface-0 p-1 shadow-inner sm:inline-grid"
      role="group"
      aria-label="Persona view mode"
    >
      <button
        type="button"
        aria-pressed={viewMode === 'executive'}
        onClick={() => onViewModeChange('executive')}
        className={viewModeButtonClassName(viewMode === 'executive')}
      >
        <ExecutiveIcon />
        Executive view
      </button>
      <button
        type="button"
        aria-pressed={viewMode === 'engineering'}
        onClick={() => onViewModeChange('engineering')}
        className={viewModeButtonClassName(viewMode === 'engineering')}
      >
        <EngineeringIcon />
        Engineering view
      </button>
    </div>
  );
}

function ExecutivePersonaView({
  data,
  exportingFormat,
  isLoading,
  onExport,
}: {
  data: PersonaComparisonData;
  exportingFormat: ReportFormat | null;
  isLoading: boolean;
  onExport?: (format: ReportFormat) => void;
}) {
  const monthlySavings =
    data.cheapest?.monthlyTotal !== undefined && data.secondCheapest?.monthlyTotal !== undefined
      ? roundCurrency(data.secondCheapest.monthlyTotal - data.cheapest.monthlyTotal)
      : undefined;

  return (
    <div className="space-y-4" aria-label="Executive comparison view">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ExecutiveMetricCard
          detail={
            data.cheapest ? `${data.cheapest.providerName} currently leads` : 'Run a comparison'
          }
          label="Estimated monthly spend"
          value={data.cheapest ? formatCurrency(data.cheapest.monthlyTotal ?? 0) : 'Pending'}
        />
        <ExecutiveMetricCard
          detail={
            monthlySavings !== undefined
              ? `${formatCurrency(monthlySavings)} below next option`
              : 'Need at least two priced clouds'
          }
          label="Best priced cloud"
          value={data.cheapest?.providerName ?? 'Pending'}
        />
        <ExecutiveMetricCard
          detail="Simple 12-month projection before private discounts"
          label="12-month forecast"
          value={
            data.annualForecast !== undefined ? formatCurrency(data.annualForecast) : 'Pending'
          }
        />
      </div>

      <section className="rounded-lg border border-border bg-surface-1 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Recommendation
            </p>
            <h3 className="mt-2 text-xl font-semibold text-text-primary">
              {executiveRecommendationHeadline(data, monthlySavings)}
            </h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {executiveRecommendationDetail(data)}
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={
              !data.comparisonId ||
              isLoading ||
              !onExport ||
              (exportingFormat !== null && exportingFormat !== 'pdf')
            }
            loading={exportingFormat === 'pdf'}
            loadingLabel="Exporting summary..."
            onClick={() => onExport?.('pdf')}
            className="self-start lg:self-auto"
          >
            <ExportIcon />
            Export summary
          </Button>
        </div>
      </section>
    </div>
  );
}

function EngineeringPersonaView({
  apiEndpoint,
  data,
  exportingFormat,
  isLoading,
  onExport,
  onSort,
  rows,
  sortDirection,
  sortKey,
  tagFilter,
  tagOptions,
  onTagFilterChange,
}: {
  apiEndpoint?: string;
  data: PersonaComparisonData;
  exportingFormat: ReportFormat | null;
  isLoading: boolean;
  onExport?: (format: ReportFormat) => void;
  onSort: (sortKey: SortKey) => void;
  rows: EngineeringCostRow[];
  sortDirection: SortDirection;
  sortKey: SortKey;
  tagFilter: string;
  tagOptions: string[];
  onTagFilterChange: (tag: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-4" aria-label="Engineering comparison view">
      <div className="grid min-w-0 gap-3 rounded-lg border border-border bg-surface-1 p-3 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="grid gap-1 text-sm font-semibold text-text-primary">
          <span>Filter by tag</span>
          <select
            value={tagFilter}
            onChange={(event) => onTagFilterChange(event.target.value)}
            className="min-h-11 rounded-lg border border-border bg-surface-0 px-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
          >
            <option value="all">All tags</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          {tagOptions.length === 0 ? (
            <span className="text-xs font-normal text-text-muted">
              Tag filtering is ready in the UI; the current API does not return tags yet.
            </span>
          ) : null}
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            disabled={
              !data.comparisonId ||
              isLoading ||
              !onExport ||
              (exportingFormat !== null && exportingFormat !== 'csv')
            }
            loading={exportingFormat === 'csv'}
            loadingLabel="Exporting CSV..."
            onClick={() => onExport?.('csv')}
          >
            <ExportIcon />
            Export CSV
          </Button>
          {apiEndpoint ? (
            <a
              href={apiEndpoint}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface-1 px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-surface-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
            >
              <ApiIcon />
              API JSON
            </a>
          ) : (
            <span className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-muted">
              API JSON pending comparison
            </span>
          )}
        </div>
      </div>

      {data.missingEngineeringFields.length > 0 ? (
        <div className="rounded-lg border border-border bg-surface-1 p-3 text-sm text-text-secondary">
          <strong className="text-text-primary">Backend contract note:</strong>{' '}
          {data.missingEngineeringFields.join(' ')}
        </div>
      ) : null}

      <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-surface-1 shadow-sm">
        <div className="w-full max-w-full overflow-x-auto">
          <table className="min-w-[860px] w-full border-collapse text-left text-sm">
            <thead className="bg-surface-0 text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <SortableHeader
                  label="Resource name"
                  sortKey="resourceName"
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={onSort}
                  sticky
                />
                <SortableHeader
                  label="Provider"
                  sortKey="provider"
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={onSort}
                />
                <SortableHeader
                  label="Region"
                  sortKey="region"
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={onSort}
                />
                <SortableHeader
                  label="Spec / SKU"
                  sortKey="spec"
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={onSort}
                />
                <SortableHeader
                  label="$/mo"
                  sortKey="monthlyCost"
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={onSort}
                  alignRight
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface-1 px-3 py-3 font-mono text-xs font-semibold text-text-primary shadow-[1px_0_0_var(--border)]"
                    >
                      <div>{row.resourceName}</div>
                      <div className="mt-1 font-sans text-xs font-normal text-text-muted">
                        {row.description}
                      </div>
                    </th>
                    <td className="px-3 py-3">
                      <span className={providerBadgeClassName(row.providerId)}>
                        {row.providerName}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{row.region}</td>
                    <td className="px-3 py-3 text-text-secondary">{row.spec}</td>
                    <td className="px-3 py-3 text-right font-semibold text-text-primary">
                      {formatCurrency(row.monthlyCost)}
                      {row.isApproximate ? (
                        <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-muted">
                          approx
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-8 text-center text-text-secondary" colSpan={5}>
                    Run a comparison to populate engineering rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SharedComparisonState({
  data,
  error,
  isLoading,
}: {
  data: PersonaComparisonData;
  error: string | null;
  isLoading: boolean;
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-action-destructive bg-surface-1 p-3 text-sm text-text-primary">
        <strong>Comparison needs attention.</strong> {error}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Comparison loading">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-24 animate-pulse rounded-lg border border-border bg-surface-1 motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  if (!data.comparisonId) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-3 text-sm text-text-secondary">
        Run a comparison to populate both Executive and Engineering views from the same result.
      </div>
    );
  }

  if (data.warningMessages.length > 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-3 text-sm text-text-secondary">
        <strong className="text-text-primary">Pricing warnings:</strong>{' '}
        {data.warningMessages.join(' ')}
      </div>
    );
  }

  return null;
}

function ExecutiveMetricCard({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface-1 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <strong className="mt-2 block text-2xl font-semibold text-text-primary">{value}</strong>
      <span className="mt-2 block text-sm text-text-secondary">{detail}</span>
    </article>
  );
}

function SortableHeader({
  activeSortKey,
  alignRight = false,
  label,
  onSort,
  sortDirection,
  sortKey,
  sticky = false,
}: {
  activeSortKey: SortKey;
  alignRight?: boolean;
  label: string;
  onSort: (sortKey: SortKey) => void;
  sortDirection: SortDirection;
  sortKey: SortKey;
  sticky?: boolean;
}) {
  const isActive = activeSortKey === sortKey;

  return (
    <th
      scope="col"
      className={[
        'px-3 py-2',
        alignRight ? 'text-right' : 'text-left',
        sticky ? 'sticky left-0 z-20 bg-surface-0 shadow-[1px_0_0_var(--border)]' : undefined,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={[
          'inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-semibold uppercase tracking-wide text-text-muted transition hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary',
          alignRight ? 'ml-auto justify-end' : undefined,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {label}
        <span aria-hidden="true">{isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

function engineeringRowFromLineItem(
  providerId: ProviderId,
  lineItem: ComparisonLineItem,
  index: number,
  activeRegion: string,
): EngineeringCostRow {
  const resourceName = `${providerId}-${lineItem.category}-${String(index + 1).padStart(2, '0')}`;

  return {
    id: `${providerId}-${lineItem.category}-${index}`,
    resourceName,
    providerId,
    providerName: providerLabel(providerId),
    category: lineItem.category,
    region: activeRegion,
    spec: 'SKU/spec pending API field',
    monthlyCost: lineItem.baseMonthlyCostUsd,
    description: lineItem.description,
    isApproximate: lineItem.isApproximate,
    tags: [],
  };
}

function executiveRecommendationHeadline(
  data: PersonaComparisonData,
  monthlySavings?: number,
): string {
  if (!data.cheapest) {
    return 'Run a comparison to create a summary.';
  }

  if (monthlySavings !== undefined && monthlySavings > 0) {
    return `Choosing ${data.cheapest.providerName} saves ${formatCurrency(monthlySavings)} per month.`;
  }

  return `${data.cheapest.providerName} is currently the best priced option.`;
}

function executiveRecommendationDetail(data: PersonaComparisonData): string {
  if (!data.cheapest) {
    return 'PolyCost will turn the workload requirements into a plain-English cost summary once provider estimates are available.';
  }

  if (data.monthlySpread !== undefined && data.monthlySpread > 0) {
    return `The spread between the lowest and highest priced clouds is ${formatCurrency(data.monthlySpread)} per month. Use this summary for budget review, then validate service fit before committing.`;
  }

  return 'The available provider estimates are close. Use this summary to discuss budget impact, then validate service fit before committing.';
}

function compareRows(
  left: EngineeringCostRow,
  right: EngineeringCostRow,
  sortKey: SortKey,
): number {
  switch (sortKey) {
    case 'monthlyCost':
      return left.monthlyCost - right.monthlyCost;
    case 'provider':
      return left.providerName.localeCompare(right.providerName);
    case 'region':
      return left.region.localeCompare(right.region);
    case 'resourceName':
      return left.resourceName.localeCompare(right.resourceName);
    case 'spec':
      return left.spec.localeCompare(right.spec);
  }
}

function costForInterval(provider: ComparisonProviderResult, interval: IntervalKey): number {
  switch (interval) {
    case 'daily':
      return provider.totals.daily;
    case 'weekly':
      return provider.totals.weekly;
    case 'monthly':
      return provider.totals.monthly;
    case 'quarterly':
      return provider.totals.quarterly;
    case 'yearly':
      return provider.totals.yearly;
  }
}

function comparisonApiEndpoint(comparisonId?: string): string | undefined {
  return comparisonId ? `${configuredApiBaseUrl()}/comparisons/${comparisonId}` : undefined;
}

function storedPersonaViewMode(): PersonaViewMode {
  try {
    const stored = localStorage.getItem(PERSONA_VIEW_STORAGE_KEY);
    return stored === 'engineering' || stored === 'executive' ? stored : 'executive';
  } catch {
    return 'executive';
  }
}

function storePersonaViewMode(viewMode: PersonaViewMode): void {
  try {
    localStorage.setItem(PERSONA_VIEW_STORAGE_KEY, viewMode);
  } catch {
    // Non-persistent environments still get the in-memory selected state.
  }
}

function viewModeButtonClassName(isActive: boolean): string {
  return [
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary',
    isActive
      ? 'bg-text-primary text-surface-1 shadow-sm'
      : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary',
  ].join(' ');
}

function providerBadgeClassName(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'inline-flex min-h-6 items-center rounded-full border border-brand-orange px-2 py-0.5 text-xs font-semibold text-landing-label-aws';
    case 'azure':
      return 'inline-flex min-h-6 items-center rounded-full border border-brand-blue px-2 py-0.5 text-xs font-semibold text-landing-label-azure';
    case 'gcp':
      return 'inline-flex min-h-6 items-center rounded-full border border-brand-green px-2 py-0.5 text-xs font-semibold text-landing-label-gcp';
  }
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

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function ExecutiveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <path d="M4 18V6M4 18h16M8 15v-4M12 15V8M16 15v-6" />
    </svg>
  );
}

function EngineeringIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <path d="M12 4v10M8 10l4 4 4-4M5 20h14" />
    </svg>
  );
}

function ApiIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <path d="M7 8 3 12l4 4M17 8l4 4-4 4M14 5l-4 14" />
    </svg>
  );
}
