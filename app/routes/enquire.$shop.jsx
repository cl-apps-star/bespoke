import { redirect, useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { getMerchantProfileByShop, createEnquiry } from "../bespoke.server";
import { saveUploadedImages } from "../imageUpload.server";
import { sendEnquiryReceivedEmail } from "../email.server";
import { reserveCommissionSlot } from "../plan.server";
import { isPaidPlan } from "../planLogic";
import { publicOrigin } from "../publicOrigin.server";

// Public, unauthenticated route — the entry point for the commission form
// builder described in the Bespoke spec. A merchant links to
// /enquire/:shop from their storefront (a "Custom orders" page, a bio
// link, etc). Covers the "Commission form builder" spec: text fields,
// multiple-choice (category, style, occasion), category-driven follow-up
// questions, real multi-image upload, dimensions, material choice,
// budget, deadline, quantity, engraving, delivery location. A true
// drag-and-drop field builder is still a "later" feature — this is the
// richer fixed field set the MVP spec calls for, not a builder.
//
// Visual language (2026-08-26): rebuilt onto the same design system as
// Digital Unboxing & COA Kit and In the Making's customer-facing pages —
// same CSS custom properties, same font stack, same eyebrow/rule/quiet-
// editorial motifs — instead of Bespoke's original one-off styling. See
// "Design consistency across the suite" project doc for the reference
// values this was built against.
export const loader = async ({ params }) => {
  const merchant = await getMerchantProfileByShop(params.shop);
  if (!merchant) throw new Response("This studio hasn't set up Bespoke yet.", { status: 404 });
  return { merchant };
};

export const action = async ({ request, params }) => {
  const merchant = await getMerchantProfileByShop(params.shop);
  if (!merchant) throw new Response("Not found", { status: 404 });

  // Enforce the monthly commission cap (free/Studio) before doing anything
  // else — no point saving uploaded images for an enquiry that's over the
  // limit. Atelier always passes through untouched. See plan.server.js.
  const slot = await reserveCommissionSlot(params.shop, merchant);
  if (!slot.allowed) {
    return { error: slot.reason };
  }

  const formData = await request.formData();

  let referenceImages = [];
  try {
    referenceImages = await saveUploadedImages(formData.getAll("referenceImages"), { labelPrefix: "Reference" });
  } catch (err) {
    return { error: err.userFacing ? err.message : "Something went wrong with one of your images. Please try again." };
  }

  const commission = await createEnquiry(merchant.id, {
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    category: formData.get("category") || null,
    title: formData.get("title"),
    description: formData.get("description"),
    styleTags: formData.getAll("styleTags").filter(Boolean),
    sizeOrFit: formData.get("sizeOrFit"),
    dimensions: formData.get("dimensions"),
    materials: formData.get("materials"),
    quantity: formData.get("quantity") || 1,
    engravingText: formData.get("engravingText"),
    occasion: formData.get("occasion") || null,
    occasionDate: formData.get("occasionDate") || null,
    budget: formData.get("budget"),
    deadline: formData.get("deadline") || null,
    deliveryLocation: formData.get("deliveryLocation"),
    referenceImages,
  });

  const appUrl = publicOrigin(request.url);
  const projectUrl = `${appUrl}/bespoke/${commission.token}`;
  await sendEnquiryReceivedEmail({ commission, merchant, projectUrl });

  throw redirect(`/bespoke/${commission.token}`);
};

const CATEGORIES = [
  { value: "ring", label: "Ring" },
  { value: "necklace_pendant", label: "Necklace / pendant" },
  { value: "earrings", label: "Earrings" },
  { value: "bracelet", label: "Bracelet" },
  { value: "sculpture_art", label: "Sculpture / art object" },
  { value: "painting_drawing", label: "Painting / drawing" },
  { value: "furniture", label: "Furniture" },
  { value: "textile_apparel", label: "Textile / apparel" },
  { value: "other", label: "Something else" },
];

// Which categories get the "Size / fit" field vs. the "Dimensions" field —
// a ring and a wardrobe don't need the same question.
const SIZE_FIT_CATEGORIES = ["ring", "necklace_pendant", "earrings", "bracelet", "textile_apparel"];
const DIMENSIONS_CATEGORIES = ["sculpture_art", "painting_drawing", "furniture", "other"];

const STYLE_TAGS = ["Minimalist", "Vintage", "Modern", "Bold", "Classic", "Rustic", "Elegant", "Playful"];

const OCCASIONS = [
  { value: "", label: "No specific occasion" },
  { value: "wedding", label: "Wedding" },
  { value: "engagement", label: "Engagement" },
  { value: "anniversary", label: "Anniversary" },
  { value: "birthday", label: "Birthday" },
  { value: "just_because", label: "Just because" },
  { value: "other", label: "Other" },
];

export default function EnquireForm() {
  const { merchant } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const accent = merchant.accentColor || "#96773f";

  // Same custom-property / class-based system as certificate.$token.jsx
  // (Digital Unboxing & COA Kit) and journey.$token.jsx (In the Making) —
  // --paper/--ink/--muted/--accent, the Iowan Old Style/Georgia serif +
  // Helvetica sans split, and the eyebrow/rule/quiet-card visual language.
  // Extended here with input/select/checkbox treatments (a form page,
  // unlike the other two apps' read-only pages) that follow the same
  // typographic rules: serif for headings only, sans for every label,
  // hint, and control.
  const css = `
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
    .bq{--paper:#FAF6EE;--ink:#1c1b19;--muted:#8a8478;--accent:${accent};
      --line:color-mix(in srgb, ${accent} 26%, transparent);
      --matline:color-mix(in srgb, ${accent} 50%, transparent);
      --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;
      --sans:"Helvetica Neue",Helvetica,Arial,sans-serif;
      position:relative;min-height:100vh;background:var(--paper);color:var(--ink);
      font-family:var(--serif);overflow-x:hidden;padding:0 22px 96px;}
    .bq-vignette{position:fixed;inset:0;pointer-events:none;z-index:0;
      background:radial-gradient(120% 80% at 50% 34%, rgba(255,255,255,.5), rgba(150,119,63,.05) 70%, rgba(28,27,25,.10));}
    .bq .wrap{max-width:620px;margin:0 auto;position:relative;z-index:2;}
    .bq .eyebrow{font-family:var(--sans);font-size:11px;letter-spacing:3.5px;color:var(--accent);text-transform:uppercase;}
    .bq .wordmark{font-family:var(--sans);font-size:12px;letter-spacing:5px;color:var(--muted);text-transform:uppercase;}
    .bq .metatxt{font-family:var(--sans);font-size:10px;letter-spacing:2.5px;color:var(--muted);text-transform:uppercase;}
    .bq .rule{width:34px;height:1px;background:var(--accent);opacity:.6;margin:0 auto;}
    .bq .top{display:flex;justify-content:center;padding:44px 0 30px;}
    .bq .logo{max-height:40px;max-width:200px;display:block;}
    .bq .hero{text-align:center;padding:6px 0 34px;animation:bqplace 1s cubic-bezier(.2,.7,.2,1) both;}
    .bq .hero .eyebrow{margin-bottom:26px;}
    .bq .greet{font-style:italic;font-size:clamp(28px,6.4vw,40px);line-height:1.16;margin-bottom:14px;}
    .bq .sub{font-size:clamp(14.5px,3.4vw,16.5px);color:#5a564d;line-height:1.65;max-width:38ch;margin:0 auto;}
    .bq-section{margin:44px auto 0;max-width:100%;animation:bqplace 1s ease .1s both;}
    .bq-section-title{text-align:center;margin-bottom:26px;}
    .bq-section-title .rule{margin-bottom:14px;}
    .bq-field{margin-bottom:22px;}
    .bq-field label{display:block;font-family:var(--sans);font-size:12px;letter-spacing:.3px;color:#5a564d;margin-bottom:8px;}
    .bq-hint{display:block;font-family:var(--sans);font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5;}
    .bq-input,.bq-select,.bq-textarea{
      width:100%;font-family:var(--serif);font-size:15.5px;color:var(--ink);
      background:#fffefb;border:1px solid var(--matline);padding:12px 14px;
      appearance:none;-webkit-appearance:none;}
    .bq-select{background-image:linear-gradient(45deg, transparent 50%, ${accent} 50%),linear-gradient(135deg, ${accent} 50%, transparent 50%);
      background-position:calc(100% - 20px) center, calc(100% - 15px) center;background-size:5px 5px, 5px 5px;background-repeat:no-repeat;}
    .bq-textarea{min-height:110px;resize:vertical;}
    .bq-input:focus,.bq-select:focus,.bq-textarea:focus{outline:none;border-color:var(--accent);}
    .bq-input::placeholder,.bq-textarea::placeholder{color:#a39d90;}
    .bq-tags{display:flex;flex-wrap:wrap;gap:9px 14px;}
    .bq-tag{display:flex;align-items:center;gap:7px;font-family:var(--sans);font-size:12.5px;color:#4c483f;}
    .bq-tag input{accent-color:var(--accent);width:14px;height:14px;}
    .bq-file{font-family:var(--sans);font-size:12.5px;color:#4c483f;}
    .bq-error{font-family:var(--sans);font-size:13px;line-height:1.6;color:#8a4a3a;
      background:#fbf1ec;border:1px solid #e5c9ba;padding:16px 18px;margin-bottom:32px;}
    .bq-submit{display:block;width:100%;margin-top:14px;font-family:var(--sans);font-size:12px;
      letter-spacing:2.5px;text-transform:uppercase;color:#fff;background:var(--accent);
      border:none;padding:17px 26px;cursor:pointer;}
    .bq-submit:disabled{opacity:.6;cursor:default;}
    .bq .powered{text-align:center;margin-top:44px;}
    @keyframes bqplace{from{opacity:0;transform:translateY(22px) scale(.985);}to{opacity:1;transform:none;}}
  `;

  return (
    <div className="bq">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="bq-vignette" />

      <div className="wrap">
        <div className="top">
          {merchant.logoUrl ? (
            <img className="logo" src={merchant.logoUrl} alt={merchant.brandName || "Studio"} />
          ) : (
            <div className="wordmark">{merchant.brandName || "Custom commissions"}</div>
          )}
        </div>

        <div className="hero">
          <div className="eyebrow">Start a commission</div>
          <h1 className="greet">Tell us what you'd like made.</h1>
          {merchant.enquiryIntro && <p className="sub">{merchant.enquiryIntro}</p>}
        </div>

        {actionData?.error && <div className="bq-error">{actionData.error}</div>}

        <Form method="post" encType="multipart/form-data">
          <div className="bq-section">
            <div className="bq-field">
              <label>Your name</label>
              <input className="bq-input" name="customerName" required />
            </div>
            <div className="bq-field">
              <label>Your email</label>
              <input className="bq-input" type="email" name="customerEmail" required />
            </div>
          </div>

          <div className="bq-section">
            <div className="bq-section-title">
              <div className="rule" />
              <div className="eyebrow">The piece</div>
            </div>
            <div className="bq-field">
              <label>What are you looking to commission?</label>
              <select id="category" className="bq-select" name="category" defaultValue="">
                <option value="" disabled>Choose a category</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="bq-field">
              <label>Project title</label>
              <input className="bq-input" name="title" placeholder="e.g. Custom engagement ring" required />
            </div>
            <div className="bq-field">
              <label>Tell us about what you'd like made</label>
              <textarea className="bq-textarea" name="description" />
            </div>
            <div className="bq-field">
              <label>Style (optional — pick any that fit)</label>
              <div className="bq-tags">
                {STYLE_TAGS.map((tag) => (
                  <label key={tag} className="bq-tag">
                    <input type="checkbox" name="styleTags" value={tag} />
                    {tag}
                  </label>
                ))}
              </div>
            </div>

            <div id="sizeOrFitField" className="bq-field" style={{ display: "none" }}>
              <label>Size / fit</label>
              <input className="bq-input" name="sizeOrFit" placeholder="e.g. Ring size N, dress size 12" />
            </div>
            <div id="dimensionsField" className="bq-field" style={{ display: "none" }}>
              <label>Dimensions</label>
              <input className="bq-input" name="dimensions" placeholder="e.g. 120cm x 60cm x 75cm" />
            </div>

            <div className="bq-field">
              <label>Material choice</label>
              <input className="bq-input" name="materials" />
            </div>
            <div className="bq-field">
              <label>Quantity</label>
              <input className="bq-input" type="number" name="quantity" defaultValue={1} min={1} />
            </div>
            <div className="bq-field">
              <label>Engraving or personalised text</label>
              <input className="bq-input" name="engravingText" />
            </div>
            <div className="bq-field">
              <label>Reference &amp; inspiration images (optional)</label>
              <input
                className="bq-file"
                type="file"
                name="referenceImages"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
              />
              <span className="bq-hint">Up to 6 images, JPG/PNG/WebP, 3MB each — a Pinterest screenshot or a photo of something similar is perfect.</span>
            </div>
          </div>

          <div className="bq-section">
            <div className="bq-section-title">
              <div className="rule" />
              <div className="eyebrow">The occasion</div>
            </div>
            <div className="bq-field">
              <label>Is this for a special occasion?</label>
              <select id="occasion" className="bq-select" name="occasion" defaultValue="">
                {OCCASIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div id="occasionDateField" className="bq-field" style={{ display: "none" }}>
              <label>Occasion date</label>
              <input className="bq-input" type="date" name="occasionDate" />
            </div>
          </div>

          <div className="bq-section">
            <div className="bq-section-title">
              <div className="rule" />
              <div className="eyebrow">Logistics</div>
            </div>
            <div className="bq-field">
              <label>Budget</label>
              <input className="bq-input" name="budget" placeholder="e.g. £500 - £1,000" />
            </div>
            <div className="bq-field">
              <label>Preferred deadline</label>
              <input className="bq-input" type="date" name="deadline" />
            </div>
            <div className="bq-field">
              <label>Delivery location</label>
              <input className="bq-input" name="deliveryLocation" />
            </div>
          </div>

          <button className="bq-submit" type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit enquiry"}
          </button>
        </Form>

        {!isPaidPlan(merchant) ? (
          <div className="powered">
            <span className="metatxt">Powered by CL Apps</span>
          </div>
        ) : null}

        {/* Progressive enhancement only — every field above works fine (just
            all visible at once) if this script fails to run. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var sizeCategories = ${JSON.stringify(SIZE_FIT_CATEGORIES)};
                var dimensionCategories = ${JSON.stringify(DIMENSIONS_CATEGORIES)};
                var categorySelect = document.getElementById("category");
                var sizeField = document.getElementById("sizeOrFitField");
                var dimensionsField = document.getElementById("dimensionsField");
                function syncCategory() {
                  var v = categorySelect.value;
                  sizeField.style.display = sizeCategories.indexOf(v) !== -1 ? "block" : "none";
                  dimensionsField.style.display = dimensionCategories.indexOf(v) !== -1 ? "block" : "none";
                }
                categorySelect.addEventListener("change", syncCategory);
                syncCategory();

                var occasionSelect = document.getElementById("occasion");
                var occasionDateField = document.getElementById("occasionDateField");
                function syncOccasion() {
                  occasionDateField.style.display = occasionSelect.value ? "block" : "none";
                }
                occasionSelect.addEventListener("change", syncOccasion);
                syncOccasion();
              })();
            `,
          }}
        />
      </div>
    </div>
  );
}
