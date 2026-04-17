import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { randomUUID } from "node:crypto";

export type PendingItem = {
  id: string;
  enqueuedAt: string;
  payload: { type: string; data: Record<string, unknown> };
};

const PENDING_PATH = "ledger/pending-analysis.jsonl";

export class PendingQueue {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock
  ) {}

  async enqueue(payload: { type: string; data: Record<string, unknown> }): Promise<PendingItem> {
    const item: PendingItem = {
      id: `pend-${randomUUID().slice(0, 8)}`,
      enqueuedAt: this.clock.isoNow(),
      payload,
    };
    await this.storage.appendJsonl(PENDING_PATH, item);
    return item;
  }

  async list(): Promise<PendingItem[]> {
    return this.storage.readJsonl<PendingItem>(PENDING_PATH);
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }

  async peek(): Promise<PendingItem | null> {
    const items = await this.list();
    return items.length > 0 ? items[0] : null;
  }

  async dequeue(id: string): Promise<void> {
    const items = await this.list();
    const filtered = items.filter((i) => i.id !== id);
    await this.rewriteJsonl(filtered);
  }

  async removeExpired(ids: string[]): Promise<void> {
    const items = await this.list();
    const idSet = new Set(ids);
    const filtered = items.filter((i) => !idSet.has(i.id));
    await this.rewriteJsonl(filtered);
  }

  private async rewriteJsonl(items: PendingItem[]): Promise<void> {
    const content = items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : "");
    await this.storage.writeRaw(PENDING_PATH, content);
  }
}
