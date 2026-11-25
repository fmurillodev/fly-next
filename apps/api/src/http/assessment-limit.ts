const WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 4096;

/** A per-instance fixed window. When full, reject new IPs rather than evicting a live counter. */
export function createAssessmentLimit(maxRequests: number) {
  const counters = new Map<string, number>();
  let resetAt = 0;

  return (ip: string): number | undefined => {
    const now = performance.now();
    if (now >= resetAt) {
      counters.clear();
      resetAt = now + WINDOW_MS;
    }
    const count = counters.get(ip);
    if (count === undefined ? counters.size >= MAX_TRACKED_IPS : count >= maxRequests) {
      return Math.ceil((resetAt - now) / 1000);
    }
    counters.set(ip, (count ?? 0) + 1);
    return undefined;
  };
}
