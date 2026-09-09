import { sendTransactionalEmail } from "./emailProviders.server";
import { stageLabel } from "./bespoke-stages";

// Keep customer mail on the suite-wide transactional identity. Replies still
// route to the merchant's support address (or the CL Apps fallback) below.
const FALLBACK_REPLY_TO = "hello@cl-apps.net";


function serviceSenderName(value) {
  const source = String(value || "CL Apps").replace(/[<>"\r\n]/g, "").trim() || "CL Apps";
  if (source.toLowerCase() === "cl apps") return "CL Apps";
  if (source.toLowerCase().includes(" via cl apps")) return source;
  return `${source} via CL Apps`;
}

function brandBlock(merchant) {
  const name = merchant?.brandName || "Our studio";
  const accent = merchant?.accentColor || "#8a7758";
  return { name, accent, logoUrl: merchant?.logoUrl || null };
}

function stripTags(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trustLineFor(merchant) {
  const brand = brandBlock(merchant);
  return `Sent by ${brand.name} through CL Apps because this message relates to your commission request. Reply to this email for help with this commission.`;
}

function fromAddress(merchant) {
  const brand = brandBlock(merchant);
  return `${serviceSenderName(brand.name)} <updates@notify.cl-apps.net>`;
}

function baseTemplate({ merchant, title, bodyHtml, ctaLabel, ctaUrl }) {
  const brand = brandBlock(merchant);
  const trustLine = trustLineFor(merchant);
  const html = `
  <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color:#1a1a1a;">
    ${brand.logoUrl ? `<img src="${brand.logoUrl}" alt="${brand.name}" style="max-height:48px;margin-bottom:24px;" />` : `<div style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:${brand.accent};margin-bottom:24px;">${brand.name}</div>`}
    <h1 style="font-size:20px;font-weight:normal;margin-bottom:16px;">${title}</h1>
    <div style="font-size:15px;line-height:1.6;color:#333;">${bodyHtml}</div>
    ${ctaUrl ? `<div style="margin-top:28px;"><a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;background:${brand.accent};color:#fff;text-decoration:none;font-size:14px;">${ctaLabel || "View commission"}</a></div>` : ""}
    <div style="margin-top:40px;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#999;">${trustLine}</div>
  </div>`;
  const text = [
    brand.name.toUpperCase(),
    "",
    title,
    "",
    stripTags(bodyHtml),
    ctaUrl ? ["", `${ctaLabel || "View commission"}:`, ctaUrl] : [],
    "",
    trustLine,
  ].flat().join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { html, text };
}

async function send({ to, subject, html, text, merchant, context }) {
  return sendTransactionalEmail({
    from: fromAddress(merchant),
    to,
    replyTo: merchant?.supportEmail || FALLBACK_REPLY_TO,
    subject,
    html,
    text,
    context,
  });
}

export async function sendEnquiryReceivedEmail({ commission, merchant, projectUrl }) {
  const { html, text } = baseTemplate({
    merchant,
    title: `We've received your enquiry`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>Thanks for telling us about <strong>${commission.title}</strong>. We'll review the details and be in touch shortly with next steps.</p>`,
    ctaLabel: "View your enquiry",
    ctaUrl: projectUrl,
  });
  const brand = brandBlock(merchant);
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendEnquiryReceivedEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `${brand.name}: we've received your enquiry`, html, text, merchant });
}

export async function sendProposalEmail({ commission, merchant, projectUrl }) {
  const price = commission.price != null ? `${commission.currency} ${commission.price.toFixed(2)}` : "";
  const deposit = commission.depositAmount != null ? `${commission.currency} ${commission.depositAmount.toFixed(2)}` : "";
  const { html, text } = baseTemplate({
    merchant,
    title: `Your proposal is ready`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>We've put together a proposal for <strong>${commission.proposalTitle || commission.title}</strong>${price ? `: <strong>${price}</strong>` : ""}.</p>${deposit ? `<p>A deposit of <strong>${deposit}</strong> is required to begin.</p>` : ""}<p>Review the full details and accept the terms below.</p>`,
    ctaLabel: "Review your proposal",
    ctaUrl: projectUrl,
  });
  const brand = brandBlock(merchant);
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendProposalEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `${brand.name}: your proposal is ready`, html, text, merchant });
}

export async function sendDepositLinkEmail({ commission, merchant, projectUrl }) {
  const { html, text } = baseTemplate({
    merchant,
    title: `Ready for your deposit`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>Thanks for accepting the proposal for <strong>${commission.proposalTitle || commission.title}</strong>. Pay your deposit to get started.</p>`,
    ctaLabel: "Pay your deposit",
    ctaUrl: projectUrl,
  });
  const brand = brandBlock(merchant);
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendDepositLinkEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `${brand.name}: ready for your deposit`, html, text, merchant });
}

export async function sendProofReadyEmail({ commission, merchant, projectUrl }) {
  const { html, text } = baseTemplate({
    merchant,
    title: `A proof is ready for your review`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>We've uploaded a proof for <strong>${commission.proposalTitle || commission.title}</strong>. Take a look and approve it or request a revision.</p>`,
    ctaLabel: "Review the proof",
    ctaUrl: projectUrl,
  });
  const brand = brandBlock(merchant);
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendProofReadyEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `${brand.name}: a proof is ready for review`, html, text, merchant });
}

export async function sendStageUpdateEmail({ commission, merchant, projectUrl, note }) {
  const label = stageLabel(commission.status);
  const { html, text } = baseTemplate({
    merchant,
    title: `Update: ${label}`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>Your commission <strong>${commission.proposalTitle || commission.title}</strong> has moved to: <strong>${label}</strong>.</p>${note ? `<p>${note}</p>` : ""}`,
    ctaLabel: "View progress",
    ctaUrl: projectUrl,
  });
  const brand = brandBlock(merchant);
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendStageUpdateEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `${brand.name}: commission update`, html, text, merchant });
}

export async function sendChangeRequestResolvedEmail({ commission, merchant, projectUrl, accepted, additionalCharge }) {
  const { html, text } = baseTemplate({
    merchant,
    title: accepted ? `Change request accepted` : `Change request declined`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p>Your requested change to <strong>${commission.proposalTitle || commission.title}</strong> has been ${accepted ? "accepted" : "declined"}.</p>${additionalCharge ? `<p>An additional charge of <strong>${commission.currency} ${additionalCharge.toFixed(2)}</strong> applies and will be added to your final balance.</p>` : ""}`,
    ctaLabel: "View commission",
    ctaUrl: projectUrl,
  });
  const brand = brandBlock(merchant);
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendChangeRequestResolvedEmail", resourceId: commission.id }, to: commission.customerEmail, subject: accepted ? `${brand.name}: change request accepted` : `${brand.name}: change request declined`, html, text, merchant });
}

export async function sendLockedEmail({ commission, merchant, projectUrl }) {
  const { html, text } = baseTemplate({
    merchant,
    title: `Your specification is locked in`,
    bodyHtml: `<p>Hi ${commission.customerName},</p><p><strong>${commission.proposalTitle || commission.title}</strong> is now fully agreed and moving into production. We'll keep you posted as work begins.</p>`,
    ctaLabel: "View commission",
    ctaUrl: projectUrl,
  });
  const brand = brandBlock(merchant);
  return send({ context: { shop: commission.shop || merchant?.shop, kind: "sendLockedEmail", resourceId: commission.id }, to: commission.customerEmail, subject: `${brand.name}: your specification is locked in`, html, text, merchant });
}
