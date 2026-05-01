"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { useWorkspace } from "@/hooks/use-workspace";
import { PLAN_DEFINITIONS, isPaidCheckoutPlan } from "@/lib/billing-plans";
import type { BillingPlan } from "@/lib/stripe";

const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";

export default function BillingPage() {
  const { data: session, status } = useSession();
  const { workspace } = useWorkspace();
  const [message, setMessage] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<BillingPlan | "portal" | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("canceled")) {
      setMessage("Checkout cancelado. Nenhuma alteracao foi feita no plano.");
    }
  }, []);

  if (isDesktopMode) {
    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="Modo local"
          title="Desktop local sem login e sem cobranca"
          description="Esta versao foi pensada para uso em um computador. Os dados ficam no workspace local e voce pode criar modelos, preencher formularios e exportar documentos sem Stripe."
        />

        <section className="grid gap-4 md:grid-cols-3">
          <Link className="panel p-5 transition hover:border-sand/40 hover:bg-white/[0.06]" href="/uploads">
            <p className="text-lg font-semibold text-ink">Subir arquivo</p>
            <p className="mt-2 text-sm leading-6 text-slate">Transforme audio, video, imagem ou documento em relatorio.</p>
          </Link>
          <Link className="panel p-5 transition hover:border-sand/40 hover:bg-white/[0.06]" href="/templates">
            <p className="text-lg font-semibold text-ink">Criar modelo</p>
            <p className="mt-2 text-sm leading-6 text-slate">Detecte campos ou marque palavras alteraveis manualmente.</p>
          </Link>
          <Link className="panel p-5 transition hover:border-sand/40 hover:bg-white/[0.06]" href="/settings">
            <p className="text-lg font-semibold text-ink">Ajustes locais</p>
            <p className="mt-2 text-sm leading-6 text-slate">Configure IA, exportacao e preferencias deste computador.</p>
          </Link>
        </section>
      </div>
    );
  }

  const startCheckout = async (plan: BillingPlan) => {
    if (isDesktopMode) {
      setMessage("O desktop funciona sem login e sem cobranca. Assinaturas ficam no webapp.");
      return;
    }

    if (status !== "authenticated") {
      await signIn("google", { callbackUrl: "/billing" });
      return;
    }

    setBusyPlan(plan);
    setMessage(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, workspaceId: workspace.id }),
      });
      const payload = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Nao foi possivel iniciar o checkout.");
      }

      window.location.href = payload.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel iniciar o checkout.");
      setBusyPlan(null);
    }
  };

  const openPortal = async () => {
    if (status !== "authenticated") {
      await signIn("google", { callbackUrl: "/billing" });
      return;
    }

    setBusyPlan("portal");
    setMessage(null);

    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const payload = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Nao foi possivel abrir o portal.");
      }

      window.location.href = payload.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel abrir o portal.");
      setBusyPlan(null);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Assinatura"
        title="Planos para vender o FormReport"
        description="Use Auth.js com Google para entrada gratuita por cliente e Stripe Checkout para cobrar assinatura no webapp."
      />

      {isDesktopMode ? (
        <div className="panel p-6 text-sm leading-6 text-slate">
          O aplicativo desktop permanece local e sem login. Ele usa o workspace local para operar offline ou dentro da rede do cliente.
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">Teste</p>
          <h3 className="mt-3 text-2xl font-semibold">Gratuito para validar</h3>
          <p className="mt-2 text-sm leading-6 text-slate">
            Ideal para testar uploads, modelos e formularios antes de assinar.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-slate">
            <li>Login Google sem custo por usuario</li>
            <li>20 creditos por mes</li>
            <li>Fluxo completo de revisao</li>
          </ul>
          <Link className="button-secondary mt-6 w-full" href="/templates">
            Comecar criando modelo
          </Link>
        </div>

        {PLAN_DEFINITIONS.filter((plan) => plan.id !== "trial").map((plan) => (
          <div key={plan.id} className="panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">{plan.priceLabel}</p>
            <h3 className="mt-3 text-2xl font-semibold">{plan.name}</h3>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate">{plan.description}</p>
            <ul className="mt-5 space-y-2 text-sm text-slate">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button
              className="button-primary mt-6 w-full"
              type="button"
              disabled={busyPlan !== null || isDesktopMode || !isPaidCheckoutPlan(plan.id)}
              onClick={() => {
                if (isPaidCheckoutPlan(plan.id)) {
                  void startCheckout(plan.id);
                }
              }}
            >
              {busyPlan === plan.id ? "Abrindo checkout..." : plan.cta}
            </button>
          </div>
        ))}
      </section>

      <section className="panel p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">Conta conectada</p>
            <h3 className="mt-2 text-xl font-semibold">{session?.user?.email ?? "Entre com Google para assinar"}</h3>
            <p className="mt-2 text-sm leading-6 text-slate">
              Plano atual: {workspace.plan === "enterprise" ? "Enterprise" : workspace.plan === "business" ? "Business" : workspace.plan === "pro" ? "Pro" : "Trial"}.
              {" "}Uso: {workspace.creditsUsed ?? 0}/{workspace.creditsLimit ?? "custom"} creditos neste mes.
            </p>
          </div>
          <button className="button-secondary" type="button" disabled={busyPlan !== null || isDesktopMode} onClick={() => void openPortal()}>
            {busyPlan === "portal" ? "Abrindo portal..." : "Gerenciar cobranca"}
          </button>
        </div>
        {message ? <p className="mt-4 rounded-lg border border-sand/20 bg-sand/10 px-4 py-3 text-sm text-sand">{message}</p> : null}
      </section>
    </div>
  );
}
