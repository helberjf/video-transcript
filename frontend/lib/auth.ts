import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";

import { isAdminEmail } from "@/lib/admin";
import { AUTH_ERROR_CODES } from "@/lib/auth/error-codes";
import { normalizeEmail } from "@/lib/auth/validation";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, clientIp, consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { ensureWorkspaceForUser, getWorkspaceForUser } from "@/lib/workspace-db";

// Hash bcrypt de uma senha aleatoria, usado so para igualar o tempo quando o email nao existe.
const DUMMY_HASH = "$2b$12$yZBGfuD.HeAwWMuJ34/e9u87oMt8joXQ0JA9Z1JPWkrKwWxeMZlL2";

export function normalizeAuthWorkspaceId(value: string | null | undefined): string {
  const normalized = (value ?? "workspace")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 80);
  return normalized || "workspace";
}

export const isGoogleLoginEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret:
    process.env.NEXTAUTH_SECRET ??
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV === "development" ? "modeloia-dev-secret" : undefined),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(isGoogleLoginEnabled
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            // Quem criou conta com email/senha pode entrar pelo Google com o mesmo email.
            // O Google verifica o email, entao a vinculacao e segura aqui.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, req) {
        const email = normalizeEmail(credentials?.email);
        const password = credentials?.password;
        if (!email || !password) return null;

        // Por email segura quem tenta muitas senhas numa conta; por IP, quem testa muitas contas.
        const [byEmail, byIp] = await Promise.all([
          consumeRateLimit("login-email", email, RATE_LIMITS.loginPerEmail),
          consumeRateLimit("login-ip", clientIp(req?.headers), RATE_LIMITS.loginPerIp),
        ]);
        if (!byEmail.allowed || !byIp.allowed) {
          throw new Error(AUTH_ERROR_CODES.tooManyAttempts);
        }

        // Contas antigas podem ter o email gravado com maiusculas.
        const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
        // Compara mesmo sem usuario para o tempo de resposta nao revelar quem tem conta.
        const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
        if (!user?.password || !valid) return null;

        await resetRateLimit("login-email", email);
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        const workspace = await ensureWorkspaceForUser({
          id: user.id,
          email: user.email ?? null,
          name: user.name ?? null,
        });
        token.workspaceId = workspace.id;
        token.plan = workspace.plan;
        token.isAdmin = isAdminEmail(user.email);
        return token;
      }

      if (typeof token.id === "string") {
        const workspace = await getWorkspaceForUser(token.id);
        if (workspace) {
          token.workspaceId = workspace.id;
          token.plan = workspace.plan;
        }
      }

      token.workspaceId = typeof token.workspaceId === "string" ? token.workspaceId : normalizeAuthWorkspaceId(token.email);
      token.isAdmin = isAdminEmail(token.email);
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : undefined;
        session.user.workspaceId = typeof token.workspaceId === "string" ? token.workspaceId : normalizeAuthWorkspaceId(session.user.email);
        session.user.plan = typeof token.plan === "string" ? token.plan : "trial";
        session.user.isAdmin = token.isAdmin === true;
      }
      return session;
    },
  },
};
