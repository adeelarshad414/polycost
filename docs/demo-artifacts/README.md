# Demo Artifacts

Generate executive and engineering reviewer artifacts from a running local demo:

```bash
npm run demo:up
npm run demo:artifacts
```

The capture script writes:

- `landing-desktop.png`: the landing hero and guided form
- `executive-overview-desktop.png`: a real comparison's verdict, key figures and sorted comparison
- `engineering-evidence-desktop.png`: cost controls with the evidence disclosure open
- `mobile-workflow.png`: the results verdict at phone width
- `demo-walkthrough.webm`

These files are intentionally reproducible instead of hand-maintained. Refresh them after
material UI or workflow changes before stakeholder demos.
