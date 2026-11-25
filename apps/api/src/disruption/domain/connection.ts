import type {
  ConnectionStatus,
  FlightSegment,
  FlightStatusFacts,
  Instant,
  Resolved,
} from "./model.js";
import { addMinutes, minutesBetween } from "./time.js";

export interface SegmentOperationalState {
  readonly segment: FlightSegment;
  readonly status: Resolved<FlightStatusFacts>;
}

export type LossConfirmation = "CONFIRMED_MISSED" | "CONFIRMED_NOT_MISSED" | "NOT_CONFIRMED";

export interface ConnectionAssessment {
  readonly fromSegmentId: string;
  readonly toSegmentId: string;
  readonly status: ConnectionStatus;
  /** Distinguishes "loss not confirmed" from "confirmed not lost" (D04). */
  readonly lossConfirmation: LossConfirmation;
  readonly originalConnectionMinutes: number;
  /** Arrival at the connection point; `confirmed: false` means an inference, not an operational fact. */
  readonly inboundArrival?: { readonly at: Instant; readonly confirmed: boolean };
  readonly marginMinutes?: number;
}

const unknown = (
  from: FlightSegment,
  to: FlightSegment,
  originalConnectionMinutes: number,
): ConnectionAssessment => ({
  fromSegmentId: from.id,
  toSegmentId: to.id,
  status: "UNKNOWN",
  lossConfirmation: "NOT_CONFIRMED",
  originalConnectionMinutes,
});

/**
 * D04. No Minimum Connection Time is invented: the booked connection time is the only reference,
 * so any reduction of it is AT_RISK. MISSED requires a confirmed fact (actual arrival or
 * cancellation from a non-degraded primary source), never a projection.
 */
export function evaluateConnection(
  inbound: SegmentOperationalState,
  outbound: SegmentOperationalState,
): ConnectionAssessment {
  const from = inbound.segment;
  const to = outbound.segment;
  const originalConnectionMinutes = minutesBetween(from.scheduledArrival, to.scheduledDeparture);
  if (inbound.status.kind === "UNRESOLVED" || outbound.status.kind === "UNRESOLVED") {
    return unknown(from, to, originalConnectionMinutes);
  }
  const inb = inbound.status.value;
  const out = outbound.status.value;
  const confirmed =
    inbound.status.basis === "PRIMARY_SOURCE" && outbound.status.basis === "PRIMARY_SOURCE";
  const base = { fromSegmentId: from.id, toSegmentId: to.id, originalConnectionMinutes };

  if (inb.status === "CANCELLED" || out.status === "CANCELLED") {
    return confirmed
      ? { ...base, status: "MISSED", lossConfirmation: "CONFIRMED_MISSED" }
      : unknown(from, to, originalConnectionMinutes);
  }

  const outboundDeparture =
    out.estimatedDeparture ??
    (out.status === "DELAYED" && out.delayMinutes !== undefined
      ? addMinutes(to.scheduledDeparture, out.delayMinutes)
      : to.scheduledDeparture);
  const actualArrival = confirmed ? inb.actualArrival : undefined;
  const arrivalAt =
    actualArrival ??
    addMinutes(from.scheduledArrival, inb.status === "DELAYED" ? (inb.delayMinutes ?? 0) : 0);
  const marginMinutes = minutesBetween(arrivalAt, outboundDeparture);
  const inboundArrival = { at: arrivalAt, confirmed: actualArrival !== undefined };
  const evidence = { ...base, inboundArrival, marginMinutes };

  if (actualArrival !== undefined) {
    if (marginMinutes <= 0)
      return { ...evidence, status: "MISSED", lossConfirmation: "CONFIRMED_MISSED" };
    return {
      ...evidence,
      status: marginMinutes >= originalConnectionMinutes ? "SAFE" : "AT_RISK",
      lossConfirmation: "CONFIRMED_NOT_MISSED",
    };
  }
  if (marginMinutes < originalConnectionMinutes) {
    return { ...evidence, status: "AT_RISK", lossConfirmation: "NOT_CONFIRMED" };
  }
  return { ...evidence, status: confirmed ? "SAFE" : "UNKNOWN", lossConfirmation: "NOT_CONFIRMED" };
}
