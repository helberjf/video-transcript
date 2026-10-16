import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * Rate limit em janela fixa guardado no Postgres. Um limite em memória não serve na Vercel:
 * cada instância teria o próprio contador e um ataque distribuído entre elas passaria.
 */
export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  loginPerEmail: { limit: 10, windowSeconds: 15 * 60 },
  loginPerIp: { limit: 30, windowSeconds: 15 * 60 },
  registerPerIp: { limit: 5, windowSeconds: 60 * 60 },
  forgotPasswordPerIp: { limit: 5, windowSeconds: 60 * 60 },
  forgotPasswordPerEmail: { limit: 3, windowSeconds: 60 * 60 },
  resetPasswordPerIp: { limit: 10, windowSeconds: 15 * 60 },
  // O cliente guarda o token por 4 min; 60 em 5 min só estoura com abuso.
  backendTokenPerUser: { limit: 60, windowSeconds: 5 * 60 },
  adminWritePerUser: { limit: 60, windowSeconds: 60 },
  billingPerUser: { limit: 10, windowSeconds: 10 * 60 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

// Email e IP não ficam legíveis no banco: a chave guarda só um hash.
function bucketKey(scope: string, identifier: string): string {
  const digest = createHash("sha256").update(`${scope}:${identifier.trim().toLowerCase()}`).digest("hex");
  return `${scope}:${digest.slice(0, 40)}`;
}

/** Conta uma tentativa e diz se ela ainda cabe no limite. */
export async function consumeRateLimit(scope: string, identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const key = bucketKey(scope, identifier);
  const window = rule.windowSeconds;

  try {
    // Um único UPSERT atômico: duas requisições simultâneas não leem o mesmo contador.
    const rows = await prisma.$queryRaw<{ count: number; retry_after: number }[]>(Prisma.sql`
      INSERT INTO "rate_limit_buckets" ("key", "count", "window_start")
      VALUES (${key}, 1, now())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rate_limit_buckets"."window_start" <= now() - (${window}::int * interval '1 second') THEN 1
          ELSE "rate_limit_buckets"."count" + 1
        END,
        "window_start" = CASE
          WHEN "rate_limit_buckets"."window_start" <= now() - (${window}::int * interval '1 second') THEN now()
          ELSE "rate_limit_buckets"."window_start"
        END
      RETURNING "count",
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("window_start" + (${window}::int * interval '1 second') - now()))))::int AS retry_after
    `);

    if (Math.random() < 0.01) {
      void prisma.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "window_start" < now() - interval '1 day'`.catch(() => undefined);
    }

    const row = rows[0];
    return { allowed: !row || Number(row.count) <= rule.limit, retryAfterSeconds: Number(row?.retry_after ?? window) };
  } catch (error) {
    // Sem banco o limite não tem onde contar. Deixa passar: a própria rota vai falhar ao usar o banco.
    console.error("[rate-limit] contador indisponível", error);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Zera o contador, por exemplo depois de um login certo. */
export async function resetRateLimit(scope: string, identifier: string): Promise<void> {
  await prisma.rateLimitBucket.deleteMany({ where: { key: bucketKey(scope, identifier) } }).catch(() => undefined);
}

export function tooManyRequests(retryAfterSeconds: number, message = "Muitas tentativas. Aguarde um pouco e tente de novo.") {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)) } },
  );
}

/** IP de quem chamou. Na Vercel x-real-ip e x-forwarded-for são definidos pela própria plataforma. */
export function clientIp(headers: Headers | Record<string, unknown> | undefined): string {
  const read = (name: string): string | null => {
    if (!headers) return null;
    if (headers instanceof Headers) return headers.get(name);
    const value = headers[name];
    return typeof value === "string" ? value : Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
  };
  return read("x-real-ip")?.trim() || read("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
}
