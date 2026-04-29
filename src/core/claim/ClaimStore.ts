import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { LearningLedger } from "../learning/LearningLedger";
import type { ClaimCandidate, ClaimStatus } from "./types";

const LEDGER_PATH = "claims/ledger.jsonl";

/**
 * Claim sidecar (ADR-012) + Graphiti supersede 모델 답습 (PR-V3.5, ADR-019 §3).
 *
 * append-only ledger + last-wins reduce. supersede / invalidate 는 명시
 * 메서드로 시점 시간(validFrom/validTo/invalidAt) 자동 설정.
 *
 * PR-V3.11 — learningLedger 주입 시 decide / supersede / invalidate 자동 기록.
 */
export class ClaimStore {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
    private readonly learningLedger?: LearningLedger,
  ) {}

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
    if (this.learningLedger) {
      await this.learningLedger.recordSupersede({
        ledger: "claim",
        prevId: prev.candidateId,
        newId: next.candidateId,
        detectorId: prev.detectedBy,
      });
    }
  }

  /**
   * claim 결정 — pending → accepted/rejected (PR-A1.1, PromotionLedger.decide 패턴 답습).
   * accept 시점에 validFrom = now 자동 설정 (Graphiti supersede 모델 정합).
   * 이미 decided 된 후보의 재결정은 --force --reason 필수.
   */
  async decide(
    candidateId: string,
    status: "accepted" | "rejected",
    opts: { reason?: string; decidedBy?: string; force?: boolean } = {},
  ): Promise<ClaimCandidate> {
    const base = await this.getById(candidateId);
    if (!base) throw new Error(`claim not found: ${candidateId}`);
    if (base.status !== "pending" && !opts.force) {
      throw new Error(`이미 결정됨 (${base.status}). 재결정하려면 --force --reason 사용`);
    }
    if (opts.force && !opts.reason) {
      throw new Error("--force 사용 시 --reason 필수");
    }
    const now = this.clock.isoNow();
    const updated: ClaimCandidate = {
      ...base,
      status,
      decidedAt: now,
      decidedBy: opts.decidedBy ?? "user",
      reason: opts.reason ?? null,
      validFrom: status === "accepted" ? (base.validFrom ?? now) : base.validFrom,
    };
    await this.append(updated);
    if (this.learningLedger) {
      await this.learningLedger.recordDecision({
        ledger: "claim",
        candidateId: updated.candidateId,
        detectorId: updated.detectedBy,
        decision: status,
        decidedBy: updated.decidedBy,
        reason: updated.reason,
      });
    }
    return updated;
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
    if (this.learningLedger) {
      await this.learningLedger.recordInvalidate({
        ledger: "claim",
        candidateId: claim.candidateId,
        detectorId: claim.detectedBy,
        reason,
      });
    }
  }
}
