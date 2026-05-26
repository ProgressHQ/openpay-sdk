# OpenPay SDK

Provider-neutral payment abstraction layer for SaaS applications and internet services.

```
SaaS Application
      ↓
OpenPay SDK
      ↓
Provider Adapter Layer
 ├── GNU Taler   (privacy-preserving, reference provider)
 ├── Stripe
 ├── Mollie
 ├── PayPal
 └── Mock        (tests and demos)
```

Your business logic talks only to OpenPay. Swap or combine providers without touching application code.

---

## Packages

| Package | Description |
|---|---|
| [`@openpay/core`](packages/core) | Interfaces, types, `OpenPayClient`, `EntitlementManager` |
| [`@openpay/provider-mock`](packages/provider-mock) | Deterministic in-memory provider for tests |
| [`@openpay/provider-taler`](packages/provider-taler) | GNU Taler Merchant Backend integration |
| [`@openpay/provider-stripe`](packages/provider-stripe) | Stripe adapter (install `stripe` to activate) |
| [`@openpay/provider-mollie`](packages/provider-mollie) | Mollie adapter (install `@mollie/api-client` to activate) |
| [`@openpay/provider-paypal`](packages/provider-paypal) | PayPal Orders API v2 (no extra SDK required) |
| [`@openpay/react`](packages/react) | `<PayButton>` component and `usePayment` hook |
| [`@openpay/express`](packages/express) | Webhook middleware and entitlement guard |
| [`@openpay/webhooks`](packages/webhooks) | Replay protection utilities |
| [`@openpay/examples`](packages/examples) | Runnable end-to-end examples |

---

## Quick start

```bash
pnpm add @openpay/core @openpay/provider-mock
```

```ts
import { OpenPayClient, toMinorUnits } from "@openpay/core";
import { MockProvider } from "@openpay/provider-mock";

const client = new OpenPayClient({
  provider: new MockProvider(),
});

const session = await client.createPayment({
  amount: { amount: toMinorUnits(0.10, "EUR"), currency: "EUR" },
  description: "Article unlock",
  resourceId: "article_123",
  idempotencyKey: "user_456-article_123",
});

console.log(session.checkoutUrl); // redirect the user here
```

---

## Money

All amounts are **integer minor units** — never floats.

```ts
import { toMinorUnits, fromMinorUnits, formatMoney } from "@openpay/core";

toMinorUnits(0.10, "EUR")   // → 10  (10 euro-cents)
toMinorUnits(9.99, "EUR")   // → 999
toMinorUnits(100, "JPY")    // → 100 (JPY has no sub-unit)

fromMinorUnits(10, "EUR")   // → 0.10
formatMoney({ amount: 10, currency: "EUR" }) // → "€0.10"
```

Use `toMinorUnits` only at system boundaries (user input, config files). Everywhere inside the SDK, pass `Money` directly.

---

## Entitlements

Grant and check access to digital resources after a payment is confirmed.

```ts
import { MemoryEntitlementStore, EntitlementManager } from "@openpay/core";

const manager = new EntitlementManager({
  store: new MemoryEntitlementStore(), // swap for RedisEntitlementStore in production
});

// After a successful payment webhook:
await manager.grant({
  userId: "user_456",
  resourceId: "article_123",
  expiresAt: null,          // null = permanent; pass a Date for time-limited access
  paymentId: session.paymentId,
});

// In your access-control layer:
const allowed = await manager.check("user_456", "article_123"); // true
```

The `EntitlementStore` interface is pluggable — implement it against any database.

```ts
import type { EntitlementStore, EntitlementEntry } from "@openpay/core";

class PostgresEntitlementStore implements EntitlementStore {
  async grant(entry: EntitlementEntry) { /* INSERT ... */ }
  async check(userId, resourceId) { /* SELECT ... */ }
  async revoke(userId, resourceId) { /* DELETE ... */ }
  async list(userId) { /* SELECT ... */ }
}
```

---

## Providers

### GNU Taler

```ts
import { TalerProvider } from "@openpay/provider-taler";

const provider = new TalerProvider({
  merchantBackendUrl: "https://backend.demo.taler.net",
  instance: "default",
  apiKey: process.env.TALER_API_KEY!,
  fulfillmentBaseUrl: "https://myapp.example.com",
});
```

### Stripe

```bash
pnpm add stripe
```

Open `packages/provider-stripe/src/stripe-provider.ts` and uncomment the implementation blocks.

```ts
import { StripeProvider } from "@openpay/provider-stripe";

const provider = new StripeProvider({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});
```

### Mollie

```bash
pnpm add @mollie/api-client
```

Open `packages/provider-mollie/src/mollie-provider.ts` and uncomment the implementation blocks.

### PayPal

No extra package required — uses the PayPal Orders API v2 directly.

```ts
import { PayPalProvider } from "@openpay/provider-paypal";

const provider = new PayPalProvider({
  clientId: process.env.PAYPAL_CLIENT_ID!,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
  returnUrl: "https://myapp.example.com/payment/complete",
  cancelUrl: "https://myapp.example.com/payment/cancel",
  baseUrl: "https://api-m.sandbox.paypal.com", // omit for production
});
```

### Mock (tests)

```ts
import { MockProvider } from "@openpay/provider-mock";

// Defaults to "paid" so happy-path tests require no extra setup.
const provider = new MockProvider({ defaultStatus: "paid" });

// Simulate async status transitions in tests:
provider.setStatus(session.paymentId, "failed");

// Reset between tests:
beforeEach(() => provider.reset());
```

---

## Express integration

### Webhooks

Mount with `express.raw()` so the raw body is available for signature verification.

```ts
import express from "express";
import { webhookMiddleware } from "@openpay/express";

app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  webhookMiddleware(stripeProvider, async (event) => {
    if (event.type === "payment.paid") {
      await entitlements.grant({ /* ... */ });
    }
  })
);
```

### Entitlement guard

```ts
import { requireEntitlement } from "@openpay/express";

app.get(
  "/articles/:resourceId",
  requireEntitlement(manager, {
    getUserId: (req) => req.user.id,
    // getResourceId defaults to req.params.resourceId
  }),
  (req, res) => res.json(article)
);
```

---

## React

```tsx
import { PayButton } from "@openpay/react";
import { toMinorUnits } from "@openpay/core";

<PayButton
  amount={{ amount: toMinorUnits(0.10, "EUR"), currency: "EUR" }}
  resourceId="article_123"
  endpoint="/api/payments"
  onSuccess={(session) => console.log("paid", session.paymentId)}
/>
```

```ts
import { usePayment } from "@openpay/react";

const { createPayment, loading, session, error } = usePayment({
  endpoint: "/api/payments",
});
```

---

## Webhook replay protection

```ts
import { ReplayProtection, MemoryReplayStore } from "@openpay/webhooks";

const protection = new ReplayProtection({
  store: new MemoryReplayStore(),
  ttlSeconds: 300,
});

// In your webhook handler — throws OpenPayError("WEBHOOK_REPLAY_DETECTED") on duplicates:
await protection.checkAndRecord(event.paymentId);
```

---

## Payment flow

```
Client browser
      ↓  POST /api/payments
SaaS backend
      ↓  openpay.createPayment(...)
OpenPay SDK  →  Provider API  →  checkoutUrl
      ↓  redirect user
Provider checkout page
      ↓  user pays
Provider  →  POST /webhooks/:provider
      ↓  verifyWebhook + replay check
      ↓  entitlements.grant(...)
Access unlocked
```

---

## Status normalization

| Provider | Native status | OpenPay status |
|---|---|---|
| Stripe | `succeeded` | `paid` |
| Stripe | `requires_action` | `requires_action` |
| Stripe | `canceled` | `cancelled` |
| Taler | `paid` | `paid` |
| Taler | `unpaid` | `pending` |
| Mollie | `open` | `pending` |
| Mollie | `paid` | `paid` |
| Mollie | `canceled` | `cancelled` |
| PayPal | `COMPLETED` | `paid` |
| PayPal | `VOIDED` | `cancelled` |
| PayPal | `APPROVED` | `requires_action` |

---

## Development

### Prerequisites

- Node.js 20+
- pnpm 8+

### Setup

```bash
git clone https://github.com/your-org/openpay-sdk
cd openpay-sdk
pnpm install
```

### Commands

```bash
pnpm test          # run all 40 tests
pnpm test:watch    # watch mode
pnpm build         # build all packages to dist/
pnpm typecheck     # type-check all packages
```

### Run examples

```bash
pnpm --filter @openpay/examples add -D tsx   # once
pnpm --filter @openpay/examples basic        # full payment + entitlement demo
pnpm --filter @openpay/examples entitlements # expiry and revocation demo
```

### Monorepo structure

```
packages/
├── core/               @openpay/core
├── provider-mock/      @openpay/provider-mock
├── provider-taler/     @openpay/provider-taler
├── provider-stripe/    @openpay/provider-stripe
├── provider-mollie/    @openpay/provider-mollie
├── provider-paypal/    @openpay/provider-paypal
├── react/              @openpay/react
├── express/            @openpay/express
├── webhooks/           @openpay/webhooks
└── examples/           runnable demos
```

Each package is a self-contained TypeScript module with its own `package.json`, `tsconfig.json`, and `tsup.config.ts`. `@openpay/core` types flow through all other packages via `workspace:*` dependencies.

### Adding a new provider

1. Copy `packages/provider-mock` as a starting point.
2. Implement the `PaymentProvider` interface from `@openpay/core`.
3. Map your provider's native statuses to `PaymentStatus`.
4. Export `verifyWebhook` if your provider sends signed webhooks.
5. Add the package to `pnpm-workspace.yaml` (already covered by `packages/*`).

---

## Design principles

- **Integer money** — `amount` is always minor units (cents). No floats cross the API boundary.
- **Idempotency** — pass `idempotencyKey` on `createPayment` to make retries safe.
- **Pluggable stores** — both `PaymentProvider` and `EntitlementStore` are interfaces. The SDK ships in-memory defaults; production adapters are swapped in by the application.
- **Replay protection** — duplicate webhook deliveries are detected and silently acknowledged before business logic runs.
- **Error hierarchy** — all errors are `OpenPayError` with a machine-readable `code`. No string-matching.

---

## Security

- Webhook signatures must be verified by each provider adapter before events are processed.
- Secrets (`apiKey`, `webhookSecret`) are constructor arguments — never hard-coded or logged.
- Replay protection prevents double-grants from duplicate webhook deliveries.
- `idempotencyKey` prevents double-charges from network retries.

---

## License

MIT
