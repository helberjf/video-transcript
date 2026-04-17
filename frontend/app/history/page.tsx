"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatDuration } from "@/lib/utils";
import { deleteUpload, getHistory } from "@/services/api";
import type { UploadItem } from "@/types/api";

export default function HistoryPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setItems(await getHistory());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar histórico");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Histórico"
        title="Processamentos salvos localmente"
        description="Visualize arquivos processados, status, engine utilizada, relatórios gerados e remova registros quando não precisar mais deles."
      />

      {error ? <div className="panel p-6 text-sm text-ember">{error}</div> : null}

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/5 text-slate">
              <tr>
                <th className="px-5 py-4 font-medium">Arquivo</th>
                <th className="px-5 py-4 font-medium">Data</th>
                <th className="px-5 py-4 font-medium">Duração</th>
                <th className="px-5 py-4 font-medium">Engine</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-black/5">
                  <td className="px-5 py-4 font-medium">{item.original_filename}</td>
                  <td className="px-5 py-4 text-slate">{formatDate(item.created_at)}</td>
                  <td className="px-5 py-4 text-slate">{formatDuration(item.duration_seconds)}</td>
                  <td className="px-5 py-4 uppercase text-slate">{item.transcription_engine}</td>
                  <td className="px-5 py-4"><StatusBadge status={item.status} /></td>
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
              ))}
            </tbody>
          </table>
        </div>
        {!items.length ? <div className="p-6 text-sm text-slate">Nenhum item salvo no histórico.</div> : null}
      </section>
    </div>
  );
}
