import { Injectable } from '@nestjs/common';

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

@Injectable()
export class PricingCacheService {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);

    if (cached !== undefined) {
      return cached;
    }

    const value = await loader();
    this.set(key, value, ttlSeconds);

    return value;
  }

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.entries.set(key, {
      expiresAt: Date.now() + ttlSeconds * 1000,
      value,
    });
  }

  invalidateByPrefix(prefix: string): number {
    let invalidated = 0;

    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        invalidated += 1;
      }
    }

    return invalidated;
  }

  pricingKey(input: {
    provider: string;
    skuOrService: string;
    region: string;
    term: string;
    paymentOption?: string;
  }): string {
    return [
      'pricing',
      input.provider,
      input.skuOrService,
      input.region,
      input.term,
      input.paymentOption ?? 'n_a',
    ].join(':');
  }

  comparisonKey(requestHash: string): string {
    return `comparison:${requestHash}`;
  }

  spotEstimateKey(provider: string, skuOrService: string, region: string): string {
    return `spot-estimate:${provider}:${skuOrService}:${region}`;
  }
}
