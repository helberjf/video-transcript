import type { ReactNode } from "react";

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.055] p-6 shadow-panel backdrop-blur-xl sm:flex sm:items-end sm:justify-between sm:gap-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-sand/45" />
      <div className="relative min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sand">{eyebrow}</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate">{description}</p>
      </div>
      {action ? <div className="relative mt-4 sm:mt-0">{action}</div> : null}
    </div>
  );
}
