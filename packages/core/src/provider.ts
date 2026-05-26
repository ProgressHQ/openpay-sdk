import type { CreatePaymentInput, PaymentSession, PaymentStatus, RefundResult, WebhookEvent } from "./types";
import type { Money } from "./money";

export interface PaymentProvider {
  readonly name: string;

  createPayment(input: CreatePaymentInput): Promise<PaymentSession>;

  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;

  /** Not all providers support refunds — check for presence before calling. */
  refund?(paymentId: string, amount?: Money): Promise<RefundResult>;

  /** Not all providers send webhooks — check for presence before calling. */
  verifyWebhook?(payload: unknown, signature: string): Promise<WebhookEvent>;
}
