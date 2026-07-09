# Phase 2 Diagram LLM Corpus Evidence

PolyCost's Tier 3 diagram classifier is optional and OpenAI-compatible. It stays
off by default, and unresolved nodes remain reviewable when no endpoint/model is
configured. This phase adds a repeatable corpus/evidence gate so production LLM
quality can be evaluated without storing raw prompts, raw provider responses, or
API keys.

## Evidence Contract

Run the default schema/sample check:

```bash
npm run diagram:llm-corpus:check
```

For production model evidence, run the labeled corpus against the configured
endpoint/model with the API key read from Vault at `secret/polycost/llm`, archive
only sanitized predictions and summary metadata, then run:

```bash
npm run diagram:llm-corpus:check -- --require-live-model <bundle.json>
```

The checked-in example bundle uses `example-schema`. It proves the corpus and
evidence contract only; it is not production LLM proof.

## Corpus Coverage

The baseline corpus lives at
`fixtures/diagrams/llm-corpus/diagram-llm-corpus.v1.json` and covers:

- compute, containers, application, storage, database, and networking
- integration, analytics, AI, security, operations, and DevOps categories
- service-type classification, not only broad category matching

The checker computes category accuracy, service-type accuracy, and high-confidence
coverage from the prediction evidence. Defaults require at least 90% category
accuracy and 80% service-type accuracy.

## Boundary

This evidence makes classifier quality measurable. It does not make PolyCost a
production-connected LLM classifier by itself. A production claim still requires a
real endpoint/model, Vault-backed `api_key`, `evidenceLevel=live-model`, strict
`--require-live-model` verification, operator review, ongoing corpus refresh,
false-positive tracking, and drift monitoring.
