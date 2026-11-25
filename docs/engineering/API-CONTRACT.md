# FlyNext — REST API Contract

> **Status:** The maintainer approved the public DTO for PR-04 with C01–C05 (ODD L20). A02–A08 remain in force (see `DOMAIN-DECISIONS.md`, "Approved resolutions"). Approval describes the wire contract, not deployment status.

The Zod schemas exported by `@flynext/contracts` are the executable source of truth: `AssessmentRequestSchema`, `AssessmentResponseSchema`, `PassengerMessageSchema`, and `ProblemDetailsSchema`. Their corresponding types are inferred from those schemas. `healthResponseSchema` is unchanged. PR-06 owns creation of `README.md`; its absence does not block PR-04.

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
- `connection.inboundArrival.confirmed: false` marks a projection, not a confirmed operational fact.

## Success response (200)

See the complete ABC123, DEMO01 and DEMO02 DTO examples below.

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
| alternative `eligibility` | `ELIGIBLE`, `PENDING_VALIDATION`, `NOT_ELIGIBLE`, `REQUIRES_REVIEW` |

## Degraded responses (200)

If enough information exists for controlled degradation, respond 200 with `assessmentStatus` `PARTIAL` or `INDETERMINATE`. Unavailable policies and alternatives use their own explicit branches (see Shape). Missing or unverified operational facts use the unknown states and sanitized warnings; they do not mean there is no disruption. Degraded responses do not guarantee benefits or present unverified alternatives as eligible (D10, A06).

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

## Public assessment DTO

The presentation layer builds the DTO with an explicit allowlist. Internal entities are never serialized directly, and the public schemas reject unknown object keys.

### Shape

| Field | Type | Notes |
| --- | --- | --- |
| `requestId` | string | Correlation id. |
| `assessmentStatus` | `COMPLETE`, `PARTIAL`, `INDETERMINATE` | |
| `disruption` | `{ severity, summary: PassengerMessage, events[] }` | Aggregate severity (A07). |
| `disruption.events[]` | `{ segmentId, flightNumber, origin, destination, scheduledDeparture, scheduledArrival, flightStatus, severity, delay, estimatedDeparture?, gate, message: PassengerMessage }` | `origin` and `destination` are `{ code, timeZone }`; departure and arrival fields are time objects. |
| `connection` | `null` or `{ status, lossConfirmation, originalConnectionMinutes, inboundArrival?, marginMinutes?, message: PassengerMessage }` | `null` for a single-segment itinerary. `lossConfirmation` is `CONFIRMED_MISSED`, `CONFIRMED_NOT_MISSED`, or `NOT_CONFIRMED`. `inboundArrival` is `{ time, confirmed }`; `false` identifies a projection and `true` a confirmed actual arrival. |
| `policies` | `{ available: true, policyId, version, validity, evaluations[] }` or `{ available: false, reasonCode: "POLICIES_UNAVAILABLE" }` | Each evaluation is `{ rule, benefit, status }`; non-`VALID` policies have `evaluations: []`. |
| `recommendation` | `{ type, priority, reasonCodes[], message: PassengerMessage }` | No `summary` field. Public reason-code mapping below. |
| `alternatives` | `{ status: "EVALUATED", options[] }`, `{ status: "NOT_REQUIRED" }`, or `{ status: "UNAVAILABLE", reasonCode: "ALTERNATIVES_UNAVAILABLE" }` | Each option is `{ optionId, kind, flightNumber?, departure?, eligibility, reasonCodes[], message: PassengerMessage }`; `kind` is `FLIGHT` or `REFUND`. |
| `actions` | `{ executed: [], recommended: [type] }` | `executed` is always empty in V1 (D07); `recommended` carries the single recommendation type. |
| `warnings[]` | `{ code, title, message }` | Closed catalogue below; always `[]` when there are no warnings. |
| `metadata` | `{ assessedAt, mode, dataSnapshot, locale, policyRefs[], notice? }` | `locale` is `es`; policy refs are `{ id, version }`. `SIMULATION` requires `dataSnapshot: "historical-fixture"` and a `notice: PassengerMessage`. `REAL_TIME` allows a string snapshot and an optional notice; synthetic data never uses this mode. |

Time object: `{ local, timeZone, utc }` — `local` is ISO 8601 with an explicit offset resolved per date, `timeZone` is IANA, and `utc` is an ISO instant ending in `Z`. `metadata.assessedAt` is also UTC `Z`. The presenter supplies matching local and UTC values; clients need not recompute offsets.

`policies.validity`: `VALID`, `EXPIRED`, `NOT_YET_VALID`, `INACTIVE`, `UNSUPPORTED`. Policy evaluation `rule`: `R1`–`R5`. Benefit: `REBOOK_NO_FEE`, `MEAL_VOUCHER`, `CASH_COMPENSATION`, `PRIORITY_HANDLING`.

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

Warning codes (closed catalogue): `SOURCE_CONFLICT_RESOLVED`, `SOURCE_CONFLICT_UNRESOLVED`, `OPERATIONAL_DATA_STALE`, `OPERATIONAL_DATA_UNAVAILABLE`, `DEGRADED_SOURCE_LIMITED`, `SECONDARY_SOURCE_ONLY`, `FARE_CONDITIONS_INCOMPLETE`, `POLICIES_UNAVAILABLE`, `POLICY_NOT_VALID`, `ALTERNATIVES_UNAVAILABLE`.

### ABC123 (result of the implemented engine)

`PARTIAL`; severity `CRITICAL`; S1 `DELAYED`, delay `CONFIRMED` 160, gate `KNOWN` `24`, severity `WARNING`; S2 `SCHEDULED`, `NONE`; connection `AT_RISK`, `NOT_CONFIRMED`, 70 min booked, projected arrival 20:35 `-05:00` (`confirmed:false`), margin −90; R1 `NOT_APPLICABLE`, R2 `NOT_APPLICABLE`, R3 `INSUFFICIENT_EVIDENCE`, R4 `NOT_APPLICABLE`, R5 `REQUIRES_HUMAN_APPROVAL`; `HUMAN_REVIEW` / `HIGH` with public codes `CONNECTION_AT_RISK`, `PRIORITY_REVIEW_REQUIRED`, `INCOMPLETE_FARE_CONDITIONS`; O1 `PENDING_VALIDATION` (`REACHABILITY_UNCONFIRMED`, `FARE_CONDITIONS_INCOMPLETE`, `REBOOKING_NOT_AUTHORIZED_BY_POLICY`), O2 `NOT_ELIGIBLE` (`INSUFFICIENT_SEATS_FOR_GROUP`), O3 `REQUIRES_REVIEW` (`REFUND_REQUIRES_REVIEW`, `LOW_CONFIDENCE`); `actions.executed: []`.

### Application error → HTTP (with A06)

| Application error | HTTP | Public `code` |
| --- | --- | --- |
| `BOOKING_NOT_FOUND` | 404 | `BOOKING_NOT_FOUND` |
| `UPSTREAM_UNAVAILABLE` | 503 | `UPSTREAM_UNAVAILABLE` |
| `UPSTREAM_TIMEOUT` | 504 | `UPSTREAM_TIMEOUT` |
| `INVALID_UPSTREAM_RESPONSE` (booking) | 502 | `INVALID_UPSTREAM_RESPONSE` |
| `STALE_BOOKING_CONTEXT` | 502 | `INVALID_UPSTREAM_RESPONSE` (approved at G3 review, P10: the specific reason `STALE_BOOKING_CONTEXT` is kept for internal diagnosis and logs only, never in the public body) |
| events / policies / alternatives failure | 200 | degraded `INDETERMINATE` / `PARTIAL` (D10) |
| any thrown exception | 500 | `INTERNAL_ERROR` (sanitized) |

Request validation (400) and rate limiting (429) belong to the presentation layer in PR-04.

Note on connection semantics after P5: `AT_RISK` needs a projected margin ≤ 0 or operational evidence of risk; a reduced but still positive margin without evidence is `UNKNOWN`; `SAFE` needs sufficient evidence; `MISSED` needs confirmation. `CONFIRMED_NOT_MISSED` appears only together with `SAFE` on a confirmed arrival.

## Passenger communication (G3 refinement)

Technical states and the text shown to the passenger are separate. Enums and reason codes exist for **programmatic decisions in the frontend** (styling, ordering, enabling actions); they are never rendered as UI text. Every section a passenger reads carries a `message` built from verified data.

```ts
interface PassengerMessage {
  code: string;          // stable template id, e.g. CONNECTION_AT_RISK_PROJECTED_DELAY (variant-specific)
  title: string;         // short, comprehensible
  message: string;       // contextual explanation (facts, estimates and uncertainty kept apart)
  nextSteps?: string[];  // actionable, only when there is something the passenger can do
}
```

**Where it applies:**

| Section | `message` | Why |
| --- | --- | --- |
| `disruption.summary` and each `disruption.events[]` | yes | The passenger needs the headline and per-flight facts (delay, new time, gate). |
| `connection` | yes | The highest-stress item; must separate confirmed facts from the projected arrival. |
| `recommendation` | yes; `nextSteps` when applicable | The only place that states benefits (conditionally) and what to do next. |
| `alternatives.options[]` | yes | Each option needs its own plain explanation of what is and is not confirmed. |
| `warnings[]` | yes (`title` + `message`, one sentence) | Cross-cutting caveats; never duplicated by a section that already says the same. |
| `policies.evaluations[]` | **no** | Per-rule texts would read as promises (D07). Benefits are folded into the recommendation message with "sujeto a confirmación". |
| `metadata.notice` | required in simulation | Simulation label; historical data is never shown as real time (D03). |

**Structured data stays alongside the text** so the UI can render times, delays, gates, options and conditions on its own: time objects (`local`, `timeZone`, `utc`), `delay`, `gate`, `inboundArrival`, `marginMinutes`, `originalConnectionMinutes`, `scheduledDeparture/Arrival`, `origin/destination`, `eligibility` and `reasonCodes`.

**Principles for composing messages (language: Spanish, V1):**

- Built dynamically from the assessment; nothing specific to ABC123 is hardcoded. A missing parameter drops its sentence; it never prints `undefined` or a placeholder.
- Facts, estimates and uncertainty use different wording ("confirmado", "estimamos", "todavía no está verificado"). A projected arrival is always labelled as an estimate.
- Never guarantee availability, no-fee changes, compensation or refunds; never claim an action was performed ("esto es una recomendación: no hemos realizado ninguna acción").
- No internal enum names, reason codes, source names, contradiction details, minor/age data or counts of seats. The priority for a group with a minor is expressed as "atención prioritaria" (A05).
- No airline branding; "un agente de la aerolínea".
- No duplicated sentences between sections; tone informative, not alarmist (severity drives style in the UI, not exclamation in the text).
- Times are rendered in the airport's own zone with its name ("17:10 (hora de Santiago)"); dates in short Spanish form.

**Architecture (PR-04):** a `PassengerMessageComposer` in `apps/api/src/disruption/presentation/` takes the internal `DisruptionAssessment`, a locale (`"es"` only in V1) and returns the messages. Templates are deterministic functions in a per-locale catalog (`messages.es.ts`) keyed by `code`; a future `en` catalog only adds a file. The composer is part of the public-DTO mapper (allowlist); `domain/` and `application/` contain no presentation text and no LLM or i18n library is introduced. PR-04 tests: one test per template code, "no enum or code leaks into any title/message", "no guarantee wording outside negations", "output varies with input (different delay, flight, times)", and "no PII". Visual representation and accessibility belong to PR-05.

**Template variants** (code identifies the variant): `CONNECTION_AT_RISK_PROJECTED_DELAY` (margin ≤ 0 from a delay), `CONNECTION_AT_RISK_CANCELLATION_REPORTED` (unconfirmed cancellation report), `CONNECTION_UNKNOWN` (positive margin, no evidence), `CONNECTION_SAFE`, `CONNECTION_MISSED_CONFIRMED`; `FLIGHT_DELAYED_CONFIRMED`, `FLIGHT_DELAYED_UNCONFIRMED`, `FLIGHT_CANCELLED`, `FLIGHT_ON_TIME`, `FLIGHT_ON_SCHEDULE`, `FLIGHT_STATUS_UNVERIFIED`; `DISRUPTION_NONE`, `DISRUPTION_INFO`, `DISRUPTION_RELEVANT`, `DISRUPTION_CRITICAL`, `DISRUPTION_UNDETERMINED`; `RECOMMENDATION_NO_ACTION`, `RECOMMENDATION_MONITOR`, `RECOMMENDATION_REVIEW_OPTIONS`, `RECOMMENDATION_HUMAN_REVIEW`; `OPTION_ELIGIBLE`, `OPTION_PENDING_VALIDATION`, `OPTION_NOT_ELIGIBLE_*`, `OPTION_REQUIRES_REVIEW`, `OPTION_REFUND_REQUIRES_REVIEW`; `SIMULATION_MODE`.

### Post-deploy smoke check

Run this only after a separately authorized Railway deployment. Use `BASE_URL=http://127.0.0.1:3000` for the local equivalent.

```sh
BASE_URL=https://flynext-api-production.up.railway.app
curl -fsS "${BASE_URL}/health"               # 200; {"status":"ok"}
curl -fsSL "${BASE_URL}/docs" -o /dev/null    # 200; Swagger UI
endpoint="$BASE_URL/api/v1/disruptions/assessment"
curl -sS -i -H 'Content-Type: application/json' --data '{"bookingId":"ABC123"}' "$endpoint"  # 200; PARTIAL
curl -sS -i -H 'Content-Type: application/json' --data '{"bookingId":123}' "$endpoint"       # 400; INVALID_REQUEST
curl -sS -i -H 'Content-Type: application/json' --data '{"bookingId":"UNKNOWN"}' "$endpoint" # 404; BOOKING_NOT_FOUND
```

Check that the assessment declares `SIMULATION` and has no executed actions, both errors use `application/problem+json`, and the `X-Request-Id` header matches the body on each POST. Railway remains responsible for HTTPS and the injected `PORT`; retain `HOST=0.0.0.0`, `pnpm build`, `pnpm start`, and `/health`. See [Observability](OBSERVABILITY.md) for log configuration and the direct-peer rate limit behind a reverse proxy.

### Complete DTO examples

These are approved wire examples for the three public synthetic fixtures. They illustrate the Spanish `title`, `message` and optional `nextSteps` fields. The composer generates text dynamically from the assessment; the frontend never constructs business messages from enums.

Policies are shown with the five evaluations in order R1–R5. `decisionTrace` is never part of the DTO.

#### ABC123

```json
{
  "requestId": "req_01",
  "assessmentStatus": "PARTIAL",
  "disruption": {
    "severity": "CRITICAL",
    "summary": {
      "code": "DISRUPTION_CRITICAL",
      "title": "Tu viaje tiene una alteración importante",
      "message": "Puede que necesites revisar tu itinerario. Tu vuelo LA500 tiene un retraso confirmado de 160 minutos. Tu conexión está en riesgo."
    },
    "events": [
      {
        "segmentId": "S1",
        "flightNumber": "LA500",
        "origin": {
          "code": "SCL",
          "timeZone": "America/Santiago"
        },
        "destination": {
          "code": "LIM",
          "timeZone": "America/Lima"
        },
        "scheduledDeparture": {
          "local": "2026-09-15T14:30:00-03:00",
          "timeZone": "America/Santiago",
          "utc": "2026-09-15T17:30:00Z"
        },
        "scheduledArrival": {
          "local": "2026-09-15T17:55:00-05:00",
          "timeZone": "America/Lima",
          "utc": "2026-09-15T22:55:00Z"
        },
        "flightStatus": "DELAYED",
        "severity": "WARNING",
        "delay": {
          "status": "CONFIRMED",
          "minutes": 160
        },
        "estimatedDeparture": {
          "local": "2026-09-15T17:10:00-03:00",
          "timeZone": "America/Santiago",
          "utc": "2026-09-15T20:10:00Z"
        },
        "gate": {
          "status": "KNOWN",
          "value": "24"
        },
        "message": {
          "code": "FLIGHT_DELAYED_CONFIRMED",
          "title": "Tu vuelo LA500 está retrasado",
          "message": "El retraso confirmado para el vuelo LA500 es de 160 minutos. Su hora estimada de salida es 17:10 (hora de Santiago). Puerta de embarque: 24."
        }
      },
      {
        "segmentId": "S2",
        "flightNumber": "LA2410",
        "origin": {
          "code": "LIM",
          "timeZone": "America/Lima"
        },
        "destination": {
          "code": "MEX",
          "timeZone": "America/Mexico_City"
        },
        "scheduledDeparture": {
          "local": "2026-09-15T19:05:00-05:00",
          "timeZone": "America/Lima",
          "utc": "2026-09-16T00:05:00Z"
        },
        "scheduledArrival": {
          "local": "2026-09-15T23:40:00-06:00",
          "timeZone": "America/Mexico_City",
          "utc": "2026-09-16T05:40:00Z"
        },
        "flightStatus": "SCHEDULED",
        "severity": "NONE",
        "delay": {
          "status": "NOT_DELAYED"
        },
        "gate": {
          "status": "UNKNOWN",
          "reason": "UNAVAILABLE"
        },
        "message": {
          "code": "FLIGHT_ON_SCHEDULE",
          "title": "Tu vuelo LA2410 sigue programado",
          "message": "Por ahora no hay cambios informados para el vuelo LA2410. Aún no hay información verificada sobre la puerta de embarque."
        }
      }
    ]
  },
  "connection": {
    "status": "AT_RISK",
    "lossConfirmation": "NOT_CONFIRMED",
    "originalConnectionMinutes": 70,
    "inboundArrival": {
      "time": {
        "local": "2026-09-15T20:35:00-05:00",
        "timeZone": "America/Lima",
        "utc": "2026-09-16T01:35:00Z"
      },
      "confirmed": false
    },
    "marginMinutes": -90,
    "message": {
      "code": "CONNECTION_AT_RISK_PROJECTED_DELAY",
      "title": "Tu conexión podría verse afectada",
      "message": "Con los horarios disponibles, es posible que no llegues a tiempo. No se ha confirmado la pérdida de la conexión. Tu itinerario preveía 70 minutos para conectar. Estimamos tu llegada a las 20:35 (hora de Lima); todavía no se ha confirmado. La salida programada del vuelo LA2410 es a las 19:05 (hora de Lima).",
      "nextSteps": [
        "Al aterrizar, consulta tu puerta de conexión en las pantallas del aeropuerto."
      ]
    }
  },
  "policies": {
    "available": true,
    "policyId": "POL-DELAY-2026-03",
    "version": "2026.03",
    "validity": "VALID",
    "evaluations": [
      {
        "rule": "R1",
        "benefit": "REBOOK_NO_FEE",
        "status": "NOT_APPLICABLE"
      },
      {
        "rule": "R2",
        "benefit": "MEAL_VOUCHER",
        "status": "NOT_APPLICABLE"
      },
      {
        "rule": "R3",
        "benefit": "REBOOK_NO_FEE",
        "status": "INSUFFICIENT_EVIDENCE"
      },
      {
        "rule": "R4",
        "benefit": "CASH_COMPENSATION",
        "status": "NOT_APPLICABLE"
      },
      {
        "rule": "R5",
        "benefit": "PRIORITY_HANDLING",
        "status": "REQUIRES_HUMAN_APPROVAL"
      }
    ]
  },
  "recommendation": {
    "type": "HUMAN_REVIEW",
    "priority": "HIGH",
    "reasonCodes": [
      "CONNECTION_AT_RISK",
      "PRIORITY_REVIEW_REQUIRED",
      "INCOMPLETE_FARE_CONDITIONS"
    ],
    "message": {
      "code": "RECOMMENDATION_HUMAN_REVIEW",
      "title": "Te recomendamos revisar tu itinerario con un agente",
      "message": "Tu itinerario requiere atención prioritaria. Sin todas las condiciones de cambio de tu tarifa, no podemos garantizar un cambio sin costo ni una compensación. Esto es una recomendación: no hemos realizado ninguna acción por ti.",
      "nextSteps": [
        "Habla con un agente de la aerolínea sobre las opciones para tu itinerario.",
        "Ten a mano tu código de reserva y tus documentos de viaje."
      ]
    }
  },
  "alternatives": {
    "status": "EVALUATED",
    "options": [
      {
        "optionId": "O1",
        "kind": "FLIGHT",
        "flightNumber": "LA2412",
        "departure": {
          "local": "2026-09-16T08:15:00-05:00",
          "timeZone": "America/Lima",
          "utc": "2026-09-16T13:15:00Z"
        },
        "eligibility": "PENDING_VALIDATION",
        "reasonCodes": [
          "REACHABILITY_UNCONFIRMED",
          "FARE_CONDITIONS_INCOMPLETE",
          "REBOOKING_NOT_AUTHORIZED_BY_POLICY"
        ],
        "message": {
          "code": "OPTION_PENDING_VALIDATION",
          "title": "Vuelo LA2412 · 16 sept, 08:15 (hora de Lima)",
          "message": "Esta opción todavía no está validada ni reservada. No está confirmado que llegues a tiempo. Falta verificar qué condiciones de cambio se aplican a tu tarifa. El cambio sin costo todavía no está autorizado."
        }
      },
      {
        "optionId": "O2",
        "kind": "FLIGHT",
        "flightNumber": "LA2450",
        "departure": {
          "local": "2026-09-15T23:40:00-05:00",
          "timeZone": "America/Lima",
          "utc": "2026-09-16T04:40:00Z"
        },
        "eligibility": "NOT_ELIGIBLE",
        "reasonCodes": [
          "INSUFFICIENT_SEATS_FOR_GROUP"
        ],
        "message": {
          "code": "OPTION_NOT_ELIGIBLE_SEATS",
          "title": "Vuelo LA2450 · 15 sept, 23:40 (hora de Lima)",
          "message": "No separamos a los pasajeros automáticamente. No hay asientos suficientes para todo tu grupo."
        }
      },
      {
        "optionId": "O3",
        "kind": "REFUND",
        "eligibility": "REQUIRES_REVIEW",
        "reasonCodes": [
          "REFUND_REQUIRES_REVIEW",
          "LOW_CONFIDENCE"
        ],
        "message": {
          "code": "OPTION_REFUND_REQUIRES_REVIEW",
          "title": "Reembolso",
          "message": "La posibilidad de un reembolso debe revisarse; no podemos asegurar que se otorgue. La información disponible sobre esta opción es limitada."
        }
      }
    ]
  },
  "actions": {
    "executed": [],
    "recommended": [
      "HUMAN_REVIEW"
    ]
  },
  "warnings": [
    {
      "code": "SOURCE_CONFLICT_RESOLVED",
      "title": "Datos contrastados",
      "message": "Se pudieron verificar datos operativos que no coincidían entre sí."
    },
    {
      "code": "FARE_CONDITIONS_INCOMPLETE",
      "title": "Condiciones de tarifa incompletas",
      "message": "No se han verificado todas las condiciones de cambio de tu tarifa."
    }
  ],
  "metadata": {
    "assessedAt": "2026-09-15T11:02:40Z",
    "locale": "es",
    "policyRefs": [
      {
        "id": "POL-DELAY-2026-03",
        "version": "2026.03"
      }
    ],
    "mode": "SIMULATION",
    "dataSnapshot": "historical-fixture",
    "notice": {
      "code": "SIMULATION_MODE",
      "title": "Datos de demostración",
      "message": "Esta evaluación usa datos sintéticos históricos y no refleja información operacional en tiempo real."
    }
  }
}
```

#### DEMO01

```json
{
  "requestId": "req_02",
  "assessmentStatus": "COMPLETE",
  "disruption": {
    "severity": "NONE",
    "summary": {
      "code": "DISRUPTION_NONE",
      "title": "Tu viaje no presenta alteraciones verificadas",
      "message": "No hay alteraciones verificadas en tu viaje."
    },
    "events": [
      {
        "segmentId": "DEMO01-S1",
        "flightNumber": "LA501",
        "origin": {
          "code": "SCL",
          "timeZone": "America/Santiago"
        },
        "destination": {
          "code": "LIM",
          "timeZone": "America/Lima"
        },
        "scheduledDeparture": {
          "local": "2026-09-15T14:30:00-03:00",
          "timeZone": "America/Santiago",
          "utc": "2026-09-15T17:30:00Z"
        },
        "scheduledArrival": {
          "local": "2026-09-15T17:55:00-05:00",
          "timeZone": "America/Lima",
          "utc": "2026-09-15T22:55:00Z"
        },
        "flightStatus": "ON_TIME",
        "severity": "NONE",
        "delay": {
          "status": "NOT_DELAYED"
        },
        "gate": {
          "status": "UNKNOWN",
          "reason": "UNAVAILABLE"
        },
        "message": {
          "code": "FLIGHT_ON_TIME",
          "title": "Tu vuelo LA501 está en horario",
          "message": "No hay retrasos informados para el vuelo LA501. Aún no hay información verificada sobre la puerta de embarque."
        }
      }
    ]
  },
  "connection": null,
  "policies": {
    "available": true,
    "policyId": "POL-DELAY-2026-03",
    "version": "2026.03",
    "validity": "VALID",
    "evaluations": [
      {
        "rule": "R1",
        "benefit": "REBOOK_NO_FEE",
        "status": "NOT_APPLICABLE"
      },
      {
        "rule": "R2",
        "benefit": "MEAL_VOUCHER",
        "status": "NOT_APPLICABLE"
      },
      {
        "rule": "R3",
        "benefit": "REBOOK_NO_FEE",
        "status": "NOT_APPLICABLE"
      },
      {
        "rule": "R4",
        "benefit": "CASH_COMPENSATION",
        "status": "NOT_APPLICABLE"
      },
      {
        "rule": "R5",
        "benefit": "PRIORITY_HANDLING",
        "status": "NOT_APPLICABLE"
      }
    ]
  },
  "recommendation": {
    "type": "NO_ACTION_REQUIRED",
    "priority": "LOW",
    "reasonCodes": [],
    "message": {
      "code": "RECOMMENDATION_NO_ACTION",
      "title": "No necesitas hacer nada por ahora",
      "message": "Tu vuelo está en horario según la información verificada.",
      "nextSteps": [
        "Revisa el estado de tu vuelo antes de salir al aeropuerto: la información puede cambiar."
      ]
    }
  },
  "alternatives": {
    "status": "NOT_REQUIRED"
  },
  "actions": {
    "executed": [],
    "recommended": [
      "NO_ACTION_REQUIRED"
    ]
  },
  "warnings": [],
  "metadata": {
    "assessedAt": "2026-09-15T11:02:40Z",
    "locale": "es",
    "policyRefs": [
      {
        "id": "POL-DELAY-2026-03",
        "version": "2026.03"
      }
    ],
    "mode": "SIMULATION",
    "dataSnapshot": "historical-fixture",
    "notice": {
      "code": "SIMULATION_MODE",
      "title": "Datos de demostración",
      "message": "Esta evaluación usa datos sintéticos históricos y no refleja información operacional en tiempo real."
    }
  }
}
```

#### DEMO02

```json
{
  "requestId": "req_03",
  "assessmentStatus": "COMPLETE",
  "disruption": {
    "severity": "WARNING",
    "summary": {
      "code": "DISRUPTION_RELEVANT",
      "title": "Tu viaje tiene una alteración relevante",
      "message": "Revisa los datos de tu viaje. Tu vuelo LA502 tiene un retraso confirmado de 190 minutos."
    },
    "events": [
      {
        "segmentId": "DEMO02-S1",
        "flightNumber": "LA502",
        "origin": {
          "code": "SCL",
          "timeZone": "America/Santiago"
        },
        "destination": {
          "code": "LIM",
          "timeZone": "America/Lima"
        },
        "scheduledDeparture": {
          "local": "2026-09-15T14:30:00-03:00",
          "timeZone": "America/Santiago",
          "utc": "2026-09-15T17:30:00Z"
        },
        "scheduledArrival": {
          "local": "2026-09-15T17:55:00-05:00",
          "timeZone": "America/Lima",
          "utc": "2026-09-15T22:55:00Z"
        },
        "flightStatus": "DELAYED",
        "severity": "WARNING",
        "delay": {
          "status": "CONFIRMED",
          "minutes": 190
        },
        "estimatedDeparture": {
          "local": "2026-09-15T17:40:00-03:00",
          "timeZone": "America/Santiago",
          "utc": "2026-09-15T20:40:00Z"
        },
        "gate": {
          "status": "UNKNOWN",
          "reason": "UNAVAILABLE"
        },
        "message": {
          "code": "FLIGHT_DELAYED_CONFIRMED",
          "title": "Tu vuelo LA502 está retrasado",
          "message": "El retraso confirmado para el vuelo LA502 es de 190 minutos. Su hora estimada de salida es 17:40 (hora de Santiago)."
        }
      }
    ]
  },
  "connection": null,
  "policies": {
    "available": true,
    "policyId": "POL-DELAY-2026-03",
    "version": "2026.03",
    "validity": "VALID",
    "evaluations": [
      {
        "rule": "R1",
        "benefit": "REBOOK_NO_FEE",
        "status": "APPLICABLE"
      },
      {
        "rule": "R2",
        "benefit": "MEAL_VOUCHER",
        "status": "NOT_APPLICABLE"
      },
      {
        "rule": "R3",
        "benefit": "REBOOK_NO_FEE",
        "status": "NOT_APPLICABLE"
      },
      {
        "rule": "R4",
        "benefit": "CASH_COMPENSATION",
        "status": "NOT_APPLICABLE"
      },
      {
        "rule": "R5",
        "benefit": "PRIORITY_HANDLING",
        "status": "NOT_APPLICABLE"
      }
    ]
  },
  "recommendation": {
    "type": "REVIEW_REBOOKING_OPTIONS",
    "priority": "NORMAL",
    "reasonCodes": [],
    "message": {
      "code": "RECOMMENDATION_REVIEW_OPTIONS",
      "title": "Revisa tus opciones de cambio de vuelo",
      "message": "Con un retraso confirmado de 190 minutos, la política aplicable contempla un cambio de vuelo sin penalidad, sujeto a la confirmación de un agente. Hay opciones que cumplen las condiciones verificadas de la evaluación. Esto es una recomendación: no hemos modificado tu reserva.",
      "nextSteps": [
        "Revisa las opciones propuestas y confirma los detalles con un agente de la aerolínea."
      ]
    }
  },
  "alternatives": {
    "status": "EVALUATED",
    "options": [
      {
        "optionId": "DEMO02-O1",
        "kind": "FLIGHT",
        "flightNumber": "LA1001",
        "departure": {
          "local": "2026-09-15T20:30:00-03:00",
          "timeZone": "America/Santiago",
          "utc": "2026-09-15T23:30:00Z"
        },
        "eligibility": "ELIGIBLE",
        "reasonCodes": [],
        "message": {
          "code": "OPTION_ELIGIBLE",
          "title": "Vuelo LA1001 · 15 sept, 20:30 (hora de Santiago)",
          "message": "Esta opción cumple las condiciones verificadas para todo tu grupo. No está reservada: un agente debe confirmar que sigue disponible antes de cualquier cambio."
        }
      }
    ]
  },
  "actions": {
    "executed": [],
    "recommended": [
      "REVIEW_REBOOKING_OPTIONS"
    ]
  },
  "warnings": [],
  "metadata": {
    "assessedAt": "2026-09-15T11:02:40Z",
    "locale": "es",
    "policyRefs": [
      {
        "id": "POL-DELAY-2026-03",
        "version": "2026.03"
      }
    ],
    "mode": "SIMULATION",
    "dataSnapshot": "historical-fixture",
    "notice": {
      "code": "SIMULATION_MODE",
      "title": "Datos de demostración",
      "message": "Esta evaluación usa datos sintéticos históricos y no refleja información operacional en tiempo real."
    }
  }
}
```
