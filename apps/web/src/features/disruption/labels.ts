import type { AssessmentResponse } from "@flynext/contracts";
import type { Tone } from "../../components/ui/status-badge";

type Segment = AssessmentResponse["disruption"]["events"][number];
type Connection = NonNullable<AssessmentResponse["connection"]>;
type Alternative = Extract<
  AssessmentResponse["alternatives"],
  { status: "EVALUATED" }
>["options"][number];

type Label = { text: string; tone: Tone };

// Presentation only: these map backend states to wording, icons and colors.
export const assessmentStatusLabel: Record<AssessmentResponse["assessmentStatus"], string> = {
  COMPLETE: "Evaluación completa",
  PARTIAL: "Evaluación parcial",
  INDETERMINATE: "Evaluación no determinada",
};

export const severityLabel: Record<Segment["severity"], Label> = {
  NONE: { text: "Sin alteraciones", tone: "ok" },
  INFO: { text: "Información", tone: "info" },
  WARNING: { text: "Atención", tone: "warn" },
  CRITICAL: { text: "Alteración crítica", tone: "critical" },
  UNKNOWN: { text: "Sin verificar", tone: "unknown" },
};

export const flightStatusLabel: Record<Segment["flightStatus"], string> = {
  SCHEDULED: "Programado",
  ON_TIME: "En horario",
  DELAYED: "Retrasado",
  CANCELLED: "Cancelado",
  UNKNOWN: "Sin verificar",
};

export const connectionLabel: Record<Connection["status"], Label> = {
  SAFE: { text: "Conexión segura", tone: "ok" },
  AT_RISK: { text: "Conexión en riesgo", tone: "warn" },
  MISSED: { text: "Conexión perdida", tone: "critical" },
  UNKNOWN: { text: "Conexión sin verificar", tone: "unknown" },
};

export const recommendationLabel: Record<AssessmentResponse["recommendation"]["type"], string> = {
  NO_ACTION_REQUIRED: "No se requiere ninguna acción",
  MONITOR_FLIGHT: "Seguir el estado del vuelo",
  REVIEW_REBOOKING_OPTIONS: "Revisar opciones de cambio",
  HUMAN_REVIEW: "Revisar con un agente",
};

export const priorityLabel: Record<AssessmentResponse["recommendation"]["priority"], string> = {
  LOW: "Prioridad baja",
  NORMAL: "Prioridad normal",
  HIGH: "Prioridad alta",
};

export const eligibilityLabel: Record<Alternative["eligibility"], Label> = {
  ELIGIBLE: { text: "Elegible", tone: "ok" },
  PENDING_VALIDATION: { text: "Pendiente de validación", tone: "warn" },
  NOT_ELIGIBLE: { text: "No disponible", tone: "unknown" },
  REQUIRES_REVIEW: { text: "Requiere revisión", tone: "info" },
};

export function delayLabel(delay: Segment["delay"]): Label {
  switch (delay.status) {
    case "CONFIRMED":
      return { text: `Retraso confirmado: ${delay.minutes} min`, tone: "warn" };
    case "UNCONFIRMED":
      return { text: `Retraso sin confirmar: ${delay.minutes} min`, tone: "info" };
    case "NOT_DELAYED":
      return { text: "Sin retraso informado", tone: "ok" };
    case "UNKNOWN":
      return { text: "Retraso sin verificar", tone: "unknown" };
  }
}

export function gateLabel(gate: Segment["gate"]): string {
  return gate.status === "KNOWN" ? `Puerta ${gate.value}` : "Puerta sin informar";
}
