# PolyCost Loading Inventory

Audit date: 2026-07-08
Branch: `codex/loading-progress-experience`

Method:

- Grep over `apps/web/src` for loading, busy, pending, progress, fetch, async
  actions, report jobs, skeletons, and spinners.
- Manual review of `App.tsx`, shared report flow, comparison workspace, FinOps layer,
  top-loading bar, and button system.
- Duration class is estimated from local code path and API shape unless a wait is
  already covered by live verification timing in `PRODUCTION-READINESS-REPORT.md`.

| Wait point                                         | Trigger                                       | Typical duration method                  | Current treatment                                            | Classification                    | Status             |
| -------------------------------------------------- | --------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ | --------------------------------- | ------------------ |
| Cold SPA boot                                      | Initial React mount/theme application         | Usually <150 ms after JS loads           | Delay-mounted `BootSplash`; normally does not appear         | <150 ms none; >150 ms boot splash | Remediated         |
| Page unload/hash navigation                        | Hash link or browser unload                   | <150 ms to 1 s                           | Delay-mounted `TopLoadingBar` with min completion hold       | 150 ms-1 s local indicator        | Remediated         |
| Stored workspace token verification                | Stored bearer token at page load              | API fetch; 150 ms-3 s                    | Compact `SessionLoader` bound to real session check          | 1-3 s staged loader               | Remediated         |
| Team directory/SSO sync                            | Session has active admin/owner team           | `Promise.all` of members, invites, SSO   | Personalized compact `SessionLoader`; failure path shown     | 1-3 s staged loader               | Remediated         |
| Region catalog fetch                               | App mount                                     | API fetch; fallback available            | Region control shows Loading/Live/Fallback                   | 150 ms-1 s inline label           | Accepted           |
| Data-health fetch                                  | App mount                                     | API fetch; warning banner when unhealthy | Banner renders when data exists or fails                     | 150 ms-1 s progressive render     | Accepted           |
| Natural-language parse                             | Parse or compare from text mode               | API mutation; can exceed 1 s             | Button loading with verb-specific label; notice/error path   | 150 ms-3 s action loading         | Accepted           |
| Diagram parse                                      | Parse diagram button or compare before parsed | API mutation; can exceed 1 s             | Button loading with verb-specific label; review/error path   | 150 ms-3 s action loading         | Accepted           |
| Workload validate + compare                        | Compare costs                                 | API validation + comparison mutation     | Button loading plus result skeleton/status where applicable  | 1-3 s skeleton/status             | Remediated         |
| Refresh live catalog                               | Refresh live button                           | API mutation; can exceed 3 s             | Button loading plus `TaskQueue` phase label                  | 3-10 s phase label                | Remediated         |
| Export PDF/CSV/Excel                               | Export buttons                                | API export job polling + download        | Button loading plus `TaskQueue` job state                    | 3-10 s background-style job       | Remediated         |
| Analytics fetch                                    | Comparison available                          | API fetch                                | Status strip with loading/ready/error copy                   | 150 ms-1 s inline indicator       | Accepted           |
| Pricing evidence fetch                             | Comparison available                          | API fetch                                | Shared `LoadingStatus` and error path                        | 1-3 s content-region loader       | Remediated         |
| Engineering rows build                             | Comparison data mapping                       | Local render; usually <150 ms            | Shared `LoadingStatus` only when parent marks loading        | 150 ms-1 s local indicator        | Remediated         |
| Shared report fetch                                | Public share URL                              | API fetch; may require password          | Shared `LoadingStatus` + skeleton grid + password/error path | 1-3 s skeleton/status             | Remediated         |
| Workspace auth login/register                      | Workspace form submit                         | API mutation                             | Shared `Button` loading, disabled click handling, error path | 150 ms-1 s action loading         | Accepted           |
| Profile/password/team/invite/SSO/billing mutations | Workspace forms/buttons                       | API mutations                            | Shared `Button` loading with verb-specific labels            | 150 ms-1 s action loading         | Accepted           |
| Provider billing import/reconciliation             | Workspace billing import                      | API mutation; may exceed 1 s             | Button loading and reconciliation result/error path          | 1-3 s action loading              | Accepted           |
| Terraform generation                               | Generate Terraform                            | API mutation; may exceed 1 s             | Button loading with static validation result/error path      | 1-3 s action loading              | Accepted           |
| Scroll progress                                    | Scrolling comparison page                     | Continuous measured scroll position      | Determinate scroll progressbar                               | Determinate progress              | Existing compliant |

Notes:

- No time-based fake progress was added. Session-loader percentages derive from
  staged step states; task queue items without measurable progress show phase state
  rather than fabricated percentages.
- Button-level `animate-spin` remains intentionally in the shared `Button` component
  as the canonical inline action indicator.
