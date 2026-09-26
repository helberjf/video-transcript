/** Alturas das barras da logo: ondas de áudio que desenham um "M". */
const BARS = [0.42, 0.88, 0.58, 0.88, 0.42];

/** Logo do ModeloIA animada: as ondas pulsam e um anel gira em volta. */
export function BrandLoader({ size = 88 }: { size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label="Carregando">
      <svg className="absolute inset-0 h-full w-full animate-[spin_1.6s_linear_infinite]" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" className="text-white/10" />
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="72 217"
          className="text-sand"
        />
      </svg>
      <div className="absolute inset-[16%] flex items-center justify-center gap-[7%] rounded-[28%] border border-sand/30 bg-sand/10 shadow-[0_0_32px_rgba(245,197,66,0.18)]">
        {BARS.map((height, index) => (
          <span
            key={index}
            className="w-[9%] origin-center animate-brand-wave rounded-full bg-sand"
            style={{ height: `${height * 62}%`, animationDelay: `${index * 0.12}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Pontinhos que "digitam" depois de um texto de carregamento. */
export function LoadingDots() {
  return (
    <span className="inline-flex" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span key={index} className="animate-brand-dot" style={{ animationDelay: `${index * 0.2}s` }}>
          .
        </span>
      ))}
    </span>
  );
}
