import { z } from "zod";

const problem = <Code extends string, Status extends number>(code: Code, status: Status) =>
  z.strictObject({
    type: z.string(),
    title: z.string(),
    status: z.literal(status),
    code: z.literal(code),
    detail: z.string(),
    requestId: z.string(),
  });

export const ProblemDetailsSchema = z.discriminatedUnion("code", [
  problem("INVALID_REQUEST", 400),
  problem("BOOKING_NOT_FOUND", 404),
  problem("RATE_LIMIT_EXCEEDED", 429),
  problem("INVALID_UPSTREAM_RESPONSE", 502),
  problem("UPSTREAM_UNAVAILABLE", 503),
  problem("UPSTREAM_TIMEOUT", 504),
  problem("INTERNAL_ERROR", 500),
]);

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
