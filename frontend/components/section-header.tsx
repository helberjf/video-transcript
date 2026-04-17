import type { ReactNode } from "react";

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-[2rem] bg-white/70 p-6 shadow-panel sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate">{description}</p>
      </div>
      {action}
    </div>
  );
}
