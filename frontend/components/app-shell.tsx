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
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-ink">Media Transcript Studio</h1>
            <p className="text-xs text-slate">Transcrição e relatórios locais com IA</p>
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
        </aside>
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
