# PolyCost - API Contracts (V1 / MVP)

Base URL: `/api/v1`

All endpoints return `application/json` unless otherwise noted. Errors follow a
consistent shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [{ "field": "workload.type", "issue": "required" }]
  }
}
```

## POST `/workload/parse`

Parses natural language input into a draft NWS for user review and editing. No
pricing happens here.

Request:

```json
{
  "naturalLanguageInput": "I need a web app for 5,000 daily users with a Postgres database and file storage"
}
```

Response `200`:

```json
{
  "draftNws": {},
  "parserConfidence": "high",
  "fieldsRequiringReview": ["compute[0].instanceCount"]
}
```

Errors:

- `422` if input is empty or clearly not a workload description. The message should
  guide the user to rephrase instead of silently rejecting the input.

## POST `/workload/validate`

Validates a possibly user-edited NWS before pricing. Used when the user submits the
structured form directly or confirms an LLM-parsed draft.

Request: a full `NormalizedWorkloadSpec`.

Response `200`:

```json
{ "valid": true }
```

Response `400`: standard error shape with field-level details.

## POST `/comparisons`

Runs the full three-cloud comparison for a valid NWS. This is the core endpoint.

Request:

```json
{
  "nws": {},
  "options": {
    "useLivePricing": false
  }
}
```

Response `201`:

```json
{
  "comparisonId": "uuid",
  "pricingAsOf": "2026-06-27T02:00:00Z",
  "providers": [
    {
      "providerId": "aws",
      "lineItems": [
        {
          "category": "compute",
          "description": "EC2 t3.medium x2",
          "isApproximate": false,
          "baseMonthlyCostUsd": 60.8
        }
      ],
      "totals": {
        "daily": 2.36,
        "weekly": 16.52,
        "monthly": 71.0,
        "quarterly": 213.0,
        "yearly": 852.0
      }
    },
    {
      "providerId": "azure",
      "lineItems": [],
      "totals": {}
    },
    {
      "providerId": "gcp",
      "lineItems": [],
      "totals": {}
    }
  ],
  "cheapestProviderId": "gcp"
}
```

Errors:

- `400` for invalid NWS. This should rarely happen if `/workload/validate` was called
  first.
- `503` if a cloud adapter's pricing data is unavailable.

Partial degradation should return the available providers with a warning field rather
than failing the entire request:

```json
{
  "comparisonId": "uuid",
  "providers": [],
  "warnings": [
    {
      "providerId": "azure",
      "message": "Pricing data temporarily unavailable"
    }
  ]
}
```

## GET `/comparisons/:id`

Retrieves a previously run comparison by ID. This reads from the `comparisons`
snapshot table and does not re-run pricing.

Response `200`: same shape as the `POST /comparisons` response.

Response `404`: comparison not found.

## GET `/comparisons/:id/export`

Query params:

- `format=pdf|csv|xlsx` is required.

Returns the file as a binary download with appropriate `Content-Type` and
`Content-Disposition: attachment; filename="polycost-comparison-{id}.{ext}"`.

| Format | Content-Type |
| --- | --- |
| `pdf` | `application/pdf` |
| `csv` | `text/csv` |
| `xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

Errors:

- `400` if `format` is missing or invalid.
- `404` if comparison ID is not found.

## POST `/comparisons/:id/refresh-live`

Re-queries live provider pricing APIs for only the services in this specific
comparison, not a full catalog refresh. Returns an updated `ComparisonResult` with a
new `pricingAsOf` timestamp.

This endpoint does not mutate the original snapshot. It creates a new comparison
record so the original remains reproducible.

Response `201`: new `ComparisonResult`, same shape as `POST /comparisons`.

Rate limiting: this endpoint is rate-limited per session/IP because it triggers real
external API calls. Document the limit in response headers, including
`X-RateLimit-Remaining`.

## GET `/pricing/status`

Admin/diagnostic endpoint. Returns the latest ETL run status per provider. Used to
power the "Pricing last updated" UI indicator.

Response `200`:

```json
{
  "providers": [
    {
      "providerId": "aws",
      "lastSuccessfulRun": "2026-06-27T02:00:00Z",
      "status": "success"
    },
    {
      "providerId": "azure",
      "lastSuccessfulRun": "2026-06-27T02:05:00Z",
      "status": "success"
    },
    {
      "providerId": "gcp",
      "lastSuccessfulRun": "2026-06-26T02:00:00Z",
      "status": "failed"
    }
  ]
}
```

## Rate limiting

Rate limiting applies system-wide for MVP.

- `/workload/parse` is limited per IP because it triggers an LLM call.
- `/comparisons/:id/refresh-live` is limited per IP because it triggers external
  pricing API calls.
- All other endpoints use standard abuse-prevention rate limits that are generous
  enough not to interfere with normal usage.

Exact thresholds are a deployment config decision, not a hardcoded constant. Keep
them in environment config so self-hosters can tune for their own LLM/API budgets.
