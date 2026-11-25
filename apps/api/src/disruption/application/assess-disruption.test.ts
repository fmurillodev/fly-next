import { describe, expect, it } from "vitest";
import type { ProviderFailure } from "../domain/model.js";
import type {
  OperationalEventsProvider,
  PolicyRulesProvider,
  ProviderResult,
  TripContextProvider,
} from "../domain/ports.js";
import { t } from "../domain/testing.js";
import { createSimulationClock, SIMULATION_REFERENCE } from "../infrastructure/clock.js";
import { SCENARIOS } from "../infrastructure/fixtures.js";
import { createMockProviders } from "../infrastructure/mock-providers.js";
import {
  createAssessDisruption,
  type AssessDisruptionDeps,
  type DisruptionAssessment,
} from "./assess-disruption.js";

const providers = createMockProviders();
const clock = createSimulationClock(SIMULATION_REFERENCE);
const build = (overrides: Partial<AssessDisruptionDeps> = {}) =>
  createAssessDisruption({ ...providers, clock, ...overrides });

async function assess(
  bookingId: string,
  overrides: Partial<AssessDisruptionDeps> = {},
): Promise<DisruptionAssessment> {
  const result = await build(overrides)(bookingId);
  if (!result.ok) throw new Error(`expected an assessment, got ${result.error.code}`);
  return result.assessment;
}
const fail = (failure: ProviderFailure) => async (): Promise<ProviderResult<never>> => ({
  ok: false,
  failure,
});
const ruleStatuses = (a: DisruptionAssessment) =>
  a.policies.available
    ? Object.fromEntries(a.policies.evaluations.map((e) => [e.ruleId, e.status]))
    : {};

describe("ABC123 end to end (S6)", () => {
  it("produces the approved result with explicit uncertainty", async () => {
    const a = await assess("ABC123");
    expect(a).toMatchObject({
      bookingId: "ABC123",
      mode: "SIMULATION",
      assessedAt: t(SIMULATION_REFERENCE),
      assessmentStatus: "PARTIAL",
      severity: "CRITICAL",
      group: { size: 2, includesMinor: true },
      recommendation: {
        type: "HUMAN_REVIEW",
        priority: "HIGH",
        reasonCodes: ["CONNECTION_AT_RISK", "GROUP_INCLUDES_MINOR", "INCOMPLETE_FARE_CONDITIONS"],
      },
    });
    const [s1, s2] = a.segments;
    expect(s1).toMatchObject({
      segmentId: "S1",
      flightStatus: "DELAYED",
      severity: "WARNING",
      delay: { kind: "CONFIRMED", minutes: 160 },
      gate: { kind: "KNOWN", value: "24" },
      estimatedDeparture: t("2026-09-15T17:10:00-03:00"),
    });
    expect(s2).toMatchObject({ segmentId: "S2", flightStatus: "SCHEDULED", severity: "NONE" });
    // Scheduled facts travel with the assessment so presenters never need the booking again.
    expect(s1).toMatchObject({
      origin: { code: "SCL", timeZone: "America/Santiago" },
      destination: { code: "LIM", timeZone: "America/Lima" },
      scheduledDeparture: t("2026-09-15T14:30:00-03:00"),
      scheduledArrival: t("2026-09-15T17:55:00-05:00"),
    });
    expect(s2).toMatchObject({ scheduledDeparture: t("2026-09-15T19:05:00-05:00") });
    expect(a.connection).toMatchObject({
      status: "AT_RISK",
      lossConfirmation: "NOT_CONFIRMED",
      originalConnectionMinutes: 70,
      marginMinutes: -90,
      inboundArrival: { at: t("2026-09-15T20:35:00-05:00"), confirmed: false },
    });
    expect(ruleStatuses(a)).toEqual({
      R1: "NOT_APPLICABLE",
      R2: "NOT_APPLICABLE",
      R3: "INSUFFICIENT_EVIDENCE",
      R4: "NOT_APPLICABLE",
      R5: "REQUIRES_HUMAN_APPROVAL",
    });
  });

  it("evaluates O1/O2/O3 and authorizes no rebooking", async () => {
    const a = await assess("ABC123");
    if (a.alternatives.kind !== "EVALUATED") throw new Error("alternatives expected");
    const byId = Object.fromEntries(a.alternatives.options.map((o) => [o.optionId, o]));
    expect(byId["O1"]).toMatchObject({ eligibility: "PENDING_VALIDATION" });
    expect(byId["O1"]?.reasonCodes).toEqual(
      expect.arrayContaining([
        "REACHABILITY_UNCONFIRMED",
        "FARE_CONDITIONS_INCOMPLETE",
        "REBOOKING_NOT_AUTHORIZED_BY_POLICY",
      ]),
    );
    expect(byId["O2"]).toMatchObject({
      eligibility: "NOT_ELIGIBLE",
      reasonCodes: ["INSUFFICIENT_SEATS_FOR_GROUP"],
    });
    expect(byId["O3"]).toMatchObject({ eligibility: "REQUIRES_REVIEW" });
    expect(a.alternatives.options.some((o) => o.eligibility === "ELIGIBLE")).toBe(false);
  });

  it("recommends but never claims an executed action", async () => {
    const a = await assess("ABC123");
    expect(a.actions).toEqual({ executed: [], recommended: ["HUMAN_REVIEW"] });
    expect(a.warnings).toEqual(
      expect.arrayContaining(["SOURCE_CONFLICT_RESOLVED", "FARE_CONDITIONS_INCOMPLETE"]),
    );
  });

  it("keeps the decision trace to sanitized references and reason codes", async () => {
    const a = await assess("ABC123");
    const reconciliation = a.decisionTrace.find((e) => e.step === "RECONCILIATION");
    expect(reconciliation).toMatchObject({
      refs: expect.arrayContaining(["S1"]),
      reasonCode: "SOURCE_CONFLICT_RESOLVED",
    });
    expect(a.decisionTrace.map((e) => e.step)).toEqual(
      expect.arrayContaining(["CONNECTION", "POLICY", "ALTERNATIVE", "RECOMMENDATION"]),
    );
  });

  it("contains no passenger data or raw provider payloads (D09)", async () => {
    const json = JSON.stringify(await assess("ABC123"));
    for (const forbidden of [
      "SYNTHETIC PASSENGER",
      "CHILD",
      "passengers",
      "name",
      "email",
      "phone",
      "document",
      "age",
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("is deterministic for the same inputs", async () => {
    expect(await assess("ABC123")).toEqual(await assess("ABC123"));
  });
});

describe("scenario matrix (S23, A08)", () => {
  it.each([
    [
      "DEMO01",
      "COMPLETE",
      "NONE",
      "NO_ACTION_REQUIRED",
      "LOW",
      { R1: "NOT_APPLICABLE", R2: "NOT_APPLICABLE" },
    ],
    [
      "DEMO02",
      "COMPLETE",
      "WARNING",
      "REVIEW_REBOOKING_OPTIONS",
      "NORMAL",
      { R1: "APPLICABLE", R2: "NOT_APPLICABLE" },
    ],
    ["DEMO03", "INDETERMINATE", "UNKNOWN", "HUMAN_REVIEW", "NORMAL", {}],
    ["DEMO04", "INDETERMINATE", "UNKNOWN", "HUMAN_REVIEW", "NORMAL", {}],
    [
      "DEMO05",
      "COMPLETE",
      "WARNING",
      "REVIEW_REBOOKING_OPTIONS",
      "NORMAL",
      { R1: "APPLICABLE", R2: "APPLICABLE" },
    ],
    [
      "DEMO06",
      "COMPLETE",
      "CRITICAL",
      "REVIEW_REBOOKING_OPTIONS",
      "HIGH",
      { R1: "NOT_APPLICABLE", R3: "APPLICABLE" },
    ],
  ] as const)("%s → %s / %s / %s / %s", async (id, status, severity, type, priority, rules) => {
    const a = await assess(id);
    expect(a).toMatchObject({
      assessmentStatus: status,
      severity,
      recommendation: { type, priority },
    });
    expect(ruleStatuses(a)).toMatchObject(rules);
  });

  it("DEMO01 does not query alternatives when nothing is disrupted", async () => {
    expect((await assess("DEMO01")).alternatives).toEqual({ kind: "NOT_REQUIRED" });
  });

  it("DEMO03 reports an unresolved contradiction as uncertainty, not as on time", async () => {
    const a = await assess("DEMO03");
    expect(a.segments[0]).toMatchObject({
      flightStatus: "UNKNOWN",
      severity: "UNKNOWN",
      delay: { kind: "UNKNOWN" },
    });
    expect(a.warnings).toContain("SOURCE_CONFLICT_UNRESOLVED");
  });

  it("DEMO04 reports stale events as unverified", async () => {
    const a = await assess("DEMO04");
    expect(a.warnings).toContain("OPERATIONAL_DATA_STALE");
    expect(a.segments[0]?.flightStatus).toBe("UNKNOWN");
  });

  it("the original DEMO06 evidence puts the connection at risk without granting R3", async () => {
    const scenario = structuredClone(SCENARIOS["DEMO06"]!);
    const outbound = scenario.events.events.find((e) => e.eventId === "DEMO06-E2");
    if (outbound?.type !== "STATUS") throw new Error("fixture DEMO06-E2 expected");
    delete outbound.actualDeparture;
    delete outbound.delayMinutes;
    outbound.status = "SCHEDULED";
    const a = await assess("DEMO06", createMockProviders({ DEMO06: scenario }));
    expect(a.connection).toMatchObject({
      status: "AT_RISK",
      lossConfirmation: "NOT_CONFIRMED",
      inboundArrival: { confirmed: true },
      marginMinutes: -30,
    });
    expect(ruleStatuses(a)).toMatchObject({ R1: "NOT_APPLICABLE", R3: "INSUFFICIENT_EVIDENCE" });
  });

  it("does not grant R3 when departure is reported as actual before it occurred", async () => {
    const scenario = structuredClone(SCENARIOS["DEMO06"]!);
    const [inbound, outbound] = scenario.events.events;
    if (inbound?.type !== "STATUS" || outbound?.type !== "STATUS")
      throw new Error("fixture status expected");
    inbound.actualArrival = { ...inbound.actualArrival!, local: "2026-09-15T05:55:00-05:00" };
    inbound.recordedAt = "2026-09-15T10:59:00Z";
    outbound.actualDeparture = { ...outbound.actualDeparture!, local: "2026-09-15T05:50:00-05:00" };
    outbound.recordedAt = "2026-09-15T10:40:00Z";
    const a = await assess("DEMO06", createMockProviders({ DEMO06: scenario }));
    expect(a.connection).toMatchObject({ status: "AT_RISK", lossConfirmation: "NOT_CONFIRMED" });
    expect(ruleStatuses(a)).toMatchObject({ R3: "INSUFFICIENT_EVIDENCE" });
  });

  it("DEMO06 confirms loss and grants R3 from actual arrival and departure", async () => {
    const a = await assess("DEMO06");
    expect(a.connection).toMatchObject({
      status: "MISSED",
      lossConfirmation: "CONFIRMED_MISSED",
      inboundArrival: { confirmed: true },
    });
    expect(a.policies).toMatchObject({
      evaluations: expect.arrayContaining([
        expect.objectContaining({ ruleId: "R3", status: "APPLICABLE", benefit: "REBOOK_NO_FEE" }),
      ]),
    });
  });
});

describe("controlled degradation (D10, A06)", () => {
  it.each([
    ["NOT_FOUND", "BOOKING_NOT_FOUND"],
    ["UNAVAILABLE", "UPSTREAM_UNAVAILABLE"],
    ["TIMEOUT", "UPSTREAM_TIMEOUT"],
    ["INVALID_RESPONSE", "INVALID_UPSTREAM_RESPONSE"],
  ] as const)("mandatory booking provider failure %s → %s", async (failure, code) => {
    const trips: TripContextProvider = { getTripContext: fail(failure) };
    expect(await build({ trips })("ABC123")).toEqual({ ok: false, error: { code } });
  });

  it("returns BOOKING_NOT_FOUND for an unknown synthetic booking", async () => {
    expect(await build()("ZZZ999")).toEqual({ ok: false, error: { code: "BOOKING_NOT_FOUND" } });
  });

  it.each(["UNAVAILABLE", "TIMEOUT", "INVALID_RESPONSE"] as const)(
    "events provider %s → INDETERMINATE with human review, never 'no disruption'",
    async (failure) => {
      const events: OperationalEventsProvider = { getOperationalEvents: fail(failure) };
      const a = await assess("ABC123", { events });
      expect(a).toMatchObject({
        assessmentStatus: "INDETERMINATE",
        severity: "UNKNOWN",
        recommendation: { type: "HUMAN_REVIEW", priority: "HIGH" },
      });
      expect(a.warnings).toContain("OPERATIONAL_DATA_UNAVAILABLE");
    },
  );

  it("policies provider failure → PARTIAL and no benefit is evaluated or guaranteed", async () => {
    const policies: PolicyRulesProvider = { getPolicyRules: fail("UNAVAILABLE") };
    const a = await assess("DEMO02", { policies });
    expect(a.assessmentStatus).toBe("PARTIAL");
    expect(a.policies).toEqual({ available: false, failure: "UNAVAILABLE" });
    if (a.alternatives.kind === "EVALUATED") {
      expect(a.alternatives.options.every((o) => o.eligibility !== "ELIGIBLE")).toBe(true);
    }
    expect(a.warnings).toContain("POLICIES_UNAVAILABLE");
  });

  it("alternatives provider failure → PARTIAL and no unverified alternatives", async () => {
    const options = { getEligibleOptions: fail("TIMEOUT") };
    const a = await assess("DEMO02", { options });
    expect(a).toMatchObject({
      assessmentStatus: "PARTIAL",
      alternatives: { kind: "UNAVAILABLE", failure: "TIMEOUT" },
    });
    expect(a.recommendation.type).toBe("HUMAN_REVIEW");
  });

  it("an expired policy grants nothing and degrades the assessment", async () => {
    const policies: PolicyRulesProvider = {
      getPolicyRules: async () => {
        const base = await providers.policies.getPolicyRules({ type: "FLIGHT_DISRUPTION" });
        if (!base.ok) throw new Error("fixture policy expected");
        return { ok: true, value: { ...base.value, validUntil: t("2026-09-15T11:02:40Z") } };
      },
    };
    const a = await assess("DEMO02", { policies });
    expect(a.policies).toMatchObject({ available: true, validity: "EXPIRED", evaluations: [] });
    expect(a.assessmentStatus).toBe("PARTIAL");
    expect(a.warnings).toContain("POLICY_NOT_VALID");
  });

  it("does not hide programming errors behind business results", async () => {
    const trips: TripContextProvider = {
      getTripContext: async () => {
        throw new TypeError("bug in an adapter");
      },
    };
    await expect(build({ trips })("ABC123")).rejects.toThrow("bug in an adapter");
  });
});

describe("connection without evidence of risk (P5)", () => {
  it("a small delay that leaves a positive margin is UNKNOWN, partial and only monitored, never human review", async () => {
    const scenario = structuredClone(SCENARIOS["ABC123"]!);
    const delayed = scenario.events.events.find((e) => e.eventId === "E1");
    if (delayed?.type !== "STATUS") throw new Error("fixture E1 expected");
    delayed.delayMinutes = 20;
    delete delayed.estimatedDeparture;
    const a = await assess("ABC123", createMockProviders({ ABC123: scenario }));
    expect(a.connection).toMatchObject({ status: "UNKNOWN", marginMinutes: 50 });
    expect(a).toMatchObject({
      severity: "INFO",
      assessmentStatus: "PARTIAL",
      recommendation: { type: "MONITOR_FLIGHT" },
    });
  });
});

describe("freshness and simulation (D03)", () => {
  it("rejects a booking context stamped in the future", async () => {
    const scenario = structuredClone(SCENARIOS["ABC123"]!);
    scenario.booking.retrievedAt = "2026-09-15T11:02:41Z";
    expect(await build(createMockProviders({ ABC123: scenario }))("ABC123")).toEqual({
      ok: false,
      error: { code: "STALE_BOOKING_CONTEXT" },
    });
  });

  it("rejects a booking context older than 5 minutes (boundary: 5:00 is fresh, 5:00.001 is stale)", async () => {
    const at = (offsetMs: number) =>
      createSimulationClock(
        new Date(t("2026-09-15T11:00:00Z") + 5 * 60_000 + offsetMs).toISOString(),
      );
    const events = {
      getOperationalEvents: async () => ({ ok: false as const, failure: "UNAVAILABLE" as const }),
    };
    expect(
      (await createAssessDisruption({ ...providers, events, clock: at(0) })("ABC123")).ok,
    ).toBe(true);
    expect(await createAssessDisruption({ ...providers, events, clock: at(1) })("ABC123")).toEqual({
      ok: false,
      error: { code: "STALE_BOOKING_CONTEXT" },
    });
  });

  it("reports the clock mode so historical fixtures are never presented as real time", async () => {
    expect((await assess("ABC123")).mode).toBe("SIMULATION");
  });

  it("starts independent provider queries before awaiting either", async () => {
    const started: string[] = [];
    const release: (() => void)[] = [];
    const gate = () => new Promise<void>((resolve) => release.push(resolve));
    const events: OperationalEventsProvider = {
      getOperationalEvents: async (ids) => {
        started.push("events");
        await gate();
        return providers.events.getOperationalEvents(ids);
      },
    };
    const policies: PolicyRulesProvider = {
      getPolicyRules: async (scenario) => {
        started.push("policies");
        await gate();
        return providers.policies.getPolicyRules(scenario);
      },
    };
    const pending = build({ events, policies })("ABC123");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(started.sort()).toEqual(["events", "policies"]);
    release.forEach((r) => r());
    expect((await pending).ok).toBe(true);
  });
});
