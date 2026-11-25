import type { AssessmentResponse, PassengerMessage } from "@flynext/contracts";
import type { DisruptionAssessment, SegmentAssessment } from "../application/assess-disruption.js";
import type { ConnectionAssessment } from "../domain/connection.js";
import { alternativeReasons, facts, localTime, messages, spanishLocale } from "./messages.es.js";

type Event = AssessmentResponse["disruption"]["events"][number];
type Connection = NonNullable<AssessmentResponse["connection"]>;
type Option = Extract<
  AssessmentResponse["alternatives"],
  { status: "EVALUATED" }
>["options"][number];
type Recommendation = AssessmentResponse["recommendation"];
type Time = Event["scheduledDeparture"];
type Template = keyof typeof messages;

function render<K extends Template>(
  code: K,
  ...args: Parameters<(typeof messages)[K]>
): PassengerMessage {
  const template = messages[code] as (
    ...input: Parameters<(typeof messages)[K]>
  ) => Omit<PassengerMessage, "code">;
  return { code, ...template(...args) };
}

export class PassengerMessageComposer {
  constructor(
    private readonly assessment: DisruptionAssessment,
    readonly locale: typeof spanishLocale,
  ) {}

  disruption(): PassengerMessage {
    const { connection, segments, severity } = this.assessment;
    const details: string[] = [];
    const delayed =
      segments.find((segment) => segment.delay.kind === "CONFIRMED") ??
      segments.find((segment) => segment.delay.kind === "UNCONFIRMED");
    if (delayed?.delay.kind === "CONFIRMED") {
      details.push(facts.confirmedDelay(delayed.flightNumber, delayed.delay.minutes));
    } else if (delayed?.delay.kind === "UNCONFIRMED") {
      details.push(facts.reportedDelay(delayed.flightNumber));
    }
    const cancelled = segments.find((segment) => segment.flightStatus === "CANCELLED");
    if (cancelled) details.push(facts.reportedCancellation(cancelled.flightNumber));
    if (connection?.status === "AT_RISK") details.push(facts.connectionRisk);
    if (connection?.lossConfirmation === "CONFIRMED_MISSED") details.push(facts.connectionMissed);

    switch (severity) {
      case "NONE":
        return render("DISRUPTION_NONE");
      case "INFO":
        return render("DISRUPTION_INFO", details);
      case "WARNING":
        return render("DISRUPTION_RELEVANT", details);
      case "CRITICAL":
        return render("DISRUPTION_CRITICAL", details);
      case "UNKNOWN":
        return render("DISRUPTION_UNDETERMINED");
    }
  }

  flight(
    event: Omit<Event, "message">,
    secondarySource: boolean,
    actualDeparture: Time | undefined,
  ): PassengerMessage {
    const { flightNumber, flightStatus, delay, gate, estimatedDeparture } = event;
    const gateCopy = gate.status === "KNOWN" ? [facts.gate(gate.value)] : [];
    if (flightStatus === "CANCELLED") {
      return secondarySource
        ? render("FLIGHT_STATUS_UNVERIFIED", flightNumber, [facts.cancellationUnverified])
        : render("FLIGHT_CANCELLED", flightNumber);
    }
    if (actualDeparture) {
      gateCopy.unshift(facts.outbound.ACTUAL(flightNumber, localTime(actualDeparture)));
    } else if (estimatedDeparture) {
      gateCopy.unshift(facts.estimatedDeparture(localTime(estimatedDeparture)));
    }
    if (delay.status === "CONFIRMED")
      return render("FLIGHT_DELAYED_CONFIRMED", flightNumber, delay.minutes, gateCopy);
    if (delay.status === "UNCONFIRMED")
      return render("FLIGHT_DELAYED_UNCONFIRMED", flightNumber, delay.minutes, gateCopy);
    if (delay.status === "NOT_DELAYED") {
      if (gate.status === "UNKNOWN") gateCopy.push(facts.gateUnknown);
      if (flightStatus === "ON_TIME") return render("FLIGHT_ON_TIME", flightNumber, gateCopy);
      if (flightStatus === "SCHEDULED") return render("FLIGHT_ON_SCHEDULE", flightNumber, gateCopy);
    }
    return render("FLIGHT_STATUS_UNVERIFIED", flightNumber, gateCopy);
  }

  connection(
    evidence: ConnectionAssessment,
    arrival: Connection["inboundArrival"],
    departure: Time | undefined,
    inbound: SegmentAssessment | undefined,
    outbound: SegmentAssessment | undefined,
  ): PassengerMessage {
    const details: string[] = [];
    if (arrival && inbound) {
      const withDate =
        departure !== undefined && arrival.time.local.slice(0, 10) !== departure.local.slice(0, 10);
      const time = localTime(arrival.time, withDate);
      details.push(
        arrival.confirmed
          ? facts.arrivalConfirmed(inbound.flightNumber, time)
          : facts.arrivalProjected(time),
      );
    }
    if (departure && outbound && evidence.outboundDeparture) {
      const withDate =
        arrival !== undefined && arrival.time.local.slice(0, 10) !== departure.local.slice(0, 10);
      details.push(
        facts.outbound[evidence.outboundDeparture.basis](
          outbound.flightNumber,
          localTime(departure, withDate),
        ),
      );
    }

    switch (evidence.status) {
      case "AT_RISK":
        if (inbound?.flightStatus === "CANCELLED" || outbound?.flightStatus === "CANCELLED")
          return render("CONNECTION_AT_RISK_CANCELLATION_REPORTED", details);
        if (arrival?.confirmed) return render("CONNECTION_AT_RISK_CONFIRMED_ARRIVAL", details);
        if (inbound?.delay.kind === "CONFIRMED" || inbound?.delay.kind === "UNCONFIRMED") {
          if (evidence.originalConnectionMinutes > 0)
            details.unshift(facts.bookedConnection(evidence.originalConnectionMinutes));
          return render("CONNECTION_AT_RISK_PROJECTED_DELAY", details);
        }
        return render("CONNECTION_AT_RISK", details);
      case "SAFE":
        return render(
          "CONNECTION_SAFE",
          details,
          evidence.lossConfirmation === "CONFIRMED_NOT_MISSED",
        );
      case "MISSED":
        return evidence.lossConfirmation === "CONFIRMED_MISSED"
          ? render("CONNECTION_MISSED_CONFIRMED", details)
          : render("CONNECTION_UNKNOWN", details);
      case "UNKNOWN":
        return render("CONNECTION_UNKNOWN", details);
    }
  }

  recommendation(recommendation: Omit<Recommendation, "message">): PassengerMessage {
    const { type, reasonCodes } = recommendation;
    const { policies, segments, alternatives } = this.assessment;
    const details: string[] = [];
    if (reasonCodes.includes("PRIORITY_REVIEW_REQUIRED")) details.push(facts.priorityReview);
    if (reasonCodes.includes("INCOMPLETE_FARE_CONDITIONS")) details.push(facts.incompleteFare);
    if (reasonCodes.includes("COMPENSATION_REQUESTED")) details.push(facts.compensationReview);

    if (policies.available && policies.validity === "VALID" && type !== "NO_ACTION_REQUIRED") {
      const { evaluations } = policies;
      if (
        evaluations.some((rule) => rule.benefit === "REBOOK_NO_FEE" && rule.status === "APPLICABLE")
      ) {
        const delayMinutes = evaluations.some(
          (rule) => rule.ruleId === "R1" && rule.status === "APPLICABLE",
        )
          ? segments.reduce<number | undefined>(
              (max, segment) =>
                segment.delay.kind === "CONFIRMED"
                  ? Math.max(max ?? 0, segment.delay.minutes)
                  : max,
              undefined,
            )
          : undefined;
        details.push(facts.rebookConditional(delayMinutes));
      }
      if (
        evaluations.some((rule) => rule.benefit === "MEAL_VOUCHER" && rule.status === "APPLICABLE")
      ) {
        details.push(facts.mealConditional);
      }
    }

    switch (type) {
      case "NO_ACTION_REQUIRED":
        return render(
          "RECOMMENDATION_NO_ACTION",
          segments.length === 1 &&
            segments[0]?.flightStatus === "ON_TIME" &&
            segments[0]?.delay.kind === "NOT_DELAYED",
        );
      case "MONITOR_FLIGHT":
        return render("RECOMMENDATION_MONITOR", details);
      case "HUMAN_REVIEW":
        return render("RECOMMENDATION_HUMAN_REVIEW", details);
      case "REVIEW_REBOOKING_OPTIONS":
        if (
          alternatives.kind === "EVALUATED" &&
          alternatives.options.some((option) => option.eligibility === "ELIGIBLE")
        )
          details.push(facts.verifiedOptions);
        return render("RECOMMENDATION_REVIEW_OPTIONS", details);
    }
  }

  option(option: Omit<Option, "message">): PassengerMessage {
    const { flightNumber, departure, eligibility, reasonCodes, kind } = option;
    const title =
      kind === "REFUND"
        ? facts.refundTitle
        : facts.optionTitle(flightNumber, departure && localTime(departure, true));
    const details = reasonCodes
      .filter((code) => code !== "REFUND_REQUIRES_REVIEW")
      .map((code) => alternativeReasons[code]);
    switch (eligibility) {
      case "ELIGIBLE":
        return render("OPTION_ELIGIBLE", title);
      case "PENDING_VALIDATION":
        return render("OPTION_PENDING_VALIDATION", title, details);
      case "NOT_ELIGIBLE":
        return reasonCodes.includes("INSUFFICIENT_SEATS_FOR_GROUP")
          ? render("OPTION_NOT_ELIGIBLE_SEATS", title, details)
          : render("OPTION_NOT_ELIGIBLE", title, details);
      case "REQUIRES_REVIEW":
        return kind === "REFUND"
          ? render("OPTION_REFUND_REQUIRES_REVIEW", title, details)
          : render("OPTION_REQUIRES_REVIEW", title, details);
    }
  }

  simulationNotice(): PassengerMessage {
    return render("SIMULATION_MODE");
  }
}
