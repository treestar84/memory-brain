import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { FlowGraphStore } from "../../../src/core/flow/FlowGraphStore";
import { StaleDecayEngine } from "../../../src/core/governance/StaleDecayEngine";
import type { FlowBlock, FlowGraph } from "../../../src/core/flow/types";
import { GOVERNANCE_CONFIG } from "../../../src/core/governance/config";

const BASE_TIME = "2026-04-19T10:00:00.000Z";

function mkBlock(overrides: Partial<FlowBlock> = {}): FlowBlock {
  return {
    blockId: "b1",
    problemId: "prob-1",
    type: "Action",
    status: "confirmed",
    label: "test action",
    confidence: 0.9,
    supportedBy: [],
    relations: [],
    createdAt: BASE_TIME,
    lastConfirmedAt: BASE_TIME,
    staleAfter: null,
    supersededBy: null,
    bundleId: "bnd-1",
    ...overrides,
  };
}

function mkGraph(blocks: FlowBlock[]): FlowGraph {
  return {
    problemId: blocks[0]?.problemId ?? "prob-1",
    blocks,
    cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
  };
}

describe("StaleDecayEngine", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let flowStore: FlowGraphStore;
  let engine: StaleDecayEngine;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date(BASE_TIME));
    flowStore = new FlowGraphStore(storage, clock);
    engine = new StaleDecayEngine(flowStore, clock);
  });

  test("staleAfter가 null인 블록 → decay 대상 아님", async () => {
    const block = mkBlock({ blockId: "b1", staleAfter: null });
    await flowStore.writeSnapshot("prob-1", mkGraph([block]));
    const decayed = await engine.sweep("prob-1");
    expect(decayed).toHaveLength(0);
  });

  test("staleAfter가 미래 → decay 대상 아님", async () => {
    const future = new Date(new Date(BASE_TIME).getTime() + 7 * 24 * 3600 * 1000).toISOString();
    const block = mkBlock({ blockId: "b1", staleAfter: future });
    await flowStore.writeSnapshot("prob-1", mkGraph([block]));
    const decayed = await engine.sweep("prob-1");
    expect(decayed).toHaveLength(0);
  });

  test("staleAfter가 과거 → confirmed 블록 superseded로 변환 + delta 기록", async () => {
    const past = new Date(new Date(BASE_TIME).getTime() - 1000).toISOString();
    const block = mkBlock({ blockId: "b1", staleAfter: past });
    await flowStore.writeSnapshot("prob-1", mkGraph([block]));

    const decayed = await engine.sweep("prob-1");

    expect(decayed).toHaveLength(1);
    expect(decayed[0]).toBe("b1");

    const snapshot = await flowStore.readSnapshot("prob-1");
    const updated = snapshot!.blocks.find((b) => b.blockId === "b1")!;
    expect(updated.status).toBe("superseded");
    expect(updated.supersededBy).toBe(GOVERNANCE_CONFIG.DECAY_REASON);

    const deltas = await flowStore.readDeltas("prob-1");
    expect(deltas.length).toBe(1);
    expect(deltas[0].op).toBe("block-supersede");
    if (deltas[0].op === "block-supersede") {
      expect(deltas[0].reason).toBe(GOVERNANCE_CONFIG.DECAY_REASON);
      expect(deltas[0].blockId).toBe("b1");
    }
  });

  test("이미 superseded인 블록 → 재처리 안 함", async () => {
    const past = new Date(new Date(BASE_TIME).getTime() - 1000).toISOString();
    const block = mkBlock({ blockId: "b1", staleAfter: past, status: "superseded", supersededBy: "prev-reason" });
    await flowStore.writeSnapshot("prob-1", mkGraph([block]));
    const decayed = await engine.sweep("prob-1");
    expect(decayed).toHaveLength(0);
  });

  test("여러 블록 중 일부만 stale → stale한 것만 supersede", async () => {
    const past = new Date(new Date(BASE_TIME).getTime() - 1000).toISOString();
    const future = new Date(new Date(BASE_TIME).getTime() + 7 * 86400 * 1000).toISOString();
    const blocks = [
      mkBlock({ blockId: "b1", staleAfter: past }),
      mkBlock({ blockId: "b2", staleAfter: future }),
      mkBlock({ blockId: "b3", staleAfter: null }),
    ];
    await flowStore.writeSnapshot("prob-1", mkGraph(blocks));
    const decayed = await engine.sweep("prob-1");
    expect(decayed).toEqual(["b1"]);

    const snapshot = await flowStore.readSnapshot("prob-1");
    const b1 = snapshot!.blocks.find((b) => b.blockId === "b1")!;
    const b2 = snapshot!.blocks.find((b) => b.blockId === "b2")!;
    const b3 = snapshot!.blocks.find((b) => b.blockId === "b3")!;
    expect(b1.status).toBe("superseded");
    expect(b2.status).toBe("confirmed");
    expect(b3.status).toBe("confirmed");
  });

  test("스냅샷 없음 → 빈 배열 반환 (문제 없이)", async () => {
    const decayed = await engine.sweep("prob-nonexistent");
    expect(decayed).toHaveLength(0);
  });

  test("decay 후 cueCardMeta.stale이 true로 갱신됨", async () => {
    const past = new Date(new Date(BASE_TIME).getTime() - 1000).toISOString();
    const block = mkBlock({ blockId: "b1", staleAfter: past });
    await flowStore.writeSnapshot("prob-1", mkGraph([block]));
    await engine.sweep("prob-1");
    const snapshot = await flowStore.readSnapshot("prob-1");
    expect(snapshot!.cueCardMeta.stale).toBe(true);
  });
});
