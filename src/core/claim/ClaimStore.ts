import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { ClaimCandidate, ClaimStatus } from "./types";

const LEDGER_PATH = "claims/ledger.jsonl";

/**
 * Claim sidecar (ADR-012) + Graphiti supersede 모델 답습 (PR-V3.5, ADR-019 §3).
 *
 * append-only ledger + last-wins reduce. supersede / invalidate 는 명시
 * 메서드로 시점 시간(validFrom/validTo/invalidAt) 자동 설정.
 */
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

  /**
   * 이전 claim 을 새 candidate 로 supersede.
   * - 이전 claim: status = "superseded", validTo = now, supersededBy = newId.
   * - 새 candidate: validFrom = now, status 는 호출자가 지정한 값 그대로 (보통 "accepted" 또는 "pending").
   * 두 record 가 모두 ledger 에 append 되어 last-wins reduce 시 갱신된 형태로 보임.
   */
  async supersede(prevId: string, next: ClaimCandidate): Promise<void> {
    const prev = await this.getById(prevId);
    if (!prev) throw new Error(`claim not found: ${prevId}`);
    if (prev.status === "superseded") {
      throw new Error(`already superseded: ${prevId}`);
    }
    const now = this.clock.isoNow();

    const updatedPrev: ClaimCandidate = {
      ...prev,
      status: "superseded",
      validTo: now,
      supersededBy: next.candidateId,
    };
    await this.append(updatedPrev);

    const newWithValidFrom: ClaimCandidate = {
      ...next,
      validFrom: next.validFrom ?? now,
      validTo: next.validTo ?? null,
      invalidAt: next.invalidAt ?? null,
    };
    await this.append(newWithValidFrom);
  }

  /**
   * claim 을 invalid 로 표시 — 유효했으나 후속 검증으로 무효 판명.
   * status 는 그대로 두고 invalidAt + reason 만 갱신 (rejected 와 의미 다름).
   * rejected 는 "처음부터 거부", invalidAt 은 "한때 유효했으나 무효 판명".
   */
  async invalidate(id: string, reason: string): Promise<void> {
    const claim = await this.getById(id);
    if (!claim) throw new Error(`claim not found: ${id}`);
    if (claim.invalidAt) {
      throw new Error(`already invalidated: ${id}`);
    }
    const now = this.clock.isoNow();
    const updated: ClaimCandidate = {
      ...claim,
      invalidAt: now,
      reason: reason,
    };
    await this.append(updated);
  }
}
