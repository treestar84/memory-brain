import { randomUUID } from "node:crypto";
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { FLOW_CONFIG } from "./config";
import type { BundleMetrics, ObservationBundle } from "./types";

type CurrentTurn = {
  sessionId: string;
  activeProblemId: string | null;
  turnOrdinal: number;
  openedAt: string;
};

export class ObservationBundler {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  private turnStatePath(sessionId: string): string {
    return `state/current-turn-${sessionId}.json`;
  }

  private bundlePath(bundleId: string, sealedAt: string): string {
    const d = new Date(sealedAt);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `ledger/bundles/${y}/${m}/${day}/${bundleId}.json`;
  }

  async openTurn(sessionId: string, activeProblemId: string | null, turnOrdinal: number): Promise<void> {
    const state: CurrentTurn = {
      sessionId, activeProblemId, turnOrdinal, openedAt: this.clock.isoNow(),
    };
    await this.storage.writeJsonAtomic(this.turnStatePath(sessionId), state);
  }

  async sealTurn(
    sessionId: string,
    observations: Array<Record<string, unknown>>,
    recentBlockIds: string[],
  ): Promise<ObservationBundle | null> {
    const state = await this.storage.readJson<CurrentTurn>(this.turnStatePath(sessionId));
    if (!state || !state.sessionId) return null;

    const sealedAt = this.clock.isoNow();
    const chunks = this.splitObservations(observations, FLOW_CONFIG.MAX_EVENTS_PER_BUNDLE);
    const chunksToProcess: Array<Record<string, unknown>>[] = chunks.length === 0 ? [[]] : chunks;

    let primary: ObservationBundle | null = null;
    for (let i = 0; i < chunksToProcess.length; i++) {
      const isPart = chunksToProcess.length > 1;
      const bundleId = `bnd_${sessionId}_t${state.turnOrdinal}${isPart ? `_p${i + 1}` : ""}_${randomUUID().slice(0, 4)}`;
      const bundle: ObservationBundle = {
        bundleId,
        activeProblemId: state.activeProblemId,
        sessionId,
        turnOrdinal: state.turnOrdinal,
        openedAt: state.openedAt,
        sealedAt,
        eventIds: [],
        observations: chunksToProcess[i],
        metrics: this.deriveMetrics(chunksToProcess[i]),
        recentBlockIds,
        processedAt: null,
        processedByVersion: null,
      };
      if (state.activeProblemId === null) {
        await this.storage.appendJsonl("ledger/orphan-bundles.jsonl", bundle);
      } else {
        await this.storage.writeJsonAtomic(this.bundlePath(bundleId, sealedAt), bundle);
      }
      if (i === 0) primary = bundle;
    }
    await this.storage.writeJsonAtomic(this.turnStatePath(sessionId), { closed: true, sealedAt });
    return primary;
  }

  private splitObservations<T>(obs: T[], max: number): T[][] {
    if (obs.length <= max) return [obs];
    const out: T[][] = [];
    for (let i = 0; i < obs.length; i += max) out.push(obs.slice(i, i + max));
    return out;
  }

  private deriveMetrics(obs: Array<Record<string, unknown>>): BundleMetrics {
    const toolCallCounts: Record<string, number> = {};
    const touched = new Set<string>();
    let success = 0, failure = 0, promptCount = 0;
    for (const o of obs) {
      const t = String(o.type ?? "");
      if (t.startsWith("tool:")) {
        toolCallCounts[t] = (toolCallCounts[t] ?? 0) + 1;
        const data = (o.data ?? {}) as Record<string, unknown>;
        for (const f of (data.filesTouched as string[] | undefined) ?? []) touched.add(f);
        if (typeof data.exitCode === "number") (data.exitCode === 0 ? success++ : failure++);
      } else if (t === "user-intent") {
        promptCount++;
      }
    }
    return { toolCallCounts, touchedFiles: Array.from(touched), bashExit: { success, failure }, promptCount };
  }

  async listUnprocessed(problemId?: string): Promise<ObservationBundle[]> {
    const root = "ledger/bundles";
    const results: ObservationBundle[] = [];
    await this.collect(root, results);
    const orphans = await this.storage.readJsonl<ObservationBundle>("ledger/orphan-bundles.jsonl");
    results.push(...orphans);
    return results.filter(b =>
      b.processedAt === null
      && (problemId === undefined || b.activeProblemId === problemId)
    );
  }

  private async collect(dir: string, out: ObservationBundle[]): Promise<void> {
    const entries = await this.storage.listFiles(dir);
    for (const e of entries) {
      if (e.endsWith(".json")) {
        const b = await this.storage.readJson<ObservationBundle>(`${dir}/${e}`);
        if (b) out.push(b);
      } else {
        await this.collect(`${dir}/${e}`, out);
      }
    }
  }

  async markProcessed(bundleId: string, version: string): Promise<void> {
    const root = "ledger/bundles";
    const found = await this.findBundle(root, bundleId);
    if (found) {
      found.bundle.processedAt = this.clock.isoNow();
      found.bundle.processedByVersion = version;
      await this.storage.writeJsonAtomic(found.path, found.bundle);
      return;
    }
    const orphans = await this.storage.readJsonl<ObservationBundle>("ledger/orphan-bundles.jsonl");
    const idx = orphans.findIndex(o => o.bundleId === bundleId);
    if (idx >= 0) {
      orphans[idx].processedAt = this.clock.isoNow();
      orphans[idx].processedByVersion = version;
      const content = orphans.map(o => JSON.stringify(o)).join("\n") + "\n";
      await this.storage.writeRaw("ledger/orphan-bundles.jsonl", content);
    }
  }

  private async findBundle(dir: string, bundleId: string): Promise<{ path: string; bundle: ObservationBundle } | null> {
    const entries = await this.storage.listFiles(dir);
    for (const e of entries) {
      const path = `${dir}/${e}`;
      if (e.endsWith(".json")) {
        const b = await this.storage.readJson<ObservationBundle>(path);
        if (b?.bundleId === bundleId) return { path, bundle: b };
      } else {
        const nested = await this.findBundle(path, bundleId);
        if (nested) return nested;
      }
    }
    return null;
  }
}
