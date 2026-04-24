import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { FlowGraph } from "../flow/types";
import type {
  AskedRecord,
  AskedResolution,
  CurrentGapsSnapshot,
  DetectorId,
  PendingQuestionRecord,
} from "./types";

const QUEUE_VERSION = "gap-analyzer@1.0.0";
const PENDING_PATH = "ledger/questions/pending.jsonl";
const ASKED_PATH = "ledger/questions/asked.jsonl";
const CURRENT_GAPS_PATH = "state/current-gaps.json";

export class QuestionQueue {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
  ) {}

  async rebuild(graph: FlowGraph): Promise<void> {
    const gaps = graph.blocks.filter((b) => b.type === "Gap");
    const questions = graph.blocks.filter((b) => b.type === "Question");
    const questionByGap = new Map<string, string>();
    for (const q of questions) {
      if (q.gapBlockId) questionByGap.set(q.gapBlockId, q.blockId);
    }

    const snap: CurrentGapsSnapshot = {
      generatedAt: this.clock.isoNow(),
      generatorVersion: QUEUE_VERSION,
      gaps: gaps.map((g) => ({
        gapBlockId: g.blockId,
        problemId: g.problemId,
        detectorId: (g.detectorId ?? "semantic") as DetectorId,
        subjectBlockId: g.subject?.blockId ?? "",
        severity: g.severity ?? 0,
        voi: g.voiCached ?? 0,
        hasQuestion: questionByGap.has(g.blockId),
        questionBlockId: questionByGap.get(g.blockId) ?? null,
      })),
    };
    await this.storage.writeJsonAtomic(CURRENT_GAPS_PATH, snap);

    const pending: PendingQuestionRecord[] = questions
      .filter((q) => q.lifecycle === "pending")
      .map((q) => ({
        questionBlockId: q.blockId,
        problemId: q.problemId,
        gapBlockId: q.gapBlockId ?? "",
        label: q.label,
        voi: q.voiCached ?? 0,
        createdAt: q.createdAt,
      }))
      .sort((a, b) => {
        if (a.voi !== b.voi) return b.voi - a.voi;
        if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
        return a.questionBlockId.localeCompare(b.questionBlockId);
      });

    await this.storage.rewriteJsonl(PENDING_PATH, pending);
  }

  async listPending(): Promise<PendingQuestionRecord[]> {
    return await this.storage.readJsonl<PendingQuestionRecord>(PENDING_PATH);
  }

  async readCurrentGaps(): Promise<CurrentGapsSnapshot> {
    const snap = await this.storage.readJson<CurrentGapsSnapshot>(CURRENT_GAPS_PATH);
    return (
      snap ?? { generatedAt: this.clock.isoNow(), generatorVersion: QUEUE_VERSION, gaps: [] }
    );
  }

  async appendAsked(rec: AskedRecord): Promise<void> {
    await this.storage.appendJsonl(ASKED_PATH, rec);
  }

  async listAsked(): Promise<AskedRecord[]> {
    return await this.storage.readJsonl<AskedRecord>(ASKED_PATH);
  }

  async resolveAsked(questionBlockId: string, resolution: AskedResolution): Promise<AskedRecord | null> {
    const asked = await this.storage.readJsonl<AskedRecord>(ASKED_PATH);
    const forQuestion = asked.filter((r) => r.questionBlockId === questionBlockId);
    if (forQuestion.length === 0) return null;
    if (forQuestion.some((r) => r.resolution)) return null;
    const base = forQuestion[forQuestion.length - 1];
    const rec: AskedRecord = {
      ...base,
      askedAtIso: this.clock.isoNow(),
      resolution,
      resolvedAtIso: this.clock.isoNow(),
    };
    await this.storage.appendJsonl(ASKED_PATH, rec);
    return rec;
  }
}
