import prisma from "./db.server";
import { nextStage, isTerminal } from "./bespoke-stages";

// ---- Merchant profile / branding ------------------------------------

export async function getOrCreateMerchantProfile(shop) {
  let profile = await prisma.merchantProfile.findUnique({ where: { shop } });
  if (!profile) {
    profile = await prisma.merchantProfile.create({ data: { shop } });
  }
  return profile;
}

export async function getMerchantProfileByShop(shop) {
  return prisma.merchantProfile.findUnique({ where: { shop } });
}

export async function updateMerchantProfile(shop, data) {
  return prisma.merchantProfile.update({
    where: { shop },
    data,
  });
}

// ---- Enquiries (public submission) -----------------------------------

export async function createEnquiry(merchantId, input) {
  const commission = await prisma.commission.create({
    data: {
      merchantId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      title: input.title,
      description: input.description ?? null,
      budget: input.budget ?? null,
      deadline: input.deadline ? new Date(input.deadline) : null,
      dimensions: input.dimensions ?? null,
      materials: input.materials ?? null,
      quantity: input.quantity ? Number(input.quantity) : 1,
      engravingText: input.engravingText ?? null,
      deliveryLocation: input.deliveryLocation ?? null,
      referenceFiles: input.referenceFiles ? JSON.stringify(input.referenceFiles) : null,
      status: "enquiry_received",
    },
  });

  await prisma.commissionUpdate.create({
    data: {
      commissionId: commission.id,
      status: "enquiry_received",
      note: "Enquiry submitted.",
      visibleToCustomer: true,
    },
  });

  return commission;
}

// ---- Reads --------------------------------------------------------------

export async function getCommissionByToken(token) {
  return prisma.commission.findUnique({
    where: { token },
    include: {
      updates: { orderBy: { createdAt: "asc" } },
      files: { orderBy: { createdAt: "asc" } },
      changes: { orderBy: { createdAt: "desc" } },
      merchant: true,
    },
  });
}

export async function getCommissionById(id, merchantId) {
  return prisma.commission.findFirst({
    where: { id, merchantId },
    include: {
      updates: { orderBy: { createdAt: "asc" } },
      files: { orderBy: { createdAt: "asc" } },
      changes: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function listCommissionsForMerchant(merchantId, { statusIn } = {}) {
  return prisma.commission.findMany({
    where: {
      merchantId,
      ...(statusIn ? { status: { in: statusIn } } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
}

// ---- Timeline helper -----------------------------------------------------

async function addUpdate(commissionId, { status, note, media, notifyCustomer = false } = {}) {
  return prisma.commissionUpdate.create({
    data: {
      commissionId,
      status: status ?? null,
      note: note ?? null,
      media: media ? JSON.stringify(media) : null,
      visibleToCustomer: true,
      customerNotified: notifyCustomer,
    },
  });
}

export async function addInternalNote(commissionId, note) {
  return prisma.commissionUpdate.create({
    data: { commissionId, note, visibleToCustomer: false, customerNotified: false },
  });
}

// ---- Qualification --------------------------------------------------

export async function qualifyEnquiry(commissionId, action, { note } = {}) {
  // action: "accept" | "decline" | "request_info" | "archive"
  const statusMap = {
    accept: "under_review",
    decline: "declined",
    request_info: "under_review",
    archive: "declined",
  };
  const status = statusMap[action];
  if (!status) throw new Error("Unknown qualification action");

  const updated = await prisma.commission.update({
    where: { id: commissionId },
    data: { status },
  });
  await addUpdate(commissionId, {
    status,
    note: note ?? `Enquiry ${action.replace("_", " ")}.`,
    notifyCustomer: false,
  });
  return updated;
}

export async function setPriority(commissionId, priority) {
  return prisma.commission.update({ where: { id: commissionId }, data: { priority } });
}

export async function assignTeamMember(commissionId, assignedTo) {
  return prisma.commission.update({ where: { id: commissionId }, data: { assignedTo } });
}

// ---- Proposal builder -------------------------------------------------

export async function saveAndSendProposal(commissionId, input) {
  const price = Number(input.price) || 0;
  let depositAmount = 0;
  if (input.depositType === "fixed") {
    depositAmount = Number(input.depositValue) || 0;
  } else if (input.depositType === "percentage") {
    depositAmount = Math.round(price * ((Number(input.depositValue) || 0) / 100) * 100) / 100;
  } else if (input.depositType === "full") {
    depositAmount = price;
  }
  const balanceAmount = Math.max(0, Math.round((price - depositAmount) * 100) / 100);

  const current = await prisma.commission.findUnique({ where: { id: commissionId } });

  const updated = await prisma.commission.update({
    where: { id: commissionId },
    data: {
      proposalTitle: input.proposalTitle ?? null,
      proposalSummary: input.proposalSummary ?? null,
      proposedProduct: input.proposedProduct ?? null,
      proposalMaterials: input.proposalMaterials ?? null,
      proposalDimensions: input.proposalDimensions ?? null,
      includedRevisions: input.includedRevisions != null ? Number(input.includedRevisions) : 2,
      exclusions: input.exclusions ?? null,
      estimatedSchedule: input.estimatedSchedule ?? null,
      price,
      currency: input.currency || "GBP",
      depositType: input.depositType ?? null,
      depositValue: input.depositValue != null ? Number(input.depositValue) : null,
      depositAmount,
      balanceAmount,
      paymentScheduleNote: input.paymentScheduleNote ?? null,
      terms: input.terms ?? null,
      proposalImages: input.proposalImages ? JSON.stringify(input.proposalImages) : null,
      proposalVersion: (current?.proposalVersion ?? 0) + 1,
      proposalSentAt: new Date(),
      status: "proposal_sent",
      maxRevisions: input.includedRevisions != null ? Number(input.includedRevisions) : current?.maxRevisions,
    },
  });

  await addUpdate(commissionId, {
    status: "proposal_sent",
    note: `Proposal v${updated.proposalVersion} sent — ${updated.currency} ${price.toFixed(2)}.`,
    notifyCustomer: true,
  });

  return updated;
}

// ---- Quote approval (customer-facing) ----------------------------------

export async function acceptTerms(commissionId) {
  const updated = await prisma.commission.update({
    where: { id: commissionId },
    data: { status: "terms_accepted", termsAcceptedAt: new Date() },
  });
  await addUpdate(commissionId, {
    status: "terms_accepted",
    note: "Customer accepted the proposal and terms.",
    notifyCustomer: false,
  });
  return updated;
}

export async function declineQuote(commissionId) {
  const updated = await prisma.commission.update({
    where: { id: commissionId },
    data: { status: "declined", quoteDeclinedAt: new Date() },
  });
  await addUpdate(commissionId, {
    status: "declined",
    note: "Customer declined the proposal.",
    notifyCustomer: false,
  });
  return updated;
}

// ---- Payment status (actual draft-order creation lives in bespoke-payment.server.js) --

export async function markDepositPaid(commissionId, draftOrderId) {
  const updated = await prisma.commission.update({
    where: { id: commissionId },
    data: {
      depositStatus: "paid",
      status: "deposit_paid",
      balanceStatus: "due",
      ...(draftOrderId ? { depositDraftOrderId: draftOrderId } : {}),
    },
  });
  await addUpdate(commissionId, {
    status: "deposit_paid",
    note: "Deposit received — work can begin.",
    notifyCustomer: false,
  });
  return updated;
}

export async function markBalancePaid(commissionId, draftOrderId) {
  const updated = await prisma.commission.update({
    where: { id: commissionId },
    data: {
      balanceStatus: "paid",
      ...(draftOrderId ? { balanceDraftOrderId: draftOrderId } : {}),
    },
  });
  await addUpdate(commissionId, {
    note: "Final balance received.",
    notifyCustomer: false,
  });
  return updated;
}

// ---- Proof & revisions -------------------------------------------------

export async function uploadProof(commissionId, { url, label, uploadedBy = "merchant" }) {
  const file = await prisma.commissionFile.create({
    data: {
      commissionId,
      type: "proof",
      url,
      label: label ?? null,
      uploadedBy,
      approvalStatus: "pending",
    },
  });
  await prisma.commission.update({ where: { id: commissionId }, data: { status: "in_progress" } });
  await addUpdate(commissionId, {
    status: "in_progress",
    note: "New proof uploaded for review.",
    notifyCustomer: true,
  });
  return file;
}

export async function customerApproveProof(fileId) {
  const file = await prisma.commissionFile.update({
    where: { id: fileId },
    data: { approvalStatus: "approved" },
  });
  const updated = await prisma.commission.update({
    where: { id: file.commissionId },
    data: { status: "final_approved", finalApprovedAt: new Date() },
  });
  await addUpdate(file.commissionId, {
    status: "final_approved",
    note: "Customer approved the final proof.",
    notifyCustomer: false,
  });
  return updated;
}

export async function customerRequestRevision(fileId, note) {
  const file = await prisma.commissionFile.update({
    where: { id: fileId },
    data: { approvalStatus: "revision_requested", approvalNote: note ?? null },
  });
  const commission = await prisma.commission.findUnique({ where: { id: file.commissionId } });
  const updated = await prisma.commission.update({
    where: { id: file.commissionId },
    data: { revisionCount: (commission?.revisionCount ?? 0) + 1 },
  });
  await addUpdate(file.commissionId, {
    note: `Customer requested a revision${note ? `: ${note}` : "."}`,
    notifyCustomer: false,
  });
  return updated;
}

// ---- Change requests ----------------------------------------------------

export async function createChangeRequest(commissionId, { requestedBy, type, description }) {
  const cr = await prisma.changeRequest.create({
    data: { commissionId, requestedBy, type, description },
  });
  await addUpdate(commissionId, {
    note: `Change requested (${type.replace("_", " ")}) by ${requestedBy}.`,
    notifyCustomer: requestedBy === "merchant",
  });
  return cr;
}

export async function resolveChangeRequest(id, { accept, additionalCharge, deadlineAdjustmentDays }) {
  const cr = await prisma.changeRequest.update({
    where: { id },
    data: {
      status: accept ? "accepted" : "rejected",
      additionalCharge: additionalCharge != null ? Number(additionalCharge) : null,
      deadlineAdjustmentDays: deadlineAdjustmentDays != null ? Number(deadlineAdjustmentDays) : null,
      resolvedAt: new Date(),
    },
  });

  if (accept && additionalCharge) {
    const commission = await prisma.commission.findUnique({ where: { id: cr.commissionId } });
    await prisma.commission.update({
      where: { id: cr.commissionId },
      data: { balanceAmount: (commission?.balanceAmount ?? 0) + Number(additionalCharge) },
    });
  }

  await addUpdate(cr.commissionId, {
    note: `Change request ${accept ? "accepted" : "declined"}${additionalCharge ? ` — additional charge ${additionalCharge}` : ""}.`,
    notifyCustomer: true,
  });

  return cr;
}

// ---- Lock specification (hand-off point to Making) -----------------------

export async function lockSpecification(commissionId) {
  const updated = await prisma.commission.update({
    where: { id: commissionId },
    data: { status: "locked", lockedAt: new Date() },
  });
  await addUpdate(commissionId, {
    status: "locked",
    note: "Final specification locked — ready to move into production.",
    notifyCustomer: true,
  });
  return updated;
}

export function commissionIsAtFinalStage(commission) {
  return isTerminal(commission.status);
}

export { nextStage };
