import { authenticate, unauthenticated } from "../shopify.server";
import { STUDIO_PLAN, ATELIER_PLAN } from "../planConstants";
import prisma from "../db.server";

// Ask Shopify directly which subscriptions are currently ACTIVE for this
// shop and return the effective plan tier. We deliberately never infer the
// tier from a single webhook payload: an app_subscriptions/update webhook
// fires for ONE subscription and says nothing about the others. A merchant
// on Studio who starts — then declines — an Atelier upgrade generates a
// DECLINED webhook for the *Atelier* attempt, but their Studio subscription
// is still ACTIVE and they must stay on Studio. Trusting the payload's
// status blindly is exactly the bug that got Digital Unboxing & COA Kit
// rejected — mirrors In the Making's webhook handler.
async function resolveActivePlan(shop) {
  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(
    `#graphql
    query ActiveSubscriptions {
      currentAppInstallation {
        activeSubscriptions {
          name
          status
        }
      }
    }`,
  );
  const body = await response.json();
  const active = body?.data?.currentAppInstallation?.activeSubscriptions || [];
  const activeNames = active
    .filter((s) => (s?.status || "").toUpperCase() === "ACTIVE")
    .map((s) => s?.name);

  if (activeNames.includes(ATELIER_PLAN)) return "atelier";
  if (activeNames.includes(STUDIO_PLAN)) return "studio";
  return "free";
}

// Keeps our stored plan in sync when a subscription changes on Shopify's
// side (the merchant cancels/upgrades/downgrades from Shopify's own billing
// settings, a charge is declined, or Shopify expires/freezes it) rather
// than through our own in-app buttons.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const merchant = await prisma.merchantProfile.findUnique({ where: { shop } });
  if (!merchant) {
    return new Response();
  }

  let tier;
  try {
    tier = await resolveActivePlan(shop);
  } catch (error) {
    console.error(
      "[BILLING WEBHOOK] Could not resolve active subscriptions, leaving stored plan untouched:",
      error,
    );
    // If we can't verify with Shopify, the ONLY safe unilateral move is to
    // promote to active when the payload itself reports ACTIVE. We never
    // downgrade to free on an unverified status.
    const subscription = payload?.app_subscription || payload?.appSubscription;
    const status = (subscription?.status || "").toUpperCase();
    if (status === "ACTIVE") {
      const plan = subscription?.name === ATELIER_PLAN ? "atelier" : "studio";
      await prisma.merchantProfile.update({
        where: { shop },
        data: {
          plan,
          planStatus: "active",
          shopifyChargeId: subscription?.admin_graphql_api_id || merchant.shopifyChargeId,
        },
      });
    }
    return new Response();
  }

  if (tier === "free") {
    await prisma.merchantProfile.update({
      where: { shop },
      data: { plan: "free", planStatus: null, shopifyChargeId: null },
    });
  } else {
    await prisma.merchantProfile.update({
      where: { shop },
      data: { plan: tier, planStatus: "active" },
    });
  }

  return new Response();
};
