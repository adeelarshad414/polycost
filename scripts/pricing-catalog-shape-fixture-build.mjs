#!/usr/bin/env node
/*
  Builds the live-shape resolver fixture.

  The mock catalog publishes compute attributes in exactly the shape the
  resolvers expect, which is why four consecutive resolver defects (#224, #225,
  #226, #227) shipped against a green suite. This captures the *distinct
  attribute shapes* a real catalog actually contains, so the resolvers can be
  pinned against them.

  It captures shapes, not the catalog: prices, regions, effective dates and
  lineage are all dropped, and rows are collapsed to one representative per
  distinct (provider, family label, processor, size name, tenancy) signature.
  That keeps the fixture small enough to review in a diff while still covering
  every shape the resolvers have to cope with.

  Usage (needs the local Postgres up):
    node scripts/pricing-catalog-shape-fixture-build.mjs

  The fixture is committed. Rebuild it when a provider changes the attributes it
  publishes, and read the diff carefully - a changed expectation is either a
  provider change or a resolver regression, and the two look identical here.
*/
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.join(
  process.cwd(),
  'apps/api/src/pricing-normalization/__fixtures__/live-catalog-shapes.json',
);

const SQL = `
  SELECT json_agg(row_to_json(t) ORDER BY t.provider, t.sku_id)
  FROM (
    SELECT DISTINCT ON (provider, sig)
      provider, sku_id, service_name, sku_description, attributes
    FROM (
      SELECT provider, sku_id, service_name, sku_description, attributes,
             concat_ws('|',
               coalesce(attributes->>'instanceFamily', attributes->>'family', ''),
               coalesce(attributes->>'physicalProcessor', attributes->>'processor', ''),
               coalesce(attributes->>'processorArchitecture', ''),
               -- Size NAMES are collapsed to size SHAPES: digits become '#', so
               -- Standard_D4ps_v5 and Standard_D8ps_v5 are one shape while
               -- Standard_D4ps_v5 and Standard_D4s_v5 stay two. Every distinct
               -- input to the resolvers survives; only size variants collapse,
               -- which takes the fixture from 3,417 rows to a reviewable few
               -- hundred.
               regexp_replace(coalesce(nullif(attributes->>'armSkuName',''), attributes->>'skuName',
                        attributes->>'instanceType', attributes->>'machineType', ''),
                        '[0-9]+', '#', 'g'),
               coalesce(attributes->>'tenancy', '')) AS sig
      FROM pricing_catalog
      WHERE service_category = 'compute'
    ) s
    ORDER BY provider, sig, sku_id
  ) t;
`;

function psql(sql) {
  // The query goes over stdin, not -c: psql reads a backslash-escaped newline
  // in an argument as one of its own backslash commands.
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'sh',
      '-lc',
      'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -f -',
    ],
    { encoding: 'utf8', input: sql, maxBuffer: 256 * 1024 * 1024 },
  );
}

// Attributes the resolvers read. Everything else - prices, meter ids, lineage,
// currency, source endpoints - is dropped: it is not input to resolution, and
// carrying it would make the fixture churn on every catalog refresh.
const KEPT = new Set([
  'family',
  'instanceFamily',
  'normalizedFamily',
  'instanceType',
  'skuName',
  'armSkuName',
  'machineType',
  'processor',
  'physicalProcessor',
  'processorArchitecture',
  'architecture',
  'cpuArchitecture',
  'tenancy',
  'hostTenancy',
  'computeTenancy',
]);

const rows = JSON.parse(psql(SQL).trim() || '[]');
const shapes = rows.map((row) => {
  const attributes = {};
  for (const [key, value] of Object.entries(row.attributes ?? {})) {
    if (KEPT.has(key)) {
      attributes[key] = value;
    }
  }
  return {
    provider: row.provider,
    skuId: row.sku_id,
    ...(row.service_name ? { serviceName: row.service_name } : {}),
    ...(row.sku_description ? { skuDescription: row.sku_description } : {}),
    attributes,
  };
});

const byProvider = shapes.reduce(
  (acc, s) => ({ ...acc, [s.provider]: (acc[s.provider] ?? 0) + 1 }),
  {},
);
writeFileSync(OUT, `${JSON.stringify(shapes, null, 2)}\n`);
console.log(
  `Wrote ${shapes.length} distinct compute shapes to ${path.relative(process.cwd(), OUT)}`,
);
console.log(
  Object.entries(byProvider)
    .map(([p, n]) => `  ${p}: ${n}`)
    .join('\n'),
);
