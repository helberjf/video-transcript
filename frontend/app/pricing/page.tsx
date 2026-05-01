import Link from "next/link";

import { PLAN_DEFINITIONS } from "@/lib/billing-plans";

export default function PricingPage() {
  return (
    <div className="mx-auto min-h-[calc(100vh-40px)] max-w-7xl py-4">
      <header className="flex items-center justify-between gap-4 py-3">
        <Link href="/" className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
          FormReport AI
        </Link>
        <Link className="button-primary px-4 py-2" href="/login">
          Entrar com Google
        </Link>
      </header>

      <section className="py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sand">Precos</p>
        <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
          IA inclusa por creditos, sem o cliente configurar API.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-slate">
          1 minuto de audio/video consome 1 credito. 1 imagem ou pagina de documento consome 1 credito. Gerar o documento final consome 1 credito.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {PLAN_DEFINITIONS.map((plan) => (
          <article key={plan.id} className="panel flex flex-col p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">{plan.name}</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink">{plan.priceLabel}</h2>
            <p className="mt-3 min-h-20 text-sm leading-6 text-slate">{plan.description}</p>
            <div className="mt-4 rounded-lg border border-sand/20 bg-sand/10 px-4 py-3 text-sm text-sand">
              {plan.creditsPerMonth === null ? "Creditos customizados" : `${plan.creditsPerMonth} creditos/mes`}
            </div>
            <ul className="mt-5 flex-1 space-y-2 text-sm leading-6 text-slate">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link className={plan.id === "trial" ? "button-secondary mt-6 w-full" : "button-primary mt-6 w-full"} href={plan.id === "enterprise" ? "/login" : "/billing"}>
              {plan.cta}
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}
