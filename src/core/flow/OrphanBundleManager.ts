import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { FLOW_CONFIG } from "./config";
import type { ObservationBundle } from "./types";

const ORPHAN_PATH = "ledger/orphan-bundles.jsonl";
const EXPIRED_PATH = "ledger/expired-bundles.jsonl";
const DISCARDED_PATH = "ledger/discarded-orphans.jsonl";

export class OrphanBundleManager {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  async listOrphans(): Promise<ObservationBundle[]> {
    const all = await this.storage.readJsonl<ObservationBundle>(ORPHAN_PATH);
    return all.filter(o => o.processedAt === null);
  }

  async attributeToProblem(bundleId: string, problemId: string): Promise<void> {
    const all = await this.storage.readJsonl<ObservationBundle>(ORPHAN_PATH);
    const idx = all.findIndex(o => o.bundleId === bundleId);
    if (idx < 0) return;
    const bundle = { ...all[idx], activeProblemId: problemId };
    all.splice(idx, 1);
    await this.storage.writeRaw(ORPHAN_PATH, all.map(o => JSON.stringify(o)).join("\n") + (all.length ? "\n" : ""));

    const d = new Date(bundle.sealedAt);
    const y = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    await this.storage.writeJsonAtomic(`ledger/bundles/${y}/${mm}/${dd}/${bundle.bundleId}.json`, bundle);
  }

  async sweepExpired(): Promise<number> {
    const all = await this.storage.readJsonl<ObservationBundle>(ORPHAN_PATH);
    const now = this.clock.now().getTime();
    const ttlMs = FLOW_CONFIG.BUNDLE_TTL_DAYS * 24 * 60 * 60 * 1000;
    const keep: ObservationBundle[] = [];
    const expired: ObservationBundle[] = [];
    for (const o of all) {
      if (now - new Date(o.sealedAt).getTime() > ttlMs) expired.push(o);
      else keep.push(o);
    }
    await this.storage.writeRaw(ORPHAN_PATH, keep.map(o => JSON.stringify(o)).join("\n") + (keep.length ? "\n" : ""));
    for (const e of expired) await this.storage.appendJsonl(EXPIRED_PATH, e);
    return expired.length;
  }

  async discardOrphan(bundleId: string, reason: string): Promise<void> {
    const all = await this.storage.readJsonl<ObservationBundle>(ORPHAN_PATH);
    const idx = all.findIndex(o => o.bundleId === bundleId);
    if (idx < 0) return;
    const bundle = all[idx];
    all.splice(idx, 1);
    await this.storage.writeRaw(ORPHAN_PATH, all.map(o => JSON.stringify(o)).join("\n") + (all.length ? "\n" : ""));
    await this.storage.appendJsonl(DISCARDED_PATH, { ...bundle, discardReason: reason, discardedAt: this.clock.isoNow() });
  }
}
