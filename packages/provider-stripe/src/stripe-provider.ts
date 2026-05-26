// @openpay/provider-stripe
//
// Prerequisites: pnpm add stripe
// Then uncomment the implementation blocks and remove the notReady() throws.

import { OpenPayError } from "@openpay/core";
import type {
  PaymentProvider,
  CreatePaymentInput,
  PaymentSession,
  PaymentStatus,
  RefundResult,
  WebhookEvent,
  Money,
} from "@openpay/core";

// import Stripe from "stripe";

export interface StripeProviderConfig {
  secretKey: string;
  webhookSecret: string;
}

function mapStatus(status: string): PaymentStatus {
  const table: Record<string, PaymentStatus> = {
    succeeded: "paid",
    requires_action: "requires_action",
    requires_payment_method: "requires_action",
    requires_confirmation: "requires_action",
    processing: "pending",
    canceled: "cancelled",
    requires_capture: "pending",
  };
  return table[status] ?? "pending";
}

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe";
  // private readonly client: Stripe;

  constructor(private readonly config: StripeProviderConfig) {
    // this.client = new Stripe(config.secretKey);
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    // const intent = await this.client.paymentIntents.create(
    //   {
    //     amount: input.amount.amount,
    //     currency: input.amount.currency.toLowerCase(),
    //     description: input.description,
    //     metadata: input.metadata ?? {},
    //   },
    //   { idempotencyKey: input.idempotencyKey }
    // );
    // return {
    //   provider: this.name,
    //   paymentId: intent.id,
    //   status: mapStatus(intent.status),
    //   raw: intent,
    // };
    throw notReady();
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    // const intent = await this.client.paymentIntents.retrieve(paymentId);
    // return mapStatus(intent.status);
    throw notReady();
  }

  async refund(paymentId: string, amount?: Money): Promise<RefundResult> {
    // const refund = await this.client.refunds.create({
    //   payment_intent: paymentId,
    //   ...(amount ? { amount: amount.amount } : {}),
    // });
    // return {
    //   refundId: refund.id,
    //   status: refund.status === "succeeded" ? "succeeded"
    //         : refund.status === "failed" ? "failed"
    //         : "pending",
    //   amount: amount ?? { amount: 0, currency: "USD" },
    // };
    throw notReady();
  }

  async verifyWebhook(payload: unknown, signature: string): Promise<WebhookEvent> {
    // const event = this.client.webhooks.constructEvent(
    //   payload as Buffer | string,
    //   signature,
    //   this.config.webhookSecret
    // );
    // const typeMap: Record<string, WebhookEvent["type"] | undefined> = {
    //   "payment_intent.succeeded": "payment.paid",
    //   "payment_intent.payment_failed": "payment.failed",
    //   "charge.refunded": "payment.refunded",
    // };
    // const type = typeMap[event.type];
    // if (!type) throw new OpenPayError("PROVIDER_ERROR", `Unhandled Stripe event: ${event.type}`);
    // const obj = event.data.object as { id: string };
    // return { type, paymentId: obj.id, provider: this.name };
    throw notReady();
  }
}

function notReady(): OpenPayError {
  return new OpenPayError(
    "PROVIDER_ERROR",
    "StripeProvider: run `pnpm add stripe` and uncomment the implementation in stripe-provider.ts"
  );
}
