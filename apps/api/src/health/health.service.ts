import net from 'node:net';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';

export type DependencyStatus = 'ok' | 'degraded';

export interface HealthDependency {
  status: DependencyStatus;
  host: string;
  port: number;
  latencyMs?: number;
  error?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: 'polycost-api';
  dependencies: {
    db: HealthDependency;
    cache: HealthDependency;
  };
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
  ) {}

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

    return {
      status: db.status === 'ok' && cache.status === 'ok' ? 'ok' : 'degraded',
      service: 'polycost-api',
      dependencies: {
        db,
        cache,
      },
    };
  }
}

export function probeTcp(host: string, port: number, timeoutMs: number): Promise<HealthDependency> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
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
