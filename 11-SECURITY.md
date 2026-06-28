# PolyCost - Security Best Practices

Companion to `00-MASTER-PROMPT.md` section 3.10. Security is applied as code is
written, not as a final pass. This document is the checklist every PR is implicitly
reviewed against and the reference for automated CI scanning.

## 1. Threat model summary

| Asset | Threat | Why it matters |
| --- | --- | --- |
| Pricing catalog data | Tampering | Corrupted pricing makes every comparison wrong |
| Cloud provider API credentials | Theft/leakage | Even read-only pricing credentials are secrets |
| LLM API key | Theft/abuse | A leaked key creates direct cost exposure |
| User-submitted NL text | Prompt injection or traditional injection | NL input is the largest untrusted free-text surface |
| Generated reports | CSV/Excel formula injection | Export files can execute formulas in spreadsheet apps |
| Self-hosted deployments | Misconfiguration | OSS defaults must protect less-expert operators |

PolyCost does not handle payment data, does not store end-user PII in the MVP, and
does not execute user-supplied code. That narrows the MVP threat surface, but does not
remove the need for secure defaults.

## 2. OWASP-aligned application security

### 2.1 Input validation

Every external input is validated.

- Natural-language requirement text is length-capped.
- NL parsing uses structured output/function calling constrained to the NWS schema.
- LLM output is always run through `NWSValidator`.
- Structured form submissions are validated server-side via `NWSValidator`.
- Client-side validation is UX, not security.
- Query and path params, such as `format=pdf|csv|xlsx`, are validated against
  explicit allowlists and rejected with `400` otherwise.

V2+ file uploads are out of MVP scope, but future diagram parsing must use file type
allowlisting, size limits, sandboxed/resource-limited parsing, and XXE-safe XML
handling.

### 2.2 Output encoding

- API responses use `application/json` with proper `Content-Type`.
- The API layer never reflects user input as HTML.
- React's default JSX escaping is used for rendered data.
- `dangerouslySetInnerHTML` is not used for user-influenced content.

### 2.3 Authentication and authorization

- MVP is anonymous by design, so there is no end-user authn/authz surface.
- Internal/admin endpoints, including `GET /pricing/status` and future admin
  surfaces, are still protected.
- MVP admin protection should use a simple admin API key checked via middleware, with
  the key stored in Vault via `09-CONFIG-AND-SECRETS.md`.
- Future account work requires a full rewrite of this section, including session
  management, password storage, and RBAC.

### 2.4 Report generation security

CSV/Excel formula injection mitigation is required.

Any user-influenced cell value beginning with one of these characters is prefixed
with a single quote before being written:

- `=`
- `+`
- `-`
- `@`
- tab
- carriage return

This applies to service descriptions, workload names, and any other user-influenced
text in CSV or Excel exports.

PDF generation must escape interpolated user-influenced values. If Puppeteer renders
HTML, templates use an auto-escaping templating engine or equivalent safe rendering,
not raw string concatenation.

### 2.5 Rate limiting and abuse prevention

- `/workload/parse` is rate-limited because it triggers LLM calls.
- `/comparisons/:id/refresh-live` is rate-limited because it triggers external
  pricing API calls.
- Rate limiting is centralized, such as via `@nestjs/throttler`.
- Thresholds come from the Config Module, never hardcoded constants.
- MVP rate limit identity is IP-based, with documented shared-IP/NAT limitations.

### 2.6 Dependency and supply-chain security

- Dependency vulnerability scanning runs in CI on every PR.
- OSV-Scanner or `npm audit --audit-level=high` fails the build on high/critical
  findings.
- Lockfiles are committed.
- CI/build uses `npm ci`, not `npm install`.
- New dependencies are reviewed for license compatibility and maintenance health.

### 2.7 HTTP security headers and transport

- `helmet` middleware is applied to the NestJS app by default.
- HTTPS is required in every non-local environment.
- HTTP to HTTPS redirect is handled at the load balancer/reverse proxy layer.
- Local dev over plain HTTP is acceptable on localhost.
- CORS uses an explicit allowlist from config and never `*` outside local dev.

## 3. Database security

- Runtime application traffic never uses a superuser/owner DB role.
- The API connects with only the privileges it needs.
- If the pricing ETL job runs separately, it gets its own role scoped to
  `pricing_catalog` and `pricing_etl_runs`.
- Queries use ORM/query builder parameterization.
- Raw SQL string concatenation with user input is never used.
- Connection credentials come from Vault at runtime.
- No config file contains a credential-bearing connection string.
- Postgres connections use TLS in non-local environments.
- Encryption at rest is delegated to the hosting platform's managed Postgres service
  when deployed to cloud.
- Production deployments have automated daily backups and a tested restore procedure
  documented in `DEPLOY.md`.
- Schema changes use versioned migrations, not manual production `ALTER TABLE` runs.

## 4. Secure defaults for self-hosters

- Local `docker-compose.yml` does not expose Postgres or Redis ports beyond the
  Docker network by default.
- The Vault dev-server root token is loudly documented as dev-only.
- Production deployment docs never present the dev token as an option.
- Default rate limits are conservative.
- `helmet` and CORS allowlisting are enabled by default.
- No documented config flag disables core security controls for convenience.

## 5. Automated security scanning in CI

Per `10-TESTING-STRATEGY.md` stage 6, every PR runs:

1. Dependency vulnerability scanning, failing on high/critical findings.
2. Static analysis through ESLint security rules such as `eslint-plugin-security`.
3. Secret scanning, such as Gitleaks, against the diff.
4. Container image scanning, such as Trivy, before images are published or deployed.

Secret scanning is a safety net behind the architecture in
`09-CONFIG-AND-SECRETS.md`; it is not a substitute for the no-secret-code-path rule.

## 6. Incident response

- A repo-root `SECURITY.md` documents private vulnerability reporting.
- Vulnerabilities are not reported through public GitHub issues.
- MVP makes no formal SLA commitment.
- Reported vulnerabilities are triaged before new feature work.
