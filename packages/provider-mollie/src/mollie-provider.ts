// @openpay/provider-mollie
//
// Prerequisites: pnpm add @mollie/api-client
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
import { fromMinorUnits } from "@openpay/core";

// import { createMollieClient, MollieClient } from "@mollie/api-client";

export interface MollieProviderConfig {
  apiKey: string;
  webhookUrl?: string;
  redirectUrl: string;
}

function mapStatus(mollieStatus: string): PaymentStatus {
  const table: Record<string, PaymentStatus> = {
    open: "pending",
    pending: "pending",
    authorized: "requires_action",
    paid: "paid",
    failed: "failed",
    canceled: "cancelled",
    expired: "failed",
    refunded: "refunded",
  };
  return table[mollieStatus] ?? "pending";
}

export class MollieProvider implements PaymentProvider {
  readonly name = "mollie";
  // private readonly client: MollieClient;

  constructor(private readonly config: MollieProviderConfig) {
    // this.client = createMollieClient({ apiKey: config.apiKey });
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    // const decimal = fromMinorUnits(input.amount.amount, input.amount.currency);
    // const payment = await this.client.payments.create({
    //   amount: { value: decimal.toFixed(2), currency: input.amount.currency },
    //   description: input.description,
    //   redirectUrl: this.config.redirectUrl,
    //   webhookUrl: this.config.webhookUrl,
    //   metadata: input.metadata,
    // });
    // return {
    //   provider: this.name,
    //   paymentId: payment.id,
    //   checkoutUrl: payment.getCheckoutUrl() ?? undefined,
    //   status: mapStatus(payment.status),
    //   raw: payment,
    // };
    throw notReady();
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    // const payment = await this.client.payments.get(paymentId);
    // return mapStatus(payment.status);
    throw notReady();
  }

  async refund(paymentId: string, amount?: Money): Promise<RefundResult> {
    // const decimal = amount ? fromMinorUnits(amount.amount, amount.currency).toFixed(2) : undefined;
    // const refund = await this.client.paymentRefunds.create({
    //   paymentId,
    //   ...(decimal && amount ? { amount: { value: decimal, currency: amount.currency } } : {}),
    // });
    // return {
    //   refundId: refund.id,
    //   status: "pending",
    //   amount: amount ?? { amount: 0, currency: "EUR" },
    // };
    throw notReady();
  }
}

function notReady(): OpenPayError {
  return new OpenPayError(
    "PROVIDER_ERROR",
    "MollieProvider: run `pnpm add @mollie/api-client` and uncomment the implementation in mollie-provider.ts"
  );
}
