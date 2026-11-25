import type { AssessmentResponse } from "@flynext/contracts";
import { Clock, DoorOpen, Plane } from "lucide-react";
import { Card, CardTitle } from "../../../components/ui/card";
import { StatusBadge, type Tone } from "../../../components/ui/status-badge";
import { formatClock, formatDay } from "../../../lib/format";
import { delayDisplay, flightStatusLabel, gateValue, severityLabel } from "../labels";

type Segment = AssessmentResponse["disruption"]["events"][number];
type Time = Segment["scheduledDeparture"];

const tileTone: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-900",
  info: "bg-indigo-50 text-indigo-900",
  warn: "bg-amber-50 text-amber-900",
  critical: "bg-red-50 text-red-900",
  unknown: "bg-slate-100 text-slate-800",
};

function Endpoint({ code, time, align }: { code: string; time: Time; align: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="text-3xl font-extrabold leading-none tracking-tight">{formatClock(time)}</p>
      <p className="mt-1.5 text-lg font-bold">{code}</p>
      <p className="text-sm text-slate-600">{formatDay(time)}</p>
    </div>
  );
}

function Tile({
  tone,
  icon: Icon,
  label,
  value,
  unit,
}: {
  tone: Tone;
  icon: typeof Clock;
  label: string;
  value?: string | number;
  unit?: string;
}) {
  return (
    <div className={`rounded-input p-3 ${tileTone[tone]}`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon aria-hidden className="size-4 shrink-0" />
        {label}
      </p>
      {value !== undefined && (
        <p className="mt-1 text-3xl font-extrabold leading-none">
          {value}
          {unit && <span className="ml-1 text-base font-bold">{unit}</span>}
        </p>
      )}
    </div>
  );
}

function SegmentItem({ segment }: { segment: Segment }) {
  const delay = delayDisplay(segment.delay);
  const gate = gateValue(segment.gate);
  const severity = severityLabel[segment.severity];
  return (
    <li className="rounded-input border border-slate-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-baseline gap-2 text-lg font-extrabold">
          {segment.flightNumber}
          <span className="text-sm font-semibold text-slate-600">
            {flightStatusLabel[segment.flightStatus]}
          </span>
        </p>
        <StatusBadge tone={severity.tone}>{severity.text}</StatusBadge>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-start gap-3">
        <Endpoint code={segment.origin.code} time={segment.scheduledDeparture} align="left" />
        <div aria-hidden className="flex items-center gap-2 pt-3 text-indigo">
          <span className="flex-1 border-t-2 border-dashed border-slate-300" />
          <Plane className="size-5 shrink-0" />
          <span className="flex-1 border-t-2 border-dashed border-slate-300" />
        </div>
        <Endpoint code={segment.destination.code} time={segment.scheduledArrival} align="right" />
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Horarios programados, en hora local de cada aeropuerto.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile
          tone={delay.tone}
          icon={Clock}
          label={delay.label}
          value={delay.minutes}
          unit={delay.minutes === undefined ? undefined : "min"}
        />
        <Tile
          tone={gate === undefined ? "unknown" : "info"}
          icon={DoorOpen}
          label={gate === undefined ? "Puerta sin informar" : "Puerta de embarque"}
          value={gate}
        />
      </div>

      {segment.estimatedDeparture && (
        <p className="mt-3 text-sm font-semibold">
          Salida estimada: {formatClock(segment.estimatedDeparture)} ({segment.origin.code})
        </p>
      )}
      <p className="mt-3 text-sm text-slate-700">{segment.message.message}</p>
    </li>
  );
}

export function Itinerary({ events }: { events: Segment[] }) {
  return (
    <Card aria-labelledby="itinerary-title">
      <CardTitle id="itinerary-title">Tu itinerario</CardTitle>
      <ol className="mt-4 grid gap-4">
        {events.map((segment) => (
          <SegmentItem key={segment.segmentId} segment={segment} />
        ))}
      </ol>
    </Card>
  );
}
