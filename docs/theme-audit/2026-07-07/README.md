# Theme Audit Archive - 2026-07-07

Scope: v2 P4 frontend theme smoke archive for the implemented home/workspace
screen.

Capture method:

- Local Vite web server at `http://127.0.0.1:3220/`.
- Playwright Chromium at `1440x1100`.
- API was intentionally not started for this archive; Vite logged expected proxy
  errors for `/api/v1/regions` and `/api/v1/data-health`. This archive proves
  frontend mode/accent token application, not full-stack runtime behavior.
- Full-stack runtime behavior remains covered by the isolated `demo:up`,
  `ci:e2e`, and `live:verify` evidence in `PROGRESS.md` and
  `docs/verification/full-progress-ledger.md`.

## Screenshot Index

| Mode  | Accent          | Screenshot                  | Verified token values                                                                           |
| ----- | --------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| Dark  | Product default | `dark/home.png`             | `data-theme=dark`, `data-accent=default`, `--brand-500=#a879f0`, `--surface-canvas=#0b0e14`     |
| Light | Product default | `light/home.png`            | `data-theme=light`, `data-accent=default`, `--brand-500=#7c4fd0`, `--surface-canvas=#f5f4ef`    |
| Dark  | Terracotta      | `dark-terracotta/home.png`  | `data-theme=dark`, `data-accent=terracotta`, `--brand-500=#d97757`, `--surface-canvas=#0b0e14`  |
| Light | Terracotta      | `light-terracotta/home.png` | `data-theme=light`, `data-accent=terracotta`, `--brand-500=#d97757`, `--surface-canvas=#f5f4ef` |

Machine-readable capture evidence: `evidence.json`.
