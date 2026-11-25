/**
 * Product assumptions (not an airline policy). Each value is configurable and awaits validation with
 * Product and Operations (D01, D03). Policy thresholds (R1 = 180, R2 = 240) are NOT here: they are
 * approved rule definitions in `policies.ts`.
 */
export interface AssessmentConfig {
  /** D01: a delay at or above this many minutes is relevant. */
  readonly relevantDelayMinutes: number;
  /** D03: maximum age, in minutes, for data to remain fresh (age equal to the window is fresh). */
  readonly freshness: {
    readonly bookingContextMinutes: number;
    readonly operationalEventMinutes: number;
    readonly gateMinutes: number;
  };
}

export const DEFAULT_ASSESSMENT_CONFIG: AssessmentConfig = {
  relevantDelayMinutes: 30,
  freshness: { bookingContextMinutes: 5, operationalEventMinutes: 30, gateMinutes: 15 },
};
