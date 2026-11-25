import { describe, expect, it } from "vitest";
import type { ConnectionAssessment } from "./connection.js";
import type { FlightStatusFacts, Resolved, Severity } from "./model.js";
import {
  evaluatePolicies,
  summarizeDelays,
  type PolicyDocument,
  type PolicyFacts,
} from "./policies.js";
import { NOW, t } from "./testing.js";

const doc: PolicyDocument = {
  policyId: "POL-DELAY-2026-03",
  version: "2026.03",
  status: "ACTIVE",
  validFrom: t("2026-03-01T00:00:00Z"),
  validUntil: t("2027-03-01T00:00:00Z"),
  ruleIds: ["R1", "R2", "R3", "R4", "R5"],
};
const baseFacts: PolicyFacts = {
  delay: { confirmedMinutes: 0, unconfirmedMinutes: 0, hasUnresolvedSegments: false },
  international: false,
  connection: null,
  compensationRequest: "NOT_REQUESTED",
  includesMinor: false,
  severity: "NONE",
};
const statusOf = (facts: Partial<PolicyFacts>, rule: string, document = doc) =>
  evaluatePolicies(document, { ...baseFacts, ...facts }, NOW).evaluations.find(
    (e) => e.ruleId === rule,
  )?.status;
const connection = (over: Partial<ConnectionAssessment>): ConnectionAssessment => ({
  fromSegmentId: "S1",
  toSegmentId: "S2",
  status: "AT_RISK",
  lossConfirmation: "NOT_CONFIRMED",
  originalConnectionMinutes: 70,
  ...over,
});
const confirmed = (minutes: number) => ({
  confirmedMinutes: minutes,
  unconfirmedMinutes: 0,
  hasUnresolvedSegments: false,
});

describe("R1 delay ≥ 180 (D05)", () => {
  it.each([
    [179, "NOT_APPLICABLE"],
    [180, "APPLICABLE"],
    [239, "APPLICABLE"],
    [240, "APPLICABLE"],
  ])("a confirmed %d-minute delay is %s", (minutes, expected) => {
    expect(statusOf({ delay: confirmed(minutes) }, "R1")).toBe(expected);
  });

  it("is INSUFFICIENT_EVIDENCE when the qualifying delay is unconfirmed or segments are unresolved", () => {
    expect(
      statusOf(
        { delay: { confirmedMinutes: 0, unconfirmedMinutes: 200, hasUnresolvedSegments: false } },
        "R1",
      ),
    ).toBe("INSUFFICIENT_EVIDENCE");
    expect(
      statusOf(
        { delay: { confirmedMinutes: 90, unconfirmedMinutes: 0, hasUnresolvedSegments: true } },
        "R1",
      ),
    ).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("stays APPLICABLE when a confirmed delay already qualifies despite other unresolved segments", () => {
    expect(
      statusOf(
        { delay: { confirmedMinutes: 200, unconfirmedMinutes: 0, hasUnresolvedSegments: true } },
        "R1",
      ),
    ).toBe("APPLICABLE");
  });
});

describe("R2 delay ≥ 240 and international (D05)", () => {
  it.each([
    [239, true, "NOT_APPLICABLE"],
    [240, true, "APPLICABLE"],
    [250, false, "NOT_APPLICABLE"],
  ] as const)("%d minutes, international=%s → %s", (minutes, international, expected) => {
    expect(statusOf({ delay: confirmed(minutes), international }, "R2")).toBe(expected);
  });
});

describe("R3 confirmed missed connection", () => {
  it.each([
    [connection({ status: "MISSED", lossConfirmation: "CONFIRMED_MISSED" }), "APPLICABLE"],
    [connection({ status: "AT_RISK" }), "INSUFFICIENT_EVIDENCE"],
    [connection({ status: "UNKNOWN" }), "INSUFFICIENT_EVIDENCE"],
    [connection({ status: "SAFE" }), "NOT_APPLICABLE"],
    [connection({ status: "AT_RISK", lossConfirmation: "CONFIRMED_NOT_MISSED" }), "NOT_APPLICABLE"],
    [null, "NOT_APPLICABLE"],
  ] as const)("connection %# → %s", (c, expected) => {
    expect(statusOf({ connection: c }, "R3")).toBe(expected);
  });
});

describe("R4 compensation requested", () => {
  it.each([
    ["REQUESTED", "REQUIRES_HUMAN_APPROVAL"],
    ["NOT_REQUESTED", "NOT_APPLICABLE"],
    ["UNKNOWN", "INSUFFICIENT_EVIDENCE"],
  ] as const)("%s → %s", (request, expected) => {
    expect(statusOf({ compensationRequest: request }, "R4")).toBe(expected);
  });
});

describe("R5 group includes a minor, in a disruption context", () => {
  it.each([
    ["WARNING", true, "REQUIRES_HUMAN_APPROVAL"],
    ["CRITICAL", true, "REQUIRES_HUMAN_APPROVAL"],
    ["NONE", true, "NOT_APPLICABLE"],
    ["UNKNOWN", true, "INSUFFICIENT_EVIDENCE"],
    ["CRITICAL", false, "NOT_APPLICABLE"],
  ] as const)("severity %s, minor=%s → %s", (severity: Severity, includesMinor, expected) => {
    expect(statusOf({ severity, includesMinor }, "R5")).toBe(expected);
  });
});

describe("policy validity (D05, D03)", () => {
  const facts: Partial<PolicyFacts> = { delay: confirmed(300) };
  it("evaluates nothing for unknown, expired, not-yet-valid or inactive policies", () => {
    const cases: [Partial<PolicyDocument>, string][] = [
      [{ policyId: "POL-UNKNOWN" }, "UNSUPPORTED"],
      [{ validUntil: NOW }, "EXPIRED"],
      [{ validFrom: NOW + 1 }, "NOT_YET_VALID"],
      [{ status: "RETIRED" }, "INACTIVE"],
    ];
    for (const [override, validity] of cases) {
      const result = evaluatePolicies({ ...doc, ...override }, { ...baseFacts, ...facts }, NOW);
      expect(result.validity).toBe(validity);
      expect(result.evaluations).toEqual([]);
    }
  });

  it("is valid from validFrom (inclusive) until validUntil (exclusive)", () => {
    expect(evaluatePolicies({ ...doc, validFrom: NOW }, baseFacts, NOW).validity).toBe("VALID");
    expect(evaluatePolicies({ ...doc, validUntil: NOW + 1 }, baseFacts, NOW).validity).toBe(
      "VALID",
    );
  });

  it("ignores unsupported rule ids and never evaluates rules the policy does not list", () => {
    const result = evaluatePolicies(
      { ...doc, ruleIds: ["R1", "R9"] },
      { ...baseFacts, delay: confirmed(200) },
      NOW,
    );
    expect(result.evaluations.map((e) => e.ruleId)).toEqual(["R1"]);
    expect(result.ignoredRuleIds).toEqual(["R9"]);
  });
});

describe("summarizeDelays", () => {
  const resolved = (
    value: FlightStatusFacts,
    basis: "PRIMARY_SOURCE" | "SECONDARY_SOURCE",
  ): Resolved<FlightStatusFacts> => ({
    kind: "RESOLVED",
    value,
    basis,
    eventId: "e",
    recordedAt: 0,
  });
  it("separates confirmed from unconfirmed delays and flags unresolved segments", () => {
    expect(
      summarizeDelays([
        resolved({ status: "DELAYED", delayMinutes: 160 }, "PRIMARY_SOURCE"),
        resolved({ status: "DELAYED", delayMinutes: 300 }, "SECONDARY_SOURCE"),
        { kind: "UNRESOLVED", reason: "STALE_DATA" },
      ]),
    ).toEqual({ confirmedMinutes: 160, unconfirmedMinutes: 300, hasUnresolvedSegments: true });
  });
});
