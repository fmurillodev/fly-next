import type { AlternativeOption } from "../domain/alternatives.js";
import type {
  FlightSegment,
  Instant,
  OperationalEvent,
  OperationalEventsSnapshot,
  TripContext,
} from "../domain/model.js";
import type { PolicyDocument } from "../domain/policies.js";
import { instantFromIso, offsetFromIso, utcOffsetMinutes } from "../domain/time.js";
import {
  rawBookingSchema,
  rawEventsSchema,
  rawOptionsSchema,
  rawPolicySchema,
} from "./provider-payloads.js";
import type { z } from "zod";

/** The payload failed validation. The message never echoes the payload (D09). */
export class InvalidProviderPayload extends Error {
  constructor(what: string) {
    super(`Invalid ${what} payload`);
    this.name = "InvalidProviderPayload";
  }
}

function parse<S extends z.ZodType>(schema: S, raw: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new InvalidProviderPayload(what);
  return result.data;
}

function instant(iso: string, what: string): Instant {
  try {
    return instantFromIso(iso);
  } catch {
    throw new InvalidProviderPayload(what);
  }
}

/** Instant of a local timestamp; its offset must match the IANA zone on that date (A02). */
function zonedInstant(value: { local: string; timeZone: string }, what: string): Instant {
  try {
    const at = instantFromIso(value.local);
    if (offsetFromIso(value.local) !== utcOffsetMinutes(at, value.timeZone)) {
      throw new InvalidProviderPayload(what);
    }
    return at;
  } catch (error) {
    if (error instanceof InvalidProviderPayload) throw error;
    if (error instanceof RangeError) throw new InvalidProviderPayload(what);
    throw error;
  }
}

export function mapBooking(raw: unknown): TripContext {
  const booking = parse(rawBookingSchema, raw, "booking");
  const segments = booking.segments.map((s): FlightSegment => {
    if (
      s.departure.timeZone !== s.origin.timeZone ||
      s.arrival.timeZone !== s.destination.timeZone
    ) {
      throw new InvalidProviderPayload("booking");
    }
    return {
      id: s.segmentId,
      flightNumber: s.flightNumber,
      origin: { code: s.origin.iata, country: s.origin.country, timeZone: s.origin.timeZone },
      destination: {
        code: s.destination.iata,
        country: s.destination.country,
        timeZone: s.destination.timeZone,
      },
      scheduledDeparture: zonedInstant(s.departure, "booking"),
      scheduledArrival: zonedInstant(s.arrival, "booking"),
    };
  });
  const penalty = booking.fare.changePenalty;
  if (
    penalty?.type === "AMOUNT" &&
    (penalty.amount === undefined || penalty.currency === undefined)
  ) {
    throw new InvalidProviderPayload("booking");
  }
  return {
    bookingId: booking.bookingRef,
    retrievedAt: instant(booking.retrievedAt, "booking"),
    group: {
      size: booking.passengers.length,
      includesMinor: booking.passengers.some((p) => p.type === "CHILD"),
    },
    segments,
    fare: {
      changesAllowed:
        booking.fare.changesAllowed === null
          ? "UNKNOWN"
          : booking.fare.changesAllowed
            ? "YES"
            : "NO",
      changePenalty:
        penalty === null
          ? { kind: "UNKNOWN" }
          : penalty.type === "NONE"
            ? { kind: "NONE_CONFIRMED" }
            : { kind: "AMOUNT", amount: penalty.amount ?? 0, currency: penalty.currency ?? "" },
    },
    compensationRequest:
      booking.compensationRequested === null
        ? "UNKNOWN"
        : booking.compensationRequested
          ? "REQUESTED"
          : "NOT_REQUESTED",
    international: segments.some((s) => s.origin.country !== s.destination.country),
  };
}

export function mapEvents(raw: unknown): OperationalEventsSnapshot {
  const payload = parse(rawEventsSchema, raw, "operational events");
  const events = payload.events.map((e): OperationalEvent => {
    const base = {
      id: e.eventId,
      segmentId: e.segmentId,
      source: e.source,
      recordedAt: instant(e.recordedAt, "operational events"),
    };
    if (e.type === "GATE") return { ...base, kind: "GATE", gate: e.gate };
    if (e.status === "DELAYED" && e.delayMinutes === undefined) {
      throw new InvalidProviderPayload("operational events");
    }
    return {
      ...base,
      kind: "FLIGHT_STATUS",
      status: e.status,
      ...(e.delayMinutes === undefined ? {} : { delayMinutes: e.delayMinutes }),
      ...(e.estimatedDeparture
        ? { estimatedDeparture: zonedInstant(e.estimatedDeparture, "operational events") }
        : {}),
      ...(e.actualDeparture
        ? { actualDeparture: zonedInstant(e.actualDeparture, "operational events") }
        : {}),
      ...(e.actualArrival
        ? { actualArrival: zonedInstant(e.actualArrival, "operational events") }
        : {}),
    };
  });
  return { events, sourceStatus: payload.sources };
}

/** Reads rule ids only: provider-supplied conditions or expressions are never carried over (D05). */
export function mapPolicy(raw: unknown): PolicyDocument {
  const policy = parse(rawPolicySchema, raw, "policy");
  return {
    policyId: policy.policyId,
    version: policy.version,
    status: policy.status,
    validFrom: instant(policy.validFrom, "policy"),
    validUntil: instant(policy.validUntil, "policy"),
    ruleIds: policy.rules.map((r) => r.ruleId),
  };
}

export function mapOptions(raw: unknown): AlternativeOption[] {
  return parse(rawOptionsSchema, raw, "options").map((o): AlternativeOption => {
    if (o.kind === "FLIGHT" && (!o.origin || !o.destination || !o.departure)) {
      throw new InvalidProviderPayload("options");
    }
    return {
      id: o.optionId,
      kind: o.kind,
      ...(o.flightNumber ? { flightNumber: o.flightNumber } : {}),
      ...(o.origin ? { originCode: o.origin } : {}),
      ...(o.destination ? { destinationCode: o.destination } : {}),
      ...(o.departure
        ? {
            departure: zonedInstant(o.departure, "options"),
            departureTimeZone: o.departure.timeZone,
          }
        : {}),
      retrievedAt: instant(o.retrievedAt, "options"),
      ttlSeconds: o.ttlSeconds,
      seatsAvailable: o.seatsAvailable,
      fareDifference: o.fareDifference,
      confidence: o.confidence,
    };
  });
}
