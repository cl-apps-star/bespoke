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

// Same visual language as certificate.$token.jsx (Digital Unboxing & COA
// Kit) and journey.$token.jsx (In the Making): --paper/--ink/--muted/
// --accent custom properties, the Iowan Old Style/Georgia serif + Helvetica
// sans split, the eyebrow/rule header, mat-framed hero image, and the
// timeline node treatment reused directly from In the Making since Bespoke
// already tracks a linear stage list the same shape. Extended with a
// note-block-style proposal card and matching form controls for the parts
// (proposal, payment, change requests) the other two apps don't have.
export default function BespokeProjectPage() {
  const { commission } = useLoaderData();
  const fetcher = useFetcher();
  const brand = commission.merchant;
  const currentIdx = stageIndex(commission.status);
  const accent = brand?.accentColor || "#96773f";
  const declined = commission.status === "declined";

  const firstName = (commission.customerName || "").trim().split(/\s+/)[0] || "";
  const pendingProof = commission.files.find((f) => f.type === "proof" && f.approvalStatus === "pending");
  const referenceImages = commission.files.filter((f) => f.type === "reference");
  const inspirationImages = commission.files.filter((f) => f.type === "inspiration");

  const css = `
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
    .bp{--paper:#FAF6EE;--ink:#1c1b19;--muted:#8a8478;--accent:${accent};
      --line:color-mix(in srgb, ${accent} 26%, transparent);
      --matline:color-mix(in srgb, ${accent} 50%, transparent);
      --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;
      --sans:"Helvetica Neue",Helvetica,Arial,sans-serif;
      position:relative;min-height:100vh;background:var(--paper);color:var(--ink);
      font-family:var(--serif);overflow-x:hidden;padding:0 22px 96px;}
    .bp-vignette{position:fixed;inset:0;pointer-events:none;z-index:0;
      background:radial-gradient(120% 80% at 50% 34%, rgba(255,255,255,.5), rgba(150,119,63,.05) 70%, rgba(28,27,25,.10));}
    .bp .wrap{max-width:620px;margin:0 auto;position:relative;z-index:2;}
    .bp .eyebrow{font-family:var(--sans);font-size:11px;letter-spacing:3.5px;color:var(--accent);text-transform:uppercase;}
    .bp .wordmark{font-family:var(--sans);font-size:12px;letter-spacing:5px;color:var(--muted);text-transform:uppercase;}
    .bp .metatxt{font-family:var(--sans);font-size:10px;letter-spacing:2.5px;color:var(--muted);text-transform:uppercase;}
    .bp .rule{width:34px;height:1px;background:var(--accent);opacity:.6;margin:0 auto;}
    .bp .top{display:flex;justify-content:center;padding:44px 0 30px;}
    .bp .logo{max-height:40px;max-width:200px;display:block;}
    .bp .hero{text-align:center;padding:6px 0 26px;animation:bpplace 1s cubic-bezier(.2,.7,.2,1) both;}
    .bp .hero .eyebrow{margin-bottom:26px;}
    .bp .greet{font-style:italic;font-size:clamp(28px,6.4vw,40px);line-height:1.16;margin-bottom:14px;}
    .bp .sub{font-size:clamp(14.5px,3.4vw,17px);color:#5a564d;line-height:1.6;max-width:34ch;margin:0 auto;}
    .bp .sub em{font-style:italic;color:#3f3b33;}
    .bp .frames{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin:10px auto 0;animation:bpplace 1s cubic-bezier(.2,.7,.2,1) .08s both;}
    .bp .frame{padding:10px;background:var(--paper);box-shadow:0 16px 40px -18px rgba(60,45,20,.4),0 4px 14px rgba(60,45,20,.1);}
    .bp .frame .mat{padding:8px;border:1px solid var(--matline);background:#fff;}
    .bp .frame img{display:block;width:88px;height:88px;object-fit:cover;}
    .bp .timeline{max-width:440px;margin:46px auto 0;animation:bpplace 1s ease .16s both;}
    .bp .stage{position:relative;padding:0 0 30px 44px;}
    .bp .stage:last-child{padding-bottom:0;}
    .bp .stage::before{content:"";position:absolute;left:9px;top:20px;bottom:-4px;width:1px;background:var(--line);}
    .bp .stage:last-child::before{display:none;}
    .bp .node{position:absolute;left:0;top:0;width:20px;height:20px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;background:var(--paper);border:1px solid var(--line);}
    .bp .stage.done .node,.bp .stage.current .node{border-color:var(--accent);}
    .bp .stage.done .node svg{width:9px;height:9px;stroke:var(--accent);stroke-width:2;fill:none;}
    .bp .stage.current .node::after{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);animation:bpbreathe 2.4s ease-in-out infinite;}
    .bp .slab{font-size:17px;letter-spacing:.2px;}
    .bp .stage.done .slab{color:#4c483f;}
    .bp .stage.upcoming .slab{color:var(--muted);}
    .bp .stage.current .slab{font-style:italic;}
    .bp-card{max-width:440px;margin:44px auto 0;padding:26px 26px 24px;border:1px solid var(--matline);
      background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,.18));animation:bpplace 1s ease .2s both;}
    .bp-card h3{font-style:italic;font-size:20px;font-weight:normal;margin-bottom:6px;}
    .bp-card p{font-size:15px;line-height:1.7;color:#3a3a36;margin-bottom:4px;}
    .bp-list{margin-top:14px;padding-top:14px;border-top:1px solid var(--line);}
    .bp-row{display:flex;justify-content:space-between;gap:12px;font-family:var(--sans);font-size:12.5px;color:#5a564d;padding:4px 0;}
    .bp-total{margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-family:var(--sans);
      font-size:14px;font-weight:bold;color:var(--ink);display:flex;justify-content:space-between;}
    .bp-terms{font-family:var(--sans);font-size:11px;color:var(--muted);line-height:1.6;margin-top:14px;}
    .bp-btnrow{display:flex;gap:12px;margin-top:22px;}
    .bp-btn{flex:1;text-align:center;text-decoration:none;display:block;box-sizing:border-box;
      font-family:var(--sans);font-size:11.5px;letter-spacing:2px;text-transform:uppercase;
      padding:14px 18px;border:1px solid var(--accent);color:#fff;background:var(--accent);cursor:pointer;}
    .bp-btn.secondary{background:transparent;color:var(--muted);border-color:var(--line);}
    .bp-btn:disabled{opacity:.6;cursor:default;}
    .bp .eta{max-width:440px;margin:44px auto 0;text-align:center;padding-top:30px;border-top:1px solid var(--line);animation:bpplace 1s ease .28s both;}
    .bp .eta .v{font-size:22px;letter-spacing:.3px;margin:12px 0 10px;}
    .bp .eta .n{font-style:italic;font-size:15px;color:#5a564d;}
    .bp .eta a.bp-btn{display:inline-block;margin-top:16px;width:auto;}
    .bp-note{font-family:var(--sans);font-size:12.5px;color:var(--muted);margin-top:14px;}
    .bp-changes{max-width:440px;margin:46px auto 0;animation:bpplace 1s ease .32s both;}
    .bp-changes .heading{text-align:center;margin-bottom:20px;}
    .bp-change{padding:14px 0;border-bottom:1px solid var(--line);}
    .bp-change .kind{font-family:var(--sans);font-size:12px;letter-spacing:.5px;color:var(--ink);font-weight:bold;margin-bottom:3px;}
    .bp-change .desc{font-size:15px;color:#3a3a36;}
    .bp-change .meta{font-family:var(--sans);font-size:11px;color:var(--muted);margin-top:6px;}
    .bp-form{margin-top:18px;display:flex;flex-direction:column;gap:10px;}
    .bp-form select,.bp-form input{font-family:var(--serif);font-size:14.5px;color:var(--ink);
      background:#fffefb;border:1px solid var(--matline);padding:11px 13px;width:100%;box-sizing:border-box;}
    .bp-form button{font-family:var(--sans);font-size:11px;letter-spacing:2px;text-transform:uppercase;
      color:var(--accent);background:transparent;border:1px solid var(--accent);padding:12px 18px;cursor:pointer;}
    .bp-updates{max-width:440px;margin:46px auto 0;animation:bpplace 1s ease .36s both;}
    .bp-update{padding:14px 0;border-bottom:1px solid var(--line);}
    .bp-update .when{font-family:var(--sans);font-size:10.5px;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:5px;}
    .bp-update .status{font-family:var(--sans);font-size:12px;font-weight:bold;color:var(--ink);margin-bottom:3px;}
    .bp-update .note{font-size:15px;color:#3a3a36;}
    .bp-declined{max-width:440px;margin:44px auto 0;text-align:center;font-size:15px;line-height:1.7;color:#5a564d;}
    @keyframes bpplace{from{opacity:0;transform:translateY(24px) scale(.985);}to{opacity:1;transform:none;}}
    @keyframes bpbreathe{0%,100%{opacity:.45;}50%{opacity:1;}}
  `;

  const check = (
    <svg viewBox="0 0 24 24">
      <polyline points="4,12 10,18 20,6" />
    </svg>
  );

  return (
    <div className="bp">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="bp-vignette" />

      <div className="wrap">
        <div className="top">
          {brand?.logoUrl ? (
            <img className="logo" src={brand.logoUrl} alt={brand?.brandName || "Studio"} />
          ) : (
            <div className="wordmark">{brand?.brandName || "Bespoke"}</div>
          )}
        </div>

        <div className="hero">
          <div className="eyebrow">Your commission</div>
          <h1 className="greet">{firstName ? `${firstName},` : "Hello,"}</h1>
          <div className="sub">
            your <em>{commission.proposalTitle || commission.title}</em>
          </div>
        </div>

        {referenceImages.length > 0 && (
          <div className="frames">
            {referenceImages.map((f) => (
              <div className="frame" key={f.id}>
                <div className="mat">
                  <img src={f.url} alt={f.label || "Reference"} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!declined && (
          <div className="timeline">
            {STAGES.map((s, i) => {
              const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming";
              return (
                <div className={`stage ${state}`} key={s.key}>
                  <div className="node">{state === "done" ? check : null}</div>
                  <div className="slab">{s.label}</div>
                </div>
              );
            })}
          </div>
        )}

        {declined && (
          <div className="bp-declined">
            This commission was declined. Contact us if you'd like to revisit it.
          </div>
        )}

        {commission.status === "proposal_sent" && (
          <div className="bp-card">
            <h3>Your proposal</h3>
            {commission.proposalSummary && <p>{commission.proposalSummary}</p>}
            {inspirationImages.length > 0 && (
              <div className="frames" style={{ marginTop: 16, marginBottom: 4 }}>
                {inspirationImages.map((f) => (
                  <div className="frame" key={f.id}>
                    <div className="mat">
                      <img src={f.url} alt={f.label || "Concept"} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="bp-list">
              {commission.proposalMaterials && <div className="bp-row"><span>Materials</span><span>{commission.proposalMaterials}</span></div>}
              {commission.proposalDimensions && <div className="bp-row"><span>Dimensions</span><span>{commission.proposalDimensions}</span></div>}
              {commission.estimatedSchedule && <div className="bp-row"><span>Estimated schedule</span><span>{commission.estimatedSchedule}</span></div>}
              {commission.includedRevisions != null && <div className="bp-row"><span>Included revisions</span><span>{commission.includedRevisions}</span></div>}
              {commission.exclusions && <div className="bp-row"><span>Excludes</span><span>{commission.exclusions}</span></div>}
            </div>
            {commission.price != null && (
              <div className="bp-total">
                <span>Total</span>
                <span>{commission.currency} {commission.price.toFixed(2)}</span>
              </div>
            )}
            {commission.depositAmount != null && (
              <div className="bp-row" style={{ marginTop: 6 }}>
                <span>Deposit due now</span>
                <span>{commission.currency} {commission.depositAmount.toFixed(2)}</span>
              </div>
            )}
            {commission.terms && <div className="bp-terms">{commission.terms}</div>}
            <div className="bp-btnrow">
              <button className="bp-btn" onClick={() => fetcher.submit({ intent: "accept_terms" }, { method: "POST" })}>
                Accept &amp; pay deposit
              </button>
              <button className="bp-btn secondary" onClick={() => fetcher.submit({ intent: "decline_quote" }, { method: "POST" })}>
                Decline
              </button>
            </div>
          </div>
        )}

        {commission.status === "terms_accepted" && commission.depositStatus !== "paid" && (
          <div className="eta">
            <div className="eyebrow">Pay your deposit</div>
            <div className="v">{commission.currency} {commission.depositAmount?.toFixed(2)}</div>
            {commission.depositInvoiceUrl ? (
              <a href={commission.depositInvoiceUrl} className="bp-btn">Pay deposit now</a>
            ) : (
              <div className="n">Your payment link is being prepared — check back shortly or contact us.</div>
            )}
          </div>
        )}

        {commission.balanceStatus === "due" && (
          <div className="eta">
            <div className="eyebrow">Final balance</div>
            <div className="v">{commission.currency} {commission.balanceAmount?.toFixed(2)}</div>
            {commission.balanceInvoiceUrl && (
              <a href={commission.balanceInvoiceUrl} className="bp-btn">Pay balance now</a>
            )}
          </div>
        )}

        {pendingProof && (
          <div className="bp-card">
            <h3>A proof is ready for your review</h3>
            {pendingProof.label && <p>{pendingProof.label}</p>}
            <p style={{ marginTop: 10 }}>
              <a href={pendingProof.url} target="_blank" rel="noreferrer" style={{ color: accent }}>View proof &darr;</a>
            </p>
            <div className="bp-btnrow">
              <button
                className="bp-btn"
                onClick={() => fetcher.submit({ intent: "approve_proof", fileId: pendingProof.id }, { method: "POST" })}
              >
                Approve
              </button>
              <button
                className="bp-btn secondary"
                onClick={() => {
                  const note = window.prompt("What would you like changed?") || "";
                  fetcher.submit({ intent: "request_revision", fileId: pendingProof.id, note }, { method: "POST" });
                }}
              >
                Request a revision
              </button>
            </div>
          </div>
        )}

        {!["enquiry_received", "declined"].includes(commission.status) && (
          <div className="bp-changes">
            <div className="heading">
              <div className="rule" style={{ marginBottom: 14 }} />
              <div className="eyebrow">Change requests</div>
            </div>
            {commission.changes.length === 0 && <div className="bp-note" style={{ textAlign: "center" }}>None yet.</div>}
            {commission.changes.map((cr) => (
              <div className="bp-change" key={cr.id}>
                <div className="kind">{changeRequestTypeLabel(cr.type)}</div>
                <div className="desc">{cr.description}</div>
                <div className="meta">
                  {cr.status}
                  {cr.additionalCharge ? ` · additional charge ${commission.currency} ${cr.additionalCharge.toFixed(2)}` : ""}
                </div>
              </div>
            ))}
            <form
              className="bp-form"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                fd.set("intent", "create_change_request");
                fetcher.submit(fd, { method: "POST" });
                e.currentTarget.reset();
              }}
            >
              <select name="type">
                <option value="spec_change">Specification change</option>
                <option value="added_feature">Added feature</option>
                <option value="material_change">Material change</option>
                <option value="deadline_change">Deadline change</option>
                <option value="additional_revision">Additional revision</option>
              </select>
              <input name="description" placeholder="Describe the change" required />
              <button type="submit">Request a change</button>
            </form>
          </div>
        )}

        <div className="bp-updates">
          <div className="heading" style={{ textAlign: "center", marginBottom: 20 }}>
            <div className="rule" style={{ marginBottom: 14 }} />
            <div className="eyebrow">Updates</div>
          </div>
          {commission.updates
            .filter((u) => u.visibleToCustomer)
            .map((u) => (
              <div className="bp-update" key={u.id}>
                <div className="when">{new Date(u.createdAt).toLocaleString()}</div>
                {u.status && <div className="status">{stageLabel(u.status)}</div>}
                {u.note && <div className="note">{u.note}</div>}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
