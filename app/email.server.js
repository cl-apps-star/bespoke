import { sendTransactionalEmail } from "./emailProviders.server";
import { stageLabel } from "./bespoke-stages";

// Same domain / provider as the rest of the suite — keep sender addresses
// distinct per app so replies route sensibly.
// Reveal:        certificates@cl-apps.net
// In the Making: updates@cl-apps.net
// Care:          care@cl-apps.net
// Bespoke:       commissions@cl-apps.net
const FROM_ADDRESS = "Bespoke <commissions@cl-apps.net>";


function brandBlock(merchant) {
  const name = merchant?.brandName || "Our studio";
  const accent = merchant?.accentColor || "#8a7758";
  return { name, accent, logoUrl: merchant?.logoUrl || null };
}

function baseTemplate({ merchant, title, bodyHtml, ctaLabel, ctaUrl }) {
  const brand = brandBlock(merchant);
  return `
  <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color:#1a1a1a;">
    ${brand.logoUrl ? `<img src="${brand.logoUrl}" alt="${brand.name}" style="max-height:48px;margin-bottom:24px;" />` : `<div style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:${brand.accent};margin-bottom:24px;">${brand.name}</div>`}
    <h1 style="font-size:20px;font-weight:normal;margin-bottom:16px;">${title}</h1>
    <div style="font-size:15px;line-height:1.6;color:#333;">${bodyHtml}</div>
    ${ctaUrl ? `<div style="margin-top:28px;"><a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;background:${brand.accent};color:#fff;text-decoration:none;font-size:14px;">${ctaLabel || "View commission"}</a></div>` : ""}
    <div style="margin-top:40px;font-size:12px;color:#999;">Sent by ${brand.name} via Bespoke.</div>
  </div>`;
}

async function send({ to, subject, html, context }) {
  return sendTransactionalEmail({ from: FROM_ADDRESS, to, subject, html, context });
}

export async function sendEnquiryReceivedEmail({ commission, merchant, projectUrl }) {
  const html = baseTemplate({
    merchant,
    title: `We've received your enquiry`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>Thanks for telling us about <strong>${commission.title}</strong>. We'll review the details and be in touch shortly with next steps.</p>`,
    ctaLabel: "View your enquiry",
    ctaUrl: projectUrl,
  });
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendEnquiryReceivedEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `We've received your enquiry`, html });
}

export async function sendProposalEmail({ commission, merchant, projectUrl }) {
  const price = commission.price != null ? `${commission.currency} ${commission.price.toFixed(2)}` : "";
  const deposit = commission.depositAmount != null ? `${commission.currency} ${commission.depositAmount.toFixed(2)}` : "";
  const html = baseTemplate({
    merchant,
    title: `Your proposal is ready`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>We've put together a proposal for <strong>${commission.proposalTitle || commission.title}</strong>${price ? `: <strong>${price}</strong>` : ""}.</p>${deposit ? `<p>A deposit of <strong>${deposit}</strong> is required to begin.</p>` : ""}<p>Review the full details and accept the terms below.</p>`,
    ctaLabel: "Review your proposal",
    ctaUrl: projectUrl,
  });
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendProposalEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `Your proposal is ready`, html });
}

export async function sendDepositLinkEmail({ commission, merchant, projectUrl }) {
  const html = baseTemplate({
    merchant,
    title: `Ready for your deposit`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>Thanks for accepting the proposal for <strong>${commission.proposalTitle || commission.title}</strong>. Pay your deposit to get started.</p>`,
    ctaLabel: "Pay your deposit",
    ctaUrl: projectUrl,
  });
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendDepositLinkEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `Ready for your deposit`, html });
}

export async function sendProofReadyEmail({ commission, merchant, projectUrl }) {
  const html = baseTemplate({
    merchant,
    title: `A proof is ready for your review`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>We've uploaded a proof for <strong>${commission.proposalTitle || commission.title}</strong>. Take a look and approve it or request a revision.</p>`,
    ctaLabel: "Review the proof",
    ctaUrl: projectUrl,
  });
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendProofReadyEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `A proof is ready for your review`, html });
}

export async function sendStageUpdateEmail({ commission, merchant, projectUrl, note }) {
  const label = stageLabel(commission.status);
  const html = baseTemplate({
    merchant,
    title: `Update: ${label}`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>Your commission <strong>${commission.proposalTitle || commission.title}</strong> has moved to: <strong>${label}</strong>.</p>${note ? `<p>${note}</p>` : ""}`,
    ctaLabel: "View progress",
    ctaUrl: projectUrl,
  });
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendStageUpdateEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `Update on your commission: ${label}`, html });
}

export async function sendChangeRequestResolvedEmail({ commission, merchant, projectUrl, accepted, additionalCharge }) {
  const html = baseTemplate({
    merchant,
    title: accepted ? `Change request accepted` : `Change request declined`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>Your requested change to <strong>${commission.proposalTitle || commission.title}</strong> has been ${accepted ? "accepted" : "declined"}.</p>${additionalCharge ? `<p>An additional charge of <strong>${commission.currency} ${additionalCharge.toFixed(2)}</strong> applies and will be added to your final balance.</p>` : ""}`,
    ctaLabel: "View commission",
    ctaUrl: projectUrl,
  });
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendChangeRequestResolvedEmail", resourceId: commission.id }, to: commission.customerEmail, subject: accepted ? `Change request accepted` : `Change request declined`, html });
}

export async function sendLockedEmail({ commission, merchant, projectUrl }) {
  const html = baseTemplate({
    merchant,
    title: `Your specification is locked in`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p><strong>${commission.proposalTitle || commission.title}</strong> is now fully agreed and moving into production. We'll keep you posted as work begins.</p>`,
    ctaLabel: "View commission",
    ctaUrl: projectUrl,
  });
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendLockedEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `Your specification is locked in`, html });
}
