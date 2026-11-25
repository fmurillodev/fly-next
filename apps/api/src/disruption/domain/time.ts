import type { Instant } from "./model.js";

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Parses an ISO 8601 timestamp that carries an explicit offset (A02); anything else is rejected. */
export function instantFromIso(iso: string): Instant {
  const value = ISO_WITH_OFFSET.test(iso) ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(value)) {
    throw new RangeError("Timestamp must be ISO 8601 with an explicit UTC offset");
  }
  return value;
}

/** Offset, in minutes, written in the timestamp itself (`Z` is 0). */
export function offsetFromIso(iso: string): number {
  if (!ISO_WITH_OFFSET.test(iso))
    throw new RangeError("Timestamp must carry an explicit UTC offset");
  const match = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/** Offset of an IANA zone at a given instant, resolved per date from the tz database. */
export function utcOffsetMinutes(instant: Instant, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(instant));
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(name);
  if (!match) throw new RangeError(`Unsupported time zone offset: ${name}`);
  if (!match[1]) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

export const minutesBetween = (from: Instant, to: Instant): number => (to - from) / 60_000;
export const addMinutes = (instant: Instant, minutes: number): Instant =>
  instant + minutes * 60_000;
export const ageMs = (recordedAt: Instant, now: Instant): number => now - recordedAt;

/** A window is inclusive: data whose age equals the window is still fresh. */
export const isWithinMinutes = (
  recordedAt: Instant,
  now: Instant,
  windowMinutes: number,
): boolean => ageMs(recordedAt, now) <= windowMinutes * 60_000;
export const isWithinSeconds = (
  recordedAt: Instant,
  now: Instant,
  windowSeconds: number,
): boolean => ageMs(recordedAt, now) <= windowSeconds * 1000;
