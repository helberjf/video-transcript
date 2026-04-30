"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  appendWorkspaceActivity,
  getWorkspaceActivity,
  normalizeWorkspaceId,
  type WorkspaceActivity,
  type WorkspacePlan,
  type WorkspaceProfile,
} from "@/lib/workspace-store";
import { formatDate } from "@/lib/utils";

const PLAN_OPTIONS: { value: WorkspacePlan; label: string; description: string }[] = [
  { value: "trial", label: "Teste comercial", description: "Validar o fluxo com poucos documentos." },
  { value: "pro", label: "Profissional", description: "Uso recorrente por cliente ou equipe." },
  { value: "enterprise", label: "Enterprise", description: "Operacao com volume, auditoria e SSO futuro." },
];

const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";

export default function LoginPage() {
  const { workspace, loaded, saveWorkspace, resetWorkspace } = useWorkspace();
  const { data: session, status } = useSession();
  const [form, setForm] = useState<WorkspaceProfile>(workspace);
  const [message, setMessage] = useState<string | null>(null);
  const [activity, setActivity] = useState<WorkspaceActivity[]>([]);
  const [callbackUrl, setCallbackUrl] = useState("/");

  useEffect(() => {
    setForm(workspace);
    setActivity(getWorkspaceActivity(workspace.id));
  }, [workspace]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallbackUrl(params.get("callbackUrl") || "/");
  }, []);

  const previewId = useMemo(() => normalizeWorkspaceId(form.id || form.clientName), [form.clientName, form.id]);

  const submit = () => {
    const saved = saveWorkspace({
      ...form,
      id: previewId,
      createdAt: form.createdAt || new Date().toISOString(),
    });
    appendWorkspaceActivity({
      type: "workspace",
      title: "Workspace atualizado",
      description: `${saved.clientName} foi definido como cliente ativo.`,
      href: "/",
    });
    setActivity(getWorkspaceActivity(saved.id));
    setMessage("Cliente ativo salvo. Os proximos uploads, modelos e relatorios ficam nesse workspace.");
  };

  const reset = () => {
    resetWorkspace();
    setMessage("Workspace voltou para o cliente demo local.");
  };

  if (!isDesktopMode && status !== "authenticated") {
    return (
      <div className="mx-auto grid min-h-[calc(100vh-40px)] max-w-6xl gap-6 py-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <section className="space-y-6">
          <Link href="/" className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
            FormReport AI
          </Link>
          <div className="space-y-4">
            <p className="inline-flex rounded-full border border-tide/25 bg-tide/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-aqua">
              Acesso web
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
              Entre com Google para criar seu workspace
            </h1>
            <p className="max-w-xl text-base leading-8 text-slate">
              Auth.js usa o OAuth do Google sem mensalidade por usuario. Depois do login, cada cliente fica com historico, modelos e documentos separados.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button className="button-primary" type="button" onClick={() => void signIn("google", { callbackUrl })}>
              Entrar com Google
            </button>
            <Link className="button-secondary" href="/billing">
              Ver planos
            </Link>
          </div>
        </section>

        <section className="panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Fluxo comercial</p>
          <div className="mt-5 grid gap-4">
            {[
              ["Login", "Google identifica o responsavel e cria o workspace do cliente."],
              ["Formulario", "A IA detecta campos alteraveis em imagens, PDFs e documentos."],
              ["Documento final", "O usuario revisa respostas e exporta Word/PDF."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="font-semibold text-ink">{title}</p>
                <p className="mt-1 text-sm leading-6 text-slate">{description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Cliente e workspace"
        title={isDesktopMode ? "Workspace local do desktop" : "Conta Google e workspace do cliente"}
        description={
          isDesktopMode
            ? "O desktop nao exige login. Defina o cliente ativo para separar historico, modelos e relatorios no ambiente local."
            : "O webapp usa Auth.js com Google para autenticar sem custo por usuario e manter cada cliente em seu workspace."
        }
      />

      <section className="panel p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">{isDesktopMode ? "Desktop" : "Sessao Google"}</p>
            <h3 className="mt-2 text-xl font-semibold">
              {isDesktopMode ? "Acesso local sem login" : session?.user?.email ?? "Conta conectada"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate">
              {isDesktopMode
                ? "Use este modo para clientes que querem operar o aplicativo instalado sem autenticar na nuvem."
                : "Esta conta controla o workspace web e pode abrir o checkout Stripe."}
            </p>
          </div>
          {!isDesktopMode ? (
            <button className="button-secondary" type="button" onClick={() => void signOut({ callbackUrl: "/" })}>
              Sair do Google
            </button>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="panel p-6">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Acesso do cliente</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">Entrar em um workspace</h3>
              <p className="mt-2 text-sm leading-6 text-slate">
                Defina os dados comerciais do cliente ativo para separar uploads, modelos, formularios e relatorios.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Cliente</label>
                <input
                  className="field"
                  value={form.clientName}
                  onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))}
                  placeholder="Ex.: Clinica Central"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Workspace ID</label>
                <input
                  className="field"
                  value={form.id}
                  onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))}
                  placeholder="clinica-central"
                />
                <p className="mt-2 text-xs text-slate">ID aplicado: {previewId}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Responsavel</label>
                <input
                  className="field"
                  value={form.ownerName}
                  onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))}
                  placeholder="Nome do usuario"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Email</label>
                <input
                  className="field"
                  type="email"
                  value={form.ownerEmail}
                  onChange={(event) => setForm((current) => ({ ...current, ownerEmail: event.target.value }))}
                  placeholder="cliente@empresa.com"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Segmento</label>
              <input
                className="field"
                value={form.segment}
                onChange={(event) => setForm((current) => ({ ...current, segment: event.target.value }))}
                placeholder="Juridico, saude, imobiliario, operacoes..."
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {PLAN_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-lg border p-4 text-left text-sm transition ${
                    form.plan === option.value
                      ? "border-sand/45 bg-sand/10 text-ink"
                      : "border-white/10 bg-white/[0.04] text-slate hover:border-sand/35 hover:text-ink"
                  }`}
                  onClick={() => setForm((current) => ({ ...current, plan: option.value }))}
                >
                  <span className="font-semibold">{option.label}</span>
                  <span className="mt-2 block text-xs leading-5 text-slate">{option.description}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="button-primary" type="button" onClick={submit} disabled={!loaded}>
                Salvar e entrar
              </button>
              <button className="button-secondary" type="button" onClick={reset}>
                Usar demo local
              </button>
              <Link className="button-secondary" href="/">
                Voltar ao dashboard
              </Link>
              {!isDesktopMode ? (
                <Link className="button-secondary" href="/billing">
                  Ver cobranca
                </Link>
              ) : null}
            </div>

            {message ? <p className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{message}</p> : null}
          </div>
        </section>

        <section className="space-y-4">
          <div className="panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Resumo comercial</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight">{workspace.clientName}</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate">Responsavel</p>
                <p className="mt-2 font-semibold text-ink">{workspace.ownerName}</p>
                <p className="mt-1 text-sm text-slate">{workspace.ownerEmail}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate">Plano</p>
                <p className="mt-2 font-semibold text-ink">{PLAN_OPTIONS.find((item) => item.value === workspace.plan)?.label}</p>
                <p className="mt-1 text-sm text-slate">{workspace.segment}</p>
              </div>
            </div>
          </div>

          <div className="panel p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">Historico do workspace</p>
                <h3 className="mt-2 text-xl font-semibold">Eventos recentes</h3>
              </div>
              <Link className="button-secondary px-4 py-2" href="/history">
                Ver historico
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {activity.length ? (
                activity.slice(0, 6).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href ?? "/"}
                    className="block rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm transition hover:border-sand/35"
                  >
                    <span className="font-semibold text-ink">{item.title}</span>
                    <span className="mt-1 block text-slate">{item.description}</span>
                    <span className="mt-2 block text-xs text-slate">{formatDate(item.createdAt)}</span>
                  </Link>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.04] p-5 text-sm text-slate">
                  Nenhuma atividade local registrada neste workspace ainda.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
