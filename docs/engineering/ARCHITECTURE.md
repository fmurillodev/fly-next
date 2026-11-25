# FlyNext — Architecture

> Status: PR-00 proposal. Implementation starts in PR-01 (foundation) and PR-03/04 (domain, API).

## Repository layout (target)

```
apps/api            @flynext/api       Fastify service (also serves built web)
apps/web            @flynext/web       React 19 + Vite + Tailwind v4
packages/contracts  @flynext/contracts Public Zod schemas + inferred types only
```

`packages/contracts` never contains internal entities or business logic. The frontend consumes only public contracts.

## Backend structure (`apps/api/src`)

```
disruption/
  domain/          entities, value objects, rules, services, ports
  application/     use cases (AssessDisruption), orchestration
  infrastructure/  mock provider adapters, fixtures, mappers (DTO Mapper)
  presentation/    Fastify routes, schemas, controllers where useful
shared/ (or equivalent, only when needed)
  config, errors, http-client, observability
```

Folders are created when they hold code, never as empty placeholders.

## Principles

SOLID; dependency inversion; Ports & Adapters; manual dependency injection (composition root in the app entry); Adapter; DTO Mapper; Use Case. Strategy only with a concrete need. **Domain imports nothing from Fastify, Axios, React or infrastructure.** Injectable `Clock`.

## Ports (read)

`TripContextProvider.get_trip_context(booking_id)`, `OperationalEventsProvider.get_operational_events(segment_ids)`, `OptionsProvider.get_eligible_options(trip_context)`, `PolicyProvider.get_policy_rules(scenario)`. Names are conceptual; TypeScript naming is decided in PR-03. Write ports (`create_rebooking_request`, `create_human_case`, `notify_passenger`) are documented as future design only and are **not** implemented in V1.

## Request flow

Route → Zod validation → `AssessDisruption` use case → providers (mock adapters, each validated with Zod, failures mapped to degradation per D10) → domain engine (classification, reconciliation, freshness, connection, policies, alternatives, recommendation) → public DTO mapper (allowlist) → response. The internal `decisionTrace` keeps sanitized references and is not exposed beyond the sanitized refs allowed by the contract.

## Deployment

One Railway service, one Node.js process. Routes: `GET /` (static React via `@fastify/static`, when built), `GET /health`, `GET /docs`, `POST /api/v1/disruptions/assessment`. SPA fallback excludes `/api`, `/docs`, `/health`. Listens on `0.0.0.0:$PORT`. Stateless; no database. Dev: Vite proxy to the API. Web and API keep independent builds. Early deploy in PR-02.

## Cross-cutting

- **HTTP client:** central Axios `RestClient` only once there is a real HTTP responsibility (timeout, correlation ID, interceptors, error normalization, latency, bounded read-only retries). Mock adapters run locally and do not fake HTTP.
- **Observability:** Pino structured logs, request ID, per-provider latency/errors, outcome, contradictions, stale data, partial assessments, human-review recommendations. No PII, no raw bodies.
- **Security:** rate limiting, body size limit, sanitized errors (RFC 9457-inspired), read-only operations.
- **Time:** `Clock` port; simulation mode with reference date `2026-09-15T11:02:40Z` for base-case fixtures. Timestamps are ISO 8601 with offsets resolved per date from IANA zones (`America/Santiago`, `America/Lima`, `America/Mexico_City`); comparisons, durations and freshness run in UTC; local times are for presentation (A02).
- **Public vs internal:** the detailed `decisionTrace` stays internal; the public DTO is built by allowlist mappers and uses sanitized reason codes (A05).

## AI

No LLM at runtime. Future hybrid evolution (documented in PR-06): AI for intent interpretation/explanation; read-tool allowlist; minimal context; structured validated outputs; deterministic engine remains authority with deterministic fallback; human approval for impactful ops; no LLM access to writes.

## Build and tooling

Node 24 LTS, pnpm workspaces, TypeScript strict, Vitest, ESLint, Prettier, tsup (if compatible), GitHub Actions. Exact versions pinned in PR-01 after checking current docs.
