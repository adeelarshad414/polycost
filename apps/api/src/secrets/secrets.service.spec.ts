import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { SecretsService } from './secrets.service';

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
