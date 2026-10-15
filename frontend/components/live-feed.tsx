"use client";

import { useEffect, useRef, useState } from "react";

import type { LiveState } from "@/lib/recording/live-assistant";

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Sugestões da IA (mais recente em cima) e a transcrição ao vivo. Usado na página e na janela flutuante. */
export function LiveFeed({
  state,
  onSuggest,
  compact = false,
}: {
  state: LiveState;
  onSuggest: (focus?: string) => void;
  compact?: boolean;
}) {
  const [focus, setFocus] = useState("");
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const latest = state.suggestions[0];
  const older = state.suggestions.slice(1, compact ? 3 : 6);

  useEffect(() => {
    const element = transcriptRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [state.lines.length]);

  const ask = () => {
    onSuggest(focus.trim() || undefined);
    setFocus("");
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-xl border border-sand/30 bg-sand/[0.06] p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">Sugestão da IA</p>
          {latest ? <span className="text-[11px] text-slate">{latest.trigger} · {formatClock(latest.at)}</span> : null}
        </div>
        {!latest ? (
          <p className="mt-2 text-sm text-slate">
            Quando alguém fizer uma pergunta, a sugestão aparece aqui. Você também pode pedir a qualquer momento.
          </p>
        ) : latest.status === "loading" ? (
          <p className="mt-2 animate-pulse text-sm text-slate">Pensando na resposta...</p>
        ) : (
          <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${latest.status === "error" ? "text-rose-200" : "text-ink"}`}>
            {latest.text}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <input
            className="field py-1.5 text-sm"
            value={focus}
            placeholder="Foco opcional (ex.: responder sobre prazo)"
            onChange={(event) => setFocus(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                ask();
              }
            }}
          />
          <button className="button-primary shrink-0 px-3 py-1.5 text-sm" type="button" onClick={ask}>
            Sugerir
          </button>
        </div>
      </div>

      {older.length > 0 ? (
        <details className="rounded-xl border border-white/10 p-3 text-sm">
          <summary className="cursor-pointer text-slate">Sugestões anteriores ({older.length})</summary>
          <div className="mt-2 space-y-3">
            {older.map((item) => (
              <p key={item.id} className="whitespace-pre-wrap border-t border-white/10 pt-2 text-slate">
                <span className="mr-2 font-mono text-[11px]">{formatClock(item.at)}</span>
                {item.text}
              </p>
            ))}
          </div>
        </details>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Transcrição ao vivo</p>
        {state.error ? <p className="mt-2 text-xs text-rose-200">{state.error}</p> : null}
        <div ref={transcriptRef} className={`mt-2 space-y-2 overflow-y-auto text-sm leading-6 ${compact ? "max-h-[50vh]" : "max-h-80"}`}>
          {state.lines.length === 0 ? (
            <p className="text-slate">{state.active ? "Ouvindo... as falas aparecem a cada poucos segundos." : "Modo ao vivo desligado."}</p>
          ) : (
            state.lines.map((line) => (
              <p key={line.id}>
                <span className="mr-2 font-mono text-[11px] text-slate">{formatClock(line.at)}</span>
                <strong className={line.source === "mic" ? "text-sky-300" : "text-emerald-300"}>{line.speaker}:</strong>{" "}
                <span className="text-ink">{line.text}</span>
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
