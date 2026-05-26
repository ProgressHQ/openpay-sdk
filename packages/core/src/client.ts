import { OpenPayError } from "./errors";
import type { PaymentProvider } from "./provider";
import type { CreatePaymentInput, PaymentSession, PaymentStatus, RefundResult } from "./types";
import type { Money } from "./money";

export interface OpenPayClientOptions {
  provider: PaymentProvider;
}

export class OpenPayClient {
  private readonly provider: PaymentProvider;

  constructor({ provider }: OpenPayClientOptions) {
    this.provider = provider;
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    if (!Number.isInteger(input.amount.amount) || input.amount.amount < 0) {
      throw new OpenPayError(
        "INVALID_AMOUNT",
        `amount must be a non-negative integer in minor units, got ${input.amount.amount}`
      );
    }
    try {
      return await this.provider.createPayment(input);
    } catch (err) {
      if (err instanceof OpenPayError) throw err;
      throw new OpenPayError("PROVIDER_ERROR", `${this.provider.name}: createPayment failed`, err);
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      return await this.provider.getPaymentStatus(paymentId);
    } catch (err) {
      if (err instanceof OpenPayError) throw err;
      throw new OpenPayError("PROVIDER_ERROR", `${this.provider.name}: getPaymentStatus failed`, err);
    }
  }

  async refund(paymentId: string, amount?: Money): Promise<RefundResult> {
    if (!this.provider.refund) {
      throw new OpenPayError("PROVIDER_ERROR", `${this.provider.name} does not support refunds`);
    }
    try {
      return await this.provider.refund(paymentId, amount);
    } catch (err) {
      if (err instanceof OpenPayError) throw err;
      throw new OpenPayError("PROVIDER_ERROR", `${this.provider.name}: refund failed`, err);
    }
  }
}
