import type { FastifyBaseLogger } from "fastify";
import type { AssessmentResponse } from "@flynext/contracts";
import type { AssessDisruptionDeps } from "../disruption/application/assess-disruption.js";
import type { ProviderFailure } from "../disruption/domain/model.js";
import type { ProviderResult } from "../disruption/domain/ports.js";

type Provider = "trips" | "events" | "policies" | "options";
const providerFailures = [
  "NOT_FOUND",
  "TIMEOUT",
  "UNAVAILABLE",
  "INVALID_RESPONSE",
] satisfies ProviderFailure[];

export function instrumentProviders(
  deps: AssessDisruptionDeps,
  log: FastifyBaseLogger,
): AssessDisruptionDeps {
  async function read<T>(provider: Provider, run: () => Promise<ProviderResult<T>>) {
    const started = performance.now();
    let outcome = "THREW";
    try {
      const result = await run();
      outcome = result.ok ? "OK" : "FAILED";
      if (!result.ok && !(provider === "trips" && result.failure === "NOT_FOUND")) {
        const failure = providerFailures.includes(result.failure) ? result.failure : "UNRECOGNIZED";
        log.warn({ category: "ERROR", event: "provider.failed", provider, failure });
      }
      return result;
    } finally {
      log.info({
        category: "METRIC",
        event: "provider.read",
        provider,
        outcome,
        durationMs: performance.now() - started,
      });
    }
  }

  return {
    ...deps,
    trips: { getTripContext: (id) => read("trips", () => deps.trips.getTripContext(id)) },
    events: {
      getOperationalEvents: (ids) => read("events", () => deps.events.getOperationalEvents(ids)),
    },
    policies: {
      getPolicyRules: (scenario) => read("policies", () => deps.policies.getPolicyRules(scenario)),
    },
    options: {
      getEligibleOptions: (trip) => read("options", () => deps.options.getEligibleOptions(trip)),
    },
  };
}

export function logAssessment(log: FastifyBaseLogger, assessment: AssessmentResponse): void {
  log.info({
    category: "BUSINESS",
    event: "assessment.completed",
    assessmentStatus: assessment.assessmentStatus,
    severity: assessment.disruption.severity,
    connectionStatus: assessment.connection?.status ?? null,
    recommendation: assessment.recommendation.type,
    priority: assessment.recommendation.priority,
  });
  for (const { code } of assessment.warnings) {
    log.info({ category: "DATA", event: "assessment.data_quality", warning: code });
  }
}
