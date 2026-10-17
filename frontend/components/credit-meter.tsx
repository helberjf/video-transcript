import Link from "next/link";

import { creditUsageRatio, formatResetDate, isOutOfCredits, unlimitedLabel } from "@/lib/credits";
import type { CreditStatus } from "@/types/api";

function barColor(status: CreditStatus): string {
  const ratio = creditUsageRatio(status);
  return ratio >= 1 ? "bg-ember" : ratio >= 0.8 ? "bg-sand" : "bg-tide";
}

/** Saldo compacto no topo de todas as telas da web. */
export function CreditBadge({ status }: { status: CreditStatus }) {
  const empty = isOutOfCredits(status);
  const text =
    status.limit === null ? "Créditos: sem limite" : `Créditos: ${status.remaining ?? 0} de ${status.limit}`;
  return (
    <Link
      href="/billing"
      title={status.limit === null ? unlimitedLabel(status) : `${status.used} usados neste mês. Renova em ${formatResetDate(status)}.`}
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
        empty ? "border-ember/40 bg-ember/10 text-ember hover:border-ember/70" : "border-white/10 text-ink hover:border-sand/40"
      }`}
    >
      {status.limit !== null ? (
        <span className="h-1.5 w-10 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <span className={`block h-full ${barColor(status)}`} style={{ width: `${(1 - creditUsageRatio(status)) * 100}%` }} />
        </span>
      ) : null}
      {text}
    </Link>
  );
}

/** Aviso fixo quando o saldo do mês acabou: toda ação com IA vai ser recusada até renovar ou trocar de plano. */
export function CreditsExhaustedNotice({ status }: { status: CreditStatus }) {
  if (!isOutOfCredits(status)) {
    return null;
  }
  return (
    <Link
      href="/billing"
      className="mb-5 block rounded-lg border border-ember/30 bg-ember/10 px-4 py-3 text-sm text-ember transition hover:border-ember/60"
    >
      <span className="font-semibold">Seus créditos deste mês acabaram.</span>{" "}
      <span className="text-slate">
        Ações com IA ficam bloqueadas até {formatResetDate(status)}. Atualize o plano para continuar agora.
      </span>
    </Link>
  );
}

/** Saldo, extrato do mês e quanto custa cada ação. */
export function CreditPanel({ status }: { status: CreditStatus }) {
  return (
    <section className="panel p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">Créditos do mês</p>
          {status.limit === null ? (
            <>
              <h3 className="mt-2 text-xl font-semibold">{unlimitedLabel(status)}</h3>
              <p className="mt-1 text-sm text-slate">{status.used} créditos usados neste mês, só para acompanhar.</p>
            </>
          ) : (
            <>
              <h3 className="mt-2 text-xl font-semibold">
                {status.remaining ?? 0} de {status.limit} disponíveis
              </h3>
              <p className="mt-1 text-sm text-slate">
                {status.used} usados. Renova em {formatResetDate(status)}.
              </p>
            </>
          )}
        </div>
      </div>
      {status.limit !== null ? (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full ${barColor(status)}`} style={{ width: `${creditUsageRatio(status) * 100}%` }} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-ink">Últimos gastos</p>
          {status.recent.length ? (
            <ul className="mt-3 divide-y divide-white/10 text-sm">
              {status.recent.map((item, index) => (
                <li key={`${item.created_at}-${index}`} className="flex items-center justify-between gap-4 py-2">
                  <span className="min-w-0 truncate text-slate">
                    <span className="text-ink">{item.label}</span>
                    {" · "}
                    {new Date(item.created_at.endsWith("Z") ? item.created_at : `${item.created_at}Z`).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="shrink-0 font-semibold text-sand">-{item.credits}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate">Nenhum crédito usado neste mês.</p>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Quanto custa cada ação</p>
          <ul className="mt-3 divide-y divide-white/10 text-sm">
            {status.costs.map((cost) => (
              <li key={cost.type} className="flex items-center justify-between gap-4 py-2">
                <span className="min-w-0 text-ink">{cost.label}</span>
                <span className="shrink-0 text-slate">
                  {cost.credits} {cost.credits === 1 ? "crédito" : "créditos"} {cost.unit}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-slate">
            Se a IA falhar, os créditos da ação voltam para o saldo. Ver, editar e exportar não gastam créditos.
          </p>
        </div>
      </div>
    </section>
  );
}
