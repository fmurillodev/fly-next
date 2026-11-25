import { BellRing, ListChecks, Plane } from "lucide-react";
import type { ComponentType } from "react";

const cards: { title: string; text: string; icon: ComponentType<{ className?: string }> }[] = [
  {
    title: "Tu vuelo",
    text: "Mira el estado de cada vuelo y los cambios en tu itinerario, con horarios en la hora local de cada aeropuerto.",
    icon: Plane,
  },
  {
    title: "Tus alertas",
    text: "Entiende qué retrasos hay y si tu conexión está en riesgo, sin tecnicismos.",
    icon: BellRing,
  },
  {
    title: "Tus opciones",
    text: "Conoce las alternativas disponibles y los próximos pasos recomendados. Ninguna se reserva por ti.",
    icon: ListChecks,
  },
];

export function OverviewCards() {
  return (
    <section aria-labelledby="overview-title">
      <h2 id="overview-title" className="text-xl font-extrabold tracking-tight">
        Qué vas a encontrar
      </h2>
      <ul className="mt-4 grid gap-4 md:grid-cols-3">
        {cards.map(({ title, text, icon: Icon }) => (
          <li key={title} className="rounded-card bg-white p-5 shadow-card sm:p-6">
            <span className="grid size-11 place-items-center rounded-input bg-indigo/10 text-indigo">
              <Icon aria-hidden className="size-6" />
            </span>
            <h3 className="mt-4 text-lg font-bold">{title}</h3>
            <p className="mt-1 text-slate-700">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
