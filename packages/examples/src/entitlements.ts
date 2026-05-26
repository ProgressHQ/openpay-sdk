/**
 * Entitlement expiry and revocation example.
 * Run: pnpm --filter @openpay/examples entitlements
 */
import { MemoryEntitlementStore, EntitlementManager } from "@openpay/core";

async function main() {
  const store = new MemoryEntitlementStore();
  const manager = new EntitlementManager({ store });

  // Grant a permanent entitlement
  await manager.grant({ userId: "user_1", resourceId: "ebook_42", expiresAt: null });

  // Grant a time-limited entitlement (expires in 1 hour)
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  await manager.grant({ userId: "user_1", resourceId: "livestream_7", expiresAt: oneHourFromNow });

  // Grant an already-expired entitlement to demonstrate expiry behaviour
  const past = new Date(Date.now() - 1);
  await manager.grant({ userId: "user_1", resourceId: "expired_resource", expiresAt: past });

  console.log("ebook_42 access:       ", await manager.check("user_1", "ebook_42"));       // true
  console.log("livestream_7 access:   ", await manager.check("user_1", "livestream_7"));   // true
  console.log("expired_resource:      ", await manager.check("user_1", "expired_resource")); // false
  console.log("unlisted resource:     ", await manager.check("user_1", "unknown"));          // false

  const list = await manager.list("user_1");
  console.log("\nActive entitlements for user_1:");
  for (const e of list) {
    console.log(`  ${e.resourceId} — expires: ${e.expiresAt?.toISOString() ?? "never"}`);
  }

  await manager.revoke("user_1", "ebook_42");
  console.log("\nAfter revoking ebook_42:", await manager.check("user_1", "ebook_42")); // false
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
