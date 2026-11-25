import type { AlternativeOption } from "../domain/alternatives.js";
import {
  evaluateAlternatives,
  type AlternativeContext,
  type AlternativeEvaluation,
  type ReachabilityPoint,
} from "../domain/alternatives.js";
import { aggregateSeverity, classifySegment } from "../domain/classification.js";
import { DEFAULT_ASSESSMENT_CONFIG, type AssessmentConfig } from "../domain/config.js";
import { evaluateConnection, type ConnectionAssessment } from "../domain/connection.js";
import type {
  AssessmentStatus,
  Contradiction,
  FlightStatus,
  FlightStatusFacts,
  Instant,
  PassengerGroup,
  ProviderFailure,
  Resolved,
  Severity,
  TraceEntry,
  UnresolvedReason,
} from "../domain/model.js";
import type {
  Clock,
  EligibleOptionsProvider,
  OperationalEventsProvider,
  PolicyRulesProvider,
  TripContextProvider,
} from "../domain/ports.js";
import { evaluatePolicies, summarizeDelays, type PolicyEvaluation } from "../domain/policies.js";
import { reconcileSegment, type SegmentReconciliation } from "../domain/reconciliation.js";
import {
  determineAssessmentStatus,
  recommend,
  type AlternativesOutcome,
  type DecisionInput,
  type Recommendation,
} from "../domain/recommendation.js";
import { isWithinMinutes } from "../domain/time.js";

export interface AssessDisruptionDeps {
  readonly trips: TripContextProvider;
  readonly events: OperationalEventsProvider;
  readonly policies: PolicyRulesProvider;
  readonly options: EligibleOptionsProvider;
  readonly clock: Clock;
  readonly config?: AssessmentConfig;
}

export type AssessmentErrorCode =
  | "BOOKING_NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT"
  | "INVALID_UPSTREAM_RESPONSE"
  | "STALE_BOOKING_CONTEXT";

export type DelayInfo =
  | { readonly kind: "CONFIRMED" | "UNCONFIRMED"; readonly minutes: number }
  | { readonly kind: "NOT_DELAYED" | "UNKNOWN" };

export interface SegmentAssessment {
  readonly segmentId: string;
  readonly flightNumber: string;
  readonly flightStatus: FlightStatus;
  readonly severity: Severity;
  readonly delay: DelayInfo;
  readonly estimatedDeparture?: Instant;
  readonly gate:
    | { readonly kind: "KNOWN"; readonly value: string }
    | { readonly kind: "UNKNOWN"; readonly reason: UnresolvedReason };
}

export type PolicySection =
  | { readonly available: false; readonly failure: ProviderFailure }
  | ({ readonly available: true } & PolicyEvaluation);

export type WarningCode =
  | "SOURCE_CONFLICT_RESOLVED"
  | "SOURCE_CONFLICT_UNRESOLVED"
  | "OPERATIONAL_DATA_STALE"
  | "OPERATIONAL_DATA_UNAVAILABLE"
  | "DEGRADED_SOURCE_LIMITED"
  | "SECONDARY_SOURCE_ONLY"
  | "FARE_CONDITIONS_INCOMPLETE"
  | "POLICIES_UNAVAILABLE"
  | "POLICY_NOT_VALID"
  | "ALTERNATIVES_UNAVAILABLE";

/** Internal result: public DTOs are built from it by allowlist mappers (A05), never serialized directly. */
export interface DisruptionAssessment {
  readonly bookingId: string;
  readonly assessedAt: Instant;
  readonly mode: Clock["mode"];
  readonly assessmentStatus: AssessmentStatus;
  readonly severity: Severity;
  readonly group: PassengerGroup;
  readonly segments: readonly SegmentAssessment[];
  readonly connection: ConnectionAssessment | null;
  readonly connections: readonly ConnectionAssessment[];
  readonly policies: PolicySection;
  readonly alternatives: AlternativesOutcome;
  readonly recommendation: Recommendation;
  /** V1 never executes anything (D07): `executed` is always empty. */
  readonly actions: {
    readonly executed: readonly never[];
    readonly recommended: readonly Recommendation["type"][];
  };
  readonly warnings: readonly WarningCode[];
  readonly decisionTrace: readonly TraceEntry[];
}

export type AssessmentResult =
  | { readonly ok: true; readonly assessment: DisruptionAssessment }
  | { readonly ok: false; readonly error: { readonly code: AssessmentErrorCode } };

const BOOKING_ERROR: Record<ProviderFailure, AssessmentErrorCode> = {
  NOT_FOUND: "BOOKING_NOT_FOUND",
  UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  TIMEOUT: "UPSTREAM_TIMEOUT",
  INVALID_RESPONSE: "INVALID_UPSTREAM_RESPONSE",
};
const CONNECTION_RANK = { SAFE: 0, UNKNOWN: 1, AT_RISK: 2, MISSED: 3 } as const;
const PROVIDER_FAILED: SegmentReconciliation = {
  status: { kind: "UNRESOLVED", reason: "PROVIDER_FAILURE" },
  gate: { kind: "UNRESOLVED", reason: "PROVIDER_FAILURE" },
  contradictions: [],
};

function delayOf(status: Resolved<FlightStatusFacts>): DelayInfo {
  if (status.kind === "UNRESOLVED") return { kind: "UNKNOWN" };
  const primary = status.basis === "PRIMARY_SOURCE";
  if (status.value.status === "DELAYED" && status.value.delayMinutes !== undefined) {
    return { kind: primary ? "CONFIRMED" : "UNCONFIRMED", minutes: status.value.delayMinutes };
  }
  if (status.value.status === "ON_TIME" || status.value.status === "SCHEDULED") {
    return primary ? { kind: "NOT_DELAYED" } : { kind: "UNKNOWN" };
  }
  return { kind: "UNKNOWN" };
}

/**
 * Orchestrates one read-only assessment (D01–D10). Expected provider failures degrade the result or
 * map to an error code; thrown exceptions are bugs and propagate untouched.
 */
export function createAssessDisruption(deps: AssessDisruptionDeps) {
  const config = deps.config ?? DEFAULT_ASSESSMENT_CONFIG;

  return async function assessDisruption(bookingId: string): Promise<AssessmentResult> {
    const tripResult = await deps.trips.getTripContext(bookingId);
    if (!tripResult.ok) return { ok: false, error: { code: BOOKING_ERROR[tripResult.failure] } };
    const trip = tripResult.value;
    const now = deps.clock.now();
    if (!isWithinMinutes(trip.retrievedAt, now, config.freshness.bookingContextMinutes)) {
      return { ok: false, error: { code: "STALE_BOOKING_CONTEXT" } };
    }

    // Independent reads start together; alternatives depend on the disruption and come later.
    const [eventsResult, policyResult] = await Promise.all([
      deps.events.getOperationalEvents(trip.segments.map((s) => s.id)),
      deps.policies.getPolicyRules({ type: "FLIGHT_DISRUPTION" }),
    ]);

    const trace: TraceEntry[] = [];
    const warnings = new Set<WarningCode>();
    if (!eventsResult.ok) {
      warnings.add("OPERATIONAL_DATA_UNAVAILABLE");
      trace.push({
        step: "DEGRADATION",
        refs: ["events"],
        decision: "EVENTS_UNAVAILABLE",
        reasonCode: eventsResult.failure,
      });
    }

    const reconciled = trip.segments.map((segment) => ({
      segment,
      rec: eventsResult.ok
        ? reconcileSegment(
            segment.id,
            eventsResult.value.events,
            eventsResult.value.sourceStatus,
            now,
            config,
          )
        : PROVIDER_FAILED,
    }));

    for (const { segment, rec } of reconciled) {
      for (const c of rec.contradictions) trace.push(contradictionTrace(c));
      for (const [field, value] of [
        ["status", rec.status],
        ["gate", rec.gate],
      ] as const) {
        if (value.kind === "UNRESOLVED") {
          trace.push({
            step: "FRESHNESS",
            refs: [segment.id, field],
            decision: "UNRESOLVED",
            reasonCode: value.reason,
          });
          if (value.reason === "STALE_DATA") warnings.add("OPERATIONAL_DATA_STALE");
          if (value.reason === "DEGRADED_SOURCE_ONLY") warnings.add("DEGRADED_SOURCE_LIMITED");
          if (value.reason === "CONTRADICTION") warnings.add("SOURCE_CONFLICT_UNRESOLVED");
        } else {
          trace.push({
            step: "RECONCILIATION",
            refs: [segment.id, field, value.eventId],
            decision: value.basis,
          });
        }
      }
      for (const c of rec.contradictions) {
        warnings.add(
          c.outcome === "UNRESOLVED" ? "SOURCE_CONFLICT_UNRESOLVED" : "SOURCE_CONFLICT_RESOLVED",
        );
      }
    }

    const connections: ConnectionAssessment[] = [];
    for (let i = 0; i + 1 < reconciled.length; i++) {
      const [from, to] = [reconciled[i], reconciled[i + 1]];
      if (!from || !to) continue;
      const c = evaluateConnection(
        { segment: from.segment, status: from.rec.status },
        { segment: to.segment, status: to.rec.status },
      );
      connections.push(c);
      trace.push({
        step: "CONNECTION",
        refs: [c.fromSegmentId, c.toSegmentId],
        decision: c.status,
        reasonCode: c.lossConfirmation,
      });
    }
    const connection = connections.reduce<ConnectionAssessment | null>(
      (worst, c) =>
        worst === null || CONNECTION_RANK[c.status] > CONNECTION_RANK[worst.status] ? c : worst,
      null,
    );
    const compromised = new Set(
      connections
        .filter((c) => c.status === "AT_RISK" || c.status === "MISSED")
        .flatMap((c) => [c.fromSegmentId, c.toSegmentId]),
    );

    const segments = reconciled.map(({ segment, rec }): SegmentAssessment => {
      const facts = rec.status.kind === "RESOLVED" ? rec.status.value : undefined;
      const severity = classifySegment(rec.status, compromised.has(segment.id), config);
      trace.push({ step: "CLASSIFICATION", refs: [segment.id], decision: severity });
      return {
        segmentId: segment.id,
        flightNumber: segment.flightNumber,
        flightStatus: facts?.status ?? "UNKNOWN",
        severity,
        delay: delayOf(rec.status),
        ...(facts?.estimatedDeparture === undefined
          ? {}
          : { estimatedDeparture: facts.estimatedDeparture }),
        gate:
          rec.gate.kind === "RESOLVED"
            ? { kind: "KNOWN", value: rec.gate.value }
            : { kind: "UNKNOWN", reason: rec.gate.reason },
      };
    });
    const severity = aggregateSeverity([
      ...segments.map((s) => s.severity),
      ...connections.map((c): Severity =>
        c.status === "AT_RISK" || c.status === "MISSED" ? "CRITICAL" : "NONE",
      ),
    ]);

    let policies: PolicySection;
    if (!policyResult.ok) {
      policies = { available: false, failure: policyResult.failure };
      warnings.add("POLICIES_UNAVAILABLE");
      trace.push({
        step: "DEGRADATION",
        refs: ["policies"],
        decision: "POLICIES_UNAVAILABLE",
        reasonCode: policyResult.failure,
      });
    } else {
      const evaluation = evaluatePolicies(
        policyResult.value,
        {
          delay: summarizeDelays(reconciled.map((r) => r.rec.status)),
          international: trip.international,
          connection,
          compensationRequest: trip.compensationRequest,
          includesMinor: trip.group.includesMinor,
          severity,
        },
        now,
      );
      policies = { available: true, ...evaluation };
      if (evaluation.validity !== "VALID") warnings.add("POLICY_NOT_VALID");
      trace.push({
        step: "POLICY",
        refs: [evaluation.policyId, evaluation.version],
        decision: evaluation.validity,
      });
      for (const e of evaluation.evaluations) {
        trace.push({
          step: "POLICY",
          refs: [evaluation.policyId, e.ruleId],
          decision: e.status,
          reasonCode: e.reasonCode,
        });
      }
    }

    const fareIncomplete =
      trip.fare.changesAllowed === "UNKNOWN" || trip.fare.changePenalty.kind === "UNKNOWN";
    if (fareIncomplete) warnings.add("FARE_CONDITIONS_INCOMPLETE");

    let alternatives: AlternativesOutcome = { kind: "NOT_REQUIRED" };
    if (severity === "WARNING" || severity === "CRITICAL") {
      const optionsResult = await deps.options.getEligibleOptions(trip);
      if (!optionsResult.ok) {
        alternatives = { kind: "UNAVAILABLE", failure: optionsResult.failure };
        warnings.add("ALTERNATIVES_UNAVAILABLE");
        trace.push({
          step: "DEGRADATION",
          refs: ["alternatives"],
          decision: "ALTERNATIVES_UNAVAILABLE",
          reasonCode: optionsResult.failure,
        });
      } else {
        const options: AlternativeEvaluation[] = evaluateAlternatives(
          optionsResult.value as readonly AlternativeOption[],
          alternativeContext(trip, connections, policies, now),
        );
        alternatives = { kind: "EVALUATED", options };
        for (const o of options) {
          trace.push({
            step: "ALTERNATIVE",
            refs: [o.optionId],
            decision: o.eligibility,
            reasonCode: o.reasonCodes.join(","),
          });
        }
      }
    }

    const hasUnconfirmedFacts = reconciled.some(
      (r) => r.rec.status.kind === "RESOLVED" && r.rec.status.basis === "SECONDARY_SOURCE",
    );
    if (hasUnconfirmedFacts) warnings.add("SECONDARY_SOURCE_ONLY");

    const decision: DecisionInput = {
      severity,
      connection,
      policies,
      alternatives,
      includesMinor: trip.group.includesMinor,
      fareIncomplete,
      hasUnconfirmedFacts,
    };
    const assessmentStatus = determineAssessmentStatus(decision);
    const recommendation = recommend(decision);
    trace.push({
      step: "RECOMMENDATION",
      refs: [bookingId],
      decision: `${assessmentStatus}/${recommendation.type}/${recommendation.priority}`,
      reasonCode: recommendation.reasonCodes.join(","),
    });

    return {
      ok: true,
      assessment: {
        bookingId: trip.bookingId,
        assessedAt: now,
        mode: deps.clock.mode,
        assessmentStatus,
        severity,
        group: trip.group,
        segments,
        connection,
        connections,
        policies,
        alternatives,
        recommendation,
        actions: { executed: [], recommended: [recommendation.type] },
        warnings: [...warnings],
        decisionTrace: trace,
      },
    };
  };
}

const contradictionTrace = (c: Contradiction): TraceEntry => ({
  step: "RECONCILIATION",
  refs: [c.segmentId, c.field, ...c.eventIds],
  decision: c.outcome,
  reasonCode:
    c.outcome === "UNRESOLVED" ? "SOURCE_CONFLICT_UNRESOLVED" : "SOURCE_CONFLICT_RESOLVED",
});

function alternativeContext(
  trip: Parameters<EligibleOptionsProvider["getEligibleOptions"]>[0],
  connections: readonly ConnectionAssessment[],
  policies: PolicySection,
  now: Instant,
): AlternativeContext {
  const first = trip.segments[0];
  const last = trip.segments[trip.segments.length - 1];
  const reachability: ReachabilityPoint[] = first
    ? [{ airportCode: first.origin.code, availableFrom: now, confirmed: true }]
    : [];
  for (const c of connections) {
    const inbound = trip.segments.find((s) => s.id === c.fromSegmentId);
    if (inbound && c.inboundArrival) {
      reachability.push({
        airportCode: inbound.destination.code,
        availableFrom: c.inboundArrival.at,
        confirmed: c.inboundArrival.confirmed,
      });
    }
  }
  return {
    now,
    groupSize: trip.group.size,
    fare: trip.fare,
    finalDestinationCode: last?.destination.code ?? "",
    reachability,
    rebookingAuthorized:
      policies.available &&
      policies.validity === "VALID" &&
      policies.evaluations.some(
        (e) => (e.ruleId === "R1" || e.ruleId === "R3") && e.status === "APPLICABLE",
      ),
  };
}
