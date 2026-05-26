import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryReplayStore, ReplayProtection } from "./replay-protection";
import { OpenPayError } from "@openpay/core";

describe("MemoryReplayStore", () => {
  let store: MemoryReplayStore;

  beforeEach(() => {
    store = new MemoryReplayStore();
  });

  it("returns false for unseen event IDs", async () => {
    expect(await store.has("evt_1")).toBe(false);
  });

  it("returns true after marking an event", async () => {
    await store.mark("evt_1", 60);
    expect(await store.has("evt_1")).toBe(true);
  });

  it("returns false after TTL expires", async () => {
    vi.useFakeTimers();
    await store.mark("evt_1", 1); // 1 second TTL
    vi.advanceTimersByTime(1001);
    expect(await store.has("evt_1")).toBe(false);
    vi.useRealTimers();
  });
});

describe("ReplayProtection", () => {
  let protection: ReplayProtection;

  beforeEach(() => {
    protection = new ReplayProtection({ store: new MemoryReplayStore() });
  });

  it("isDuplicate returns false for new events", async () => {
    expect(await protection.isDuplicate("evt_1")).toBe(false);
  });

  it("isDuplicate returns true after record", async () => {
    await protection.record("evt_1");
    expect(await protection.isDuplicate("evt_1")).toBe(true);
  });

  it("checkAndRecord succeeds on first call", async () => {
    await expect(protection.checkAndRecord("evt_1")).resolves.toBeUndefined();
  });

  it("checkAndRecord throws OpenPayError on duplicate", async () => {
    await protection.checkAndRecord("evt_1");
    await expect(protection.checkAndRecord("evt_1")).rejects.toBeInstanceOf(OpenPayError);

    const err = await protection.checkAndRecord("evt_1").catch((e) => e) as OpenPayError;
    expect(err.code).toBe("WEBHOOK_REPLAY_DETECTED");
  });
});
