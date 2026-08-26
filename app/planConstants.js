// Plain constants only — no database imports here. Files ending in
// `.server.js` are stripped out of the browser bundle by React Router, so
// anything a page needs to *display* (not just check server-side) has to
// live in a plain file like this one instead of a `.server.js` file.
// Mirrors In the Making's planConstants.js in shape/mechanics — see that
// file for the fuller comments this one omits.

export const FREE_COMMISSION_LIMIT = 3;

// Plan names as registered with Shopify billing — plain strings, so they
// belong here rather than in shopify.server.js. Named "Studio"/"Atelier" to
// match Digital Unboxing & COA Kit's live tier names for suite consistency.
//
// Pricing decided 2026-08-26 (see "Bespoke — pricing research resolved"
// project doc) — deliberately NOT volume-metered the way COA Kit/In the
// Making are. Those apps fire on every order or every production run, so a
// monthly count is a real usage lever. Bespoke only fires on actual custom
// commission requests, which for most makers is a low-frequency thing, not
// a per-order thing — so a volume cap rarely bites and doesn't drive
// upgrades on its own. Checked the real category comparables instead
// (HoneyBook, Dubsado — proposal/deposit workflow tools for creative
// businesses): both give UNLIMITED clients/projects on every tier,
// including their cheapest, and gate purely on capability (branding
// removal, automations, team seats). Bespoke follows that shape: the free
// tier keeps a real cap (every comparable tool caps *something* at the
// free edge), but the paid tiers sell branding removal and higher/no caps
// rather than "more commissions" as the main pitch, since real bespoke
// volume for most merchants won't come close to any of these caps anyway.
//
// Price points: entry ($25) sits alongside HoneyBook/Dubsado's actual
// entry prices (~$28-29) — fair, since Bespoke is narrower and Shopify-
// embedded (lower switching cost) than a full freelance-business CRM.
// Ceiling ($49) is deliberately lower than those tools' top tiers ($109,
// $525/yr) for the same reason, and lower than quote-app O:Request's
// $96.99 top tier too — but that comparison was never a fair one at the
// top end; O:Request has no proposal builder, deposit/balance split, or
// proof-revision cycle at any price.
export const STUDIO_PLAN = "Studio plan";
export const ATELIER_PLAN = "Atelier plan";

export const STUDIO_PLAN_PRICE = 25; // USD/month
export const STUDIO_COMMISSION_LIMIT = 25;

export const ATELIER_PLAN_PRICE = 49; // USD/month
// Atelier has no monthly cap — unlimited commissions.

// No trialDays on the paid plans — the 3 free commissions a month already
// serve as the trial, same reasoning as Reveal's Studio/Atelier and In the
// Making's Starter/Growth.
