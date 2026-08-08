import prisma from "./db.server";
import { unauthenticated } from "./shopify.server";
import { markDepositPaid, markBalancePaid } from "./bespoke.server";

// Creates a real Shopify Draft Order for either the deposit or the final
// balance of a commission, via the Admin GraphQL API, using the shop's
// offline access token — same pattern as Care's care-payment.server.js
// (markPaid was a stub there originally; this app ships the real flow
// from the start). Returns a real, Shopify-hosted invoiceUrl the customer
// pays through directly. Bespoke never touches card details.
export async function createPayableOrderForCommission(commissionId, shop, { kind }) {
  const commission = await prisma.commission.findUnique({ where: { id: commissionId } });
  if (!commission) throw new Error("Commission not found");

  const amount = kind === "deposit" ? commission.depositAmount : commission.balanceAmount;
  if (amount == null || amount <= 0) {
    throw new Error(`No ${kind} amount set on this commission`);
  }

  const { admin } = await unauthenticated.admin(shop);

  const title =
    kind === "deposit"
      ? `Deposit — ${commission.proposalTitle || commission.title}`
      : `Final balance — ${commission.proposalTitle || commission.title}`;

  const response = await admin.graphql(
    `#graphql
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          invoiceUrl
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: {
          email: commission.customerEmail,
          note: `Bespoke commission ${commission.id} (${kind}) — ${commission.title}`,
          customAttributes: [
            { key: "bespoke_commission_id", value: commission.id },
            { key: "bespoke_payment_kind", value: kind },
          ],
          lineItems: [
            {
              title,
              quantity: 1,
              originalUnitPrice: amount.toFixed(2),
            },
          ],
        },
      },
    },
  );

  const data = await response.json();
  const result = data?.data?.draftOrderCreate;
  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join("; "));
  }

  const draftOrder = result?.draftOrder;
  if (!draftOrder) throw new Error("Draft order creation returned no data");

  if (kind === "deposit") {
    await prisma.commission.update({
      where: { id: commissionId },
      data: { depositDraftOrderId: draftOrder.id, depositInvoiceUrl: draftOrder.invoiceUrl },
    });
  } else {
    await prisma.commission.update({
      where: { id: commissionId },
      data: { balanceDraftOrderId: draftOrder.id, balanceInvoiceUrl: draftOrder.invoiceUrl },
    });
  }

  return draftOrder;
}

// Manual fallback until the orders/create webhook is registered (same
// situation Care hit — protected-customer-data webhook approval is a
// separate Partner Dashboard step). A merchant can mark a deposit/balance
// paid by hand after checking Shopify admin; the customer-facing payment
// flow (accept terms -> real draft order -> pay via Shopify checkout)
// works today regardless.
export async function manuallyMarkDepositPaid(commissionId) {
  return markDepositPaid(commissionId, null);
}

export async function manuallyMarkBalancePaid(commissionId) {
  return markBalancePaid(commissionId, null);
}
