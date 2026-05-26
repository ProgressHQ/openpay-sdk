import { describe, it, expect, beforeEach } from "vitest";
import { MemoryEntitlementStore, EntitlementManager } from "./entitlements";
import { OpenPayError } from "./errors";

describe("MemoryEntitlementStore", () => {
  let store: MemoryEntitlementStore;

  beforeEach(() => {
    store = new MemoryEntitlementStore();
  });

  it("grants and checks entitlements", async () => {
    await store.grant({ userId: "u1", resourceId: "r1", grantedAt: new Date(), expiresAt: null });
    expect(await store.check("u1", "r1")).toBe(true);
    expect(await store.check("u1", "r2")).toBe(false);
    expect(await store.check("u2", "r1")).toBe(false);
  });

  it("revokes entitlements", async () => {
    await store.grant({ userId: "u1", resourceId: "r1", grantedAt: new Date(), expiresAt: null });
    await store.revoke("u1", "r1");
    expect(await store.check("u1", "r1")).toBe(false);
  });

  it("treats expired entitlements as absent", async () => {
    const past = new Date(Date.now() - 1000);
    await store.grant({ userId: "u1", resourceId: "r1", grantedAt: new Date(), expiresAt: past });
    expect(await store.check("u1", "r1")).toBe(false);
  });

  it("does not expire entitlements with null expiresAt", async () => {
    await store.grant({ userId: "u1", resourceId: "r1", grantedAt: new Date(), expiresAt: null });
    expect(await store.check("u1", "r1")).toBe(true);
  });

  it("lists only active entitlements for a user", async () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 1000);
    await store.grant({ userId: "u1", resourceId: "r1", grantedAt: new Date(), expiresAt: future });
    await store.grant({ userId: "u1", resourceId: "r2", grantedAt: new Date(), expiresAt: null });
    await store.grant({ userId: "u1", resourceId: "r3", grantedAt: new Date(), expiresAt: past });
    await store.grant({ userId: "u2", resourceId: "r1", grantedAt: new Date(), expiresAt: null });

    const list = await store.list("u1");
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.resourceId).sort()).toEqual(["r1", "r2"]);
  });
});

describe("EntitlementManager", () => {
  it("wraps store errors in OpenPayError", async () => {
    const failingStore = {
      grant: async () => { throw new Error("DB down"); },
      check: async () => { throw new Error("DB down"); },
      revoke: async () => { throw new Error("DB down"); },
      list: async () => { throw new Error("DB down"); },
    };
    const manager = new EntitlementManager({ store: failingStore });

    await expect(manager.grant({ userId: "u1", resourceId: "r1", expiresAt: null }))
      .rejects.toBeInstanceOf(OpenPayError);
    await expect(manager.check("u1", "r1")).rejects.toBeInstanceOf(OpenPayError);
    await expect(manager.revoke("u1", "r1")).rejects.toBeInstanceOf(OpenPayError);
    await expect(manager.list("u1")).rejects.toBeInstanceOf(OpenPayError);
  });

  it("passes through successful operations", async () => {
    const store = new MemoryEntitlementStore();
    const manager = new EntitlementManager({ store });

    await manager.grant({ userId: "u1", resourceId: "r1", expiresAt: null, paymentId: "pay_1" });
    expect(await manager.check("u1", "r1")).toBe(true);

    await manager.revoke("u1", "r1");
    expect(await manager.check("u1", "r1")).toBe(false);
  });
});
