# Phase 2 Enterprise IdP Pilot Evidence

PolyCost already has local workspace sessions, team RBAC, mock OIDC, SCIM token
management, SCIM discovery, and SCIM user lifecycle APIs. This phase adds a
repeatable evidence gate for customer-specific enterprise IdP pilots without
claiming formal SSO, SAML, OIDC, or SCIM certification.

## Evidence Contract

Run the default schema/sample check:

```bash
npm run enterprise:idp:evidence:check
```

For a managed IdP pilot, run the workspace auth/RBAC/SSO and SCIM provisioning
journeys against the target staging or production deployment, archive only
sanitized transcript digests, redacted screenshots, IdP configuration proof, RBAC
denial evidence, and team audit event names, then run:

```bash
npm run enterprise:idp:evidence:check -- --require-managed-idp <bundle.json>
```

The checked-in example bundle uses `example-schema`. It proves the evidence
contract only; it is not managed IdP proof.

## Required Proof

Managed pilot evidence must cover:

- OIDC or SAML sign-in plus SCIM provisioning in the same tenant.
- SCIM discovery, user create/update/deactivate, metadata-only token listing, hash
  only token storage, and revoked-token denial.
- Team RBAC protections for billing import, SCIM token management, SSO
  configuration, final-owner protection, and cross-team access denial.
- Team audit events for SSO configuration, SCIM token lifecycle, SCIM user
  upsert, and SCIM user deactivation.
- Redaction proof: no raw SSO assertions, SCIM bearer tokens, session cookies,
  IdP tokens, private keys, client secrets, or authorization headers.

## Boundary

This gate makes enterprise IdP readiness measurable for demos and pilots. It does
not replace a customer's IdP acceptance process, formal SCIM/OIDC/SAML
certification, SSO administration depth, invite approval workflows, account
recovery, org billing UX, or a complete hosted IAM product.
