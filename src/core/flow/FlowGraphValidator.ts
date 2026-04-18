import { isFlowBlock, isFlowDelta } from "./guards";
import type { FlowBlock, FlowDelta } from "./types";

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export class FlowGraphValidator {
  validateBlock(block: unknown): ValidationResult {
    if (!isFlowBlock(block)) return { ok: false, reason: "block fails type guard (type/confidence/fields)" };
    return { ok: true };
  }

  validateDelta(delta: unknown): ValidationResult {
    if (!isFlowDelta(delta)) return { ok: false, reason: "delta fails type guard" };
    const d = delta as FlowDelta;
    if (d.op === "block-add") {
      const base = this.validateBlock(d.block);
      if (!base.ok) return base;
      const b = d.block;
      if (b.type === "Gap") {
        if (!b.detectorId || !b.subject?.blockId) {
          return { ok: false, reason: "Gap block requires detectorId and subject" };
        }
        if (b.detectorId.startsWith("rule:")) {
          return { ok: false, reason: "Structural Gap (rule:*) cannot be added via delta; they are projection-derived" };
        }
      }
      if (b.type === "Question") {
        if (!b.gapBlockId) {
          return { ok: false, reason: "Question block requires gapBlockId" };
        }
      }
      if (b.type === "Outcome" && b.polarity !== undefined && b.polarity !== null) {
        if (b.polarity !== "+" && b.polarity !== "-") {
          return { ok: false, reason: "Outcome polarity must be '+' | '-' | null" };
        }
      }
      return { ok: true };
    }
    if (d.op === "relation-add") {
      if (d.relation.confidence < 0 || d.relation.confidence > 1)
        return { ok: false, reason: "relation confidence out of range" };
    }
    return { ok: true };
  }

  detectSupersedeCycles(blocks: FlowBlock[]): string[][] {
    const byId = new Map(blocks.map(b => [b.blockId, b]));
    const cycles: string[][] = [];
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();

    function dfs(id: string, path: string[]): void {
      color.set(id, GRAY);
      const node = byId.get(id);
      const next = node?.supersededBy;
      if (next) {
        const c = color.get(next) ?? WHITE;
        if (c === GRAY) {
          const cycleStart = path.indexOf(next);
          cycles.push(path.slice(cycleStart).concat(next));
        } else if (c === WHITE && byId.has(next)) {
          dfs(next, [...path, next]);
        }
      }
      color.set(id, BLACK);
    }

    for (const b of blocks) {
      if ((color.get(b.blockId) ?? WHITE) === WHITE) {
        dfs(b.blockId, [b.blockId]);
      }
    }
    return cycles;
  }

  validateRelationTargets(blocks: FlowBlock[]): ValidationResult {
    const byProblem = new Map<string, Set<string>>();
    for (const b of blocks) {
      let set = byProblem.get(b.problemId);
      if (!set) { set = new Set(); byProblem.set(b.problemId, set); }
      set.add(b.blockId);
    }
    for (const b of blocks) {
      const peers = byProblem.get(b.problemId)!;
      for (const r of b.relations) {
        if (!peers.has(r.targetBlockId))
          return { ok: false, reason: `block ${b.blockId} relation targets missing/cross-problem ${r.targetBlockId}` };
      }
    }
    return { ok: true };
  }
}
