import { describe, expect, it } from "vitest";
import type { FlightStatusFacts, Resolved } from "./model.js";
import { evaluateConnection } from "./connection.js";
import { S1, S2, t } from "./testing.js";

const resolved = (
  value: FlightStatusFacts,
  basis: "PRIMARY_SOURCE" | "SECONDARY_SOURCE" = "PRIMARY_SOURCE",
): Resolved<FlightStatusFacts> => ({ kind: "RESOLVED", value, basis, eventId: "e", recordedAt: 0 });
const unresolved: Resolved<FlightStatusFacts> = { kind: "UNRESOLVED", reason: "NO_DATA" };

const evaluate = (inbound: Resolved<FlightStatusFacts>, outbound: Resolved<FlightStatusFacts>) =>
  evaluateConnection({ segment: S1, status: inbound }, { segment: S2, status: outbound });

const onSchedule = resolved({ status: "SCHEDULED" });

describe("evaluateConnection (D04)", () => {
  it("ABC123: 160-minute delay projects a negative margin, AT_RISK, loss not confirmed", () => {
    const result = evaluate(resolved({ status: "DELAYED", delayMinutes: 160 }), onSchedule);
    expect(result).toMatchObject({
      status: "AT_RISK",
      lossConfirmation: "NOT_CONFIRMED",
      originalConnectionMinutes: 70,
      inboundArrival: { at: t("2026-09-15T20:35:00-05:00"), confirmed: false },
      marginMinutes: -90,
    });
  });

  it("never declares MISSED from a projection, even when the projected margin is negative", () => {
    expect(evaluate(resolved({ status: "DELAYED", delayMinutes: 600 }), onSchedule).status).toBe(
      "AT_RISK",
    );
  });

  it("is SAFE only when both flights are confirmed and the booked margin is preserved", () => {
    expect(evaluate(onSchedule, onSchedule)).toMatchObject({
      status: "SAFE",
      lossConfirmation: "NOT_CONFIRMED",
    });
  });

  it("does not call a reduced but still positive margin AT_RISK without evidence: it stays UNKNOWN (P5)", () => {
    const result = evaluate(resolved({ status: "DELAYED", delayMinutes: 5 }), onSchedule);
    expect(result).toMatchObject({
      status: "UNKNOWN",
      lossConfirmation: "NOT_CONFIRMED",
      marginMinutes: 65,
    });
  });

  it.each([
    [69, 1, "UNKNOWN"],
    [70, 0, "AT_RISK"],
    [71, -1, "AT_RISK"],
  ] as const)(
    "projected margin boundary: %d-minute delay leaves %d min → %s",
    (delay, margin, expected) => {
      const result = evaluate(resolved({ status: "DELAYED", delayMinutes: delay }), onSchedule);
      expect(result).toMatchObject({ status: expected, marginMinutes: margin });
    },
  );

  it("treats an unconfirmed cancellation report as operational evidence of risk, not as a missed connection", () => {
    expect(
      evaluate(resolved({ status: "CANCELLED" }, "SECONDARY_SOURCE"), onSchedule),
    ).toMatchObject({
      status: "AT_RISK",
      lossConfirmation: "NOT_CONFIRMED",
    });
    expect(evaluate(onSchedule, resolved({ status: "CANCELLED" }, "SECONDARY_SOURCE")).status).toBe(
      "AT_RISK",
    );
  });

  it("does not claim SAFE from secondary-source data", () => {
    expect(evaluate(resolved({ status: "ON_TIME" }, "SECONDARY_SOURCE"), onSchedule).status).toBe(
      "UNKNOWN",
    );
  });

  it("is UNKNOWN when a segment is unresolved", () => {
    expect(evaluate(unresolved, onSchedule)).toMatchObject({
      status: "UNKNOWN",
      lossConfirmation: "NOT_CONFIRMED",
    });
  });

  it.each([
    ["R3-mixed-source-missed", 80, "19:10", "SECONDARY_SOURCE", "AT_RISK", -5],
    ["R4-001", 75, undefined, "SECONDARY_SOURCE", "AT_RISK", -5],
    ["mixed-source SAFE", -5, undefined, "SECONDARY_SOURCE", "UNKNOWN", 75],
    ["primary schedule", 75, undefined, "PRIMARY_SOURCE", "AT_RISK", -5],
    ["primary estimate", 80, "19:10", "PRIMARY_SOURCE", "AT_RISK", -5],
  ] as const)(
    "%s does not confirm a connection outcome",
    (_, delay, estimate, basis, status, marginMinutes) => {
      const at = S1.scheduledArrival + delay * 60_000;
      const outbound = estimate
        ? { status: "DELAYED" as const, estimatedDeparture: t(`2026-09-15T${estimate}:00-05:00`) }
        : { status: "SCHEDULED" as const };
      expect(
        evaluate(
          resolved({ status: delay > 0 ? "DELAYED" : "ON_TIME", actualArrival: at }),
          resolved(outbound, basis),
        ),
      ).toMatchObject({
        status,
        lossConfirmation: "NOT_CONFIRMED",
        inboundArrival: { at, confirmed: true },
        marginMinutes,
      });
    },
  );

  it("confirms MISSED only when confirmed arrival is at or after confirmed actual departure", () => {
    const departed = resolved({
      status: "ON_TIME",
      actualDeparture: t("2026-09-15T18:55:00-05:00"),
    });
    const result = evaluate(
      resolved({
        status: "DELAYED",
        actualArrival: t("2026-09-15T19:00:00-05:00"),
      }),
      departed,
    );
    expect(result).toMatchObject({
      status: "MISSED",
      lossConfirmation: "CONFIRMED_MISSED",
      inboundArrival: { confirmed: true },
      marginMinutes: -5,
    });
    const boundary = evaluate(
      resolved({
        status: "DELAYED",
        actualArrival: t("2026-09-15T18:55:00-05:00"),
      }),
      departed,
    );
    expect(boundary.status).toBe("MISSED");
  });

  it("a confirmed arrival with a positive but reduced margin is not enough to call it safe or at risk", () => {
    const result = evaluate(
      resolved({
        status: "DELAYED",
        delayMinutes: 60,
        actualArrival: t("2026-09-15T18:55:00-05:00"),
      }),
      onSchedule,
    );
    expect(result).toMatchObject({
      status: "UNKNOWN",
      lossConfirmation: "NOT_CONFIRMED",
      marginMinutes: 10,
    });
  });

  it("confirms not missed (SAFE) when the confirmed arrival preserves the booked margin", () => {
    const result = evaluate(
      resolved({ status: "ON_TIME", actualArrival: t("2026-09-15T17:50:00-05:00") }),
      resolved({ status: "ON_TIME", actualDeparture: S2.scheduledDeparture }),
    );
    expect(result).toMatchObject({
      status: "SAFE",
      lossConfirmation: "CONFIRMED_NOT_MISSED",
      marginMinutes: 75,
    });
  });

  it("does not infer a missed connection from either primary-source cancellation", () => {
    const cancelled = resolved({ status: "CANCELLED" });
    for (const result of [evaluate(cancelled, onSchedule), evaluate(onSchedule, cancelled)]) {
      expect(result).toMatchObject({ status: "AT_RISK", lossConfirmation: "NOT_CONFIRMED" });
    }
  });
});
