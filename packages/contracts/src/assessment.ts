import { z } from "zod";

export const AssessmentRequestSchema = z.strictObject({
  bookingId: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9]+$/),
});

export const PassengerMessageSchema = z.strictObject({
  code: z.string(),
  title: z.string(),
  message: z.string(),
  nextSteps: z.array(z.string()).optional(),
});

const utc = z.iso.datetime();
const time = z.strictObject({
  local: z.iso.datetime({ offset: true }),
  timeZone: z.string(),
  utc,
});
const airport = z.strictObject({ code: z.string(), timeZone: z.string() });
const severity = z.enum(["NONE", "INFO", "WARNING", "CRITICAL", "UNKNOWN"]);
const unknownReason = z.enum(["STALE", "UNAVAILABLE", "UNVERIFIED"]);

const delay = z.discriminatedUnion("status", [
  z.strictObject({ status: z.enum(["CONFIRMED", "UNCONFIRMED"]), minutes: z.int().nonnegative() }),
  z.strictObject({ status: z.literal("NOT_DELAYED") }),
  z.strictObject({ status: z.literal("UNKNOWN"), reason: unknownReason }),
]);
const gate = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("KNOWN"), value: z.string() }),
  z.strictObject({ status: z.literal("UNKNOWN"), reason: unknownReason }),
]);
const segment = z.strictObject({
  segmentId: z.string(),
  flightNumber: z.string(),
  origin: airport,
  destination: airport,
  scheduledDeparture: time,
  scheduledArrival: time,
  flightStatus: z.enum(["SCHEDULED", "ON_TIME", "DELAYED", "CANCELLED", "UNKNOWN"]),
  severity,
  delay,
  estimatedDeparture: time.optional(),
  gate,
  message: PassengerMessageSchema,
});
const connection = z.strictObject({
  status: z.enum(["SAFE", "AT_RISK", "MISSED", "UNKNOWN"]),
  lossConfirmation: z.enum(["CONFIRMED_MISSED", "CONFIRMED_NOT_MISSED", "NOT_CONFIRMED"]),
  originalConnectionMinutes: z.number(),
  inboundArrival: z.strictObject({ time, confirmed: z.boolean() }).optional(),
  marginMinutes: z.number().optional(),
  message: PassengerMessageSchema,
});

const policyEvaluation = z.strictObject({
  rule: z.enum(["R1", "R2", "R3", "R4", "R5"]),
  benefit: z.enum(["REBOOK_NO_FEE", "MEAL_VOUCHER", "CASH_COMPENSATION", "PRIORITY_HANDLING"]),
  status: z.enum([
    "APPLICABLE",
    "NOT_APPLICABLE",
    "REQUIRES_HUMAN_APPROVAL",
    "INSUFFICIENT_EVIDENCE",
  ]),
});
const evaluations = z.array(policyEvaluation);
const availablePolicy = {
  available: z.literal(true),
  policyId: z.string(),
  version: z.string(),
};
const policies = z.union([
  z.strictObject({ ...availablePolicy, validity: z.literal("VALID"), evaluations }),
  z.strictObject({
    ...availablePolicy,
    validity: z.enum(["EXPIRED", "NOT_YET_VALID", "INACTIVE", "UNSUPPORTED"]),
    evaluations: evaluations.length(0),
  }),
  z.strictObject({ available: z.literal(false), reasonCode: z.literal("POLICIES_UNAVAILABLE") }),
]);

const recommendationType = z.enum([
  "NO_ACTION_REQUIRED",
  "MONITOR_FLIGHT",
  "REVIEW_REBOOKING_OPTIONS",
  "HUMAN_REVIEW",
]);
const recommendationReason = z.enum([
  "CONNECTION_AT_RISK",
  "CONNECTION_MISSED",
  "CONNECTION_UNKNOWN",
  "PRIORITY_REVIEW_REQUIRED",
  "COMPENSATION_REQUESTED",
  "INCOMPLETE_FARE_CONDITIONS",
  "POLICY_UNVERIFIED",
  "ALTERNATIVES_UNAVAILABLE",
  "OPERATIONAL_DATA_UNRESOLVED",
  "NO_VERIFIED_ALTERNATIVE",
]);

const alternativeReason = z.enum([
  "STALE_OPTION",
  "DEPARTED",
  "ITINERARY_INCOMPATIBLE",
  "NOT_REACHABLE",
  "REACHABILITY_UNCONFIRMED",
  "INSUFFICIENT_SEATS_FOR_GROUP",
  "SEATS_UNKNOWN",
  "CHANGES_NOT_ALLOWED",
  "FARE_CONDITIONS_INCOMPLETE",
  "CHANGE_PENALTY_APPLIES",
  "FARE_DIFFERENCE_APPLIES",
  "FARE_DIFFERENCE_UNKNOWN",
  "LOW_CONFIDENCE",
  "MEDIUM_CONFIDENCE",
  "REFUND_REQUIRES_REVIEW",
  "REBOOKING_NOT_AUTHORIZED_BY_POLICY",
]);
const alternative = z.strictObject({
  optionId: z.string(),
  kind: z.enum(["FLIGHT", "REFUND"]),
  flightNumber: z.string().optional(),
  departure: time.optional(),
  eligibility: z.enum(["ELIGIBLE", "PENDING_VALIDATION", "NOT_ELIGIBLE", "REQUIRES_REVIEW"]),
  reasonCodes: z.array(alternativeReason),
  message: PassengerMessageSchema,
});
const alternatives = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("EVALUATED"), options: z.array(alternative) }),
  z.strictObject({ status: z.literal("NOT_REQUIRED") }),
  z.strictObject({
    status: z.literal("UNAVAILABLE"),
    reasonCode: z.literal("ALTERNATIVES_UNAVAILABLE"),
  }),
]);
const warning = z.strictObject({
  code: z.enum([
    "SOURCE_CONFLICT_RESOLVED",
    "SOURCE_CONFLICT_UNRESOLVED",
    "OPERATIONAL_DATA_STALE",
    "OPERATIONAL_DATA_UNAVAILABLE",
    "DEGRADED_SOURCE_LIMITED",
    "SECONDARY_SOURCE_ONLY",
    "FARE_CONDITIONS_INCOMPLETE",
    "POLICIES_UNAVAILABLE",
    "POLICY_NOT_VALID",
    "ALTERNATIVES_UNAVAILABLE",
  ]),
  title: z.string(),
  message: z.string(),
});

const assessmentMetadata = {
  assessedAt: utc,
  locale: z.literal("es"),
  policyRefs: z.array(z.strictObject({ id: z.string(), version: z.string() })),
};
const metadata = z.discriminatedUnion("mode", [
  z.strictObject({
    ...assessmentMetadata,
    mode: z.literal("SIMULATION"),
    dataSnapshot: z.literal("historical-fixture"),
    notice: PassengerMessageSchema,
  }),
  z.strictObject({
    ...assessmentMetadata,
    mode: z.literal("REAL_TIME"),
    dataSnapshot: z.string(),
    notice: PassengerMessageSchema.optional(),
  }),
]);

export const AssessmentResponseSchema = z.strictObject({
  requestId: z.string(),
  assessmentStatus: z.enum(["COMPLETE", "PARTIAL", "INDETERMINATE"]),
  disruption: z.strictObject({
    severity,
    summary: PassengerMessageSchema,
    events: z.array(segment),
  }),
  connection: connection.nullable(),
  policies,
  recommendation: z.strictObject({
    type: recommendationType,
    priority: z.enum(["LOW", "NORMAL", "HIGH"]),
    reasonCodes: z.array(recommendationReason),
    message: PassengerMessageSchema,
  }),
  alternatives,
  actions: z.strictObject({
    executed: z.array(z.string()).length(0),
    recommended: z.array(recommendationType).length(1),
  }),
  warnings: z.array(warning),
  metadata,
});

export type AssessmentRequest = z.infer<typeof AssessmentRequestSchema>;
export type AssessmentResponse = z.infer<typeof AssessmentResponseSchema>;
export type PassengerMessage = z.infer<typeof PassengerMessageSchema>;
