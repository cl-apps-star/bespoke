import { useFetcher, useLoaderData } from "react-router";
import prisma from "../db.server";
import {
  getCommissionByToken,
  acceptTerms,
  declineQuote,
  customerApproveProof,
  customerRequestRevision,
  createChangeRequest,
} from "../bespoke.server";
import { createPayableOrderForCommission } from "../bespoke-payment.server";
import { STAGES, stageIndex, stageLabel, changeRequestTypeLabel } from "../bespoke-stages";
import { sendDepositLinkEmail, sendStageUpdateEmail } from "../email.server";

// Public, unauthenticated route — the token is the access control, same
// pattern as Care's /care/:token and In the Making's /journey/:token.
export const loader = async ({ params }) => {
  const commission = await getCommissionByToken(params.token);
  if (!commission) throw new Response("Not found", { status: 404 });
  return { commission };
};

export const action = async ({ request, params }) => {
  const commission = await getCommissionByToken(params.token);
  if (!commission) throw new Response("Not found", { status: 404 });
  const formData = await request.formData();
  const intent = formData.get("intent");
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const projectUrl = `${appUrl}/bespoke/${commission.token}`;
  const merchant = commission.merchant;

  if (intent === "accept_terms" && commission.status === "proposal_sent") {
    const updated = await acceptTerms(commission.id);
    try {
      if (updated.depositAmount > 0) {
        await createPayableOrderForCommission(commission.id, merchant.shop, { kind: "deposit" });
      }
    } catch (err) {
      console.error("[bespoke] deposit draft order failed", err);
    }
    await sendDepositLinkEmail({ commission: updated, merchant, projectUrl });
    return { ok: true };
  }

  if (intent === "decline_quote" && commission.status === "proposal_sent") {
    await declineQuote(commission.id);
    return { ok: true };
  }

  if (intent === "approve_proof") {
    const updated = await customerApproveProof(formData.get("fileId"));
    const full = await prisma.commission.findUnique({ where: { id: updated.id } });
    await sendStageUpdateEmail({
      commission: full,
      merchant,
      projectUrl,
      note: "Thanks for approving — we'll finalise things from here.",
    }).catch(() => {});
    return { ok: true };
  }

  if (intent === "request_revision") {
    await customerRequestRevision(formData.get("fileId"), formData.get("note") || undefined);
    return { ok: true };
  }

  if (intent === "create_change_request") {
    await createChangeRequest(commission.id, {
      requestedBy: "customer",
      type: formData.get("type"),
      description: formData.get("description"),
    });
    return { ok: true };
  }

  return { ok: false };
};

export default function BespokeProjectPage() {
  const { commission } = useLoaderData();
  const fetcher = useFetcher();
  const brand = commission.merchant;
  const currentIdx = stageIndex(commission.status);
  const accent = brand?.accentColor || "#8a7758";

  const styles = {
    wrap: {
      fontFamily: "Georgia, 'Times New Roman', serif",
      maxWidth: 680,
      margin: "0 auto",
      padding: "48px 24px",
      color: "#1a1a1a",
    },
    brand: {
      fontSize: 13,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: accent,
      marginBottom: 24,
    },
    stageRow: { display: "flex", flexDirection: "column", gap: 10, margin: "24px 0" },
    stage: (active, done) => ({
      padding: "10px 14px",
      borderLeft: `3px solid ${done || active ? accent : "#ddd"}`,
      color: done || active ? "#1a1a1a" : "#999",
      fontWeight: active ? "bold" : "normal",
    }),
    card: { marginTop: 32, padding: 20, background: "#faf9f7" },
    button: {
      padding: "12px 24px",
      background: accent,
      color: "#fff",
      border: "none",
      cursor: "pointer",
      fontSize: 14,
      marginRight: 12,
      marginTop: 12,
    },
    buttonMuted: {
      padding: "12px 24px",
      background: "#999",
      color: "#fff",
      border: "none",
      cursor: "pointer",
      fontSize: 14,
      marginRight: 12,
      marginTop: 12,
    },
  };

  const pendingProof = commission.files.find(
    (f) => f.type === "proof" && f.approvalStatus === "pending",
  );

  return (
    <div style={styles.wrap}>
      <div style={styles.brand}>{brand?.brandName || "Bespoke"}</div>
      <h1 style={{ fontWeight: "normal" }}>{commission.proposalTitle || commission.title}</h1>
      <p style={{ color: "#555" }}>Commission for {commission.customerName}</p>

      <div style={styles.stageRow}>
        {STAGES.map((s, i) => (
          <div key={s.key} style={styles.stage(i === currentIdx, i < currentIdx)}>
            {s.label}
          </div>
        ))}
      </div>

      {commission.status === "declined" && (
        <p style={{ marginTop: 32 }}>
          This commission was declined. Contact us if you'd like to revisit it.
        </p>
      )}

      {commission.status === "proposal_sent" && (
        <div style={styles.card}>
          <h3 style={{ fontWeight: "normal" }}>Your proposal</h3>
          {commission.proposalSummary && <p>{commission.proposalSummary}</p>}
          <ul>
            {commission.proposalMaterials && <li>Materials: {commission.proposalMaterials}</li>}
            {commission.proposalDimensions && <li>Dimensions: {commission.proposalDimensions}</li>}
            {commission.estimatedSchedule && <li>Estimated schedule: {commission.estimatedSchedule}</li>}
            {commission.includedRevisions != null && <li>Included revisions: {commission.includedRevisions}</li>}
            {commission.exclusions && <li>Excludes: {commission.exclusions}</li>}
          </ul>
          {commission.price != null && (
            <p>
              <strong>
                Total: {commission.currency} {commission.price.toFixed(2)}
              </strong>
              {commission.depositAmount != null && (
                <>
                  {" "}
                  — deposit due now: {commission.currency} {commission.depositAmount.toFixed(2)}
                </>
              )}
            </p>
          )}
          {commission.terms && <p style={{ fontSize: 13, color: "#777" }}>{commission.terms}</p>}
          <div>
            <button style={styles.button} onClick={() => fetcher.submit({ intent: "accept_terms" }, { method: "POST" })}>
              Accept terms & pay deposit
            </button>
            <button style={styles.buttonMuted} onClick={() => fetcher.submit({ intent: "decline_quote" }, { method: "POST" })}>
              Decline
            </button>
          </div>
        </div>
      )}

      {commission.status === "terms_accepted" && commission.depositStatus !== "paid" && (
        <div style={styles.card}>
          <h3 style={{ fontWeight: "normal" }}>Pay your deposit</h3>
          <p>
            Deposit due: {commission.currency} {commission.depositAmount?.toFixed(2)}
          </p>
          {commission.depositInvoiceUrl ? (
            <a href={commission.depositInvoiceUrl} style={styles.button}>
              Pay deposit now
            </a>
          ) : (
            <p style={{ fontSize: 13, color: "#777" }}>
              Your payment link is being prepared — check back shortly or contact us.
            </p>
          )}
        </div>
      )}

      {commission.balanceStatus === "due" && (
        <div style={styles.card}>
          <h3 style={{ fontWeight: "normal" }}>Final balance</h3>
          <p>
            Balance due: {commission.currency} {commission.balanceAmount?.toFixed(2)}
          </p>
          {commission.balanceInvoiceUrl && (
            <a href={commission.balanceInvoiceUrl} style={styles.button}>
              Pay balance now
            </a>
          )}
        </div>
      )}

      {pendingProof && (
        <div style={styles.card}>
          <h3 style={{ fontWeight: "normal" }}>A proof is ready for your review</h3>
          {pendingProof.label && <p>{pendingProof.label}</p>}
          <p>
            <a href={pendingProof.url} target="_blank" rel="noreferrer">
              View proof
            </a>
          </p>
          <button
            style={styles.button}
            onClick={() => fetcher.submit({ intent: "approve_proof", fileId: pendingProof.id }, { method: "POST" })}
          >
            Approve
          </button>
          <button
            style={styles.buttonMuted}
            onClick={() => {
              const note = window.prompt("What would you like changed?") || "";
              fetcher.submit({ intent: "request_revision", fileId: pendingProof.id, note }, { method: "POST" });
            }}
          >
            Request a revision
          </button>
        </div>
      )}

      {!["enquiry_received", "declined"].includes(commission.status) && (
        <div style={styles.card}>
          <h3 style={{ fontWeight: "normal", fontSize: 15 }}>Change requests</h3>
          {commission.changes.length === 0 && <p style={{ color: "#777" }}>None yet.</p>}
          {commission.changes.map((cr) => (
            <div key={cr.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee" }}>
              <div style={{ fontWeight: "bold" }}>{changeRequestTypeLabel(cr.type)}</div>
              <div>{cr.description}</div>
              <div style={{ fontSize: 13, color: "#777" }}>
                {cr.status}
                {cr.additionalCharge ? ` · additional charge ${commission.currency} ${cr.additionalCharge.toFixed(2)}` : ""}
              </div>
            </div>
          ))}
          <form
            style={{ marginTop: 16 }}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("intent", "create_change_request");
              fetcher.submit(fd, { method: "POST" });
              e.currentTarget.reset();
            }}
          >
            <select name="type" style={{ padding: 8, marginRight: 8 }}>
              <option value="spec_change">Specification change</option>
              <option value="added_feature">Added feature</option>
              <option value="material_change">Material change</option>
              <option value="deadline_change">Deadline change</option>
              <option value="additional_revision">Additional revision</option>
            </select>
            <input name="description" placeholder="Describe the change" style={{ padding: 8, width: 260 }} required />
            <button type="submit" style={{ ...styles.buttonMuted, marginLeft: 8 }}>
              Request a change
            </button>
          </form>
        </div>
      )}

      <div style={{ marginTop: 48 }}>
        <h3 style={{ fontWeight: "normal", fontSize: 15 }}>Updates</h3>
        {commission.updates
          .filter((u) => u.visibleToCustomer)
          .map((u) => (
            <div key={u.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee" }}>
              <div style={{ fontSize: 13, color: "#999" }}>{new Date(u.createdAt).toLocaleString()}</div>
              {u.status && <div style={{ fontWeight: "bold" }}>{stageLabel(u.status)}</div>}
              {u.note && <div>{u.note}</div>}
            </div>
          ))}
      </div>
    </div>
  );
}
