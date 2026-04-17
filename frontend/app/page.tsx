"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { getDashboardStats } from "@/services/api";
import type { DashboardStats } from "@/types/api";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getDashboardStats().then(setStats).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Visão geral"
        title="Pipeline local para mídia, transcrição e relatórios"
        description="Suba um áudio ou vídeo, acompanhe o processamento por etapas e gere relatórios com modelos reutilizáveis. Tudo em uma interface simples para um usuário comum operar localmente."
        action={<Link className="button-primary" href="/uploads">Novo processamento</Link>}
      />

      {error ? <div className="panel p-6 text-sm text-ember">{error}</div> : null}

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard label="Arquivos processados" value={String(stats?.total_uploads ?? 0)} detail="Volume acumulado no histórico local" accent="Uploads" />
        <StatCard label="Relatórios gerados" value={String(stats?.total_reports ?? 0)} detail="Saídas exportadas em markdown ou texto" accent="Reports" />
        <StatCard label="Engine mais usada" value={stats?.most_used_engine ?? "-"} detail="Motor predominante na transcrição" accent="AI" />
      </div>

      <section className="panel p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Últimos processamentos</h3>
            <p className="mt-1 text-sm text-slate">Acompanhe os itens mais recentes e entre nos detalhes quando a transcrição terminar.</p>
          </div>
          <Link href="/history" className="button-secondary">Abrir histórico</Link>
        </div>
        <div className="mt-6 space-y-4">
          {stats?.recent_uploads.length ? (
            stats.recent_uploads.map((item) => (
              <Link key={item.id} href={`/uploads/${item.id}`} className="block rounded-3xl border border-black/5 bg-canvas/70 p-4 transition hover:border-tide/40 hover:bg-white">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{item.original_filename}</p>
                    <p className="mt-1 text-sm text-slate">{formatDate(item.created_at)} • engine {item.transcription_engine}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-black/10 p-6 text-sm text-slate">Nenhum processamento ainda. Use a área de upload para iniciar.</div>
          )}
        </div>
      </section>
    </div>
  );
}
