import { OpenPayError } from "@openpay/core";

export interface ReplayProtectionStore {
  has(eventId: string): Promise<boolean>;
  mark(eventId: string, ttlSeconds: number): Promise<void>;
}

/** In-memory store with TTL-based expiry. Not durable across restarts. */
export class MemoryReplayStore implements ReplayProtectionStore {
  private readonly seen = new Map<string, number>(); // eventId → expiry ms

  async has(eventId: string): Promise<boolean> {
    const expiry = this.seen.get(eventId);
    if (expiry === undefined) return false;
    if (Date.now() > expiry) {
      this.seen.delete(eventId);
      return false;
    }
    return true;
  }

  async mark(eventId: string, ttlSeconds: number): Promise<void> {
    this.seen.set(eventId, Date.now() + ttlSeconds * 1000);
  }

  /** Evict all expired entries. Call periodically in long-running processes. */
  gc(): void {
    const now = Date.now();
    for (const [id, expiry] of this.seen) {
      if (now > expiry) this.seen.delete(id);
    }
  }
}

export interface ReplayProtectionOptions {
  store: ReplayProtectionStore;
  /** How long to remember a seen event ID. Defaults to 300 seconds (5 minutes). */
  ttlSeconds?: number;
}

export class ReplayProtection {
  private readonly store: ReplayProtectionStore;
  private readonly ttlSeconds: number;

  constructor({ store, ttlSeconds = 300 }: ReplayProtectionOptions) {
    this.store = store;
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Check if an event has been seen before.
   * Returns true if this is a replay, false if it's new.
   *
   * Usage:
   *   if (await protection.isDuplicate(eventId)) throw new OpenPayError("WEBHOOK_REPLAY_DETECTED", ...);
   *   await protection.record(eventId);
   */
  async isDuplicate(eventId: string): Promise<boolean> {
    return this.store.has(eventId);
  }

  async record(eventId: string): Promise<void> {
    await this.store.mark(eventId, this.ttlSeconds);
  }

  /**
   * Convenience: throw OpenPayError("WEBHOOK_REPLAY_DETECTED") if the event has been seen before,
   * otherwise record it.
   */
  async checkAndRecord(eventId: string): Promise<void> {
    if (await this.store.has(eventId)) {
      throw new OpenPayError("WEBHOOK_REPLAY_DETECTED", `Duplicate webhook event: ${eventId}`);
    }
    await this.store.mark(eventId, this.ttlSeconds);
  }
}
