import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FsStorage } from "../../src/core/storage/FsStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { Expirer } from "../../src/core/ledger/Expirer";
import { Redactor } from "../../src/core/security/Redactor";
import { ObservationNormalizer } from "../../src/core/normalizer/ObservationNormalizer";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import { FlowGraphStore } from "../../src/core/flow/FlowGraphStore";
import { FlowGraphProjector } from "../../src/core/flow/FlowGraphProjector";
import { FlowGraphValidator } from "../../src/core/flow/FlowGraphValidator";
import { CueCardInjector } from "../../src/core/flow/CueCardInjector";
import { CueCardFallback } from "../../src/core/flow/CueCardFallback";
import { handleSessionStart } from "../../src/hooks/session-start";
import { handleUserPromptSubmit } from "../../src/hooks/user-prompt-submit";
import { handlePostToolUse } from "../../src/hooks/post-tool-use";
import { handleSessionEnd } from "../../src/hooks/session-end";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";
import type { FlowDelta } from "../../src/core/flow/types";

describe("Epic 2 golden path — observation to flow graph", () => {
  let projectDir: string;
  let storage: FsStorage;
  let clock: FakeClock;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-e2e-"));
    storage = new FsStorage(join(projectDir, ".memory-brain"));
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("bundle sealed, synthesized, graph projected, cue card injected", async () => {
    const problemStore = new ActiveProblemStore(storage, clock);
    const ledger = new RawLedger(storage, clock);
    const queue = new PendingQueue(storage, clock);
    const expirer = new Expirer(storage, clock, 7);
    const redactor = new Redactor(storage, clock);
    const normalizer = new ObservationNormalizer(redactor);
    const bundler = new ObservationBundler(storage, clock);
    const graphStore = new FlowGraphStore(storage, clock);
    const projector = new FlowGraphProjector();
    const validator = new FlowGraphValidator();
    const injector = new CueCardInjector();
    const fallback = new CueCardFallback();

    const prob = await problemStore.create("auth bug", "auth-bug");

    const sessionStartEvent: CanonicalEvent = {
      platform: "claude-code", stage: "session-start", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
    };
    const s1 = await handleSessionStart(sessionStartEvent, {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback,
    });
    expect(s1).toContain("auth bug");

    clock.advance(1000);
    const prompt1: CanonicalEvent = {
      platform: "claude-code", stage: "prompt-submit", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: { stage: "prompt-submit", message: "auth 오류 고쳐줘" },
      raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handleUserPromptSubmit(prompt1, {
      storage, clock, problemStore, queue, ledger, bundler,
    });

    clock.advance(5000);
    const editEvent: CanonicalEvent = {
      platform: "claude-code", stage: "tool-post", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: {
        stage: "tool-post", toolName: "Edit",
        toolInput: { file_path: "src/auth.ts" },
        toolOutput: { success: true }, correlationId: "c1",
      },
      raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handlePostToolUse(editEvent, {
      storage, clock, ledger, queue, normalizer,
    });

    clock.advance(3000);
    const bashEvent: CanonicalEvent = {
      platform: "claude-code", stage: "tool-post", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: {
        stage: "tool-post", toolName: "Bash",
        toolInput: { command: "bun test" },
        toolOutput: { exitCode: 1, stderr: "FAIL" }, correlationId: "c2",
      },
      raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handlePostToolUse(bashEvent, {
      storage, clock, ledger, queue, normalizer,
    });

    clock.advance(1000);
    const prompt2: CanonicalEvent = {
      platform: "claude-code", stage: "prompt-submit", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: { stage: "prompt-submit", message: "왜 실패해?" },
      raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handleUserPromptSubmit(prompt2, {
      storage, clock, problemStore, queue, ledger, bundler,
    });

    clock.advance(500);
    const sessionEndEvent: CanonicalEvent = {
      platform: "claude-code", stage: "session-end", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: { stage: "session-end" }, raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handleSessionEnd(sessionEndEvent, {
      storage, clock, problemStore, ledger, queue, bundler,
    });

    const bundles = await bundler.listUnprocessed(prob.id);
    expect(bundles.length).toBe(2);

    const byTurn = [...bundles].sort((a, b) => a.turnOrdinal - b.turnOrdinal);
    const turn1 = byTurn[0];

    const deltas: FlowDelta[] = [
      {
        op: "block-add", timestampIso: clock.isoNow(),
        block: {
          blockId: "blk_action_1", problemId: prob.id, type: "Action",
          status: "confirmed", label: "src/auth.ts 편집",
          confidence: 0.8, supportedBy: [turn1.bundleId], relations: [],
          createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
          supersededBy: null, bundleId: turn1.bundleId,
        },
      },
      {
        op: "block-add", timestampIso: clock.isoNow(),
        block: {
          blockId: "blk_outcome_1", problemId: prob.id, type: "Outcome",
          status: "confirmed", label: "bun test 실패",
          confidence: 0.9, supportedBy: [turn1.bundleId], relations: [],
          createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
          supersededBy: null, bundleId: turn1.bundleId,
        },
      },
      {
        op: "relation-add", timestampIso: clock.isoNow(),
        problemId: prob.id, fromBlockId: "blk_action_1",
        relation: { kind: "followsFrom", targetBlockId: "blk_outcome_1", confidence: 0.7 },
      },
      {
        op: "cue-card-regen", timestampIso: clock.isoNow(),
        problemId: prob.id, bodyHash: "abc123", bodyBytes: 512,
      },
    ];

    for (const d of deltas) {
      const res = validator.validateDelta(d);
      expect(res.ok).toBe(true);
      await graphStore.appendDelta(prob.id, d);
    }

    for (const b of bundles) {
      await bundler.markProcessed(b.bundleId, "claude-code@1.0");
    }

    const allDeltas = await graphStore.readDeltas(prob.id);
    const graph = projector.project(prob.id, allDeltas);
    await graphStore.writeSnapshot(prob.id, graph);

    expect(graph.blocks).toHaveLength(2);
    const action = graph.blocks.find((b) => b.blockId === "blk_action_1")!;
    expect(action.relations).toHaveLength(1);
    expect(action.relations[0].targetBlockId).toBe("blk_outcome_1");
    expect(graph.cueCardMeta.bodyHash).toBe("abc123");

    const cueCard = `---
problemId: ${prob.id}
problemTitle: "auth bug"
awaitingSynthesis: false
blockCount: 2
---

## 핵심 문제
auth 오류 수정 시도 중 테스트 실패.

## 원인 사슬
Action → Outcome(negative)
`;
    await storage.writeRaw(`problems/${prob.id}/cue-card.md`, cueCard);

    clock.advance(1000);
    const s2 = await handleSessionStart(sessionStartEvent, {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback,
    });
    expect(s2).toContain("auth bug");
    expect(s2).toContain("## 핵심 문제");
    expect(s2).not.toContain("합성 대기");

    const graph2 = projector.project(prob.id, allDeltas);
    expect(graph2).toEqual(graph);
  });

  test("orphan bundle when no active problem", async () => {
    const bundler = new ObservationBundler(storage, clock);

    await bundler.openTurn("sess1", null, 1);
    await bundler.sealTurn("sess1", [{ type: "user-intent", data: {} }], []);

    const orphans = await storage.readJsonl("ledger/orphan-bundles.jsonl");
    expect(orphans.length).toBe(1);
  });
});
