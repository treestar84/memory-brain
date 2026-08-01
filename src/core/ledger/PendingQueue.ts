import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { randomUUID } from "node:crypto";

export type PendingItem = {
  id: string;
  enqueuedAt: string;
  payload: { type: string; data: Record<string, unknown> };
  sessionId?: string;
};

type PendingRecord = PendingItem | { tombstone: true; id: string; at: string };

const PENDING_PATH = "ledger/pending-analysis.jsonl";

function isTombstone(r: PendingRecord): r is { tombstone: true; id: string; at: string } {
  return (r as { tombstone?: boolean }).tombstone === true;
}

/**
 * Append-only queue: `enqueue`/`dequeue`/`removeExpired`/`drainForSession` only ever
 * append (item or tombstone) records, never rewrite the file. `list()` reduces the
 * append log to live items. This avoids the read-modify-rewrite race that two
 * concurrent hook processes would otherwise hit (each rewrite silently discarding
 * whatever the other process appended in between).
 */
export class PendingQueue {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock
  ) {}

  async enqueue(
    payload: { type: string; data: Record<string, unknown> },
    sessionId?: string
  ): Promise<PendingItem> {
    const item: PendingItem = {
      id: `pend-${randomUUID().slice(0, 8)}`,
      enqueuedAt: this.clock.isoNow(),
      payload,
      ...(sessionId !== undefined ? { sessionId } : {}),
    };
    await this.storage.appendJsonl(PENDING_PATH, item);
    return item;
  }

  async drainForSession(sessionId: string): Promise<PendingItem[]> {
    const items = await this.list();
    const mine = items.filter((i) => i.sessionId === sessionId);
    for (const i of mine) {
      await this.storage.appendJsonl(PENDING_PATH, this.tombstoneFor(i.id));
    }
    return mine;
  }

  async list(): Promise<PendingItem[]> {
    const records = await this.storage.readJsonl<PendingRecord>(PENDING_PATH);
    const tombstoned = new Set<string>();
    for (const r of records) {
      if (isTombstone(r)) tombstoned.add(r.id);
    }
    const items: PendingItem[] = [];
    for (const r of records) {
      if (!isTombstone(r) && !tombstoned.has(r.id)) items.push(r);
    }
    return items;
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }

  async peek(): Promise<PendingItem | null> {
    const items = await this.list();
    return items.length > 0 ? items[0] : null;
  }

  async dequeue(id: string): Promise<void> {
    await this.storage.appendJsonl(PENDING_PATH, this.tombstoneFor(id));
  }

  async removeExpired(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.storage.appendJsonl(PENDING_PATH, this.tombstoneFor(id));
    }
  }

  /**
   * Rewrites the append log down to just the live items, dropping consumed
   * items and their tombstones. Not called from any hook — callers must
   * guarantee no concurrent writer is active (e.g. a single offline maintenance
   * command), since this is the one operation that still does read-then-rewrite.
   */
  async compact(): Promise<{ before: number; after: number }> {
    const records = await this.storage.readJsonl<PendingRecord>(PENDING_PATH);
    const before = records.length;
    const live = await this.list();
    const content = live.map((i) => JSON.stringify(i)).join("\n") + (live.length ? "\n" : "");
    await this.storage.writeRaw(PENDING_PATH, content);
    return { before, after: live.length };
  }

  private tombstoneFor(id: string): { tombstone: true; id: string; at: string } {
    return { tombstone: true, id, at: this.clock.isoNow() };
  }
}
