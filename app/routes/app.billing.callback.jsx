import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { STUDIO_PLAN, ATELIER_PLAN } from "../planConstants";
import prisma from "../db.server";

// Shopify sends the merchant back here after they approve (or decline) the
// charge on Shopify's confirmation page. We re-check with Shopify directly
// (never trust the redirect alone) before marking the shop as paid — mirrors
// In the Making's app.billing.callback.jsx exactly.
export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);

  const check = await billing.check({ plans: [STUDIO_PLAN, ATELIER_PLAN] });

  if (check.hasActivePayment) {
    // A plan change (upgrade OR downgrade) can momentarily leave more than
    // one subscription in the list, so don't trust array order. Resolve the
    // tier by name — Atelier wins if it's present.
    const subs = check.appSubscriptions || [];
    const atelierSub = subs.find((s) => s?.name === ATELIER_PLAN);
    const subscription = atelierSub || subs[0];
    const plan = atelierSub ? "atelier" : "studio";

    // Reset the usage counter on a plan change — free/Studio/Atelier have
    // separate, unrelated monthly allowances, so commissions already
    // counted shouldn't eat into the new plan's allowance.
    await prisma.merchantProfile.update({
      where: { shop: session.shop },
      data: {
        plan,
        planStatus: "active",
        shopifyChargeId: subscription.id,
        commissionCountPeriod: 0,
        commissionPeriodStart: new Date(),
      },
    });

    return { status: "active", plan };
  }

  // Shopify reports no active paid subscription for this shop — reconcile
  // our record to free so a declined or cancelled charge can never leave a
  // stale paid state behind.
  await prisma.merchantProfile.updateMany({
    where: { shop: session.shop },
    data: { plan: "free", planStatus: null, shopifyChargeId: null },
  });

  return { status: "none", plan: "free" };
};

export default function BillingCallback() {
  const { status } = useLoaderData();
  const approved = status === "active";

  // Deliberately an s-link, NOT navigate()/<Link> — React Router's
  // client-side navigation does nothing in this embedded app, which would
  // strand the merchant on this screen. s-link (App Bridge nav) is the
  // proven way back into the admin, and it keeps the app embedded.
  return (
    <s-page heading={approved ? "Plan confirmed" : "No change made"}>
      <s-section>
        <s-stack direction="block" gap="base">
          <s-paragraph>
            {approved
              ? "Your plan change is confirmed — you're all set."
              : "No paid plan is active on your shop. If you meant to change plans, head back to Billing and try again."}
          </s-paragraph>
          <s-link href="/app/billing">
            <span
              style={{
                display: "inline-block",
                background: "#1a1a1a",
                color: "#ffffff",
                fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                padding: "10px 18px",
                borderRadius: 8,
              }}
            >
              Continue to Billing →
            </span>
          </s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
