import { ProblemDetailsSchema, type ProblemDetails } from "@flynext/contracts";
import type { FastifyReply } from "fastify";
import type { AssessmentErrorCode } from "../disruption/application/assess-disruption.js";

type ProblemCode = ProblemDetails["code"];
type ProblemCatalog = {
  [Code in ProblemCode]: Pick<
    Extract<ProblemDetails, { code: Code }>,
    "status" | "title" | "detail"
  >;
};

export const problems = {
  INVALID_REQUEST: {
    status: 400,
    title: "Invalid request",
    detail: "Send a size-limited JSON object with a valid bookingId.",
  },
  BOOKING_NOT_FOUND: {
    status: 404,
    title: "Booking not found",
    detail: "No synthetic booking matches the supplied identifier.",
  },
  RATE_LIMIT_EXCEEDED: {
    status: 429,
    title: "Rate limit exceeded",
    detail: "Too many assessment requests. Try again later.",
  },
  INVALID_UPSTREAM_RESPONSE: {
    status: 502,
    title: "Invalid upstream response",
    detail: "The booking data could not be verified.",
  },
  UPSTREAM_UNAVAILABLE: {
    status: 503,
    title: "Upstream unavailable",
    detail: "The booking provider is temporarily unavailable.",
  },
  UPSTREAM_TIMEOUT: {
    status: 504,
    title: "Upstream timeout",
    detail: "The booking provider did not respond in time.",
  },
  INTERNAL_ERROR: {
    status: 500,
    title: "Internal error",
    detail: "The assessment could not be completed.",
  },
} satisfies ProblemCatalog;

export const applicationProblems = {
  BOOKING_NOT_FOUND: "BOOKING_NOT_FOUND",
  INVALID_UPSTREAM_RESPONSE: "INVALID_UPSTREAM_RESPONSE",
  STALE_BOOKING_CONTEXT: "INVALID_UPSTREAM_RESPONSE",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  UPSTREAM_TIMEOUT: "UPSTREAM_TIMEOUT",
} as const satisfies Record<AssessmentErrorCode, ProblemCode>;

export function problemDetails(code: ProblemCode, requestId: string): ProblemDetails {
  return ProblemDetailsSchema.parse({
    ...problems[code],
    type: `https://flynext.example/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    code,
    requestId,
  });
}

export function sendProblem(reply: FastifyReply, code: ProblemCode): FastifyReply {
  const body = problemDetails(code, reply.request.id);
  return reply.code(body.status).type("application/problem+json").send(body);
}
