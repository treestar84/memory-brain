import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { CanonicalEvent } from "../events/CanonicalEvent";

export class RawLedger {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock
  ) {}

  async append(event: CanonicalEvent): Promise<void> {
    const now = this.clock.now();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const path = `ledger/raw/${yyyy}/${mm}/${dd}/session-${event.sessionId}.jsonl`;

    const entry = {
      event,
      hash: await this.computeHash(event),
      recordedAt: this.clock.isoNow(),
    };

    await this.storage.appendJsonl(path, entry);
  }

  private async computeHash(event: CanonicalEvent): Promise<string> {
    const data = JSON.stringify({
      stage: event.stage,
      sessionId: event.sessionId,
      timestampIso: event.timestampIso,
      payload: event.payload,
    });
    const hash = new Bun.CryptoHasher("sha256").update(data).digest("hex");
    return hash.slice(0, 16);
  }
}
