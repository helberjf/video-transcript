"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-md flex-col justify-center py-12">
      <Link href="/" className="mb-8 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
        ModeloIA
      </Link>

      <div className="panel p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Recuperar acesso</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink">
          Esqueceu sua senha?
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate">
          Informe seu email de cadastro. Se houver uma conta, você receberá um link para redefinir a senha.
        </p>

        {done ? (
          <div className="mt-6 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-4 text-sm leading-6 text-emerald-200">
            <p className="font-semibold">Email enviado!</p>
            <p className="mt-1">Se este email estiver cadastrado, você receberá as instruções em breve. Verifique também a caixa de spam.</p>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={(e) => void submit(e)}>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Email</label>
              <input
                className="field"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>
            ) : null}

            <button className="button-primary w-full" type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Enviar link de recuperação"}
            </button>
          </form>
        )}

        <div className="mt-6 flex gap-4 text-sm">
          <Link href="/login" className="text-slate hover:underline">
            Voltar ao login
          </Link>
          <Link href="/register" className="text-aqua hover:underline">
            Criar conta
          </Link>
        </div>
      </div>
    </div>
  );
}
