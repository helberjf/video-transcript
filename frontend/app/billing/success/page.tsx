"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { useWorkspace } from "@/hooks/use-workspace";
import { appendWorkspaceActivity, type WorkspacePlan } from "@/lib/workspace-store";

export default function BillingSuccessPage() {
  const { workspace, loaded, saveWorkspace } = useWorkspace();
  const [plan, setPlan] = useState<WorkspacePlan | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    if (!loaded || processedRef.current) {
      return;
    }
    processedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const selectedPlan = params.get("plan") === "business" ? "business" : "pro";
    setPlan(selectedPlan);

    const saved = saveWorkspace({
      ...workspace,
      plan: selectedPlan,
      createdAt: workspace.createdAt || new Date().toISOString(),
    });

    appendWorkspaceActivity({
      type: "workspace",
      title: "Assinatura Stripe confirmada",
      description: `${saved.clientName} foi atualizado para o plano ${selectedPlan}.`,
      href: "/billing",
    });
  }, [loaded, saveWorkspace, workspace]);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Pagamento confirmado"
        title="Plano atualizado"
        description="A assinatura foi criada no Stripe. O workspace local foi marcado com o novo plano para continuar a experiencia."
      />

      <div className="panel p-6">
        <p className="text-sm leading-6 text-slate">
          Plano ativo: <span className="font-semibold text-ink">{plan === "business" ? "Business" : "Pro"}</span>.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="button-primary" href="/">
            Ir para dashboard
          </Link>
          <Link className="button-secondary" href="/billing">
            Ver assinatura
          </Link>
        </div>
      </div>
    </div>
  );
}
