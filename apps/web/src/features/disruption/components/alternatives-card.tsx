import type { AssessmentResponse } from "@flynext/contracts";
import { Card, CardTitle } from "../../../components/ui/card";
import { StatusBadge } from "../../../components/ui/status-badge";
import { eligibilityLabel } from "../labels";

export function AlternativesCard({
  alternatives,
}: {
  alternatives: AssessmentResponse["alternatives"];
}) {
  return (
    <Card aria-labelledby="alternatives-title">
      <CardTitle id="alternatives-title">Alternativas</CardTitle>
      {alternatives.status === "NOT_REQUIRED" && (
        <p className="mt-2 text-slate-700">No hacen falta alternativas para este viaje.</p>
      )}
      {alternatives.status === "UNAVAILABLE" && (
        <p className="mt-2 text-slate-700">
          No pudimos consultar alternativas en este momento, por lo que no hay opciones que mostrar.
        </p>
      )}
      {alternatives.status === "EVALUATED" && (
        <>
          <p className="mt-1 text-sm text-slate-600">Ninguna opción está reservada.</p>
          <ul className="mt-4 grid gap-3">
            {alternatives.options.map((option) => {
              const label = eligibilityLabel[option.eligibility];
              return (
                <li key={option.optionId} className="rounded-input border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">{option.message.title}</p>
                    <StatusBadge tone={label.tone}>{label.text}</StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{option.message.message}</p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
