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

For staging alert proof, send a sanitized drift canary to the configured receiver
or incident system, archive receiver-side acceptance evidence, and run:

```bash
npm run diagram:llm-corpus:drift:alert:check -- --require-staging-alert <evidence.json>
```

The checked-in bundle uses `example-schema`. It proves the alert evidence format
only; it is not production alerting proof.

## Boundary

The checker does not call the model endpoint, send alerts, read Vault, or verify
receiver retention. It validates archived sanitized alert evidence, routing
attestations, owner/SLO policy, and reviewer handoff metadata. Production quality
still depends on the deployed alert receiver, incident workflow, scheduler, and
receiver-side retention proof.
