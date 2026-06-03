"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

/** Format raw digits as 00.000.000/0000-00 */
function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function isValidCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (digits: string, weights: number[]) =>
    digits.split("").reduce((acc, n, i) => acc + Number(n) * weights[i]!, 0);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const r1 = calc(d.slice(0, 12), w1) % 11;
  const d1 = r1 < 2 ? 0 : 11 - r1;
  const r2 = calc(d.slice(0, 12) + d1, w2) % 11;
  const d2 = r2 < 2 ? 0 : 11 - r2;
  return d[12] === String(d1) && d[13] === String(d2);
}

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleCnpj = (value: string) => setCnpj(formatCnpj(value));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!isValidCnpj(cnpj)) {
      setError("CNPJ inválido. Verifique o número informado.");
      return;
    }

    if (name.trim().length < 3) {
      setError("Informe seu nome completo.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), cnpj: cnpj.replace(/\D/g, ""), propertyName: propertyName.trim(), city: city.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erro ao registrar.");
        return;
      }
      setDone(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-[calc(100vh-40px)] max-w-6xl gap-6 py-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <section className="space-y-6">
        <Link href="/" className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
          ModeloIA
        </Link>

        <div className="space-y-4">
          <p className="inline-flex rounded-full border border-tide/25 bg-tide/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-aqua">
            Cadastro do Proprietário
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
            Cadastre seu imóvel
          </h1>
          <p className="max-w-xl text-base leading-8 text-slate">
            O cadastro é exclusivo para donos de imóvel. Informe seus dados e depois entre com o Google para acessar o sistema.
          </p>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-4 text-sm leading-6 text-emerald-200">
              <p className="font-semibold">Cadastro registrado com sucesso!</p>
              <p className="mt-1">Agora entre com o Google para acessar seu workspace.</p>
            </div>
            <button
              type="button"
              className="button-primary w-full"
              onClick={() => void signIn("google", { callbackUrl: "/" })}
            >
              Entrar com Google
            </button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Nome completo do proprietário</label>
              <input
                className="field"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome completo"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">CNPJ</label>
              <input
                className="field"
                type="text"
                inputMode="numeric"
                required
                maxLength={18}
                value={cnpj}
                onChange={(e) => handleCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
              />
              <p className="mt-1 text-xs text-slate">CNPJ da empresa proprietária do imóvel.</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Nome do imóvel</label>
              <input
                className="field"
                type="text"
                required
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                placeholder="Ex.: Residencial Vila Nova"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Cidade</label>
              <input
                className="field"
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex.: São Paulo - SP"
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>
            ) : null}

            <button className="button-primary w-full" type="submit" disabled={loading}>
              {loading ? "Registrando..." : "Registrar imóvel"}
            </button>
          </form>
        )}

        <div className="flex gap-4 text-sm">
          <Link href="/login" className="text-slate hover:underline">
            Já tenho acesso
          </Link>
        </div>
      </section>

      <section className="panel p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Para proprietários</p>
        <div className="mt-5 grid gap-4">
          {[
            ["Exclusivo para donos", "Apenas proprietários com CNPJ podem registrar imóveis no sistema."],
            ["Login via Google", "Após o cadastro, acesse com sua conta Google. Sem senhas para lembrar."],
            ["Workspace dedicado", "Cada imóvel tem seu próprio espaço com histórico, modelos e relatórios separados."],
          ].map(([title, description]) => (
            <div key={title} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="font-semibold text-ink">{title}</p>
              <p className="mt-1 text-sm leading-6 text-slate">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
