import { describe, expect, it } from "vitest";
import {
  evaluateAlternatives,
  type AlternativeContext,
  type AlternativeOption,
} from "./alternatives.js";
import { NOW, t } from "./testing.js";

const option = (over: Partial<AlternativeOption> = {}): AlternativeOption => ({
  id: "O1",
  kind: "FLIGHT",
  flightNumber: "LA2412",
  originCode: "LIM",
  destinationCode: "MEX",
  departure: t("2026-09-16T08:15:00-05:00"),
  retrievedAt: NOW - 60_000,
  ttlSeconds: 120,
  seatsAvailable: 4,
  fareDifference: { amount: 0, currency: "CLP" },
  confidence: "HIGH",
  ...over,
});
const ctx = (over: Partial<AlternativeContext> = {}): AlternativeContext => ({
  now: NOW,
  groupSize: 2,
  fare: { changesAllowed: "YES", changePenalty: { kind: "NONE_CONFIRMED" } },
  finalDestinationCode: "MEX",
  reachability: [
    { airportCode: "LIM", availableFrom: t("2026-09-15T20:35:00-05:00"), confirmed: true },
  ],
  rebookingAuthorized: true,
  ...over,
});
const evaluate = (o: AlternativeOption, c: AlternativeContext = ctx()) => {
  const [result] = evaluateAlternatives([o], c);
  if (!result) throw new Error("no evaluation");
  return result;
};

describe("evaluateAlternatives (D06)", () => {
  it("accepts a fully validated option as ELIGIBLE (a recommendation, never an executed action)", () => {
    expect(evaluate(option())).toMatchObject({ eligibility: "ELIGIBLE", reasonCodes: [] });
  });

  it("ABC123 O1: pending validation, with incomplete fare conditions, unconfirmed reachability and no policy authorization", () => {
    const result = evaluate(
      option(),
      ctx({
        fare: { changesAllowed: "YES", changePenalty: { kind: "UNKNOWN" } },
        reachability: [
          { airportCode: "LIM", availableFrom: t("2026-09-15T20:35:00-05:00"), confirmed: false },
        ],
        rebookingAuthorized: false,
      }),
    );
    expect(result.eligibility).toBe("PENDING_VALIDATION");
    expect(result.reasonCodes).toEqual([
      "REACHABILITY_UNCONFIRMED",
      "FARE_CONDITIONS_INCOMPLETE",
      "REBOOKING_NOT_AUTHORIZED_BY_POLICY",
    ]);
  });

  it("a zero fare difference never implies the absence of a penalty", () => {
    const result = evaluate(
      option({ fareDifference: { amount: 0, currency: "CLP" } }),
      ctx({ fare: { changesAllowed: "YES", changePenalty: { kind: "UNKNOWN" } } }),
    );
    expect(result.eligibility).not.toBe("ELIGIBLE");
    expect(result.reasonCodes).toContain("FARE_CONDITIONS_INCOMPLETE");
  });

  it("ABC123 O2: one seat cannot cover a group of two, and passengers are never split", () => {
    const result = evaluate(
      option({
        id: "O2",
        seatsAvailable: 1,
        fareDifference: { amount: 180000, currency: "CLP" },
        confidence: "MEDIUM",
      }),
    );
    expect(result).toMatchObject({
      eligibility: "NOT_ELIGIBLE",
      reasonCodes: ["INSUFFICIENT_SEATS_FOR_GROUP"],
    });
  });

  it.each([
    [1, "NOT_ELIGIBLE"],
    [2, "ELIGIBLE"],
    [3, "ELIGIBLE"],
  ])("exact seat boundary: %d seats for a group of 2 → %s", (seats, expected) => {
    expect(evaluate(option({ seatsAvailable: seats })).eligibility).toBe(expected);
  });

  it("unknown seat count requires review instead of being read as zero or enough", () => {
    expect(evaluate(option({ seatsAvailable: null }))).toMatchObject({
      eligibility: "REQUIRES_REVIEW",
      reasonCodes: ["SEATS_UNKNOWN"],
    });
  });

  it("ABC123 O3: a low-confidence refund needs review and guarantees nothing", () => {
    const result = evaluate(
      option({
        id: "O3",
        kind: "REFUND",
        confidence: "LOW",
        seatsAvailable: null,
        fareDifference: null,
      }),
    );
    expect(result).toMatchObject({
      eligibility: "REQUIRES_REVIEW",
      reasonCodes: ["REFUND_REQUIRES_REVIEW", "LOW_CONFIDENCE"],
    });
  });

  it("TTL boundary: exactly at the provider TTL is fresh, one millisecond later is stale", () => {
    expect(evaluate(option({ retrievedAt: NOW - 120_000 })).eligibility).toBe("ELIGIBLE");
    expect(evaluate(option({ retrievedAt: NOW - 120_001 }))).toMatchObject({
      eligibility: "NOT_ELIGIBLE",
      reasonCodes: ["STALE_OPTION"],
    });
  });

  it("does not assume Lima alternatives are viable without a validated arrival in Lima", () => {
    expect(evaluate(option(), ctx({ reachability: [] }))).toMatchObject({
      eligibility: "NOT_ELIGIBLE",
      reasonCodes: ["ITINERARY_INCOMPATIBLE"],
    });
    expect(evaluate(option({ departure: t("2026-09-15T20:00:00-05:00") }))).toMatchObject({
      eligibility: "NOT_ELIGIBLE",
      reasonCodes: ["NOT_REACHABLE"],
    });
  });

  it("rejects options that already departed or do not reach the final destination", () => {
    expect(evaluate(option({ departure: NOW - 1 })).reasonCodes).toEqual(["DEPARTED"]);
    expect(evaluate(option({ destinationCode: "BOG" })).reasonCodes).toEqual([
      "ITINERARY_INCOMPATIBLE",
    ]);
  });

  it("requires review when a fare difference applies and blocks fares that disallow changes", () => {
    expect(
      evaluate(option({ fareDifference: { amount: 50, currency: "USD" } })).reasonCodes,
    ).toEqual(["FARE_DIFFERENCE_APPLIES"]);
    expect(evaluate(option({ fareDifference: null })).reasonCodes).toEqual([
      "FARE_DIFFERENCE_UNKNOWN",
    ]);
    expect(
      evaluate(
        option(),
        ctx({ fare: { changesAllowed: "NO", changePenalty: { kind: "UNKNOWN" } } }),
      ),
    ).toMatchObject({ eligibility: "NOT_ELIGIBLE", reasonCodes: ["CHANGES_NOT_ALLOWED"] });
  });

  it("keeps medium confidence pending validation", () => {
    expect(evaluate(option({ confidence: "MEDIUM" }))).toMatchObject({
      eligibility: "PENDING_VALIDATION",
      reasonCodes: ["MEDIUM_CONFIDENCE"],
    });
  });
});
