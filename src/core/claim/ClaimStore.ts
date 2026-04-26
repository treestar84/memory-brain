import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { ClaimCandidate, ClaimStatus } from "./types";

const LEDGER_PATH = "claims/ledger.jsonl";

export class ClaimStore {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  async append(candidate: ClaimCandidate): Promise<void> {
    await this.storage.appendJsonl(LEDGER_PATH, candidate);
  }

  async list(filter: { status?: ClaimStatus } = {}): Promise<ClaimCandidate[]> {
    const all = await this.storage.readJsonl<ClaimCandidate>(LEDGER_PATH);
    const lastWins = new Map<string, ClaimCandidate>();
    for (const c of all) lastWins.set(c.candidateId, c);
    const reduced = Array.from(lastWins.values());
    if (filter.status) return reduced.filter((c) => c.status === filter.status);
    return reduced;
  }

  async getById(candidateId: string): Promise<ClaimCandidate | null> {
    const all = await this.list();
    return all.find((c) => c.candidateId === candidateId) ?? null;
  }
}
