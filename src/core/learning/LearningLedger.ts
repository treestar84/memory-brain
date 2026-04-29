import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type {
  LearningEvent,
  LearningDecisionEvent,
  LearningSupersedeEvent,
  LearningInvalidateEvent,
  LearningLedgerKind,
} from "./types";

const LEDGER_PATH = "state/learning.jsonl";

/**
 * Learning Ledger (PR-V3.11) — 결정 / supersede / invalidate 이벤트 append-only 기록.
 *
 * ClaimStore.decide / PromotionLedger.decide / supersede / invalidate 호출 시
 * 자동 기록. detector weight 계산의 source.
 *
 * 자체 직접 변경 안 함 — append 만. 통계는 DetectorWeight 에서.
 */
export class LearningLedger {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  async recordDecision(input: {
    ledger: LearningLedgerKind;
    candidateId: string;
    detectorId: string;
    decision: "accepted" | "rejected";
    decidedBy: string | null;
    reason: string | null;
  }): Promise<void> {
    const event: LearningDecisionEvent = {
      type: "decision",
      ledger: input.ledger,
      candidateId: input.candidateId,
      detectorId: input.detectorId,
      decision: input.decision,
      decidedAt: this.clock.isoNow(),
      decidedBy: input.decidedBy,
      reason: input.reason,
    };
    await this.storage.appendJsonl(LEDGER_PATH, event);
  }

  async recordSupersede(input: {
    ledger: LearningLedgerKind;
    prevId: string;
    newId: string;
    detectorId: string;
  }): Promise<void> {
    const event: LearningSupersedeEvent = {
      type: "supersede",
      ledger: input.ledger,
      prevId: input.prevId,
      newId: input.newId,
      detectorId: input.detectorId,
      at: this.clock.isoNow(),
    };
    await this.storage.appendJsonl(LEDGER_PATH, event);
  }

  async recordInvalidate(input: {
    ledger: LearningLedgerKind;
    candidateId: string;
    detectorId: string;
    reason: string;
  }): Promise<void> {
    const event: LearningInvalidateEvent = {
      type: "invalidate",
      ledger: input.ledger,
      candidateId: input.candidateId,
      detectorId: input.detectorId,
      reason: input.reason,
      at: this.clock.isoNow(),
    };
    await this.storage.appendJsonl(LEDGER_PATH, event);
  }

  async list(filter: { ledger?: LearningLedgerKind; type?: LearningEvent["type"] } = {}): Promise<LearningEvent[]> {
    const all = await this.storage.readJsonl<LearningEvent>(LEDGER_PATH);
    let result = all;
    if (filter.ledger) result = result.filter((e) => e.ledger === filter.ledger);
    if (filter.type) result = result.filter((e) => e.type === filter.type);
    return result;
  }
}
