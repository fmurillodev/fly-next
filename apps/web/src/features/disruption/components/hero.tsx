import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";

export function Hero({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="hero-title" className="mx-auto max-w-page px-5 pb-12 pt-4 sm:px-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-14">
        <div className="text-white">
          <p className="text-sm font-bold text-soft">Your journey. Your next step.</p>
          <h1
            id="hero-title"
            className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl"
          >
            <span className="lg:block">Tu viaje cambia.</span>{" "}
            <span className="text-soft lg:block">Tu tranquilidad no.</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-200">
            Consulta tu reserva y entiende en segundos qué pasó con tus vuelos, cómo afecta tu
            conexión y cuáles son tus próximos pasos.
          </p>
          <p className="mt-6 flex max-w-xl items-start gap-2 rounded-input bg-white/10 p-3 text-sm text-slate-100">
            <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0 text-soft" />
            Demostración con datos sintéticos. Las recomendaciones son orientativas y no modifican
            ninguna reserva.
          </p>
        </div>
        {children}
      </div>
    </section>
  );
}
