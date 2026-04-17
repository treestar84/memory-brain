import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { PendingQueue, PendingItem } from "./PendingQueue";

const EXPIRED_PATH = "ledger/expired-analysis.jsonl";

export class Expirer {
  private readonly ttlMs: number;

  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
    ttlDays: number = 7
  ) {
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  }

  async sweep(queue: PendingQueue): Promise<number> {
    const items = await queue.list();
    const now = this.clock.now().getTime();
    const expired: PendingItem[] = [];
    const expiredIds: string[] = [];

    for (const item of items) {
      const age = now - new Date(item.enqueuedAt).getTime();
      if (age >= this.ttlMs) {
        expired.push(item);
        expiredIds.push(item.id);
      }
    }

    if (expired.length === 0) return 0;

    for (const item of expired) {
      await this.storage.appendJsonl(EXPIRED_PATH, {
        ...item,
        expiredAt: this.clock.isoNow(),
      });
    }

    await queue.removeExpired(expiredIds);
    return expired.length;
  }
}
