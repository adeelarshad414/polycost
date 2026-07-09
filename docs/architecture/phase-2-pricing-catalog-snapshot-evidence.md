# Phase 2 Pricing Catalog Snapshot Evidence

PolyCost already traces catalog rows into comparison line items and invoice pilot
evidence. This phase adds a catalog snapshot evidence contract for the provider
pricing cache itself: snapshot digests, source record keys, payload hashes,
freshness SLA checks, and exact row-change comparison between refresh runs.

Run the sample schema check:

```bash
npm run pricing:catalog:snapshot:check
```

Run the local AWS/Azure/GCP snapshot comparison smoke:

```bash
npm run pricing:catalog:snapshot:smoke
```

The smoke creates deterministic previous/current catalog snapshots under `.tmp/`,
changes one SKU row per provider, verifies row hashes and snapshot digests, and
then validates the generated bundle with:

```bash
npm run pricing:catalog:snapshot:check -- --require-provider-snapshot <evidence.json>
```

For live provider proof, archive a sanitized bundle produced from real AWS Price
List, Azure Retail Prices, and GCP Cloud Billing Catalog refreshes and run:

```bash
npm run pricing:catalog:snapshot:check -- --require-live-provider <evidence.json>
```

## Boundary

The checked-in example is `example-schema`, and the smoke is fixture replay. They
prove the evidence contract, freshness math, and exact row-change comparison, but
they do not call provider APIs. Live provider proof must use
`evidenceLevel=live-provider-snapshot`, real provider API source modes, reviewed
endpoints, and archived sanitized snapshot evidence. Even live catalog snapshots
remain catalog-list-price evidence, not invoice-grade billing, private pricing,
tax, credit, marketplace, support, or provider invoice-of-record proof.
