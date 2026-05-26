# OpenPay SDK — Technical Design Document

## Overview

OpenPay SDK is an open-source, provider-neutral payment abstraction layer for SaaS applications and internet services.

The goal is to provide:

- unified payment APIs,
- privacy-preserving payment support,
- micropayment infrastructure,
- pluggable payment providers,
- reusable frontend/backend tooling,
- entitlement management for digital resources.

The SDK is designed to support:

- GNU Taler,
- Stripe,
- Mollie,
- PayPal,
- crypto providers,
- internal/private payment systems,
- mock/testing providers.

---

# Goals

## Primary goals

- Abstract payment provider complexity.
- Provide a unified developer experience.
- Enable privacy-preserving payment flows.
- Support micropayments and pay-per-use models.
- Support open web monetization.
- Provide reusable SaaS integration tooling.
- Remain provider-agnostic.

---

# Non-goals

The SDK is NOT intended to become:

- a full accounting system,
- ERP software,
- tax engine,
- enterprise billing suite,
- banking platform,
- KYC provider.

These may be added externally through integrations.

---

# Core Concept

Applications interact only with OpenPay APIs.

```txt
SaaS Application
        ↓
OpenPay SDK
        ↓
Provider Adapter Layer
 ├── GNU Taler
 ├── Stripe
 ├── Mollie
 ├── PayPal
 └── Mock Provider
```

This isolates business logic from payment infrastructure.

---

# Monorepo Structure

```txt
packages/
├── core/
├── provider-taler/
├── provider-stripe/
├── provider-mollie/
├── provider-paypal/
├── provider-mock/
├── react/
├── express/
├── webhooks/
└── examples/
```

---

# Package Responsibilities

## @openpay/core

Core abstractions and interfaces.

Responsibilities:

- payment interfaces,
- shared types,
- lifecycle state machine,
- client orchestration,
- common utilities.

---

## @openpay/provider-taler

GNU Taler integration.

Responsibilities:

- Merchant Backend API integration,
- payment creation,
- order status,
- refunds,
- webhook verification.

---

## @openpay/provider-stripe

Stripe adapter.

Responsibilities:

- PaymentIntent abstraction,
- webhook verification,
- status mapping,
- checkout session support.

---

## @openpay/react

Frontend components.

Responsibilities:

- payment buttons,
- checkout redirect helpers,
- hooks,
- status polling.

---

## @openpay/express

Backend middleware.

Responsibilities:

- webhook handling,
- entitlement middleware,
- request validation,
- payment verification.

---

# Core Interfaces

## Money

> **Design note:** `amount` must never be a bare `number` (IEEE 754 floats cannot represent most decimal currency values exactly — `0.1 + 0.2 !== 0.3`). All monetary values are expressed as integer minor units (cents, pence, euro-cents, etc.) alongside an ISO 4217 currency code. Callers that accept human-readable decimals (e.g. UI inputs) must convert before passing to the SDK.

```ts
interface Money {
  /**
   * Amount in minor units (integer).
   * Examples: 10 EUR = 1000, 0.05 EUR = 5, 0.001 USD = 0 (not representable — providers set minimum amounts).
   */
  amount: number; // integer, minor units only
  currency: string; // ISO 4217, e.g. "EUR", "USD"
}

/** Helper: convert human-readable decimal to minor units */
function toMinorUnits(decimal: number, currency: string): number {
  const exponent = CURRENCY_EXPONENTS[currency] ?? 2;
  return Math.round(decimal * 10 ** exponent);
}
```

> Providers that use non-decimal currencies (e.g. some crypto) extend `Money` with a `decimals` field.

---

## PaymentProvider

```ts
interface PaymentProvider {
  name: string;

  createPayment(
    input: CreatePaymentInput
  ): Promise<PaymentSession>;

  getPaymentStatus(
    paymentId: string
  ): Promise<PaymentStatus>;

  refund?(
    paymentId: string,
    amount?: Money
  ): Promise<RefundResult>;

  verifyWebhook?(
    payload: unknown,
    signature: string
  ): Promise<WebhookEvent>;
}
```

---

# Shared Domain Models

## PaymentStatus

```ts
type PaymentStatus =
  | "created"
  | "pending"
  | "requires_action"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded";
```

---

## CreatePaymentInput

```ts
interface CreatePaymentInput {
  amount: Money; // see Money type — integer minor units + currency

  description: string;

  customerId?: string;

  resourceId?: string;

  idempotencyKey?: string; // caller-supplied; prevents duplicate charges on retry

  metadata?: Record<string, string>;
}
```

> **Design note:** `idempotencyKey` is a first-class field, not an afterthought. Network retries and duplicate form submissions are common; providers (Stripe, Taler) support this natively. The SDK passes it through and tracks it in the optional payment store to prevent double-grants at the entitlement layer too.

---

## PaymentSession

```ts
interface PaymentSession {
  provider: string;

  paymentId: string;

  checkoutUrl?: string;

  status: PaymentStatus;

  raw?: unknown;
}
```

---

## RefundResult

```ts
interface RefundResult {
  refundId: string;
  status: "pending" | "succeeded" | "failed";
  amount: Money;
}
```

---

# Provider Normalization

Each provider has different APIs and terminology.

OpenPay normalizes them into a common model.

Example:

| Provider | Native Status | OpenPay Status |
|---|---|---|
| Stripe | succeeded | paid |
| Stripe | requires_action | requires_action |
| Taler | paid | paid |
| Mollie | open | pending |
| PayPal | completed | paid |

---

# Payment Flow

## Standard Checkout Flow

```txt
Client
  ↓
SaaS Backend
  ↓
OpenPay SDK
  ↓
Payment Provider
  ↓
Checkout URL
  ↓
User Payment
  ↓
Webhook
  ↓
Entitlement Unlock
```

---

# Entitlement System

The SDK is designed for digital access control.

Examples:

- article access,
- AI inference,
- API credits,
- downloads,
- premium features,
- streaming access.

---

## Entitlement Store (pluggable)

> **Design note:** Entitlement grants must be persisted somewhere, but the SDK should not impose a database. The solution is an `EntitlementStore` interface — the same adapter pattern used for providers. The SDK ships two built-in adapters: `MemoryEntitlementStore` (tests, demos) and `RedisEntitlementStore`. Applications plug in their own (Postgres, DynamoDB, etc.).

```ts
interface EntitlementStore {
  grant(entry: EntitlementEntry): Promise<void>;
  check(userId: string, resourceId: string): Promise<boolean>;
  revoke(userId: string, resourceId: string): Promise<void>;
  list(userId: string): Promise<EntitlementEntry[]>;
}

interface EntitlementEntry {
  userId: string;
  resourceId: string;
  grantedAt: Date;
  expiresAt: Date | null;
  paymentId?: string; // link back to the originating payment
  metadata?: Record<string, string>;
}
```

## Example

```ts
const store = new MemoryEntitlementStore(); // swap for RedisEntitlementStore, etc.

const entitlements = new EntitlementManager({ store });

await entitlements.grant({
  userId: "user_123",
  resourceId: "ai.summary.v1",
  expiresAt: null
});

const allowed = await entitlements.check("user_123", "ai.summary.v1"); // true
```

---

# Micropayment Design

Micropayments are a primary use case.

Examples:

| Use Case | Example | Minor units (EUR) |
|---|---|---|
| Pay-per-article | €0.05 | 5 |
| AI inference | €0.01 | 1 |
| API request | €0.001 | not representable — use credit bundles |
| File download | €0.10 | 10 |
| Video unlock | €0.25 | 25 |

> **Design note:** Sub-cent micropayments (€0.001) cannot be represented in standard minor units and most card networks won't process them. For very fine-grained usage billing, the recommended pattern is **credit bundles**: the user purchases a bundle (e.g. 1000 credits for €1.00), and the application deducts credits locally. The entitlement store tracks the balance. Only the bundle purchase flows through the payment provider.

---

# Privacy Principles

The SDK should support:

- minimal metadata collection,
- privacy-preserving providers,
- data portability,
- provider interoperability,
- optional anonymous payments.

GNU Taler becomes the reference privacy-preserving backend.

---

# Webhook Architecture

Providers notify the backend asynchronously.

```txt
Provider
   ↓
Webhook Endpoint
   ↓
Signature Verification
   ↓
Replay Protection (idempotency check)
   ↓
Event Normalization
   ↓
Business Logic
```

> **Design note:** Replay protection belongs in the SDK, not the application. The `@openpay/webhooks` package maintains a short-lived seen-events log (Redis or in-memory) keyed by `provider + eventId`. Duplicate deliveries are silently acknowledged (HTTP 200) without re-triggering business logic.

---

# Example Webhook Event

```ts
interface WebhookEvent {
  type:
    | "payment.paid"
    | "payment.failed"
    | "payment.refunded";

  paymentId: string;

  provider: string;

  idempotencyKey?: string;

  metadata?: Record<string, unknown>;
}
```

---

# Security Model

## Requirements

- webhook signature verification (per-provider HMAC or asymmetric),
- replay protection (idempotency tracking in webhook layer),
- idempotency keys on payment creation,
- secure secret storage (env vars; never committed config),
- provider isolation (one provider's secrets never reach another adapter),
- audit logging (structured logs on all state transitions).

## Error handling contract

> **Design note:** All SDK errors extend a base `OpenPayError` class with a machine-readable `code` field. This makes error handling programmatic rather than string-matching. Provider-specific error details are attached as `cause`.

```ts
class OpenPayError extends Error {
  constructor(
    public readonly code: OpenPayErrorCode,
    message: string,
    public readonly cause?: unknown
  ) { super(message); }
}

type OpenPayErrorCode =
  | "PROVIDER_ERROR"
  | "INVALID_AMOUNT"
  | "WEBHOOK_SIGNATURE_INVALID"
  | "WEBHOOK_REPLAY_DETECTED"
  | "ENTITLEMENT_STORE_ERROR"
  | "IDEMPOTENCY_CONFLICT";
```

---

# Frontend Components

## Example

```tsx
<PayButton
  amount={{ amount: 10, currency: "EUR" }} // 10 cents = €0.10
  resourceId="article_123"
  onSuccess={(session) => console.log("paid", session.paymentId)}
/>
```

---

# Example Backend Usage

```ts
const openpay = new OpenPayClient({ provider: stripeAdapter });

const payment = await openpay.createPayment({
  amount: { amount: 10, currency: "EUR" }, // €0.10 in minor units
  description: "Article unlock",
  resourceId: "article_123",
  idempotencyKey: `unlock-${userId}-article_123`
});

return payment.checkoutUrl;
```

---

# Recommended Tech Stack

## Language

TypeScript

## Runtime

Node.js

## Frontend

React

## API

REST-first

## Package Management

pnpm workspaces (preferred over npm workspaces — faster installs, strict isolation, native monorepo support)

---

# Database Recommendations

OpenPay itself remains database-agnostic via the `EntitlementStore` interface.

Shipped adapters:

- `MemoryEntitlementStore` — tests and demos,
- `RedisEntitlementStore` — production, short-lived entitlements and credit balances.

Community/application adapters:

- PostgreSQL,
- SQLite (demos),
- DynamoDB.

---

# Testing Strategy

## Unit Tests

- `Money` conversion helpers,
- provider status normalization,
- webhook signature verification,
- entitlement logic (grant, check, revoke, expiry).

## Integration Tests

- Stripe sandbox,
- GNU Taler sandbox,
- mock provider (deterministic, no network).

## Property-based Tests

- `Money` arithmetic: verify no floating-point drift across conversion round-trips,
- idempotency: same `idempotencyKey` never grants entitlement twice regardless of call order.

---

# Open Source Strategy

Recommended open-source scope:

Open:

- SDK core,
- provider adapters,
- UI components,
- middleware,
- examples,
- documentation.

Closed-source optional layers:

- hosted dashboards,
- analytics,
- enterprise tooling,
- SaaS business logic,
- compliance modules.

---

# Grant Positioning

## Recommended framing

> OpenPay SDK is an open-source interoperability layer enabling privacy-preserving micropayments and provider-neutral monetization for SaaS and open web applications.

---

# Ideal NGI Positioning

The project aligns with:

- GNU Taler ecosystem,
- privacy-preserving payments,
- open web monetization,
- federated applications,
- interoperable digital infrastructure,
- digital sovereignty,
- micropayment infrastructure.

---

# Suggested MVP

## Phase 1

- @openpay/core (Money type, PaymentProvider interface, OpenPayClient, OpenPayError hierarchy)
- @openpay/provider-mock (deterministic in-memory provider for tests and demos)
- @openpay/provider-taler (GNU Taler Merchant Backend integration)
- @openpay/react (PayButton component, usePayment hook)
- @openpay/express (webhook middleware, entitlement middleware)
- MemoryEntitlementStore and EntitlementManager
- Webhook replay protection
- Pay-per-resource demo (Express + React)

## Phase 2

- @openpay/provider-stripe
- RedisEntitlementStore
- @openpay/provider-mollie
- Credit bundle pattern (buy N credits, spend locally)

---

# Future Extensions

## Potential roadmap

- subscriptions and recurring billing,
- AI agent payments (machine-to-machine),
- wallet federation,
- DID/SSI integration,
- WebAuthn authentication,
- decentralized identity support,
- multi-provider fallback (try Taler, fall back to Stripe).

---

# Conclusion

OpenPay SDK aims to become:

- a universal payment abstraction layer,
- a privacy-friendly monetization toolkit,
- a micropayment infrastructure layer,
- an interoperability standard for internet payments.

The architecture prioritizes:

- modularity,
- extensibility,
- privacy,
- interoperability,
- developer experience,
- open-source collaboration.
