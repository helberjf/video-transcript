import { redirect } from "next/navigation";

/** Endereço antigo do login com credenciais de demonstração. */
export default async function AcessoPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  redirect(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
}
