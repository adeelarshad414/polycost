# Demo Artifacts

Generate executive and engineering reviewer artifacts from a running local demo:

```bash
npm run demo:up
npm run demo:artifacts
```

The capture script writes:

- `executive-overview-desktop.png`
- `engineering-evidence-desktop.png`
- `mobile-workflow.png`
- `demo-walkthrough.webm`

These files are intentionally reproducible instead of hand-maintained. Refresh them after
material UI or workflow changes before stakeholder demos.
