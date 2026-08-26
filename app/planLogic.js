// Plain, client-safe plan logic — no database import, so components
// rendered on the client (e.g. the customer-facing commission page) can
// check the plan tier without pulling in a `.server.js` file. Mirrors In
// the Making's planLogic.js exactly.
import { FREE_COMMISSION_LIMIT, STUDIO_COMMISSION_LIMIT } from "./planConstants";

// merchant.plan holds one of: "free" | "studio" | "atelier".
export function getPlanTier(merchant) {
  if (merchant?.planStatus !== "active") return "free";
  if (merchant?.plan === "studio") return "studio";
  if (merchant?.plan === "atelier") return "atelier";
  return "free";
}

// White-labelling (no CL Apps mention on public pages) is unlocked on both
// paid tiers. Mirrors Reveal and In the Making, where branding unlocks at
// the entry paid tier and only the free tier is stock-styled.
export function isPaidPlan(merchant) {
  const tier = getPlanTier(merchant);
  return tier === "studio" || tier === "atelier";
}

// Monthly commission limit for a given tier. Atelier is unlimited
// (Infinity), free and Studio are capped.
export function limitForTier(tier) {
  if (tier === "atelier") return Infinity;
  if (tier === "studio") return STUDIO_COMMISSION_LIMIT;
  return FREE_COMMISSION_LIMIT;
}
