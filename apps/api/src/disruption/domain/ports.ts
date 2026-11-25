import type { AlternativeOption } from "./alternatives.js";
import type { Instant, OperationalEventsSnapshot, ProviderFailure, TripContext } from "./model.js";
import type { PolicyDocument } from "./policies.js";

/**
 * Read-only ports (D07, S17). Expected provider failures are values; anything thrown is a
 * programming error and is deliberately not translated into a business result.
 */
export type ProviderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ProviderFailure };

export interface Clock {
  now(): Instant;
  /** `SIMULATION` marks historical fixtures so they are never presented as real time (D03). */
  readonly mode: "SIMULATION" | "REAL_TIME";
}

export interface PolicyScenario {
  readonly type: "FLIGHT_DISRUPTION";
}

export interface TripContextProvider {
  getTripContext(bookingId: string): Promise<ProviderResult<TripContext>>;
}
export interface OperationalEventsProvider {
  getOperationalEvents(
    segmentIds: readonly string[],
  ): Promise<ProviderResult<OperationalEventsSnapshot>>;
}
export interface PolicyRulesProvider {
  getPolicyRules(scenario: PolicyScenario): Promise<ProviderResult<PolicyDocument>>;
}
export interface EligibleOptionsProvider {
  getEligibleOptions(trip: TripContext): Promise<ProviderResult<readonly AlternativeOption[]>>;
}
