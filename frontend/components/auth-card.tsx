import Link from "next/link";
import type { ReactNode } from "react";

/** Moldura comum das telas de entrar, cadastrar e configurar a chave de IA. */
export function AuthCard({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-md flex-col justify-center py-10">
      <Link href="/" className="mb-8 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
        ModeloIA
      </Link>
      <div className="panel p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">{eyebrow}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <div className="mt-2 text-sm leading-6 text-slate">{description}</div> : null}
        <div className="mt-6">{children}</div>
        {footer ? <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">{footer}</div> : null}
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
      {message}
    </p>
  );
}
