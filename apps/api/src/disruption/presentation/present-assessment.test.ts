import { AssessmentResponseSchema, type AssessmentResponse } from "@flynext/contracts";
import { describe, expect, it } from "vitest";
import {
  createAssessDisruption,
  type AssessDisruptionDeps,
  type DisruptionAssessment,
} from "../application/assess-disruption.js";
import { createSimulationClock } from "../infrastructure/clock.js";
import { SCENARIOS, type ScenarioFixture } from "../infrastructure/fixtures.js";
import { createMockProviders } from "../infrastructure/mock-providers.js";
import { presentAssessment } from "./present-assessment.js";

function fixture(id: string): ScenarioFixture {
  const found = SCENARIOS[id];
  if (!found) throw new Error(`Missing fixture ${id}`);
  return structuredClone(found);
}

async function assess(
  id: string,
  scenario = fixture(id),
  overrides: Partial<AssessDisruptionDeps> = {},
): Promise<DisruptionAssessment> {
  const assessDisruption = createAssessDisruption({
    ...createMockProviders({ [id]: scenario }),
    clock: createSimulationClock(),
    ...overrides,
  });
  const result = await assessDisruption(id);
  if (!result.ok) throw new Error(result.error.code);
  return result.assessment;
}

function present(assessment: DisruptionAssessment, requestId = "req_01"): AssessmentResponse {
  const response = presentAssessment(assessment, requestId);
  expect(AssessmentResponseSchema.parse(response)).toStrictEqual(response);
  return response;
}

function time(local: string, timeZone: string, utc: string) {
  return { local, timeZone, utc };
}

function passengerCopy(dto: AssessmentResponse) {
  return [
    dto.disruption.summary,
    ...dto.disruption.events.map((event) => event.message),
    ...(dto.connection ? [dto.connection.message] : []),
    dto.recommendation.message,
    ...(dto.alternatives.status === "EVALUATED"
      ? dto.alternatives.options.map((option) => option.message)
      : []),
    ...dto.warnings,
    ...(dto.metadata.notice ? [dto.metadata.notice] : []),
  ]
    .flatMap((message) => [
      message.title,
      message.message,
      ...("nextSteps" in message ? (message.nextSteps ?? []) : []),
    ])
    .join("\n");
}

const lima = "America/Lima";
const santiago = "America/Santiago";
const notApplicable = "NOT_APPLICABLE";
const ruleStatuses = (dto: AssessmentResponse) =>
  dto.policies.available ? dto.policies.evaluations.map((evaluation) => evaluation.status) : [];

describe("public assessment examples", () => {
  it("presents ABC123 as a partial critical assessment, not as a missed connection", async () => {
    const assessment = await assess("ABC123");
    const dto = present(assessment);
    expect(present(assessment)).toStrictEqual(dto);
    expect(dto).toMatchObject({
      requestId: "req_01",
      assessmentStatus: "PARTIAL",
      disruption: {
        severity: "CRITICAL",
        summary: { code: "DISRUPTION_CRITICAL" },
        events: [
          {
            segmentId: "S1",
            flightNumber: "LA500",
            flightStatus: "DELAYED",
            severity: "WARNING",
            origin: { code: "SCL", timeZone: santiago },
            destination: { code: "LIM", timeZone: lima },
            scheduledDeparture: time("2026-09-15T14:30:00-03:00", santiago, "2026-09-15T17:30:00Z"),
            scheduledArrival: time("2026-09-15T17:55:00-05:00", lima, "2026-09-15T22:55:00Z"),
            estimatedDeparture: time("2026-09-15T17:10:00-03:00", santiago, "2026-09-15T20:10:00Z"),
            delay: { status: "CONFIRMED", minutes: 160 },
            gate: { status: "KNOWN", value: "24" },
            message: {
              code: "FLIGHT_DELAYED_CONFIRMED",
              title: "Tu vuelo LA500 está retrasado",
              message:
                "El retraso confirmado para el vuelo LA500 es de 160 minutos. Su hora estimada de salida es 17:10 (hora de Santiago). Puerta de embarque: 24.",
            },
          },
          {
            segmentId: "S2",
            flightNumber: "LA2410",
            flightStatus: "SCHEDULED",
            severity: "NONE",
            scheduledDeparture: time("2026-09-15T19:05:00-05:00", lima, "2026-09-16T00:05:00Z"),
            delay: { status: "NOT_DELAYED" },
            gate: { status: "UNKNOWN", reason: "UNAVAILABLE" },
            message: { code: "FLIGHT_ON_SCHEDULE" },
          },
        ],
      },
      connection: {
        status: "AT_RISK",
        lossConfirmation: "NOT_CONFIRMED",
        originalConnectionMinutes: 70,
        marginMinutes: -90,
        inboundArrival: {
          time: time("2026-09-15T20:35:00-05:00", lima, "2026-09-16T01:35:00Z"),
          confirmed: false,
        },
        message: { code: "CONNECTION_AT_RISK_PROJECTED_DELAY" },
      },
      recommendation: {
        type: "HUMAN_REVIEW",
        priority: "HIGH",
        reasonCodes: [
          "CONNECTION_AT_RISK",
          "PRIORITY_REVIEW_REQUIRED",
          "INCOMPLETE_FARE_CONDITIONS",
        ],
        message: { code: "RECOMMENDATION_HUMAN_REVIEW" },
      },
      actions: { executed: [], recommended: ["HUMAN_REVIEW"] },
      alternatives: {
        status: "EVALUATED",
        options: [
          {
            optionId: "O1",
            flightNumber: "LA2412",
            eligibility: "PENDING_VALIDATION",
            departure: time("2026-09-16T08:15:00-05:00", lima, "2026-09-16T13:15:00Z"),
            reasonCodes: [
              "REACHABILITY_UNCONFIRMED",
              "FARE_CONDITIONS_INCOMPLETE",
              "REBOOKING_NOT_AUTHORIZED_BY_POLICY",
            ],
            message: { code: "OPTION_PENDING_VALIDATION" },
          },
          {
            optionId: "O2",
            flightNumber: "LA2450",
            eligibility: "NOT_ELIGIBLE",
            reasonCodes: ["INSUFFICIENT_SEATS_FOR_GROUP"],
            message: { code: "OPTION_NOT_ELIGIBLE_SEATS" },
          },
          {
            optionId: "O3",
            kind: "REFUND",
            eligibility: "REQUIRES_REVIEW",
            reasonCodes: ["REFUND_REQUIRES_REVIEW", "LOW_CONFIDENCE"],
            message: { code: "OPTION_REFUND_REQUIRES_REVIEW" },
          },
        ],
      },
      metadata: {
        assessedAt: "2026-09-15T11:02:40Z",
        mode: "SIMULATION",
        dataSnapshot: "historical-fixture",
        locale: "es",
        policyRefs: [{ id: "POL-DELAY-2026-03", version: "2026.03" }],
        notice: { code: "SIMULATION_MODE" },
      },
    });
    expect(ruleStatuses(dto)).toEqual([
      notApplicable,
      notApplicable,
      "INSUFFICIENT_EVIDENCE",
      notApplicable,
      "REQUIRES_HUMAN_APPROVAL",
    ]);
    expect(dto.warnings.map((warning) => warning.code)).toEqual([
      "SOURCE_CONFLICT_RESOLVED",
      "FARE_CONDITIONS_INCOMPLETE",
    ]);
    expect(dto.connection?.message.message).toMatch(/estimamos[^.]*20:35 \(hora de Lima\)/i);
    expect(dto.connection?.message.message).toMatch(/salida programada[^.]*19:05/i);
    expect(dto.connection?.message.message).toMatch(/70 minutos para conectar/i);
    expect(dto.recommendation.message.message).toMatch(
      /atención prioritaria.*no podemos garantizar.*sin costo.*compensación/i,
    );
    expect(passengerCopy(dto)).toMatch(/no refleja información operacional en tiempo real/i);
    expect(passengerCopy(dto)).not.toMatch(/perdiste|conexión perdida|undefined|[A-Z]+_[A-Z_]+/);
  });

  it("changes the Spanish output with the flight, delay, gate and local time", async () => {
    const scenario = fixture("ABC123");
    const [flight] = scenario.booking.segments;
    const [delay, , gate] = scenario.events.events;
    if (!flight || delay?.type !== "STATUS" || gate?.type !== "GATE")
      throw new Error("Missing fixture facts");
    flight.flightNumber = "FX777";
    delay.delayMinutes = 145;
    delay.estimatedDeparture = { local: "2026-09-15T16:55:00-03:00", timeZone: santiago };
    gate.gate = "42";
    const dto = present(await assess("ABC123", scenario));
    expect(dto.disruption.events[0]?.message.message).toMatch(
      /FX777.*145 minutos.*16:55 \(hora de Santiago\).*42/,
    );
    expect(dto.connection?.message.message).toMatch(/estimamos[^.]*20:20 \(hora de Lima\)/i);
    expect(passengerCopy(dto)).not.toMatch(/LA500|160 minutos|17:10|20:35/);
  });

  it("uses the normal DEMO01 template without caveats, benefits, or an action claim", async () => {
    const dto = present(await assess("DEMO01"), "req_02");
    expect(dto).toMatchObject({
      requestId: "req_02",
      assessmentStatus: "COMPLETE",
      connection: null,
      warnings: [],
      disruption: {
        severity: "NONE",
        summary: { code: "DISRUPTION_NONE" },
        events: [
          {
            flightNumber: "LA501",
            flightStatus: "ON_TIME",
            delay: { status: "NOT_DELAYED" },
            message: { code: "FLIGHT_ON_TIME" },
          },
        ],
      },
      recommendation: {
        type: "NO_ACTION_REQUIRED",
        priority: "LOW",
        reasonCodes: [],
        message: { code: "RECOMMENDATION_NO_ACTION" },
      },
      alternatives: { status: "NOT_REQUIRED" },
      actions: { executed: [], recommended: ["NO_ACTION_REQUIRED"] },
    });
    expect(ruleStatuses(dto)).toEqual(Array(5).fill(notApplicable));
    expect(dto.recommendation.message.message).toMatch(/en horario.*verificada/);
    expect(passengerCopy(dto)).not.toMatch(/sin (costo|penalidad)|compensación|hemos modificado/);
  });

  it("uses only the verified DEMO02 benefit, subject to confirmation", async () => {
    const dto = present(await assess("DEMO02"), "req_03");
    expect(dto).toMatchObject({
      requestId: "req_03",
      assessmentStatus: "COMPLETE",
      connection: null,
      warnings: [],
      disruption: {
        severity: "WARNING",
        summary: { code: "DISRUPTION_RELEVANT" },
        events: [
          {
            flightNumber: "LA502",
            flightStatus: "DELAYED",
            delay: { status: "CONFIRMED", minutes: 190 },
            message: { code: "FLIGHT_DELAYED_CONFIRMED" },
          },
        ],
      },
      recommendation: {
        type: "REVIEW_REBOOKING_OPTIONS",
        priority: "NORMAL",
        reasonCodes: [],
        message: { code: "RECOMMENDATION_REVIEW_OPTIONS" },
      },
      alternatives: {
        status: "EVALUATED",
        options: [
          {
            optionId: "DEMO02-O1",
            flightNumber: "LA1001",
            eligibility: "ELIGIBLE",
            reasonCodes: [],
            departure: time("2026-09-15T20:30:00-03:00", santiago, "2026-09-15T23:30:00Z"),
            message: { code: "OPTION_ELIGIBLE" },
          },
        ],
      },
      actions: { executed: [], recommended: ["REVIEW_REBOOKING_OPTIONS"] },
    });
    expect(ruleStatuses(dto)).toEqual([
      "APPLICABLE",
      notApplicable,
      notApplicable,
      notApplicable,
      notApplicable,
    ]);
    expect(dto.recommendation.message.message).toMatch(
      /190 minutos.*sin penalidad.*sujeto a (la )?confirmación.*no hemos/i,
    );
    expect(passengerCopy(dto)).not.toMatch(
      /te garantizamos|ya (cambiamos|reservamos)|compensación|reembolso/i,
    );
  });

  it("retains the validated option zone even when it is outside the booked itinerary", async () => {
    const scenario = fixture("DEMO02");
    const [option] = scenario.options;
    if (!option) throw new Error("Missing option");
    option.origin = "MEX";
    option.departure = { local: "2026-09-15T17:30:00-06:00", timeZone: "America/Mexico_City" };
    const dto = present(await assess("DEMO02", scenario));
    expect(dto.alternatives).toMatchObject({
      status: "EVALUATED",
      options: [
        {
          departure: time(
            "2026-09-15T17:30:00-06:00",
            "America/Mexico_City",
            "2026-09-15T23:30:00Z",
          ),
          eligibility: "NOT_ELIGIBLE",
          reasonCodes: ["ITINERARY_INCOMPATIBLE"],
          message: { title: expect.stringContaining("17:30 (hora de Ciudad de México)") },
        },
      ],
    });
  });
});

describe("connection timing evidence", () => {
  it.each([
    ["scheduled", true, "salida programada", "04:40", -30],
    ["estimated", true, "salida estimada", "04:45", -25],
    ["estimated", false, "salida estimada", "04:45", -25],
    ["actual", false, "salida confirmada", "04:45", -25],
  ] as const)(
    "labels %s outbound with confirmed inbound=%s without declaring loss",
    async (basis, confirmed, wording, local, marginMinutes) => {
      const scenario = fixture("DEMO06");
      const [inbound, outbound] = scenario.events.events;
      if (inbound?.type !== "STATUS" || outbound?.type !== "STATUS")
        throw new Error("Missing fixture status");
      if (!confirmed) delete inbound.actualArrival;
      if (basis !== "actual") delete outbound.actualDeparture;
      if (basis === "scheduled") {
        outbound.status = "SCHEDULED";
        delete outbound.delayMinutes;
      }
      // The estimate is derived from the delay and equals the actual instant in the adjacent case.
      const dto = present(await assess("DEMO06", scenario));
      expect(dto.connection).toMatchObject({
        status: "AT_RISK",
        lossConfirmation: "NOT_CONFIRMED",
        marginMinutes,
        inboundArrival: {
          confirmed,
          time: time("2026-09-15T05:10:00-05:00", lima, "2026-09-15T10:10:00Z"),
        },
      });
      expect(dto.connection?.message.message).toMatch(
        confirmed ? /llegada confirmada[^.]*05:10/i : /estimamos[^.]*05:10/i,
      );
      expect(dto.connection?.message.message).toMatch(new RegExp(`${wording}[^.]*${local}`, "i"));
      expect(dto.connection?.message.message).not.toMatch(
        /perdiste|conexión perdida|no se perdió/i,
      );
      expect(ruleStatuses(dto)[2]).toBe("INSUFFICIENT_EVIDENCE");
      expect(dto.actions.executed).toEqual([]);
    },
  );

  it("reports loss only when both actual events confirm it", async () => {
    const dto = present(await assess("DEMO06"));
    expect(dto.connection).toMatchObject({
      status: "MISSED",
      lossConfirmation: "CONFIRMED_MISSED",
      marginMinutes: -25,
      inboundArrival: { confirmed: true },
      message: { code: "CONNECTION_MISSED_CONFIRMED" },
    });
    expect(dto.connection?.message.message).toMatch(/llegada confirmada[^.]*05:10/i);
    expect(dto.connection?.message.message).toMatch(/salida confirmada[^.]*04:45/i);
    expect(ruleStatuses(dto)[2]).toBe("APPLICABLE");
    expect(dto.actions.executed).toEqual([]);
  });
});

describe("flight departure copy", () => {
  it.each([
    [
      "confirmed actual",
      "OPS_CORE",
      "2026-09-15T04:45:00-05:00",
      "FLIGHT_DELAYED_CONFIRMED",
      "El retraso confirmado para el vuelo LA2506 es de 5 minutos. La salida confirmada del vuelo LA2506 fue a las 04:45 (hora de Lima).",
    ],
    [
      "secondary-source actual",
      "LEGACY_MIRROR",
      "2026-09-15T04:45:00-05:00",
      "FLIGHT_DELAYED_UNCONFIRMED",
      "Se informó un retraso de 5 minutos para el vuelo LA2506, pero todavía no está verificado. Su hora estimada de salida es 04:42 (hora de Lima).",
    ],
    [
      "actual later than its report",
      "OPS_CORE",
      "2026-09-15T05:55:00-05:00",
      "FLIGHT_DELAYED_CONFIRMED",
      "El retraso confirmado para el vuelo LA2506 es de 5 minutos. Su hora estimada de salida es 04:42 (hora de Lima).",
    ],
  ] as const)("handles %s when an older estimate exists", async (_, source, local, code, copy) => {
    const scenario = fixture("DEMO06");
    const [, outbound] = scenario.events.events;
    if (outbound?.type !== "STATUS") throw new Error("Missing fixture status");
    outbound.source = source;
    outbound.actualDeparture = { local, timeZone: lima };
    outbound.estimatedDeparture = { local: "2026-09-15T04:42:00-05:00", timeZone: lima };
    const dto = present(await assess("DEMO06", scenario));
    const flight = dto.disruption.events[1];
    expect(flight).toMatchObject({
      estimatedDeparture: time("2026-09-15T04:42:00-05:00", lima, "2026-09-15T09:42:00Z"),
      message: { code, message: copy },
    });
    expect(flight).not.toHaveProperty("actualDeparture");
  });
});

describe("other passenger templates", () => {
  it("distinguishes a short reported delay from verified timing and recommends monitoring", async () => {
    const scenario = fixture("DEMO02");
    const [event] = scenario.events.events;
    if (event?.type !== "STATUS") throw new Error("Missing fixture status");
    event.delayMinutes = 15;
    event.source = "LEGACY_MIRROR";
    delete event.estimatedDeparture;
    const dto = present(await assess("DEMO02", scenario));
    expect(dto).toMatchObject({
      assessmentStatus: "PARTIAL",
      disruption: {
        severity: "INFO",
        summary: { code: "DISRUPTION_INFO" },
        events: [
          {
            flightStatus: "DELAYED",
            delay: { status: "UNCONFIRMED", minutes: 15 },
            message: {
              code: "FLIGHT_DELAYED_UNCONFIRMED",
              message: expect.stringMatching(/15 minutos.*todavía no está verificado/),
            },
          },
        ],
      },
      recommendation: { type: "MONITOR_FLIGHT", message: { code: "RECOMMENDATION_MONITOR" } },
    });
    expect(passengerCopy(dto)).not.toMatch(
      /retraso confirmado|hora estimada de salida|sin penalidad/i,
    );
  });

  it("labels a cancellation and never uses it to confirm loss", async () => {
    const scenario = fixture("DEMO06");
    const [, outbound] = scenario.events.events;
    if (outbound?.type !== "STATUS") throw new Error("Missing fixture status");
    outbound.status = "CANCELLED";
    delete outbound.actualDeparture;
    delete outbound.delayMinutes;
    const dto = present(await assess("DEMO06", scenario));
    expect(dto.disruption.events[1]).toMatchObject({
      flightStatus: "CANCELLED",
      message: { code: "FLIGHT_CANCELLED" },
    });
    expect(dto.connection).toMatchObject({
      status: "AT_RISK",
      lossConfirmation: "NOT_CONFIRMED",
      message: {
        code: "CONNECTION_AT_RISK_CANCELLATION_REPORTED",
        message: expect.stringMatching(/reporte de cancelación.*no confirma/),
      },
    });
    expect(dto.connection).not.toHaveProperty("marginMinutes");
  });

  it("still labels a nonpositive margin as risk when it does not come from inbound delay", async () => {
    const scenario = fixture("DEMO06");
    const [inbound, outbound] = scenario.events.events;
    if (inbound?.type !== "STATUS" || outbound?.type !== "STATUS" || !outbound.actualDeparture)
      throw new Error("Missing fixture status");
    inbound.status = "ON_TIME";
    delete inbound.delayMinutes;
    delete inbound.actualArrival;
    outbound.actualDeparture.local = "2026-09-15T03:20:00-05:00";
    const dto = present(await assess("DEMO06", scenario));
    expect(dto.connection).toMatchObject({
      status: "AT_RISK",
      lossConfirmation: "NOT_CONFIRMED",
      marginMinutes: -10,
      message: {
        code: "CONNECTION_AT_RISK",
        message: expect.stringMatching(/Estimamos.*salida confirmada/),
      },
    });
  });

  it.each([
    [20, "UNKNOWN", "CONNECTION_UNKNOWN", /no hay evidencia suficiente/i],
    [0, "SAFE", "CONNECTION_SAFE", /resultado aún no está confirmado/i],
  ] as const)(
    "does not claim the connection succeeded with a %s-minute projected delay",
    async (delay, status, code, wording) => {
      const scenario = fixture("ABC123");
      const [inbound] = scenario.events.events;
      if (inbound?.type !== "STATUS") throw new Error("Missing fixture status");
      inbound.delayMinutes = delay;
      const dto = present(await assess("ABC123", scenario));
      expect(dto.connection).toMatchObject({
        status,
        lossConfirmation: "NOT_CONFIRMED",
        marginMinutes: 70 - delay,
        message: { code, message: expect.stringMatching(wording) },
      });
      expect(dto.connection?.message.title).not.toMatch(/no se perdió/i);
    },
  );

  it("reports confirmed non-loss only when separate actual evidence supports it", async () => {
    const scenario = fixture("DEMO06");
    const [inbound] = scenario.events.events;
    if (inbound?.type !== "STATUS" || !inbound.actualArrival)
      throw new Error("Missing fixture arrival");
    inbound.actualArrival.local = "2026-09-15T03:30:00-05:00";
    const dto = present(await assess("DEMO06", scenario));
    expect(dto.connection).toMatchObject({
      status: "SAFE",
      lossConfirmation: "CONFIRMED_NOT_MISSED",
      marginMinutes: 75,
      message: { code: "CONNECTION_SAFE", title: "No se perdió la conexión" },
    });
  });

  it("explains an option that requires review without suggesting it is reserved", async () => {
    const scenario = fixture("DEMO02");
    const [option] = scenario.options;
    if (!option) throw new Error("Missing option");
    option.seatsAvailable = null;
    const dto = present(await assess("DEMO02", scenario));
    expect(dto.alternatives).toMatchObject({
      status: "EVALUATED",
      options: [
        {
          eligibility: "REQUIRES_REVIEW",
          reasonCodes: ["SEATS_UNKNOWN"],
          message: {
            code: "OPTION_REQUIRES_REVIEW",
            message: expect.stringMatching(/debe revisar.*no se ha verificado si hay asientos/i),
          },
        },
      ],
    });
    expect(dto.actions.executed).toEqual([]);
  });

  it("conditions both verified benefits but does not put messages on individual policy rules", async () => {
    const dto = present(await assess("DEMO05"));
    expect(ruleStatuses(dto).slice(0, 2)).toEqual(["APPLICABLE", "APPLICABLE"]);
    expect(dto.recommendation.message.message).toMatch(
      /sin penalidad, sujeto a .*confirmación.*vale de comida, sujeto a .*confirmación/i,
    );
    expect(
      dto.policies.available && dto.policies.evaluations.every((rule) => !("message" in rule)),
    ).toBe(true);
    expect(dto.actions.executed).toEqual([]);
  });
});

describe("public allowlists and degradation", () => {
  it("does not promise benefits or show options when providers are unavailable", async () => {
    const dto = present(
      await assess("DEMO02", fixture("DEMO02"), {
        policies: { getPolicyRules: async () => ({ ok: false, failure: "TIMEOUT" }) },
        options: { getEligibleOptions: async () => ({ ok: false, failure: "UNAVAILABLE" }) },
      }),
    );
    expect(dto).toMatchObject({
      assessmentStatus: "PARTIAL",
      policies: { available: false, reasonCode: "POLICIES_UNAVAILABLE" },
      alternatives: { status: "UNAVAILABLE", reasonCode: "ALTERNATIVES_UNAVAILABLE" },
      recommendation: {
        type: "HUMAN_REVIEW",
        reasonCodes: ["POLICY_UNVERIFIED", "ALTERNATIVES_UNAVAILABLE"],
      },
      metadata: { policyRefs: [] },
    });
    expect(dto.warnings.map((warning) => warning.code)).toEqual([
      "POLICIES_UNAVAILABLE",
      "ALTERNATIVES_UNAVAILABLE",
    ]);
    expect(passengerCopy(dto)).not.toMatch(/contempla un cambio|vale de comida|TIMEOUT/);
  });
  it("drops internal and injected fields and rejects uncatalogued reason and warning values", async () => {
    const assessment = await assess("ABC123");
    const privateValue = "PRIVATE_SENTINEL";
    Object.assign(assessment, { rawProviderPayload: { email: privateValue } });
    Object.assign(assessment.segments[0]!.origin, { passengerName: privateValue });
    Object.assign(assessment.recommendation, {
      reasonCodes: [...assessment.recommendation.reasonCodes, privateValue, "constructor"],
    });
    Object.assign(assessment, { warnings: [...assessment.warnings, privateValue, "constructor"] });
    if (assessment.alternatives.kind !== "EVALUATED") throw new Error("Expected alternatives");
    const option = assessment.alternatives.options[0]!;
    Object.assign(option, {
      reasonCodes: [...option.reasonCodes, privateValue, "constructor"],
      seatsAvailable: 99,
    });
    const dto = present(assessment);
    expect(JSON.stringify(dto)).not.toMatch(
      /PRIVATE_SENTINEL|constructor|decisionTrace|GROUP_INCLUDES_MINOR|includesMinor|seatsAvailable|OPS_CORE|LEGACY_MIRROR|bookingId/,
    );
    expect(dto.recommendation.reasonCodes).toContain("PRIORITY_REVIEW_REQUIRED");
    expect(dto.recommendation).not.toHaveProperty("summary");
  });

  it.each([
    ["DEMO03", "UNVERIFIED", "SOURCE_CONFLICT_UNRESOLVED"],
    ["DEMO04", "STALE", "OPERATIONAL_DATA_STALE"],
  ] as const)(
    "keeps %s unknown rather than reporting normal operations",
    async (id, reason, warning) => {
      const dto = present(await assess(id));
      expect(dto).toMatchObject({
        assessmentStatus: "INDETERMINATE",
        disruption: {
          severity: "UNKNOWN",
          summary: { code: "DISRUPTION_UNDETERMINED" },
          events: [
            {
              flightStatus: "UNKNOWN",
              delay: { status: "UNKNOWN", reason },
              message: { code: "FLIGHT_STATUS_UNVERIFIED" },
            },
          ],
        },
      });
      expect(dto.warnings.map((item) => item.code)).toContain(warning);
      expect(passengerCopy(dto)).not.toMatch(/no hay retrasos|no hay alteraciones|sin penalidad/i);
    },
  );
});
