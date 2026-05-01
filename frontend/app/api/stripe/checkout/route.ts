import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppUrl, getStripe, getStripePriceId, type BillingPlan } from "@/lib/stripe";
import { ensureWorkspaceForUser } from "@/lib/workspace-db";

const PLANS = new Set<BillingPlan>(["pro", "business"]);

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Login necessario para assinar." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { plan?: BillingPlan };
  const plan = body.plan;

  if (!plan || !PLANS.has(plan)) {
    return NextResponse.json({ error: "Plano invalido." }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const priceId = getStripePriceId(plan);
    const appUrl = getAppUrl(request);
    const user = session.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id } }) : null;
    if (!user) {
      return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 401 });
    }
    const workspace = await ensureWorkspaceForUser(user);
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    const customer =
      existingCustomers.data[0] ??
      (await stripe.customers.create({
        email,
        name: session.user?.name ?? undefined,
        metadata: {
          workspace_id: workspace.id,
        },
      }));

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { stripeCustomerId: customer.id },
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl}/billing/success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing?canceled=1`,
      metadata: {
        plan,
        workspace_id: workspace.id,
      },
      subscription_data: {
        metadata: {
          plan,
          workspace_id: workspace.id,
        },
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel iniciar o checkout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
