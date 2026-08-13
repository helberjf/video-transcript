"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { formatDate, formatDuration } from "@/lib/utils";
import { getWorkspaceActivity, type WorkspaceActivity } from "@/lib/workspace-store";
import { deleteUpload, getHistory } from "@/services/api";
import type { UploadItem } from "@/types/api";

export default function HistoryPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [activity, setActivity] = useState<WorkspaceActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { workspace } = useWorkspace();

  const load = async () => {
    try {
      setItems(await getHistory());
      setActivity(getWorkspaceActivity());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar histórico");
    }
  };

  useEffect(() => {
    void load();
  }, [workspace.id]);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Histórico"
        title={`Historico de ${workspace.clientName}`}
        description="Visualize processamentos, atividades locais, relatorios gerados e remova registros que nao precisam continuar no workspace."
      />

      {error ? <div className="panel p-6 text-sm text-ember">{error}</div> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Workspace</p>
          <p className="mt-2 text-lg font-semibold">{workspace.id}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Processamentos</p>
          <p className="mt-2 text-lg font-semibold">{items.length}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Eventos locais</p>
          <p className="mt-2 text-lg font-semibold">{activity.length}</p>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-slate">
              <tr>
                <th className="px-5 py-4 font-medium">Arquivo</th>
                <th className="px-5 py-4 font-medium">Data</th>
                <th className="px-5 py-4 font-medium">Duração</th>
                <th className="px-5 py-4 font-medium">Engine</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Relatórios</th>
                <th className="px-5 py-4 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const reports = item.reports ?? [];

                return (
                  <tr key={item.id} className="border-t border-white/10 align-top transition hover:bg-white/[0.03]">
                    <td className="px-5 py-4 font-medium">
                      <span className="block">{item.original_filename}</span>
                      {item.source_url && !reports.length ? (
                        <a
                          className="mt-2 block max-w-xs break-all text-xs text-sand hover:underline"
                          href={item.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.source_url}
                        </a>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-slate">{formatDate(item.created_at)}</td>
                    <td className="px-5 py-4 text-slate">{formatDuration(item.duration_seconds)}</td>
                    <td className="px-5 py-4 uppercase text-slate">{item.transcription_engine}</td>
                    <td className="px-5 py-4"><StatusBadge status={item.status} /></td>
                    <td className="min-w-[320px] px-5 py-4">
                      {reports.length ? (
                        <div className="space-y-2">
                          {reports.map((report) => (
                            <details key={report.id} className="group rounded-lg border border-white/10 bg-white/[0.04] p-3">
                              <summary role="button" className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-md outline-none transition hover:text-sand focus-visible:ring-2 focus-visible:ring-sand/35">
                                <span>
                                  <span className="block font-medium text-ink">{report.title}</span>
                                  <span className="mt-1 block text-xs text-slate">{formatDate(report.created_at)} • {report.generator_engine}</span>
                                </span>
                                <span className="text-xs font-semibold text-sand group-open:hidden">Abrir</span>
                                <span className="hidden text-xs font-semibold text-sand group-open:inline">Fechar</span>
                              </summary>
                              <div className="mt-3 space-y-3 border-t border-white/10 pt-3 text-xs leading-5 text-slate">
                                {item.source_url ? (
                                  <div>
                                    <p className="font-semibold uppercase tracking-[0.14em] text-slate">YouTube</p>
                                    <a className="mt-1 block break-all text-sand hover:underline" href={item.source_url} target="_blank" rel="noreferrer">
                                      {item.source_url}
                                    </a>
                                  </div>
                                ) : null}
                                {report.custom_request ? (
                                  <div>
                                    <p className="font-semibold uppercase tracking-[0.14em] text-slate">Pedido</p>
                                    <p className="mt-1 text-ink/90">{report.custom_request}</p>
                                  </div>
                                ) : null}
                                {report.report_context ? (
                                  <div>
                                    <p className="font-semibold uppercase tracking-[0.14em] text-slate">Contexto</p>
                                    <p className="mt-1 text-ink/90">{report.report_context}</p>
                                  </div>
                                ) : null}
                                {report.additional_instructions ? (
                                  <div>
                                    <p className="font-semibold uppercase tracking-[0.14em] text-slate">Instruções</p>
                                    <p className="mt-1 text-ink/90">{report.additional_instructions}</p>
                                  </div>
                                ) : null}
                              </div>
                            </details>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-slate">Nenhum relatório</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/uploads/${item.id}`} className="button-secondary">Abrir</Link>
                        <button
                          type="button"
                          className="button-danger"
                          onClick={() => {
                            void deleteUpload(item.id).then(load).catch((err: Error) => setError(err.message));
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!items.length ? <div className="p-6 text-sm text-slate">Nenhum item salvo no histórico.</div> : null}
      </section>

      <section className="panel p-6">
        <h3 className="text-xl font-semibold">Atividades do cliente</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {activity.slice(0, 8).map((item) => (
            <Link key={item.id} href={item.href ?? "/"} className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm transition hover:border-sand/35">
              <span className="font-semibold text-ink">{item.title}</span>
              <span className="mt-1 block text-slate">{item.description}</span>
              <span className="mt-2 block text-xs text-slate">{formatDate(item.createdAt)}</span>
            </Link>
          ))}
          {!activity.length ? <p className="text-sm text-slate">Nenhuma atividade local registrada neste workspace.</p> : null}
        </div>
      </section>
    </div>
  );
}
