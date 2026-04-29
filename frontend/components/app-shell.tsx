"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useWorkspace } from "@/hooks/use-workspace";

const navigation = [
  { href: "/", label: "Inicio", description: "Acoes rapidas" },
  { href: "/uploads", label: "Relatorios", description: "Audio e video" },
  { href: "/history", label: "Historico", description: "Processamentos" },
  { href: "/templates", label: "Modelos", description: "Documentos base" },
  { href: "/forms", label: "Formularios", description: "Preenchimento" },
  { href: "/settings", label: "Ajustes", description: "IA e exportacao" },
  { href: "/login", label: "Cliente", description: "Workspace" },
];

function getPageLabel(pathname: string): string {
  const activeItem = navigation
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0];

  return activeItem?.label ?? "Inicio";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pageLabel = getPageLabel(pathname);
  const { workspace } = useWorkspace();
  const planLabel = workspace.plan === "enterprise" ? "Enterprise" : workspace.plan === "pro" ? "Pro" : "Teste";

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-[1500px] min-w-0 gap-0 lg:grid-cols-[264px_1fr]">
        <aside className="min-w-0 overflow-hidden border-b border-white/10 bg-midnight/95 px-4 py-4 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-4 lg:block">
            <Link href="/" className="block rounded-xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-sand/40">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sand">FormReport AI</p>
              <h1 className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
                FormReport Studio
              </h1>
              <p className="mt-1 text-xs text-slate">Imagem, documento e video para formulario ou relatorio</p>
            </Link>

            <div className="hidden rounded-lg border border-tide/25 bg-tide/10 px-3 py-2 text-xs font-medium text-aqua sm:block lg:mt-4">
              Backend local + IA
            </div>
          </div>

          <nav className="mt-4 flex w-full min-w-0 gap-2 overflow-x-auto pb-1 lg:mt-6 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {navigation.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex min-w-[154px] items-center justify-between rounded-lg border px-3 py-3 text-sm transition lg:min-w-0 ${
                    active
                      ? "border-sand/40 bg-sand/[0.12] text-ink"
                      : "border-transparent text-slate hover:border-white/10 hover:bg-white/[0.05] hover:text-ink"
                  }`}
                >
                  <span>
                    <span className="block font-semibold">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-slate">{item.description}</span>
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full transition ${
                      active ? "bg-sand" : "bg-white/15 group-hover:bg-sand/60"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 hidden rounded-xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-5 text-slate lg:block">
            <p className="font-semibold text-ink">Fluxo principal</p>
            <p className="mt-2">Envie imagem, documento ou video; gere formulario, relatorio e documento pronto para exportar.</p>
          </div>

          <Link
            href="/login"
            className="mt-4 hidden rounded-xl border border-tide/20 bg-tide/[0.08] p-4 text-xs leading-5 text-slate transition hover:border-sand/40 lg:block"
          >
            <p className="font-semibold text-ink">{workspace.clientName}</p>
            <p className="mt-1 truncate">{workspace.ownerEmail}</p>
            <p className="mt-3 inline-flex rounded-full border border-sand/25 bg-sand/10 px-3 py-1 font-semibold text-sand">
              Plano {planLabel}
            </p>
          </Link>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate">Workspace</p>
              <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink">
                {pageLabel}
              </h2>
              <p className="mt-1 text-xs text-slate">{workspace.clientName} - {workspace.segment}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="button-secondary px-4 py-2" href="/forms">
                Preencher documento
              </Link>
              <Link className="button-primary px-4 py-2" href="/uploads">
                Novo upload
              </Link>
            </div>
          </div>

          <div className="space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
