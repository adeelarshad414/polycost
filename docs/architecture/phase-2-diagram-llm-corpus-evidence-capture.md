# Phase 2 Diagram LLM Corpus Evidence Capture

PolyCost already has a labeled corpus and `npm run diagram:llm-corpus:check` to
validate sanitized classifier evidence. This phase adds an operator-side capture
helper that assembles a standard evidence bundle from a capture profile and
sanitized prediction artifact, then hands the output to the existing checker.

## Capture Workflow

Run the default sample capture smoke:

```bash
npm run diagram:llm-corpus:capture:smoke
```

For production model evidence, run the labeled corpus against the configured
OpenAI-compatible endpoint/model, store the API key only in Vault at
`secret/polycost/llm`, archive sanitized predictions only, and create a capture
profile with `evidenceLevel=live-model`. Then run:

```bash
npm run diagram:llm-corpus:capture -- --require-live-model --profile <profile.json> --output <bundle.json>
```

Validate the output independently:

```bash
npm run diagram:llm-corpus:check -- --require-live-model <bundle.json>
```

The checked-in capture profile uses `example-schema`. It proves the capture
contract only; it is not production LLM proof.

## Boundary

The helper does not call the model endpoint, read Vault, store prompts, or store
raw provider responses. It assembles sanitized operator evidence and validates the
result. Production quality still depends on endpoint/model choice, Vault-backed
secret handling, corpus refresh, drift monitoring, false-positive review, and
operator signoff.
