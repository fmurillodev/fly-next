import { z } from "zod";

/**
 * Shapes of the synthetic provider payloads. They are intentionally richer than the domain
 * (passenger names, raw strings) so the mappers prove that nothing unnecessary crosses the boundary.
 */
const zoned = z.object({ local: z.string(), timeZone: z.string() });
const airport = z.object({ iata: z.string(), country: z.string(), timeZone: z.string() });
const sourceStatus = z.enum(["OPERATIONAL", "DEGRADED"]);
const source = z.enum(["OPS_CORE", "AIRPORT_FEED", "LEGACY_MIRROR"]);

export const rawBookingSchema = z.object({
  bookingRef: z.string(),
  retrievedAt: z.string(),
  passengers: z.array(z.object({ name: z.string(), type: z.enum(["ADULT", "CHILD"]) })).min(1),
  segments: z
    .array(
      z.object({
        segmentId: z.string(),
        flightNumber: z.string(),
        origin: airport,
        destination: airport,
        departure: zoned,
        arrival: zoned,
      }),
    )
    .min(1),
  fare: z.object({
    changesAllowed: z.boolean().nullable(),
    changePenalty: z
      .object({
        type: z.enum(["NONE", "AMOUNT"]),
        amount: z.number().nonnegative().optional(),
        currency: z.string().optional(),
      })
      .nullable(),
  }),
  compensationRequested: z.boolean().nullable(),
});

const eventBase = { eventId: z.string(), segmentId: z.string(), source, recordedAt: z.string() };
export const rawEventsSchema = z.object({
  sources: z.object({
    OPS_CORE: sourceStatus,
    AIRPORT_FEED: sourceStatus,
    LEGACY_MIRROR: sourceStatus,
  }),
  events: z.array(
    z.discriminatedUnion("type", [
      z.object({
        ...eventBase,
        type: z.literal("STATUS"),
        status: z.enum(["SCHEDULED", "ON_TIME", "DELAYED", "CANCELLED", "UNKNOWN"]),
        delayMinutes: z.number().int().nonnegative().optional(),
        estimatedDeparture: zoned.optional(),
        actualArrival: zoned.optional(),
      }),
      z.object({ ...eventBase, type: z.literal("GATE"), gate: z.string().min(1) }),
    ]),
  ),
});

export const rawPolicySchema = z.object({
  policyId: z.string(),
  version: z.string(),
  status: z.enum(["ACTIVE", "RETIRED", "DRAFT"]),
  validFrom: z.string(),
  validUntil: z.string(),
  rules: z.array(z.object({ ruleId: z.string(), benefit: z.string() })),
});

export const rawOptionsSchema = z.array(
  z.object({
    optionId: z.string(),
    kind: z.enum(["FLIGHT", "REFUND"]),
    flightNumber: z.string().optional(),
    origin: z.string().optional(),
    destination: z.string().optional(),
    departure: zoned.optional(),
    retrievedAt: z.string(),
    ttlSeconds: z.number().positive(),
    seatsAvailable: z.number().int().nonnegative().nullable(),
    fareDifference: z.object({ amount: z.number(), currency: z.string() }).nullable(),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  }),
);

export type RawBooking = z.infer<typeof rawBookingSchema>;
export type RawEvents = z.infer<typeof rawEventsSchema>;
export type RawPolicy = z.infer<typeof rawPolicySchema>;
export type RawOptions = z.infer<typeof rawOptionsSchema>;
