import type { AssessmentResponse } from "@flynext/contracts";
import { ArrowRight } from "lucide-react";
import { priorityLabel, recommendationLabel } from "../labels";

export function RecommendationCard({
  recommendation,
}: {
  recommendation: AssessmentResponse["recommendation"];
}) {
  return (
    <section
      aria-labelledby="recommendation-title"
      className="rounded-card bg-midnight p-5 text-white shadow-card sm:p-6"
    >
      <h2 id="recommendation-title" className="text-sm font-bold text-soft">
        Recomendación principal
      </h2>
      <p className="mt-2 text-xl font-extrabold tracking-tight">
        {recommendationLabel[recommendation.type]}
      </p>
      <p className="mt-1 text-sm font-semibold text-soft">
        {priorityLabel[recommendation.priority]} · Sugerencia, no una acción realizada
      </p>
      <p className="mt-4 font-semibold">{recommendation.message.title}</p>
      <p className="mt-1 text-slate-200">{recommendation.message.message}</p>
      {recommendation.message.nextSteps && (
        <>
          <h3 className="mt-4 text-sm font-bold">Próximos pasos</h3>
          <ul className="mt-2 space-y-2">
            {recommendation.message.nextSteps.map((step) => (
              <li key={step} className="flex gap-2 text-slate-100">
                <ArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-soft" />
                {step}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
