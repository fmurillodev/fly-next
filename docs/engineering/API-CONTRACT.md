# FlyNext — REST API Contract (PROPOSAL)

> **Status:** resolutions A02–A08 are approved by the maintainer (see `DOMAIN-DECISIONS.md`, "Approved resolutions"). The complete DTO remains a **proposal** until final approval at gate G3, before PR-04. No schemas or endpoints are implemented.

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
