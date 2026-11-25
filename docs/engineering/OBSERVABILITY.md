# FlyNext — Observability

FlyNext is a read-only demo with synthetic historical fixtures. Operational logs are off by default (`LOG_LEVEL=silent`). Set `LOG_LEVEL=info` to see request, provider and assessment events; `LOG_LEVEL=warn` retains warnings and errors. Fixed startup and shutdown failure records go to stderr even in silent mode. Log levels control visibility, not the category of an event.

| Category | Stable event | Allowlisted fields and purpose |
| --- | --- | --- |
| `METRIC` | `http.assessment` | `status`, `durationMs`: total assessment HTTP latency, including rejected requests. |
| `METRIC` | `assessment.process` | `durationMs`: validated requests, including orchestration and DTO mapping. |
| `METRIC` | `provider.read` | `provider` (`trips`, `events`, `policies`, `options`), `outcome` (`OK`, `FAILED`, `THREW`), `durationMs`: dependency latency and outcome. |
| `METRIC` | `service.ready`, `service.stopping` | Lifecycle without addresses, config or environment values. |
| `DATA` | `assessment.data_quality` | Public warning `warning`; covers source conflicts, stale or unavailable operational data, and other degraded evidence. No source or record identifiers. |
| `DATA` | `assessment.booking_stale` | Internal code `STALE_BOOKING_CONTEXT`; the response uses public `INVALID_UPSTREAM_RESPONSE` (502). |
| `BUSINESS` | `assessment.completed` | `assessmentStatus`, `severity`, `connectionStatus`, `recommendation`, `priority`: distinguish partial results and human-review recommendations from failures. |
| `ERROR` | `provider.failed` | `provider`, `failure`: normalized expected failure, excluding ordinary unknown booking lookups. |
| `ERROR` | `assessment.failed`, `http.unexpected_failure` | `code`; `assessment.failed` also includes the fixed `stage` (`ASSESSMENT`, `PRESENTATION`, `DTO_VALIDATION`). No exception contents. |
| `ERROR` | `service.startup_failed`, `service.shutdown_failed` | Fixed lifecycle failures without exception contents. |
| `ALERT` | `http.assessment_rate_limited` | The assessment was throttled; no IP in the log. This is a log category, not an active alert. |

## Diagnosis

- Take the server-generated `X-Request-Id` from an assessment response and filter the logs by `requestId`. Ignore any ID the caller sent. Lifecycle events have no request ID.
- For a slow assessment, compare total HTTP and assessment processing times and inspect provider timings. Events and policy reads can overlap; their durations are not additive.
- For HTTP 200 with uncertainty, inspect `assessment.completed`, then `assessment.data_quality` and `provider.failed`. An events failure can produce `INDETERMINATE`; missing policies or alternatives can produce `PARTIAL`. Neither implies there was no disruption or that a benefit was granted.
- For a 502, distinguish malformed booking data from a stale booking using `provider.failed` and `assessment.booking_stale`. For a 500, use the fixed failure stage and look for `provider.read` with `outcome=THREW`. Do not turn on raw payload or stack logging to diagnose an incident.
- For 429s, check `Retry-After`, instance volume and whether a trusted deployment proxy causes multiple callers to share the same peer IP.

## Demo limitations and future metrics

The assessment body cap is 1,024 bytes. `RATE_LIMIT_MAX` accepts integers from 1 to 10,000 (default 60 requests per 60-second window per direct peer IP). Proxy trust is disabled; forwarding headers do not affect rate limits. The instance-local counter tracks at most 4,096 IPs per window; new IPs are rejected if the table is full. This is not a distributed limit or an authentication mechanism. A proxy or NAT can group unrelated callers into one bucket. Only ABC123, DEMO01 and DEMO02 are publicly assessable. Never submit real booking identifiers or personal data. Logs exclude booking IDs, IPs, raw URLs, headers, bodies, trace refs, payloads, credentials and passenger attributes.

Future work: aggregate latency percentiles, HTTP and provider error rates, 429 rates, freshness and conflict rates, shares of `PARTIAL`/`INDETERMINATE` and `HUMAN_REVIEW`, and passenger outcomes if collected safely. Consider alerting on sustained latency regressions, provider failure or staleness spikes, elevated internal errors, and prolonged throttling. V1 does not aggregate these metrics, expose an internal metrics endpoint, run active alerts, or measure product impact.
