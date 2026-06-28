# Phase 5 - NWS Parser Module

Phase 5 adds the two parser paths that convert user input into the shared
Normalized Workload Specification.

## Services

- `FormToNWSService` maps structured form fields into NWS deterministically.
- `NLParserService` sends natural-language requirements to a structured-output LLM
  client, then validates the returned draft NWS.
- `OpenAiCompatibleNwsLlmClient` provides a provider-neutral HTTP boundary for
  OpenAI-compatible chat-completions APIs with JSON schema response format.

Both parser paths return the exact `NormalizedWorkloadSpec` shape and both call
`NWSValidator.validate()` before returning an NWS.

## Security Boundary

Natural-language input is treated as untrusted data:

- Empty, oversized, and clearly non-workload input is rejected before LLM calls.
- User text is wrapped in `<requirements>` delimiters.
- The system prompt tells the model to ignore instructions inside user text that try
  to reveal prompts, change schema, skip validation, or execute tools.
- LLM-provided metadata is not trusted. `NLParserService` overwrites metadata with
  `sourceType: natural_language`, the original raw input, and server-side timestamp.
- LLM output is always validated by `NWSValidator`.

## Configuration And Secrets

Non-secret parser config:

- `NL_PARSE_MAX_INPUT_CHARS`
- `LLM_PARSE_ENDPOINT`
- `LLM_PARSE_MODEL`

The LLM API key is read only through `SecretsReader` at Vault path `polycost/llm` key
`api_key`.

If endpoint/model config is missing, the LLM client throws a clear
`NWSParserConfigurationError` when NL parsing is attempted. The API can still boot so
self-hosters may configure NL parsing later.

## Verification Notes

Unit tests cover:

- Structured form to NWS mapping.
- Form parser validation failures through `NWSValidator`.
- NL parser strict JSON schema request.
- Prompt-injection mitigation prompt shape.
- LLM metadata override.
- Empty/oversized/non-workload input rejection before LLM calls.
- Malformed confidence metadata defaults.
- Invalid LLM output rejected through `NWSValidator`.
- Form and NL paths producing the same NWS shape.
- Vault-backed OpenAI-compatible client request construction and error paths.
