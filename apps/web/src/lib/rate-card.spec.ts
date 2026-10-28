import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PolyCostClient } from '../api-client';
import { loadModeledRateCard } from './rate-card';
import { RATE_CARD_FIXTURE } from './rate-card.test-fixture';

// ADR-0002 (audit H-10): the web app has no copy of the modeled rates.

describe('modeled rate card in the web app', () => {
  it('keeps no rate constants in the bundled catalogs', () => {
    const source = readFileSync(join(__dirname, 'app-catalogs.ts'), 'utf8');
    for (const banned of [
      'APP_PLATFORM_MODEL_RATES',
      'SERVERLESS_FUNCTION_RATES',
      'COMPUTE_ARM_COST_FACTORS',
      'REGION_VARIANCE_PROFILES',
      'gbSecond',
      'vcpuHour',
    ]) {
      expect({ banned, present: source.includes(banned) }).toEqual({ banned, present: false });
    }
  });

  it('loads the card once per client and retries after a failure', async () => {
    const getRateCard = jest
      .fn<Promise<typeof RATE_CARD_FIXTURE>, []>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(RATE_CARD_FIXTURE);
    const client = { getRateCard } as unknown as PolyCostClient;

    await expect(loadModeledRateCard(client)).resolves.toBeNull();
    await expect(loadModeledRateCard(client)).resolves.toBe(RATE_CARD_FIXTURE);
    await expect(loadModeledRateCard(client)).resolves.toBe(RATE_CARD_FIXTURE);
    expect(getRateCard).toHaveBeenCalledTimes(2);
  });
});
