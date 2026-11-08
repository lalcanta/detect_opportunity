import type { Bindings } from "../types";

export type OfferTierId = "static" | "admin_cms" | "custom";

export interface OfferTierConfig {
  id: OfferTierId;
  label: string;
  setupAmountCents: number;
  productName: string;
}

export const OFFER_TIERS: Record<OfferTierId, OfferTierConfig> = {
  static: {
    id: "static",
    label: "Formule 1 — Site Vitrine Statique Clé-en-Main (490 € HT + 39 €/mois)",
    setupAmountCents: 49000,
    productName: "Création Site Vitrine Clé-en-Main (NDD + Hébergement + Retouches inclus)",
  },
  admin_cms: {
    id: "admin_cms",
    label: "Formule 2 — Site Dynamique avec Panneau Admin (1 290 € HT + 59 €/mois)",
    setupAmountCents: 129000,
    productName: "Création Site Dynamique avec Panneau d'Administration Autonome",
  },
  custom: {
    id: "custom",
    label: "Formule 3 — Développement Spécifique / E-Commerce / Connecteur Compta (Sur-Mesure)",
    setupAmountCents: 290000,
    productName: "Développement Web Sur-Mesure & Intégration Métier / Compta",
  },
};

export interface PaymentLinkOptions {
  offerTier?: OfferTierId;
  customAmountCents?: number;
  customProductName?: string;
}

/** Crée une Checkout Session Stripe (lien de paiement valable 24 h) selon le palier d'offre choisi. */
export async function createPaymentLink(
  env: Bindings,
  leadId: string,
  company: string,
  opts?: PaymentLinkOptions,
): Promise<string> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY non configurée");
  const base = (env.PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

  const tierKey: OfferTierId = opts?.offerTier && opts.offerTier in OFFER_TIERS ? opts.offerTier : "static";
  const tier = OFFER_TIERS[tierKey];

  const amountCents =
    opts?.customAmountCents && opts.customAmountCents >= 100
      ? Math.round(opts.customAmountCents)
      : opts?.offerTier
        ? tier.setupAmountCents
        : Number(env.STRIPE_AMOUNT_CENTS || tier.setupAmountCents);

  const productName = opts?.customProductName?.trim()
    ? `${opts.customProductName.trim()} – ${company}`
    : opts?.offerTier
      ? `${tier.productName} – ${company}`
      : `${env.STRIPE_PRODUCT_NAME ?? "Création de site web"} – ${company}`;

  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${base}/demos/${leadId}`,
    cancel_url: `${base}/demos/${leadId}`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": productName,
    "metadata[lead_id]": leadId,
    "metadata[offer_tier]": tierKey,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const data = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) throw new Error(data.error?.message ?? `Stripe HTTP ${res.status}`);
  return data.url;
}
