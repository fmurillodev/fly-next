import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import abc123 from "../../../test/fixtures/abc123.json";
import demo01 from "../../../test/fixtures/demo01.json";
import { json, requestedBookingId, stubFetch } from "../../../test/fetch-mock";
import { useAssessment } from "./use-assessment";

describe("useAssessment", () => {
  it("ignores a stale response when a newer query was started", async () => {
    const pending = new Map<unknown, (response: Response) => void>();
    stubFetch(
      (init) =>
        new Promise((resolve) => {
          pending.set(requestedBookingId(init), resolve);
        }),
    );
    const { result } = renderHook(() => useAssessment());

    act(() => void result.current.submit("ABC123"));
    act(() => void result.current.submit("DEMO01"));
    await act(async () => pending.get("DEMO01")!(json(demo01)));
    await waitFor(() => expect(result.current.state.status).toBe("success"));
    await act(async () => pending.get("ABC123")!(json(abc123)));

    expect(result.current.state).toMatchObject({ status: "success", bookingId: "DEMO01" });
  });
});
