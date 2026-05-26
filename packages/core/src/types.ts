import type { Money } from "./money";

export type PaymentStatus =
  | "created"
  | "pending"
  | "requires_action"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded";

export interface CreatePaymentInput {
  /** Amount in integer minor units. Never pass a float. */
  amount: Money;
  description: string;
  customerId?: string;
  /** Logical resource being purchased (used for entitlement grants). */
  resourceId?: string;
  /** Caller-supplied key to prevent duplicate charges on network retries. */
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export interface PaymentSession {
  provider: string;
  paymentId: string;
  /** Redirect the user here to complete payment, when applicable. */
  checkoutUrl?: string;
  status: PaymentStatus;
  /** Raw provider response — for debugging and logging only. */
  raw?: unknown;
}

export interface RefundResult {
  refundId: string;
  status: "pending" | "succeeded" | "failed";
  amount: Money;
}

export interface WebhookEvent {
  type: "payment.paid" | "payment.failed" | "payment.refunded";
  paymentId: string;
  provider: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}
