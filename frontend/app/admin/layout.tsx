import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getAdminSession } from "@/lib/auth/require-admin";

export const metadata: Metadata = {
  title: "Administração | ModeloIA",
  robots: { index: false, follow: false },
};

// Lê a sessão a cada acesso: a página nunca sai pronta do build.
export const dynamic = "force-dynamic";

/** Segunda barreira depois do middleware: confere no servidor que a sessão é do admin. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!(await getAdminSession())) {
    notFound();
  }
  return children;
}
