import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPlanSummary } from "../plan.server";
import {
  FREE_COMMISSION_LIMIT,
  STUDIO_PLAN,
  STUDIO_PLAN_PRICE,
  STUDIO_COMMISSION_LIMIT,
  ATELIER_PLAN,
  ATELIER_PLAN_PRICE,
} from "../planConstants";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);

  const check = await billing.check({ plans: [STUDIO_PLAN, ATELIER_PLAN] });
  const planSummary = await getPlanSummary(session.shop);

  return {
    hasActivePayment: check.hasActivePayment,
    planSummary,
  };
};

export const action = async ({ request }) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Start (or switch to) a paid plan. Driven by fetcher.submit from an
  // s-button onClick — the mechanism proven to actually work in this
  // embedded context (see In the Making's billing fix, 2026-07-23):
  // React Router's <Link>/navigate() silently does nothing inside App
  // Bridge's embedded iframe, so the upgrade is initiated with a fetcher
  // POST instead of a client-side route change. billing.request() throws
  // a redirect Response carrying Shopify's confirmation URL; we catch it
  // and hand the URL back to the client to break out of the iframe with.
  if (intent === "upgrade") {
    const requestedPlan = formData.get("plan") === "atelier" ? ATELIER_PLAN : STUDIO_PLAN;

    // Development stores can't process a real charge, so request a test
    // charge for them — detected per-shop, never hardcoded.
    let isTestShop = false;
    try {
      const planResponse = await admin.graphql(
        `#graphql
        query ShopPlanForBilling {
          shop {
            plan {
              partnerDevelopment
            }
          }
        }`,
      );
      const planData = await planResponse.json();
      isTestShop = planData?.data?.shop?.plan?.partnerDevelopment === true;
    } catch (planCheckError) {
      console.error("[BILLING] Could not determine shop plan, defaulting to a real charge:", planCheckError);
      isTestShop = false;
    }

    // The return trip from Shopify's approval page must land back inside
    // the embedded admin wrapper, not our raw Railway URL directly.
    const returnUrl = `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/billing/callback`;

    try {
      await billing.request({
        plan: requestedPlan,
        returnUrl,
        isTest: isTestShop,
      });
      return {
        error:
          "Shopify didn't return a confirmation link for your plan change. Please try again — if it keeps happening, contact support.",
      };
    } catch (error) {
      if (error instanceof Response) {
        const confirmationUrl = error.headers.get("location");
        if (confirmationUrl) {
          return { confirmationUrl };
        }
        throw error;
      }
      console.error("[BILLING] billing.request() failed:", error);
      return {
        error: "Something went wrong starting your plan change. Please try again — if it keeps happening, contact support.",
      };
    }
  }

  if (intent === "cancel") {
    const merchant = await prisma.merchantProfile.findUnique({ where: { shop: session.shop } });

    if (merchant?.shopifyChargeId) {
      await billing.cancel({
        subscriptionId: merchant.shopifyChargeId,
        prorate: true,
      });
    }

    // Free and Studio have separate monthly allowances, so a high count
    // run up under a paid plan shouldn't strand the shop over the free
    // limit for the rest of the month after cancelling.
    await prisma.merchantProfile.update({
      where: { shop: session.shop },
      data: {
        plan: "free",
        planStatus: null,
        shopifyChargeId: null,
        commissionCountPeriod: 0,
        commissionPeriodStart: new Date(),
      },
    });
  }

  const check = await billing.check({ plans: [STUDIO_PLAN, ATELIER_PLAN] });
  const planSummary = await getPlanSummary(session.shop);
  return {
    hasActivePayment: check.hasActivePayment,
    planSummary,
    cancelled: intent === "cancel",
  };
};

export default function BillingPage() {
  const { hasActivePayment, planSummary } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const data = fetcher.data || { hasActivePayment, planSummary };
  const isBusy = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    if (fetcher.data?.cancelled) {
      shopify.toast.show("Subscription cancelled — you're back on the free plan.");
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
    const url = fetcher.data?.confirmationUrl;
    if (url) {
      if (typeof shopify?.open === "function") {
        shopify.open(url, { target: "_top" });
      } else if (typeof window !== "undefined" && window.top) {
        window.top.location.href = url;
      }
    }
  }, [fetcher.data, shopify]);

  const cancel = () => fetcher.submit({ intent: "cancel" }, { method: "POST" });
  const startUpgrade = (planKey) => fetcher.submit({ intent: "upgrade", plan: planKey }, { method: "POST" });

  const currentPlan = data.planSummary?.plan || "free"; // "free" | "studio" | "atelier"

  // Every plan can be reached from every other plan, in either direction,
  // without contacting support or reinstalling (Shopify App Store
  // requirement 1.2.3).
  const PAID_PLANS = [
    {
      key: "studio",
      label: "Studio",
      price: STUDIO_PLAN_PRICE,
      rank: 1,
      blurb: `${STUDIO_COMMISSION_LIMIT} commissions a month, with your full branding and no CL Apps mention on your public pages.`,
    },
    {
      key: "atelier",
      label: "Atelier",
      price: ATELIER_PLAN_PRICE,
      rank: 2,
      blurb: "Unlimited commissions, the same full white-labelling, and priority support.",
    },
  ];
  const currentRank = { free: 0, studio: 1, atelier: 2 }[currentPlan] ?? 0;
  const otherPlans = PAID_PLANS.filter((p) => p.key !== currentPlan);

  return (
    <s-page heading="Billing">
      <s-section heading="Your plan">
        <s-stack direction="block" gap="base">
          <s-badge tone={currentPlan === "free" ? "neutral" : "success"}>
            {currentPlan === "atelier" ? "Atelier plan" : currentPlan === "studio" ? "Studio plan" : "Free plan"}
          </s-badge>

          {currentPlan === "atelier" && (
            <s-paragraph>
              Unlimited commissions with full white-labelling (no CL Apps mention on your public pages) and priority support.
            </s-paragraph>
          )}
          {currentPlan === "studio" && (
            <s-paragraph>
              {data.planSummary?.count ?? 0} of {STUDIO_COMMISSION_LIMIT} commissions used this month, with full white-labelling included.
            </s-paragraph>
          )}
          {currentPlan === "free" && (
            <s-paragraph>
              {data.planSummary?.count ?? 0} of {FREE_COMMISSION_LIMIT} free commissions used this month. Free plan is fully
              functional — your customer still gets the full enquiry-to-proposal-to-deposit experience — just with a small
              "Powered by CL Apps" mention.
            </s-paragraph>
          )}

          {currentPlan !== "free" && (
            <s-button variant="tertiary" tone="critical" onClick={cancel} {...(isBusy ? { loading: true } : {})}>
              Cancel subscription
            </s-button>
          )}
        </s-stack>
      </s-section>

      {otherPlans.length > 0 && (
        <s-section heading={currentPlan === "free" ? "Plans" : "Change plan"}>
          {currentPlan !== "free" && (
            <s-paragraph>
              Switch plans anytime — the change takes effect immediately and Shopify prorates your billing automatically. No
              need to cancel or reinstall.
            </s-paragraph>
          )}
          <s-stack direction="inline" gap="base" wrap="wrap">
            {otherPlans.map((p) => {
              const isUpgrade = p.rank > currentRank;
              const actionLabel = isUpgrade ? `Upgrade to ${p.label}` : `Switch to ${p.label}`;
              return (
                <s-box key={p.key} padding="base" borderWidth="base" borderRadius="base">
                  <s-stack direction="block" gap="tight">
                    <s-text fontWeight="medium">
                      {p.label} — ${p.price}/month
                    </s-text>
                    <s-text tone="subdued">{p.blurb}</s-text>
                    <s-button onClick={() => startUpgrade(p.key)} {...(isBusy ? { loading: true } : {})}>
                      {actionLabel}
                    </s-button>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>

          {data.confirmationUrl && (
            <s-box paddingBlockStart="base">
              <s-text tone="subdued">
                Taking you to Shopify to confirm…{" "}
                <a href={data.confirmationUrl} target="_top" rel="noreferrer" style={{ color: "#1a1a1a", fontWeight: 500 }}>
                  continue here →
                </a>
              </s-text>
            </s-box>
          )}
        </s-section>
      )}

      <s-section slot="aside" heading="Why this matters">
        <s-paragraph>
          The free plan is genuinely usable — every customer still gets a real proposal, deposit, and proof-review experience.
          Studio and Atelier are for studios that want their own branding throughout, with Atelier removing the monthly
          commission cap entirely.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
