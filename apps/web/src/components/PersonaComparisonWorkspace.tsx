import { useEffect, useMemo, useState } from 'react';
import { configuredApiBaseUrl } from '../api-client';
import { Button } from './Button';
import { LoadingStatus, Skeleton } from './LoadingExperience';
import { hourlyFromMonthly } from '../cost-time';
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

const CONFIDENCE_TOOLTIP =
  'Confidence reflects how closely the equivalent service matches on specs, not just name.';

interface PersonaComparisonWorkspaceProps {
  comparison: ComparisonResult | null;
  interval: IntervalKey;
  form: WorkloadFormState;
  defaultViewMode?: PersonaViewMode;
  emptyStateMessage?: string;
  isLoading?: boolean;
  error?: string | null;
  exportingFormat?: ReportFormat | null;
  onExport?: (format: ReportFormat) => void;
  showViewSwitcher?: boolean;
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
  confidence: 'High' | 'Medium' | 'Low' | 'Pending';
  confidenceDetail: string;
  pricedProviderCount: number;
  totalApproximateCount: number;
  totalLineItemCount: number;
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
const ENGINEERING_TABLE_PAGE_SIZE = 12;

export function PersonaComparisonWorkspace({
  comparison,
  defaultViewMode = 'executive',
  emptyStateMessage,
  interval,
  form,
  isLoading = false,
  error = null,
  exportingFormat = null,
  onExport,
  showViewSwitcher = true,
}: PersonaComparisonWorkspaceProps) {
  const [selectedViewMode, setSelectedViewMode] = useState<PersonaViewMode>(() =>
    showViewSwitcher ? storedPersonaViewMode() : defaultViewMode,
  );
  const [sortKey, setSortKey] = useState<SortKey>('monthlyCost');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [tagFilter, setTagFilter] = useState('all');
  const data = usePersonaComparisonData(comparison, interval, form);
  const viewMode = showViewSwitcher ? selectedViewMode : defaultViewMode;

  useEffect(() => {
    if (showViewSwitcher) {
      storePersonaViewMode(selectedViewMode);
    }
  }, [selectedViewMode, showViewSwitcher]);

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
    <section className="min-w-0 space-y-4" aria-label="Persona-aware cost views">
      {showViewSwitcher ? (
        <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-1 p-3 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              View mode
            </p>
            <h2 className="mt-1 text-lg font-semibold text-text-primary">
              Choose the lens for this comparison
            </h2>
          </div>
          <PersonaViewSwitcher viewMode={selectedViewMode} onViewModeChange={setSelectedViewMode} />
        </div>
      ) : null}

      <SharedComparisonState
        data={data}
        emptyStateMessage={emptyStateMessage}
        error={error}
        isLoading={isLoading}
      />

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
    const workloadTags =
      comparison?.requirements?.workloadProfile?.tags?.map((tag) => `${tag.key}:${tag.value}`) ??
      [];
    const rows =
      comparison?.providers.flatMap((provider) =>
        provider.lineItems.map((lineItem, index) =>
          engineeringRowFromLineItem(provider.providerId, lineItem, index, workloadTags),
        ),
      ) ?? [];
    const cheapest = pricedSummaries[0];
    const secondCheapest = pricedSummaries[1];
    const highest = pricedSummaries.at(-1);
    const monthlySpread =
      cheapest?.monthlyTotal !== undefined && highest?.monthlyTotal !== undefined
        ? roundCurrency(highest.monthlyTotal - cheapest.monthlyTotal)
        : undefined;
    const pricedProviderCount = providerSummaries.filter(
      (summary) => summary.monthlyTotal !== undefined,
    ).length;
    const totalApproximateCount = providerSummaries.reduce(
      (count, summary) => count + summary.approximateCount,
      0,
    );
    const totalLineItemCount = providerSummaries.reduce(
      (count, summary) => count + summary.lineItemCount,
      0,
    );
    const confidence = decisionConfidence(pricedProviderCount, totalApproximateCount);

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
      missingEngineeringFields:
        workloadTags.length > 0 ? [] : ['Tags are not present in the comparison response yet.'],
      confidence,
      confidenceDetail: confidenceDetail(confidence, pricedProviderCount, totalApproximateCount),
      pricedProviderCount,
      totalApproximateCount,
      totalLineItemCount,
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
  const [showAllRows, setShowAllRows] = useState(false);
  const apiJsonPendingMessage = isLoading
    ? 'API JSON will activate when this comparison finishes'
    : 'Run a comparison to open API JSON';
  const isRowLimitActive = rows.length > ENGINEERING_TABLE_PAGE_SIZE && !showAllRows;
  const visibleRows = isRowLimitActive ? rows.slice(0, ENGINEERING_TABLE_PAGE_SIZE) : rows;
  const hiddenRowCount = rows.length - visibleRows.length;

  return (
    <div className="min-w-0 space-y-4" aria-label="Engineering comparison view">
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
                  description="Provider region used for this line item after residency and preference rules."
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={onSort}
                />
                <SortableHeader
                  label="Spec / SKU"
                  sortKey="spec"
                  description="Resolved SKU, unit, rate, and pricing basis returned by the comparison API."
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={onSort}
                />
                <SortableHeader
                  label="$/mo"
                  sortKey="monthlyCost"
                  description="Monthly line-item cost before changing the global time-period view."
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={onSort}
                  alignRight
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRows.length > 0 ? (
                visibleRows.map((row) => (
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
                  <td className="px-3 py-8" colSpan={5}>
                    <EngineeringRowsEmptyState
                      hasComparison={Boolean(data.comparisonId)}
                      isFiltered={tagFilter !== 'all'}
                      isLoading={isLoading}
                      onClearFilters={() => onTagFilterChange('all')}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 ? (
          <div
            className="flex flex-col gap-2 border-t border-border bg-surface-0 px-3 py-3 text-xs text-text-secondary sm:flex-row sm:items-center sm:justify-between"
            aria-live="polite"
          >
            <span>
              Showing {visibleRows.length} of {rows.length} resource rows sorted by{' '}
              {sortKeyLabel(sortKey)} ({sortDirection === 'asc' ? 'ascending' : 'descending'}).
            </span>
            {rows.length > ENGINEERING_TABLE_PAGE_SIZE ? (
              <Button
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => setShowAllRows((current) => !current)}
              >
                {showAllRows
                  ? `Collapse to top ${ENGINEERING_TABLE_PAGE_SIZE}`
                  : `Show all rows${hiddenRowCount > 0 ? ` (${hiddenRowCount} more)` : ''}`}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

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
              {apiJsonPendingMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EngineeringRowsEmptyState({
  hasComparison,
  isFiltered,
  isLoading,
  onClearFilters,
}: {
  hasComparison: boolean;
  isFiltered: boolean;
  isLoading: boolean;
  onClearFilters: () => void;
}) {
  if (isLoading) {
    return (
      <div
        className="mx-auto grid max-w-2xl place-items-center gap-3 rounded-lg border border-dashed border-border bg-surface-0 p-5 text-center text-sm text-text-secondary"
        aria-busy="true"
        role="status"
      >
        <LoadingStatus
          title="Building engineering rows"
          detail="Mapping AWS, Azure, and GCP line items into provider, region, SKU, and monthly cost evidence."
        />
      </div>
    );
  }

  if (isFiltered) {
    return (
      <div className="mx-auto grid max-w-2xl place-items-center gap-3 rounded-lg border border-dashed border-border bg-surface-0 p-5 text-center text-sm text-text-secondary">
        <NoResultsIllustration />
        <strong className="text-base font-semibold text-text-primary">
          No services match your filters
        </strong>
        <span>Clear the tag filter to restore every mapped service row in this comparison.</span>
        <Button type="button" variant="secondary" onClick={onClearFilters}>
          Clear filters
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-2xl place-items-center gap-3 rounded-lg border border-dashed border-border bg-surface-0 p-5 text-center text-sm text-text-secondary">
      <EmptyServicesIllustration />
      <strong className="text-base font-semibold text-text-primary">
        {hasComparison ? 'No services added yet' : 'Add services to see your comparison'}
      </strong>
      <span>
        {hasComparison
          ? 'This comparison returned no priced service rows. Add compute, storage, database, or networking services and compare again.'
          : 'Describe your infrastructure above to populate provider, region, SKU, and monthly cost rows.'}
      </span>
      <a
        href="#requirements"
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-action-primary bg-action-primary px-4 py-2 text-sm font-semibold text-[color:var(--on-primary-action)] shadow-sm transition hover:bg-action-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
        aria-label="Add services to see your comparison"
      >
        Add services
      </a>
    </div>
  );
}

function EmptyServicesIllustration() {
  return (
    <svg
      viewBox="0 0 80 80"
      aria-hidden="true"
      className="engineering-empty-illustration h-20 w-20 text-text-muted"
      fill="none"
    >
      <rect x="17" y="18" width="46" height="42" rx="8" stroke="currentColor" strokeWidth="3" />
      <path
        d="M28 30h24M28 40h24M28 50h12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path d="M22 66h36" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

function NoResultsIllustration() {
  return (
    <svg
      viewBox="0 0 80 80"
      aria-hidden="true"
      className="engineering-filter-empty-illustration h-20 w-20 text-text-muted"
      fill="none"
    >
      <path
        d="M18 20h44L47 38v15l-14 7V38L18 20Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path
        d="M55 55l10 10M65 55 55 65"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function SharedComparisonState({
  data,
  emptyStateMessage,
  error,
  isLoading,
}: {
  data: PersonaComparisonData;
  emptyStateMessage?: string;
  error: string | null;
  isLoading: boolean;
}) {
  if (error) {
    return (
      <div
        className="rounded-lg border border-action-destructive bg-surface-1 p-3 text-sm text-text-primary"
        role="alert"
      >
        <strong>Comparison needs attention.</strong> {error}{' '}
        <span className="text-text-secondary">
          Check the requirement inputs, then refresh live pricing or run the comparison again.
        </span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        aria-busy="true"
        aria-label="Comparison loading"
        role="status"
      >
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-1 p-4 sm:col-span-3">
          <LoadingStatus
            title="Refreshing pricing evidence"
            detail="Mapping provider SKUs, totals, export links, and engineering rows from the backend response."
          />
        </div>
        <div className="sm:col-span-3">
          <Skeleton.Grid cards={3} />
        </div>
      </div>
    );
  }

  if (!data.comparisonId) {
    return (
      <div className="grid gap-4 rounded-lg border border-dashed border-border bg-surface-1 p-5 text-sm text-text-secondary sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <EmptyComparisonIllustration />
        <div className="min-w-0">
          <strong className="block text-base font-semibold text-text-primary">
            Ready to compare
          </strong>
          <span className="mt-1 block leading-6">
            {emptyStateMessage ??
              'Describe your infrastructure to populate Executive and Engineering evidence from the same comparison result.'}
          </span>
        </div>
        <a
          href="#requirements"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-action-primary bg-action-primary px-4 py-2 text-sm font-semibold text-[color:var(--on-primary-action)] shadow-sm transition hover:bg-action-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
          aria-label="Describe your infrastructure above"
        >
          Describe infrastructure
        </a>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface-1 p-3 text-sm text-text-secondary">
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <strong className="text-text-primary">Comparison evidence:</strong>{' '}
          {comparisonEvidenceSummary(data)}
        </div>
        <span
          className={`confidence-pill confidence-${data.confidence.toLowerCase()}`}
          title={CONFIDENCE_TOOLTIP}
          aria-label={`${data.confidence} confidence. ${data.confidenceDetail}. ${CONFIDENCE_TOOLTIP}`}
        >
          <strong>{data.confidence}</strong>
          <small>{data.confidenceDetail}</small>
        </span>
      </div>
      {data.warningMessages.length > 0 ? (
        <div
          className="rounded-md border border-[color:var(--pc-warning)] bg-[color:var(--pc-warning-soft)] p-2 text-text-primary"
          role="alert"
        >
          <strong>Pricing warnings:</strong> {data.warningMessages.join(' ')}
        </div>
      ) : null}
    </div>
  );
}

function EmptyComparisonIllustration() {
  return (
    <svg
      viewBox="0 0 80 80"
      aria-hidden="true"
      className="comparison-empty-illustration h-20 w-20 text-text-muted"
      fill="none"
    >
      <path
        d="M25.5 51.5H55a12.5 12.5 0 0 0 1.6-24.9A17 17 0 0 0 23.4 31 10.6 10.6 0 0 0 25.5 51.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path d="M27 61h26M32 68h16" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      <circle cx="32" cy="42" r="2.5" fill="currentColor" />
      <circle cx="40" cy="42" r="2.5" fill="currentColor" />
      <circle cx="48" cy="42" r="2.5" fill="currentColor" />
    </svg>
  );
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
  description,
  label,
  onSort,
  sortDirection,
  sortKey,
  sticky = false,
}: {
  activeSortKey: SortKey;
  alignRight?: boolean;
  description?: string;
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
      aria-sort={isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={[
        'px-3 py-2',
        alignRight ? 'text-right' : 'text-left',
        sticky ? 'sticky left-0 z-20 bg-surface-0 shadow-[1px_0_0_var(--border)]' : undefined,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={description ? `${label}: ${description}` : label}
        title={description}
        variant="ghost"
        size="compact"
        className={['uppercase text-text-muted', alignRight ? 'ml-auto justify-end' : undefined]
          .filter(Boolean)
          .join(' ')}
      >
        {label}
        <span aria-hidden="true">{isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
      </Button>
    </th>
  );
}

function engineeringRowFromLineItem(
  providerId: ProviderId,
  lineItem: ComparisonLineItem,
  index: number,
  tags: string[],
): EngineeringCostRow {
  const resourceName = `${providerId}-${lineItem.category}-${String(index + 1).padStart(2, '0')}`;

  return {
    id: `${providerId}-${lineItem.category}-${index}`,
    resourceName,
    providerId,
    providerName: providerLabel(providerId),
    category: lineItem.category,
    region: lineItem.region ?? 'Provider default',
    spec: lineItemSpec(lineItem),
    monthlyCost: lineItem.baseMonthlyCostUsd,
    description: lineItem.description,
    isApproximate: lineItem.isApproximate,
    tags,
  };
}

function lineItemSpec(lineItem: ComparisonLineItem): string {
  const trace = lineItem.pricingTrace;
  const parts = [
    lineItem.skuId
      ? `SKU ${lineItem.skuId}`
      : trace?.resolvedSkuId
        ? `SKU ${trace.resolvedSkuId}`
        : undefined,
    trace?.source
      ? `Source ${trace.source.replace(/_/g, ' ')}`
      : lineItem.rateSource
        ? `Source ${lineItem.rateSource.replace(/_/g, ' ')}`
        : undefined,
    lineItem.unit ? `Unit ${lineItem.unit}` : trace?.unit ? `Unit ${trace.unit}` : undefined,
    lineItem.unitPriceUsd !== undefined
      ? `${formatCurrency(lineItem.unitPriceUsd)}/unit`
      : trace?.unitPriceUsd !== undefined
        ? `${formatCurrency(trace.unitPriceUsd)}/unit`
        : undefined,
    trace?.effectiveDate ? `Effective ${shortDate(trace.effectiveDate)}` : undefined,
    trace?.fetchedAt ? `Fetched ${shortDate(trace.fetchedAt)}` : undefined,
    trace?.sourceEndpoint ? `Endpoint ${trace.sourceEndpoint}` : undefined,
    trace?.sourceRecordId ? `Record ${trace.sourceRecordId}` : undefined,
    trace?.transformVersion ? `Transform ${trace.transformVersion}` : undefined,
    trace?.sourcePayloadHash ? `Hash ${trace.sourcePayloadHash.slice(0, 12)}` : undefined,
    trace?.sourceRecordKey ? `Trace ${trace.sourceRecordKey}` : undefined,
    trace?.derivation?.expression ? `Math ${trace.derivation.expression}` : undefined,
    trace?.equivalenceConfidence ? `Confidence ${trace.equivalenceConfidence}` : undefined,
    trace?.isEstimate ? 'Estimate-backed' : undefined,
    trace?.isApproximate ? 'Approximate mapping' : undefined,
    lineItem.pricingBasis
      ? `${capitalize(lineItem.pricingBasis)} pricing`
      : trace?.pricingBasis
        ? `${capitalize(trace.pricingBasis)} pricing`
        : undefined,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0
    ? parts.join(' · ')
    : 'Modeled cost driver - provider SKU/rate metadata not returned by API';
}

function shortDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function comparisonEvidenceSummary(data: PersonaComparisonData): string {
  const pricingDate = data.pricingAsOf
    ? formatDateTime(data.pricingAsOf)
    : 'pricing sync date not returned';
  const approximateText =
    data.totalApproximateCount === 1
      ? '1 approximate mapping'
      : `${data.totalApproximateCount} approximate mappings`;

  return `${pricingDate} · ${data.pricedProviderCount}/3 clouds priced · ${data.totalLineItemCount} line items · ${approximateText}.`;
}

function decisionConfidence(
  pricedProviderCount: number,
  approximateCount: number,
): PersonaComparisonData['confidence'] {
  if (pricedProviderCount === 0) {
    return 'Pending';
  }

  if (pricedProviderCount === PROVIDER_ORDER.length && approximateCount === 0) {
    return 'High';
  }

  if (pricedProviderCount >= 2) {
    return 'Medium';
  }

  return 'Low';
}

function confidenceDetail(
  confidence: PersonaComparisonData['confidence'],
  pricedProviderCount: number,
  approximateCount: number,
): string {
  if (confidence === 'Pending') {
    return 'Run comparison to collect provider estimates';
  }

  if (confidence === 'High') {
    return 'All clouds priced with exact mappings';
  }

  if (confidence === 'Medium') {
    return `${pricedProviderCount}/3 clouds priced; ${approximateCount} approximate mappings`;
  }

  return `${pricedProviderCount}/3 clouds priced; validate before decision`;
}

function capitalize(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return `Pricing as of ${value}`;
  }

  return `Pricing as of ${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)}`;
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

function sortKeyLabel(sortKey: SortKey): string {
  switch (sortKey) {
    case 'resourceName':
      return 'resource name';
    case 'provider':
      return 'provider';
    case 'region':
      return 'region';
    case 'spec':
      return 'spec / SKU';
    case 'monthlyCost':
      return '$/mo';
  }
}

function costForInterval(provider: ComparisonProviderResult, interval: IntervalKey): number {
  switch (interval) {
    case 'hourly':
      return provider.totals.hourly ?? hourlyFromMonthly(provider.totals.monthly);
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
