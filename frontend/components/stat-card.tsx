import type { ReactNode } from "react";

export function StatCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: ReactNode }) {
  return (
    <div className="panel p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate">{label}</p>
          <p className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-ink">{value}</p>
          <p className="mt-2 text-sm text-slate">{detail}</p>
        </div>
        <div className="rounded-2xl border border-sand/20 bg-sand/10 p-3 text-sm text-sand">{accent}</div>
      </div>
    </div>
  );
}
