import { getServerSession } from "next-auth";

import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";
import { isGateEnabled } from "@/lib/site-gate";

const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";

/**
 * Sessão do admin (ADMIN_EMAILS), ou null. Confere o email de novo em vez de confiar no token.
 * No desktop e na web de senha única não existe admin.
 */
export async function getAdminSession() {
  if (isDesktopMode || isGateEnabled()) {
    return null;
  }
  const session = await getServerSession(authOptions);
  return session?.user?.email && isAdminEmail(session.user.email) ? session : null;
}
