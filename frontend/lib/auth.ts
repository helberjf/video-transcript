import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";

import { prisma } from "@/lib/prisma";
import { ensureWorkspaceForUser, getWorkspaceForUser } from "@/lib/workspace-db";

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

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret:
    process.env.NEXTAUTH_SECRET ??
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV === "development" ? "formreport-dev-secret" : undefined),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
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
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : undefined;
        session.user.workspaceId = typeof token.workspaceId === "string" ? token.workspaceId : normalizeAuthWorkspaceId(session.user.email);
        session.user.plan = typeof token.plan === "string" ? token.plan : "trial";
      }
      return session;
    },
  },
};
