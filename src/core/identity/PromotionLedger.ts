import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { PromotedCandidate, PromotionStatus } from "./types";

const LEDGER_PATH = "identity/promoted-candidates.jsonl";

export class PromotionLedger {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  async append(candidate: PromotedCandidate): Promise<void> {
    await this.storage.appendJsonl(LEDGER_PATH, candidate);
  }

  async list(filter: { status?: PromotionStatus } = {}): Promise<PromotedCandidate[]> {
    const all = await this.storage.readJsonl<PromotedCandidate>(LEDGER_PATH);
    const lastWins = new Map<string, PromotedCandidate>();
    for (const c of all) {
      lastWins.set(c.candidateId, c);
    }
    const reduced = Array.from(lastWins.values());
    if (filter.status) return reduced.filter((c) => c.status === filter.status);
    return reduced;
  }

  async getById(candidateId: string): Promise<PromotedCandidate | null> {
    const all = await this.list();
    return all.find((c) => c.candidateId === candidateId) ?? null;
  }

  async decide(
    candidateId: string,
    status: "accepted" | "rejected",
    opts: { reason?: string; decidedBy?: string; force?: boolean } = {},
  ): Promise<PromotedCandidate> {
    const base = await this.getById(candidateId);
    if (!base) throw new Error(`candidate not found: ${candidateId}`);
    if (base.status !== "pending" && !opts.force) {
      throw new Error(
        `이미 결정됨 (${base.status}). 재결정하려면 --force --reason 사용`,
      );
    }
    if (opts.force && !opts.reason) {
      throw new Error("--force 사용 시 --reason 필수");
    }
    const updated: PromotedCandidate = {
      ...base,
      status,
      decidedAt: this.clock.isoNow(),
      decidedBy: opts.decidedBy ?? "user",
      reason: opts.reason ?? null,
    };
    await this.append(updated);
    return updated;
  }
}
