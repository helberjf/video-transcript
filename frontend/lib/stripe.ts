import Stripe from "stripe";

export type BillingPlan = "pro" | "enterprise";

let stripeClient: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY nao configurada.");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      typescript: true,
    });
  }

  return stripeClient;
}

export function getAppUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin;
}

export function getStripePriceId(plan: BillingPlan) {
  const priceId = plan === "enterprise" ? process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY : process.env.STRIPE_PRICE_PRO_MONTHLY;
  if (!priceId) {
    throw new Error(`Preco Stripe nao configurado para o plano ${plan}.`);
  }

  return priceId;
}
