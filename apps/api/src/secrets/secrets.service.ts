import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { AppConfig } from '../config/config.schema';

export interface SecretsReader {
  getSecret(path: string, key: string): Promise<string>;
}

interface VaultKvResponse {
  data?: {
    data?: Record<string, unknown>;
  };
}

@Injectable()
export class SecretsService implements SecretsReader {
  private cachedVaultToken?: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async getSecret(path: string, key: string): Promise<string> {
    const endpoint = this.configService.get('VAULT_ADDR', { infer: true });
    const token = await this.getVaultToken();
    const secretUrl = `${endpoint.replace(/\/$/, '')}/v1/secret/data/${path}`;
    const response = await fetch(secretUrl, {
      headers: {
        'X-Vault-Token': token,
      },
    });
    const body = (await response.json()) as VaultKvResponse;
    const value = body.data?.data?.[key];

    if (!response.ok || typeof value !== 'string') {
      throw new Error(`Secret value not found at ${path}:${key}`);
    }

    return value;
  }

  private async getVaultToken(): Promise<string> {
    if (this.cachedVaultToken) {
      return this.cachedVaultToken;
    }

    const tokenFile = this.configService.get('VAULT_TOKEN_FILE', { infer: true });

    if (!tokenFile) {
      throw new Error('VAULT_TOKEN_FILE is required before retrieving secrets');
    }

    this.cachedVaultToken = (await readFile(tokenFile, 'utf8')).trim();
    return this.cachedVaultToken;
  }
}
