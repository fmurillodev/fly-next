import type { AssessmentResponse } from "@flynext/contracts";

type Time = AssessmentResponse["disruption"]["events"][number]["scheduledDeparture"];

const bookingIdPattern = /^[A-Z0-9]+$/;

/** Trims and upper-cases input; the shared contract still decides whether it is valid. */
export function normalizeBookingId(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isBookingIdShape(value: string): boolean {
  return bookingIdPattern.test(value);
}

/** Wall-clock time at the airport, as reported by the API (no timezone arithmetic). */
export function formatClock(time: Time): string {
  return time.local.slice(11, 16);
}

export function formatDay(time: Time): string {
  return new Intl.DateTimeFormat("es", {
    timeZone: time.timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(time.utc));
}
