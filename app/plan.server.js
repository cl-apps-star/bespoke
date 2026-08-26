import prisma from "./db.server";
import { getPlanTier, isPaidPlan, limitForTier } from "./planLogic";

export { getPlanTier, isPaidPlan };

function isSameCalendarMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// How many commissions has this shop received in the current calendar
// month, and what's their limit? Resets lazily (no cron job needed) — the
// moment we notice the stored period has rolled into a new month, we reset
// the counter and persist that reset immediately. Applies to free AND
// Studio (both are capped); Atelier is unlimited so its limit is just
// reported as Infinity without needing the reset dance. Mirrors In the
// Making's getUsage() exactly.
export async function getUsage(shop, merchant) {
  const tier = getPlanTier(merchant);
  const limit = limitForTier(tier);

  if (tier === "atelier") {
    return { count: merchant?.commissionCountPeriod || 0, limit: Infinity };
  }

  const now = new Date();
  const periodStart = merchant?.commissionPeriodStart;
  const needsReset = !periodStart || !isSameCalendarMonth(new Date(periodStart), now);

  if (needsReset) {
    await prisma.merchantProfile.update({
      where: { shop },
      data: { commissionCountPeriod: 0, commissionPeriodStart: now },
    });
    return { count: 0, limit };
  }

  return { count: merchant?.commissionCountPeriod || 0, limit };
}

// Checks whether a shop may accept another commission enquiry this month
// and, if so, reserves the slot by incrementing the counter. Atelier shops
// always pass through untouched. Called from createEnquiry() — the public
// enquiry form is the only place new commissions come from, so this is the
// single real enforcement point.
export async function reserveCommissionSlot(shop, merchant) {
  const tier = getPlanTier(merchant);
  if (tier === "atelier") {
    return { allowed: true };
  }

  const { count, limit } = await getUsage(shop, merchant);
  if (count >= limit) {
    const plural = limit === 1 ? "" : "s";
    return {
      allowed: false,
      reason:
        tier === "studio"
          ? `This studio has reached its ${limit} commission${plural} for this month. Please check back soon, or contact them directly if it's urgent.`
          : `This studio has reached its ${limit} free commission${plural} for this month. Please check back soon, or contact them directly if it's urgent.`,
    };
  }

  await prisma.merchantProfile.update({
    where: { shop },
    data: { commissionCountPeriod: count + 1 },
  });

  return { allowed: true, remaining: limit - (count + 1) };
}

// For the Billing page and the dashboard usage banner.
export async function getPlanSummary(shop) {
  const merchant = await prisma.merchantProfile.findUnique({ where: { shop } });
  const tier = getPlanTier(merchant);

  if (tier === "atelier") {
    return { plan: "atelier", status: merchant?.planStatus || "active" };
  }

  const { count, limit } = await getUsage(shop, merchant);
  return {
    plan: tier, // "free" or "studio"
    status: merchant?.planStatus || null,
    count,
    limit,
    remaining: Math.max(0, limit - count),
  };
}
