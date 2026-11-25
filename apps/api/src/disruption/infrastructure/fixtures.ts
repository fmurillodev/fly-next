import type { RawBooking, RawEvents, RawOptions, RawPolicy } from "./provider-payloads.js";

/**
 * Synthetic fixtures only (S22). Passenger names are placeholders that the mappers must drop.
 * Times follow A02 (explicit offsets, per-date IANA zones); block times are not meant to be realistic.
 */
export interface ScenarioFixture {
  readonly booking: RawBooking;
  readonly events: RawEvents;
  readonly options: RawOptions;
}

const SCL = { iata: "SCL", country: "CL", timeZone: "America/Santiago" };
const LIM = { iata: "LIM", country: "PE", timeZone: "America/Lima" };
const MEX = { iata: "MEX", country: "MX", timeZone: "America/Mexico_City" };
const SANTIAGO = "America/Santiago";
const LIMA = "America/Lima";
const MEXICO = "America/Mexico_City";
const AT = (local: string, timeZone: string) => ({ local, timeZone });

const OPERATIONAL = {
  OPS_CORE: "OPERATIONAL",
  AIRPORT_FEED: "OPERATIONAL",
  LEGACY_MIRROR: "OPERATIONAL",
} as const;
const FRESH_OPTION = { retrievedAt: "2026-09-15T11:01:40Z", ttlSeconds: 120 } as const;

const adults = (count: number): RawBooking["passengers"] =>
  Array.from({ length: count }, (_, i) => ({
    name: `SYNTHETIC PASSENGER ${i + 1}`,
    type: "ADULT" as const,
  }));
const knownFare = { changesAllowed: true, changePenalty: { type: "NONE" as const } };

const directTrip = (ref: string, flight: string): RawBooking => ({
  bookingRef: ref,
  retrievedAt: "2026-09-15T11:00:00Z",
  passengers: adults(2),
  segments: [
    {
      segmentId: `${ref}-S1`,
      flightNumber: flight,
      origin: SCL,
      destination: LIM,
      departure: AT("2026-09-15T14:30:00-03:00", SANTIAGO),
      arrival: AT("2026-09-15T17:55:00-05:00", LIMA),
    },
  ],
  fare: knownFare,
  compensationRequested: false,
});

const statusEvent = (
  eventId: string,
  segmentId: string,
  source: "OPS_CORE" | "AIRPORT_FEED" | "LEGACY_MIRROR",
  recordedAt: string,
  rest: {
    status: "SCHEDULED" | "ON_TIME" | "DELAYED" | "CANCELLED";
    delayMinutes?: number;
  } & Record<string, unknown>,
): RawEvents["events"][number] =>
  ({ eventId, segmentId, source, recordedAt, type: "STATUS", ...rest }) as never;

const rebookingOption = (
  id: string,
  flight: string,
  departure: ReturnType<typeof AT>,
  origin: string,
): RawOptions[number] => ({
  optionId: id,
  kind: "FLIGHT",
  flightNumber: flight,
  origin,
  destination: origin === "SCL" ? "LIM" : "MEX",
  departure,
  ...FRESH_OPTION,
  seatsAvailable: 4,
  fareDifference: { amount: 0, currency: "CLP" },
  confidence: "HIGH",
});

const delayedDirect = (ref: string, flight: string, delay: number): ScenarioFixture => ({
  booking: directTrip(ref, flight),
  events: {
    sources: OPERATIONAL,
    events: [
      statusEvent(`${ref}-E1`, `${ref}-S1`, "OPS_CORE", "2026-09-15T10:55:00Z", {
        status: "DELAYED",
        delayMinutes: delay,
        estimatedDeparture: AT(
          `2026-09-15T${String(14 + Math.floor((30 + delay) / 60)).padStart(2, "0")}:${String((30 + delay) % 60).padStart(2, "0")}:00-03:00`,
          SANTIAGO,
        ),
      }),
    ],
  },
  options: [
    rebookingOption(`${ref}-O1`, "LA1001", AT("2026-09-15T20:30:00-03:00", SANTIAGO), "SCL"),
  ],
});

export const POLICY_PAYLOAD: RawPolicy = {
  policyId: "POL-DELAY-2026-03",
  version: "2026.03",
  status: "ACTIVE",
  validFrom: "2026-03-01T00:00:00Z",
  validUntil: "2027-03-01T00:00:00Z",
  rules: [
    { ruleId: "R1", benefit: "REBOOK_NO_FEE" },
    { ruleId: "R2", benefit: "MEAL_VOUCHER" },
    { ruleId: "R3", benefit: "REBOOK_NO_FEE" },
    { ruleId: "R4", benefit: "CASH_COMPENSATION" },
    { ruleId: "R5", benefit: "PRIORITY_HANDLING" },
  ],
};

const ABC123: ScenarioFixture = {
  booking: {
    bookingRef: "ABC123",
    retrievedAt: "2026-09-15T11:00:00Z",
    passengers: [
      { name: "SYNTHETIC PASSENGER A", type: "ADULT" },
      { name: "SYNTHETIC PASSENGER B", type: "CHILD" },
    ],
    segments: [
      {
        segmentId: "S1",
        flightNumber: "LA500",
        origin: SCL,
        destination: LIM,
        departure: AT("2026-09-15T14:30:00-03:00", SANTIAGO),
        arrival: AT("2026-09-15T17:55:00-05:00", LIMA),
      },
      {
        segmentId: "S2",
        flightNumber: "LA2410",
        origin: LIM,
        destination: MEX,
        departure: AT("2026-09-15T19:05:00-05:00", LIMA),
        arrival: AT("2026-09-15T23:40:00-06:00", MEXICO),
      },
    ],
    fare: { changesAllowed: true, changePenalty: null },
    compensationRequested: false,
  },
  events: {
    sources: { OPS_CORE: "OPERATIONAL", AIRPORT_FEED: "OPERATIONAL", LEGACY_MIRROR: "DEGRADED" },
    events: [
      statusEvent("E1", "S1", "OPS_CORE", "2026-09-15T10:55:00Z", {
        status: "DELAYED",
        delayMinutes: 160,
        estimatedDeparture: AT("2026-09-15T17:10:00-03:00", SANTIAGO),
      }),
      statusEvent("E2", "S2", "OPS_CORE", "2026-09-15T10:55:00Z", { status: "SCHEDULED" }),
      {
        eventId: "E3",
        segmentId: "S1",
        source: "AIRPORT_FEED",
        recordedAt: "2026-09-15T10:58:00Z",
        type: "GATE",
        gate: "24",
      },
      statusEvent("E4", "S1", "LEGACY_MIRROR", "2026-09-15T10:40:00Z", { status: "ON_TIME" }),
    ],
  },
  options: [
    { ...rebookingOption("O1", "LA2412", AT("2026-09-16T08:15:00-05:00", LIMA), "LIM") },
    {
      ...rebookingOption("O2", "LA2450", AT("2026-09-15T23:40:00-05:00", LIMA), "LIM"),
      seatsAvailable: 1,
      fareDifference: { amount: 180000, currency: "CLP" },
      confidence: "MEDIUM",
    },
    {
      optionId: "O3",
      kind: "REFUND",
      ...FRESH_OPTION,
      seatsAvailable: null,
      fareDifference: null,
      confidence: "LOW",
    },
  ],
};

const DEMO01: ScenarioFixture = {
  booking: directTrip("DEMO01", "LA501"),
  events: {
    sources: OPERATIONAL,
    events: [
      statusEvent("DEMO01-E1", "DEMO01-S1", "OPS_CORE", "2026-09-15T10:55:00Z", {
        status: "ON_TIME",
      }),
    ],
  },
  options: [],
};

const DEMO03: ScenarioFixture = {
  booking: directTrip("DEMO03", "LA503"),
  events: {
    // OPS_CORE is degraded and LEGACY_MIRROR contradicts it: nothing can settle the conflict.
    sources: { OPS_CORE: "DEGRADED", AIRPORT_FEED: "OPERATIONAL", LEGACY_MIRROR: "OPERATIONAL" },
    events: [
      statusEvent("DEMO03-E1", "DEMO03-S1", "OPS_CORE", "2026-09-15T10:55:00Z", {
        status: "DELAYED",
        delayMinutes: 200,
      }),
      statusEvent("DEMO03-E2", "DEMO03-S1", "LEGACY_MIRROR", "2026-09-15T10:55:00Z", {
        status: "ON_TIME",
      }),
    ],
  },
  options: [],
};

const DEMO04: ScenarioFixture = {
  booking: directTrip("DEMO04", "LA504"),
  events: {
    sources: OPERATIONAL,
    events: [
      statusEvent("DEMO04-E1", "DEMO04-S1", "OPS_CORE", "2026-09-15T10:17:00Z", {
        status: "DELAYED",
        delayMinutes: 200,
      }),
    ],
  },
  options: [],
};

// The confirmed arrival must precede the simulation reference, so DEMO06 flies early in the morning.
const DEMO06: ScenarioFixture = {
  booking: {
    bookingRef: "DEMO06",
    retrievedAt: "2026-09-15T11:00:00Z",
    passengers: adults(2),
    segments: [
      {
        segmentId: "DEMO06-S1",
        flightNumber: "LA506",
        origin: SCL,
        destination: LIM,
        departure: AT("2026-09-15T00:30:00-03:00", SANTIAGO),
        arrival: AT("2026-09-15T03:30:00-05:00", LIMA),
      },
      {
        segmentId: "DEMO06-S2",
        flightNumber: "LA2506",
        origin: LIM,
        destination: MEX,
        departure: AT("2026-09-15T04:40:00-05:00", LIMA),
        arrival: AT("2026-09-15T08:20:00-06:00", MEXICO),
      },
    ],
    fare: knownFare,
    compensationRequested: false,
  },
  events: {
    sources: OPERATIONAL,
    events: [
      statusEvent("DEMO06-E1", "DEMO06-S1", "OPS_CORE", "2026-09-15T10:50:00Z", {
        status: "DELAYED",
        delayMinutes: 100,
        actualArrival: AT("2026-09-15T05:10:00-05:00", LIMA),
      }),
      statusEvent("DEMO06-E2", "DEMO06-S2", "OPS_CORE", "2026-09-15T10:50:00Z", {
        status: "DELAYED",
        delayMinutes: 5,
        actualDeparture: AT("2026-09-15T04:45:00-05:00", LIMA),
      }),
    ],
  },
  options: [rebookingOption("DEMO06-O1", "LA2412", AT("2026-09-15T08:15:00-05:00", LIMA), "LIM")],
};

export const SCENARIOS: Readonly<Record<string, ScenarioFixture>> = {
  ABC123,
  DEMO01,
  DEMO02: delayedDirect("DEMO02", "LA502", 190),
  DEMO03,
  DEMO04,
  DEMO05: delayedDirect("DEMO05", "LA505", 250),
  DEMO06,
};
