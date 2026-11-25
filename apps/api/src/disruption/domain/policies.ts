import type { ConnectionAssessment } from "./connection.js";
import type {
  CompensationRequest,
  FlightStatusFacts,
  Instant,
  Resolved,
  Severity,
} from "./model.js";

export type PolicyBenefit =
  "REBOOK_NO_FEE" | "MEAL_VOUCHER" | "CASH_COMPENSATION" | "PRIORITY_HANDLING";
export type PolicyRuleId = "R1" | "R2" | "R3" | "R4" | "R5";
export type PolicyStatus =
  "APPLICABLE" | "NOT_APPLICABLE" | "REQUIRES_HUMAN_APPROVAL" | "INSUFFICIENT_EVIDENCE";
export type PolicyValidity = "VALID" | "EXPIRED" | "NOT_YET_VALID" | "INACTIVE" | "UNSUPPORTED";

/** Metadata of a provider policy. It carries no expressions: conditions live in this module (D05). */
export interface PolicyDocument {
  readonly policyId: string;
  readonly version: string;
  readonly status: "ACTIVE" | "RETIRED" | "DRAFT";
  readonly validFrom: Instant;
  readonly validUntil: Instant;
  readonly ruleIds: readonly string[];
}

export interface DelayEvidence {
  /** Largest delay reported by a non-degraded primary source. */
  readonly confirmedMinutes: number;
  /** Largest delay known only from a secondary source: informative, never grounds a benefit. */
  readonly unconfirmedMinutes: number;
  readonly hasUnresolvedSegments: boolean;
}

export interface PolicyFacts {
  readonly delay: DelayEvidence;
  readonly international: boolean;
  readonly connection: ConnectionAssessment | null;
  readonly compensationRequest: CompensationRequest;
  readonly includesMinor: boolean;
  readonly severity: Severity;
}

export interface RuleEvaluation {
  readonly ruleId: PolicyRuleId;
  readonly benefit: PolicyBenefit;
  readonly status: PolicyStatus;
  readonly reasonCode: string;
}

export interface PolicyEvaluation {
  readonly policyId: string;
  readonly version: string;
  readonly validity: PolicyValidity;
  readonly evaluations: readonly RuleEvaluation[];
  readonly ignoredRuleIds: readonly string[];
}

/** Policy supported by this engine (D05). Anything else grants nothing. */
export const SUPPORTED_POLICY_ID = "POL-DELAY-2026-03";
const DELAY_REBOOK_MINUTES = 180;
const DELAY_MEAL_MINUTES = 240;

const BENEFIT: Record<PolicyRuleId, PolicyBenefit> = {
  R1: "REBOOK_NO_FEE",
  R2: "MEAL_VOUCHER",
  R3: "REBOOK_NO_FEE",
  R4: "CASH_COMPENSATION",
  R5: "PRIORITY_HANDLING",
};
const RULE_ORDER: readonly PolicyRuleId[] = ["R1", "R2", "R3", "R4", "R5"];

export function summarizeDelays(statuses: readonly Resolved<FlightStatusFacts>[]): DelayEvidence {
  let confirmedMinutes = 0;
  let unconfirmedMinutes = 0;
  let hasUnresolvedSegments = false;
  for (const status of statuses) {
    if (status.kind === "UNRESOLVED") {
      hasUnresolvedSegments = true;
      continue;
    }
    const minutes = status.value.status === "DELAYED" ? (status.value.delayMinutes ?? 0) : 0;
    if (status.basis === "PRIMARY_SOURCE") confirmedMinutes = Math.max(confirmedMinutes, minutes);
    else unconfirmedMinutes = Math.max(unconfirmedMinutes, minutes);
  }
  return { confirmedMinutes, unconfirmedMinutes, hasUnresolvedSegments };
}

function validityOf(document: PolicyDocument, now: Instant): PolicyValidity {
  if (document.policyId !== SUPPORTED_POLICY_ID) return "UNSUPPORTED";
  if (document.status !== "ACTIVE") return "INACTIVE";
  if (now < document.validFrom) return "NOT_YET_VALID";
  if (now >= document.validUntil) return "EXPIRED";
  return "VALID";
}

function delayRule(delay: DelayEvidence, threshold: number): [PolicyStatus, string] {
  if (delay.confirmedMinutes >= threshold) return ["APPLICABLE", "DELAY_THRESHOLD_MET"];
  if (delay.unconfirmedMinutes >= threshold || delay.hasUnresolvedSegments) {
    return ["INSUFFICIENT_EVIDENCE", "DELAY_NOT_CONFIRMED"];
  }
  return ["NOT_APPLICABLE", "DELAY_BELOW_THRESHOLD"];
}

function evaluateRule(rule: PolicyRuleId, facts: PolicyFacts): [PolicyStatus, string] {
  switch (rule) {
    case "R1":
      return delayRule(facts.delay, DELAY_REBOOK_MINUTES);
    case "R2":
      return facts.international
        ? delayRule(facts.delay, DELAY_MEAL_MINUTES)
        : ["NOT_APPLICABLE", "NOT_INTERNATIONAL"];
    case "R3": {
      const connection = facts.connection;
      if (!connection) return ["NOT_APPLICABLE", "NO_CONNECTION"];
      if (connection.lossConfirmation === "CONFIRMED_MISSED")
        return ["APPLICABLE", "CONNECTION_MISSED_CONFIRMED"];
      if (connection.lossConfirmation === "CONFIRMED_NOT_MISSED" || connection.status === "SAFE") {
        return ["NOT_APPLICABLE", "CONNECTION_NOT_MISSED"];
      }
      return ["INSUFFICIENT_EVIDENCE", "MISSED_CONNECTION_NOT_CONFIRMED"];
    }
    case "R4":
      if (facts.compensationRequest === "REQUESTED")
        return ["REQUIRES_HUMAN_APPROVAL", "COMPENSATION_REQUESTED"];
      if (facts.compensationRequest === "UNKNOWN")
        return ["INSUFFICIENT_EVIDENCE", "COMPENSATION_REQUEST_UNKNOWN"];
      return ["NOT_APPLICABLE", "COMPENSATION_NOT_REQUESTED"];
    case "R5": {
      // D05 states the condition as "group includes a minor"; the approved base case ties priority
      // handling to a disruption context ("disruption context + minor"), so no disruption → not applicable.
      if (!facts.includesMinor) return ["NOT_APPLICABLE", "NO_MINOR_IN_GROUP"];
      if (facts.severity === "WARNING" || facts.severity === "CRITICAL") {
        return ["REQUIRES_HUMAN_APPROVAL", "GROUP_INCLUDES_MINOR"];
      }
      if (facts.severity === "UNKNOWN") return ["INSUFFICIENT_EVIDENCE", "DISRUPTION_UNDETERMINED"];
      return ["NOT_APPLICABLE", "NO_DISRUPTION_CONTEXT"];
    }
  }
}

/** Deterministic evaluation. Unknown, expired, inactive or unsupported policies grant nothing (D05). */
export function evaluatePolicies(
  document: PolicyDocument,
  facts: PolicyFacts,
  now: Instant,
): PolicyEvaluation {
  const validity = validityOf(document, now);
  const header = { policyId: document.policyId, version: document.version, validity };
  if (validity !== "VALID")
    return { ...header, evaluations: [], ignoredRuleIds: [...document.ruleIds] };

  const listed = new Set(document.ruleIds);
  const evaluations = RULE_ORDER.filter((rule) => listed.has(rule)).map(
    (ruleId): RuleEvaluation => {
      const [status, reasonCode] = evaluateRule(ruleId, facts);
      return { ruleId, benefit: BENEFIT[ruleId], status, reasonCode };
    },
  );
  const supported = new Set<string>(RULE_ORDER);
  return {
    ...header,
    evaluations,
    ignoredRuleIds: document.ruleIds.filter((id) => !supported.has(id)),
  };
}
