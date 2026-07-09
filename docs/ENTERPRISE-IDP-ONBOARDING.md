# Enterprise IdP Onboarding

PolyCost supports a self-hosted SCIM provisioning foundation for teams that want an
external identity provider to create, update, and deactivate workspace members.
This guide is for operators configuring Okta or Microsoft Entra ID style SCIM
clients against a PolyCost deployment.

## Current Support Boundary

Implemented:

- Team owner/admin SCIM token management in the workspace Team access panel.
- One-time-visible SCIM bearer tokens stored server-side as SHA-256 hashes and
  display prefixes only.
- Bearer-token SCIM endpoints under `/api/v1/scim/v2`.
- Core User create, replace, active patch, deactivate, get, and list operations.
- SCIM discovery endpoints for service-provider config, schemas, and resource
  types.
- Active SCIM users attach to the PolyCost team as `member`; deactivation removes
  that team membership without globally disabling unrelated accounts.
- Team audit events for SCIM token and user lifecycle changes.

Not yet claimed:

- Formal SCIM certification.
- Production SSO/SAML/OIDC certification with Okta, Entra, or another IdP.
- Group push, entitlement sync, custom schema extensions, or role assignment from
  IdP groups.
- Account recovery, org billing UX, or a full hosted IAM administration product.

## Endpoint Summary

Use the deployed API origin plus `/api/v1/scim/v2` as the SCIM base URL.

Example:

```text
https://polycost.example.com/api/v1/scim/v2
```

Discovery:

- `GET /ServiceProviderConfig`
- `GET /Schemas`
- `GET /Schemas/urn:ietf:params:scim:schemas:core:2.0:User`
- `GET /ResourceTypes`
- `GET /ResourceTypes/User`

Users:

- `GET /Users`
- `POST /Users`
- `GET /Users/:id`
- `PUT /Users/:id`
- `PATCH /Users/:id`
- `DELETE /Users/:id`

Authentication:

```http
Authorization: Bearer pc_scim_...
```

The raw bearer is displayed once when created by a team owner/admin. Store it in
the IdP secret field only. PolyCost does not persist or show it again.

## Create A SCIM Token

1. Sign in as a team owner or admin.
2. Open the workspace Team access panel.
3. Enter a descriptive token name such as `Okta production SCIM` or
   `Entra staging SCIM`.
4. Optionally set an expiry date.
5. Create the token and copy the displayed bearer immediately.
6. Record the token prefix and token owner in your operator change record.

If the token is exposed, revoke it from the same panel and create a replacement.

## Okta-Style Setup

Use these settings when configuring an Okta SCIM app integration:

| Field           | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| SCIM version    | `2.0`                                                        |
| Base URL        | `https://polycost.example.com/api/v1/scim/v2`                |
| Unique user key | `userName`                                                   |
| Authentication  | HTTP Header / Bearer token                                   |
| Bearer token    | One-time-visible PolyCost SCIM token beginning `pc_scim_...` |

Provisioning operations to enable:

- Create users.
- Update user attributes.
- Deactivate users.

Recommended attribute mapping:

| IdP attribute         | SCIM attribute   | Required |
| --------------------- | ---------------- | -------- |
| User email/login      | `userName`       | Yes      |
| Stable IdP user ID    | `externalId`     | No       |
| Display name          | `displayName`    | No       |
| Display name fallback | `name.formatted` | No       |
| Active state          | `active`         | No       |

Group push and role mapping are not implemented yet. Provisioned users are added
as PolyCost team members.

## Microsoft Entra-Style Setup

Use these settings when configuring an Enterprise Application provisioning flow:

| Field              | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| Provisioning mode  | Automatic                                                    |
| Tenant URL         | `https://polycost.example.com/api/v1/scim/v2`                |
| Secret token       | One-time-visible PolyCost SCIM token beginning `pc_scim_...` |
| Notification email | Operator-owned mailbox                                       |

Recommended attribute mapping:

| Entra attribute                  | SCIM attribute | Required |
| -------------------------------- | -------------- | -------- |
| `userPrincipalName` or `mail`    | `userName`     | Yes      |
| `objectId`                       | `externalId`   | No       |
| `displayName`                    | `displayName`  | No       |
| Account enabled/disabled mapping | `active`       | No       |

Keep provisioning scope narrow during pilots. Start with a small assigned user set
before assigning broader groups.

## Operator Smoke Checks

Set local shell variables for smoke checks:

```bash
POLYCOST_SCIM_BASE_URL="https://polycost.example.com/api/v1/scim/v2"
POLYCOST_SCIM_TOKEN="pc_scim_replace_me"
```

Discovery:

```bash
curl -fsS \
  -H "Authorization: Bearer ${POLYCOST_SCIM_TOKEN}" \
  "${POLYCOST_SCIM_BASE_URL}/ServiceProviderConfig"

curl -fsS \
  -H "Authorization: Bearer ${POLYCOST_SCIM_TOKEN}" \
  "${POLYCOST_SCIM_BASE_URL}/Schemas"

curl -fsS \
  -H "Authorization: Bearer ${POLYCOST_SCIM_TOKEN}" \
  "${POLYCOST_SCIM_BASE_URL}/ResourceTypes"
```

Create a test user from the repo fixture:

```bash
curl -fsS \
  -X POST \
  -H "Authorization: Bearer ${POLYCOST_SCIM_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @fixtures/scim/okta-user-create.json \
  "${POLYCOST_SCIM_BASE_URL}/Users"
```

Deactivate a user:

```bash
curl -fsS \
  -X PATCH \
  -H "Authorization: Bearer ${POLYCOST_SCIM_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @fixtures/scim/deactivate-user-patch.json \
  "${POLYCOST_SCIM_BASE_URL}/Users/<scim-user-id>"
```

Do not paste real bearer tokens into tickets, logs, pull requests, screenshots, or
support chat.

## Managed IdP Pilot Evidence

For a real enterprise pilot, archive sanitized evidence after the IdP has exercised
SSO and SCIM against the target PolyCost deployment. The evidence bundle should
contain only digests and redacted metadata, then pass:

```bash
npm run enterprise:idp:evidence:check -- --require-managed-idp <bundle.json>
```

The default sample can be checked with:

```bash
npm run enterprise:idp:evidence:check
```

That sample is `example-schema` only. It proves the contract and CI guard, not a
managed IdP tenant.

Required managed-pilot proof:

- OIDC or SAML sign-in plus SCIM provisioning in the same tenant.
- SCIM discovery, user create/update/deactivate, metadata-only token listing, hash
  only token storage, and revoked-token denial.
- RBAC denial for member billing import plus owner/admin coverage for SCIM token
  management and SSO configuration.
- Team audit events for SSO configuration, SCIM token lifecycle, SCIM user upsert,
  SCIM user deactivation, and token revocation.
- Redacted screenshots or IdP configuration proof represented as SHA-256 digests.

Never include raw SSO assertions, SCIM bearer tokens, session cookies, IdP tokens,
private keys, client secrets, authorization headers, or unredacted screenshots in
the bundle.

## Security Checklist

- Use a dedicated token per IdP environment.
- Prefer expiring tokens for pilots and rotate before expiry.
- Revoke unused tokens after test runs.
- Restrict IdP assignment scope during rollout.
- Review the PolyCost team audit trail after first sync.
- Confirm provisioned users appear as `member` unless a PolyCost owner changes
  their role manually.
- Never store IdP bearer tokens in repo files or `.env.example`.

## Fixture Payloads

PolyCost keeps representative SCIM payloads under `fixtures/scim/`:

- `okta-user-create.json`
- `entra-user-create.json`
- `deactivate-user-patch.json`

These fixtures are used by unit tests to protect basic interoperability shape.
They are not a substitute for a customer-specific IdP pilot.

## Local Stack Smoke

`npm run live:verify` includes a `scim-provisioning-lifecycle` transcript journey
for local/demo stacks. It creates a temporary team, creates a one-time SCIM token,
confirms token metadata lists do not expose raw bearer tokens, exercises discovery,
provisions and deactivates a user, revokes the token, and verifies the revoked token
is denied. The transcript stores the token prefix and status evidence only.
