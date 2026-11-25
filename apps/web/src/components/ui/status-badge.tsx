import { AlertTriangle, CheckCircle2, CircleHelp, Info, OctagonAlert } from "lucide-react";

export type Tone = "ok" | "info" | "warn" | "critical" | "unknown";

const styles: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  info: "bg-indigo-50 text-indigo-900 ring-indigo-200",
  warn: "bg-amber-50 text-amber-900 ring-amber-300",
  critical: "bg-red-50 text-red-900 ring-red-300",
  unknown: "bg-slate-100 text-slate-800 ring-slate-300",
};

const icons = {
  ok: CheckCircle2,
  info: Info,
  warn: AlertTriangle,
  critical: OctagonAlert,
  unknown: CircleHelp,
} as const;

export function StatusBadge({ tone, children }: { tone: Tone; children: string }) {
  const Icon = icons[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${styles[tone]}`}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {children}
    </span>
  );
}
