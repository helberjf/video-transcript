import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions, isGoogleLoginEnabled } from "@/lib/auth";
import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";
import { getAuthErrorMessage } from "@/lib/auth/error-codes";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar | ModeloIA",
  robots: { index: false, follow: false },
};

const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  // O desktop não tem contas: o antigo /login virou a página do workspace local.
  if (isDesktopMode) {
    redirect("/conta");
  }

  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(params.callbackUrl);
  const session = await getServerSession(authOptions);
  if (session) {
    redirect(callbackUrl);
  }

  return (
    <LoginForm
      callbackUrl={callbackUrl}
      googleEnabled={isGoogleLoginEnabled}
      initialError={getAuthErrorMessage(params.error)}
    />
  );
}
