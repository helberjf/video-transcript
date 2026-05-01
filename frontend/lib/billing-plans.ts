export type WorkspacePlan = "trial" | "pro" | "business" | "enterprise";

export interface PlanDefinition {
  id: WorkspacePlan;
  name: string;
  priceLabel: string;
  creditsPerMonth: number | null;
  stripePriceEnv?: string;
  cta: string;
  description: string;
  features: string[];
}

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    id: "trial",
    name: "Trial",
    priceLabel: "Gratis",
    creditsPerMonth: 20,
    cta: "Comecar gratis",
    description: "Para validar o fluxo completo com poucos documentos.",
    features: ["20 creditos por mes", "Login Google", "Modelos e formularios", "Exportacao Word/PDF"],
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "R$49/mes",
    creditsPerMonth: 200,
    stripePriceEnv: "STRIPE_PRICE_PRO_MONTHLY",
    cta: "Assinar Pro",
    description: "Para profissionais e equipes pequenas com uso recorrente.",
    features: ["200 creditos por mes", "IA inclusa", "Historico por cliente", "Portal de cobranca Stripe"],
  },
  {
    id: "business",
    name: "Business",
    priceLabel: "R$149/mes",
    creditsPerMonth: 800,
    stripePriceEnv: "STRIPE_PRICE_BUSINESS_MONTHLY",
    cta: "Assinar Business",
    description: "Para operacoes com volume maior de documentos, audios e videos.",
    features: ["800 creditos por mes", "IA inclusa", "Workspaces por cliente", "Prioridade operacional"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceLabel: "Sob consulta",
    creditsPerMonth: null,
    cta: "Falar sobre Enterprise",
    description: "Para implantacao dedicada, compliance e uso com API propria no futuro.",
    features: ["Creditos customizados", "Opcao on-premise/desktop", "API propria opcional", "Suporte de implantacao"],
  },
];

export function getPlanDefinition(plan: string | null | undefined): PlanDefinition {
  return PLAN_DEFINITIONS.find((item) => item.id === plan) ?? PLAN_DEFINITIONS[0];
}

export function getPlanCreditLimit(plan: string | null | undefined): number | null {
  return getPlanDefinition(plan).creditsPerMonth;
}

export function isPaidCheckoutPlan(plan: string | null | undefined): plan is "pro" | "business" {
  return plan === "pro" || plan === "business";
}

export function getBillingPeriodStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}
