import type { AlternativeOption } from "../domain/alternatives.js";
import type {
  EligibleOptionsProvider,
  OperationalEventsProvider,
  PolicyRulesProvider,
  ProviderResult,
  TripContextProvider,
} from "../domain/ports.js";
import { POLICY_PAYLOAD, SCENARIOS, type ScenarioFixture } from "./fixtures.js";
import { InvalidProviderPayload, mapBooking, mapEvents, mapOptions, mapPolicy } from "./mappers.js";

export interface MockProviders {
  readonly trips: TripContextProvider;
  readonly events: OperationalEventsProvider;
  readonly policies: PolicyRulesProvider;
  readonly options: EligibleOptionsProvider;
}

/** Only invalid payloads become INVALID_RESPONSE; any other error is a bug and propagates. */
async function guarded<T>(read: () => T): Promise<ProviderResult<T>> {
  try {
    return { ok: true, value: read() };
  } catch (error) {
    if (error instanceof InvalidProviderPayload) return { ok: false, failure: "INVALID_RESPONSE" };
    throw error;
  }
}

/** Local mock adapters over synthetic fixtures. No HTTP, no external systems (S17). */
export function createMockProviders(
  catalog: Readonly<Record<string, ScenarioFixture>> = SCENARIOS,
  policyPayload: unknown = POLICY_PAYLOAD,
): MockProviders {
  const byBooking = (bookingId: string) =>
    Object.hasOwn(catalog, bookingId) ? catalog[bookingId] : undefined;
  const bySegment = (segmentId: string) =>
    Object.values(catalog).find((s) =>
      s.booking.segments.some((seg) => seg.segmentId === segmentId),
    );

  return {
    trips: {
      async getTripContext(bookingId) {
        const scenario = byBooking(bookingId);
        if (!scenario) return { ok: false, failure: "NOT_FOUND" };
        return guarded(() => mapBooking(scenario.booking));
      },
    },
    events: {
      async getOperationalEvents(segmentIds) {
        const [first] = segmentIds;
        const scenario = first === undefined ? undefined : bySegment(first);
        if (!scenario) return { ok: false, failure: "NOT_FOUND" };
        return guarded(() => mapEvents(scenario.events));
      },
    },
    policies: {
      async getPolicyRules() {
        return guarded(() => mapPolicy(policyPayload));
      },
    },
    options: {
      async getEligibleOptions(trip) {
        const scenario = byBooking(trip.bookingId);
        if (!scenario) return { ok: false, failure: "NOT_FOUND" };
        return guarded((): readonly AlternativeOption[] => mapOptions(scenario.options));
      },
    },
  };
}
