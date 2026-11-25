import type { AssessmentResponse } from "@flynext/contracts";
import { Info, ShieldCheck, TriangleAlert } from "lucide-react";
import { Card, CardTitle } from "../../../components/ui/card";
import { StatusBadge } from "../../../components/ui/status-badge";
import { assessmentStatusLabel, severityLabel } from "../labels";
import { AlternativesCard } from "./alternatives-card";
import { ConnectionCard } from "./connection-card";
import { Itinerary } from "./itinerary";
import { RecommendationCard } from "./recommendation-card";

export function ResultHeader({
  bookingId,
  data,
  onNewQuery,
}: {
  bookingId: string;
  data: AssessmentResponse;
  onNewQuery: () => void;
}) {
  const severity = severityLabel[data.disruption.severity];
  return (
    <section
      aria-labelledby="result-title"
      className="mx-auto max-w-page px-5 pb-10 pt-4 text-white sm:px-8"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:items-end lg:gap-10">
        <div>
          <p className="text-sm font-bold text-soft">Reserva consultada</p>
          <h1
            id="result-title"
            tabIndex={-1}
            ref={(node) => node?.focus({ preventScroll: true })}
            className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl"
          >
            {bookingId}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge tone={severity.tone}>{severity.text}</StatusBadge>
            <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
              {assessmentStatusLabel[data.assessmentStatus]}
            </span>
          </div>
          <button
            type="button"
            onClick={onNewQuery}
            className="mt-6 min-h-11 rounded-input bg-white px-5 font-bold text-midnight hover:bg-slate-100"
          >
            Consultar otra reserva
          </button>
        </div>
        <div className="rounded-card bg-white/10 p-5 sm:p-6">
          <p className="text-lg font-bold">{data.disruption.summary.title}</p>
          <p className="mt-1 text-slate-100">{data.disruption.summary.message}</p>
        </div>
      </div>
    </section>
  );
}

function Warnings({ warnings }: { warnings: AssessmentResponse["warnings"] }) {
  if (warnings.length === 0) return null;
  return (
    <Card aria-labelledby="warnings-title">
      <CardTitle id="warnings-title">Advertencias y limitaciones</CardTitle>
      <ul className="mt-3 grid gap-3">
        {warnings.map((warning) => (
          <li key={warning.code} className="flex gap-3">
            <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">{warning.title}</p>
              <p className="text-sm text-slate-700">{warning.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SimulationNotice({ data }: { data: AssessmentResponse }) {
  const { metadata, actions } = data;
  return (
    <Card aria-labelledby="notice-title" className="bg-indigo/5">
      <h2 id="notice-title" className="flex items-center gap-2 font-bold">
        <Info aria-hidden className="size-5 text-indigo" />
        {metadata.notice?.title ?? "Información sobre estos datos"}
      </h2>
      {metadata.notice && <p className="mt-2 text-sm text-slate-700">{metadata.notice.message}</p>}
      {actions.executed.length === 0 && (
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-700" />
          No se ejecutó ningún cambio en tu reserva: esta pantalla solo muestra información.
        </p>
      )}
    </Card>
  );
}

export function AssessmentView({ data }: { data: AssessmentResponse }) {
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1.6fr_1fr] lg:items-start">
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        <div className="order-3 lg:order-none">
          <Itinerary events={data.disruption.events} />
        </div>
        <div className="order-5 lg:order-none">
          <AlternativesCard alternatives={data.alternatives} />
        </div>
      </div>
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        <div className="order-1 lg:order-none">
          <RecommendationCard recommendation={data.recommendation} />
        </div>
        {data.connection && (
          <div className="order-2 lg:order-none">
            <ConnectionCard connection={data.connection} />
          </div>
        )}
        <div className="order-4 empty:hidden lg:order-none">
          <Warnings warnings={data.warnings} />
        </div>
      </div>
      <div className="order-6 lg:order-none lg:col-span-2">
        <SimulationNotice data={data} />
      </div>
    </div>
  );
}
