import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateMerchantProfile, listCommissionsForMerchant, createEnquiry } from "../bespoke.server";
import { stageLabel } from "../bespoke-stages";
import { sendEnquiryReceivedEmail } from "../email.server";
import { publicOrigin } from "../publicOrigin.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchantProfile(session.shop);
  const commissions = await listCommissionsForMerchant(merchant.id);
  return { merchant, commissions };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchantProfile(session.shop);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const appUrl = publicOrigin(request.url);

  if (intent === "create_test_enquiry") {
    const commission = await createEnquiry(merchant.id, {
      customerName: "Test Customer",
      customerEmail: session.email || "candicersalter@gmail.com",
      title: "Custom engagement ring",
      description: "18ct gold band with a sapphire centre stone, size N.",
      budget: "£800 - £1,200",
      dimensions: "Ring size N",
      materials: "18ct gold, sapphire",
      quantity: 1,
      engravingText: "Together always",
    });
    const projectUrl = `${appUrl}/bespoke/${commission.token}`;
    const emailResult = await sendEnquiryReceivedEmail({ commission, merchant, projectUrl });
    if (emailResult.skipped) return { error: `The commission was saved, but email sending is unconfirmed: ${emailResult.reason}` };
    return { ok: true };
  }

  return { ok: false };
};

export default function Index() {
  const { merchant, commissions } = useLoaderData();
  const fetcher = useFetcher();

  const newEnquiries = commissions.filter((c) => c.status === "enquiry_received");
  const active = commissions.filter(
    (c) => !["enquiry_received", "locked", "declined"].includes(c.status),
  );
  const locked = commissions.filter((c) => c.status === "locked");
  const declined = commissions.filter((c) => c.status === "declined");

  const Row = ({ c }) => (
    <s-box key={c.id} padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-stack direction="block" gap="tight">
          <s-text weight="bold">{c.title}</s-text>
          <s-text tone="subdued">
            {c.customerName} · {c.customerEmail}
          </s-text>
          <s-badge>{stageLabel(c.status)}</s-badge>
        </s-stack>
        <s-link href={`/app/commissions/${c.id}`}>Open</s-link>
      </s-stack>
    </s-box>
  );

  return (
    <s-page heading="Bespoke">
      {fetcher.data?.error ? <s-banner tone="critical">{fetcher.data.error}</s-banner> : null}
      <s-button
        slot="primary-action"
        onClick={() => fetcher.submit({ intent: "create_test_enquiry" }, { method: "POST" })}
      >
        Create a test enquiry
      </s-button>

      <s-section heading={`New enquiries (${newEnquiries.length})`}>
        {newEnquiries.length === 0 && <s-paragraph>No new enquiries yet.</s-paragraph>}
        <s-stack direction="block" gap="base">
          {newEnquiries.map((c) => (
            <Row c={c} key={c.id} />
          ))}
        </s-stack>
      </s-section>

      <s-section heading={`Active commissions (${active.length})`}>
        {active.length === 0 && <s-paragraph>Nothing in progress right now.</s-paragraph>}
        <s-stack direction="block" gap="base">
          {active.map((c) => (
            <Row c={c} key={c.id} />
          ))}
        </s-stack>
      </s-section>

      <s-section heading={`Locked — ready for production (${locked.length})`}>
        {locked.length === 0 && <s-paragraph>None yet.</s-paragraph>}
        <s-stack direction="block" gap="base">
          {locked.map((c) => (
            <Row c={c} key={c.id} />
          ))}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Declined">
        <s-paragraph>{declined.length} declined enquiries.</s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Branding">
        <s-paragraph>{merchant.brandName || "Not set yet"}</s-paragraph>
        <s-link href="/app/branding">Edit branding</s-link>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
