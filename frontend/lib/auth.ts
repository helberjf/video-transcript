import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

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
    async jwt({ token, profile }) {
      const profileWithSub = profile as { sub?: string } | undefined;
      if (profileWithSub?.sub) {
        token.id = profileWithSub.sub;
      }
      token.workspaceId = normalizeAuthWorkspaceId(token.email);
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : undefined;
        session.user.workspaceId = typeof token.workspaceId === "string" ? token.workspaceId : normalizeAuthWorkspaceId(session.user.email);
      }
      return session;
    },
  },
};
