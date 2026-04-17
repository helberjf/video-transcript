"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { href: "/", label: "Dashboard" },
  { href: "/uploads", label: "Upload e processamento" },
  { href: "/history", label: "Histórico" },
  { href: "/templates", label: "Modelos" },
  { href: "/settings", label: "Configurações" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="panel flex flex-col gap-8 p-6 lg:min-h-[calc(100vh-3rem)] lg:sticky lg:top-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate">Local-first suite</p>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Media Transcript Studio</h1>
              <p className="mt-2 text-sm text-slate">Upload, transcreva, gere relatórios e mantenha seus modelos sem depender de uma infraestrutura complexa.</p>
            </div>
          </div>
          <nav className="space-y-2">
            {navigation.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-2xl px-4 py-3 text-sm transition ${
                    active ? "bg-ink text-white" : "text-slate hover:bg-sand/40 hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="rounded-3xl bg-tide px-5 py-6 text-white">
            <p className="text-xs uppercase tracking-[0.25em] text-white/70">Próximos passos</p>
            <p className="mt-3 text-sm leading-6 text-white/90">A base já foi preparada para fila de processamento, múltiplos usuários e exportação futura para DOCX/PDF.</p>
          </div>
        </aside>
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
