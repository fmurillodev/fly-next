import type { AssessmentResponse } from "@flynext/contracts";
import { Card, CardTitle } from "../../../components/ui/card";
import { StatusBadge } from "../../../components/ui/status-badge";
import { formatClock } from "../../../lib/format";
import { connectionLabel } from "../labels";

type Connection = NonNullable<AssessmentResponse["connection"]>;

export function ConnectionCard({ connection }: { connection: Connection }) {
  const label = connectionLabel[connection.status];
  const { inboundArrival } = connection;
  return (
    <Card aria-labelledby="connection-title">
      <CardTitle id="connection-title">Tu conexión</CardTitle>
      <div className="mt-3">
        <StatusBadge tone={label.tone}>{label.text}</StatusBadge>
      </div>
      <p className="mt-3 font-semibold">{connection.message.title}</p>
      <p className="mt-1 text-slate-700">{connection.message.message}</p>
      <dl className="mt-3 grid gap-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">Tiempo de conexión planificado</dt>
          <dd className="font-semibold">{connection.originalConnectionMinutes} min</dd>
        </div>
        {inboundArrival && (
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">
              {inboundArrival.confirmed ? "Llegada confirmada" : "Llegada proyectada"}
            </dt>
            <dd className="font-semibold">{formatClock(inboundArrival.time)}</dd>
          </div>
        )}
      </dl>
      {connection.message.nextSteps && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {connection.message.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
