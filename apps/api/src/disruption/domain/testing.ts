import { instantFromIso } from "./time.js";
import type { Airport, FlightSegment, Instant, SourceId, SourceStatus } from "./model.js";

/** Test-only builders for the domain suites. */
export const t = (iso: string): Instant => instantFromIso(iso);

export const SCL: Airport = { code: "SCL", country: "CL", timeZone: "America/Santiago" };
export const LIM: Airport = { code: "LIM", country: "PE", timeZone: "America/Lima" };
export const MEX: Airport = { code: "MEX", country: "MX", timeZone: "America/Mexico_City" };

export const S1: FlightSegment = {
  id: "S1",
  flightNumber: "LA500",
  origin: SCL,
  destination: LIM,
  scheduledDeparture: t("2026-09-15T14:30:00-03:00"),
  scheduledArrival: t("2026-09-15T17:55:00-05:00"),
};
export const S2: FlightSegment = {
  id: "S2",
  flightNumber: "LA2410",
  origin: LIM,
  destination: MEX,
  scheduledDeparture: t("2026-09-15T19:05:00-05:00"),
  scheduledArrival: t("2026-09-15T23:40:00-06:00"),
};

export const NOW = t("2026-09-15T11:02:40Z");
export const minutesAgo = (m: number, now: Instant = NOW): Instant => now - m * 60_000;

export const OPERATIONAL: Record<SourceId, SourceStatus> = {
  OPS_CORE: "OPERATIONAL",
  AIRPORT_FEED: "OPERATIONAL",
  LEGACY_MIRROR: "OPERATIONAL",
};
export const withStatus = (
  overrides: Partial<Record<SourceId, SourceStatus>>,
): Record<SourceId, SourceStatus> => ({ ...OPERATIONAL, ...overrides });
