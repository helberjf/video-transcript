import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppUrl, getStripe } from "@/lib/stripe";
import { ensureWorkspaceForUser } from "@/lib/workspace-db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Login necessario para abrir o portal." }, { status: 401 });
  }

  try {
    const stripe = getStripe();
    const user = session.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id } }) : null;
    if (!user) {
      return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 401 });
    }
    const workspace = await ensureWorkspaceForUser(user);
    const customer =
      workspace.stripeCustomerId
        ? await stripe.customers.retrieve(workspace.stripeCustomerId).then((value) => ("deleted" in value && value.deleted ? null : value))
        : (await stripe.customers.list({ email, limit: 1 })).data[0];

    if (!customer) {
      return NextResponse.json({ error: "Cliente ainda nao possui assinatura Stripe." }, { status: 404 });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${getAppUrl(request)}/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel abrir o portal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
