import { useId, useState, type FormEvent } from "react";
import { AssessmentRequestSchema } from "@flynext/contracts";
import { Search } from "lucide-react";
import { normalizeBookingId } from "../../../lib/format";
import { DEMO_SCENARIOS } from "../scenarios";

type Props = { busy: boolean; focusOnMount?: boolean; onSubmit: (bookingId: string) => void };

const invalidMessage =
  "Ingresa un código de reserva de hasta 32 letras o números, sin espacios ni símbolos.";

export function BookingForm({ busy, focusOnMount = false, onSubmit }: Props) {
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(raw: string) {
    const parsed = AssessmentRequestSchema.safeParse({ bookingId: normalizeBookingId(raw) });
    if (!parsed.success) {
      setError(invalidMessage);
      return;
    }
    setError(null);
    setValue(parsed.data.bookingId);
    onSubmit(parsed.data.bookingId);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit(value);
  }

  return (
    <div className="rounded-card bg-white p-5 text-midnight shadow-card sm:p-6">
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor={inputId} className="block text-sm font-bold">
          Código de reserva
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id={inputId}
            name="bookingId"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus={focusOnMount}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Ej.: ABC123"
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
            className="min-h-12 w-full rounded-input border border-slate-300 bg-white px-4 text-base font-semibold uppercase tracking-wide placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 aria-invalid:border-red-600"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-input bg-indigo px-6 text-base font-bold text-white hover:bg-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Search aria-hidden className="size-5" />
            Consultar viaje
          </button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="mt-2 text-sm font-semibold text-red-800">
            {error}
          </p>
        )}
      </form>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <p className="text-sm font-bold">Escenarios de demostración</p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {DEMO_SCENARIOS.map((scenario) => (
            <li key={scenario.bookingId}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setValue(scenario.bookingId);
                  submit(scenario.bookingId);
                }}
                className="h-full min-h-12 w-full rounded-input border border-slate-300 px-3 py-2 text-left hover:border-indigo hover:bg-indigo/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="block text-sm font-extrabold">{scenario.bookingId}</span>
                <span className="block text-sm text-slate-700">{scenario.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
