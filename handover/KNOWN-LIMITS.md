# Known Limits

## Verified(mock) Boundaries

- Local pricing uses seeded/mock catalog data unless provider ETL credentials are configured.
- Mock OIDC proves the auth handshake shape, not a production IdP rollout.
- Diagram LLM classification is config-ready and deterministic-fallback safe, not production-connected by default.
- Terraform output is generated and statically validated by tests; provider-authenticated plans are customer-environment work.

## Future Product Phases

- Invoice-grade cloud billing coverage across every provider SKU and enterprise discount model.
- Full VSDX visual rendering.
- Production LLM classifier endpoint, monitored corpus, and false-positive review workflow.
- Full account/team product UX: invites, SSO/SAML, SCIM, email, organization settings, audit logs.
- Landing-zone-grade Terraform modules, policy packs, and cloud-authenticated validation.
- Dedicated SPA 404/maintenance route.

## Verification Gaps For Handover

- Fresh Lighthouse and axe sweeps were not executed in this branch.
- 200% zoom and 320px WCAG reflow require a dedicated browser harness.
- 1920px screenshot sanity should be regenerated before public launch.
- Hosted GitHub Actions can be bypassed only for runner/billing infrastructure after local regression evidence is attached.

## Browser Matrix

Current automated browser confidence is Chromium/Chrome through Playwright. Public launch should add WebKit and Firefox smoke coverage for the core compare/export path.
