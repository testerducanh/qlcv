import type { ReactNode } from "react";

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-12 border-b border-border-default pb-24">
      <h2 className="text-xl font-bold">{title}</h2>
      {note ? <p className="text-sm text-text-secondary">{note}</p> : null}
      {children}
    </section>
  );
}

export function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex flex-wrap items-center gap-12">{children}</div>
    </div>
  );
}
