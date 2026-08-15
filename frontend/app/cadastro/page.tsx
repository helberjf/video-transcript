"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

/**
 * Cadastro por convite. Só quem recebeu um código do administrador cria conta,
 * porque o processamento consome a chave de IA do dono do sistema.
 */
export default function CadastroPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, inviteCode }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Nao foi possivel criar a conta.");
        return;
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Conta criada, mas o login falhou. Tente entrar em /acesso.");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Falha na comunicação com o servidor.");
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
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Acesso por convite</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink">
          Criar conta
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate">
          Informe o código que você recebeu. Cada convite libera uma conta com o plano gratuito.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(e) => void submit(e)}>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">Código de convite</label>
            <input
              className="field font-mono uppercase tracking-[0.18em]"
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">Nome</label>
            <input
              className="field"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">Email</label>
            <input
              className="field"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">Senha</label>
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo de 8 caracteres"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>
          ) : null}

          <button className="button-primary w-full" type="submit" disabled={loading}>
            {loading ? "Criando conta..." : "Criar conta"}
          </button>
        </form>

        <div className="mt-6 flex gap-4 text-sm">
          <Link href="/acesso" className="text-slate hover:underline">
            Já tenho conta
          </Link>
          <Link href="/pricing" className="text-aqua hover:underline">
            Ver planos
          </Link>
        </div>
      </div>
    </div>
  );
}
