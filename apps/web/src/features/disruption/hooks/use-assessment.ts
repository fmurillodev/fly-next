import { useCallback, useEffect, useRef, useState } from "react";
import type { AssessmentResponse } from "@flynext/contracts";
import { requestAssessment, type FailureReason } from "../services/assessment-client";

export type AssessmentState =
  | { status: "idle" }
  | { status: "loading"; bookingId: string }
  | { status: "success"; bookingId: string; data: AssessmentResponse }
  | { status: "failure"; bookingId: string; reason: FailureReason; requestId?: string };

export function useAssessment() {
  const [state, setState] = useState<AssessmentState>({ status: "idle" });
  const active = useRef<AbortController | null>(null);

  const submit = useCallback(async (bookingId: string) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState({ status: "loading", bookingId });

    const result = await requestAssessment(bookingId, { signal: controller.signal });
    // A newer query (or a reset) owns the screen: drop this response.
    if (active.current !== controller || result.kind === "aborted") return;

    setState(
      result.kind === "success"
        ? { status: "success", bookingId, data: result.data }
        : { status: "failure", bookingId, reason: result.reason, requestId: result.requestId },
    );
  }, []);

  const reset = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setState({ status: "idle" });
  }, []);

  useEffect(() => () => active.current?.abort(), []);

  return { state, submit, reset };
}
