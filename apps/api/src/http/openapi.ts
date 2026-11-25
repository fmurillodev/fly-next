import swagger, { type StaticDocumentSpec } from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  AssessmentRequestSchema,
  AssessmentResponseSchema,
  healthResponseSchema,
  ProblemDetailsSchema,
} from "@flynext/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { problemDetails, problems } from "./problem-details.js";
import {
  ASSESSMENT_BODY_LIMIT,
  ASSESSMENT_PATH,
  PUBLIC_BOOKINGS,
  serviceInfo,
} from "./public-api.js";

// Synthetic example from the public contract: it does not depend on live or injected providers.
const demo01 = AssessmentResponseSchema.parse({
  requestId: "req_02",
  assessmentStatus: "COMPLETE",
  disruption: {
    severity: "NONE",
    summary: {
      code: "DISRUPTION_NONE",
      title: "Tu viaje no presenta alteraciones verificadas",
      message: "No hay alteraciones verificadas en tu viaje.",
    },
    events: [
      {
        segmentId: "DEMO01-S1",
        flightNumber: "LA501",
        origin: { code: "SCL", timeZone: "America/Santiago" },
        destination: { code: "LIM", timeZone: "America/Lima" },
        scheduledDeparture: {
          local: "2026-09-15T14:30:00-03:00",
          timeZone: "America/Santiago",
          utc: "2026-09-15T17:30:00Z",
        },
        scheduledArrival: {
          local: "2026-09-15T17:55:00-05:00",
          timeZone: "America/Lima",
          utc: "2026-09-15T22:55:00Z",
        },
        flightStatus: "ON_TIME",
        severity: "NONE",
        delay: { status: "NOT_DELAYED" },
        gate: { status: "UNKNOWN", reason: "UNAVAILABLE" },
        message: {
          code: "FLIGHT_ON_TIME",
          title: "Tu vuelo LA501 está en horario",
          message:
            "No hay retrasos informados para el vuelo LA501. La puerta de embarque todavía no está publicada.",
        },
      },
    ],
  },
  connection: null,
  policies: {
    available: true,
    policyId: "POL-DELAY-2026-03",
    version: "2026.03",
    validity: "VALID",
    evaluations: [
      { rule: "R1", benefit: "REBOOK_NO_FEE", status: "NOT_APPLICABLE" },
      { rule: "R2", benefit: "MEAL_VOUCHER", status: "NOT_APPLICABLE" },
      { rule: "R3", benefit: "REBOOK_NO_FEE", status: "NOT_APPLICABLE" },
      { rule: "R4", benefit: "CASH_COMPENSATION", status: "NOT_APPLICABLE" },
      { rule: "R5", benefit: "PRIORITY_HANDLING", status: "NOT_APPLICABLE" },
    ],
  },
  recommendation: {
    type: "NO_ACTION_REQUIRED",
    priority: "LOW",
    reasonCodes: [],
    message: {
      code: "RECOMMENDATION_NO_ACTION",
      title: "No necesitas hacer nada por ahora",
      message: "Tu vuelo está en horario según la información verificada.",
      nextSteps: [
        "Revisa el estado de tu vuelo antes de salir al aeropuerto: la información puede cambiar.",
      ],
    },
  },
  alternatives: { status: "NOT_REQUIRED" },
  actions: { executed: [], recommended: ["NO_ACTION_REQUIRED"] },
  warnings: [],
  metadata: {
    assessedAt: "2026-09-15T11:02:40Z",
    mode: "SIMULATION",
    dataSnapshot: "historical-fixture",
    locale: "es",
    policyRefs: [{ id: "POL-DELAY-2026-03", version: "2026.03" }],
    notice: {
      code: "SIMULATION_MODE",
      title: "Datos de demostración",
      message:
        "Esta evaluación usa datos sintéticos históricos y no refleja información operacional en tiempo real.",
    },
  },
});

export function registerDocs(app: FastifyInstance): void {
  const requestId = { description: "Server-generated correlation ID", schema: { type: "string" } };
  const problemResponses = Object.fromEntries(
    ProblemDetailsSchema.options.map((schema) => {
      const code = schema.shape.code.value;
      return [
        problems[code].status,
        {
          description: problems[code].title,
          headers: {
            "X-Request-Id": requestId,
            ...(code === "RATE_LIMIT_EXCEEDED"
              ? {
                  "Retry-After": {
                    description: "Seconds until the limiter resets",
                    schema: { type: "integer" },
                  },
                }
              : {}),
          },
          content: {
            "application/problem+json": {
              schema: z.toJSONSchema(schema),
              example: problemDetails(code, "req_01"),
            },
          },
        },
      ];
    }),
  );

  const document = {
    openapi: "3.1.0",
    info: {
      title: "FlyNext API",
      version: "1.0.0",
      description: `${serviceInfo.notice} Read-only historical simulation; all bookings are synthetic.`,
    },
    paths: {
      "/": {
        get: {
          summary: "Service information",
          responses: {
            200: {
              description: "FlyNext service information",
              content: { "application/json": { example: serviceInfo } },
            },
          },
        },
      },
      "/health": {
        get: {
          summary: "Health check",
          responses: {
            200: {
              description: "Service is healthy",
              content: {
                "application/json": {
                  schema: z.toJSONSchema(healthResponseSchema),
                  example: { status: "ok" },
                },
              },
            },
          },
        },
      },
      [ASSESSMENT_PATH]: {
        post: {
          operationId: "assessDisruption",
          summary: "Assess disruptions for a synthetic booking",
          description: `Read-only. JSON body limit: ${ASSESSMENT_BODY_LIMIT} bytes. This endpoint never changes a booking.`,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: z.toJSONSchema(AssessmentRequestSchema, { io: "input" }),
                examples: Object.fromEntries(
                  PUBLIC_BOOKINGS.map((bookingId) => [bookingId, { value: { bookingId } }]),
                ),
              },
            },
          },
          responses: {
            200: {
              description:
                "Assessment, including controlled degradation when sufficient evidence exists",
              headers: { "X-Request-Id": requestId },
              content: {
                "application/json": {
                  schema: z.toJSONSchema(AssessmentResponseSchema),
                  example: demo01,
                },
              },
            },
            ...problemResponses,
          },
        },
      },
    },
  };

  // Static mode serves the generated OpenAPI 3.1 document as-is. The plugin's static type only lists OpenAPI 3.0 and Swagger 2.
  app.register(swagger, {
    mode: "static",
    specification: { document: document as StaticDocumentSpec["document"] },
  });
  app.register(swaggerUi, {
    routePrefix: serviceInfo.docs,
    staticCSP: true,
    uiConfig: { validatorUrl: null },
  });
}
