import type { AssessmentConfig } from "./config.js";
import type { FlightStatusFacts, Resolved, Severity } from "./model.js";

/**
 * D01 → A07 severity of one segment. Unresolved data is UNKNOWN, never NONE: absence of
 * information is not absence of disruption (D10). Gate and airport changes are out of V1 scope.
 */
export function classifySegment(
  status: Resolved<FlightStatusFacts>,
  compromisesConnection: boolean,
  config: AssessmentConfig,
): Severity {
  if (status.kind === "UNRESOLVED") return "UNKNOWN";
  const { status: flightStatus, delayMinutes } = status.value;
  switch (flightStatus) {
    case "CANCELLED":
      return "CRITICAL";
    case "DELAYED":
      if (delayMinutes === undefined) return "UNKNOWN";
      return delayMinutes >= config.relevantDelayMinutes || compromisesConnection
        ? "WARNING"
        : "INFO";
    case "ON_TIME":
    case "SCHEDULED":
      return "NONE";
    case "UNKNOWN":
      return "UNKNOWN";
  }
}

const RANK: Record<Severity, number> = { NONE: 0, INFO: 1, WARNING: 2, UNKNOWN: 3, CRITICAL: 4 };

/** A verified critical finding dominates; otherwise an unknown outranks verified lower severities. */
export function aggregateSeverity(severities: readonly Severity[]): Severity {
  return severities.reduce<Severity>((acc, s) => (RANK[s] > RANK[acc] ? s : acc), "NONE");
}
