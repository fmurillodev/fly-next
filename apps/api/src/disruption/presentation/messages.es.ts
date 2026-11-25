import type { AssessmentResponse } from "@flynext/contracts";

export const spanishLocale = "es";

const cityNames: Readonly<Record<string, string>> = {
  "America/Santiago": "Santiago",
  "America/Lima": "Lima",
  "America/Mexico_City": "Ciudad de México",
};

type Time = AssessmentResponse["disruption"]["events"][number]["scheduledDeparture"];

export function localTime(time: Time, includeDate = false): string {
  const city =
    cityNames[time.timeZone] ??
    time.timeZone.split("/").at(-1)?.replaceAll("_", " ") ??
    time.timeZone;
  const date = includeDate
    ? `${new Intl.DateTimeFormat(spanishLocale, {
        timeZone: time.timeZone,
        day: "numeric",
        month: "short",
      }).format(new Date(time.utc))}, `
    : "";
  return `${date}${time.local.slice(11, 16)} (hora de ${city})`;
}

const withDetails = (lead: string, details: readonly string[]) => [lead, ...details].join(" ");
const talkToAgent = "Habla con un agente de la aerolínea sobre las opciones para tu itinerario.";
const verifyFlight =
  "Revisa el estado de tu vuelo antes de salir al aeropuerto: la información puede cambiar.";

export const messages = {
  DISRUPTION_NONE: () => ({
    title: "Tu viaje no presenta alteraciones verificadas",
    message: "No hay alteraciones verificadas en tu viaje.",
  }),
  DISRUPTION_INFO: (details: string[]) => ({
    title: "Hay una actualización sobre tu viaje",
    message: withDetails("Revisa la actualización de tu vuelo.", details),
  }),
  DISRUPTION_RELEVANT: (details: string[]) => ({
    title: "Tu viaje tiene una alteración relevante",
    message: withDetails("Revisa los datos de tu viaje.", details),
  }),
  DISRUPTION_CRITICAL: (details: string[]) => ({
    title: "Tu viaje tiene una alteración importante",
    message: withDetails("Puede que necesites revisar tu itinerario.", details),
  }),
  DISRUPTION_UNDETERMINED: () => ({
    title: "No hemos podido verificar el estado de tu viaje",
    message: "La información disponible no permite determinar si hay alteraciones.",
  }),

  FLIGHT_DELAYED_CONFIRMED: (flight: string, minutes: number, details: string[]) => ({
    title: `Tu vuelo ${flight} está retrasado`,
    message: withDetails(
      `El retraso confirmado para el vuelo ${flight} es de ${minutes} minutos.`,
      details,
    ),
  }),
  FLIGHT_DELAYED_UNCONFIRMED: (flight: string, minutes: number, details: string[]) => ({
    title: `Hay un reporte de retraso para el vuelo ${flight}`,
    message: withDetails(
      `Se informó un retraso de ${minutes} minutos para el vuelo ${flight}, pero todavía no está verificado.`,
      details,
    ),
  }),
  FLIGHT_CANCELLED: (flight: string) => ({
    title: `Tu vuelo ${flight} está cancelado`,
    message: `Se confirmó la cancelación del vuelo ${flight}.`,
  }),
  FLIGHT_ON_TIME: (flight: string, details: string[]) => ({
    title: `Tu vuelo ${flight} está en horario`,
    message: withDetails(`No hay retrasos informados para el vuelo ${flight}.`, details),
  }),
  FLIGHT_ON_SCHEDULE: (flight: string, details: string[]) => ({
    title: `Tu vuelo ${flight} sigue programado`,
    message: withDetails(`Por ahora no hay cambios informados para el vuelo ${flight}.`, details),
  }),
  FLIGHT_STATUS_UNVERIFIED: (flight: string, details: string[]) => ({
    title: `El estado de tu vuelo ${flight} no está verificado`,
    message: withDetails(`Todavía no podemos verificar el estado del vuelo ${flight}.`, details),
  }),

  CONNECTION_AT_RISK_PROJECTED_DELAY: (details: string[]) => ({
    title: "Tu conexión podría verse afectada",
    message: withDetails(
      "Con los horarios disponibles, es posible que no llegues a tiempo. No se ha confirmado la pérdida de la conexión.",
      details,
    ),
    nextSteps: ["Al aterrizar, consulta tu puerta de conexión en las pantallas del aeropuerto."],
  }),
  CONNECTION_AT_RISK_CONFIRMED_ARRIVAL: (details: string[]) => ({
    title: "Tu conexión está en riesgo",
    message: withDetails(
      "Aunque ya se confirmó tu llegada, todavía no podemos confirmar el resultado de la conexión.",
      details,
    ),
    nextSteps: ["Consulta en el aeropuerto el estado de tu vuelo de conexión."],
  }),
  CONNECTION_AT_RISK: (details: string[]) => ({
    title: "Tu conexión podría verse afectada",
    message: withDetails(
      "Los horarios disponibles indican un riesgo. Todavía no podemos confirmar el resultado de la conexión.",
      details,
    ),
  }),
  CONNECTION_AT_RISK_CANCELLATION_REPORTED: (details: string[]) => ({
    title: "Un reporte de cancelación afecta a tu conexión",
    message: withDetails(
      "Hay un reporte de cancelación en tu itinerario. Este reporte no confirma que hayas perdido la conexión.",
      details,
    ),
  }),
  CONNECTION_UNKNOWN: (details: string[]) => ({
    title: "Aún no podemos evaluar tu conexión con certeza",
    message: withDetails(
      "No hay evidencia suficiente para determinar si podrás conectar.",
      details,
    ),
  }),
  CONNECTION_SAFE: (details: string[], confirmedNotMissed: boolean) => ({
    title: confirmedNotMissed
      ? "No se perdió la conexión"
      : "Tu conexión conserva el margen previsto",
    message: withDetails(
      confirmedNotMissed
        ? "Los horarios reales confirman que la llegada no impidió la conexión."
        : "Los horarios disponibles mantienen el tiempo previsto para conectar, pero el resultado aún no está confirmado.",
      details,
    ),
  }),
  CONNECTION_MISSED_CONFIRMED: (details: string[]) => ({
    title: "Se confirmó la pérdida de tu conexión",
    message: withDetails(
      "Los horarios reales confirman que no llegaste a tiempo para conectar.",
      details,
    ),
  }),

  RECOMMENDATION_NO_ACTION: (onTime: boolean) => ({
    title: "No necesitas hacer nada por ahora",
    message: onTime
      ? "Tu vuelo está en horario según la información verificada."
      : "Los datos disponibles no indican que debas tomar alguna medida por ahora.",
    nextSteps: [verifyFlight],
  }),
  RECOMMENDATION_MONITOR: (details: string[]) => ({
    title: "Sigue las actualizaciones de tu viaje",
    message: withDetails("Consulta el estado de tu itinerario antes de viajar.", details),
    nextSteps: [verifyFlight],
  }),
  RECOMMENDATION_REVIEW_OPTIONS: (details: string[]) => ({
    title: "Revisa tus opciones de cambio de vuelo",
    message: [...details, "Esto es una recomendación: no hemos modificado tu reserva."].join(" "),
    nextSteps: [
      "Revisa las opciones propuestas y confirma los detalles con un agente de la aerolínea.",
    ],
  }),
  RECOMMENDATION_HUMAN_REVIEW: (details: string[]) => ({
    title: "Te recomendamos revisar tu itinerario con un agente",
    message: [
      ...details,
      "Esto es una recomendación: no hemos realizado ninguna acción por ti.",
    ].join(" "),
    nextSteps: [talkToAgent, "Ten a mano tu código de reserva y tus documentos de viaje."],
  }),

  OPTION_ELIGIBLE: (title: string) => ({
    title,
    message:
      "Esta opción cumple las condiciones verificadas para todo tu grupo. No está reservada: un agente debe confirmar que sigue disponible antes de cualquier cambio.",
  }),
  OPTION_PENDING_VALIDATION: (title: string, details: string[]) => ({
    title,
    message: withDetails("Esta opción todavía no está validada ni reservada.", details),
  }),
  OPTION_NOT_ELIGIBLE_SEATS: (title: string, details: string[]) => ({
    title,
    message: withDetails("No separamos a los pasajeros automáticamente.", details),
  }),
  OPTION_NOT_ELIGIBLE: (title: string, details: string[]) => ({
    title,
    message: withDetails("Esta opción no cumple las condiciones de la evaluación.", details),
  }),
  OPTION_REQUIRES_REVIEW: (title: string, details: string[]) => ({
    title,
    message: withDetails(
      "Un agente debe revisar esta opción antes de que se pueda confirmar.",
      details,
    ),
  }),
  OPTION_REFUND_REQUIRES_REVIEW: (title: string, details: string[]) => ({
    title,
    message: withDetails(
      "La posibilidad de un reembolso debe revisarse; no podemos asegurar que se otorgue.",
      details,
    ),
  }),
  SIMULATION_MODE: () => ({
    title: "Datos de demostración",
    message:
      "Esta evaluación usa datos sintéticos históricos y no refleja información operacional en tiempo real.",
  }),
};

export const facts = {
  gate: (value: string) => `Puerta de embarque: ${value}.`,
  gateUnknown: "Aún no hay información verificada sobre la puerta de embarque.",
  estimatedDeparture: (time: string) => `Su hora estimada de salida es ${time}.`,
  cancellationUnverified: "El reporte de cancelación no está confirmado.",
  confirmedDelay: (flight: string, minutes: number) =>
    `Tu vuelo ${flight} tiene un retraso confirmado de ${minutes} minutos.`,
  reportedDelay: (flight: string) =>
    `Hay un reporte de retraso para tu vuelo ${flight} que aún no está verificado.`,
  reportedCancellation: (flight: string) =>
    `Hay un reporte de cancelación para tu vuelo ${flight}.`,
  connectionRisk: "Tu conexión está en riesgo.",
  connectionMissed: "Se confirmó que no llegaste a tiempo a tu conexión.",
  bookedConnection: (minutes: number) =>
    `Tu itinerario preveía ${new Intl.NumberFormat(spanishLocale).format(minutes)} minutos para conectar.`,
  arrivalConfirmed: (flight: string, time: string) =>
    `La llegada confirmada del vuelo ${flight} fue a las ${time}.`,
  arrivalProjected: (time: string) =>
    `Estimamos tu llegada a las ${time}; todavía no se ha confirmado.`,
  outbound: {
    ACTUAL: (flight: string, time: string) =>
      `La salida confirmada del vuelo ${flight} fue a las ${time}.`,
    ESTIMATED: (flight: string, time: string) =>
      `La salida estimada del vuelo ${flight} es a las ${time}.`,
    SCHEDULED: (flight: string, time: string) =>
      `La salida programada del vuelo ${flight} es a las ${time}.`,
  },
  priorityReview: "Tu itinerario requiere atención prioritaria.",
  incompleteFare:
    "Sin todas las condiciones de cambio de tu tarifa, no podemos garantizar un cambio sin costo ni una compensación.",
  compensationReview: "Un agente debe revisar la solicitud de compensación; no está garantizada.",
  rebookConditional: (delayMinutes?: number) =>
    `${delayMinutes === undefined ? "La" : `Con un retraso confirmado de ${delayMinutes} minutos, la`} política aplicable contempla un cambio de vuelo sin penalidad, sujeto a la confirmación de un agente.`,
  mealConditional:
    "La política aplicable contempla un vale de comida, sujeto a la confirmación de un agente.",
  verifiedOptions: "Hay opciones que cumplen las condiciones verificadas de la evaluación.",
  optionTitle: (flight?: string, time?: string) =>
    [flight ? `Vuelo ${flight}` : "Opción de vuelo", time].filter(Boolean).join(" · "),
  refundTitle: "Reembolso",
};

type WarningCode = AssessmentResponse["warnings"][number]["code"];
export const warnings: Record<WarningCode, { title: string; message: string }> = {
  SOURCE_CONFLICT_RESOLVED: {
    title: "Datos contrastados",
    message: "Se pudieron verificar datos operativos que no coincidían entre sí.",
  },
  SOURCE_CONFLICT_UNRESOLVED: {
    title: "Datos que no coinciden",
    message: "Algunos datos operativos no coinciden y todavía no se han podido verificar.",
  },
  OPERATIONAL_DATA_STALE: {
    title: "Información desactualizada",
    message: "Parte de la información operativa no es lo bastante reciente para verificarla.",
  },
  OPERATIONAL_DATA_UNAVAILABLE: {
    title: "Información operativa no disponible",
    message: "No se pudieron consultar todos los datos operativos para esta evaluación.",
  },
  DEGRADED_SOURCE_LIMITED: {
    title: "Información limitada",
    message: "No se pudieron verificar algunos datos operativos con la información disponible.",
  },
  SECONDARY_SOURCE_ONLY: {
    title: "Datos pendientes de verificar",
    message: "Algunos reportes operativos aún no han podido corroborarse.",
  },
  FARE_CONDITIONS_INCOMPLETE: {
    title: "Condiciones de tarifa incompletas",
    message: "No se han verificado todas las condiciones de cambio de tu tarifa.",
  },
  POLICIES_UNAVAILABLE: {
    title: "Políticas no disponibles",
    message: "No se pudieron consultar las políticas aplicables a esta evaluación.",
  },
  POLICY_NOT_VALID: {
    title: "Política no verificada",
    message: "No se pudo verificar que la política disponible sea válida para este viaje.",
  },
  ALTERNATIVES_UNAVAILABLE: {
    title: "Alternativas no disponibles para consulta",
    message: "No se pudieron consultar las opciones alternativas para evaluar tu itinerario.",
  },
};

type Option = Extract<
  AssessmentResponse["alternatives"],
  { status: "EVALUATED" }
>["options"][number];
export const alternativeReasons: Record<Option["reasonCodes"][number], string> = {
  STALE_OPTION: "La información sobre esta opción no está vigente.",
  DEPARTED: "No hay una salida futura confirmada para este vuelo.",
  ITINERARY_INCOMPATIBLE: "Esta opción no es compatible con el itinerario completo.",
  NOT_REACHABLE: "Los horarios disponibles no permiten llegar a tiempo para esta opción.",
  REACHABILITY_UNCONFIRMED: "No está confirmado que llegues a tiempo.",
  INSUFFICIENT_SEATS_FOR_GROUP: "No hay asientos suficientes para todo tu grupo.",
  SEATS_UNKNOWN: "Todavía no se ha verificado si hay asientos para todo tu grupo.",
  CHANGES_NOT_ALLOWED: "Las condiciones verificadas de tu tarifa no permiten este cambio.",
  FARE_CONDITIONS_INCOMPLETE: "Falta verificar qué condiciones de cambio se aplican a tu tarifa.",
  CHANGE_PENALTY_APPLIES: "El cambio tiene una penalidad según las condiciones disponibles.",
  FARE_DIFFERENCE_APPLIES: "Hay una diferencia de tarifa que debe revisarse.",
  FARE_DIFFERENCE_UNKNOWN: "No se ha verificado si hay una diferencia de tarifa.",
  LOW_CONFIDENCE: "La información disponible sobre esta opción es limitada.",
  MEDIUM_CONFIDENCE: "Hace falta corroborar la información sobre esta opción.",
  REFUND_REQUIRES_REVIEW: "Un agente debe revisar las condiciones de reembolso.",
  REBOOKING_NOT_AUTHORIZED_BY_POLICY: "El cambio sin costo todavía no está autorizado.",
};
