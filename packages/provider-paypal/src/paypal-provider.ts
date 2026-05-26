// @openpay/provider-paypal
//
// Uses the PayPal Orders REST API v2 directly (no SDK dependency).
// Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in your environment.
// For sandbox, set baseUrl to "https://api-m.sandbox.paypal.com".

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

export interface PayPalProviderConfig {
  clientId: string;
  clientSecret: string;
  returnUrl: string;
  cancelUrl: string;
  /** Defaults to "https://api-m.paypal.com" (production). Use "https://api-m.sandbox.paypal.com" for testing. */
  baseUrl?: string;
}

function mapStatus(paypalStatus: string): PaymentStatus {
  const table: Record<string, PaymentStatus> = {
    CREATED: "created",
    SAVED: "pending",
    APPROVED: "requires_action",
    VOIDED: "cancelled",
    COMPLETED: "paid",
    PAYER_ACTION_REQUIRED: "requires_action",
  };
  return table[paypalStatus] ?? "pending";
}

export class PayPalProvider implements PaymentProvider {
  readonly name = "paypal";
  private accessToken: string | null = null;

  constructor(private readonly config: PayPalProviderConfig) {}

  private get base(): string {
    return this.config.baseUrl ?? "https://api-m.paypal.com";
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;

    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const res = await fetch(`${this.base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      throw new OpenPayError("PROVIDER_ERROR", `PayPal auth failed (${res.status})`);
    }

    const data = await res.json() as { access_token: string };
    this.accessToken = data.access_token;
    return this.accessToken;
  }

  private async fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getAccessToken();
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
    } catch (err) {
      throw new OpenPayError("PROVIDER_ERROR", "Could not reach PayPal API", err);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new OpenPayError("PROVIDER_ERROR", `PayPal responded ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    const decimal = fromMinorUnits(input.amount.amount, input.amount.currency);
    const order = await this.fetchJSON<{ id: string; status: string; links: Array<{ rel: string; href: string }> }>(
      "/v2/checkout/orders",
      {
        method: "POST",
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: {
                currency_code: input.amount.currency,
                value: decimal.toFixed(2),
              },
              description: input.description,
            },
          ],
          application_context: {
            return_url: this.config.returnUrl,
            cancel_url: this.config.cancelUrl,
          },
        }),
      }
    );

    const approvalLink = order.links.find((l) => l.rel === "approve")?.href;

    return {
      provider: this.name,
      paymentId: order.id,
      checkoutUrl: approvalLink,
      status: mapStatus(order.status),
      raw: order,
    };
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    const order = await this.fetchJSON<{ status: string }>(`/v2/checkout/orders/${paymentId}`);
    return mapStatus(order.status);
  }

  async refund(paymentId: string, amount?: Money): Promise<RefundResult> {
    // PayPal refunds are against captures, not orders.
    // This is a simplified implementation — in practice you'd retrieve the capture ID from the order first.
    const decimal = amount ? fromMinorUnits(amount.amount, amount.currency).toFixed(2) : undefined;
    const body: Record<string, unknown> = {};
    if (decimal && amount) {
      body["amount"] = { currency_code: amount.currency, value: decimal };
    }

    const refund = await this.fetchJSON<{ id: string; status: string }>(
      `/v2/payments/captures/${paymentId}/refund`,
      { method: "POST", body: JSON.stringify(body) }
    );

    return {
      refundId: refund.id,
      status: refund.status === "COMPLETED" ? "succeeded" : "pending",
      amount: amount ?? { amount: 0, currency: "USD" },
    };
  }

  async verifyWebhook(payload: unknown, signature: string): Promise<WebhookEvent> {
    // Full PayPal webhook verification requires calling their /v1/notifications/verify-webhook-signature
    // endpoint with the event body + headers. Implement that before going to production.
    if (!signature) {
      throw new OpenPayError("WEBHOOK_SIGNATURE_INVALID", "Missing PayPal webhook signature");
    }

    const event = payload as { event_type: string; resource: { id: string } };
    const typeMap: Record<string, WebhookEvent["type"] | undefined> = {
      "PAYMENT.CAPTURE.COMPLETED": "payment.paid",
      "PAYMENT.CAPTURE.DENIED": "payment.failed",
      "PAYMENT.CAPTURE.REFUNDED": "payment.refunded",
    };

    const type = typeMap[event.event_type];
    if (!type) {
      throw new OpenPayError("PROVIDER_ERROR", `Unhandled PayPal event: ${event.event_type}`);
    }

    return { type, paymentId: event.resource.id, provider: this.name };
  }
}
