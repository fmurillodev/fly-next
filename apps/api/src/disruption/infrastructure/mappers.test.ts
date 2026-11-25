import { describe, expect, it } from "vitest";
import { InvalidProviderPayload, mapBooking, mapEvents, mapOptions, mapPolicy } from "./mappers.js";
import { SCENARIOS, POLICY_PAYLOAD } from "./fixtures.js";

const abc = () => structuredClone(SCENARIOS["ABC123"]!);

describe("mapBooking", () => {
  it("keeps only decision-relevant facts: group size and minor presence, never names or ages", () => {
    const trip = mapBooking(abc().booking);
    expect(trip.group).toEqual({ size: 2, includesMinor: true });
    expect(JSON.stringify(trip)).not.toContain("SYNTHETIC PASSENGER");
    expect(trip.international).toBe(true);
    expect(trip.fare.changePenalty).toEqual({ kind: "UNKNOWN" });
    expect(trip.compensationRequest).toBe("NOT_REQUESTED");
  });

  it("keeps unknown values unknown instead of coercing them", () => {
    const raw = abc().booking;
    raw.compensationRequested = null;
    raw.fare = { changesAllowed: null, changePenalty: null };
    const trip = mapBooking(raw);
    expect(trip.compensationRequest).toBe("UNKNOWN");
    expect(trip.fare).toEqual({ changesAllowed: "UNKNOWN", changePenalty: { kind: "UNKNOWN" } });
  });

  it("rejects an offset that does not match the IANA zone on that date", () => {
    const raw = abc().booking;
    raw.segments[0]!.departure.local = "2026-09-15T14:30:00-04:00";
    expect(() => mapBooking(raw)).toThrow(InvalidProviderPayload);
  });

  it("rejects timestamps without an explicit offset and malformed payloads", () => {
    const raw = abc().booking;
    raw.segments[0]!.departure.local = "2026-09-15T14:30:00";
    expect(() => mapBooking(raw)).toThrow(InvalidProviderPayload);
    expect(() => mapBooking({ bookingRef: 1 })).toThrow(InvalidProviderPayload);
  });
});

describe("mapEvents", () => {
  it("maps events to UTC instants and rejects a delay without minutes", () => {
    const raw = abc().events;
    expect(mapEvents(raw).events).toHaveLength(4);
    const bad = abc().events;
    const delayed = bad.events.find((e) => e.type === "STATUS" && e.status === "DELAYED");
    if (delayed?.type === "STATUS") delete delayed.delayMinutes;
    expect(() => mapEvents(bad)).toThrow(InvalidProviderPayload);
  });
});

describe("mapPolicy", () => {
  it("ignores provider-supplied expressions: only rule ids are read", () => {
    const raw = structuredClone(POLICY_PAYLOAD);
    raw.rules = [
      { ruleId: "R1", benefit: "REBOOK_NO_FEE", condition: "delay > 0 || true" } as never,
    ];
    expect(mapPolicy(raw).ruleIds).toEqual(["R1"]);
    expect(JSON.stringify(mapPolicy(raw))).not.toContain("delay > 0");
  });
});

describe("mapOptions", () => {
  it("maps unknown seat counts and fare differences to null, not zero", () => {
    const options = mapOptions(abc().options);
    const refund = options.find((o) => o.kind === "REFUND");
    expect(refund).toMatchObject({ seatsAvailable: null, fareDifference: null });
  });
});
