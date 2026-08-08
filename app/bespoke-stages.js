// Plain (non-.server) module so client-rendered components can import the
// stage list without pulling in server-only code — same split pattern
// Care uses for app/care-stages.js and In the Making uses for app/stages.js.

export const STAGES = [
  { key: "enquiry_received", label: "Enquiry received" },
  { key: "under_review", label: "Under review" },
  { key: "proposal_sent", label: "Proposal sent" },
  { key: "terms_accepted", label: "Terms accepted" },
  { key: "deposit_paid", label: "Deposit paid" },
  { key: "in_progress", label: "In progress" },
  { key: "final_approved", label: "Final approved" },
  { key: "locked", label: "Locked — ready for production" },
];

// Terminal / negative status, reachable from under_review or proposal_sent
// if the merchant declines or the customer walks away.
export const DECLINED_STAGE = { key: "declined", label: "Declined" };

export function stageIndex(statusKey) {
  return STAGES.findIndex((s) => s.key === statusKey);
}

export function stageLabel(statusKey) {
  if (statusKey === DECLINED_STAGE.key) return DECLINED_STAGE.label;
  return STAGES.find((s) => s.key === statusKey)?.label ?? statusKey;
}

export function nextStage(statusKey) {
  const idx = stageIndex(statusKey);
  if (idx === -1 || idx === STAGES.length - 1) return null;
  return STAGES[idx + 1];
}

export function isTerminal(statusKey) {
  return statusKey === "locked" || statusKey === DECLINED_STAGE.key;
}

export const CHANGE_REQUEST_TYPES = [
  { key: "spec_change", label: "Specification change" },
  { key: "added_feature", label: "Added feature" },
  { key: "material_change", label: "Material change" },
  { key: "deadline_change", label: "Deadline change" },
  { key: "additional_revision", label: "Additional revision" },
];

export function changeRequestTypeLabel(key) {
  return CHANGE_REQUEST_TYPES.find((t) => t.key === key)?.label ?? key;
}
