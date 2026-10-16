"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";

import { AuthCard, FormError } from "@/components/auth-card";
import { getAuthErrorMessage } from "@/lib/auth/error-codes";

export function LoginForm({
  callbackUrl,
  googleEnabled,
  initialError,
}: {
  callbackUrl: string;
  googleEnabled: boolean;
  initialError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const busy = loading || googleLoading;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", { email, password, redirect: false, callbackUrl });

    if (!result || result.error) {
      setLoading(false);
      setError(getAuthErrorMessage(result?.error ?? "CredentialsSignin"));
      return;
    }
    window.location.href = callbackUrl;
  };

  const loginWithGoogle = () => {
    if (busy) return;
    setError(null);
    setGoogleLoading(true);
    void signIn("google", { callbackUrl });
  };

  return (
    <AuthCard
      eyebrow="Acesso"
      title="Entre na sua conta"
      description="Use seu email e senha para abrir seus uploads, modelos e relatórios."
      footer={
        <>
          <Link href="/forgot-password" className="text-aqua hover:underline">
            Esqueci a senha
          </Link>
          <span className="text-slate">
            Não tem conta?{" "}
            <Link href="/cadastro" className="text-aqua hover:underline">
              Criar conta
            </Link>
          </span>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="email"
            className="field"
            type="email"
            autoComplete="email"
            required
            autoFocus
            disabled={busy}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@email.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-ink">
            Senha
          </label>
          <input
            id="password"
            className="field"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <FormError message={error} />

        <button className="button-primary w-full" type="submit" disabled={busy}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {googleEnabled ? (
        <>
          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate">
            <span className="h-px flex-1 bg-white/10" />
            ou
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <button className="button-secondary w-full gap-2" type="button" onClick={loginWithGoogle} disabled={busy}>
            {googleLoading ? "Conectando..." : "Continuar com Google"}
          </button>
        </>
      ) : null}
    </AuthCard>
  );
}
