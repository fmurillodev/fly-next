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
| 7 | 2026-11-25 | PR-01 review routing | Native assess reported `reviewDue: high_risk` (CI workflow file) for the committed range; AI did not start RDD because consent is the maintainer's | Pending maintainer decision | Reported at PR-01 closure |

## Rules applied

- No LLM at runtime (human-approved).
- AI output is validated by tests and maintainer review before acceptance.
- Never send to models: PII, credentials, local environment-file values, the original challenge PDF, process emails.

## Rejected or modified proposals

None recorded yet.
