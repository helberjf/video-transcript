import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getAppUrl, getStripe, getStripePriceId, type BillingPlan } from "@/lib/stripe";

const PLANS = new Set<BillingPlan>(["pro", "enterprise"]);

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Login necessario para assinar." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { plan?: BillingPlan; workspaceId?: string };
  const plan = body.plan;

  if (!plan || !PLANS.has(plan)) {
    return NextResponse.json({ error: "Plano invalido." }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const priceId = getStripePriceId(plan);
    const appUrl = getAppUrl(request);
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    const customer =
      existingCustomers.data[0] ??
      (await stripe.customers.create({
        email,
        name: session.user?.name ?? undefined,
        metadata: {
          workspace_id: body.workspaceId || session.user?.workspaceId || email,
        },
      }));

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
        workspace_id: body.workspaceId || session.user?.workspaceId || email,
      },
      subscription_data: {
        metadata: {
          plan,
          workspace_id: body.workspaceId || session.user?.workspaceId || email,
        },
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel iniciar o checkout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
