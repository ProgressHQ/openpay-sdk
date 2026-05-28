import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { TalerProvider } from "./taler-provider";
import { OpenPayError } from "@openpay/core";

const BASE_CONFIG = {
  merchantBackendUrl: "https://backend.example.com",
  instance: "test",
  apiKey: "test-api-key",
  fulfillmentBaseUrl: "https://example.com",
};

const WEBHOOK_SECRET = "super-secret-hmac-key";

/** Compute the correct HMAC-SHA512 signature for a given body and secret. */
function sign(body: string | Buffer, secret: string): string {
  return createHmac("sha512", secret)
    .update(typeof body === "string" ? Buffer.from(body, "utf8") : body)
    .digest("hex");
}

/** Mock global fetch to return a Taler order status response. */
function mockFetchStatus(orderStatus: string) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ order_status: orderStatus }),
    text: async () => "",
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("TalerProvider.verifyWebhook — HMAC verification", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts a valid HMAC-SHA512 signature and re-fetches status", async () => {
    mockFetchStatus("paid");
    const provider = new TalerProvider({ ...BASE_CONFIG, webhookSecret: WEBHOOK_SECRET });

    const payload = JSON.stringify({ order_id: "ord_1" });
    const sig = sign(payload, WEBHOOK_SECRET);

    const event = await provider.verifyWebhook(Buffer.from(payload), sig);
    expect(event.type).toBe("payment.paid");
    expect(event.paymentId).toBe("ord_1");
  });

  it("accepts the sha512=<hex> prefix format", async () => {
    mockFetchStatus("paid");
    const provider = new TalerProvider({ ...BASE_CONFIG, webhookSecret: WEBHOOK_SECRET });

    const payload = JSON.stringify({ order_id: "ord_1" });
    const sig = `sha512=${sign(payload, WEBHOOK_SECRET)}`;

    await expect(provider.verifyWebhook(Buffer.from(payload), sig)).resolves.toBeDefined();
  });

  it("rejects a tampered payload (wrong HMAC)", async () => {
    const provider = new TalerProvider({ ...BASE_CONFIG, webhookSecret: WEBHOOK_SECRET });

    const payload = JSON.stringify({ order_id: "ord_1" });
    const wrongSig = sign(payload + "tampered", WEBHOOK_SECRET);

    const err = await provider.verifyWebhook(Buffer.from(payload), wrongSig).catch((e) => e);
    expect(err).toBeInstanceOf(OpenPayError);
    expect(err.code).toBe("WEBHOOK_SIGNATURE_INVALID");
  });

  it("rejects a valid payload signed with the wrong secret", async () => {
    const provider = new TalerProvider({ ...BASE_CONFIG, webhookSecret: WEBHOOK_SECRET });

    const payload = JSON.stringify({ order_id: "ord_1" });
    const wrongSig = sign(payload, "different-secret");

    const err = await provider.verifyWebhook(Buffer.from(payload), wrongSig).catch((e) => e);
    expect(err).toBeInstanceOf(OpenPayError);
    expect(err.code).toBe("WEBHOOK_SIGNATURE_INVALID");
  });

  it("rejects an empty signature when webhookSecret is configured", async () => {
    const provider = new TalerProvider({ ...BASE_CONFIG, webhookSecret: WEBHOOK_SECRET });

    const payload = JSON.stringify({ order_id: "ord_1" });

    const err = await provider.verifyWebhook(Buffer.from(payload), "").catch((e) => e);
    expect(err).toBeInstanceOf(OpenPayError);
    expect(err.code).toBe("WEBHOOK_SIGNATURE_INVALID");
  });

  it("rejects a malformed (non-hex) signature", async () => {
    const provider = new TalerProvider({ ...BASE_CONFIG, webhookSecret: WEBHOOK_SECRET });

    const err = await provider.verifyWebhook(Buffer.from("{}"), "not-a-hex-value").catch((e) => e);
    expect(err).toBeInstanceOf(OpenPayError);
    expect(err.code).toBe("WEBHOOK_SIGNATURE_INVALID");
  });
});

describe("TalerProvider.verifyWebhook — re-fetch confirmation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps paid order status to payment.paid", async () => {
    mockFetchStatus("paid");
    const provider = new TalerProvider(BASE_CONFIG); // no webhookSecret

    const event = await provider.verifyWebhook({ order_id: "ord_1" }, "");
    expect(event.type).toBe("payment.paid");
    expect(event.paymentId).toBe("ord_1");
  });

  it("maps unpaid order status to payment.failed", async () => {
    mockFetchStatus("unpaid");
    const provider = new TalerProvider(BASE_CONFIG);

    const event = await provider.verifyWebhook({ order_id: "ord_1" }, "");
    expect(event.type).toBe("payment.failed");
  });

  it("reports the re-fetched status, not the payload field", async () => {
    // Payload claims "paid" but the backend says "unpaid" — the re-fetch wins.
    mockFetchStatus("unpaid");
    const provider = new TalerProvider(BASE_CONFIG);

    // Even if someone forges { order_id: "ord_1", paid: true } the re-fetch overrides it.
    const event = await provider.verifyWebhook({ order_id: "ord_1", paid: true }, "");
    expect(event.type).toBe("payment.failed");
  });

  it("throws when order_id is missing from payload", async () => {
    const provider = new TalerProvider(BASE_CONFIG);

    const err = await provider.verifyWebhook({ no_order_id: true }, "").catch((e) => e);
    expect(err).toBeInstanceOf(OpenPayError);
    expect(err.code).toBe("PROVIDER_ERROR");
  });

  it("accepts a Buffer payload", async () => {
    mockFetchStatus("paid");
    const provider = new TalerProvider(BASE_CONFIG);

    const buf = Buffer.from(JSON.stringify({ order_id: "ord_buf" }), "utf8");
    const event = await provider.verifyWebhook(buf, "");
    expect(event.paymentId).toBe("ord_buf");
  });

  it("accepts a string payload", async () => {
    mockFetchStatus("paid");
    const provider = new TalerProvider(BASE_CONFIG);

    const event = await provider.verifyWebhook('{"order_id":"ord_str"}', "");
    expect(event.paymentId).toBe("ord_str");
  });
});

describe("TalerProvider.verifyWebhook — HMAC + re-fetch combined", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("still re-fetches status even after HMAC passes", async () => {
    // The re-fetch should always happen — HMAC is not a substitute for it.
    const fetchMock = mockFetchStatus("paid");
    const provider = new TalerProvider({ ...BASE_CONFIG, webhookSecret: WEBHOOK_SECRET });

    const payload = JSON.stringify({ order_id: "ord_1" });
    await provider.verifyWebhook(Buffer.from(payload), sign(payload, WEBHOOK_SECRET));

    // One fetch call for getPaymentStatus
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
