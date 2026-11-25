# AI-Assisted Decision Log

Records real AI-assisted decisions only. Human decisions are authoritative.

| # | Date | Context | AI proposal | Human decision | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | prior to PR-00 | Product/architecture/domain definition (D01–D10, stack, roadmap, budget) | Discussed with an AI assistant before this repo context existed | Maintainer reviewed and approved Master Engineering Specification v1.0 | Spec is the input of PR-00. Detailed prior transcripts are not stored here. |
| 2 | 2026-11-25 | PR-00 materialization | AI drafted AGENTS.md, ODD task file, engineering docs, API contract proposal | Maintainer reviewed and approved decisions, workflow and document structure (gate G0) | Committed in the PR-00 commit |
| 3 | 2026-11-25 | API contract open points | AI proposed field names/enums and eight open questions | Maintainer resolved A01–A08 (see `DOMAIN-DECISIONS.md`). Notable modifications to the proposal: public reason code `GROUP_INCLUDES_MINOR` replaced by `PRIORITY_REVIEW_REQUIRED`; contradictions and internal hierarchy removed from the public DTO; `severity` enum defined by the maintainer (`NONE/INFO/WARNING/CRITICAL/UNKNOWN`); scenarios limited to ABC123, DEMO01, DEMO02 publicly | Contract updated; full DTO still pending approval at G3 |
| 4 | 2026-11-25 | Time budget | AI noted prior analysis time was not measurable and asked for it | Maintainer set 30 min consumed, 150 min remaining, and a revised per-PR budget | Task file updated |
| 5 | 2026-11-25 | Documentation consistency review | AI performed a bounded document review (no RDD review) | Authorized by maintainer | Findings in the PR-00 closure report |
| 6 | 2026-11-25 | PR-01 TypeScript version | AI selected TypeScript 6.0.3 instead of `latest` 7.0.2 after reading peer ranges | Within PR-01 authority (exact-version compatibility rule) | Recorded in TOOLING.md |
| 7 | 2026-11-25 | PR-01 review routing | Native assess reported `reviewDue: high_risk` (CI workflow file) for the committed range; AI did not start RDD because consent is the maintainer's | Maintainer consented; host resolved consent and the native review (risk + reliability lenses) approved the PR-01 range with four non-blocking findings | Findings handled at G1 (see rows 8) |
| 8 | 2026-11-25 | PR-01 review findings | Reviewers reported: exact `engines.node` is brittle; empty `PORT` coerces to 0; table row split in this log; Vite `/api` proxy reaches nothing yet | Maintainer approved fixing 1–3 in an extra local commit and deferring the proxy to PR-04 and web tests to PR-05 | Fixed with tests (`PORT` also rejected `1e3` once the strict test existed; `engine-strict`/`save-exact` moved from `.npmrc`, which pnpm 12 ignored, to `pnpm-workspace.yaml`); deferrals tracked in ODD |
| 9 | 2026-11-25 | Future-phase decisions | — (human-originated) | Maintainer added Observability by Design (PR-04, `OBSERVABILITY.md`) and the GoogleChrome modern-web-guidance skill evaluation (PR-05) | Recorded in ODD, not implemented |
| 10 | 2026-11-25 | Publication | AI audited history/tracked files and proposed publishing | Maintainer authorized a public repo, push and PR #1 | Published; CI green on `87f9624` |
| 11 | 2026-11-25 | Railway config mechanism | AI first added `railway.json`; after the CLI deprecation warning and docs check it removed the file and configured the service directly | Within the authorized scope (no extra dependency for IaC) | Recorded in ARCHITECTURE.md |
| 12 | 2026-11-25 | Deployment | AI deployed commit `e7ffb2d` with `railway up` and verified `/health` | Maintainer authorized one project/service and the initial deploy | Public foundation deployed; merges and G2 pending maintainer |
| 13 | 2026-11-25 | Verification | Independent verifier (`gentle-ai-verify`, Risk: item 5) passed items 1–5 and flagged claims it could not confirm; AI reported the gaps instead of claiming completion | Maintainer accepted PR-02 and the stated limits | Limits recorded in TOOLING.md |
| 14 | 2026-11-25 | G2 integration | AI merged #1 then #2 with merge commits, retargeted #2 and re-ran CI by close/reopen | Maintainer authorized merges, kept Railway settings on the service, no IaC, manual deploys | `main` = `212247e`; deployed `e7ffb2d` unchanged |
| 15 | 2026-11-25 | PR-03 domain engine design | AI designed the model (per-field authority, tri-state values, `ProviderResult` ports, use case as a function) and implemented it test-first | Maintainer authorized PR-03 and its principles (Ports & Adapters, no over-engineering, no HTTP route) | 155 tests green; design recorded in `ARCHITECTURE.md` and `DOMAIN-DECISIONS.md` (P1–P12) |
| 16 | 2026-11-25 | R5 semantics | AI read "group includes a minor" together with the base case ("disruption context + minor") and made R5 require a disruption context | Pending maintainer validation (flagged P6) | Prevents a minor on a normal flight from triggering human review; revisit if Product disagrees |
| 17 | 2026-11-25 | Connection safety without MCT | AI chose "any reduction of the booked connection time is AT_RISK" instead of inventing a threshold | Pending maintainer validation (flagged P5) | Conservative; Operations MCTs would relax it |
| 18 | 2026-11-25 | Stale booking context | AI proposed an application error mapped to 502 `INVALID_UPSTREAM_RESPONSE` rather than a new public code | Pending G3 | In the DTO proposal as a question |
| 19 | 2026-11-25 | Test quality | AI added a manual mutation check (R1 threshold) after the suites passed | Within PR-03 scope | The boundary test failed as expected; reverted |

## Rules applied

- No LLM at runtime (human-approved).
- AI output is validated by tests and maintainer review before acceptance.
- Never send to models: PII, credentials, local environment-file values, the original challenge PDF, process emails.

## Rejected or modified proposals

- PR-03: AI first drafted a generic "any minor ⇒ R5" reading; modified to require disruption context (P6, pending validation).
- PR-03: AI considered returning `NOT_REACHABLE` together with `DEPARTED`; test-first exposed the noise and it was removed (departed options report only `DEPARTED`).
