import { PlaneTakeoff } from "lucide-react";

export function Header() {
  return (
    <header className="mx-auto flex max-w-page items-center gap-2.5 px-5 py-5 text-white sm:px-8">
      <span className="grid size-9 place-items-center rounded-xl bg-indigo">
        <PlaneTakeoff aria-hidden className="size-5" />
      </span>
      <span className="text-xl font-extrabold tracking-tight">FlyNext</span>
    </header>
  );
}
