# How-To-Use Implementation Notes

These notes capture build-impact requirements from `HOW-TO-USE.md`.

## Frontend Sync

`HOW-TO-USE.md` must be updated during Phase 9 as UI features land. It should describe
the actual running app, not planned UI.

## User-Facing Behaviors To Preserve

- Natural-language input shows an editable structured form before pricing.
- Structured-form input works without natural-language parsing.
- Provider order is always AWS, Azure, GCP.
- Approximate mappings are visibly marked.
- "Lowest cost" is informational, not a recommendation.
- Daily, weekly, monthly, quarterly, and yearly views derive from the same result.
- Live pricing refresh is rate-limited.
- PDF, CSV, and Excel exports use the same on-screen numbers.
- Mobile comparison uses swipeable provider cards plus a persistent totals bar.
- Partial provider failure renders available providers with a warning.
