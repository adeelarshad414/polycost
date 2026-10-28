import { describe, it, expect } from '@jest/globals';
import {
  MODELED_RATE_CARD,
  RATE_CARD_MAX_AGE_DAYS,
  oldestReview,
  rateCardResponse,
  rateGroups,
  staleRateGroups,
  type ModeledRateCard,
} from './modeled-rate-card.js';

// ADR-0002 (audit H-10): one dated copy of every modeled rate.

const PROVIDERS = ['aws', 'azure', 'gcp'] as const;

describe('modeled rate card', () => {
  // Deliberately uses the real date: once a group goes unreviewed for longer
  // than RATE_CARD_MAX_AGE_DAYS this fails CI until someone re-checks it
  // against the provider's prices and moves `reviewedAt`.
  it('has no group past its review date', () => {
    const today = new Date().toISOString().slice(0, 10);
    const stale = staleRateGroups(MODELED_RATE_CARD, today);
    if (stale.length > 0) {
      throw new Error(
        `Re-check these modeled rates against the provider pricing pages, then update reviewedAt in modeled-rate-card.ts: ${JSON.stringify(stale)}`,
      );
    }
  });

  it('dates and sources every group', () => {
    for (const [name, group] of rateGroups(MODELED_RATE_CARD)) {
      expect({ name, sourced: group.source.length > 20 }).toEqual({ name, sourced: true });
      expect({ name, reviewedAt: group.reviewedAt }).toEqual({
        name,
        reviewedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect({ name, parses: Number.isFinite(Date.parse(group.reviewedAt)) }).toEqual({
        name,
        parses: true,
      });
    }
  });

  it('covers all three providers with non-negative, finite rates', () => {
    const card = MODELED_RATE_CARD;
    for (const provider of PROVIDERS) {
      const numbers = [
        ...Object.values(card.appPlatform.rates[provider]).filter((v) => typeof v === 'number'),
        card.serverlessFunctions.rates[provider].requestPerMillion,
        card.serverlessFunctions.rates[provider].gbSecond,
        card.computeArmCostFactors.rates[provider],
        ...Object.values(card.interRegionTransfer.rates[provider].routes),
        card.interRegionTransfer.rates[provider].sameContinent,
        card.interRegionTransfer.rates[provider].crossContinent,
        card.burstableCredits.rates[provider].unitPriceUsd,
      ];
      for (const value of numbers) {
        expect({ provider, value, valid: Number.isFinite(value) && value >= 0 }).toEqual({
          provider,
          value,
          valid: true,
        });
      }
      expect(card.computeArmCostFactors.rates[provider]).toBeLessThan(1);
    }
    expect(card.regionVariance.rates.find((row) => row.regionId === 'us-east')?.multiplier).toBe(1);
  });

  it('holds only finite, non-negative numbers, for every provider in every group', () => {
    const bad: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (typeof value === 'number') {
        if (!Number.isFinite(value) || value < 0) bad.push(`${path}=${value}`);
      } else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
      }
    };
    for (const [name, group] of rateGroups(MODELED_RATE_CARD)) {
      walk(group.rates, name);
      if (!Array.isArray(group.rates)) {
        expect({ name, providers: Object.keys(group.rates as object).sort() }).toEqual({
          name,
          providers: ['aws', 'azure', 'gcp'],
        });
      }
    }
    expect(bad).toEqual([]);
  });

  it('derives app-platform and function rates from the runtime group, so each price exists once', () => {
    for (const provider of PROVIDERS) {
      const runtime = MODELED_RATE_CARD.runtimeServices.rates[provider];
      expect(MODELED_RATE_CARD.serverlessFunctions.rates[provider].gbSecond).toBe(
        runtime.functionGbSecond,
      );
      expect(MODELED_RATE_CARD.appPlatform.rates[provider].alwaysOnVcpuHour).toBe(
        runtime.appPlatformAlwaysOnVcpuHour,
      );
    }
  });

  it('reports the oldest review as pricingAsOf', () => {
    const response = rateCardResponse();
    expect(response.kind).toBe('modeled');
    expect(response.maxAgeDays).toBe(RATE_CARD_MAX_AGE_DAYS);
    expect(response.pricingAsOf).toBe(oldestReview(MODELED_RATE_CARD));
    expect(response.pricingAsOf).toBe('2026-07-01');
  });

  it('flags groups past the limit, and an unparseable date', () => {
    const card: ModeledRateCard = {
      ...MODELED_RATE_CARD,
      appPlatform: { ...MODELED_RATE_CARD.appPlatform, reviewedAt: '2026-01-01' },
      burstableCredits: { ...MODELED_RATE_CARD.burstableCredits, reviewedAt: 'not-a-date' },
    };
    const stale = staleRateGroups(card, '2026-07-01', 180);
    expect(stale.map((entry) => entry.group)).toEqual(['appPlatform', 'burstableCredits']);
    expect(stale[0]).toMatchObject({ ageDays: 181 });
    expect(staleRateGroups(card, '2026-06-30', 180).map((entry) => entry.group)).toEqual([
      'burstableCredits',
    ]);
  });
});
