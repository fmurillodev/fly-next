import { describe, expect, it } from "vitest";
import { DEFAULT_ASSESSMENT_CONFIG } from "./config.js";
import type { FlightStatusEvent, GateEvent } from "./model.js";
import { reconcileSegment } from "./reconciliation.js";
import { NOW, OPERATIONAL, minutesAgo, withStatus } from "./testing.js";

const status = (
  id: string,
  source: FlightStatusEvent["source"],
  recordedMinutesAgo: number,
  facts: Pick<FlightStatusEvent, "status"> & Partial<FlightStatusEvent>,
): FlightStatusEvent => ({
  id,
  kind: "FLIGHT_STATUS",
  segmentId: "S1",
  source,
  recordedAt: minutesAgo(recordedMinutesAgo),
  ...facts,
});
const gate = (
  id: string,
  source: GateEvent["source"],
  recordedMinutesAgo: number,
  value: string,
): GateEvent => ({
  id,
  kind: "GATE",
  segmentId: "S1",
  source,
  recordedAt: minutesAgo(recordedMinutesAgo),
  gate: value,
});
const run = (events: (FlightStatusEvent | GateEvent)[], sourceStatus = OPERATIONAL) =>
  reconcileSegment("S1", events, sourceStatus, NOW, DEFAULT_ASSESSMENT_CONFIG);

describe("reconcileSegment: authority per field (D02)", () => {
  it("lets OPS_CORE win over a degraded LEGACY_MIRROR and records the contradiction (ABC123)", () => {
    const result = run(
      [
        status("e1", "OPS_CORE", 7, { status: "DELAYED", delayMinutes: 160 }),
        status("e2", "LEGACY_MIRROR", 22, { status: "ON_TIME" }),
      ],
      withStatus({ LEGACY_MIRROR: "DEGRADED" }),
    );
    expect(result.status).toMatchObject({
      kind: "RESOLVED",
      basis: "PRIMARY_SOURCE",
      eventId: "e1",
      value: { status: "DELAYED", delayMinutes: 160 },
    });
    expect(result.contradictions).toEqual([
      {
        segmentId: "S1",
        field: "FLIGHT_STATUS",
        eventIds: ["e1", "e2"],
        outcome: "RESOLVED_BY_AUTHORITY",
      },
    ]);
  });

  it("resolves gates by AIRPORT_FEED authority, not by a global provider ranking", () => {
    const result = run([
      gate("g1", "AIRPORT_FEED", 4, "24"),
      gate("g2", "OPS_CORE", 2, "12"),
      status("e1", "OPS_CORE", 7, { status: "SCHEDULED" }),
    ]);
    expect(result.gate).toMatchObject({ kind: "RESOLVED", basis: "PRIMARY_SOURCE", value: "24" });
    expect(result.status).toMatchObject({ kind: "RESOLVED", basis: "PRIMARY_SOURCE" });
  });

  it("keeps the latest event when one source emits equivalent valid events", () => {
    const result = run([
      status("old", "OPS_CORE", 20, { status: "DELAYED", delayMinutes: 60 }),
      status("new", "OPS_CORE", 5, { status: "DELAYED", delayMinutes: 90 }),
    ]);
    expect(result.status).toMatchObject({
      kind: "RESOLVED",
      eventId: "new",
      value: { delayMinutes: 90 },
    });
  });

  it("returns explicit uncertainty when one source gives conflicting facts at the same timestamp", () => {
    const result = run([
      status("a", "OPS_CORE", 5, { status: "DELAYED", delayMinutes: 60 }),
      status("b", "OPS_CORE", 5, { status: "ON_TIME" }),
    ]);
    expect(result.status).toEqual({ kind: "UNRESOLVED", reason: "CONTRADICTION" });
  });

  it("does not let a degraded primary and an operational secondary settle a contradiction (DEMO03)", () => {
    const result = run(
      [
        status("e1", "OPS_CORE", 5, { status: "DELAYED", delayMinutes: 200 }),
        status("e2", "LEGACY_MIRROR", 5, { status: "ON_TIME" }),
      ],
      withStatus({ OPS_CORE: "DEGRADED" }),
    );
    expect(result.status).toEqual({ kind: "UNRESOLVED", reason: "CONTRADICTION" });
    expect(result.contradictions[0]?.outcome).toBe("UNRESOLVED");
  });

  it("never grounds a decision on a degraded source alone", () => {
    const result = run(
      [status("e1", "OPS_CORE", 5, { status: "DELAYED", delayMinutes: 200 })],
      withStatus({ OPS_CORE: "DEGRADED" }),
    );
    expect(result.status).toEqual({ kind: "UNRESOLVED", reason: "DEGRADED_SOURCE_ONLY" });
  });

  it("accepts an operational secondary source only as secondary basis", () => {
    const result = run([status("e1", "LEGACY_MIRROR", 5, { status: "ON_TIME" })]);
    expect(result.status).toMatchObject({ kind: "RESOLVED", basis: "SECONDARY_SOURCE" });
  });

  it("reports NO_DATA when nothing was recorded", () => {
    expect(run([]).status).toEqual({ kind: "UNRESOLVED", reason: "NO_DATA" });
  });
});

describe("reconcileSegment: freshness windows (D03) at exact boundaries", () => {
  it("treats an event exactly 30 minutes old as fresh and 30 min 1 s as stale", () => {
    const fresh = run([status("e1", "OPS_CORE", 30, { status: "ON_TIME" })]);
    expect(fresh.status.kind).toBe("RESOLVED");
    const stale = run([
      { ...status("e1", "OPS_CORE", 30, { status: "ON_TIME" }), recordedAt: minutesAgo(30) - 1000 },
    ]);
    expect(stale.status).toEqual({ kind: "UNRESOLVED", reason: "STALE_DATA" });
  });

  it("applies the shorter 15-minute window to gates", () => {
    expect(run([gate("g1", "AIRPORT_FEED", 15, "24")]).gate.kind).toBe("RESOLVED");
    const stale = run([
      { ...gate("g1", "AIRPORT_FEED", 15, "24"), recordedAt: minutesAgo(15) - 1000 },
    ]);
    expect(stale.gate).toEqual({ kind: "UNRESOLVED", reason: "STALE_DATA" });
  });

  it("ignores a stale contradicting event instead of reporting a conflict", () => {
    const result = run([
      status("e1", "OPS_CORE", 5, { status: "DELAYED", delayMinutes: 160 }),
      status("e2", "LEGACY_MIRROR", 45, { status: "ON_TIME" }),
    ]);
    expect(result.status.kind).toBe("RESOLVED");
    expect(result.contradictions).toEqual([]);
  });
});
