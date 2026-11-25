// Internal domain model. Never exposed as a public DTO (A05); `@flynext/contracts` owns public shapes.
// Instants are UTC epoch milliseconds so every comparison, duration and freshness check is UTC (A02).

export type Instant = number;

export type SourceId = "OPS_CORE" | "AIRPORT_FEED" | "LEGACY_MIRROR";
export type SourceStatus = "OPERATIONAL" | "DEGRADED";

export type FlightStatus = "SCHEDULED" | "ON_TIME" | "DELAYED" | "CANCELLED" | "UNKNOWN";
export type Severity = "NONE" | "INFO" | "WARNING" | "CRITICAL" | "UNKNOWN";
export type ConnectionStatus = "SAFE" | "AT_RISK" | "MISSED" | "UNKNOWN";
export type AssessmentStatus = "COMPLETE" | "PARTIAL" | "INDETERMINATE";
export type RecommendationType =
  "NO_ACTION_REQUIRED" | "MONITOR_FLIGHT" | "REVIEW_REBOOKING_OPTIONS" | "HUMAN_REVIEW";
export type Priority = "LOW" | "NORMAL" | "HIGH";

export interface Airport {
  readonly code: string;
  readonly country: string;
  readonly timeZone: string;
}

export interface FlightSegment {
  readonly id: string;
  readonly flightNumber: string;
  readonly origin: Airport;
  readonly destination: Airport;
  readonly scheduledDeparture: Instant;
  readonly scheduledArrival: Instant;
}

/** Unknown is never coerced to a boolean: it stays explicit. */
export type Tristate = "YES" | "NO" | "UNKNOWN";

export type ChangePenalty =
  | { readonly kind: "NONE_CONFIRMED" }
  | { readonly kind: "AMOUNT"; readonly amount: number; readonly currency: string }
  | { readonly kind: "UNKNOWN" };

export interface FareConditions {
  readonly changesAllowed: Tristate;
  readonly changePenalty: ChangePenalty;
}

/** Passenger data is reduced to what a decision needs: no names, documents or exact ages (D09). */
export interface PassengerGroup {
  readonly size: number;
  readonly includesMinor: boolean;
}

export type CompensationRequest = "REQUESTED" | "NOT_REQUESTED" | "UNKNOWN";

export interface TripContext {
  readonly bookingId: string;
  readonly retrievedAt: Instant;
  readonly group: PassengerGroup;
  readonly segments: readonly FlightSegment[];
  readonly fare: FareConditions;
  readonly compensationRequest: CompensationRequest;
  readonly international: boolean;
}

interface EventBase {
  readonly id: string;
  readonly segmentId: string;
  readonly source: SourceId;
  readonly recordedAt: Instant;
}

export interface FlightStatusFacts {
  readonly status: FlightStatus;
  readonly delayMinutes?: number;
  readonly estimatedDeparture?: Instant;
  readonly actualDeparture?: Instant;
  readonly actualArrival?: Instant;
}

export interface FlightStatusEvent extends EventBase, FlightStatusFacts {
  readonly kind: "FLIGHT_STATUS";
}

export interface GateEvent extends EventBase {
  readonly kind: "GATE";
  readonly gate: string;
}

export type OperationalEvent = FlightStatusEvent | GateEvent;

export interface OperationalEventsSnapshot {
  readonly events: readonly OperationalEvent[];
  readonly sourceStatus: Readonly<Record<SourceId, SourceStatus>>;
}

export type ResolutionBasis = "PRIMARY_SOURCE" | "SECONDARY_SOURCE";
export type UnresolvedReason =
  "CONTRADICTION" | "STALE_DATA" | "DEGRADED_SOURCE_ONLY" | "NO_DATA" | "PROVIDER_FAILURE";

export type Resolved<T> =
  | {
      readonly kind: "RESOLVED";
      readonly value: T;
      readonly basis: ResolutionBasis;
      readonly eventId: string;
      readonly recordedAt: Instant;
    }
  | { readonly kind: "UNRESOLVED"; readonly reason: UnresolvedReason };

export type EventField = "FLIGHT_STATUS" | "GATE";

export interface Contradiction {
  readonly segmentId: string;
  readonly field: EventField;
  readonly eventIds: readonly string[];
  readonly outcome: "RESOLVED_BY_AUTHORITY" | "UNRESOLVED";
}

/** Internal evidence trail: sanitized references and reason codes only, never payloads (D09). */
export interface TraceEntry {
  readonly step:
    | "FRESHNESS"
    | "RECONCILIATION"
    | "CLASSIFICATION"
    | "CONNECTION"
    | "POLICY"
    | "ALTERNATIVE"
    | "DEGRADATION"
    | "RECOMMENDATION";
  readonly refs: readonly string[];
  readonly decision: string;
  readonly reasonCode?: string;
}

/** Why a read provider produced no usable data. Programming errors are never mapped here. */
export type ProviderFailure = "NOT_FOUND" | "UNAVAILABLE" | "TIMEOUT" | "INVALID_RESPONSE";
