# Phase 2 Invoice-Of-Record Pilot Evidence

PolyCost has invoice reconciliation, artifact registration, artifact storage,
retention proof, packet export, notary receipt, and audit-export foundations. This
phase adds a stricter finance-control evidence gate for provider invoice-of-record
pilots without claiming PolyCost is an invoice system of record.

## Evidence Contract

Run the default schema/sample check:

```bash
npm run invoice:record:evidence:check
```

For a real provider invoice pilot, archive sanitized digests and metadata for the
provider invoice of record, billing export manifest, normalized actuals,
reconciliation evidence packet, private-pricing artifacts, tax/credit/support/
marketplace/refund/fee classifications, commitment inventory/amortization/allocation
proof, provider retention proof, notary receipt, and audit export, then run:

```bash
npm run invoice:record:evidence:check -- --require-provider-invoice <bundle.json>
```

The checked-in example bundle uses `example-schema`. It proves the evidence
contract only; it is not provider invoice proof.

## Required Proof

Provider invoice pilot evidence must cover:

- provider invoice ID/account/period/control total and invoice digest
- billing export manifest, normalized actuals digest, row count, source-fingerprint
  coverage, and period match to the invoice
- reconciliation controls for private pricing, tax, credits/refunds, support/fees,
  marketplace charges, commitments, allocation tags, currency conversion, and SKU
  mapping
- private rate card, contract, and discount schedule digests
- commitment inventory, amortization-period, and allocation proof digests
- evidence packet, artifact governance manifest, retention proof, notary receipt,
  and audit-export digests
- finance and security reviewer attestations with customer PII, raw invoice bytes,
  raw billing exports, contracts, and credentials excluded from the bundle

## Boundary

This gate makes invoice-grade pilot evidence measurable. It does not make PolyCost
a provider invoice system of record, tax/legal authority, procurement contract
system, payment processor, or billing dispute platform. Final invoice-grade
interpretation remains customer-owned and depends on provider invoices, contracts,
legal/tax review, retained artifacts, and finance approval.
