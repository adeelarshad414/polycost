/* eslint-disable security/detect-object-injection, security/detect-non-literal-fs-filename -- Reviewed 2026-07-06: secret tests use controlled env keys and temp fixture files only; see docs/SECURITY-SUPPRESSIONS.md. */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { SecretsService } from './secrets.service';
import { DomainMetricsService } from '../observability/domain-metrics.service';
import { MetricsService } from '../observability/metrics.service';

const configService = (values: Partial<AppConfig>) =>
  ({
    get: jest.fn((key: keyof AppConfig) => values[key]),
  }) as unknown as ConfigService<AppConfig, true>;

describe('SecretsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads a Vault token from a file and retrieves a KV v2 secret value', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'polycost-secrets-'));
    const tokenFile = join(directory, 'vault-token');
    await writeFile(tokenFile, 'local-dev-token');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          data: {
            access_token: 'provider-token',
          },
        },
      }),
    } as Response);
    const service = new SecretsService(
      configService({
        VAULT_ADDR: 'http://vault:8200',
        VAULT_TOKEN_FILE: tokenFile,
      }),
    );

    await expect(service.getSecret('polycost/providers/gcp', 'access_token')).resolves.toBe(
      'provider-token',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://vault:8200/v1/secret/data/polycost/providers/gcp',
      {
        headers: {
          'X-Vault-Token': 'local-dev-token',
        },
      },
    );
  });

  it('fails before a Vault call when no token file is configured', async () => {
    const service = new SecretsService(
      configService({
        VAULT_ADDR: 'http://vault:8200',
      }),
    );

    await expect(service.getSecret('polycost/providers/gcp', 'access_token')).rejects.toThrow(
      'VAULT_TOKEN_FILE is required',
    );
  });

  it('fails when Vault does not return the requested key', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'polycost-secrets-'));
    const tokenFile = join(directory, 'vault-token');
    await writeFile(tokenFile, 'local-dev-token');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          data: {},
        },
      }),
    } as Response);
    const service = new SecretsService(
      configService({
        VAULT_ADDR: 'http://vault:8200',
        VAULT_TOKEN_FILE: tokenFile,
      }),
    );

    await expect(service.getSecret('polycost/providers/gcp', 'access_token')).rejects.toThrow(
      'Secret value not found',
    );
  });
});

describe('SecretsService metrics', () => {
  const recorder = () => {
    const metrics = new MetricsService({ collectDefaults: false });
    return { domainMetrics: new DomainMetricsService(metrics), render: () => metrics.render() };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts a successful read', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'polycost-secrets-metrics-'));
    const tokenFile = join(directory, 'vault-token');
    await writeFile(tokenFile, 'local-dev-token');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { data: { access_token: 'provider-token' } } }),
    } as Response);
    const { domainMetrics, render } = recorder();
    const service = new SecretsService(
      configService({ VAULT_ADDR: 'http://vault:8200', VAULT_TOKEN_FILE: tokenFile }),
      domainMetrics,
    );

    await service.getSecret('polycost/providers/gcp', 'access_token');

    expect(await render()).toContain('vault_reads_total{outcome="success"} 1');
  });

  it('counts a missing token file as a failure, before any Vault call', async () => {
    const { domainMetrics, render } = recorder();
    const service = new SecretsService(
      configService({ VAULT_ADDR: 'http://vault:8200' }),
      domainMetrics,
    );

    await expect(service.getSecret('polycost/providers/gcp', 'access_token')).rejects.toThrow();

    expect(await render()).toContain('vault_reads_total{outcome="failure"} 1');
  });

  it('counts a network error as a failure and still rethrows', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'polycost-secrets-metrics-'));
    const tokenFile = join(directory, 'vault-token');
    await writeFile(tokenFile, 'local-dev-token');
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const { domainMetrics, render } = recorder();
    const service = new SecretsService(
      configService({ VAULT_ADDR: 'http://vault:8200', VAULT_TOKEN_FILE: tokenFile }),
      domainMetrics,
    );

    await expect(service.getSecret('polycost/providers/gcp', 'access_token')).rejects.toThrow(
      'ECONNREFUSED',
    );

    expect(await render()).toContain('vault_reads_total{outcome="failure"} 1');
  });

  it('does not label the metric with the secret path', async () => {
    const { domainMetrics, render } = recorder();
    const service = new SecretsService(
      configService({ VAULT_ADDR: 'http://vault:8200' }),
      domainMetrics,
    );

    await expect(
      service.getSecret('polycost/providers/aws/production', 'secret_access_key'),
    ).rejects.toThrow();

    // The secret layout must not leak through an unauthenticated /metrics.
    const rendered = await render();
    expect(rendered).not.toContain('polycost/providers');
    expect(rendered).not.toContain('secret_access_key');
  });
});
