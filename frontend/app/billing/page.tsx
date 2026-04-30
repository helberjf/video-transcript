"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { useWorkspace } from "@/hooks/use-workspace";
import type { BillingPlan } from "@/lib/stripe";

const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";

const paidPlans: Array<{
  id: BillingPlan;
  name: string;
  price: string;
  description: string;
  features: string[];
}> = [
  {
    id: "pro",
    name: "Pro",
    price: "Mensal",
    description: "Para equipes que geram documentos e relatorios toda semana.",
    features: ["Historico por cliente", "Modelos reutilizaveis", "Exportacao Word/PDF", "Revisao humana antes de gerar"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Volume",
    description: "Para operacoes com mais clientes, auditoria e regras internas.",
    features: ["Workspaces ilimitados", "Fluxos por area", "Suporte a implantacao", "Governanca de dados"],
  },
];

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
            <li>Workspace local de demonstracao</li>
            <li>Fluxo completo de revisao</li>
          </ul>
          <Link className="button-secondary mt-6 w-full" href="/templates">
            Comecar criando modelo
          </Link>
        </div>

        {paidPlans.map((plan) => (
          <div key={plan.id} className="panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">{plan.price}</p>
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
              disabled={busyPlan !== null || isDesktopMode}
              onClick={() => void startCheckout(plan.id)}
            >
              {busyPlan === plan.id ? "Abrindo checkout..." : `Assinar ${plan.name}`}
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
              Plano local atual: {workspace.plan === "enterprise" ? "Enterprise" : workspace.plan === "pro" ? "Pro" : "Teste"}.
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
