import { NextResponse } from "next/server";

import { GATE_COOKIE, isSameOriginRequest } from "@/lib/site-gate";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Requisição recusada." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
