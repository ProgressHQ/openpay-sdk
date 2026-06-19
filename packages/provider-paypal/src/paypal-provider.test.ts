import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PayPalProvider } from "./paypal-provider";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeProvider(): PayPalProvider {
  return new PayPalProvider({
    clientId: "client_id",
    clientSecret: "client_secret",
    returnUrl: "https://merchant.test/return",
    cancelUrl: "https://merchant.test/cancel",
    baseUrl: "https://api-m.sandbox.paypal.com",
  });
}

function mockOrderFetches(fetchMock: ReturnType<typeof vi.fn>, orderId = "ORDER-1"): void {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ access_token: "token_123" }))
    .mockResolvedValueOnce(jsonResponse({
      id: orderId,
      status: "CREATED",
      links: [{ rel: "approve", href: "https://paypal.test/checkout" }],
    }));
}

describe("PayPalProvider.createPayment idempotency", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends PayPal-Request-Id when idempotencyKey is provided", async () => {
    mockOrderFetches(fetchMock);
    const provider = makeProvider();

    const session = await provider.createPayment({
      amount: { amount: 1299, currency: "USD" },
      description: "Pro plan",
      idempotencyKey: "checkout-user-123-pro",
    });

    expect(session.paymentId).toBe("ORDER-1");
    const [, createOrderInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(createOrderInit.headers).toMatchObject({
      Authorization: "Bearer token_123",
      "Content-Type": "application/json",
      "PayPal-Request-Id": "checkout-user-123-pro",
    });
  });

  it("omits PayPal-Request-Id when idempotencyKey is not provided", async () => {
    mockOrderFetches(fetchMock);
    const provider = makeProvider();

    await provider.createPayment({
      amount: { amount: 1299, currency: "USD" },
      description: "Pro plan",
    });

    const [, createOrderInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(createOrderInit.headers).not.toHaveProperty("PayPal-Request-Id");
  });

  it("reuses the same PayPal-Request-Id on caller retries with the same key", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token_123" }))
      .mockResolvedValueOnce(jsonResponse({
        id: "ORDER-1",
        status: "CREATED",
        links: [{ rel: "approve", href: "https://paypal.test/checkout" }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "ORDER-1",
        status: "CREATED",
        links: [{ rel: "approve", href: "https://paypal.test/checkout" }],
      }));
    const provider = makeProvider();
    const input = {
      amount: { amount: 1299, currency: "USD" },
      description: "Pro plan",
      idempotencyKey: "checkout-user-123-pro",
    };

    await provider.createPayment(input);
    await provider.createPayment(input);

    const orderHeaders = fetchMock.mock.calls
      .slice(1)
      .map(([, init]) => (init as RequestInit).headers);
    expect(orderHeaders).toEqual([
      expect.objectContaining({ "PayPal-Request-Id": "checkout-user-123-pro" }),
      expect.objectContaining({ "PayPal-Request-Id": "checkout-user-123-pro" }),
    ]);
  });
});
