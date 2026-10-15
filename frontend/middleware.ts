import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

import { GATE_COOKIE, isGateEnabled, isGateSessionValid } from "@/lib/site-gate";

const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";
const authSecret =
  process.env.NEXTAUTH_SECRET ??
  process.env.AUTH_SECRET ??
  (process.env.NODE_ENV === "development" ? "modeloia-dev-secret" : undefined);

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/acesso") ||
    pathname.startsWith("/cadastro") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/billing") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/stripe/webhook")
  );
}

/** Modo pessoal: uma senha só, e nada do site abre sem ela (páginas e rotas /api). */
async function siteGate(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/entrar" || pathname === "/api/entrar") {
    return NextResponse.next();
  }
  if (await isGateSessionValid(request.cookies.get(GATE_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 401 });
  }
  const url = new URL("/entrar", request.url);
  if (pathname !== "/") {
    url.searchParams.set("next", `${pathname}${search}`);
  }
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  if (isDesktopMode) {
    return NextResponse.next();
  }
  if (isGateEnabled()) {
    return siteGate(request);
  }
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: authSecret,
  });

  if (token) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|css|js|map|txt|woff2?)).*)"],
};
