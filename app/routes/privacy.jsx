const INK = "#1c1b19";
const MUTED = "#8a8478";
const PAPER = "#FAF6EE";
const ACCENT = "#96773f";

export const meta = () => [{ title: "Privacy Policy — CL Apps" }];

// Public, unauthenticated route — the URL used as this app's Privacy
// Policy link in the Partner Dashboard listing. Mirrors In the Making's
// privacy.jsx in structure/tone, with the facts corrected for how Bespoke
// actually collects and uses data (customer-entered directly via the
// public enquiry form, not merchant-entered on the customer's behalf —
// the one real difference from In the Making's flow).
export default function PrivacyPolicy() {
  return (
    <div
      style={{
        margin: 0,
        minHeight: "100vh",
        background: PAPER,
        color: INK,
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "64px 24px 96px 24px" }}>
        <div
          style={{
            fontFamily: "Helvetica, Arial, sans-serif",
            fontSize: 10,
            letterSpacing: 3,
            color: MUTED,
            marginBottom: 12,
          }}
        >
          CL APPS
        </div>
        <h1 style={{ fontSize: 32, lineHeight: 1.15, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ fontStyle: "italic", color: MUTED, marginBottom: 40 }}>Last updated 26 August 2026</p>

        <Section title="What this app does">
          <p>
            "Bespoke" gives a merchant a private commission desk: customers submit a custom-order enquiry through a
            public form, the merchant turns it into a priced proposal, the customer reviews and accepts it, pays a
            deposit and later the balance through Shopify Checkout, and both sides track the piece through to
            completion on a shared project page.
          </p>
        </Section>

        <Section title="Information we collect">
          <p>From the merchant (store owner), we collect and store:</p>
          <ul>
            <li>Their Shopify store domain</li>
            <li>Their studio/brand name, brand colour, logo image link, and support email — entered voluntarily in the app's Branding screen</li>
            <li>Their app plan and billing status</li>
          </ul>
          <p>From a customer submitting a commission enquiry, entered directly by that customer on the public enquiry form, we collect:</p>
          <ul>
            <li>Their name and email address</li>
            <li>Details about the piece they'd like made — category, description, materials, dimensions or size, quantity, engraving text, style preferences, budget, deadline, and occasion (if any)</li>
            <li>A delivery location, if they choose to enter one — free text, not a verified or structured address</li>
            <li>Any reference or inspiration images they choose to upload</li>
          </ul>
          <p>
            When a customer pays a deposit or final balance, that payment is processed entirely by Shopify Checkout —
            Bespoke creates the order and hands off to Shopify's own checkout, and never sees or stores card details.
            We don't collect phone numbers or browsing behaviour, and this app does not read a merchant's existing
            Shopify customer or order records — every piece of customer information above is entered directly,
            either by the customer on the enquiry form or, for the deposit/balance draft orders, generated fresh from
            what that customer already gave us.
          </p>
        </Section>

        <Section title="How we use this information">
          <p>
            Customer information is used solely to build the proposal, generate the private commission project page,
            create the deposit/balance draft orders in Shopify, and send status-update emails about that commission.
            We don't use it for marketing, and we don't sell or share it with third parties, except the service
            providers below who are necessary to run the app.
          </p>
        </Section>

        <Section title="Third-party services we use">
          <ul>
            <li>
              <strong>Shopify</strong> — hosts the app, provides the store information the app is built on, creates
              and processes the deposit/balance draft orders, and processes subscription billing.
            </li>
            <li>
              <strong>Resend</strong> — delivers enquiry-received, deposit-link, and status-update emails on the
              merchant's behalf.
            </li>
          </ul>
        </Section>

        <Section title="How long we keep data">
          <p>
            We keep a shop's data for as long as the app is installed. If a merchant uninstalls the app, we
            permanently delete all of that shop's data — studio profile, every commission record, uploaded images,
            and file — shortly after uninstall.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            If you're a customer and want to see what data we hold about you, or want it deleted, contact the studio
            you submitted a commission to, or reach us directly (below) and we'll action the request within 30 days.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or a data request:{" "}
            <a href="mailto:hello@cl-apps.net" style={{ color: ACCENT }}>
              hello@cl-apps.net
            </a>
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2
        style={{
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: 0.5,
          marginBottom: 12,
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15.5, lineHeight: 1.75, color: "#2c2c29" }}>{children}</div>
    </div>
  );
}
