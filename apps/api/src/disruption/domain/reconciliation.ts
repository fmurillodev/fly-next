import type { AssessmentConfig } from "./config.js";
import type {
  Contradiction,
  EventField,
  FlightStatusEvent,
  FlightStatusFacts,
  GateEvent,
  Instant,
  OperationalEvent,
  Resolved,
  ResolutionBasis,
  SourceId,
  SourceStatus,
} from "./model.js";
import { isWithinMinutes } from "./time.js";

/**
 * D02 authority per information type. An unvalidated integration assumption (awaits Operations/Data):
 * OPS_CORE for statuses and operational times, AIRPORT_FEED for gates, everything else is secondary.
 */
const PRIMARY_SOURCE: Record<EventField, SourceId> = {
  FLIGHT_STATUS: "OPS_CORE",
  GATE: "AIRPORT_FEED",
};

export interface SegmentReconciliation {
  readonly status: Resolved<FlightStatusFacts>;
  readonly gate: Resolved<string>;
  readonly contradictions: readonly Contradiction[];
}

interface Candidate<T> {
  readonly eventId: string;
  readonly source: SourceId;
  readonly recordedAt: Instant;
  readonly value: T;
}

function statusFacts(event: FlightStatusEvent, now: Instant): FlightStatusFacts {
  const latestActual = Math.min(event.recordedAt, now);
  return {
    status: event.status,
    ...(event.delayMinutes === undefined ? {} : { delayMinutes: event.delayMinutes }),
    ...(event.estimatedDeparture === undefined
      ? {}
      : { estimatedDeparture: event.estimatedDeparture }),
    ...(event.actualDeparture !== undefined && event.actualDeparture <= latestActual
      ? { actualDeparture: event.actualDeparture }
      : {}),
    ...(event.actualArrival !== undefined && event.actualArrival <= latestActual
      ? { actualArrival: event.actualArrival }
      : {}),
  };
}

const sameFacts = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function resolveField<T>(
  field: EventField,
  segmentId: string,
  candidates: readonly Candidate<T>[],
  sourceStatus: Readonly<Record<SourceId, SourceStatus>>,
  now: Instant,
  windowMinutes: number,
): { resolved: Resolved<T>; contradictions: Contradiction[] } {
  if (candidates.length === 0) {
    return { resolved: { kind: "UNRESOLVED", reason: "NO_DATA" }, contradictions: [] };
  }
  const fresh = candidates.filter((c) => isWithinMinutes(c.recordedAt, now, windowMinutes));
  if (fresh.length === 0) {
    return { resolved: { kind: "UNRESOLVED", reason: "STALE_DATA" }, contradictions: [] };
  }

  const unresolved = (): { resolved: Resolved<T>; contradictions: Contradiction[] } => ({
    resolved: { kind: "UNRESOLVED", reason: "CONTRADICTION" },
    contradictions: [
      { segmentId, field, eventIds: fresh.map((c) => c.eventId), outcome: "UNRESOLVED" },
    ],
  });
  const latestOf = (group: readonly Candidate<T>[]): Candidate<T> | "TIE" => {
    const newest = Math.max(...group.map((c) => c.recordedAt));
    const atNewest = group.filter((c) => c.recordedAt === newest);
    const [first] = atNewest;
    if (!first) return "TIE";
    return atNewest.every((c) => sameFacts(c.value, first.value)) ? first : "TIE";
  };

  const grounding = fresh.filter((c) => sourceStatus[c.source] === "OPERATIONAL");
  const primaryGrounding = grounding.filter((c) => c.source === PRIMARY_SOURCE[field]);
  const secondaryGrounding = grounding.filter((c) => c.source !== PRIMARY_SOURCE[field]);

  let basis: ResolutionBasis;
  let winner: Candidate<T> | "TIE";
  if (primaryGrounding.length > 0) {
    basis = "PRIMARY_SOURCE";
    winner = latestOf(primaryGrounding);
  } else if (secondaryGrounding.length > 0) {
    basis = "SECONDARY_SOURCE";
    winner = latestOf(secondaryGrounding);
  } else {
    // Only degraded sources remain: information exists but cannot ground a decision (D02).
    return { resolved: { kind: "UNRESOLVED", reason: "DEGRADED_SOURCE_ONLY" }, contradictions: [] };
  }
  if (winner === "TIE") return unresolved();

  const dissenting = fresh.filter((c) => !sameFacts(c.value, winner.value));
  if (dissenting.length === 0) {
    return { resolved: resolvedFrom(winner, basis), contradictions: [] };
  }
  // Without a non-degraded primary source nothing may settle a disagreement (D02).
  if (basis === "SECONDARY_SOURCE") return unresolved();
  return {
    resolved: resolvedFrom(winner, basis),
    contradictions: [
      {
        segmentId,
        field,
        eventIds: [winner.eventId, ...dissenting.map((c) => c.eventId)],
        outcome: "RESOLVED_BY_AUTHORITY",
      },
    ],
  };
}

const resolvedFrom = <T>(winner: Candidate<T>, basis: ResolutionBasis): Resolved<T> => ({
  kind: "RESOLVED",
  value: winner.value,
  basis,
  eventId: winner.eventId,
  recordedAt: winner.recordedAt,
});

/** Reconciles the operational events of one segment, field by field (D02, D03). Pure. */
export function reconcileSegment(
  segmentId: string,
  events: readonly OperationalEvent[],
  sourceStatus: Readonly<Record<SourceId, SourceStatus>>,
  now: Instant,
  config: AssessmentConfig,
): SegmentReconciliation {
  const own = events.filter((event) => event.segmentId === segmentId);
  const statusCandidates = own
    .filter((e): e is FlightStatusEvent => e.kind === "FLIGHT_STATUS")
    .map((e) => ({
      eventId: e.id,
      source: e.source,
      recordedAt: e.recordedAt,
      value: statusFacts(e, now),
    }));
  const gateCandidates = own
    .filter((e): e is GateEvent => e.kind === "GATE")
    .map((e) => ({ eventId: e.id, source: e.source, recordedAt: e.recordedAt, value: e.gate }));

  const status = resolveField(
    "FLIGHT_STATUS",
    segmentId,
    statusCandidates,
    sourceStatus,
    now,
    config.freshness.operationalEventMinutes,
  );
  const gate = resolveField(
    "GATE",
    segmentId,
    gateCandidates,
    sourceStatus,
    now,
    config.freshness.gateMinutes,
  );
  return {
    status: status.resolved,
    gate: gate.resolved,
    contradictions: [...status.contradictions, ...gate.contradictions],
  };
}
