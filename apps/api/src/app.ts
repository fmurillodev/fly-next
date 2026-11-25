import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import type { HealthResponse } from "@flynext/contracts";
import { DEFAULT_LOG_LEVEL, DEFAULT_RATE_LIMIT_MAX } from "./config.js";
import type { AssessDisruptionDeps } from "./disruption/application/assess-disruption.js";
import { createSimulationClock } from "./disruption/infrastructure/clock.js";
import { SCENARIOS, type ScenarioFixture } from "./disruption/infrastructure/fixtures.js";
import {
  createMockProviders,
  type MockProviders,
} from "./disruption/infrastructure/mock-providers.js";
import { registerAssessmentRoute } from "./http/assessment-route.js";
import { registerDocs } from "./http/openapi.js";
import { sendProblem } from "./http/problem-details.js";
import { PUBLIC_BOOKINGS, serviceInfo } from "./http/public-api.js";
import { hasWebBuild, registerStaticWeb } from "./http/static-web.js";

export type BuildAppOptions = {
  logLevel?: string;
  logStream?: Writable;
  rateLimitMax?: number;
  providers?: Partial<MockProviders>;
  clock?: AssessDisruptionDeps["clock"];
  /** Compiled frontend directory; the service stays API-only when absent or not built. */
  webRoot?: string;
};

const invalidBodyCodes = new Set([
  "FST_ERR_CTP_BODY_TOO_LARGE",
  "FST_ERR_CTP_INVALID_CONTENT_LENGTH",
  "FST_ERR_CTP_INVALID_MEDIA_TYPE",
  "FST_ERR_CTP_EMPTY_JSON_BODY",
  "FST_ERR_CTP_INVALID_JSON_BODY",
]);

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    trustProxy: false,
    requestIdHeader: false,
    genReqId: () => `req_${randomUUID()}`,
    logController: new LogController({
      requestIdLogLabel: "requestId",
      disableRequestLogging: true,
    }),
    logger: {
      level: options.logLevel ?? DEFAULT_LOG_LEVEL,
      base: null,
      ...(options.logStream === undefined ? {} : { stream: options.logStream }),
      hooks: {
        // Suppress unstructured framework records, including startup addresses and client errors.
        logMethod(args, method) {
          const record: unknown = args[0];
          if (
            typeof record === "object" &&
            record !== null &&
            "category" in record &&
            "event" in record
          ) {
            method.apply(this, args);
          }
        },
      },
    },
  });

  app.setErrorHandler((error, request, reply) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      invalidBodyCodes.has(error.code)
    ) {
      return sendProblem(reply, "INVALID_REQUEST");
    }
    request.log.error({
      category: "ERROR",
      event: "http.unexpected_failure",
      code: "INTERNAL_ERROR",
    });
    return sendProblem(reply, "INTERNAL_ERROR");
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ statusCode: 404, error: "Not Found", message: "Route not found" }),
  );

  if (hasWebBuild(options.webRoot)) registerStaticWeb(app, options.webRoot);
  else app.get("/", async () => serviceInfo);
  app.get(serviceInfo.health, async (): Promise<HealthResponse> => ({ status: "ok" }));

  const publicFixtures: Record<string, ScenarioFixture> = {};
  for (const id of PUBLIC_BOOKINGS) {
    const fixture = SCENARIOS[id];
    if (fixture === undefined) throw new Error("Public fixture is missing");
    publicFixtures[id] = fixture;
  }
  registerAssessmentRoute(
    app,
    {
      ...createMockProviders(publicFixtures),
      ...options.providers,
      clock: options.clock ?? createSimulationClock(),
    },
    options.rateLimitMax ?? DEFAULT_RATE_LIMIT_MAX,
  );
  registerDocs(app);

  return app;
}
