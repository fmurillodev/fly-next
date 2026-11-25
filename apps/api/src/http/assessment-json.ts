// Match the object boundary and its first member's name; JSON.parse validates escapes and values.
const envelope = /^[ \t\r\n]*\{[ \t\r\n]*("(?:[^"\\]|\\[\s\S])*")[ \t\r\n]*:([\s\S]*)\}[ \t\r\n]*$/;

export function parseAssessmentJson(body: string): { bookingId: unknown } | undefined {
  const [, key, value] = envelope.exec(body) ?? [];
  if (key === undefined || value === undefined) return undefined;

  try {
    // Parse key and value as separate array entries so JSON.parse cannot discard duplicate keys.
    const members: unknown = JSON.parse(`[${key},${value}]`);
    if (Array.isArray(members) && members.length === 2 && members[0] === "bookingId") {
      return { bookingId: members[1] };
    }
  } catch {
    // Do not attach the input or parser error to the request's sanitized problem response.
  }
  return undefined;
}
