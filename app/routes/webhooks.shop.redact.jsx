import { redactEmailRecords } from "../emailDelivery.server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Mandatory GDPR compliance webhook — 48 hours after uninstall, Shopify
// asks us to erase all shop data.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`, payload);

  const merchant = await prisma.merchantProfile.findUnique({ where: { shop } });
  if (merchant) {
    const commissions = await prisma.commission.findMany({
      where: { merchantId: merchant.id },
      select: { id: true },
    });
    const commissionIds = commissions.map((c) => c.id);
    await prisma.changeRequest.deleteMany({ where: { commissionId: { in: commissionIds } } });
    await prisma.commissionFile.deleteMany({ where: { commissionId: { in: commissionIds } } });
    await prisma.commissionUpdate.deleteMany({ where: { commissionId: { in: commissionIds } } });
    await prisma.commission.deleteMany({ where: { merchantId: merchant.id } });
    await prisma.merchantProfile.delete({ where: { id: merchant.id } });
  }

  await redactEmailRecords(shop);

  return new Response();
};
