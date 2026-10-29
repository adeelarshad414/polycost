import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PricingCatalogRecord } from '../adapters/common/cloud-provider-adapter.js';
import {
  CONTAINER_STARTUP_TIMEOUT_MS,
  ETL_ROLE,
  MigratedPostgres,
  startMigratedPostgres,
} from '../testing/postgres-container.js';
import { PostgresPricingCatalogRepository } from './pricing-catalog.repository.js';

/**
 * The pricing ETL's writes against a migrated Postgres, as polycost_etl
 * (audit H-11): idempotent upserts on the real unique key, sub-cent prices
 * surviving the round trip, and the H-08 prune guard deciding on real counts.
 */
describe('PostgresPricingCatalogRepository (integration)', () => {
  let db: MigratedPostgres;
  let repository: PostgresPricingCatalogRepository;

  beforeAll(async () => {
    db = await startMigratedPostgres();
    repository = new PostgresPricingCatalogRepository(
      db.config({ PRICING_ETL_PRUNE_MIN_FRESH_RATIO: 0.5 }),
      db.secrets(ETL_ROLE),
    );
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await repository?.onModuleDestroy();
    await db?.stop();
  });

  const FIRST_FETCH = '2026-10-01T00:00:00.000Z';
  const SECOND_FETCH = '2026-10-02T00:00:00.000Z';

  const live = (skuId: string, fetchedAt: string, unitPriceUsd = 0.0416): PricingCatalogRecord => ({
    provider: 'gcp',
    serviceCategory: 'compute',
    serviceName: 'Compute Engine',
    skuId,
    skuDescription: `${skuId} core hour`,
    region: 'us-central1',
    unit: 'h',
    unitPriceUsd,
    attributes: { vcpu: 2, sourceEndpoint: 'https://cloudbilling.googleapis.com/v1/skus' },
    effectiveDate: '2026-10-01T00:00:00.000Z',
    fetchedAt,
  });

  const catalogRows = async () =>
    (
      await db.admin.query<{ sku_id: string; unit_price_usd: string; fetched_at: Date }>(
        // Migrations seed fallback rows (local-seed-*); only this spec's rows count.
        "SELECT sku_id, unit_price_usd, fetched_at FROM pricing_catalog WHERE sku_id LIKE 'gcp-%' ORDER BY sku_id",
      )
    ).rows;

  it('upserts on the catalog key, so a re-run updates rather than duplicates', async () => {
    const first = await repository.upsertPricingRecords(
      ['A', 'B', 'C', 'D'].map((sku) => live(`gcp-${sku}`, FIRST_FETCH)),
    );
    expect(first).toMatchObject({ recordsUpdated: 4, recordsRejected: 0 });

    await repository.upsertPricingRecords([live('gcp-A', FIRST_FETCH, 0.05)]);

    const rows = await catalogRows();
    expect(rows.map((row) => row.sku_id)).toEqual(['gcp-A', 'gcp-B', 'gcp-C', 'gcp-D']);
    expect(Number(rows[0].unit_price_usd)).toBe(0.05);
  });

  const readBack = async (unitPriceUsd: number) => {
    await repository.upsertPricingRecords([
      {
        ...live('gcp-egress', FIRST_FETCH, unitPriceUsd),
        serviceCategory: 'network',
        unit: 'GiBy',
      },
    ]);
    try {
      const [found] = await repository.find({
        provider: 'gcp',
        category: 'network',
        region: 'us-central1',
        serviceIds: ['gcp-egress'],
      });
      return found;
    } finally {
      await db.admin.query("DELETE FROM pricing_catalog WHERE sku_id = 'gcp-egress'");
    }
  };

  it('keeps sub-cent unit prices and reads them back with lineage', async () => {
    const found = await readBack(0.000123);

    expect(found.unitPriceUsd).toBe(0.000123);
    expect(found.attributes).toMatchObject({
      sourceEndpoint: 'https://cloudbilling.googleapis.com/v1/skus',
      sourcePayloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  // KNOWN-ISSUES K-14: pricing_catalog.unit_price_usd is NUMERIC(14, 6), so a
  // price below half a micro-dollar per unit is stored as 0. Expected to fail
  // until the column is widened; Jest then reports this test, and `.failing`
  // comes off.
  it.failing('keeps unit prices finer than a micro-dollar (K-14)', async () => {
    expect((await readBack(0.0000002)).unitPriceUsd).toBe(0.0000002);
  });

  it('refuses to prune when the refresh returned too little of the catalog (H-08)', async () => {
    // One of four SKUs came back: 25% fresh, under the 50% minimum.
    await repository.upsertPricingRecords([live('gcp-A', SECOND_FETCH)]);

    await expect(repository.pruneStaleLiveRows('gcp', SECOND_FETCH)).resolves.toEqual({
      pruned: 0,
      fresh: 1,
      stale: 3,
      skipped: true,
    });
    expect(await catalogRows()).toHaveLength(4);
  });

  it('prunes only the live rows the latest refresh did not return, never seed rows', async () => {
    // Seed rows come from the migrations with no source endpoint.
    const seedCount = async () =>
      (
        await db.admin.query<{ count: string }>(
          "SELECT count(*) FROM pricing_catalog WHERE provider = 'gcp' AND source_endpoint IS NULL",
        )
      ).rows[0].count;
    const seedsBefore = await seedCount();
    expect(Number(seedsBefore)).toBeGreaterThan(0);

    await repository.upsertPricingRecords(
      ['B', 'C'].map((sku) => live(`gcp-${sku}`, SECOND_FETCH)),
    );

    await expect(repository.pruneStaleLiveRows('gcp', SECOND_FETCH)).resolves.toEqual({
      pruned: 1,
      fresh: 3,
      stale: 1,
      skipped: false,
    });
    expect((await catalogRows()).map((row) => row.sku_id)).toEqual(['gcp-A', 'gcp-B', 'gcp-C']);
    expect(await seedCount()).toBe(seedsBefore);
  });

  it('records a provider run the app role can read', async () => {
    await repository.recordProviderRun({
      provider: 'gcp',
      startedAt: FIRST_FETCH,
      completedAt: SECOND_FETCH,
      status: 'success',
      recordsUpdated: 4,
      recordsRejected: 0,
      recordsSkipped: 0,
    });

    const runs = await db.admin.query<{ status: string; records_updated: number }>(
      'SELECT status, records_updated FROM pricing_etl_runs WHERE provider = $1 AND started_at = $2',
      ['gcp', FIRST_FETCH],
    );
    expect(runs.rows).toEqual([{ status: 'success', records_updated: 4 }]);
  });
});
