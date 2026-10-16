"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface HowToStep {
  title: string;
  description: ReactNode;
  link?: { href: string; label: string };
}

/** Botão "Como usar?" que abre uma janela com o passo a passo da tela. */
export function HowToButton({
  title,
  intro,
  steps,
  tips,
  label = "Como usar?",
}: {
  title: string;
  intro?: ReactNode;
  steps: HowToStep[];
  tips?: ReactNode[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} className="button-secondary inline-flex items-center gap-2 whitespace-nowrap px-4 py-2" type="button" onClick={() => setOpen(true)}>
        <span className="grid h-5 w-5 place-items-center rounded-full border border-sand/50 text-xs font-bold text-sand">?</span>
        {label}
      </button>

      {/* Portal no body: o cabeçalho usa backdrop-blur, que prende elementos "fixed" dentro dele. */}
      {open && typeof document !== "undefined"
        ? createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" type="button" aria-label="Fechar" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-midnight p-6 shadow-panel sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sand">Como usar</p>
                <h2 id={titleId} className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink">
                  {title}
                </h2>
              </div>
              <button
                ref={closeRef}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate hover:border-sand/40 hover:text-ink"
                type="button"
                onClick={() => setOpen(false)}
              >
                Fechar
              </button>
            </div>

            {intro ? <p className="mt-3 text-sm leading-6 text-slate">{intro}</p> : null}

            <ol className="mt-6 space-y-4">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sand text-sm font-bold text-midnight">{index + 1}</span>
                  <div className="pt-1">
                    <p className="font-semibold text-ink">{step.title}</p>
                    <div className="mt-1 text-sm leading-6 text-slate">{step.description}</div>
                    {step.link ? (
                      <Link className="mt-2 inline-block text-sm font-medium text-sand hover:underline" href={step.link.href} onClick={() => setOpen(false)}>
                        {step.link.label} →
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>

            {tips && tips.length > 0 ? (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Dicas</p>
                <ul className="mt-2 space-y-1.5 text-sm leading-6 text-slate">
                  {tips.map((tip, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="text-sand">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button className="button-primary mt-6 w-full" type="button" onClick={() => setOpen(false)}>
              Entendi
            </button>
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
