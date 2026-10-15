import { NextResponse } from "next/server";

import { GATE_COOKIE, GATE_MAX_AGE_SECONDS, isGateEnabled, isSameOriginRequest, signGateSession } from "@/lib/site-gate";
import { verifySitePassword } from "@/lib/site-password";

export const runtime = "nodejs";

const MAX_PASSWORD_LENGTH = 512;
const FAILURE_DELAY_MS = 1200;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_WINDOW = 10;

// Limite por IP em memória: vale por instância. A senha tem ~380 bits, então força bruta já é
// inviável; o limite só corta ruído e scripts.
const failures = new Map<string, { count: number; since: number }>();

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
}

function tooManyFailures(ip: string): boolean {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.since > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES_PER_WINDOW;
}

function registerFailure(ip: string) {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.since > WINDOW_MS) {
    failures.set(ip, { count: 1, since: Date.now() });
  } else {
    entry.count += 1;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  const hash = process.env.SITE_PASSWORD_HASH;
  if (!isGateEnabled() || !hash) {
    return NextResponse.json({ error: "Acesso por senha não está configurado." }, { status: 404 });
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Requisição recusada." }, { status: 403 });
  }

  const ip = clientIp(request);
  if (tooManyFailures(ip)) {
    return NextResponse.json({ error: "Muitas tentativas. Tente de novo em 15 minutos." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const valid = password.length > 0 && password.length <= MAX_PASSWORD_LENGTH && (await verifySitePassword(password, hash));

  if (!valid) {
    registerFailure(ip);
    await wait(FAILURE_DELAY_MS);
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  failures.delete(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE, await signGateSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: GATE_MAX_AGE_SECONDS,
  });
  return response;
}
