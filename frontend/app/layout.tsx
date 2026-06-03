import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "ModeloIA",
  description: "Crie formularios e relatorios a partir de imagens, documentos, audios e videos com IA.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="font-[family-name:var(--font-body)]">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
