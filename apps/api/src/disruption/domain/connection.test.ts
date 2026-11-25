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

  it("confirms MISSED when the confirmed actual arrival is at or after the outbound departure (DEMO06)", () => {
    const result = evaluate(
      resolved({
        status: "DELAYED",
        delayMinutes: 100,
        actualArrival: t("2026-09-15T19:35:00-05:00"),
      }),
      onSchedule,
    );
    expect(result).toMatchObject({
      status: "MISSED",
      lossConfirmation: "CONFIRMED_MISSED",
      inboundArrival: { confirmed: true },
      marginMinutes: -30,
    });
    const boundary = evaluate(
      resolved({
        status: "DELAYED",
        delayMinutes: 70,
        actualArrival: t("2026-09-15T19:05:00-05:00"),
      }),
      onSchedule,
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
      onSchedule,
    );
    expect(result).toMatchObject({
      status: "SAFE",
      lossConfirmation: "CONFIRMED_NOT_MISSED",
      marginMinutes: 75,
    });
  });

  it("confirms MISSED when the inbound flight is cancelled by the primary source", () => {
    expect(evaluate(resolved({ status: "CANCELLED" }), onSchedule)).toMatchObject({
      status: "MISSED",
      lossConfirmation: "CONFIRMED_MISSED",
    });
  });
});
