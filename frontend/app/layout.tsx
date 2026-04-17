import type { Metadata } from "next";
import { Space_Grotesk, Source_Sans_3 } from "next/font/google";

import { AppShell } from "@/components/app-shell";

import "./globals.css";

const displayFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const bodyFont = Source_Sans_3({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Media Transcript Studio",
  description: "Aplicação local para transcrição e geração de relatórios com IA.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${displayFont.variable} ${bodyFont.variable} font-[family-name:var(--font-body)]`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
