import { vi } from "vitest";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": status === 200 ? "application/json" : "application/problem+json" },
  });
}

export function stubFetch(handler: (init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn((_url: string, init: RequestInit) => handler(init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function requestedBookingId(init: RequestInit): unknown {
  return JSON.parse(String(init.body)).bookingId;
}
