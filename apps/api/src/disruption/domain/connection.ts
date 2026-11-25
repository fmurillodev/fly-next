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
 * D04 with the P5 adjustment. No Minimum Connection Time is invented, so the booked connection time
 * is not a safety threshold either: a reduced but still positive margin is `UNKNOWN`, not `AT_RISK`.
 * - `MISSED` needs a confirmed fact from a non-degraded primary source (actual arrival at or after the
 *   outbound departure, or a cancellation), never a projection.
 * - `AT_RISK` needs a projected margin of zero or less, or operational evidence of risk (an
 *   unconfirmed cancellation report).
 * - `SAFE` needs confirmed sources and a margin that preserves the booked connection time.
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
  const inboundConfirmed = inbound.status.basis === "PRIMARY_SOURCE";
  const confirmed = inboundConfirmed && outbound.status.basis === "PRIMARY_SOURCE";
  const base = { fromSegmentId: from.id, toSegmentId: to.id, originalConnectionMinutes };

  if (inb.status === "CANCELLED" || out.status === "CANCELLED") {
    const cancellationConfirmed =
      (inb.status === "CANCELLED" && inboundConfirmed) ||
      (out.status === "CANCELLED" && outbound.status.basis === "PRIMARY_SOURCE");
    return cancellationConfirmed
      ? { ...base, status: "MISSED", lossConfirmation: "CONFIRMED_MISSED" }
      : { ...base, status: "AT_RISK", lossConfirmation: "NOT_CONFIRMED" };
  }

  const outboundDeparture =
    out.estimatedDeparture ??
    (out.status === "DELAYED" && out.delayMinutes !== undefined
      ? addMinutes(to.scheduledDeparture, out.delayMinutes)
      : to.scheduledDeparture);
  const actualArrival = inboundConfirmed ? inb.actualArrival : undefined;
  const arrivalAt =
    actualArrival ??
    addMinutes(from.scheduledArrival, inb.status === "DELAYED" ? (inb.delayMinutes ?? 0) : 0);
  const marginMinutes = minutesBetween(arrivalAt, outboundDeparture);
  const evidence = {
    ...base,
    inboundArrival: { at: arrivalAt, confirmed: actualArrival !== undefined },
    marginMinutes,
  };

  if (actualArrival !== undefined) {
    if (marginMinutes <= 0)
      return { ...evidence, status: "MISSED", lossConfirmation: "CONFIRMED_MISSED" };
    return marginMinutes >= originalConnectionMinutes
      ? { ...evidence, status: "SAFE", lossConfirmation: "CONFIRMED_NOT_MISSED" }
      : { ...evidence, status: "UNKNOWN", lossConfirmation: "NOT_CONFIRMED" };
  }
  if (marginMinutes <= 0)
    return { ...evidence, status: "AT_RISK", lossConfirmation: "NOT_CONFIRMED" };
  return {
    ...evidence,
    status: confirmed && marginMinutes >= originalConnectionMinutes ? "SAFE" : "UNKNOWN",
    lossConfirmation: "NOT_CONFIRMED",
  };
}
