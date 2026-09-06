import { describe, it, expect, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { FetchLike } from '../adapters/common/http-client.js';
import { FrankfurterExchangeRateClient } from './exchange-rate.client.js';

const configService = {
  get: jest.fn<ConfigService['get']>((key: keyof AppConfig) => {
    switch (key) {
      case 'EXCHANGE_RATE_API_URL':
        return 'https://api.frankfurter.app/latest';
      case 'EXCHANGE_RATE_TARGET_CURRENCIES':
        return 'EUR,GBP,PKR';
      default:
        throw new Error(`Unexpected config key ${String(key)}`);
    }
  }),
} as unknown as ConfigService<AppConfig, true>;

describe('FrankfurterExchangeRateClient', () => {
  it('fetches latest USD rates from the configured public endpoint', async () => {
    const fetchClient: FetchLike = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          amount: 1,
          base: 'USD',
          date: '2026-06-29',
          rates: {
            EUR: 0.87673,
            GBP: 0.75587,
            PKR: 283.12,
            bad: 0,
          },
        }),
    }));
    const client = new FrankfurterExchangeRateClient(
      configService,
      fetchClient,
      () => new Date('2026-06-30T00:00:00.000Z'),
    );

    await expect(client.fetchLatest('USD')).resolves.toEqual({
      baseCurrency: 'USD',
      source: 'https://api.frankfurter.app/latest',
      fetchedAt: '2026-06-30T00:00:00.000Z',
      rates: {
        EUR: 0.87673,
        GBP: 0.75587,
        PKR: 283.12,
      },
    });
    expect(fetchClient).toHaveBeenCalledWith(
      'https://api.frankfurter.app/latest?from=USD&to=EUR%2CGBP%2CPKR',
    );
  });

  it('fails loudly when the provider response has no usable rates', async () => {
    const fetchClient: FetchLike = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ base: 'USD', rates: {} }),
    }));
    const client = new FrankfurterExchangeRateClient(configService, fetchClient);

    await expect(client.fetchLatest('USD')).rejects.toThrow('no usable quote currencies');
  });
});
