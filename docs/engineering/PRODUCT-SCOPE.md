# FlyNext — Product Scope

> Status: PR-00 proposal for maintainer review. Derived from the approved Master Engineering Specification v1.0.

FlyNext is an independent demo, **not an official airline product**. Case A — Disruption Companion. Primary track: Backend/Integration. Tagline: *Your journey. Your next step.*

## Goal

Reduce passenger uncertainty during operational disruptions with verified information, understandable explanations and actionable recommendations. Intended outcomes (objectives, **not measured results**): consolidate booking/event/policy/alternative data; resolve contradictory sources; identify itinerary risk; evaluate entitlements deterministically; state uncertainty explicitly; recommend human intervention when warranted; potentially reduce avoidable call-center contacts.

## In scope (V1)

- Read-only assessment endpoint `POST /api/v1/disruptions/assessment` for a synthetic `bookingId`.
- Deterministic decision engine (D01–D10) over mock read providers and synthetic fixtures.
- Public HTTPS API on Railway, `/health`, Swagger at `/docs`.
- Complementary React frontend served by the same service (cuttable).
- Engineering docs, AI usage note, demo script.

## Out of scope (V1)

- Any write operation: rebooking, compensation, refund, human-case creation, notifications, booking changes (designed as future contracts only).
- LLM/agents at runtime (hybrid evolution documented only).
- Authentication/authorization on real bookings, real airline systems, databases, queues, circuit breakers, admin dashboard, chatbot, official airline branding.
- Real-time operational data: fixtures are historical and evaluated in an explicit simulation mode.

## Constraints

Three-hour total budget (analysis included, never restarted); 10-minute presentation; public repo; public HTTPS API; README ≤ 2 pages; AI Usage note ≤ 1 page; reproducible evidence.

## Classification of decisions

| Kind | Examples |
| --- | --- |
| Challenge requirements | 3 h budget, public repo/API, README and AI note limits, Case A scope |
| Provider contracts (supplied) | four read tools, three write tools, rules R1–R5, policy `POL-DELAY-2026-03` |
| Product assumptions | 30-min relevance threshold, priority HIGH for minors, keeping the group together |
| Technical/operational assumptions | freshness windows (5/30/15 min), source hierarchy |
| Architecture decisions | monorepo, hexagonal-pragmatic, single Railway service, stateless, no LLM at runtime |
| Scope decisions | read-only V1, frontend complementary |
| Security constraints | synthetic data only, PII minimization, sanitized errors, rate limiting |

Thresholds, freshness windows, source hierarchy and group-keeping **require validation with Product, Operations or system owners before any real implementation** and are not airline policy.

## Demo scenarios

Public: ABC123 (mandatory), DEMO01 (normal flight), DEMO02 (190-min delay). DEMO03–DEMO06 exist only as automated-test fixtures (A08).

## Product metrics (future, not measured)

Self-service resolution rate; avoidable call-center contacts; time to actionable recommendation; incorrect recommendations; passenger satisfaction.

## Demo limitations

Synthetic data; simulated clock; no auth; no persistence; mock providers; recommendations are never executed actions.
