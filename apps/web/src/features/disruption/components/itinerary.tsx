import type { AssessmentResponse } from "@flynext/contracts";
import { PlaneTakeoff } from "lucide-react";
import { Card, CardTitle } from "../../../components/ui/card";
import { StatusBadge } from "../../../components/ui/status-badge";
import { formatClock, formatDay } from "../../../lib/format";
import { delayLabel, flightStatusLabel, gateLabel, severityLabel } from "../labels";

type Segment = AssessmentResponse["disruption"]["events"][number];

function SegmentItem({ segment }: { segment: Segment }) {
  const delay = delayLabel(segment.delay);
  const severity = severityLabel[segment.severity];
  return (
    <li className="rounded-input border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-extrabold">
          <PlaneTakeoff aria-hidden className="size-4 text-indigo" />
          {segment.flightNumber}
          <span className="font-medium text-slate-600">
            {flightStatusLabel[segment.flightStatus]}
          </span>
        </p>
        <StatusBadge tone={severity.tone}>{severity.text}</StatusBadge>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div>
          <p className="text-2xl font-extrabold">{formatClock(segment.scheduledDeparture)}</p>
          <p className="text-sm font-semibold">{segment.origin.code}</p>
          <p className="text-sm text-slate-600">{formatDay(segment.scheduledDeparture)}</p>
        </div>
        <span aria-hidden className="h-px w-8 bg-slate-300 sm:w-16" />
        <div className="text-right">
          <p className="text-2xl font-extrabold">{formatClock(segment.scheduledArrival)}</p>
          <p className="text-sm font-semibold">{segment.destination.code}</p>
          <p className="text-sm text-slate-600">{formatDay(segment.scheduledArrival)}</p>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Horarios programados, en hora local de cada aeropuerto.
      </p>

      {segment.estimatedDeparture && (
        <p className="mt-2 text-sm font-semibold">
          Salida estimada: {formatClock(segment.estimatedDeparture)} ({segment.origin.code})
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge tone={delay.tone}>{delay.text}</StatusBadge>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-800">
          {gateLabel(segment.gate)}
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-700">{segment.message.message}</p>
    </li>
  );
}

export function Itinerary({ events }: { events: Segment[] }) {
  return (
    <Card aria-labelledby="itinerary-title">
      <CardTitle id="itinerary-title">Tu itinerario</CardTitle>
      <ol className="mt-4 grid gap-3">
        {events.map((segment) => (
          <SegmentItem key={segment.segmentId} segment={segment} />
        ))}
      </ol>
    </Card>
  );
}
