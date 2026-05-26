import { describe, it, expect, vi } from "vitest";
import { OpenPayClient } from "./client";
import { OpenPayError } from "./errors";
import type { PaymentProvider, PaymentSession, PaymentStatus } from "./index";

function makeProvider(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    name: "test",
    createPayment: vi.fn().mockResolvedValue({
      provider: "test",
      paymentId: "pay_1",
      status: "paid",
    } satisfies PaymentSession),
    getPaymentStatus: vi.fn().mockResolvedValue("paid" satisfies PaymentStatus),
    ...overrides,
  };
}

describe("OpenPayClient.createPayment", () => {
  it("delegates to provider", async () => {
    const provider = makeProvider();
    const client = new OpenPayClient({ provider });

    const session = await client.createPayment({
      amount: { amount: 100, currency: "EUR" },
      description: "test",
    });

    expect(session.paymentId).toBe("pay_1");
    expect(provider.createPayment).toHaveBeenCalledOnce();
  });

  it("rejects float amounts", async () => {
    const client = new OpenPayClient({ provider: makeProvider() });

    await expect(
      client.createPayment({ amount: { amount: 0.10, currency: "EUR" }, description: "test" })
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("rejects negative amounts", async () => {
    const client = new OpenPayClient({ provider: makeProvider() });

    await expect(
      client.createPayment({ amount: { amount: -1, currency: "EUR" }, description: "test" })
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("allows zero amount (free resources)", async () => {
    const provider = makeProvider();
    const client = new OpenPayClient({ provider });

    await expect(
      client.createPayment({ amount: { amount: 0, currency: "EUR" }, description: "free" })
    ).resolves.toBeDefined();
  });

  it("wraps unexpected provider errors in OpenPayError", async () => {
    const provider = makeProvider({
      createPayment: vi.fn().mockRejectedValue(new Error("network timeout")),
    });
    const client = new OpenPayClient({ provider });

    const err = await client
      .createPayment({ amount: { amount: 10, currency: "EUR" }, description: "test" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(OpenPayError);
    expect(err.code).toBe("PROVIDER_ERROR");
  });

  it("passes OpenPayError through without re-wrapping", async () => {
    const original = new OpenPayError("IDEMPOTENCY_CONFLICT", "duplicate");
    const provider = makeProvider({
      createPayment: vi.fn().mockRejectedValue(original),
    });
    const client = new OpenPayClient({ provider });

    const err = await client
      .createPayment({ amount: { amount: 10, currency: "EUR" }, description: "test" })
      .catch((e) => e);
    expect(err).toBe(original);
  });
});

describe("OpenPayClient.refund", () => {
  it("throws when provider has no refund support", async () => {
    const provider = makeProvider({ refund: undefined });
    const client = new OpenPayClient({ provider });

    await expect(client.refund("pay_1")).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("calls provider.refund when available", async () => {
    const refundFn = vi.fn().mockResolvedValue({
      refundId: "ref_1",
      status: "succeeded",
      amount: { amount: 100, currency: "EUR" },
    });
    const provider = makeProvider({ refund: refundFn });
    const client = new OpenPayClient({ provider });

    const result = await client.refund("pay_1");
    expect(result.refundId).toBe("ref_1");
    expect(refundFn).toHaveBeenCalledWith("pay_1", undefined);
  });
});
