import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ProviderId, ServiceCategory } from '../types';
import { formatCurrency, formatPercent } from '../lib/format';

// FE-4: the only recharts consumers in the app live here so the ~377 kB charts
// vendor chunk can be lazy-loaded off the first-paint critical path instead of
// being pulled in synchronously by App.tsx.

export interface ProviderMixDatum {
  providerId: ProviderId;
  name: string;
  value: number;
  percent: number;
  color: string;
}

export interface EngineeringServiceDatum {
  category: ServiceCategory;
  serviceLabel: string;
  value: number;
  percent: number;
  color: string;
}

export interface EngineeringProviderServiceModel {
  providerId: ProviderId;
  total?: number;
  lineItemCount: number;
  approximateCount: number;
  services: EngineeringServiceDatum[];
  dominantService?: EngineeringServiceDatum;
}

function providerLabel(provider: ProviderId): string {
  switch (provider) {
    case 'aws':
      return 'AWS';
    case 'azure':
      return 'Azure';
    case 'gcp':
      return 'GCP';
    default:
      return provider;
  }
}

function useViewportWidth(): number {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  );

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return viewportWidth;
}

function engineeringChartDimensions(
  compact: boolean,
  viewportWidth: number,
): { width: number; height: number } {
  if (viewportWidth < 420) {
    return { width: 196, height: compact ? 126 : 140 };
  }

  if (viewportWidth < 768) {
    return { width: compact ? 220 : 238, height: compact ? 132 : 148 };
  }

  return { width: compact ? 238 : 276, height: compact ? 138 : 164 };
}

export function ProviderMixDonut({ data }: { data: ProviderMixDatum[] }) {
  if (data.length === 0) {
    return (
      <div className="provider-mix-empty" role="status">
        Provider mix pending until comparison totals are available.
      </div>
    );
  }

  return (
    <div className="provider-mix-layout">
      <div className="provider-mix-chart-shell" role="img" aria-label="Provider cost mix chart">
        <PieChart width={220} height={220}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={3}
            stroke="var(--pc-bg-surface)"
            strokeWidth={4}
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell fill={entry.color} key={entry.providerId} />
            ))}
          </Pie>
        </PieChart>
      </div>
      <div className="provider-mix-legend">
        {data.map((entry) => (
          <span key={entry.providerId}>
            <i className={`provider-dot provider-fill-${entry.providerId}`} aria-hidden="true" />
            <strong>{entry.name}</strong>
            <small>
              {formatCurrency(entry.value)} · {formatPercent(entry.percent)}
            </small>
          </span>
        ))}
      </div>
    </div>
  );
}

export function EngineeringProviderServiceChart({
  provider,
  compact = false,
}: {
  provider: EngineeringProviderServiceModel;
  compact?: boolean;
}) {
  const hasData = provider.total !== undefined && provider.total > 0;
  const viewportWidth = useViewportWidth();
  const { height: chartHeight, width: chartWidth } = engineeringChartDimensions(
    compact,
    viewportWidth,
  );

  return (
    <article className={`engineering-chart-card engineering-chart-${provider.providerId}`}>
      <div className="engineering-chart-title">
        <span>{providerLabel(provider.providerId)}</span>
        <strong>{hasData ? formatCurrency(provider.total ?? 0) : 'Pending'}</strong>
      </div>

      {hasData ? (
        <>
          <div
            className="engineering-bar-chart-shell"
            role="img"
            aria-label={`${providerLabel(provider.providerId)} service cost breakdown chart`}
          >
            <BarChart
              width={chartWidth}
              height={chartHeight}
              data={provider.services}
              margin={{ top: 10, right: 4, bottom: 0, left: -20 }}
            >
              <CartesianGrid stroke="var(--pc-chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="serviceLabel"
                interval={0}
                tick={{ fill: 'var(--pc-text-secondary)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: 'var(--pc-chart-hover)' }}
                formatter={(value) => [formatCurrency(Number(value)), 'Cost']}
                contentStyle={{
                  background: 'var(--pc-bg-surface)',
                  border: '1px solid var(--pc-border)',
                  borderRadius: '8px',
                  color: 'var(--pc-text-primary)',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="value" radius={[6, 6, 2, 2]} isAnimationActive={false}>
                {provider.services.map((service) => (
                  <Cell
                    key={`${provider.providerId}-${service.category}`}
                    fill={service.color}
                    opacity={service.value > 0 ? 1 : 0.2}
                  />
                ))}
              </Bar>
            </BarChart>
          </div>
          <div className="engineering-service-list">
            {provider.services.map((service) => (
              <span key={service.category}>
                <i className={`category-dot category-${service.category}`} aria-hidden="true" />
                <strong>{service.serviceLabel}</strong>
                <small>
                  {formatCurrency(service.value)} · {formatPercent(service.percent)}
                </small>
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="engineering-chart-empty" role="status">
          Run a comparison to populate {providerLabel(provider.providerId)} service bars.
        </div>
      )}

      <p className="engineering-chart-footnote">
        {provider.dominantService
          ? `${provider.dominantService.serviceLabel} is the largest mapped driver.`
          : 'Service concentration pending provider line items.'}
      </p>
    </article>
  );
}
