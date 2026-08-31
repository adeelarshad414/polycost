/* eslint-disable security/detect-object-injection, security/detect-non-literal-fs-filename -- Reviewed 2026-07-06: secret names are configured allowlist lookups and Vault file paths are deployment-controlled; see docs/SECURITY-SUPPRESSIONS.md. */
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainMetricsService } from '../observability/domain-metrics.service';
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

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    // @Optional() because the spec constructs this service directly, and a
    // missing recorder must degrade to no metrics rather than no secrets.
    @Optional() private readonly domainMetrics?: DomainMetricsService,
  ) {}

  async getSecret(path: string, key: string): Promise<string> {
    try {
      const value = await this.readSecret(path, key);
      this.domainMetrics?.recordVaultRead('success');
      return value;
    } catch (error) {
      // Counts every way a read can fail - unreadable token file, network
      // error, non-2xx, missing key - because from the caller's side they are
      // the same outage. The secret path is deliberately not a label: it is
      // unbounded and would leak the secret layout into the metrics endpoint.
      this.domainMetrics?.recordVaultRead('failure');
      throw error;
    }
  }

  private async readSecret(path: string, key: string): Promise<string> {
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
