"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";

import { AuthCard, FormError } from "@/components/auth-card";
import { PASSWORD_MIN_LENGTH, normalizeEmail, validateEmail, validateName, validatePassword } from "@/lib/auth/validation";

/**
 * Cadastro aberto. Cada conta processa com a própria chave de IA, pedida no passo seguinte
 * (/chave-ia). O admin pode liberar algumas contas para usar a chave dele.
 */
export default function CadastroPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const normalizedEmail = normalizeEmail(email);
    const validationError =
      validateName(name) ??
      validateEmail(normalizedEmail) ??
      validatePassword(password) ??
      (password !== confirm ? "As senhas não coincidem." : null);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: normalizedEmail, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Não foi possível criar a conta.");
        return;
      }

      const result = await signIn("credentials", { email: normalizedEmail, password, redirect: false });
      if (!result || result.error) {
        window.location.href = "/login?callbackUrl=%2Fchave-ia";
        return;
      }
      window.location.href = "/chave-ia?novo=1";
    } catch {
      setError("Falha na comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Passo 1 de 2"
      title="Criar conta"
      description="Depois do cadastro você informa a sua chave de IA, que fica guardada criptografada."
      footer={
        <span className="text-slate">
          Já tem conta?{" "}
          <Link href="/login" className="text-aqua hover:underline">
            Entrar
          </Link>
        </span>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate>
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-ink">
            Nome
          </label>
          <input id="name" className="field" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
        </div>
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
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres, com letras e números`}
          />
        </div>
        <div>
          <label htmlFor="confirm" className="mb-2 block text-sm font-medium text-ink">
            Confirmar senha
          </label>
          <input
            id="confirm"
            className="field"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>

        <FormError message={error} />

        <button className="button-primary w-full" type="submit" disabled={loading}>
          {loading ? "Criando conta..." : "Criar conta e continuar"}
        </button>
      </form>
    </AuthCard>
  );
}
