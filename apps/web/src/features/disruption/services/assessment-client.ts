import {
  AssessmentResponseSchema,
  ProblemDetailsSchema,
  type AssessmentResponse,
} from "@flynext/contracts";

export const ASSESSMENT_PATH = "/api/v1/disruptions/assessment";
export const ASSESSMENT_TIMEOUT_MS = 10_000;

export type FailureReason =
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "network"
  | "timeout"
  | "invalid_response"
  | "unexpected";

export type AssessmentResult =
  | { kind: "success"; data: AssessmentResponse }
  | { kind: "failure"; reason: FailureReason; requestId?: string }
  | { kind: "aborted" };

type Options = { signal?: AbortSignal; timeoutMs?: number; fetchImpl?: typeof fetch };

const reasonByProblemCode = {
  INVALID_REQUEST: "invalid_request",
  BOOKING_NOT_FOUND: "not_found",
  RATE_LIMIT_EXCEEDED: "rate_limited",
} as const;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function requestAssessment(
  bookingId: string,
  { signal, timeoutMs = ASSESSMENT_TIMEOUT_MS, fetchImpl = fetch }: Options = {},
): Promise<AssessmentResult> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(ASSESSMENT_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ bookingId }),
      signal: controller.signal,
    });
    const body = await readJson(response);

    if (response.ok) {
      const parsed = AssessmentResponseSchema.safeParse(body);
      return parsed.success
        ? { kind: "success", data: parsed.data }
        : { kind: "failure", reason: "invalid_response" };
    }

    const problem = ProblemDetailsSchema.safeParse(body);
    if (!problem.success) return { kind: "failure", reason: "unexpected" };
    const reason =
      problem.data.code in reasonByProblemCode
        ? reasonByProblemCode[problem.data.code as keyof typeof reasonByProblemCode]
        : "unexpected";
    return { kind: "failure", reason, requestId: problem.data.requestId };
  } catch {
    if (signal?.aborted) return { kind: "aborted" };
    return { kind: "failure", reason: timedOut ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
