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
import { CURRENCY_EXPONENTS } from "@openpay/core";

export interface TalerProviderConfig {
  /** URL of the GNU Taler Merchant Backend, e.g. "https://backend.demo.taler.net". */
  merchantBackendUrl: string;
  /** Merchant instance name, e.g. "default". */
  instance: string;
  /** API key for the Merchant Backend. */
  apiKey: string;
  /** Where users land after completing or abandoning payment. */
  fulfillmentBaseUrl: string;
}

/** Convert a Money value to Taler amount format: "CURRENCY:DECIMAL" e.g. "EUR:0.10". */
function toTalerAmount(money: Money): string {
  const exp = CURRENCY_EXPONENTS[money.currency] ?? 2;
  const decimal = (money.amount / 10 ** exp).toFixed(exp);
  return `${money.currency}:${decimal}`;
}

function mapStatus(talerStatus: string): PaymentStatus {
  switch (talerStatus) {
    case "paid": return "paid";
    case "unpaid": return "pending";
    case "claimed": return "requires_action";
    default: return "pending";
  }
}

interface TalerOrderResponse {
  order_status: string;
  taler_pay_uri?: string;
}

export class TalerProvider implements PaymentProvider {
  readonly name = "taler";

  constructor(private readonly config: TalerProviderConfig) {}

  private get base(): string {
    return `${this.config.merchantBackendUrl}/instances/${this.config.instance}/private`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { ...this.headers(), ...init?.headers } });
    } catch (err) {
      throw new OpenPayError("PROVIDER_ERROR", "Could not reach Taler merchant backend", err);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new OpenPayError("PROVIDER_ERROR", `Taler responded ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    const body: Record<string, unknown> = {
      amount: toTalerAmount(input.amount),
      summary: input.description,
      fulfillment_url: `${this.config.fulfillmentBaseUrl}/payment/complete`,
    };
    if (input.idempotencyKey) body["order_id"] = input.idempotencyKey;

    const created = await this.fetchJSON<{ order_id: string }>(`${this.base}/orders`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const order = await this.fetchJSON<TalerOrderResponse>(
      `${this.base}/orders/${created.order_id}`
    );

    return {
      provider: this.name,
      paymentId: created.order_id,
      checkoutUrl: order.taler_pay_uri,
      status: mapStatus(order.order_status),
      raw: order,
    };
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    const order = await this.fetchJSON<TalerOrderResponse>(`${this.base}/orders/${paymentId}`);
    return mapStatus(order.order_status);
  }

  async refund(paymentId: string, amount?: Money): Promise<RefundResult> {
    const body: Record<string, unknown> = { reason: "Customer refund request" };
    if (amount) body["refund"] = toTalerAmount(amount);

    await this.fetchJSON<unknown>(`${this.base}/orders/${paymentId}/refund`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      refundId: `${paymentId}-refund`,
      status: "pending",
      amount: amount ?? { amount: 0, currency: "EUR" },
    };
  }

  async verifyWebhook(payload: unknown, signature: string): Promise<WebhookEvent> {
    // Taler uses HMAC-SHA512 over the raw body. Verification depends on your Taler version
    // and whether you have configured a webhook signing key. For now we accept any non-empty
    // signature — replace this with real HMAC verification before going to production.
    if (!signature) {
      throw new OpenPayError("WEBHOOK_SIGNATURE_INVALID", "Missing Taler webhook signature");
    }

    const event = payload as { order_id: string; paid?: boolean };
    return {
      type: event.paid ? "payment.paid" : "payment.failed",
      paymentId: event.order_id,
      provider: this.name,
      metadata: payload as Record<string, unknown>,
    };
  }
}
