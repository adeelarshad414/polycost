import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { defaultFetch, HttpResponseLike } from '../adapters/common/http-client';
import type { FetchLike } from '../adapters/common/http-client';
import { AppConfig } from '../config/config.schema';

interface FrankfurterLatestResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

export interface ExchangeRateSnapshot {
  baseCurrency: string;
  rates: Record<string, number>;
  source: string;
  fetchedAt: string;
}

export interface ExchangeRateClient {
  fetchLatest(baseCurrency: string): Promise<ExchangeRateSnapshot>;
}

@Injectable()
export class FrankfurterExchangeRateClient implements ExchangeRateClient {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly fetchClient: FetchLike = defaultFetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async fetchLatest(baseCurrency: string): Promise<ExchangeRateSnapshot> {
    const source = this.configService.get('EXCHANGE_RATE_API_URL', { infer: true });
    const targetCurrencies = this.configService
      .get('EXCHANGE_RATE_TARGET_CURRENCIES', { infer: true })
      .split(',')
      .map((currency) => currency.trim().toUpperCase())
      .filter(Boolean);
    const url = new URL(source);

    url.searchParams.set('from', baseCurrency);
    if (targetCurrencies.length > 0) {
      url.searchParams.set('to', targetCurrencies.join(','));
    }

    const response = await this.fetchClient(url.toString());
    const parsed = await parseExchangeRateJson(response);
    const rates = sanitizeRates(parsed.rates);

    if (Object.keys(rates).length === 0) {
      throw new Error('Exchange-rate provider returned no usable quote currencies');
    }

    return {
      baseCurrency: (parsed.base || baseCurrency).toUpperCase(),
      rates,
      source,
      fetchedAt: this.now().toISOString(),
    };
  }
}

async function parseExchangeRateJson(
  response: HttpResponseLike,
): Promise<FrankfurterLatestResponse> {
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Exchange-rate API request failed with ${response.status}: ${body}`);
  }

  return JSON.parse(body) as FrankfurterLatestResponse;
}

function sanitizeRates(rates: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(
    Object.entries(rates ?? {})
      .map(([currency, rate]) => [currency.toUpperCase(), rate] as const)
      .filter(
        ([currency, rate]) => /^[A-Z]{3}$/.test(currency) && Number.isFinite(rate) && rate > 0,
      ),
  );
}
