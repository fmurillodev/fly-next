import type { AlternativeEvaluation } from "./alternatives.js";
import type { ConnectionAssessment } from "./connection.js";
import type {
  AssessmentStatus,
  Priority,
  ProviderFailure,
  RecommendationType,
  Severity,
} from "./model.js";
import type { PolicyStatus, PolicyValidity, RuleEvaluation } from "./policies.js";

export type PolicyOutcome =
  | { readonly available: false; readonly failure: ProviderFailure }
  | {
      readonly available: true;
      readonly validity: PolicyValidity;
      readonly evaluations: readonly RuleEvaluation[];
    };

export type AlternativesOutcome =
  | { readonly kind: "NOT_REQUIRED" }
  | { readonly kind: "UNAVAILABLE"; readonly failure: ProviderFailure }
  | { readonly kind: "EVALUATED"; readonly options: readonly AlternativeEvaluation[] };

export interface DecisionInput {
  readonly severity: Severity;
  readonly connection: ConnectionAssessment | null;
  readonly policies: PolicyOutcome;
  readonly alternatives: AlternativesOutcome;
  readonly includesMinor: boolean;
  readonly fareIncomplete: boolean;
  /** Some fact rests on a secondary source only. */
  readonly hasUnconfirmedFacts: boolean;
}

export interface Recommendation {
  readonly type: RecommendationType;
  readonly priority: Priority;
  /** Internal codes: `GROUP_INCLUDES_MINOR` is mapped to `PRIORITY_REVIEW_REQUIRED` publicly (A05). */
  readonly reasonCodes: readonly string[];
}

const isRelevant = (severity: Severity): boolean =>
  severity === "WARNING" || severity === "CRITICAL";
const ruleStatus = (
  input: DecisionInput,
  ruleId: RuleEvaluation["ruleId"],
): PolicyStatus | undefined =>
  input.policies.available
    ? input.policies.evaluations.find((e) => e.ruleId === ruleId)?.status
    : undefined;

/** D08/D10: COMPLETE only when every determination is verified; unknowns degrade, never disappear. */
export function determineAssessmentStatus(input: DecisionInput): AssessmentStatus {
  if (input.severity === "UNKNOWN") return "INDETERMINATE";
  const connection = input.connection;
  const connectionUncertain =
    connection !== null &&
    (connection.status === "UNKNOWN" ||
      (connection.status === "AT_RISK" && connection.lossConfirmation === "NOT_CONFIRMED"));
  const policiesUncertain =
    !input.policies.available ||
    input.policies.validity !== "VALID" ||
    input.policies.evaluations.some((e) => e.status === "INSUFFICIENT_EVIDENCE");
  const alternativesUncertain =
    input.alternatives.kind === "UNAVAILABLE" ||
    (input.alternatives.kind === "EVALUATED" &&
      input.alternatives.options.some(
        (o) => o.eligibility === "PENDING_VALIDATION" || o.eligibility === "REQUIRES_REVIEW",
      ));
  return connectionUncertain ||
    policiesUncertain ||
    alternativesUncertain ||
    input.hasUnconfirmedFacts
    ? "PARTIAL"
    : "COMPLETE";
}

/** D07: recommends only. The result never states that an operation was executed. */
export function recommend(input: DecisionInput): Recommendation {
  const { severity, connection } = input;
  const relevant = isRelevant(severity);
  const approvalRequired =
    ruleStatus(input, "R4") === "REQUIRES_HUMAN_APPROVAL" ||
    ruleStatus(input, "R5") === "REQUIRES_HUMAN_APPROVAL";
  const eligible =
    input.alternatives.kind === "EVALUATED" &&
    input.alternatives.options.some((o) => o.eligibility === "ELIGIBLE");
  const rebookBenefit =
    ruleStatus(input, "R1") === "APPLICABLE" || ruleStatus(input, "R3") === "APPLICABLE";

  const policiesUnverified = !input.policies.available || input.policies.validity !== "VALID";

  const reasons: string[] = [];
  if (connection?.status === "MISSED") reasons.push("CONNECTION_MISSED");
  else if (connection?.status === "AT_RISK") reasons.push("CONNECTION_AT_RISK");
  else if (connection?.status === "UNKNOWN" && severity !== "UNKNOWN")
    reasons.push("CONNECTION_UNKNOWN");
  if (ruleStatus(input, "R5") === "REQUIRES_HUMAN_APPROVAL") reasons.push("GROUP_INCLUDES_MINOR");
  if (ruleStatus(input, "R4") === "REQUIRES_HUMAN_APPROVAL") reasons.push("COMPENSATION_REQUESTED");
  if (relevant && input.fareIncomplete) reasons.push("INCOMPLETE_FARE_CONDITIONS");
  if (relevant && (!input.policies.available || input.policies.validity !== "VALID"))
    reasons.push("POLICY_UNVERIFIED");
  if (relevant && input.alternatives.kind === "UNAVAILABLE")
    reasons.push("ALTERNATIVES_UNAVAILABLE");
  if (severity === "UNKNOWN") reasons.push("OPERATIONAL_DATA_UNRESOLVED");

  let type: RecommendationType;
  if (severity === "UNKNOWN") type = "HUMAN_REVIEW";
  else if (relevant) {
    if (
      connection?.status === "AT_RISK" ||
      connection?.status === "UNKNOWN" ||
      approvalRequired ||
      policiesUnverified
    ) {
      type = "HUMAN_REVIEW";
    } else if (eligible) type = "REVIEW_REBOOKING_OPTIONS";
    else if (rebookBenefit || connection?.status === "MISSED") {
      type = "HUMAN_REVIEW";
      reasons.push("NO_VERIFIED_ALTERNATIVE");
    } else type = "MONITOR_FLIGHT";
  } else if (severity === "INFO" || connection?.status === "UNKNOWN") type = "MONITOR_FLIGHT";
  else type = "NO_ACTION_REQUIRED";

  const priority: Priority =
    type === "NO_ACTION_REQUIRED"
      ? "LOW"
      : type === "MONITOR_FLIGHT"
        ? "NORMAL"
        : severity === "CRITICAL" || input.includesMinor
          ? "HIGH"
          : "NORMAL";
  return { type, priority, reasonCodes: reasons };
}
