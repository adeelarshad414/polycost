# Phase 2 Diagram LLM Drift Alert Evidence

PolyCost can now validate diagram-classifier corpus evidence, assemble sanitized
live-model bundles, and monitor drift against a baseline. This phase adds the
alert handoff evidence contract for the next operational step: proving a drift
event is routed to an owner/reviewer channel without storing raw prompts,
provider responses, receiver URLs, email addresses, API keys, or signing secrets.

Run the checked-in sample alert contract:

```bash
npm run diagram:llm-corpus:drift:alert:check
```

Run the local reference sender/receiver proof:

```bash
npm run diagram:llm-corpus:drift:alert:smoke
```

The local reference receiver smoke generates sanitized live-model drift evidence,
signs an alert envelope, passes it to a local reference receiver, archives a
receiver receipt, writes a `staging-alert` evidence bundle under `.tmp/`, and
validates that bundle with the strict alert checker.

For staging alert proof, send a sanitized drift canary to the configured receiver
or incident system, archive receiver-side acceptance evidence, and run:

```bash
npm run diagram:llm-corpus:drift:alert:check -- --require-staging-alert <evidence.json>
```

The checked-in bundle uses `example-schema`. It proves the alert evidence format
only; it is not production alerting proof.

## Boundary

The checker does not call the model endpoint, send alerts, read Vault, or verify
receiver retention. The smoke does send a signed envelope through the local
reference receiver, but it does not call an external model endpoint, external
incident system, or production receiver. Production quality still depends on the
deployed alert receiver, incident workflow, scheduler, and receiver-side retention
proof from that environment; the local smoke is not receiver-side retention proof.
