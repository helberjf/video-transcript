import { jwtVerify, SignJWT } from "jose";

/**
 * Portão de senha única do modo pessoal (web na Vercel). Ligado quando SITE_PASSWORD_HASH existe.
 * Só o hash fica na Vercel; a senha em si nunca sai do computador de quem a gerou.
 * Este arquivo roda também no middleware (edge), por isso não usa APIs do Node.
 */
export const GATE_COOKIE = "modeloia_gate";
export const GATE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function isGateEnabled(): boolean {
  return Boolean(process.env.SITE_PASSWORD_HASH);
}

function sessionSecret(): Uint8Array {
  const secret = process.env.SITE_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SITE_SESSION_SECRET ausente ou curto demais.");
  }
  return new TextEncoder().encode(secret);
}

export async function signGateSession(): Promise<string> {
  return new SignJWT({ scope: "site" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${GATE_MAX_AGE_SECONDS}s`)
    .sign(sessionSecret());
}

export async function isGateSessionValid(token: string | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    return payload.scope === "site";
  } catch {
    return false;
  }
}

/**
 * Chamadas às rotas internas precisam vir de uma página do próprio site. Navegadores mandam
 * Origin e Sec-Fetch-Site sozinhos; Postman/curl não mandam por padrão.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const expected = new URL(request.url).origin;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const allowed = new Set([expected, forwardedHost ? `${forwardedProto}://${forwardedHost}` : expected]);
  // GET do próprio site costuma vir sem Origin; nesse caso vale o Sec-Fetch-Site.
  const originOk = origin === null ? request.method === "GET" : allowed.has(origin);
  return fetchSite === "same-origin" && originOk;
}
