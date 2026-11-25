import { Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { Card } from "../../../components/ui/card";
import type { FailureReason } from "../services/assessment-client";

const failureCopy: Record<FailureReason, { title: string; detail: string; retry: boolean }> = {
  invalid_request: {
    title: "El código de reserva no es válido",
    detail: "Revisa el código e inténtalo de nuevo.",
    retry: false,
  },
  not_found: {
    title: "No encontramos esa reserva",
    detail: "Revisa el código o prueba con uno de los escenarios de demostración.",
    retry: false,
  },
  rate_limited: {
    title: "Hiciste demasiadas consultas",
    detail: "Espera un momento antes de volver a intentarlo.",
    retry: true,
  },
  network: {
    title: "No pudimos conectarnos con el servicio",
    detail: "Revisa tu conexión e inténtalo de nuevo.",
    retry: true,
  },
  timeout: {
    title: "El servicio tardó demasiado en responder",
    detail: "Inténtalo de nuevo en unos segundos.",
    retry: true,
  },
  invalid_response: {
    title: "No pudimos interpretar la respuesta del servicio",
    detail: "Inténtalo de nuevo más tarde.",
    retry: true,
  },
  unexpected: {
    title: "Ocurrió un problema inesperado",
    detail: "Inténtalo de nuevo en unos minutos.",
    retry: true,
  },
};

export function LoadingPanel({ bookingId }: { bookingId: string }) {
  return (
    <Card role="status" className="flex items-center gap-3">
      <Loader2 aria-hidden className="size-5 animate-spin text-indigo motion-reduce:animate-none" />
      <p className="font-semibold">Consultando la reserva {bookingId}…</p>
    </Card>
  );
}

type FailureProps = { reason: FailureReason; requestId?: string; onRetry: () => void };

export function FailurePanel({ reason, requestId, onRetry }: FailureProps) {
  const copy = failureCopy[reason];
  return (
    <Card role="alert" className="border border-red-200">
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-red-700" />
        <div>
          <h2 className="text-lg font-bold">{copy.title}</h2>
          <p className="mt-1 text-slate-700">{copy.detail}</p>
          {requestId && <p className="mt-2 text-sm text-slate-600">Referencia: {requestId}</p>}
          {copy.retry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-input border border-slate-300 px-4 font-bold hover:border-indigo hover:bg-indigo/5"
            >
              <RotateCw aria-hidden className="size-4" />
              Reintentar
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
