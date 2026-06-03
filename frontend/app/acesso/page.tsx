"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

/**
 * Página de acesso interno para demonstração.
 * Não está linkada no menu. Use as credenciais geradas pelo seed:
 *   Admin  : admin@modeloia.com  / DEMO_ADMIN_PASSWORD
 *   Cliente: cliente@modeloia.com / DEMO_CLIENT_PASSWORD
 */
export default function AcessoPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallbackUrl(params.get("callbackUrl") ?? "/");
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("Email ou senha incorretos.");
    } else {
      window.location.href = callbackUrl;
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-md flex-col justify-center py-12">
      <Link href="/" className="mb-8 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
        ModeloIA
      </Link>

      <div className="panel p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Acesso interno</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink">
          Login com credenciais
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate">
          Use as credenciais de demonstração criadas pelo seed para testar o sistema.
        </p>

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
              placeholder="admin@modeloia.com"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">Senha</label>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>
          ) : null}

          <button className="button-primary w-full" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-xs leading-5 text-slate">
          <p className="font-semibold text-sand">Credenciais de demo</p>
          <p className="mt-2">
            <span className="text-ink">Admin:</span> admin@modeloia.com<br />
            <span className="text-ink">Senha:</span> veja DEMO_ADMIN_PASSWORD no .env
          </p>
          <p className="mt-2">
            <span className="text-ink">Cliente:</span> cliente@modeloia.com<br />
            <span className="text-ink">Senha:</span> veja DEMO_CLIENT_PASSWORD no .env
          </p>
          <p className="mt-3">
            Para criar: <code className="text-aqua">npm run prisma:seed</code>
          </p>
        </div>

        <div className="mt-6 flex gap-4 text-sm">
          <Link href="/login" className="text-slate hover:underline">
            Login com Google
          </Link>
          <Link href="/forgot-password" className="text-aqua hover:underline">
            Esqueci a senha
          </Link>
        </div>
      </div>
    </div>
  );
}
