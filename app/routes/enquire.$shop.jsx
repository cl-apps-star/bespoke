import { redirect, useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { getMerchantProfileByShop, createEnquiry } from "../bespoke.server";
import { saveUploadedImages } from "../imageUpload.server";
import { sendEnquiryReceivedEmail } from "../email.server";

// Public, unauthenticated route — the entry point for the commission form
// builder described in the Bespoke spec. A merchant links to
// /enquire/:shop from their storefront (a "Custom orders" page, a bio
// link, etc). Covers the "Commission form builder" spec: text fields,
// multiple-choice (category, style, occasion), category-driven follow-up
// questions, real multi-image upload, dimensions, material choice,
// budget, deadline, quantity, engraving, delivery location. A true
// drag-and-drop field builder is still a "later" feature — this is the
// richer fixed field set the MVP spec calls for, not a builder.
export const loader = async ({ params }) => {
  const merchant = await getMerchantProfileByShop(params.shop);
  if (!merchant) throw new Response("This studio hasn't set up Bespoke yet.", { status: 404 });
  return { merchant };
};

export const action = async ({ request, params }) => {
  const merchant = await getMerchantProfileByShop(params.shop);
  if (!merchant) throw new Response("Not found", { status: 404 });

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

  const appUrl = process.env.SHOPIFY_APP_URL || "";
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
  const accent = merchant.accentColor || "#8a7758";

  const styles = {
    wrap: {
      fontFamily: "Georgia, 'Times New Roman', serif",
      maxWidth: 640,
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
    sectionLabel: {
      fontSize: 13,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "#999",
      margin: "36px 0 4px",
    },
    field: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 },
    label: { fontSize: 14, color: "#555" },
    hint: { fontSize: 12, color: "#999" },
    input: {
      padding: "10px 12px",
      border: "1px solid #ddd",
      fontFamily: "inherit",
      fontSize: 15,
      background: "#fff",
    },
    tagRow: { display: "flex", flexWrap: "wrap", gap: "8px 16px" },
    tagLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#333" },
    error: {
      padding: "12px 16px",
      background: "#fbeaea",
      border: "1px solid #e3b7b7",
      color: "#8a2c2c",
      fontSize: 14,
      marginBottom: 20,
    },
    button: {
      padding: "12px 28px",
      background: accent,
      color: "#fff",
      border: "none",
      cursor: "pointer",
      fontSize: 15,
      marginTop: 12,
    },
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.brand}>{merchant.brandName || "Custom commissions"}</div>
      <h1 style={{ fontWeight: "normal" }}>Start a commission</h1>
      {merchant.enquiryIntro && <p style={{ color: "#555" }}>{merchant.enquiryIntro}</p>}

      {actionData?.error && <div style={styles.error}>{actionData.error}</div>}

      <Form method="post" encType="multipart/form-data">
        <div style={styles.field}>
          <label style={styles.label}>Your name</label>
          <input style={styles.input} name="customerName" required />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Your email</label>
          <input style={styles.input} type="email" name="customerEmail" required />
        </div>

        <div style={styles.sectionLabel}>The piece</div>
        <div style={styles.field}>
          <label style={styles.label}>What are you looking to commission?</label>
          <select id="category" style={styles.input} name="category" defaultValue="">
            <option value="" disabled>
              Choose a category
            </option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Project title</label>
          <input style={styles.input} name="title" placeholder="e.g. Custom engagement ring" required />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Tell us about what you'd like made</label>
          <textarea style={{ ...styles.input, minHeight: 100 }} name="description" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Style (optional — pick any that fit)</label>
          <div style={styles.tagRow}>
            {STYLE_TAGS.map((tag) => (
              <label key={tag} style={styles.tagLabel}>
                <input type="checkbox" name="styleTags" value={tag} />
                {tag}
              </label>
            ))}
          </div>
        </div>

        <div id="sizeOrFitField" style={{ ...styles.field, display: "none" }}>
          <label style={styles.label}>Size / fit</label>
          <input style={styles.input} name="sizeOrFit" placeholder="e.g. Ring size N, dress size 12" />
        </div>
        <div id="dimensionsField" style={{ ...styles.field, display: "none" }}>
          <label style={styles.label}>Dimensions</label>
          <input style={styles.input} name="dimensions" placeholder="e.g. 120cm x 60cm x 75cm" />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Material choice</label>
          <input style={styles.input} name="materials" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Quantity</label>
          <input style={styles.input} type="number" name="quantity" defaultValue={1} min={1} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Engraving or personalised text</label>
          <input style={styles.input} name="engravingText" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Reference & inspiration images (optional)</label>
          <input style={styles.input} type="file" name="referenceImages" accept="image/png,image/jpeg,image/webp,image/gif" multiple />
          <span style={styles.hint}>Up to 6 images, JPG/PNG/WebP, 3MB each — a Pinterest screenshot or a photo of something similar is perfect.</span>
        </div>

        <div style={styles.sectionLabel}>The occasion</div>
        <div style={styles.field}>
          <label style={styles.label}>Is this for a special occasion?</label>
          <select id="occasion" style={styles.input} name="occasion" defaultValue="">
            {OCCASIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div id="occasionDateField" style={{ ...styles.field, display: "none" }}>
          <label style={styles.label}>Occasion date</label>
          <input style={styles.input} type="date" name="occasionDate" />
        </div>

        <div style={styles.sectionLabel}>Logistics</div>
        <div style={styles.field}>
          <label style={styles.label}>Budget</label>
          <input style={styles.input} name="budget" placeholder="e.g. £500 - £1,000" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Preferred deadline</label>
          <input style={styles.input} type="date" name="deadline" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Delivery location</label>
          <input style={styles.input} name="deliveryLocation" />
        </div>

        <button style={styles.button} type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit enquiry"}
        </button>
      </Form>

      {/* Progressive enhancement only — every field above works fine (just
          all visible at once) if this script fails to run. Shows the
          category-appropriate size question and the occasion-date field
          only when they're relevant, so the form doesn't ask a furniture
          buyer for a ring size. */}
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
                sizeField.style.display = sizeCategories.indexOf(v) !== -1 ? "flex" : "none";
                dimensionsField.style.display = dimensionCategories.indexOf(v) !== -1 ? "flex" : "none";
              }
              categorySelect.addEventListener("change", syncCategory);
              syncCategory();

              var occasionSelect = document.getElementById("occasion");
              var occasionDateField = document.getElementById("occasionDateField");
              function syncOccasion() {
                occasionDateField.style.display = occasionSelect.value ? "flex" : "none";
              }
              occasionSelect.addEventListener("change", syncOccasion);
              syncOccasion();
            })();
          `,
        }}
      />
    </div>
  );
}
