import type { Clock } from "../domain/ports.js";
import { instantFromIso } from "../domain/time.js";

/** Base-case reference instant (D03): historical fixtures are evaluated at this moment. */
export const SIMULATION_REFERENCE = "2026-09-15T11:02:40Z";

export function createSimulationClock(referenceIso: string = SIMULATION_REFERENCE): Clock {
  const instant = instantFromIso(referenceIso);
  return { now: () => instant, mode: "SIMULATION" };
}
