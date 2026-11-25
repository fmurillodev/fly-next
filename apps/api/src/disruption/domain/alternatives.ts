import type { FareConditions, Instant } from "./model.js";
import { isWithinSeconds } from "./time.js";

export type Eligibility = "ELIGIBLE" | "PENDING_VALIDATION" | "NOT_ELIGIBLE" | "REQUIRES_REVIEW";
export type OptionConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface AlternativeOption {
  readonly id: string;
  readonly kind: "FLIGHT" | "REFUND";
  readonly flightNumber?: string;
  readonly originCode?: string;
  readonly destinationCode?: string;
  readonly departure?: Instant;
  readonly departureTimeZone?: string;
  readonly retrievedAt: Instant;
  readonly ttlSeconds: number;
  /** `null` is unknown, never zero (D06). */
  readonly seatsAvailable: number | null;
  readonly fareDifference: { readonly amount: number; readonly currency: string } | null;
  readonly confidence: OptionConfidence;
}

/** Where and when the passenger can realistically board a new flight. */
export interface ReachabilityPoint {
  readonly airportCode: string;
  readonly availableFrom: Instant;
  /** `false` means the arrival is a projection, not an operational fact. */
  readonly confirmed: boolean;
}

export interface AlternativeContext {
  readonly now: Instant;
  readonly groupSize: number;
  readonly fare: FareConditions;
  readonly finalDestinationCode: string;
  readonly reachability: readonly ReachabilityPoint[];
  /** A no-fee rebooking benefit (R1 or R3) is APPLICABLE. */
  readonly rebookingAuthorized: boolean;
}

export interface AlternativeEvaluation {
  readonly optionId: string;
  readonly kind: AlternativeOption["kind"];
  readonly flightNumber?: string;
  readonly departure?: Instant;
  readonly departureTimeZone?: string;
  readonly eligibility: Eligibility;
  readonly reasonCodes: readonly string[];
}

function evaluateOption(option: AlternativeOption, ctx: AlternativeContext): AlternativeEvaluation {
  const blocking: string[] = [];
  const review: string[] = [];
  const pending: string[] = [];

  if (!isWithinSeconds(option.retrievedAt, ctx.now, option.ttlSeconds))
    blocking.push("STALE_OPTION");

  if (option.kind === "REFUND") {
    review.push("REFUND_REQUIRES_REVIEW");
    if (option.confidence === "LOW") review.push("LOW_CONFIDENCE");
  } else {
    if (option.departure === undefined || option.departure <= ctx.now) blocking.push("DEPARTED");
    if (option.destinationCode !== ctx.finalDestinationCode)
      blocking.push("ITINERARY_INCOMPATIBLE");
    const point = ctx.reachability.find((p) => p.airportCode === option.originCode);
    if (!point) {
      if (!blocking.includes("ITINERARY_INCOMPATIBLE")) blocking.push("ITINERARY_INCOMPATIBLE");
    } else if (blocking.includes("DEPARTED")) {
      // Already departed: reachability is moot.
    } else if (option.departure !== undefined && option.departure <= point.availableFrom) {
      blocking.push("NOT_REACHABLE");
    } else if (!point.confirmed) {
      pending.push("REACHABILITY_UNCONFIRMED");
    }

    if (option.seatsAvailable === null) review.push("SEATS_UNKNOWN");
    else if (option.seatsAvailable < ctx.groupSize) blocking.push("INSUFFICIENT_SEATS_FOR_GROUP");

    if (ctx.fare.changesAllowed === "NO") blocking.push("CHANGES_NOT_ALLOWED");
    else if (ctx.fare.changesAllowed === "UNKNOWN" || ctx.fare.changePenalty.kind === "UNKNOWN") {
      pending.push("FARE_CONDITIONS_INCOMPLETE");
    } else if (ctx.fare.changePenalty.kind === "AMOUNT" && ctx.fare.changePenalty.amount > 0) {
      review.push("CHANGE_PENALTY_APPLIES");
    }
    if (option.fareDifference === null) review.push("FARE_DIFFERENCE_UNKNOWN");
    else if (option.fareDifference.amount !== 0) review.push("FARE_DIFFERENCE_APPLIES");

    if (option.confidence === "LOW") review.push("LOW_CONFIDENCE");
    else if (option.confidence === "MEDIUM") pending.push("MEDIUM_CONFIDENCE");
    if (!ctx.rebookingAuthorized) pending.push("REBOOKING_NOT_AUTHORIZED_BY_POLICY");
  }

  const base = {
    optionId: option.id,
    kind: option.kind,
    ...(option.flightNumber === undefined ? {} : { flightNumber: option.flightNumber }),
    ...(option.departure === undefined ? {} : { departure: option.departure }),
    ...(option.departureTimeZone === undefined
      ? {}
      : { departureTimeZone: option.departureTimeZone }),
  };
  if (blocking.length > 0) return { ...base, eligibility: "NOT_ELIGIBLE", reasonCodes: blocking };
  if (review.length > 0)
    return { ...base, eligibility: "REQUIRES_REVIEW", reasonCodes: [...review, ...pending] };
  if (pending.length > 0)
    return { ...base, eligibility: "PENDING_VALIDATION", reasonCodes: pending };
  return { ...base, eligibility: "ELIGIBLE", reasonCodes: [] };
}

/**
 * D06. ELIGIBLE means "verified candidate for a human to review": nothing is ever executed (D07).
 * Passengers are never split, so seats must cover the whole group.
 */
export function evaluateAlternatives(
  options: readonly AlternativeOption[],
  ctx: AlternativeContext,
): AlternativeEvaluation[] {
  return options.map((option) => evaluateOption(option, ctx));
}
