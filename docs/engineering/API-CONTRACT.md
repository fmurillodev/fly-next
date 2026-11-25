# FlyNext — REST API Contract (PROPOSAL)

> **Status:** resolutions A02–A08 are approved by the maintainer (see `DOMAIN-DECISIONS.md`, "Approved resolutions"). The complete DTO remains a **proposal** until final approval at gate G3, before PR-04. No schemas or endpoints are implemented. The section "Definitive DTO proposal (PR-03)" at the end supersedes the illustrative example and the open questions below for G3 review.

## Endpoint

`POST /api/v1/disruptions/assessment` — read-only, stateless. Also: `GET /health`, `GET /docs` (Swagger UI).

Request (`application/json`, Zod-validated, size-limited, unknown keys rejected):

```json
{ "bookingId": "ABC123" }
```

`bookingId`: string, 1–32 chars, `[A-Za-z0-9]`.

## Time representation (A02)

- Public timestamps are ISO 8601 **with explicit offset**, rendered in the local airport zone (IANA: `America/Santiago`, `America/Lima`, `America/Mexico_City`) with the zone name alongside.
- Comparisons, durations and freshness are computed in UTC. The `Clock` is injectable; simulated reference instant: `2026-09-15T11:02:40Z`.
- Offsets are resolved per date from the IANA database, never assumed constant. Verified with Node `Intl` for 2026-09-15/16: Santiago `-03:00`, Lima `-05:00`, Mexico City `-06:00`.
- `projectedArrival` is a projection, not a confirmed operational fact.

## Success response (200) — ABC123 (illustrative)

```json
{
  "requestId": "req_01",
  "assessmentStatus": "PARTIAL",
  "disruption": {
    "severity": "CRITICAL",
    "events": [
      {
        "segmentId": "S1",
        "flightNumber": "LA500",
        "flightStatus": "DELAYED",
        "severity": "WARNING",
        "delayMinutes": 160,
        "delayConfirmed": true,
        "estimatedDeparture": { "local": "2026-09-15T17:10:00-03:00", "timeZone": "America/Santiago" },
        "gate": "24"
      },
      { "segmentId": "S2", "flightNumber": "LA2410", "flightStatus": "SCHEDULED", "severity": "NONE" }
    ]
  },
  "connection": {
    "status": "AT_RISK",
    "lossConfirmed": false,
    "originalConnectionMinutes": 70,
    "projectedArrival": { "local": "2026-09-15T20:35:00-05:00", "timeZone": "America/Lima", "confirmed": false },
    "projectedMarginMinutes": -90,
    "note": "Projection from the departure delay; not a confirmed arrival."
  },
  "policies": {
    "policyId": "POL-DELAY-2026-03",
    "evaluations": [
      { "rule": "R1", "benefit": "REBOOK_NO_FEE", "status": "NOT_APPLICABLE" },
      { "rule": "R2", "benefit": "MEAL_VOUCHER", "status": "NOT_APPLICABLE" },
      { "rule": "R3", "benefit": "REBOOK_NO_FEE", "status": "INSUFFICIENT_EVIDENCE" },
      { "rule": "R4", "benefit": "CASH_COMPENSATION", "status": "NOT_APPLICABLE" },
      { "rule": "R5", "benefit": "PRIORITY_HANDLING", "status": "REQUIRES_HUMAN_APPROVAL" }
    ]
  },
  "recommendation": {
    "type": "HUMAN_REVIEW",
    "priority": "HIGH",
    "reasonCodes": ["CONNECTION_AT_RISK", "PRIORITY_REVIEW_REQUIRED", "INCOMPLETE_FARE_CONDITIONS"],
    "summary": "A human agent should review this itinerary. No benefit is guaranteed."
  },
  "alternatives": [
    { "optionId": "O1", "kind": "FLIGHT", "flightNumber": "LA2412",
      "departure": { "local": "2026-09-16T08:15:00-05:00", "timeZone": "America/Lima" },
      "eligibility": "PENDING_VALIDATION", "reasonCodes": ["FARE_CONDITIONS_INCOMPLETE"], "seatsCoverGroup": true },
    { "optionId": "O2", "kind": "FLIGHT", "flightNumber": "LA2450",
      "departure": { "local": "2026-09-15T23:40:00-05:00", "timeZone": "America/Lima" },
      "eligibility": "NOT_ELIGIBLE", "reasonCodes": ["INSUFFICIENT_SEATS_FOR_GROUP"], "seatsCoverGroup": false },
    { "optionId": "O3", "kind": "REFUND", "eligibility": "REQUIRES_REVIEW", "reasonCodes": ["LOW_CONFIDENCE"] }
  ],
  "actions": { "executed": [], "recommended": ["HUMAN_REVIEW"] },
  "warnings": [
    { "code": "SOURCE_CONFLICT_RESOLVED", "message": "Some operational data was verified against the most reliable available source." },
    { "code": "FARE_CONDITIONS_INCOMPLETE", "message": "Change penalty is unknown; no free rebooking is guaranteed." }
  ],
  "metadata": {
    "assessedAt": "2026-09-15T11:02:40Z",
    "mode": "SIMULATION",
    "dataSnapshot": "historical-fixture",
    "policyRefs": [{ "id": "POL-DELAY-2026-03" }]
  }
}
```

Notes:

- `severity` (`NONE|INFO|WARNING|CRITICAL|UNKNOWN`), `assessmentStatus`, `flightStatus`, `connection.status`, policy `status`, `recommendation.type` and `recommendation.priority` are independent enums (D08, A07). Severity is **not** priority, assessment status or connection status.
- D01 → severity mapping: no verified disruption → `NONE`; informative → `INFO`; relevant → `WARNING`; critical → `CRITICAL`; not determinable → `UNKNOWN`. Aggregate `disruption.severity` is the highest event/connection severity; for ABC123 the at-risk connection makes it `CRITICAL` while the delayed S1 event is `WARNING` (160 min ≥ 30).
- `priority` is FlyNext's recommended level of attention, not an assignment to an operational queue.
- `actions.executed` is always `[]` in V1 (D07).
- Public DTO never contains: passenger names/documents/emails/phones/exact ages; raw provider payloads; detailed provider contradictions; internal reconciliation hierarchy; the internal reason code `GROUP_INCLUDES_MINOR` (replaced publicly by `PRIORITY_REVIEW_REQUIRED`). Detailed `decisionTrace` is internal only.
- `warnings` carry sanitized uncertainty messages only. `metadata.mode: "SIMULATION"` labels historical fixtures (D03).

## Enumerations

| Field | Values |
| --- | --- |
| `assessmentStatus` | `COMPLETE`, `PARTIAL`, `INDETERMINATE` |
| `severity` | `NONE`, `INFO`, `WARNING`, `CRITICAL`, `UNKNOWN` |
| `flightStatus` | `SCHEDULED`, `ON_TIME`, `DELAYED`, `CANCELLED`, `UNKNOWN` |
| `connection.status` | `SAFE`, `AT_RISK`, `MISSED`, `UNKNOWN` |
| policy `status` | `APPLICABLE`, `NOT_APPLICABLE`, `REQUIRES_HUMAN_APPROVAL`, `INSUFFICIENT_EVIDENCE` |
| `recommendation.type` | `NO_ACTION_REQUIRED`, `MONITOR_FLIGHT`, `REVIEW_REBOOKING_OPTIONS`, `HUMAN_REVIEW` |
| `recommendation.priority` | `LOW`, `NORMAL`, `HIGH` |
| alternative `eligibility` (proposed) | `ELIGIBLE`, `PENDING_VALIDATION`, `NOT_ELIGIBLE`, `REQUIRES_REVIEW` |

## Degraded responses (200)

If enough information exists for controlled degradation, respond 200 with `assessmentStatus` `PARTIAL` or `INDETERMINATE`, affected sections flagged (`"available": false` + reason code), and no guaranteed benefits or unverified alternatives (D10, A06).

## Errors

Problem body inspired by RFC 9457 (`application/problem+json`); no stack traces, no raw upstream payloads.

```json
{
  "type": "https://flynext.example/problems/booking-not-found",
  "title": "Booking not found",
  "status": 404,
  "code": "BOOKING_NOT_FOUND",
  "detail": "No synthetic booking matches the supplied identifier.",
  "requestId": "req_01"
}
```

| Code | HTTP | When |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | schema/size validation failure |
| `BOOKING_NOT_FOUND` | 404 | unknown `bookingId` |
| `RATE_LIMIT_EXCEEDED` | 429 | rate limit hit |
| `INVALID_UPSTREAM_RESPONSE` | 502 | invalid upstream response prevents a safe assessment (A06) |
| `UPSTREAM_UNAVAILABLE` | 503 | booking provider unavailable |
| `UPSTREAM_TIMEOUT` | 504 | booking provider timeout |
| `INTERNAL_ERROR` | 500 | unexpected, sanitized |

Failures of events/policies/alternatives providers, or invalid responses from them, degrade the assessment when a safe response exists instead of erroring.

## Other endpoints

`GET /health` → `200 { "status": "ok" }`. `GET /docs` → Swagger UI generated from the schemas.

## Public scenarios (A08)

Public/demo: `ABC123` (mandatory), `DEMO01` (normal verified flight), `DEMO02` (190-min delay). `DEMO03`–`DEMO06` live only as automated-test fixtures. All data is synthetic.

## Remaining open questions for G3

1. Whether `/health` exposes mode/version.
2. Exact `alternatives[].eligibility` enum and `warnings[].code` catalogue.
3. Whether `available: false` flags or omission is used for degraded sections.
4. Final shape of time objects (`local` + `timeZone`, with or without a UTC field).

## Definitive DTO proposal (PR-03, pending G3)

Produced after the domain engine exists: every field below is backed by an internal result (`DisruptionAssessment`) and is built by an allowlist mapper in PR-04. Internal entities are never serialized directly. Changes against the illustrative example above are marked **Δ**.

### Shape

| Field | Type | Notes |
| --- | --- | --- |
| `requestId` | string | Correlation id. |
| `assessmentStatus` | `COMPLETE\|PARTIAL\|INDETERMINATE` | |
| `disruption.severity` | Severity | Aggregate (A07). |
| `disruption.events[]` | `{ segmentId, flightNumber, flightStatus, severity, delay, estimatedDeparture?, gate }` | **Δ** `delay` and `gate` are explicit objects (see unknown semantics). |
| `connection` | `null \| { status, lossConfirmation, originalConnectionMinutes, inboundArrival?, marginMinutes?, note }` | **Δ** `null` for a single-segment itinerary. `lossConfirmation` ∈ `CONFIRMED_MISSED\|CONFIRMED_NOT_MISSED\|NOT_CONFIRMED` replaces the boolean `lossConfirmed`. `inboundArrival` = `{ time, confirmed }`; `confirmed:false` is an inference. |
| `policies` | `{ available:true, policyId, version, validity, evaluations[{rule, benefit, status}] } \| { available:false, reasonCode }` | **Δ** non-`VALID` validity ⇒ `evaluations: []`. |
| `recommendation` | `{ type, priority, reasonCodes[], summary }` | Public reason-code mapping below. |
| `alternatives` | `{ status:"EVALUATED", options[] } \| { status:"NOT_REQUIRED" } \| { status:"UNAVAILABLE", reasonCode }` | **Δ** option = `{ optionId, kind, flightNumber?, departure?, eligibility, reasonCodes[] }`; `seatsCoverGroup` dropped (derivable from reason codes). |
| `actions` | `{ executed: [], recommended: [type] }` | `executed` is always empty in V1 (D07). |
| `warnings[]` | `{ code, message }` | Closed catalogue below; sanitized messages. |
| `metadata` | `{ assessedAt, mode, dataSnapshot, policyRefs[] }` | `mode` ∈ `SIMULATION\|REAL_TIME`; `dataSnapshot:"historical-fixture"` when simulated. |

Time object: `{ local, timeZone, utc }` — `local` ISO 8601 with offset resolved per date, `timeZone` IANA, `utc` ISO instant. **Δ** `utc` added so clients never recompute offsets; `metadata.assessedAt` is UTC `Z`.

### Enums

`assessmentStatus`, `severity`, `flightStatus`, `connection.status`, policy `status`, `recommendation.type`, `priority`: unchanged (see Enumerations). `eligibility` ∈ `ELIGIBLE\|PENDING_VALIDATION\|NOT_ELIGIBLE\|REQUIRES_REVIEW` (confirmed by the implementation). `connection.lossConfirmation` as above. `policies.validity` ∈ `VALID\|EXPIRED\|NOT_YET_VALID\|INACTIVE\|UNSUPPORTED`.

### Unknown semantics

Unknown is never encoded as `false`, `0`, `null` or an omitted field standing for "no":

- `delay`: `{ status:"CONFIRMED"\|"UNCONFIRMED", minutes }` \| `{ status:"NOT_DELAYED" }` \| `{ status:"UNKNOWN", reason }`. `UNCONFIRMED` rests on a secondary source only.
- `gate`: `{ status:"KNOWN", value }` \| `{ status:"UNKNOWN", reason }`.
- `reason` ∈ `STALE` (data older than its freshness window) \| `UNAVAILABLE` (no data or provider failure) \| `UNVERIFIED` (contradiction or only degraded sources). Internal detail (which sources contradicted, hierarchy) stays out of the DTO (A05).
- `lossConfirmation:"NOT_CONFIRMED"` means "not confirmed either way"; only `CONFIRMED_NOT_MISSED` says the connection was not lost.
- Policy `INSUFFICIENT_EVIDENCE` and alternative `PENDING_VALIDATION`/`REQUIRES_REVIEW` mean "not verified", never "denied".

### Reason codes

Recommendation codes (public): `CONNECTION_AT_RISK`, `CONNECTION_MISSED`, `CONNECTION_UNKNOWN`, `PRIORITY_REVIEW_REQUIRED` (**internal `GROUP_INCLUDES_MINOR`**, mapped by the DTO mapper per A05), `COMPENSATION_REQUESTED`, `INCOMPLETE_FARE_CONDITIONS`, `POLICY_UNVERIFIED`, `ALTERNATIVES_UNAVAILABLE`, `OPERATIONAL_DATA_UNRESOLVED`, `NO_VERIFIED_ALTERNATIVE`.

Alternative codes: `STALE_OPTION`, `DEPARTED`, `ITINERARY_INCOMPATIBLE`, `NOT_REACHABLE`, `REACHABILITY_UNCONFIRMED`, `INSUFFICIENT_SEATS_FOR_GROUP`, `SEATS_UNKNOWN`, `CHANGES_NOT_ALLOWED`, `FARE_CONDITIONS_INCOMPLETE`, `CHANGE_PENALTY_APPLIES`, `FARE_DIFFERENCE_APPLIES`, `FARE_DIFFERENCE_UNKNOWN`, `LOW_CONFIDENCE`, `MEDIUM_CONFIDENCE`, `REFUND_REQUIRES_REVIEW`, `REBOOKING_NOT_AUTHORIZED_BY_POLICY`.

Warning codes (closed catalogue, **Δ** answers open question 2): `SOURCE_CONFLICT_RESOLVED`, `SOURCE_CONFLICT_UNRESOLVED`, `OPERATIONAL_DATA_STALE`, `OPERATIONAL_DATA_UNAVAILABLE`, `DEGRADED_SOURCE_LIMITED`, `SECONDARY_SOURCE_ONLY`, `FARE_CONDITIONS_INCOMPLETE`, `POLICIES_UNAVAILABLE`, `POLICY_NOT_VALID`, `ALTERNATIVES_UNAVAILABLE`.

### ABC123 (result of the implemented engine)

`PARTIAL`; severity `CRITICAL`; S1 `DELAYED`, delay `CONFIRMED` 160, gate `KNOWN` `24`, severity `WARNING`; S2 `SCHEDULED`, `NONE`; connection `AT_RISK`, `NOT_CONFIRMED`, 70 min booked, projected arrival 20:35 `-05:00` (`confirmed:false`), margin −90; R1 `NOT_APPLICABLE`, R2 `NOT_APPLICABLE`, R3 `INSUFFICIENT_EVIDENCE`, R4 `NOT_APPLICABLE`, R5 `REQUIRES_HUMAN_APPROVAL`; `HUMAN_REVIEW` / `HIGH` with public codes `CONNECTION_AT_RISK`, `PRIORITY_REVIEW_REQUIRED`, `INCOMPLETE_FARE_CONDITIONS`; O1 `PENDING_VALIDATION` (`REACHABILITY_UNCONFIRMED`, `FARE_CONDITIONS_INCOMPLETE`, `REBOOKING_NOT_AUTHORIZED_BY_POLICY`), O2 `NOT_ELIGIBLE` (`INSUFFICIENT_SEATS_FOR_GROUP`), O3 `REQUIRES_REVIEW` (`REFUND_REQUIRES_REVIEW`, `LOW_CONFIDENCE`); `actions.executed: []`.

### Application error → HTTP (with A06)

| Application error | HTTP | Public `code` |
| --- | --- | --- |
| `BOOKING_NOT_FOUND` | 404 | `BOOKING_NOT_FOUND` |
| `UPSTREAM_UNAVAILABLE` | 503 | `UPSTREAM_UNAVAILABLE` |
| `UPSTREAM_TIMEOUT` | 504 | `UPSTREAM_TIMEOUT` |
| `INVALID_UPSTREAM_RESPONSE` (booking) | 502 | `INVALID_UPSTREAM_RESPONSE` |
| `STALE_BOOKING_CONTEXT` | 502 | `INVALID_UPSTREAM_RESPONSE` (**Δ** proposed: a booking older than 5 min prevents a safe assessment; no new public code) |
| events / policies / alternatives failure | 200 | degraded `INDETERMINATE` / `PARTIAL` (D10) |
| any thrown exception | 500 | `INTERNAL_ERROR` (sanitized) |

Request validation (400) and rate limiting (429) belong to the presentation layer in PR-04.

### Open questions for G3 (with recommendation)

1. `/health` mode/version: recommend **no** (keep `{ "status": "ok" }`).
2. Eligibility enum and warning catalogue: as implemented above.
3. Degraded sections: recommend explicit `available:false` / `status` objects, not omission.
4. Time objects: recommend `local` + `timeZone` + `utc`.
5. New: `STALE_BOOKING_CONTEXT` mapped to 502 `INVALID_UPSTREAM_RESPONSE`, acceptable?
