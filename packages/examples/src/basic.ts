/**
 * Basic example: create a payment with MockProvider and grant an entitlement on success.
 * Run: pnpm --filter @openpay/examples basic
 */
import {
  OpenPayClient,
  MemoryEntitlementStore,
  EntitlementManager,
  toMinorUnits,
  formatMoney,
} from "@openpay/core";
import { MockProvider } from "@openpay/provider-mock";

async function main() {
  const provider = new MockProvider({ defaultStatus: "paid" });
  const client = new OpenPayClient({ provider });
  const store = new MemoryEntitlementStore();
  const entitlements = new EntitlementManager({ store });

  const amount = { amount: toMinorUnits(0.10, "EUR"), currency: "EUR" };

  console.log(`Creating payment for ${formatMoney(amount)}...`);

  const session = await client.createPayment({
    amount,
    description: "Article unlock",
    resourceId: "article_123",
    idempotencyKey: "user_456-article_123",
  });

  console.log("Session:", session);

  if (session.status === "paid") {
    await entitlements.grant({
      userId: "user_456",
      resourceId: "article_123",
      expiresAt: null,
      paymentId: session.paymentId,
    });
    console.log("Entitlement granted.");
  }

  const hasAccess = await entitlements.check("user_456", "article_123");
  console.log("Has access:", hasAccess);

  const noAccess = await entitlements.check("user_456", "article_456");
  console.log("Has access to different article:", noAccess);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
