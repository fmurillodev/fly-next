# FlyNext — Domain Decisions (D01–D10)

> Approved by the maintainer in Master Engineering Specification v1.0. Preserved here without reinterpretation. Items marked **[assumption]** need validation with Product, Operations or system owners and are not airline policy.

## Base case ABC123

Synthetic booking; Santiago–Lima–Ciudad de México; two passengers (one minor).

| Segment | Flight | Original | Operational data |
| --- | --- | --- | --- |
| S1 | LA500 | dep 14:30 / arr 17:55 | delay 160 min confirmed; new dep 17:10; gate 24 |
| S2 | LA2410 | dep 19:05 / arr 23:40 | `SCHEDULED` |

Original connection: 70 min. Projecting the full delay onto arrival gives 20:35, i.e. 90 min after S2 departs — a **projection, not a confirmed arrival**. OPS_CORE and LEGACY_MIRROR contradict each other (LEGACY_MIRROR degraded). Fare conditions are incomplete: changes allowed, penalty unknown.

Expected: confirmed delay 160 min; gate 24; connection `AT_RISK`; loss not confirmed; assessment `PARTIAL`; recommendation `HUMAN_REVIEW`, priority HIGH (disruption context + minor); no free-rebooking guarantee; no compensation guarantee; no write operations.

## D01 — Disruption classification

Cancellation: critical. Delay ≥ 30 min: relevant. Delay < 30 min: informative. Gate change: informative. Connection at risk: critical. Confirmed missed connection: critical. Airport change: critical. Unresolved contradiction: indeterminate. A delay < 30 min is also relevant if it compromises a connection. **[assumption]** The 30-min threshold is configurable product configuration, not official policy. Implement only the events needed by supported V1 scenarios.

## D02 — Source authority

OPS_CORE: primary for statuses and operational times. AIRPORT_FEED: primary for gates. LEGACY_MIRROR: secondary. Consider authority per information type, timestamp, freshness and source status. A degraded source cannot ground a definitive decision. Between equivalent valid events from one source, the most recent wins. If no reliable source resolves a contradiction, return explicit uncertainty. Record contradictions and reconciliation decisions through sanitized references. **[assumption]** The hierarchy awaits validation with Operations and Data.

## D03 — Freshness

| Data | Window |
| --- | --- |
| Booking context | 5 min since retrieval **[assumption]** |
| Operational events | 30 min since record **[assumption]** |
| Gates | 15 min since record **[assumption]** |
| Alternatives | provider TTL (120 s in base case) |
| Policies | verifiable validity and active version |

Injectable `Clock`. Historical fixtures run in an explicit, reproducible simulation mode; base-case reference date `2026-09-15T11:02:40Z`. Never present historical data as real-time operational information.

## D04 — Connection evaluation

States: `SAFE`, `AT_RISK`, `MISSED`, `UNKNOWN`. Never declare `MISSED` from an estimate. Never invent Minimum Connection Time. `SAFE` only with sufficient evidence. ABC123 → `AT_RISK`. Explicitly distinguish "loss not confirmed" from "confirmed not lost".

## D05 — Commercial policies

Reference policy `POL-DELAY-2026-03`; deterministic evaluation only (no `eval`, no provider-supplied expressions).

| Rule | Condition | Benefit | Approval |
| --- | --- | --- | --- |
| R1 | delay ≥ 180 min | `REBOOK_NO_FEE` | — |
| R2 | delay ≥ 240 min and international itinerary | `MEAL_VOUCHER` | — |
| R3 | confirmed missed connection | `REBOOK_NO_FEE` | — |
| R4 | compensation requested | `CASH_COMPENSATION` | human |
| R5 | group includes a minor | `PRIORITY_HANDLING` | human |

Evaluation statuses: `APPLICABLE`, `NOT_APPLICABLE`, `REQUIRES_HUMAN_APPROVAL`, `INSUFFICIENT_EVIDENCE`. Unknown, invalid, expired or unsupported policies grant nothing. ABC123: R1 no, R2 no, R3 insufficient evidence, R4 not requested, R5 requires human approval.

## D06 — Alternatives eligibility

Validate: seats for the whole group; freshness; associated policy; compatibility with the full itinerary; economic conditions; sufficient evidence and confidence. Never split passengers automatically. A zero fare difference does not imply no penalty. Do not assume a Lima alternative is viable without validating the passenger's arrival in Lima.

| Option | Detail | Outcome |
| --- | --- | --- |
| O1 | LA2412, next day 08:15, fare diff 0, 4 seats, high confidence | candidate pending full validation |
| O2 | LA2450, same day 23:40, fare diff 180000 CLP, 1 seat, medium | not eligible for the whole group |
| O3 | REFUND, low confidence | needs additional review |

## D07 — Automation and escalation

V1 may query, evaluate, inform and recommend. It must not execute rebooking, compensation, refunds, human-case creation, notifications or booking changes. Automatically inform verified facts and benefits. Recommend human review for relevant uncertainty, connection at risk, required approval or unresolved contradiction. Never claim an operation was executed when it was only recommended.

## D08 — Independent states

- `FlightStatus`: `SCHEDULED`, `ON_TIME`, `DELAYED`, `CANCELLED`, `UNKNOWN`
- `AssessmentStatus`: `COMPLETE`, `PARTIAL`, `INDETERMINATE`
- `RecommendationType`: `NO_ACTION_REQUIRED`, `MONITOR_FLIGHT`, `REVIEW_REBOOKING_OPTIONS`, `HUMAN_REVIEW`

Flight, connection, assessment, policy and recommendation states remain independent.

## D09 — Privacy and traceability

Data minimization via allowlists and explicit mappers. Never expose passenger names, identity documents, emails, phones, exact ages or full provider payloads. Minor presence may be used internally for policy evaluation; the public DTO exposes no unnecessary personal attributes. Internal `decisionTrace` keeps sanitized references to events, policies, versions, timestamps and decision reasons. Logs contain no PII or credentials.

## D10 — Controlled degradation

| Situation | Result |
| --- | --- |
| Booking not found | 404 |
| Invalid request | 400 |
| Booking provider unavailable | 503 or 504 depending on failure |
| Events provider unavailable | `INDETERMINATE` when a safe response is possible |
| Policies provider unavailable | `PARTIAL`; no benefits guaranteed |
| Alternatives provider unavailable | `PARTIAL`; no unverified alternatives |
| Invalid external response | reject affected information; degrade when safe |
| Unexpected error | sanitized 500 |

Absence of information is not absence of disruption. A valid partial assessment may return HTTP 200.

## Synthetic scenarios

ABC123 (base, `HUMAN_REVIEW`); DEMO01 normal verified flight (`NO_ACTION_REQUIRED`); DEMO02 190-min delay, no-fee change; DEMO03 unresolved contradiction (`INDETERMINATE`); DEMO04 stale events (`INDETERMINATE`); DEMO05 international 250-min delay, no-fee change + voucher; DEMO06 confirmed missed connection, no-fee change. ABC123 and critical scenarios are prioritized; the rest may live only as test fixtures.

## Approved resolutions (gate G0, A01–A08)

Approved by the maintainer. They complete open points; D01–D10 are unchanged.

| ID | Resolution |
| --- | --- |
| A01 | Keep S1–S29 with traceable references; the master prompt is not duplicated. Decisions, corrections and gates live in the ODD task file and its Engram mirror. |
| A02 | ISO 8601 with explicit offset; IANA zones `America/Santiago`, `America/Lima`, `America/Mexico_City`; comparisons, durations and freshness in UTC; local times shown to the passenger; injectable `Clock`; simulated reference `2026-09-15T11:02:40Z`. Offsets resolved per date, never assumed constant (verified for 2026-09-15/16: -03:00, -05:00, -06:00). The S1 estimated arrival stays a projection. |
| A03 | R4 is `NOT_APPLICABLE` when no monetary compensation was requested; ABC123 → `NOT_APPLICABLE`. |
| A04 | `priority` ∈ `LOW`, `NORMAL`, `HIGH`: FlyNext's attention recommendation, not an operational queue assignment. |
| A05 | Detailed `decisionTrace` is internal only. Public DTO may include verified operational facts, sanitized reason codes, policy references, uncertainty warnings and assessment metadata; not detailed provider contradictions, original payloads, internal reconciliation hierarchy or unnecessary personal attributes. `GROUP_INCLUDES_MINOR` stays an internal reason code; the public contract uses `PRIORITY_REVIEW_REQUIRED`. |
| A06 | `INVALID_UPSTREAM_RESPONSE` → HTTP 502 when the invalid response prevents a safe assessment; if enough information exists for controlled degradation, HTTP 200 with `PARTIAL` or `INDETERMINATE`. |
| A07 | `severity` ∈ `NONE`, `INFO`, `WARNING`, `CRITICAL`, `UNKNOWN`. Mapping from D01: no verified disruption → `NONE`; informative → `INFO`; relevant → `WARNING`; critical → `CRITICAL`; not determinable → `UNKNOWN`. Distinct from priority, `assessmentStatus` and connection status. ABC123: `CRITICAL` / `PARTIAL` / `AT_RISK` / `HUMAN_REVIEW` / `HIGH`. |
| A08 | Public scenarios: ABC123 (mandatory), DEMO01, DEMO02. DEMO03–DEMO06 are automated-test fixtures only. All data synthetic; no budget for extra public experiences. |

### Note on fixture realism

Applying the A02 offsets literally, S1 departing 14:30 `-03:00` and arriving 17:55 `-05:00` implies a 5 h 25 min block time. This is a property of the synthetic base case, not a contradiction of D04: the 70-minute connection is both Lima-local. PR-03 will define fixtures with explicit offsets and tests must not depend on block-time realism.

## PR-03 implementation decisions (within D01–D10, A01–A08)

Choices made while implementing the approved decisions; none changes them. Flagged items need validation with Product/Operations.

| # | Decision | Rationale |
| --- | --- | --- |
| P1 | Authority is resolved **per field** (flight status/times → OPS_CORE, gate → AIRPORT_FEED). A degraded source never grounds a decision; a secondary non-degraded source yields `SECONDARY_SOURCE` facts that are never "confirmed". | D02. |
| P2 | Two freshness-eligible events from one source at the same timestamp with different facts, or a degraded primary contradicted by an operational secondary, are **unresolved** (`CONTRADICTION`). A stale contradicting event is ignored. | D02/D03. |
| P3 | Freshness windows are inclusive: age equal to the window is fresh. | Explicit boundary, tested. |
| P4 | `MISSED` requires reliable evidence of a lost connection. The engine currently supports primary-source actual arrival at or after primary-source actual departure. A reliable explicit confirmation of loss would also be sufficient; no provider supplies one in V1. A departure timestamp after its own report is not accepted as actual. Source authority alone does not turn a scheduled or estimated departure into an actual departure. A confirmed cancellation is critical, but alone does not confirm a missed connection or qualify for R3. | D01/D02/D04/D05; maintainer decision. |
| P5 | **Adjusted at the G3 refinement.** No Minimum Connection Time exists and the booked connection time is not a safety threshold either. `AT_RISK` applies to a margin of zero or less without proof of loss, including a confirmed arrival against an incompatible schedule or estimate, or a cancellation report. A reduced but still positive margin without such evidence is `UNKNOWN`. `SAFE` needs primary sources on both legs and a margin that preserves the booked time; secondary-only evidence is insufficient. `CONFIRMED_NOT_MISSED` additionally needs both actual timestamps. `MISSED` follows P4. ABC123 stays `AT_RISK` (margin −90). A small delay with positive margin therefore yields `UNKNOWN` + `PARTIAL` + `MONITOR_FLIGHT`, not human review. | D04; maintainer decision. |
| P6 | **Approved: V1 product-scope decision**, not a modification of the original policy. R5 is evaluated within a disruption context (`WARNING`/`CRITICAL`); a minor on a normal itinerary does not trigger a human-review recommendation. With no disruption it is `NOT_APPLICABLE`; with unknown severity `INSUFFICIENT_EVIDENCE`. | D05/D07; maintainer decision. |
| P7 | A policy is valid from `validFrom` (inclusive) to `validUntil` (exclusive), must be `ACTIVE` and be `POL-DELAY-2026-03`; otherwise no rule is evaluated and the assessment is `PARTIAL`. Provider rules contribute only their ids: thresholds live in the engine. | D05. |
| P8 | Alternatives: `ELIGIBLE` needs fresh data (TTL inclusive), seats ≥ group size, same final destination, confirmed reachability, known fare conditions with zero fare difference, high confidence and a no-fee rebooking benefit (R1/R3 `APPLICABLE`). Hard failures → `NOT_ELIGIBLE`; review conditions → `REQUIRES_REVIEW`; unconfirmed items → `PENDING_VALIDATION`. A refund always needs review. | D06. |
| P9 | `INDETERMINATE` when aggregate severity is unknown; `PARTIAL` when the connection loss is unconfirmed, policy evidence is insufficient or unavailable, alternatives are unavailable or unvalidated, or facts rest on a secondary source. | D08/D10. |
| P10 | **Approved.** A booking context older than 5 min is an application error `STALE_BOOKING_CONTEXT`, mapped publicly to HTTP 502 `INVALID_UPSTREAM_RESPONSE`; the specific reason is kept for internal diagnosis. | D03/A06; maintainer decision. |
| P11 | Gate-change and airport-change classification (D01) are not implemented: V1 scenarios have a single gate fact and no baseline to detect a change. The gate is reported as a fact only. | "Implement only the events needed by V1 scenarios". |
| P12 | DEMO06 is an additional synthetic fixture for R3, not from the original challenge case. It now includes an actual outbound departure before the confirmed inbound arrival; both precede the simulation reference. This corrects the original fixture's insufficient evidence. With its original scheduled departure alone, it remains `AT_RISK / NOT_CONFIRMED` and R3 is `INSUFFICIENT_EVIDENCE`. | D04/D05; fixed reference instant (A02). |
| P13 | A timestamp in the future (clock skew, bad provider) is never fresh: booking context, events and options stamped after `now` are rejected as stale (advisory finding of the native review of PR-03). | D03. |
| P14 | Passenger-facing text lives in the presentation layer (`PassengerMessageComposer`, PR-04), never in domain or application. The assessment carries structured facts only (including scheduled times and route per segment) so messages are built from verified data. See `API-CONTRACT.md`, "Passenger communication". | Maintainer requirement at the G3 refinement. |
