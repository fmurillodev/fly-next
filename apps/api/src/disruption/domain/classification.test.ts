import { describe, expect, it } from "vitest";
import { DEFAULT_ASSESSMENT_CONFIG } from "./config.js";
import { aggregateSeverity, classifySegment } from "./classification.js";
import type { FlightStatusFacts, Resolved } from "./model.js";

const resolved = (value: FlightStatusFacts): Resolved<FlightStatusFacts> => ({
  kind: "RESOLVED",
  value,
  basis: "PRIMARY_SOURCE",
  eventId: "e",
  recordedAt: 0,
});
const classify = (value: FlightStatusFacts, compromisesConnection = false) =>
  classifySegment(resolved(value), compromisesConnection, DEFAULT_ASSESSMENT_CONFIG);

describe("classifySegment (D01, A07)", () => {
  it("treats a cancellation as critical", () => {
    expect(classify({ status: "CANCELLED" })).toBe("CRITICAL");
  });

  it.each([
    [29, "INFO"],
    [30, "WARNING"],
    [160, "WARNING"],
  ] as const)("maps a %d-minute delay to %s", (minutes, severity) => {
    expect(classify({ status: "DELAYED", delayMinutes: minutes })).toBe(severity);
  });

  it("makes a sub-30-minute delay relevant when it compromises a connection", () => {
    expect(classify({ status: "DELAYED", delayMinutes: 10 }, true)).toBe("WARNING");
  });

  it("maps on-time and scheduled flights to NONE", () => {
    expect(classify({ status: "ON_TIME" })).toBe("NONE");
    expect(classify({ status: "SCHEDULED" })).toBe("NONE");
  });

  it("maps unresolved data to UNKNOWN, never to NONE", () => {
    expect(
      classifySegment(
        { kind: "UNRESOLVED", reason: "STALE_DATA" },
        false,
        DEFAULT_ASSESSMENT_CONFIG,
      ),
    ).toBe("UNKNOWN");
  });
});

describe("aggregateSeverity", () => {
  it("lets a critical finding dominate unknowns", () => {
    expect(aggregateSeverity(["WARNING", "UNKNOWN", "CRITICAL"])).toBe("CRITICAL");
  });
  it("keeps UNKNOWN above verified lower severities", () => {
    expect(aggregateSeverity(["NONE", "UNKNOWN", "WARNING"])).toBe("UNKNOWN");
  });
  it("returns the highest verified severity otherwise", () => {
    expect(aggregateSeverity(["NONE", "INFO", "WARNING"])).toBe("WARNING");
    expect(aggregateSeverity(["NONE", "NONE"])).toBe("NONE");
  });
});
