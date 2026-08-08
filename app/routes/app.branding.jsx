import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateMerchantProfile, updateMerchantProfile } from "../bespoke.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchantProfile(session.shop);
  return { merchant };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  await updateMerchantProfile(session.shop, {
    brandName: formData.get("brandName") || null,
    logoUrl: formData.get("logoUrl") || null,
    primaryColor: formData.get("primaryColor") || undefined,
    accentColor: formData.get("accentColor") || undefined,
    supportEmail: formData.get("supportEmail") || null,
    enquiryIntro: formData.get("enquiryIntro") || null,
  });
  return { ok: true };
};

export default function Branding() {
  const { merchant } = useLoaderData();
  const fetcher = useFetcher();

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <s-page heading="Branding" backAction={{ url: "/app" }}>
      <s-section heading="How your Bespoke pages and emails look">
        <s-paragraph>
          This controls the branding on the public enquiry form, the
          customer-facing commission page, and emails — same idea as the
          branding settings across the rest of the suite, kept separately
          per app until the shared branding layer exists.
        </s-paragraph>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetcher.submit(new FormData(e.currentTarget), { method: "POST" });
          }}
        >
          <s-stack direction="block" gap="base">
            <s-text-field name="brandName" label="Brand / studio name" defaultValue={merchant.brandName ?? ""} />
            <s-text-field name="logoUrl" label="Logo URL" defaultValue={merchant.logoUrl ?? ""} />
            <s-text-field name="primaryColor" label="Primary colour" defaultValue={merchant.primaryColor ?? ""} />
            <s-text-field name="accentColor" label="Accent colour" defaultValue={merchant.accentColor ?? ""} />
            <s-text-field name="supportEmail" label="Support email" defaultValue={merchant.supportEmail ?? ""} />
            <s-text-field
              name="enquiryIntro"
              label="Enquiry form intro copy"
              defaultValue={merchant.enquiryIntro ?? ""}
              details="Shown at the top of your public enquiry form."
            />
            <s-button type="submit">Save</s-button>
          </s-stack>
        </form>
      </s-section>

      <s-section slot="aside" heading="Your public enquiry form">
        <s-paragraph>
          Share this link wherever customers should start a custom
          commission — a "Custom orders" page, your bio link, or a button
          in your theme.
        </s-paragraph>
        <s-text-field label="Enquiry form URL" defaultValue={`${appUrl}/enquire/${merchant.shop}`} readOnly />
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
