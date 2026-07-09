# Phase 2 Diagram LLM Corpus Drift Monitoring

PolyCost now has three separate diagram-classifier evidence steps:

1. `npm run diagram:llm-corpus:check` validates one sanitized evidence bundle.
2. `npm run diagram:llm-corpus:capture` assembles a standard evidence bundle from
   operator-captured predictions.
3. `npm run diagram:llm-corpus:drift:check` compares the current bundle against a
   monitored baseline and fails on accuracy drift, unreviewed mismatches, or
   untracked false positives.

Run the checked-in sample drift contract:

```bash
npm run diagram:llm-corpus:drift:check
```

For production monitoring, keep the endpoint/model and Vault secret configured,
capture sanitized live predictions, validate the bundle with
`npm run diagram:llm-corpus:capture -- --require-live-model`, then run:

```bash
npm run diagram:llm-corpus:drift:check -- --require-live-model --profile <profile.json>
```

The checked-in profile uses `example-schema`. It proves the monitoring contract
only; it is not production LLM monitoring proof.

## Boundary

The drift checker does not call the model endpoint, read Vault, store prompts, or
store raw provider responses. It validates archived sanitized evidence and the
operator's false-positive/mismatch review record. Production quality still depends
on live endpoint operations, scheduled corpus refresh, reviewer workflow, and
alerting outside this local evidence gate.
