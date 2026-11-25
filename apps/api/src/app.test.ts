import { Writable } from "node:stream";
import {
  AssessmentResponseSchema,
  healthResponseSchema,
  ProblemDetailsSchema,
} from "@flynext/contracts";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, type BuildAppOptions } from "./app.js";
import { loadConfig } from "./config.js";
import { createSimulationClock } from "./disruption/infrastructure/clock.js";
import { SCENARIOS } from "./disruption/infrastructure/fixtures.js";
import { createMockProviders } from "./disruption/infrastructure/mock-providers.js";
import * as presenter from "./disruption/presentation/present-assessment.js";

const endpoint = "/api/v1/disruptions/assessment";
const instances: ReturnType<typeof buildApp>[] = [];
const makeApp = (options?: BuildAppOptions) => {
  const app = buildApp(options);
  instances.push(app);
  return app;
};
const assess = (app: ReturnType<typeof buildApp>, bookingId = "ABC123") =>
  app.inject({ method: "POST", url: endpoint, payload: { bookingId } });

function expectProblem(
  response: Awaited<ReturnType<typeof assess>>,
  code: string,
  status: number,
  title: string,
  detail: string,
) {
  expect(response.statusCode).toBe(status);
  expect(response.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
  const body = ProblemDetailsSchema.parse(response.json());
  expect(body.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
  expect(response.headers["x-request-id"]).toBe(body.requestId);
  expect(body).toEqual({
    type: `https://flynext.example/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    detail,
    requestId: body.requestId,
  });
}

const invalidRequest = [
  "INVALID_REQUEST",
  400,
  "Invalid request",
  "Send a size-limited JSON object with a valid bookingId.",
] as const;
const bookingNotFound = [
  "BOOKING_NOT_FOUND",
  404,
  "Booking not found",
  "No synthetic booking matches the supplied identifier.",
] as const;
const invalidUpstream = [
  "INVALID_UPSTREAM_RESPONSE",
  502,
  "Invalid upstream response",
  "The booking data could not be verified.",
] as const;

const capture = () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, stream };
};

afterEach(async () => {
  await Promise.all(instances.splice(0).map((app) => app.close()));
});

describe("GET /health", () => {
  const app = buildApp({ logLevel: "silent" });
  afterAll(() => app.close());

  it("returns 200 with the shared health contract", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({ status: "ok" });
  });

  it("does not expose unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/nope" });
    expect(response.statusCode).toBe(404);
  });
});

describe("POST /api/v1/disruptions/assessment", () => {
  it("returns the approved read-only ABC123 assessment without provider or passenger data", async () => {
    const response = await assess(makeApp());
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/json\b/);
    const body = AssessmentResponseSchema.parse(response.json());
    expect(response.headers["x-request-id"]).toBe(body.requestId);
    expect(body).toMatchObject({
      assessmentStatus: "PARTIAL",
      disruption: {
        severity: "CRITICAL",
        events: [
          { delay: { status: "CONFIRMED", minutes: 160 }, gate: { status: "KNOWN", value: "24" } },
          {},
        ],
      },
      connection: {
        status: "AT_RISK",
        lossConfirmation: "NOT_CONFIRMED",
        inboundArrival: { confirmed: false },
        marginMinutes: -90,
      },
      recommendation: {
        type: "HUMAN_REVIEW",
        priority: "HIGH",
        reasonCodes: [
          "CONNECTION_AT_RISK",
          "PRIORITY_REVIEW_REQUIRED",
          "INCOMPLETE_FARE_CONDITIONS",
        ],
      },
      actions: { executed: [], recommended: ["HUMAN_REVIEW"] },
      metadata: { mode: "SIMULATION", dataSnapshot: "historical-fixture" },
    });
    for (const value of [
      ...SCENARIOS.ABC123!.booking.passengers.map(({ name }) => name),
      "ABC123",
      "decisionTrace",
      "GROUP_INCLUDES_MINOR",
      "LEGACY_MIRROR",
      "OPS_CORE",
      "passengers",
      "passengerCount",
    ]) {
      expect(response.body).not.toContain(value);
    }
  });

  it.each([
    ["DEMO01", "COMPLETE", "NONE", "NO_ACTION_REQUIRED"],
    ["DEMO02", "COMPLETE", "WARNING", "REVIEW_REBOOKING_OPTIONS"],
  ])("exposes the public fixture %s", async (bookingId, assessmentStatus, severity, type) => {
    const response = await assess(makeApp(), bookingId);
    expect(response.statusCode).toBe(200);
    const body = AssessmentResponseSchema.parse(response.json());
    expect(body).toMatchObject({
      assessmentStatus,
      disruption: { severity },
      recommendation: { type },
      actions: { executed: [] },
      warnings: [],
    });
    if (bookingId === "DEMO02")
      expect(body).toMatchObject({
        policies: { evaluations: [{ rule: "R1", status: "APPLICABLE" }, {}, {}, {}, {}] },
      });
  });

  it.each(["UNKNOWN", "DEMO03", "DEMO04", "DEMO05", "DEMO06"])(
    "does not expose booking %s",
    async (id) => {
      expectProblem(await assess(makeApp(), id), ...bookingNotFound);
    },
  );

  it.each([
    [
      "DEMO03",
      {
        assessmentStatus: "INDETERMINATE",
        disruption: { severity: "UNKNOWN" },
        warnings: expect.arrayContaining([
          expect.objectContaining({ code: "SOURCE_CONFLICT_UNRESOLVED" }),
        ]),
      },
    ],
    [
      "DEMO04",
      {
        assessmentStatus: "INDETERMINATE",
        disruption: { severity: "UNKNOWN" },
        warnings: expect.arrayContaining([
          expect.objectContaining({ code: "OPERATIONAL_DATA_STALE" }),
        ]),
      },
    ],
    [
      "DEMO05",
      {
        assessmentStatus: "COMPLETE",
        disruption: { severity: "WARNING" },
        policies: {
          evaluations: expect.arrayContaining([
            expect.objectContaining({ rule: "R1", benefit: "REBOOK_NO_FEE", status: "APPLICABLE" }),
            expect.objectContaining({ rule: "R2", benefit: "MEAL_VOUCHER", status: "APPLICABLE" }),
          ]),
        },
      },
    ],
    [
      "DEMO06",
      {
        assessmentStatus: "COMPLETE",
        disruption: { severity: "CRITICAL" },
        connection: {
          status: "MISSED",
          lossConfirmation: "CONFIRMED_MISSED",
          inboundArrival: { confirmed: true },
        },
        policies: {
          evaluations: expect.arrayContaining([
            expect.objectContaining({ rule: "R3", benefit: "REBOOK_NO_FEE", status: "APPLICABLE" }),
          ]),
        },
      },
    ],
  ] as const)(
    "assesses the test-only scenario %s with explicit provider injection",
    async (id, expected) => {
      const response = await assess(makeApp({ providers: createMockProviders() }), id);
      expect(response.statusCode).toBe(200);
      const body = AssessmentResponseSchema.parse(response.json());
      expect(body).toMatchObject(expected);
      expect(body.actions.executed).toEqual([]);
    },
  );

  it.each([
    ["{}", "application/json"],
    ['{"bookingId":""}', "application/json"],
    ['{"bookingId":123}', "application/json"],
    ['{"bookingId":"ABC-123"}', "application/json"],
    ['{"bookingId":"ABC123","email":"synthetic@example.invalid"}', "application/json"],
    [`{"bookingId":"${"a".repeat(33)}"}`, "application/json"],
    ['{"bookingId":', "application/json"],
    ['{"bookingId":"ABC123"}', "text/plain"],
    ['{"bookingId":"ABC123"}', "application/octet-stream"],
    ['{"bookingId":"ABC123"}'.padEnd(1025), "application/json"],
  ])("rejects invalid input without calling providers (%#)", async (payload, contentType) => {
    const getTripContext = vi.fn(createMockProviders().trips.getTripContext);
    const app = makeApp({ providers: { trips: { getTripContext } } });
    const response = await app.inject({
      method: "POST",
      url: endpoint,
      headers: { "content-type": contentType },
      payload,
    });
    expectProblem(response, ...invalidRequest);
    expect(getTripContext).not.toHaveBeenCalled();
  });

  it.each([
    '{"bookingId":"ABC123","bookingId":"ABC123"}',
    String.raw`{"bookingId":"synthetic@example.invalid","booking\u0049d":"ABC123"}`,
  ])("rejects repeated bookingId members before calling providers (%#)", async (payload) => {
    const getTripContext = vi.fn(createMockProviders().trips.getTripContext);
    const { lines, stream } = capture();
    const app = makeApp({
      logLevel: "info",
      logStream: stream,
      providers: { trips: { getTripContext } },
    });
    const response = await app.inject({
      method: "POST",
      url: endpoint,
      headers: { "content-type": "application/json" },
      payload,
    });
    expectProblem(response, ...invalidRequest);
    expect(getTripContext).not.toHaveBeenCalled();
    expect(`${response.body}${lines.join("")}`).not.toMatch(/ABC123|synthetic@example\.invalid/);
  });

  it("accepts a single escaped bookingId member with JSON whitespace", async () => {
    const getTripContext = vi.fn(createMockProviders().trips.getTripContext);
    const app = makeApp({ providers: { trips: { getTripContext } } });
    const response = await app.inject({
      method: "POST",
      url: endpoint,
      headers: { "content-type": "application/json; charset=utf-8" },
      payload: `\r\n{\t${String.raw`"booking\u0049d"`}\r:\n${String.raw`"\u0041BC123"`}\t}\r\n`,
    });
    expect(response.statusCode).toBe(200);
    expect(AssessmentResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(getTripContext).toHaveBeenCalledExactlyOnceWith("ABC123");
  });

  it.each(["a", "a".repeat(32)])("accepts a well-formed booking ID of length %s", async (id) => {
    expectProblem(await assess(makeApp(), id), ...bookingNotFound);
  });

  it("accepts a valid JSON body at the exact 1024-byte cap", async () => {
    const body = JSON.stringify({ bookingId: "ABC123" });
    const response = await makeApp().inject({
      method: "POST",
      url: endpoint,
      headers: { "content-type": "application/json" },
      payload: body.padEnd(1024),
    });
    expect(response.statusCode).toBe(200);
    expect(AssessmentResponseSchema.safeParse(response.json()).success).toBe(true);
  });

  it.each([
    [
      "UNAVAILABLE",
      "UPSTREAM_UNAVAILABLE",
      503,
      "Upstream unavailable",
      "The booking provider is temporarily unavailable.",
    ],
    [
      "TIMEOUT",
      "UPSTREAM_TIMEOUT",
      504,
      "Upstream timeout",
      "The booking provider did not respond in time.",
    ],
    ["INVALID_RESPONSE", ...invalidUpstream],
  ] as const)("maps booking provider failure %s", async (failure, code, status, title, detail) => {
    const response = await assess(
      makeApp({
        providers: {
          trips: {
            async getTripContext() {
              return { ok: false, failure };
            },
          },
        },
      }),
    );
    expectProblem(response, code, status, title, detail);
  });

  it.each(["synthetic@example.invalid", undefined])(
    "sanitizes a required booking with an invalid or missing flight designator (%#)",
    async (flightNumber) => {
      const marker = "synthetic@example.invalid";
      const { lines, stream } = capture();
      const fixture = SCENARIOS.ABC123!;
      const booking = {
        ...fixture.booking,
        segments: fixture.booking.segments.map((segment) => {
          const raw = { ...segment, flightNumber };
          if (flightNumber === undefined) Reflect.deleteProperty(raw, "flightNumber");
          return raw;
        }),
      } as typeof fixture.booking; // The raw provider input may be missing required fields.
      const providers = createMockProviders({ ABC123: { ...fixture, booking } });
      const getOperationalEvents = vi.fn(providers.events.getOperationalEvents);
      const response = await assess(
        makeApp({
          logLevel: "info",
          logStream: stream,
          providers: { ...providers, events: { getOperationalEvents } },
        }),
      );
      expectProblem(response, ...invalidUpstream);
      expect(getOperationalEvents).not.toHaveBeenCalled();
      expect(`${response.body}${lines.join("")}`).not.toContain(marker);
    },
  );

  it("degrades safely without exposing an invalid alternative flight designator", async () => {
    const marker = "synthetic@example.invalid";
    const { lines, stream } = capture();
    const fixture = SCENARIOS.ABC123!;
    const options = fixture.options.map((option) =>
      option.kind === "FLIGHT" ? { ...option, flightNumber: marker } : option,
    );
    const providers = createMockProviders({ ABC123: { ...fixture, options } });
    const response = await assess(makeApp({ logLevel: "info", logStream: stream, providers }));
    expect(response.statusCode).toBe(200);
    expect(AssessmentResponseSchema.parse(response.json())).toMatchObject({
      assessmentStatus: "PARTIAL",
      alternatives: { status: "UNAVAILABLE", reasonCode: "ALTERNATIVES_UNAVAILABLE" },
      actions: { executed: [] },
    });
    expect(`${response.body}${lines.join("")}`).not.toContain(marker);
  });

  it("maps stale booking data to the same public 502 without exposing the internal reason", async () => {
    const response = await assess(
      makeApp({ clock: createSimulationClock("2026-09-15T12:02:40Z") }),
    );
    expectProblem(response, ...invalidUpstream);
  });

  it.each(["events", "policies", "options"] as const)(
    "degrades safely when the %s provider fails",
    async (provider) => {
      const failed = async () => ({ ok: false, failure: "INVALID_RESPONSE" }) as const;
      const providers = {
        events: { events: { getOperationalEvents: failed } },
        policies: { policies: { getPolicyRules: failed } },
        options: { options: { getEligibleOptions: failed } },
      };
      const response = await assess(makeApp({ providers: providers[provider] }));
      expect(response.statusCode).toBe(200);
      const body = AssessmentResponseSchema.parse(response.json());
      if (provider === "events")
        expect(body).toMatchObject({
          assessmentStatus: "INDETERMINATE",
          disruption: { severity: "UNKNOWN" },
          alternatives: { status: "NOT_REQUIRED" },
        });
      if (provider === "policies")
        expect(body).toMatchObject({
          assessmentStatus: "PARTIAL",
          policies: { available: false, reasonCode: "POLICIES_UNAVAILABLE" },
        });
      if (provider === "options")
        expect(body).toMatchObject({
          assessmentStatus: "PARTIAL",
          alternatives: { status: "UNAVAILABLE", reasonCode: "ALTERNATIVES_UNAVAILABLE" },
        });
      expect(body.actions.executed).toEqual([]);
      expect(response.body).not.toContain("INVALID_RESPONSE");
    },
  );

  it("correlates safe logs and responses without trusting inbound IDs or leaking thrown exceptions", async () => {
    const { lines, stream } = capture();
    const marker = "synthetic@example.invalid";
    const app = makeApp({
      logLevel: "info",
      logStream: stream,
      providers: {
        trips: {
          async getTripContext() {
            throw new Error(marker);
          },
        },
      },
    });
    const request = {
      method: "POST",
      url: endpoint,
      headers: { "request-id": marker, "x-request-id": marker, authorization: marker },
      payload: { bookingId: "ABC123" },
    } as const;
    const first = await app.inject(request);
    const second = await app.inject(request);
    for (const response of [first, second]) {
      expectProblem(
        response,
        "INTERNAL_ERROR",
        500,
        "Internal error",
        "The assessment could not be completed.",
      );
      expect(response.body).not.toContain(marker);
    }
    expect(first.headers["x-request-id"]).not.toBe(second.headers["x-request-id"]);
    expect(lines.join("")).not.toMatch(/synthetic@example\.invalid|ABC123|stack|authorization/);
    const events = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    for (const requestId of [first.headers["x-request-id"], second.headers["x-request-id"]]) {
      expect(events.filter((event) => event.requestId === requestId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "METRIC",
            event: "provider.read",
            provider: "trips",
            outcome: "THREW",
            durationMs: expect.any(Number),
          }),
          expect.objectContaining({
            category: "ERROR",
            event: "assessment.failed",
            code: "INTERNAL_ERROR",
          }),
          expect.objectContaining({
            category: "METRIC",
            event: "http.assessment",
            status: 500,
            durationMs: expect.any(Number),
          }),
        ]),
      );
    }
  });

  it("logs business outcomes, degradation and safe diagnostics without IDs from upstream", async () => {
    const { lines, stream } = capture();
    const app = makeApp({
      logLevel: "info",
      logStream: stream,
      providers: {
        options: {
          async getEligibleOptions() {
            return { ok: false, failure: "TIMEOUT" };
          },
        },
      },
    });
    const response = await assess(app);
    expect(response.statusCode).toBe(200);
    const requestId = response.headers["x-request-id"];
    const events = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId,
          category: "ERROR",
          event: "provider.failed",
          provider: "options",
          failure: "TIMEOUT",
        }),
        expect.objectContaining({
          requestId,
          category: "DATA",
          event: "assessment.data_quality",
          warning: "SOURCE_CONFLICT_RESOLVED",
        }),
        expect.objectContaining({
          requestId,
          category: "BUSINESS",
          event: "assessment.completed",
          assessmentStatus: "PARTIAL",
          recommendation: "HUMAN_REVIEW",
        }),
      ]),
    );
    expect(lines.join("")).not.toMatch(
      /ABC123|OPS_CORE|LEGACY_MIRROR|GROUP_INCLUDES_MINOR|decisionTrace/,
    );
  });

  it("rejects an invalid DTO rather than serializing an unexpected field", async () => {
    const { presentAssessment } = presenter;
    const spy = vi.spyOn(presenter, "presentAssessment").mockImplementation((assessment, id) => {
      const valid = presentAssessment(assessment, id);
      return { ...valid, passengerEmail: "synthetic@example.invalid" };
    });
    try {
      const response = await assess(makeApp());
      expectProblem(
        response,
        "INTERNAL_ERROR",
        500,
        "Internal error",
        "The assessment could not be completed.",
      );
      expect(response.body).not.toContain("synthetic@example.invalid");
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps logging disabled by default even with a destination", async () => {
    const { lines, stream } = capture();
    expect((await assess(makeApp({ logStream: stream }))).statusCode).toBe(200);
    expect(lines).toEqual([]);
  });

  it("limits by direct IP before calling providers and ignores spoofed forwarding headers", async () => {
    const getTripContext = vi.fn(createMockProviders().trips.getTripContext);
    const app = makeApp({ rateLimitMax: 1, providers: { trips: { getTripContext } } });
    const request = { method: "POST", url: endpoint, payload: { bookingId: "ABC123" } } as const;
    expect((await app.inject({ ...request, remoteAddress: "192.0.2.1" })).statusCode).toBe(200);
    const limited = await app.inject({
      ...request,
      remoteAddress: "192.0.2.1",
      headers: { "x-forwarded-for": "192.0.2.2" },
    });
    expectProblem(
      limited,
      "RATE_LIMIT_EXCEEDED",
      429,
      "Rate limit exceeded",
      "Too many assessment requests. Try again later.",
    );
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(getTripContext).toHaveBeenCalledTimes(1);
    expect((await app.inject({ ...request, remoteAddress: "192.0.2.2" })).statusCode).toBe(200);
    expect((await app.inject("/health")).statusCode).toBe(200);
    expect(getTripContext).toHaveBeenCalledTimes(2);
  });
});

describe("public information and documentation", () => {
  it("serves public service information at the root", async () => {
    const response = await makeApp().inject("/");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: "FlyNext",
      tagline: "Your journey. Your next step.",
      notice: "Independent demonstration; not an official LATAM product.",
      docs: "/docs",
      health: "/health",
    });
  });

  it("serves the interactive Swagger UI and the generated public contract", async () => {
    const app = makeApp();
    const ui = await app.inject("/docs");
    expect(ui.statusCode).toBe(200);
    expect(ui.headers["content-type"]).toMatch(/^text\/html\b/);
    expect(ui.body).toContain("Swagger UI");
    const spec = await app.inject("/docs/json");
    expect(spec.statusCode).toBe(200);
    expect(spec.json()).toMatchObject({
      openapi: "3.1.0",
      paths: {
        [endpoint]: {
          post: {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { additionalProperties: false },
                  examples: { ABC123: { value: { bookingId: "ABC123" } } },
                },
              },
            },
            responses: {
              200: { content: { "application/json": { schema: { additionalProperties: false } } } },
              502: {
                content: {
                  "application/problem+json": {
                    schema: { properties: { code: { const: "INVALID_UPSTREAM_RESPONSE" } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(spec.body).not.toMatch(/DEMO0[3-6]|GROUP_INCLUDES_MINOR|decisionTrace/);
  });
});

describe("loadConfig", () => {
  it("uses silent logging and a bounded assessment limit by default", () => {
    expect(loadConfig({})).toMatchObject({ logLevel: "silent", rateLimitMax: 60 });
    expect(loadConfig({ RATE_LIMIT_MAX: "1", LOG_LEVEL: "info" })).toMatchObject({
      logLevel: "info",
      rateLimitMax: 1,
    });
  });

  it.each(["", "0", "-1", "1e2", "1.5", "10001"])("rejects RATE_LIMIT_MAX=%s", (value) => {
    expect(() => loadConfig({ RATE_LIMIT_MAX: value })).toThrow();
  });
  it("defaults to 0.0.0.0:3000 for container deployments", () => {
    expect(loadConfig({})).toMatchObject({ host: "0.0.0.0", port: 3000 });
  });

  it("honors the PORT variable provided by the platform", () => {
    expect(loadConfig({ PORT: "8080" }).port).toBe(8080);
  });

  it.each([
    ["empty", ""],
    ["whitespace", " "],
    ["non-numeric", "abc"],
    ["decimal", "80.5"],
    ["negative", "-1"],
    ["zero (random port)", "0"],
    ["above range", "65536"],
    ["exponent", "1e3"],
  ])("rejects PORT: %s", (_label, value) => {
    expect(() => loadConfig({ PORT: value })).toThrow();
  });

  it.each([
    ["1", 1],
    ["8080", 8080],
    ["65535", 65535],
  ])("accepts PORT=%s", (value, expected) => {
    expect(loadConfig({ PORT: value }).port).toBe(expected);
  });
});
