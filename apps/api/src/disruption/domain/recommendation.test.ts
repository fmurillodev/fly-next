import { describe, expect, it } from "vitest";
import type { AlternativeEvaluation } from "./alternatives.js";
import type { ConnectionAssessment } from "./connection.js";
import type { Severity } from "./model.js";
import type { RuleEvaluation } from "./policies.js";
import { determineAssessmentStatus, recommend, type DecisionInput } from "./recommendation.js";

const rule = (
  ruleId: RuleEvaluation["ruleId"],
  status: RuleEvaluation["status"],
): RuleEvaluation => ({
  ruleId,
  status,
  benefit: "REBOOK_NO_FEE",
  reasonCode: "TEST",
});
const noPolicies = (...overrides: RuleEvaluation[]): DecisionInput["policies"] => ({
  available: true,
  validity: "VALID",
  evaluations: (["R1", "R3", "R4", "R5"] as const).map(
    (id) => overrides.find((o) => o.ruleId === id) ?? rule(id, "NOT_APPLICABLE"),
  ),
});
const option = (eligibility: AlternativeEvaluation["eligibility"]): AlternativeEvaluation => ({
  optionId: "O",
  kind: "FLIGHT",
  eligibility,
  reasonCodes: [],
});
const connection = (
  status: ConnectionAssessment["status"],
  loss: ConnectionAssessment["lossConfirmation"] = "NOT_CONFIRMED",
): ConnectionAssessment => ({
  fromSegmentId: "S1",
  toSegmentId: "S2",
  status,
  lossConfirmation: loss,
  originalConnectionMinutes: 70,
});
const input = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  severity: "NONE",
  connection: null,
  policies: noPolicies(),
  alternatives: { kind: "NOT_REQUIRED" },
  includesMinor: false,
  fareIncomplete: false,
  hasUnconfirmedFacts: false,
  ...over,
});

describe("determineAssessmentStatus (D08, D10)", () => {
  it("is COMPLETE when every determination is verified", () => {
    expect(determineAssessmentStatus(input())).toBe("COMPLETE");
    expect(
      determineAssessmentStatus(
        input({
          severity: "WARNING",
          alternatives: { kind: "EVALUATED", options: [option("ELIGIBLE")] },
        }),
      ),
    ).toBe("COMPLETE");
  });

  it("is INDETERMINATE when severity cannot be determined", () => {
    expect(determineAssessmentStatus(input({ severity: "UNKNOWN" }))).toBe("INDETERMINATE");
  });

  it.each<[string, Partial<DecisionInput>]>([
    [
      "connection at risk without confirmed loss",
      { severity: "CRITICAL", connection: connection("AT_RISK") },
    ],
    ["unknown connection", { severity: "WARNING", connection: connection("UNKNOWN") }],
    ["insufficient policy evidence", { policies: noPolicies(rule("R3", "INSUFFICIENT_EVIDENCE")) }],
    ["policies unavailable", { policies: { available: false, failure: "UNAVAILABLE" } }],
    ["invalid policy", { policies: { available: true, validity: "EXPIRED", evaluations: [] } }],
    [
      "alternatives unavailable",
      { severity: "WARNING", alternatives: { kind: "UNAVAILABLE", failure: "TIMEOUT" } },
    ],
    [
      "pending alternative",
      {
        severity: "WARNING",
        alternatives: { kind: "EVALUATED", options: [option("PENDING_VALIDATION")] },
      },
    ],
    ["unconfirmed facts", { hasUnconfirmedFacts: true }],
  ])("is PARTIAL with %s", (_name, over) => {
    expect(determineAssessmentStatus(input(over))).toBe("PARTIAL");
  });
});

describe("recommend (D07, D08, A04)", () => {
  it("ABC123: HUMAN_REVIEW, HIGH, with internal reason codes in stable order", () => {
    const result = recommend(
      input({
        severity: "CRITICAL",
        connection: connection("AT_RISK"),
        policies: noPolicies(
          rule("R3", "INSUFFICIENT_EVIDENCE"),
          rule("R5", "REQUIRES_HUMAN_APPROVAL"),
        ),
        includesMinor: true,
        fareIncomplete: true,
        alternatives: { kind: "EVALUATED", options: [option("PENDING_VALIDATION")] },
      }),
    );
    expect(result).toEqual({
      type: "HUMAN_REVIEW",
      priority: "HIGH",
      reasonCodes: ["CONNECTION_AT_RISK", "GROUP_INCLUDES_MINOR", "INCOMPLETE_FARE_CONDITIONS"],
    });
  });

  it("recommends HUMAN_REVIEW when the situation cannot be determined, and never NO_ACTION", () => {
    expect(recommend(input({ severity: "UNKNOWN" }))).toEqual({
      type: "HUMAN_REVIEW",
      priority: "NORMAL",
      reasonCodes: ["OPERATIONAL_DATA_UNRESOLVED"],
    });
    expect(recommend(input({ severity: "UNKNOWN", includesMinor: true })).priority).toBe("HIGH");
  });

  it("recommends reviewing rebooking options when verified options exist and no approval is pending", () => {
    const result = recommend(
      input({
        severity: "WARNING",
        policies: noPolicies(rule("R1", "APPLICABLE")),
        alternatives: { kind: "EVALUATED", options: [option("ELIGIBLE")] },
      }),
    );
    expect(result).toMatchObject({ type: "REVIEW_REBOOKING_OPTIONS", priority: "NORMAL" });
  });

  it("a confirmed missed connection with a verified option is a HIGH-priority option review", () => {
    const result = recommend(
      input({
        severity: "CRITICAL",
        connection: connection("MISSED", "CONFIRMED_MISSED"),
        policies: noPolicies(rule("R3", "APPLICABLE")),
        alternatives: { kind: "EVALUATED", options: [option("ELIGIBLE")] },
      }),
    );
    expect(result).toMatchObject({
      type: "REVIEW_REBOOKING_OPTIONS",
      priority: "HIGH",
      reasonCodes: ["CONNECTION_MISSED"],
    });
  });

  it("escalates to HUMAN_REVIEW when a benefit applies but no alternative is verified", () => {
    const result = recommend(
      input({
        severity: "WARNING",
        policies: noPolicies(rule("R1", "APPLICABLE")),
        alternatives: { kind: "UNAVAILABLE", failure: "UNAVAILABLE" },
      }),
    );
    expect(result.type).toBe("HUMAN_REVIEW");
    expect(result.reasonCodes).toEqual(["ALTERNATIVES_UNAVAILABLE", "NO_VERIFIED_ALTERNATIVE"]);
  });

  it("requires human review when compensation was requested", () => {
    const result = recommend(
      input({ severity: "WARNING", policies: noPolicies(rule("R4", "REQUIRES_HUMAN_APPROVAL")) }),
    );
    expect(result).toMatchObject({ type: "HUMAN_REVIEW", reasonCodes: ["COMPENSATION_REQUESTED"] });
  });

  it.each<[Severity, string, string]>([
    ["INFO", "MONITOR_FLIGHT", "NORMAL"],
    ["NONE", "NO_ACTION_REQUIRED", "LOW"],
  ])("maps severity %s without a connection issue to %s / %s", (severity, type, priority) => {
    expect(recommend(input({ severity }))).toMatchObject({ type, priority });
  });

  it("does not raise priority for a minor when there is no disruption context", () => {
    expect(recommend(input({ includesMinor: true }))).toMatchObject({
      type: "NO_ACTION_REQUIRED",
      priority: "LOW",
    });
  });
});
