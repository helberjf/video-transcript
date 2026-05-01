import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { getPlanByStripePriceId } from "@/lib/stripe";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function dateFromStripeSeconds(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000) : undefined;
}

function getSubscriptionPeriod(subscription: Stripe.Subscription) {
  const value = subscription as Stripe.Subscription & {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };
  return {
    currentPeriodStart: dateFromStripeSeconds(value.current_period_start),
    currentPeriodEnd: dateFromStripeSeconds(value.current_period_end),
  };
}

async function updateWorkspaceFromSubscription(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const plan = (subscription.metadata.plan || getPlanByStripePriceId(priceId) || "trial") as string;
  const workspaceId = subscription.metadata.workspace_id;

  if (!workspaceId) {
    const period = getSubscriptionPeriod(subscription);
    const existing = await prisma.workspace.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (!existing) {
      return null;
    }
    return prisma.workspace.update({
      where: { id: existing.id },
      data: {
        plan,
        billingStatus: subscription.status,
        stripePriceId: priceId,
        currentPeriodStart: period.currentPeriodStart,
        currentPeriodEnd: period.currentPeriodEnd,
      },
    });
  }

  const period = getSubscriptionPeriod(subscription);
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      plan,
      billingStatus: subscription.status,
      stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
    },
  });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (!webhookSecret || !signature) {
    return NextResponse.json({ error: "Webhook Stripe nao configurado." }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assinatura invalida.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const existingEvent = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (existingEvent) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  let workspaceId: string | null = null;

  switch (event.type) {
    case "checkout.session.completed": {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      workspaceId = checkoutSession.metadata?.workspace_id ?? null;
      const subscriptionId = typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : checkoutSession.subscription?.id;
      if (subscriptionId) {
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        const workspace = await updateWorkspaceFromSubscription(subscription);
        workspaceId = workspace?.id ?? workspaceId;
      } else if (workspaceId) {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            plan: checkoutSession.metadata?.plan ?? "trial",
            billingStatus: checkoutSession.payment_status,
            stripeCustomerId: typeof checkoutSession.customer === "string" ? checkoutSession.customer : checkoutSession.customer?.id,
          },
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const workspace = await updateWorkspaceFromSubscription(subscription);
      workspaceId = workspace?.id ?? subscription.metadata.workspace_id ?? null;
      break;
    }
    case "invoice.payment_succeeded":
      break;
    default:
      break;
  }

  await prisma.stripeEvent.create({
    data: {
      id: event.id,
      type: event.type,
      workspaceId,
      payload: event as unknown as object,
    },
  });

  return NextResponse.json({ received: true });
}
