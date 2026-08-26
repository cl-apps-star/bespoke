import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getOrCreateMerchantProfile,
  getCommissionById,
  qualifyEnquiry,
  setPriority,
  assignTeamMember,
  saveAndSendProposal,
  addInternalNote,
  uploadProof,
  createChangeRequest,
  resolveChangeRequest,
  lockSpecification,
} from "../bespoke.server";
import { saveUploadedImages } from "../imageUpload.server";
import { createPayableOrderForCommission, manuallyMarkDepositPaid, manuallyMarkBalancePaid } from "../bespoke-payment.server";
import { STAGES, stageLabel, changeRequestTypeLabel } from "../bespoke-stages";

const CATEGORY_LABELS = {
  ring: "Ring",
  necklace_pendant: "Necklace / pendant",
  earrings: "Earrings",
  bracelet: "Bracelet",
  sculpture_art: "Sculpture / art object",
  painting_drawing: "Painting / drawing",
  furniture: "Furniture",
  textile_apparel: "Textile / apparel",
  other: "Something else",
};

const OCCASION_LABELS = {
  wedding: "Wedding",
  engagement: "Engagement",
  anniversary: "Anniversary",
  birthday: "Birthday",
  just_because: "Just because",
  other: "Other",
};
import {
  sendProposalEmail,
  sendDepositLinkEmail,
  sendProofReadyEmail,
  sendChangeRequestResolvedEmail,
  sendLockedEmail,
} from "../email.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchantProfile(session.shop);
  const commission = await getCommissionById(params.id, merchant.id);
  if (!commission) throw new Response("Not found", { status: 404 });
  return { merchant, commission };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchantProfile(session.shop);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const appUrl = process.env.SHOPIFY_APP_URL || "";

  const commission = await getCommissionById(params.id, merchant.id);
  if (!commission) throw new Response("Not found", { status: 404 });
  const projectUrl = `${appUrl}/bespoke/${commission.token}`;

  if (intent === "qualify") {
    await qualifyEnquiry(commission.id, formData.get("action"), { note: formData.get("note") || undefined });
    return { ok: true };
  }

  if (intent === "set_priority") {
    await setPriority(commission.id, formData.get("priority") || null);
    return { ok: true };
  }

  if (intent === "assign") {
    await assignTeamMember(commission.id, formData.get("assignedTo") || null);
    return { ok: true };
  }

  if (intent === "internal_note") {
    await addInternalNote(commission.id, formData.get("note"));
    return { ok: true };
  }

  if (intent === "save_and_send_proposal") {
    let proposalImages = [];
    try {
      proposalImages = await saveUploadedImages(formData.getAll("proposalImages"), { labelPrefix: "Concept" });
    } catch (err) {
      return { ok: false, error: err.userFacing ? err.message : "Something went wrong with one of the images." };
    }
    const updated = await saveAndSendProposal(commission.id, {
      proposalTitle: formData.get("proposalTitle"),
      proposalSummary: formData.get("proposalSummary"),
      proposedProduct: formData.get("proposedProduct"),
      proposalMaterials: formData.get("proposalMaterials"),
      proposalDimensions: formData.get("proposalDimensions"),
      includedRevisions: formData.get("includedRevisions"),
      exclusions: formData.get("exclusions"),
      estimatedSchedule: formData.get("estimatedSchedule"),
      price: formData.get("price"),
      currency: formData.get("currency") || "GBP",
      depositType: formData.get("depositType"),
      depositValue: formData.get("depositValue"),
      paymentScheduleNote: formData.get("paymentScheduleNote"),
      terms: formData.get("terms"),
      proposalImages,
    });
    await sendProposalEmail({ commission: updated, merchant, projectUrl });
    return { ok: true };
  }

  if (intent === "resend_deposit_link") {
    try {
      await createPayableOrderForCommission(commission.id, session.shop, { kind: "deposit" });
    } catch (err) {
      console.error("[bespoke] deposit draft order failed", err);
    }
    await sendDepositLinkEmail({ commission, merchant, projectUrl });
    return { ok: true };
  }

  if (intent === "mark_deposit_paid") {
    await manuallyMarkDepositPaid(commission.id);
    return { ok: true };
  }

  if (intent === "mark_balance_paid") {
    await manuallyMarkBalancePaid(commission.id);
    return { ok: true };
  }

  if (intent === "upload_proof") {
    await uploadProof(commission.id, {
      url: formData.get("url"),
      label: formData.get("label") || undefined,
      uploadedBy: "merchant",
    });
    const updated = await getCommissionById(commission.id, merchant.id);
    await sendProofReadyEmail({ commission: updated, merchant, projectUrl });
    return { ok: true };
  }

  if (intent === "create_change_request") {
    await createChangeRequest(commission.id, {
      requestedBy: "merchant",
      type: formData.get("type"),
      description: formData.get("description"),
    });
    return { ok: true };
  }

  if (intent === "resolve_change_request") {
    const accept = formData.get("accept") === "true";
    const additionalCharge = formData.get("additionalCharge") || null;
    const deadlineAdjustmentDays = formData.get("deadlineAdjustmentDays") || null;
    await resolveChangeRequest(formData.get("changeRequestId"), {
      accept,
      additionalCharge,
      deadlineAdjustmentDays,
    });
    const updated = await getCommissionById(commission.id, merchant.id);
    await sendChangeRequestResolvedEmail({
      commission: updated,
      merchant,
      projectUrl,
      accepted: accept,
      additionalCharge: additionalCharge ? Number(additionalCharge) : null,
    });
    return { ok: true };
  }

  if (intent === "lock_specification") {
    const updated = await lockSpecification(commission.id);
    await sendLockedEmail({ commission: updated, merchant, projectUrl });
    return { ok: true };
  }

  return { ok: false };
};

export default function CommissionDetail() {
  const { commission } = useLoaderData();
  const fetcher = useFetcher();
  const submit = (data) => fetcher.submit(data, { method: "POST" });

  const pendingChangeRequests = commission.changes.filter((c) => c.status === "pending");

  return (
    <s-page heading={commission.title} backAction={{ url: "/app" }}>
      <s-section heading="Overview">
        <s-stack direction="block" gap="tight">
          <s-text>
            Customer: {commission.customerName} ({commission.customerEmail})
          </s-text>
          <s-text>Status: {stageLabel(commission.status)}</s-text>
          {commission.category && <s-text>Category: {CATEGORY_LABELS[commission.category] || commission.category}</s-text>}
          {commission.occasion && (
            <s-text>
              Occasion: {OCCASION_LABELS[commission.occasion] || commission.occasion}
              {commission.occasionDate ? ` — ${new Date(commission.occasionDate).toLocaleDateString()}` : ""}
            </s-text>
          )}
          {commission.styleTags && (
            <s-text>Style: {JSON.parse(commission.styleTags).join(", ")}</s-text>
          )}
          {commission.budget && <s-text>Budget: {commission.budget}</s-text>}
          {commission.materials && <s-text>Materials requested: {commission.materials}</s-text>}
          {commission.sizeOrFit && <s-text>Size / fit: {commission.sizeOrFit}</s-text>}
          {commission.dimensions && <s-text>Dimensions: {commission.dimensions}</s-text>}
          {commission.engravingText && <s-text>Engraving: {commission.engravingText}</s-text>}
          {commission.quantity != null && <s-text>Quantity: {commission.quantity}</s-text>}
          {commission.description && <s-text>Description: {commission.description}</s-text>}
        </s-stack>
        {commission.files.filter((f) => f.type === "reference").length > 0 && (
          <s-stack direction="block" gap="tight">
            <s-text weight="bold">Reference images from customer</s-text>
            <s-stack direction="inline" gap="tight">
              {commission.files
                .filter((f) => f.type === "reference")
                .map((f) => (
                  <img key={f.id} src={f.url} alt={f.label || "Reference"} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 4 }} />
                ))}
            </s-stack>
          </s-stack>
        )}
      </s-section>

      {commission.status === "enquiry_received" && (
        <s-section heading="Qualify this enquiry">
          <s-stack direction="inline" gap="base">
            <s-button onClick={() => submit({ intent: "qualify", action: "accept" })}>Accept</s-button>
            <s-button variant="tertiary" onClick={() => submit({ intent: "qualify", action: "request_info" })}>
              Request more info
            </s-button>
            <s-button variant="tertiary" tone="critical" onClick={() => submit({ intent: "qualify", action: "decline" })}>
              Decline
            </s-button>
          </s-stack>
        </s-section>
      )}

      {!["enquiry_received", "declined"].includes(commission.status) && (
        <s-section heading="Proposal builder">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("intent", "save_and_send_proposal");
              fetcher.submit(fd, { method: "POST" });
            }}
          >
            <s-stack direction="block" gap="base">
              <s-text-field name="proposalTitle" label="Project title" defaultValue={commission.proposalTitle ?? commission.title} />
              <s-text-field name="proposalSummary" label="Summary" defaultValue={commission.proposalSummary ?? ""} />
              <s-text-field name="proposedProduct" label="Proposed product" defaultValue={commission.proposedProduct ?? ""} />
              <s-text-field name="proposalMaterials" label="Materials" defaultValue={commission.proposalMaterials ?? commission.materials ?? ""} />
              <s-text-field name="proposalDimensions" label="Dimensions" defaultValue={commission.proposalDimensions ?? commission.dimensions ?? ""} />
              <s-text-field name="includedRevisions" label="Included revisions" type="number" defaultValue={commission.includedRevisions ?? 2} />
              <s-text-field name="exclusions" label="Exclusions" defaultValue={commission.exclusions ?? ""} />
              <s-text-field name="estimatedSchedule" label="Estimated schedule" defaultValue={commission.estimatedSchedule ?? ""} />
              <s-text-field name="price" label="Total price" type="number" step="0.01" defaultValue={commission.price ?? ""} />
              <s-text-field name="currency" label="Currency" defaultValue={commission.currency ?? "GBP"} />
              <s-select name="depositType" label="Deposit type" defaultValue={commission.depositType ?? "percentage"}>
                <s-option value="fixed">Fixed amount</s-option>
                <s-option value="percentage">Percentage of total</s-option>
                <s-option value="full">Full payment up front</s-option>
              </s-select>
              <s-text-field
                name="depositValue"
                label="Deposit value (amount or %)"
                type="number"
                step="0.01"
                defaultValue={commission.depositValue ?? 50}
              />
              <s-text-field name="paymentScheduleNote" label="Payment schedule note" defaultValue={commission.paymentScheduleNote ?? ""} />
              <s-text-field name="terms" label="Terms" defaultValue={commission.terms ?? ""} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 13, color: "#555" }}>Concept / inspiration images (optional)</label>
                <input type="file" name="proposalImages" accept="image/png,image/jpeg,image/webp,image/gif" multiple />
                <span style={{ fontSize: 12, color: "#999" }}>
                  Uploading a new set replaces the images attached to the current proposal.
                </span>
              </div>
              <s-button type="submit">Save & send proposal</s-button>
            </s-stack>
          </form>
          {commission.files.filter((f) => f.type === "inspiration").length > 0 && (
            <s-stack direction="inline" gap="tight">
              {commission.files
                .filter((f) => f.type === "inspiration")
                .map((f) => (
                  <img key={f.id} src={f.url} alt={f.label || "Concept"} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 4 }} />
                ))}
            </s-stack>
          )}
          {commission.price != null && (
            <s-paragraph>
              Current: {commission.currency} {commission.price.toFixed(2)} total · deposit{" "}
              {commission.depositAmount != null ? `${commission.currency} ${commission.depositAmount.toFixed(2)}` : "—"} · balance{" "}
              {commission.balanceAmount != null ? `${commission.currency} ${commission.balanceAmount.toFixed(2)}` : "—"} (v{commission.proposalVersion})
            </s-paragraph>
          )}
        </s-section>
      )}

      {["terms_accepted", "deposit_paid", "in_progress", "final_approved", "locked"].includes(commission.status) && (
        <s-section heading="Payment">
          <s-stack direction="block" gap="tight">
            <s-text>Deposit: {commission.depositStatus}</s-text>
            <s-text>Balance: {commission.balanceStatus}</s-text>
          </s-stack>
          <s-stack direction="inline" gap="base">
            {commission.depositStatus !== "paid" && (
              <>
                <s-button onClick={() => submit({ intent: "resend_deposit_link" })}>Create/resend deposit payment link</s-button>
                <s-button variant="tertiary" onClick={() => submit({ intent: "mark_deposit_paid" })}>
                  Mark deposit paid manually
                </s-button>
              </>
            )}
            {commission.depositStatus === "paid" && commission.balanceStatus !== "paid" && (
              <s-button variant="tertiary" onClick={() => submit({ intent: "mark_balance_paid" })}>
                Mark balance paid manually
              </s-button>
            )}
          </s-stack>
        </s-section>
      )}

      {["deposit_paid", "in_progress", "final_approved"].includes(commission.status) && (
        <s-section heading="Proof upload">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("intent", "upload_proof");
              fetcher.submit(fd, { method: "POST" });
              e.currentTarget.reset();
            }}
          >
            <s-stack direction="block" gap="base">
              <s-text-field name="url" label="Proof image/file URL" required />
              <s-text-field name="label" label="Label (optional)" />
              <s-button type="submit">Upload proof for review</s-button>
            </s-stack>
          </form>
          <s-stack direction="block" gap="tight">
            {commission.files
              .filter((f) => f.type === "proof")
              .map((f) => (
                <s-box key={f.id} padding="tight">
                  <s-text>
                    {f.label || f.url} — {f.approvalStatus} {f.approvalNote ? `(${f.approvalNote})` : ""}
                  </s-text>
                </s-box>
              ))}
          </s-stack>
        </s-section>
      )}

      {!["enquiry_received", "declined"].includes(commission.status) && (
        <s-section heading="Change requests">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("intent", "create_change_request");
              fetcher.submit(fd, { method: "POST" });
              e.currentTarget.reset();
            }}
          >
            <s-stack direction="block" gap="base">
              <s-select name="type" label="Type">
                <s-option value="spec_change">Specification change</s-option>
                <s-option value="added_feature">Added feature</s-option>
                <s-option value="material_change">Material change</s-option>
                <s-option value="deadline_change">Deadline change</s-option>
                <s-option value="additional_revision">Additional revision</s-option>
              </s-select>
              <s-text-field name="description" label="Description" required />
              <s-button type="submit" variant="tertiary">Log a change request</s-button>
            </s-stack>
          </form>

          <s-stack direction="block" gap="base">
            {commission.changes.map((cr) => (
              <s-box key={cr.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <s-text weight="bold">
                    {changeRequestTypeLabel(cr.type)} — requested by {cr.requestedBy}
                  </s-text>
                  <s-text>{cr.description}</s-text>
                  <s-badge>{cr.status}</s-badge>
                  {cr.status === "pending" && (
                    <form
                      id={`change-request-${cr.id}`}
                      onSubmit={(e) => e.preventDefault()}
                    >
                      <s-stack direction="inline" gap="base">
                        <s-text-field name="additionalCharge" label="Additional charge (optional)" type="number" step="0.01" />
                        <s-text-field name="deadlineAdjustmentDays" label="Deadline +days (optional)" type="number" />
                        <s-button
                          type="button"
                          onClick={(e) => {
                            const form = document.getElementById(`change-request-${cr.id}`);
                            const fd = new FormData(form);
                            fd.set("intent", "resolve_change_request");
                            fd.set("changeRequestId", cr.id);
                            fd.set("accept", "true");
                            fetcher.submit(fd, { method: "POST" });
                          }}
                        >
                          Accept
                        </s-button>
                        <s-button
                          type="button"
                          variant="tertiary"
                          tone="critical"
                          onClick={() => {
                            const form = document.getElementById(`change-request-${cr.id}`);
                            const fd = new FormData(form);
                            fd.set("intent", "resolve_change_request");
                            fd.set("changeRequestId", cr.id);
                            fd.set("accept", "false");
                            fetcher.submit(fd, { method: "POST" });
                          }}
                        >
                          Reject
                        </s-button>
                      </s-stack>
                    </form>
                  )}
                </s-stack>
              </s-box>
            ))}
            {commission.changes.length === 0 && <s-paragraph>No change requests yet.</s-paragraph>}
          </s-stack>
        </s-section>
      )}

      {commission.status === "final_approved" && (
        <s-section heading="Lock specification">
          <s-paragraph>
            The customer has approved the final proof. Lock the specification to move this
            commission into production.
          </s-paragraph>
          <s-button onClick={() => submit({ intent: "lock_specification" })}>Lock specification</s-button>
        </s-section>
      )}

      <s-section heading="Timeline">
        <s-stack direction="block" gap="tight">
          {commission.updates.map((u) => (
            <s-box key={u.id} padding="tight">
              <s-text weight={u.status ? "bold" : "regular"}>
                {u.status ? stageLabel(u.status) : "Note"} — {new Date(u.createdAt).toLocaleString()}
                {!u.visibleToCustomer ? " (internal)" : ""}
              </s-text>
              {u.note && <s-text tone="subdued">{u.note}</s-text>}
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Priority & assignment">
        <s-stack direction="block" gap="base">
          <s-select
            label="Priority"
            defaultValue={commission.priority ?? ""}
            onChange={(e) => submit({ intent: "set_priority", priority: e.currentTarget.value })}
          >
            <s-option value="">Not set</s-option>
            <s-option value="low">Low</s-option>
            <s-option value="normal">Normal</s-option>
            <s-option value="high">High</s-option>
          </s-select>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("intent", "assign");
              fetcher.submit(fd, { method: "POST" });
            }}
          >
            <s-stack direction="block" gap="tight">
              <s-text-field name="assignedTo" label="Assigned to" defaultValue={commission.assignedTo ?? ""} />
              <s-button type="submit" variant="tertiary">Save</s-button>
            </s-stack>
          </form>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Internal note">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("intent", "internal_note");
            fetcher.submit(fd, { method: "POST" });
            e.currentTarget.reset();
          }}
        >
          <s-stack direction="block" gap="base">
            <s-text-field name="note" label="Note (not shown to customer)" />
            <s-button type="submit" variant="tertiary">
              Add note
            </s-button>
          </s-stack>
        </form>
      </s-section>

      <s-section slot="aside" heading="Stages">
        <s-paragraph tone="subdued">{STAGES.map((s) => s.label).join(" → ")}</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
