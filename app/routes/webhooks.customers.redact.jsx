import { redactEmailRecords } from "../emailDelivery.server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Mandatory GDPR compliance webhook — redact this customer's data. Blanks
// the identifying fields on their Commission rows rather than deleting the
// commission history outright (may need retention for accounting/dispute
// purposes per the merchant's own retention policy — revisit before
// public launch).
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`, payload);

  const email = payload?.customer?.email;
  if (email) {
    const resources = await prisma.commission.findMany({ where: { merchant: { shop }, customerEmail: email }, select: { id: true } });
    await redactEmailRecords(shop, email, resources.map(r => r.id));
    await prisma.commission.updateMany({
      where: { merchant: { shop }, customerEmail: email },
      data: { customerEmail: "redacted@example.com", customerName: "Redacted" },
    });
  }

  return new Response();
};
