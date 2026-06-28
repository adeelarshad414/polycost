# Security Implementation Notes

These notes capture build-impact decisions from `11-SECURITY.md`.

## Required Controls

- Validate every external input server-side.
- Constrain NL parser output to the NWS schema and revalidate with `NWSValidator`.
- Protect admin/internal endpoints with a Vault-backed admin API key in MVP.
- Apply `helmet` by default.
- Use CORS allowlists from config, never wildcard CORS outside local dev.
- Rate-limit `/workload/parse` and `/comparisons/:id/refresh-live` from config.
- Use least-privilege DB roles, with separate ETL role if ETL runs separately.
- Retrieve DB credentials and API keys from Vault only.

## Export Safety

- Prefix user-influenced CSV/XLSX cells starting with formula-trigger characters.
- Escape all user-influenced values in PDF HTML templates.

## CI Security Gates

- Dependency vulnerability scan.
- ESLint security rules.
- Secret scanning with a tool such as Gitleaks.
- Container image scanning with a tool such as Trivy.

## Repo Initialization Requirements

- Add root `SECURITY.md` for private vulnerability reporting.
- Commit lockfiles and use `npm ci` in CI/build.
- Do not expose Postgres or Redis ports beyond the Docker network by default.
- Keep production Vault auth identity-based; never document the dev token as a
  production option.
