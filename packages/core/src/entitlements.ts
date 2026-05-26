import { OpenPayError } from "./errors";

export interface EntitlementEntry {
  userId: string;
  resourceId: string;
  grantedAt: Date;
  expiresAt: Date | null;
  /** Links the entitlement back to its originating payment for auditing. */
  paymentId?: string;
  metadata?: Record<string, string>;
}

export interface EntitlementStore {
  grant(entry: EntitlementEntry): Promise<void>;
  check(userId: string, resourceId: string): Promise<boolean>;
  revoke(userId: string, resourceId: string): Promise<void>;
  list(userId: string): Promise<EntitlementEntry[]>;
}

/** In-memory store — use in tests and demos. Not durable across restarts. */
export class MemoryEntitlementStore implements EntitlementStore {
  private readonly entries = new Map<string, EntitlementEntry>();

  private key(userId: string, resourceId: string): string {
    return `${userId}\0${resourceId}`;
  }

  async grant(entry: EntitlementEntry): Promise<void> {
    this.entries.set(this.key(entry.userId, entry.resourceId), entry);
  }

  async check(userId: string, resourceId: string): Promise<boolean> {
    const entry = this.entries.get(this.key(userId, resourceId));
    if (!entry) return false;
    if (entry.expiresAt !== null && entry.expiresAt < new Date()) {
      this.entries.delete(this.key(userId, resourceId));
      return false;
    }
    return true;
  }

  async revoke(userId: string, resourceId: string): Promise<void> {
    this.entries.delete(this.key(userId, resourceId));
  }

  async list(userId: string): Promise<EntitlementEntry[]> {
    const now = new Date();
    return Array.from(this.entries.values()).filter(
      (e) => e.userId === userId && (e.expiresAt === null || e.expiresAt > now)
    );
  }
}

export interface EntitlementManagerOptions {
  store: EntitlementStore;
}

export class EntitlementManager {
  private readonly store: EntitlementStore;

  constructor({ store }: EntitlementManagerOptions) {
    this.store = store;
  }

  async grant(params: {
    userId: string;
    resourceId: string;
    expiresAt: Date | null;
    paymentId?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    try {
      await this.store.grant({ ...params, grantedAt: new Date() });
    } catch (err) {
      throw new OpenPayError("ENTITLEMENT_STORE_ERROR", "Failed to grant entitlement", err);
    }
  }

  async check(userId: string, resourceId: string): Promise<boolean> {
    try {
      return await this.store.check(userId, resourceId);
    } catch (err) {
      throw new OpenPayError("ENTITLEMENT_STORE_ERROR", "Failed to check entitlement", err);
    }
  }

  async revoke(userId: string, resourceId: string): Promise<void> {
    try {
      await this.store.revoke(userId, resourceId);
    } catch (err) {
      throw new OpenPayError("ENTITLEMENT_STORE_ERROR", "Failed to revoke entitlement", err);
    }
  }

  async list(userId: string): Promise<EntitlementEntry[]> {
    try {
      return await this.store.list(userId);
    } catch (err) {
      throw new OpenPayError("ENTITLEMENT_STORE_ERROR", "Failed to list entitlements", err);
    }
  }
}
