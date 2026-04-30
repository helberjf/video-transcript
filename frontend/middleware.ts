import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";
const authSecret =
  process.env.NEXTAUTH_SECRET ??
  process.env.AUTH_SECRET ??
  (process.env.NODE_ENV === "development" ? "formreport-dev-secret" : undefined);

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/billing") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/stripe/webhook")
  );
}

export async function middleware(request: NextRequest) {
  if (isDesktopMode || isPublicPath(request.nextUrl.pathname)) {
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
