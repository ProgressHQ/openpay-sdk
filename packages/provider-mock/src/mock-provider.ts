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

interface StoredPayment {
  session: PaymentSession;
  input: CreatePaymentInput;
}

export interface MockProviderOptions {
  /** Status assigned to newly created payments. Defaults to "paid" for easy happy-path testing. */
  defaultStatus?: PaymentStatus;
  /** Base URL for mock checkout links. */
  checkoutBaseUrl?: string;
}

export class MockProvider implements PaymentProvider {
  readonly name = "mock";

  private payments = new Map<string, StoredPayment>();
  private refunds = new Map<string, RefundResult>();
  private idempotencyIndex = new Map<string, string>(); // key → paymentId
  private counter = 0;

  private readonly defaultStatus: PaymentStatus;
  private readonly checkoutBaseUrl: string;

  constructor(options: MockProviderOptions = {}) {
    this.defaultStatus = options.defaultStatus ?? "paid";
    this.checkoutBaseUrl = options.checkoutBaseUrl ?? "https://mock.openpay.dev/checkout";
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    if (input.idempotencyKey) {
      const existingId = this.idempotencyIndex.get(input.idempotencyKey);
      if (existingId) {
        const stored = this.payments.get(existingId);
        if (!stored) throw new OpenPayError("PROVIDER_ERROR", "Mock: idempotency index corruption");
        return stored.session;
      }
    }

    const paymentId = `mock_${++this.counter}`;
    const session: PaymentSession = {
      provider: this.name,
      paymentId,
      checkoutUrl: `${this.checkoutBaseUrl}/${paymentId}`,
      status: this.defaultStatus,
    };

    this.payments.set(paymentId, { session, input });

    if (input.idempotencyKey) {
      this.idempotencyIndex.set(input.idempotencyKey, paymentId);
    }

    return session;
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    const stored = this.payments.get(paymentId);
    if (!stored) throw new OpenPayError("PROVIDER_ERROR", `Mock: payment not found: ${paymentId}`);
    return stored.session.status;
  }

  async refund(paymentId: string, amount?: Money): Promise<RefundResult> {
    const stored = this.payments.get(paymentId);
    if (!stored) throw new OpenPayError("PROVIDER_ERROR", `Mock: payment not found: ${paymentId}`);

    const refundAmount = amount ?? stored.input.amount;
    const refundId = `mock_refund_${paymentId}`;
    const result: RefundResult = { refundId, status: "succeeded", amount: refundAmount };

    this.refunds.set(refundId, result);
    stored.session.status = "refunded";

    return result;
  }

  async verifyWebhook(payload: unknown, signature: string): Promise<WebhookEvent> {
    if (!signature) {
      throw new OpenPayError("WEBHOOK_SIGNATURE_INVALID", "Mock: signature must be non-empty");
    }
    return payload as WebhookEvent;
  }

  /** Directly set a payment's status — lets tests simulate async provider transitions. */
  setStatus(paymentId: string, status: PaymentStatus): void {
    const stored = this.payments.get(paymentId);
    if (!stored) throw new Error(`Mock: payment not found: ${paymentId}`);
    stored.session.status = status;
  }

  /** All stored payments — use in test assertions. */
  getAll(): ReadonlyMap<string, StoredPayment> {
    return this.payments;
  }

  /** Wipe all state. Call in beforeEach. */
  reset(): void {
    this.payments.clear();
    this.refunds.clear();
    this.idempotencyIndex.clear();
    this.counter = 0;
  }
}
