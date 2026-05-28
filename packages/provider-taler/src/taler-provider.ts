import { createHmac, timingSafeEqual } from "node:crypto";
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
  /** API key for the Merchant Backend (used for all authenticated calls). */
  apiKey: string;
  /** Where users land after completing or abandoning payment. */
  fulfillmentBaseUrl: string;
  /**
   * HMAC-SHA512 webhook signing secret.
   *
   * When set, verifyWebhook() computes HMAC-SHA512 over the raw request body and
   * compares it (constant-time) against the signature header before proceeding.
   * Configure the same value in your Taler Merchant Backend webhook settings.
   *
   * When omitted, webhook authenticity is established solely by re-fetching the
   * order status from the authenticated Merchant Backend API (see security note
   * on verifyWebhook). This is still secure but requires an extra network round-trip.
   */
  webhookSecret?: string;
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

/**
 * Normalise the incoming payload to a Buffer of the raw bytes and a parsed object.
 * The express webhook middleware passes req.body as a Buffer (when express.raw() is used),
 * so we must handle Buffer, string, and pre-parsed object inputs.
 */
function parsePayload(payload: unknown): { raw: Buffer; parsed: Record<string, unknown> } {
  if (Buffer.isBuffer(payload)) {
    try {
      return { raw: payload, parsed: JSON.parse(payload.toString("utf8")) as Record<string, unknown> };
    } catch {
      throw new OpenPayError("PROVIDER_ERROR", "Taler webhook: payload is not valid JSON");
    }
  }
  if (typeof payload === "string") {
    try {
      return {
        raw: Buffer.from(payload, "utf8"),
        parsed: JSON.parse(payload) as Record<string, unknown>,
      };
    } catch {
      throw new OpenPayError("PROVIDER_ERROR", "Taler webhook: payload is not valid JSON");
    }
  }
  if (typeof payload === "object" && payload !== null) {
    return {
      raw: Buffer.from(JSON.stringify(payload), "utf8"),
      parsed: payload as Record<string, unknown>,
    };
  }
  throw new OpenPayError("PROVIDER_ERROR", "Taler webhook: unexpected payload type");
}

/**
 * Verify HMAC-SHA512 of rawBody against the provided signature header.
 * Accepts both plain hex and "sha512=<hex>" formats.
 * Uses timingSafeEqual to prevent timing-based signature oracle attacks.
 */
function checkHmac(rawBody: Buffer, signature: string, secret: string): void {
  if (!signature) {
    throw new OpenPayError("WEBHOOK_SIGNATURE_INVALID", "Taler webhook: missing signature header");
  }

  const sig = signature.startsWith("sha512=") ? signature.slice(7) : signature;

  // SHA-512 hex digest is always 128 characters.
  if (!/^[0-9a-fA-F]{128}$/.test(sig)) {
    throw new OpenPayError(
      "WEBHOOK_SIGNATURE_INVALID",
      "Taler webhook: malformed signature (expected 128-char hex or sha512=<hex>)"
    );
  }

  const expected = createHmac("sha512", secret).update(rawBody).digest();
  const actual = Buffer.from(sig, "hex");

  if (!timingSafeEqual(expected, actual)) {
    throw new OpenPayError("WEBHOOK_SIGNATURE_INVALID", "Taler webhook: HMAC-SHA512 signature mismatch");
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

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { ...this.authHeaders(), ...init?.headers } });
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

  /**
   * Verify a Taler webhook notification and return a normalised WebhookEvent.
   *
   * Security model (two independent layers):
   *
   * 1. HMAC-SHA512 (when webhookSecret is configured)
   *    The raw request body is authenticated with HMAC-SHA512 using a shared secret
   *    before any payload fields are trusted. The comparison is constant-time to
   *    prevent timing attacks. Configure the same secret in the Taler Merchant Backend.
   *
   * 2. Authenticated re-fetch (always applied)
   *    After signature verification, the order status is re-fetched from the Merchant
   *    Backend using the API key. The returned event reflects the authoritative status
   *    from this call — not the payload field. An attacker who can forge or replay
   *    a webhook body cannot change what the Merchant Backend reports, making this
   *    layer independently sufficient when no webhookSecret is configured.
   *
   * Usage: mount your route with express.raw({ type: "application/json" }) so that
   * req.body arrives here as a Buffer and HMAC is computed over the exact bytes sent
   * by Taler.
   */
  async verifyWebhook(payload: unknown, signature: string): Promise<WebhookEvent> {
    const { raw, parsed } = parsePayload(payload);

    if (this.config.webhookSecret) {
      checkHmac(raw, signature, this.config.webhookSecret);
    }

    const orderId = typeof parsed["order_id"] === "string" ? parsed["order_id"] : null;
    if (!orderId) {
      throw new OpenPayError("PROVIDER_ERROR", "Taler webhook: missing order_id in payload");
    }

    // Re-fetch from the authenticated API — this is the authoritative confirmation.
    const status = await this.getPaymentStatus(orderId);

    const type: WebhookEvent["type"] =
      status === "paid" ? "payment.paid" :
      status === "refunded" ? "payment.refunded" :
      "payment.failed";

    return { type, paymentId: orderId, provider: this.name, metadata: parsed };
  }
}
