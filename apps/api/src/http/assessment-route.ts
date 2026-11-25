import { AssessmentRequestSchema, AssessmentResponseSchema } from "@flynext/contracts";
import type { FastifyInstance } from "fastify";
import {
  createAssessDisruption,
  type AssessDisruptionDeps,
} from "../disruption/application/assess-disruption.js";
import { presentAssessment } from "../disruption/presentation/present-assessment.js";
import { instrumentProviders, logAssessment } from "../shared/observability.js";
import { createAssessmentLimit } from "./assessment-limit.js";
import { applicationProblems, sendProblem } from "./problem-details.js";
import { ASSESSMENT_BODY_LIMIT, ASSESSMENT_PATH } from "./public-api.js";

export function registerAssessmentRoute(
  app: FastifyInstance,
  deps: AssessDisruptionDeps,
  rateLimitMax: number,
): void {
  const limit = createAssessmentLimit(rateLimitMax);

  app.post(
    ASSESSMENT_PATH,
    {
      bodyLimit: ASSESSMENT_BODY_LIMIT,
      async onRequest(request, reply) {
        reply.header("x-request-id", request.id).header("cache-control", "no-store");
        const retryAfter = limit(request.ip);
        if (retryAfter !== undefined) {
          request.log.warn({ category: "ALERT", event: "http.assessment_rate_limited" });
          return sendProblem(reply.header("retry-after", retryAfter), "RATE_LIMIT_EXCEEDED");
        }
        if (
          request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !==
          "application/json"
        ) {
          return sendProblem(reply, "INVALID_REQUEST");
        }
      },
      async onResponse(request, reply) {
        request.log.info({
          category: "METRIC",
          event: "http.assessment",
          status: reply.statusCode,
          durationMs: reply.elapsedTime,
        });
      },
    },
    async (request, reply) => {
      const input = AssessmentRequestSchema.safeParse(request.body);
      if (!input.success) return sendProblem(reply, "INVALID_REQUEST");

      let stage = "ASSESSMENT";
      const started = performance.now();
      try {
        const assess = createAssessDisruption(instrumentProviders(deps, request.log));
        const result = await assess(input.data.bookingId);
        if (!result.ok) {
          const code = result.error.code;
          if (code === "STALE_BOOKING_CONTEXT") {
            request.log.warn({ category: "DATA", event: "assessment.booking_stale", code });
          }
          return sendProblem(reply, applicationProblems[code]);
        }

        stage = "PRESENTATION";
        const presented = AssessmentResponseSchema.safeParse(
          presentAssessment(result.assessment, request.id),
        );
        if (!presented.success || presented.data.requestId !== request.id) {
          request.log.error({
            category: "ERROR",
            event: "assessment.failed",
            code: "INTERNAL_ERROR",
            stage: "DTO_VALIDATION",
          });
          return sendProblem(reply, "INTERNAL_ERROR");
        }
        logAssessment(request.log, presented.data);
        return reply.send(presented.data);
      } catch {
        request.log.error({
          category: "ERROR",
          event: "assessment.failed",
          code: "INTERNAL_ERROR",
          stage,
        });
        return sendProblem(reply, "INTERNAL_ERROR");
      } finally {
        request.log.info({
          category: "METRIC",
          event: "assessment.process",
          durationMs: performance.now() - started,
        });
      }
    },
  );
}
