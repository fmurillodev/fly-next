import type { AssessmentResponse } from "@flynext/contracts";
import type { DisruptionAssessment, SegmentAssessment } from "../application/assess-disruption.js";
import type { Instant } from "../domain/model.js";
import { addMinutes, utcOffsetMinutes } from "../domain/time.js";
import { alternativeReasons, spanishLocale, warnings } from "./messages.es.js";
import { PassengerMessageComposer } from "./passenger-message-composer.js";

type Event = AssessmentResponse["disruption"]["events"][number];
type UnknownReason = Extract<Event["gate"], { status: "UNKNOWN" }>["reason"];
type RecommendationReason = AssessmentResponse["recommendation"]["reasonCodes"][number];

const recommendationReasons = {
  CONNECTION_AT_RISK: "CONNECTION_AT_RISK",
  CONNECTION_MISSED: "CONNECTION_MISSED",
  CONNECTION_UNKNOWN: "CONNECTION_UNKNOWN",
  GROUP_INCLUDES_MINOR: "PRIORITY_REVIEW_REQUIRED",
  COMPENSATION_REQUESTED: "COMPENSATION_REQUESTED",
  INCOMPLETE_FARE_CONDITIONS: "INCOMPLETE_FARE_CONDITIONS",
  POLICY_UNVERIFIED: "POLICY_UNVERIFIED",
  ALTERNATIVES_UNAVAILABLE: "ALTERNATIVES_UNAVAILABLE",
  OPERATIONAL_DATA_UNRESOLVED: "OPERATIONAL_DATA_UNRESOLVED",
  NO_VERIFIED_ALTERNATIVE: "NO_VERIFIED_ALTERNATIVE",
} satisfies Record<
  Exclude<RecommendationReason, "PRIORITY_REVIEW_REQUIRED"> | "GROUP_INCLUDES_MINOR",
  RecommendationReason
>;

const ownKey = <T extends object>(catalog: T, key: string): key is keyof T & string =>
  Object.hasOwn(catalog, key);

const utcInstant = (at: Instant) => new Date(at).toISOString().replace(/\.000Z$/, "Z");

function zonedTime(at: Instant, timeZone: string): Event["scheduledDeparture"] {
  const minutes = utcOffsetMinutes(at, timeZone);
  const absoluteMinutes = Math.abs(minutes);
  const hh = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const mm = String(absoluteMinutes % 60).padStart(2, "0");
  const offset = `${minutes < 0 ? "-" : "+"}${hh}:${mm}`;
  return {
    local: `${utcInstant(addMinutes(at, minutes)).slice(0, -1)}${offset}`,
    timeZone,
    utc: utcInstant(at),
  };
}

function unknownReason(reason: string | undefined): UnknownReason {
  switch (reason) {
    case "STALE_DATA":
      return "STALE";
    case "CONTRADICTION":
    case "DEGRADED_SOURCE_ONLY":
    case "SECONDARY_SOURCE":
      return "UNVERIFIED";
    default:
      return "UNAVAILABLE";
  }
}

function presentDelay(segment: SegmentAssessment, reason: UnknownReason): Event["delay"] {
  const { delay } = segment;
  switch (delay.kind) {
    case "CONFIRMED":
    case "UNCONFIRMED":
      return { status: delay.kind, minutes: delay.minutes };
    case "NOT_DELAYED":
      return { status: "NOT_DELAYED" };
    case "UNKNOWN":
      return { status: "UNKNOWN", reason };
  }
}

function presentEvent(
  segment: SegmentAssessment,
  trace: DisruptionAssessment["decisionTrace"],
  composer: PassengerMessageComposer,
): Event {
  const { segmentId, flightNumber, flightStatus, severity, origin, destination } = segment;
  // Only translate the per-segment resolution to public uncertainty vocabulary. The trace itself stays private.
  const statusResolution = trace.find(
    (entry) =>
      entry.refs[0] === segmentId &&
      entry.refs[1] === "status" &&
      (entry.step === "RECONCILIATION" || entry.step === "FRESHNESS"),
  );
  const secondarySource = statusResolution?.decision === "SECONDARY_SOURCE";
  const gate: Event["gate"] =
    segment.gate.kind === "KNOWN"
      ? { status: "KNOWN", value: segment.gate.value }
      : { status: "UNKNOWN", reason: unknownReason(segment.gate.reason) };
  const facts = {
    segmentId,
    flightNumber,
    flightStatus,
    severity,
    origin: { code: origin.code, timeZone: origin.timeZone },
    destination: { code: destination.code, timeZone: destination.timeZone },
    scheduledDeparture: zonedTime(segment.scheduledDeparture, origin.timeZone),
    scheduledArrival: zonedTime(segment.scheduledArrival, destination.timeZone),
    delay: presentDelay(
      segment,
      unknownReason(secondarySource ? "SECONDARY_SOURCE" : statusResolution?.reasonCode),
    ),
    ...(segment.estimatedDeparture === undefined
      ? {}
      : { estimatedDeparture: zonedTime(segment.estimatedDeparture, origin.timeZone) }),
    gate,
  };
  const actualDeparture =
    segment.actualDeparture === undefined
      ? undefined
      : zonedTime(segment.actualDeparture, origin.timeZone);
  return { ...facts, message: composer.flight(facts, secondarySource, actualDeparture) };
}

function presentConnection(
  assessment: DisruptionAssessment,
  composer: PassengerMessageComposer,
): AssessmentResponse["connection"] {
  const { connection, segments } = assessment;
  if (!connection) return null;
  const { status, lossConfirmation, originalConnectionMinutes, marginMinutes } = connection;
  const inbound = segments.find((segment) => segment.segmentId === connection.fromSegmentId);
  const outbound = segments.find((segment) => segment.segmentId === connection.toSegmentId);
  const arrival =
    inbound && connection.inboundArrival
      ? {
          time: zonedTime(connection.inboundArrival.at, inbound.destination.timeZone),
          confirmed: connection.inboundArrival.confirmed,
        }
      : undefined;
  const departure =
    outbound && connection.outboundDeparture
      ? zonedTime(connection.outboundDeparture.at, outbound.origin.timeZone)
      : undefined;
  return {
    status,
    lossConfirmation,
    originalConnectionMinutes,
    ...(arrival ? { inboundArrival: arrival } : {}),
    ...(marginMinutes === undefined ? {} : { marginMinutes }),
    message: composer.connection(connection, arrival, departure, inbound, outbound),
  };
}

function presentPolicies(
  policies: DisruptionAssessment["policies"],
): AssessmentResponse["policies"] {
  if (!policies.available) return { available: false, reasonCode: "POLICIES_UNAVAILABLE" };
  const { policyId, version, validity } = policies;
  return {
    available: true,
    policyId,
    version,
    validity,
    evaluations:
      validity === "VALID"
        ? policies.evaluations.map(({ ruleId, benefit, status }) => ({
            rule: ruleId,
            benefit,
            status,
          }))
        : [],
  };
}

function presentAlternatives(
  alternatives: DisruptionAssessment["alternatives"],
  composer: PassengerMessageComposer,
): AssessmentResponse["alternatives"] {
  switch (alternatives.kind) {
    case "NOT_REQUIRED":
      return { status: "NOT_REQUIRED" };
    case "UNAVAILABLE":
      return { status: "UNAVAILABLE", reasonCode: "ALTERNATIVES_UNAVAILABLE" };
    case "EVALUATED":
      return {
        status: "EVALUATED",
        options: alternatives.options.map(
          ({
            optionId,
            kind,
            flightNumber,
            departure,
            departureTimeZone,
            eligibility,
            reasonCodes,
          }) => {
            const facts = {
              optionId,
              kind,
              eligibility,
              ...(flightNumber === undefined ? {} : { flightNumber }),
              ...(departure === undefined || departureTimeZone === undefined
                ? {}
                : { departure: zonedTime(departure, departureTimeZone) }),
              reasonCodes: reasonCodes.filter((code) => ownKey(alternativeReasons, code)),
            };
            return { ...facts, message: composer.option(facts) };
          },
        ),
      };
  }
}

/** The only public assessment shape. Construct each nested section from an explicit allowlist. */
export function presentAssessment(
  assessment: DisruptionAssessment,
  requestId: string,
): AssessmentResponse {
  const composer = new PassengerMessageComposer(assessment, spanishLocale);
  const { assessmentStatus, severity, mode } = assessment;
  const { type, priority, reasonCodes } = assessment.recommendation;
  const recommendation = {
    type,
    priority,
    reasonCodes: reasonCodes.flatMap((code) =>
      ownKey(recommendationReasons, code) ? [recommendationReasons[code]] : [],
    ),
  };
  const policy = assessment.policies;
  const metadata = {
    assessedAt: utcInstant(assessment.assessedAt),
    locale: composer.locale,
    policyRefs: policy.available ? [{ id: policy.policyId, version: policy.version }] : [],
  };
  return {
    requestId,
    assessmentStatus,
    disruption: {
      severity,
      summary: composer.disruption(),
      events: assessment.segments.map((segment) =>
        presentEvent(segment, assessment.decisionTrace, composer),
      ),
    },
    connection: presentConnection(assessment, composer),
    policies: presentPolicies(policy),
    recommendation: { ...recommendation, message: composer.recommendation(recommendation) },
    alternatives: presentAlternatives(assessment.alternatives, composer),
    actions: { executed: [], recommended: [type] },
    warnings: assessment.warnings
      .filter((code) => ownKey(warnings, code))
      .map((code) => ({ code, ...warnings[code] })),
    metadata:
      mode === "SIMULATION"
        ? {
            ...metadata,
            mode,
            dataSnapshot: "historical-fixture",
            notice: composer.simulationNotice(),
          }
        : { ...metadata, mode, dataSnapshot: "provider-snapshot" },
  };
}
