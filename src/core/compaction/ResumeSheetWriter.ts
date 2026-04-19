import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { ActiveProblemStore } from "../binder/ActiveProblemStore";
import type { FlowGraphStore } from "../flow/FlowGraphStore";
import type { QuestionQueue } from "../gap/QuestionQueue";
import type { FlowDelta } from "../flow/types";
import type { ResumeSheet } from "./types";
import { RESUME_SHEET_VERSION } from "./types";
import { RESUME_CONFIG, resumeSheetPath } from "./config";

function summarizeDelta(d: FlowDelta): string {
  switch (d.op) {
    case "block-add":
      return `+ ${d.block.type} ${d.block.label}`;
    case "block-supersede":
      return `~ supersede ${d.blockId} (${d.reason})`;
    case "relation-add":
      return `→ ${d.relation.kind} from ${d.fromBlockId} to ${d.relation.targetBlockId}`;
    case "cue-card-regen":
      return `cue-card regen (${d.bodyBytes}B)`;
  }
}

export class ResumeSheetWriter {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
    private readonly problemStore: ActiveProblemStore,
    private readonly flowStore: FlowGraphStore,
    private readonly questionQueue: QuestionQueue,
  ) {}

  async write(sessionId: string): Promise<void> {
    const active = await this.problemStore.getActive();
    const now = this.clock.isoNow();

    if (!active) {
      const empty: ResumeSheet = {
        version: RESUME_SHEET_VERSION,
        generatedAt: now,
        sessionId,
        problemId: null,
        recentDeltas: [],
        openGaps: [],
        topPendingQuestions: [],
      };
      await this.storage.writeJsonAtomic(resumeSheetPath(sessionId), empty);
      return;
    }

    const allDeltas = await this.flowStore.readDeltas(active.id);
    const recentDeltas = allDeltas
      .slice(-RESUME_CONFIG.MAX_DELTAS)
      .map((d) => ({ op: d.op, timestampIso: d.timestampIso, summary: summarizeDelta(d) }));

    const gapsSnap = await this.questionQueue.readCurrentGaps();
    const openGaps = [...gapsSnap.gaps]
      .sort((a, b) => b.voi - a.voi)
      .slice(0, RESUME_CONFIG.MAX_GAPS)
      .map((g) => ({
        gapBlockId: g.gapBlockId,
        detectorId: g.detectorId,
        subjectBlockId: g.subjectBlockId,
        severity: g.severity,
        voi: g.voi,
        hasQuestion: g.hasQuestion,
      }));

    const pending = await this.questionQueue.listPending();
    const topPendingQuestions = pending.slice(0, RESUME_CONFIG.MAX_PENDING_QUESTIONS).map((q) => ({
      questionBlockId: q.questionBlockId,
      label: q.label,
      voi: q.voi,
    }));

    const sheet: ResumeSheet = {
      version: RESUME_SHEET_VERSION,
      generatedAt: now,
      sessionId,
      problemId: active.id,
      recentDeltas,
      openGaps,
      topPendingQuestions,
    };
    await this.storage.writeJsonAtomic(resumeSheetPath(sessionId), sheet);
  }
}
