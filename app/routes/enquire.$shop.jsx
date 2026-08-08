import { redirect, useLoaderData, Form, useNavigation } from "react-router";
import { getMerchantProfileByShop, createEnquiry } from "../bespoke.server";
import { sendEnquiryReceivedEmail } from "../email.server";

// Public, unauthenticated route — the entry point for the commission
// form builder described in the Bespoke spec. A merchant links to
// /enquire/:shop from their storefront (a "Custom orders" page, a bio
// link, etc). Covers the fields listed under "Commission form builder":
// text, budget, deadline, dimensions, materials, quantity, engraving,
// delivery location, and a reference-file URL. A full drag-and-drop
// field builder is a "later" feature — this ships the fixed set of
// fields the MVP spec calls for.
export const loader = async ({ params }) => {
  const merchant = await getMerchantProfileByShop(params.shop);
  if (!merchant) throw new Response("This studio hasn't set up Bespoke yet.", { status: 404 });
  return { merchant };
};

export const action = async ({ request, params }) => {
  const merchant = await getMerchantProfileByShop(params.shop);
  if (!merchant) throw new Response("Not found", { status: 404 });

  const formData = await request.formData();
  const referenceUrl = formData.get("referenceUrl");

  const commission = await createEnquiry(merchant.id, {
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    title: formData.get("title"),
    description: formData.get("description"),
    budget: formData.get("budget"),
    deadline: formData.get("deadline") || null,
    dimensions: formData.get("dimensions"),
    materials: formData.get("materials"),
    quantity: formData.get("quantity") || 1,
    engravingText: formData.get("engravingText"),
    deliveryLocation: formData.get("deliveryLocation"),
    referenceFiles: referenceUrl ? [{ url: referenceUrl, label: "Reference" }] : null,
  });

  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const projectUrl = `${appUrl}/bespoke/${commission.token}`;
  await sendEnquiryReceivedEmail({ commission, merchant, projectUrl });

  throw redirect(`/bespoke/${commission.token}`);
};

export default function EnquireForm() {
  const { merchant } = useLoaderData();
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
    field: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 },
    label: { fontSize: 14, color: "#555" },
    input: {
      padding: "10px 12px",
      border: "1px solid #ddd",
      fontFamily: "inherit",
      fontSize: 15,
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

      <Form method="post">
        <div style={styles.field}>
          <label style={styles.label}>Your name</label>
          <input style={styles.input} name="customerName" required />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Your email</label>
          <input style={styles.input} type="email" name="customerEmail" required />
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
          <label style={styles.label}>Budget</label>
          <input style={styles.input} name="budget" placeholder="e.g. £500 - £1,000" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Preferred deadline</label>
          <input style={styles.input} type="date" name="deadline" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Dimensions</label>
          <input style={styles.input} name="dimensions" />
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
          <label style={styles.label}>Delivery location</label>
          <input style={styles.input} name="deliveryLocation" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Reference image URL (optional)</label>
          <input style={styles.input} name="referenceUrl" placeholder="https://..." />
        </div>
        <button style={styles.button} type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit enquiry"}
        </button>
      </Form>
    </div>
  );
}
