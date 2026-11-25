import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return (
    <section className={`rounded-card bg-white p-5 shadow-card sm:p-6 ${className}`} {...props} />
  );
}

export function CardTitle({ className = "", ...props }: ComponentProps<"h2">) {
  return <h2 className={`text-lg font-bold tracking-tight ${className}`} {...props} />;
}
