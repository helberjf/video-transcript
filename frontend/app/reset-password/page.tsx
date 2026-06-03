"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erro ao redefinir a senha.");
        return;
      }
      setDone(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
        Link inválido. Solicite um novo link na página{" "}
        <Link href="/forgot-password" className="underline">
          Esqueci a senha
        </Link>
        .
      </p>
    );
  }

  return done ? (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-4 text-sm leading-6 text-emerald-200">
        <p className="font-semibold">Senha redefinida com sucesso!</p>
        <p className="mt-1">Agora você pode entrar com sua nova senha.</p>
      </div>
      <Link href="/login" className="button-primary block text-center">
        Ir para o login
      </Link>
    </div>
  ) : (
    <form className="mt-6 space-y-4" onSubmit={(e) => void submit(e)}>
      <div>
        <label className="mb-2 block text-sm font-medium text-ink">Nova senha</label>
        <input
          className="field"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-ink">Confirmar nova senha</label>
        <input
          className="field"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repita a nova senha"
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>
      ) : null}

      <button className="button-primary w-full" type="submit" disabled={loading}>
        {loading ? "Salvando..." : "Redefinir senha"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-md flex-col justify-center py-12">
      <Link href="/" className="mb-8 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
        ModeloIA
      </Link>

      <div className="panel p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Nova senha</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink">
          Redefinir senha
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate">
          Escolha uma senha forte com pelo menos 8 caracteres.
        </p>

        <Suspense fallback={<p className="mt-6 text-sm text-slate">Carregando...</p>}>
          <ResetPasswordForm />
        </Suspense>

        <div className="mt-6 flex gap-4 text-sm">
          <Link href="/login" className="text-slate hover:underline">
            Voltar ao login
          </Link>
          <Link href="/forgot-password" className="text-aqua hover:underline">
            Solicitar novo link
          </Link>
        </div>
      </div>
    </div>
  );
}
