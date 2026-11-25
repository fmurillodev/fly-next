import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AssessmentRequestSchema,
  AssessmentResponseSchema,
  PassengerMessageSchema,
  ProblemDetailsSchema,
  type AssessmentResponse,
} from "./index.js";

const contract = readFileSync(
  new URL("../../../docs/engineering/API-CONTRACT.md", import.meta.url),
  "utf8",
);

function example(bookingId: string): unknown {
  const fence = "```";
  const match = contract.match(
    new RegExp(`^#### ${bookingId}\\n\\n${fence}json\\n([\\s\\S]*?)\\n${fence}`, "m"),
  );
  if (!match?.[1]) throw new Error(`Missing contract example: ${bookingId}`);
  return JSON.parse(match[1]);
}

function abc123(): AssessmentResponse {
  return AssessmentResponseSchema.parse(example("ABC123"));
}

describe("assessment request", () => {
  it.each(["ABC123", "a", "Aa09".repeat(8)])("accepts %s unchanged", (bookingId) => {
    expect(AssessmentRequestSchema.parse({ bookingId })).toEqual({ bookingId });
  });

  it.each([
    {},
    null,
    { bookingId: 123 },
    { bookingId: "" },
    { bookingId: "A".repeat(33) },
    { bookingId: "ABC-123" },
    { bookingId: "ABC123\n" },
    { bookingId: " ABC123" },
    { bookingId: "ABC123", extra: true },
  ])("rejects %j", (input) => {
    expect(AssessmentRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe("assessment response", () => {
  it.each(["ABC123", "DEMO01", "DEMO02"])(
    "accepts the full documented %s payload unchanged",
    (bookingId) => {
      const body = example(bookingId);
      expect(AssessmentResponseSchema.parse(body)).toEqual(body);
    },
  );

  it.each([
    (body: AssessmentResponse) => ({ ...body, decisionTrace: [] }),
    (body: AssessmentResponse) => ({
      ...body,
      metadata: { ...body.metadata, passengerName: "synthetic" },
    }),
    (body: AssessmentResponse) => ({
      ...body,
      recommendation: { ...body.recommendation, reasonCodes: ["GROUP_INCLUDES_MINOR"] },
    }),
    (body: AssessmentResponse) => ({
      ...body,
      recommendation: { ...body.recommendation, summary: "duplicate" },
    }),
    (body: AssessmentResponse) => ({
      ...body,
      recommendation: { ...body.recommendation, message: "not structured" },
    }),
    (body: AssessmentResponse) => ({ ...body, warnings: undefined }),
    (body: AssessmentResponse) => ({
      ...body,
      warnings: [{ code: "UNKNOWN", title: "Aviso", message: "Aviso" }],
    }),
    (body: AssessmentResponse) => ({
      ...body,
      warnings: [{ code: "SOURCE_CONFLICT_RESOLVED", message: "Sin título" }],
    }),
    (body: AssessmentResponse) => ({
      ...body,
      warnings: body.warnings.map((warning) => ({ ...warning, nextSteps: [] })),
    }),
    (body: AssessmentResponse) => ({ ...body, alternatives: [] }),
    (body: AssessmentResponse) => ({ ...body, actions: { ...body.actions, executed: ["REBOOK"] } }),
    (body: AssessmentResponse) => ({ ...body, actions: { ...body.actions, recommended: [] } }),
  ])("rejects a stale, incomplete, or non-public shape (%#)", (mutate) => {
    expect(AssessmentResponseSchema.safeParse(mutate(abc123())).success).toBe(false);
  });

  it("accepts degraded sections with sanitized reasons and no unevaluated options", () => {
    const body = {
      ...abc123(),
      assessmentStatus: "INDETERMINATE",
      policies: { available: false, reasonCode: "POLICIES_UNAVAILABLE" },
      alternatives: { status: "UNAVAILABLE", reasonCode: "ALTERNATIVES_UNAVAILABLE" },
    };
    expect(AssessmentResponseSchema.parse(body)).toEqual(body);
    expect(
      AssessmentResponseSchema.safeParse({
        ...body,
        policies: { available: false, reasonCode: "TIMEOUT" },
      }).success,
    ).toBe(false);
    expect(
      AssessmentResponseSchema.safeParse({
        ...body,
        alternatives: { ...body.alternatives, options: [] },
      }).success,
    ).toBe(false);
  });

  it("allows only empty evaluations for an invalid policy", () => {
    const body = abc123();
    if (!body.policies.available) throw new Error("ABC123 must provide policy metadata");
    const policies = { ...body.policies, validity: "EXPIRED" };
    expect(AssessmentResponseSchema.safeParse({ ...body, policies }).success).toBe(false);
    const degraded = { ...body, policies: { ...policies, evaluations: [] } };
    expect(AssessmentResponseSchema.parse(degraded)).toEqual(degraded);
  });

  it("requires a timezone on local timestamps and a Z suffix on UTC timestamps", () => {
    const body = abc123();
    for (const replacement of [
      { local: "2026-09-15T14:30:00" },
      { utc: "2026-09-15T14:30:00-03:00" },
    ]) {
      const events = body.disruption.events.map((event) => ({
        ...event,
        scheduledDeparture: { ...event.scheduledDeparture, ...replacement },
      }));
      expect(
        AssessmentResponseSchema.safeParse({ ...body, disruption: { ...body.disruption, events } })
          .success,
      ).toBe(false);
    }
  });
});

describe("passenger communication", () => {
  it("accepts an optional nextSteps array without supplying a default", () => {
    const message = {
      code: "RECOMMENDATION_MONITOR",
      title: "Sigue atento",
      message: "Consulta tu vuelo.",
    };
    expect(PassengerMessageSchema.parse(message)).toEqual(message);
    const withSteps = { ...message, nextSteps: ["Revisa el estado antes de salir."] };
    expect(PassengerMessageSchema.parse(withSteps)).toEqual(withSteps);
    expect(
      PassengerMessageSchema.safeParse({ ...message, nextSteps: "Revisa el estado." }).success,
    ).toBe(false);
  });
});

describe("problem details", () => {
  const fields = {
    type: "https://flynext.example/problems/booking-not-found",
    title: "Booking not found",
    detail: "No synthetic booking matches the supplied identifier.",
    requestId: "req_01",
  };

  it.each([
    ["INVALID_REQUEST", 400],
    ["BOOKING_NOT_FOUND", 404],
    ["RATE_LIMIT_EXCEEDED", 429],
    ["INVALID_UPSTREAM_RESPONSE", 502],
    ["UPSTREAM_UNAVAILABLE", 503],
    ["UPSTREAM_TIMEOUT", 504],
    ["INTERNAL_ERROR", 500],
  ])("accepts %s only with status %i", (code, status) => {
    const problem = { ...fields, code, status };
    expect(ProblemDetailsSchema.parse(problem)).toEqual(problem);
    expect(ProblemDetailsSchema.safeParse({ ...problem, status: 200 }).success).toBe(false);
  });

  it("rejects internal error codes and diagnostic fields", () => {
    expect(
      ProblemDetailsSchema.safeParse({ ...fields, code: "STALE_BOOKING_CONTEXT", status: 502 })
        .success,
    ).toBe(false);
    expect(
      ProblemDetailsSchema.safeParse({
        ...fields,
        code: "INTERNAL_ERROR",
        status: 500,
        stack: "internal diagnostic",
      }).success,
    ).toBe(false);
  });
});

it("converts all four public schemas to JSON Schema for OpenAPI", () => {
  for (const schema of [
    AssessmentRequestSchema,
    AssessmentResponseSchema,
    PassengerMessageSchema,
    ProblemDetailsSchema,
  ]) {
    expect(z.toJSONSchema(schema, { target: "openapi-3.0" })).toEqual(expect.any(Object));
  }
  expect(z.toJSONSchema(AssessmentResponseSchema, { target: "openapi-3.0" })).toMatchObject({
    properties: {
      actions: {
        properties: {
          executed: { items: { type: "string" }, maxItems: 0 },
          recommended: { items: { type: "string" }, minItems: 1, maxItems: 1 },
        },
      },
    },
  });
});
