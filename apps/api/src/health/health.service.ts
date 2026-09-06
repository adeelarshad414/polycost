import net from 'node:net';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { DataHealthResponse } from '../api/api-errors.js';
import { ApiDatabaseRepository } from '../api/api-database.repository.js';
import { AppConfig } from '../config/config.schema.js';

export type DependencyStatus = 'ok' | 'degraded';

export interface HealthDependency {
  status: DependencyStatus;
  host: string;
  port: number;
  latencyMs?: number;
  error?: string;
}

export interface LiveHealthResponse {
  status: 'ok';
  service: 'polycost-api';
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: 'polycost-api';
  dependencies: {
    db: HealthDependency;
    cache: HealthDependency;
  };
}

export interface DeepHealthResponse {
  status: 'healthy' | 'degraded' | 'critical';
  service: 'polycost-api';
  generatedAt: string;
  dependencies: HealthResponse['dependencies'];
  pricingData?: DataHealthResponse;
  pricingDataError?: string;
}

export type TcpProbe = (host: string, port: number, timeoutMs: number) => Promise<HealthDependency>;

export const HEALTH_TCP_PROBE = Symbol('HEALTH_TCP_PROBE');

@Injectable()
export class HealthService {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    @Optional()
    @Inject(HEALTH_TCP_PROBE)
    private readonly tcpProbe: TcpProbe = probeTcp,
    @Optional()
    private readonly apiDatabaseRepository?: ApiDatabaseRepository,
    @Optional() private readonly domainMetrics?: DomainMetricsService,
  ) {}

  getLiveHealth(): LiveHealthResponse {
    return {
      status: 'ok',
      service: 'polycost-api',
    };
  }

  async getHealth(): Promise<HealthResponse> {
    const [db, cache] = await Promise.all([
      this.tcpProbe(
        this.configService.get('DB_HOST', { infer: true }),
        this.configService.get('DB_PORT', { infer: true }),
        500,
      ),
      this.tcpProbe(
        this.configService.get('REDIS_HOST', { infer: true }),
        this.configService.get('REDIS_PORT', { infer: true }),
        500,
      ),
    ]);

    // Recorded here rather than on a timer: readiness probes already call this
    // on a schedule, so the gauge refreshes without a second polling loop.
    this.recordDependency('db', db);
    this.recordDependency('cache', cache);

    return {
      status: db.status === 'ok' && cache.status === 'ok' ? 'ok' : 'degraded',
      service: 'polycost-api',
      dependencies: {
        db,
        cache,
      },
    };
  }

  private recordDependency(dependency: string, result: HealthDependency): void {
    this.domainMetrics?.recordDependencyProbe({
      dependency,
      up: result.status === 'ok',
      latencySeconds: result.latencyMs === undefined ? undefined : result.latencyMs / 1000,
    });
  }

  async getDeepHealth(): Promise<DeepHealthResponse> {
    const health = await this.getHealth();
    let pricingData: DataHealthResponse | undefined;
    let pricingDataError: string | undefined;

    if (this.apiDatabaseRepository) {
      try {
        pricingData = await this.apiDatabaseRepository.getDataHealth();
      } catch (error) {
        pricingDataError = error instanceof Error ? error.message : 'Unknown data-health failure';
      }
    } else {
      pricingDataError = 'Data-health repository is not registered in this runtime';
    }

    return {
      status: deepHealthStatus(health, pricingData, pricingDataError),
      service: 'polycost-api',
      generatedAt: new Date().toISOString(),
      dependencies: health.dependencies,
      ...(pricingData ? { pricingData } : {}),
      ...(pricingDataError ? { pricingDataError } : {}),
    };
  }
}

function deepHealthStatus(
  health: HealthResponse,
  pricingData: DataHealthResponse | undefined,
  pricingDataError: string | undefined,
): DeepHealthResponse['status'] {
  if (health.dependencies.db.status !== 'ok' || pricingDataError) {
    return 'critical';
  }

  if (
    pricingData?.overallStatus === 'degraded' ||
    pricingData?.alerts.some((alert) => alert.severity === 'critical') ||
    pricingData?.providers.some(
      (provider) => provider.freshness === 'failed' || provider.freshness === 'missing',
    )
  ) {
    return 'critical';
  }

  if (
    health.dependencies.cache.status !== 'ok' ||
    pricingData?.overallStatus === 'stale' ||
    pricingData?.alerts.some((alert) => alert.severity === 'warning')
  ) {
    return 'degraded';
  }

  return 'healthy';
}

/** How a TCP connection is opened. A parameter so the probe is testable. */
export type ConnectionFactory = (options: { host: string; port: number }) => net.Socket;

/**
 * The connection factory takes the place of a module mock.
 *
 * The spec used to reach for `jest.mock('node:net')`, which does not work under
 * ESM without `unstable_mockModule` and its dynamic-import dance. Passing the
 * factory in is both simpler and a better test: it exercises the real control
 * flow instead of replacing the module the flow depends on.
 */
export function probeTcp(
  host: string,
  port: number,
  timeoutMs: number,
  createConnection: ConnectionFactory = (options) => net.createConnection(options),
): Promise<HealthDependency> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    function finish(status: DependencyStatus, error?: string) {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve({
        status,
        host,
        port,
        latencyMs: Date.now() - startedAt,
        ...(error ? { error } : {}),
      });
    }

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish('ok'));
    socket.once('timeout', () => finish('degraded', 'timeout'));
    socket.once('error', (error) => finish('degraded', error.message));
  });
}
