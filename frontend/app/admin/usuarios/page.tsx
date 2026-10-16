"use client";

import { useCallback, useEffect, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { formatDate } from "@/lib/utils";

type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  providers: string[];
  aiKeyAccess: "admin" | "shared" | "own";
};

const ACCESS_LABELS: Record<AdminUser["aiKeyAccess"], string> = {
  admin: "Administrador",
  shared: "Usa a sua chave",
  own: "Chave própria",
};

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = (await response.json()) as { users?: AdminUser[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível carregar as contas.");
      }
      setUsers(data.users ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as contas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (user: AdminUser) => {
    setPendingId(user.id);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, useOwnerAiKey: user.aiKeyAccess !== "shared" }),
      });
      const data = (await response.json()) as { aiKeyAccess?: AdminUser["aiKeyAccess"]; error?: string };
      if (!response.ok || !data.aiKeyAccess) {
        throw new Error(data.error ?? "Não foi possível alterar o acesso.");
      }
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, aiKeyAccess: data.aiKeyAccess! } : item)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o acesso.");
    } finally {
      setPendingId(null);
    }
  };

  const query = filter.trim().toLowerCase();
  const visible = query
    ? users.filter((user) => `${user.name ?? ""} ${user.email ?? ""}`.toLowerCase().includes(query))
    : users;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Administração"
        title="Contas e chave de IA"
        description="Cada conta usa a própria chave de IA. Libere aqui quem pode processar com a sua chave: a pessoa não vê a chave, e o limite de créditos do plano dela continua valendo."
      />

      {error ? <div className="panel p-4 text-sm text-ember">{error}</div> : null}

      <section className="panel p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate">{loading ? "Carregando..." : `${users.length} conta(s)`}</p>
          <input
            className="field sm:max-w-xs"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Buscar por nome ou email"
            aria-label="Buscar conta"
          />
        </div>

        <div className="mt-4 divide-y divide-white/10">
          {visible.map((user) => (
            <div key={user.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{user.name || "Sem nome"}</p>
                <p className="truncate text-sm text-slate">{user.email}</p>
                <p className="mt-1 text-xs text-slate">
                  Desde {formatDate(user.createdAt)} · {user.providers.includes("google") ? "Google e senha" : "Email e senha"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    user.aiKeyAccess === "own" ? "bg-white/10 text-slate" : "bg-emerald-500/15 text-emerald-200"
                  }`}
                >
                  {ACCESS_LABELS[user.aiKeyAccess]}
                </span>
                {user.aiKeyAccess === "admin" ? null : (
                  <button
                    type="button"
                    className="button-secondary px-4 py-2"
                    disabled={pendingId === user.id}
                    onClick={() => void toggle(user)}
                  >
                    {user.aiKeyAccess === "shared" ? "Tirar acesso" : "Liberar minha chave"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {!loading && !visible.length ? <p className="py-6 text-sm text-slate">Nenhuma conta encontrada.</p> : null}
        </div>
      </section>
    </div>
  );
}
