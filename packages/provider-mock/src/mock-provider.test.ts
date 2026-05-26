import { describe, it, expect, beforeEach } from "vitest";
import { MockProvider } from "./mock-provider";

describe("MockProvider", () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
  });

  it("creates a payment with default 'paid' status", async () => {
    const session = await provider.createPayment({
      amount: { amount: 10, currency: "EUR" },
      description: "test",
    });

    expect(session.provider).toBe("mock");
    expect(session.status).toBe("paid");
    expect(session.paymentId).toMatch(/^mock_\d+$/);
    expect(session.checkoutUrl).toContain(session.paymentId);
  });

  it("respects the defaultStatus constructor option", async () => {
    const pending = new MockProvider({ defaultStatus: "pending" });
    const session = await pending.createPayment({
      amount: { amount: 10, currency: "EUR" },
      description: "test",
    });
    expect(session.status).toBe("pending");
  });

  it("returns the same session for duplicate idempotencyKey", async () => {
    const input = {
      amount: { amount: 10, currency: "EUR" },
      description: "test",
      idempotencyKey: "idem_1",
    };

    const first = await provider.createPayment(input);
    const second = await provider.createPayment(input);

    expect(first.paymentId).toBe(second.paymentId);
    expect(provider.getAll().size).toBe(1);
  });

  it("increments paymentId per call when no idempotencyKey", async () => {
    const input = { amount: { amount: 10, currency: "EUR" }, description: "test" };
    const a = await provider.createPayment(input);
    const b = await provider.createPayment(input);
    expect(a.paymentId).not.toBe(b.paymentId);
  });

  it("gets payment status", async () => {
    const session = await provider.createPayment({
      amount: { amount: 10, currency: "EUR" },
      description: "test",
    });
    expect(await provider.getPaymentStatus(session.paymentId)).toBe("paid");
  });

  it("allows status override via setStatus", async () => {
    const session = await provider.createPayment({
      amount: { amount: 10, currency: "EUR" },
      description: "test",
    });

    provider.setStatus(session.paymentId, "failed");
    expect(await provider.getPaymentStatus(session.paymentId)).toBe("failed");
  });

  it("throws on getPaymentStatus for unknown paymentId", async () => {
    await expect(provider.getPaymentStatus("unknown")).rejects.toThrow();
  });

  it("refunds a payment and transitions status to refunded", async () => {
    const session = await provider.createPayment({
      amount: { amount: 100, currency: "EUR" },
      description: "test",
    });

    const refund = await provider.refund(session.paymentId);
    expect(refund.status).toBe("succeeded");
    expect(refund.amount).toEqual({ amount: 100, currency: "EUR" });
    expect(await provider.getPaymentStatus(session.paymentId)).toBe("refunded");
  });

  it("refunds with a custom partial amount", async () => {
    const session = await provider.createPayment({
      amount: { amount: 100, currency: "EUR" },
      description: "test",
    });

    const refund = await provider.refund(session.paymentId, { amount: 50, currency: "EUR" });
    expect(refund.amount).toEqual({ amount: 50, currency: "EUR" });
  });

  it("rejects webhook with empty signature", async () => {
    await expect(provider.verifyWebhook({}, "")).rejects.toThrow();
  });

  it("accepts webhook with non-empty signature", async () => {
    const event = {
      type: "payment.paid" as const,
      paymentId: "pay_1",
      provider: "mock",
    };
    const result = await provider.verifyWebhook(event, "mock-sig");
    expect(result).toEqual(event);
  });

  it("reset clears all state", async () => {
    await provider.createPayment({ amount: { amount: 10, currency: "EUR" }, description: "test" });
    provider.reset();
    expect(provider.getAll().size).toBe(0);
  });
});
