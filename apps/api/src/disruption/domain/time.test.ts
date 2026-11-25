import { describe, expect, it } from "vitest";
import { instantFromIso, minutesBetween, offsetFromIso, utcOffsetMinutes } from "./time.js";

describe("instantFromIso", () => {
  it("normalizes explicit offsets to the same UTC instant", () => {
    expect(instantFromIso("2026-09-15T17:10:00-03:00")).toBe(
      instantFromIso("2026-09-15T20:10:00Z"),
    );
  });

  it.each(["2026-09-15T17:10:00", "2026-09-15", "not-a-date", "2026-13-40T00:00:00Z"])(
    "rejects %s (missing offset or invalid)",
    (value) => {
      expect(() => instantFromIso(value)).toThrow(RangeError);
    },
  );
});

describe("utcOffsetMinutes", () => {
  it.each([
    ["America/Santiago", "2026-09-15T12:00:00Z", -180],
    ["America/Lima", "2026-09-15T12:00:00Z", -300],
    ["America/Mexico_City", "2026-09-15T12:00:00Z", -360],
  ])("resolves %s on 2026-09-15 as %d", (zone, iso, expected) => {
    expect(utcOffsetMinutes(instantFromIso(iso), zone)).toBe(expected);
  });

  it("resolves offsets per date, never as a constant (Santiago DST starts 2026-09-06)", () => {
    expect(utcOffsetMinutes(instantFromIso("2026-09-05T12:00:00Z"), "America/Santiago")).toBe(-240);
    expect(utcOffsetMinutes(instantFromIso("2026-09-07T12:00:00Z"), "America/Santiago")).toBe(-180);
  });
});

describe("offsetFromIso / minutesBetween", () => {
  it("reads the declared offset", () => {
    expect(offsetFromIso("2026-09-15T17:10:00-03:00")).toBe(-180);
    expect(offsetFromIso("2026-09-15T17:10:00Z")).toBe(0);
  });

  it("computes durations in UTC across zones", () => {
    const arrival = instantFromIso("2026-09-15T17:55:00-05:00");
    const departure = instantFromIso("2026-09-15T19:05:00-05:00");
    expect(minutesBetween(arrival, departure)).toBe(70);
  });
});
