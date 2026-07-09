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

Review the live capture plan without network calls:

```bash
npm run pricing:catalog:snapshot:capture:plan
```

Review live-capture readiness without provider network calls:

```bash
npm run pricing:catalog:snapshot:capture:preflight
```

Replay provider-native fixture payloads through the live capture normalizers
without provider credentials:

```bash
npm run pricing:catalog:snapshot:capture:smoke
```

The smoke generates AWS Price List, Azure Retail Prices, and GCP Cloud Billing
fixture payloads, changes one price-bearing row per provider, validates
`provider-snapshot-smoke` evidence, and confirms `--require-live-provider`
rejects the fixture output.

Strict preflight is for target environments:

```bash
POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE=true \
  POLYCOST_OPERATOR="<reviewer-name>" \
  PRICING_CATALOG_PREVIOUS_LIVE_EVIDENCE=<prior-live-provider-bundle.json> \
  npm run pricing:catalog:snapshot:capture:preflight:strict
```

Strict preflight validates the live guard, reviewer identity, previous live
evidence, GCP credential source, endpoint configuration, and no-secret output
posture before live capture is attempted. It does not call provider catalog APIs
and does not replace the actual `--live` capture run.

For live provider proof, run the guarded operator-side capture command from a
read-only provider environment:

```bash
POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE=true \
  npm run pricing:catalog:snapshot:capture -- \
  --live \
  --operator "<reviewer-name>" \
  --previous-evidence <prior-live-provider-bundle.json>
```

Live capture requires prior live evidence so first-run captures cannot be
misrepresented as exact row-change proof. The command reads public AWS Price List
and Azure Retail Prices endpoints, uses a GCP Cloud Billing read token from env,
token file, or Vault, and archives only sanitized hashes, source record keys,
public endpoint references, and representative rows. It then validates the output
through:

```bash
npm run pricing:catalog:snapshot:check -- --require-live-provider <evidence.json>
```

After the bundle is archived, validate the archive manifest:

```bash
npm run pricing:catalog:snapshot:capture:archive:check -- <archive.json>
```

Use strict archive mode before claiming live-provider archive proof:

```bash
npm run pricing:catalog:snapshot:capture:archive:strict -- <archive.json>
```

Generate that archive manifest from captured artifacts:

```bash
npm run pricing:catalog:snapshot:capture:archive:build -- \
  --preflight <preflight.json> \
  --capture <capture.json> \
  --snapshot-evidence <evidence.json> \
  --operator "<reviewer-name>" \
  --output <archive.json> \
  --require-live-archive
```

The local builder smoke proves this handoff without provider credentials:

```bash
npm run pricing:catalog:snapshot:capture:archive:build:smoke
```

The archive verifier checks the manifest schema, referenced evidence SHA-256,
operator attestation, strict preflight posture, capture metadata, provider
coverage, and the underlying `--require-live-provider` result. The checked-in
archive manifest is `example-schema` and is rejected by strict mode.

## Boundary

The checked-in example is `example-schema`, and the smoke is fixture replay. They
prove the evidence contract, freshness math, and exact row-change comparison, but
they do not call provider APIs. Live provider proof must use
`evidenceLevel=live-provider-snapshot`, real provider API source modes, reviewed
endpoints, and archived sanitized snapshot evidence. Even live catalog snapshots
remain catalog-list-price evidence, not invoice-grade billing, private pricing,
tax, credit, marketplace, support, or provider invoice-of-record proof.
