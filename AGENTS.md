# FlyNext — Permanent Agent Constraints

FlyNext (repo `fly-next`) is an independent demo (Case A, Disruption Companion). It is **not** an official airline product. Tagline: *Your journey. Your next step.*

The human maintainer owns product, architecture, scope, security, implementation and deployment decisions. Approved decisions (see `docs/engineering/DOMAIN-DECISIONS.md`) must not be reinterpreted, replaced or extended. Report contradictions to the maintainer before changing anything.

## Workflow

- ODD is mandatory. Tracking lives in `odd/tasks/flynext.md` (mirrored in Engram under `odd/flynext/tasks`). Read it through `## Log` before working.
- Each PR is an authorization boundary. Do not start the next PR without explicit human approval (gates in the task file).
- Never push, open a remote PR, merge, deploy or submit the challenge without specific authorization. Never commit before the maintainer confirms Git identity and reviews.
- Test-first where applicable. ~400 changed lines per PR is a review guideline, not a hard cap.
- No SDD, OpenSpec or extra orchestrators. No Turborepo, NestJS, databases, queues or extra frameworks without authorization.
- Do not change global configuration (Git, Pi, MCP, skills).

## Product invariants

- V1 is read-only: no rebooking, compensation, refund, human-case creation, notification or booking modification.
- No LLM or agent at runtime. Business rules are deterministic; no `eval`.
- Never present a recommendation as an executed action. Never present historical fixtures as real-time data.
- Missing information is not absence of disruption. Never invent Minimum Connection Time.
- Domain code does not depend on Fastify, Axios, React or infrastructure.
- No business rules in React. `packages/contracts` holds public contracts only.

## Security and privacy

- Public repo and public API: synthetic fixtures only. No PII, credentials, local environment-file values, original challenge PDF, process emails, raw prompts, personal paths or auth config.
- Public DTOs and logs use allowlists/mappers; no passenger names, documents, emails, phones, exact ages or raw provider payloads.
- Errors are sanitized; no stack traces.

## Independent identity

No reference to any airline brand or to the challenge sponsor in any public file: source, UI copy, metadata, docs, fixtures, comments, graphics, screenshots, commit messages or PR text. Neutral wording such as "the airline" or "an agent of the airline" is allowed. Before publishing and at release, verify with a case-insensitive search over the versioned tree (the brand name must return no match).

## Language

Code, comments, docs, commits and UI copy are in English. Conversation with the maintainer follows their language.

## Evidence

Record only what actually happened in `docs/evidence/`. Never fabricate evidence.
