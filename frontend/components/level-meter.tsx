/** Barra de volume ao vivo. `value` e o RMS do audio (0 a 1); a raiz deixa a fala normal visivel. */
export function LevelMeter({ label, value, warn }: { label: string; value: number; warn?: string | null }) {
  const percent = Math.min(100, Math.round(Math.sqrt(value) * 220));
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate">
        <span>{label}</span>
        {warn ? <span className="text-amber-200">{warn}</span> : null}
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-sand transition-[width] duration-150" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
