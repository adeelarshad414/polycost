import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { SecretsService } from '../secrets/secrets.service';
import type { SecretsReader } from '../secrets/secrets.service';
import { ApiUnauthorizedError } from './api-errors';

interface HeaderRequest {
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  private cachedAdminApiKey?: string;

  constructor(@Inject(SecretsService) private readonly secretsReader: SecretsReader) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HeaderRequest>();
    const providedKey = readAdminApiKeyHeader(request.headers);

    if (!providedKey) {
      throw new ApiUnauthorizedError('Admin API key is required');
    }

    const expectedKey = await this.getAdminApiKey();

    if (!safeEqual(providedKey, expectedKey)) {
      throw new ApiUnauthorizedError('Invalid admin API key');
    }

    return true;
  }

  private async getAdminApiKey(): Promise<string> {
    if (!this.cachedAdminApiKey) {
      this.cachedAdminApiKey = await this.secretsReader.getSecret('polycost/admin', 'api_key');
    }

    return this.cachedAdminApiKey;
  }
}

function readAdminApiKeyHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const value = headers['x-admin-api-key'];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
