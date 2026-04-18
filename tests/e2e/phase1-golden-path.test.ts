import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { Expirer } from "../../src/core/ledger/Expirer";
import { ObservationNormalizer } from "../../src/core/normalizer/ObservationNormalizer";
import { Redactor } from "../../src/core/security/Redactor";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import { CueCardInjector } from "../../src/core/flow/CueCardInjector";
import { CueCardFallback } from "../../src/core/flow/CueCardFallback";
import { handleSessionStart } from "../../src/hooks/session-start";
import { handleUserPromptSubmit } from "../../src/hooks/user-prompt-submit";
import { handlePreToolUse } from "../../src/hooks/pre-tool-use";
import { handlePostToolUse } from "../../src/hooks/post-tool-use";
import { handleSessionEnd } from "../../src/hooks/session-end";
import { mapClaudeCodeEvent } from "../../src/adapters/claude-code/mapper";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";

describe("Phase 1 Golden Path E2E", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let ledger: RawLedger;
  let problemStore: ActiveProblemStore;
  let queue: PendingQueue;
  let expirer: Expirer;
  let normalizer: ObservationNormalizer;
  let bundler: ObservationBundler;
  let injector: CueCardInjector;
  let fallback: CueCardFallback;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    ledger = new RawLedger(storage, clock);
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    expirer = new Expirer(storage, clock, 7);
    normalizer = new ObservationNormalizer(new Redactor(storage, clock));
    bundler = new ObservationBundler(storage, clock);
    injector = new CueCardInjector();
    fallback = new CueCardFallback();
  });

  test("full session lifecycle: start → prompt → tools → end", async () => {
    // 1. SessionStart — empty state
    const startEvent: CanonicalEvent = {
      platform: "claude-code", stage: "session-start", sessionId: "e2e-001",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
    };
    const startOutput = await handleSessionStart(startEvent, {
      storage, clock, problemStore, queue, ledger, expirer, bundler, injector, fallback,
    });
    expect(startOutput).toContain("초기화");

    // 2. Create a problem (simulating /cfgm-new-problem)
    await problemStore.create("Fix auth timeout", "fix-auth-timeout");

    // 3. UserPromptSubmit
    clock.advance(1000);
    const promptEvent: CanonicalEvent = {
      platform: "claude-code", stage: "prompt-submit", sessionId: "e2e-001",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "prompt-submit", message: "Fix the authentication timeout issue" },
      raw: {}, adapterVersion: "claude-code@1.0",
    };
    const promptOutput = await handleUserPromptSubmit(promptEvent, {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    expect(promptOutput).toContain("Fix auth timeout");

    // 4. PreToolUse — Edit
    clock.advance(2000);
    const preEditEvent: CanonicalEvent = {
      platform: "claude-code", stage: "tool-pre", sessionId: "e2e-001",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "tool-pre", toolName: "Edit", toolInput: { file_path: "/src/auth.ts" }, correlationId: "corr-001" },
      raw: {}, adapterVersion: "claude-code@1.0",
    };
    const preEditOutput = await handlePreToolUse(preEditEvent, { storage, clock, ledger });
    expect(preEditOutput).toBeNull();

    // 5. PostToolUse — Edit
    clock.advance(500);
    const postEditEvent: CanonicalEvent = {
      platform: "claude-code", stage: "tool-post", sessionId: "e2e-001",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "tool-post", toolName: "Edit", toolInput: { file_path: "/src/auth.ts" }, toolOutput: "ok", correlationId: "corr-001" },
      raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handlePostToolUse(postEditEvent, { storage, clock, ledger, queue, normalizer });
    expect(await queue.count()).toBe(0);

    // 6. PreToolUse + PostToolUse — Bash
    clock.advance(1000);
    const preBashEvent: CanonicalEvent = {
      platform: "claude-code", stage: "tool-pre", sessionId: "e2e-001",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "tool-pre", toolName: "Bash", toolInput: { command: "bun test" }, correlationId: "corr-002" },
      raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handlePreToolUse(preBashEvent, { storage, clock, ledger });

    clock.advance(3000);
    const postBashEvent: CanonicalEvent = {
      platform: "claude-code", stage: "tool-post", sessionId: "e2e-001",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "tool-post", toolName: "Bash", toolInput: { command: "bun test" }, toolOutput: "5 tests passed", correlationId: "corr-002" },
      raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handlePostToolUse(postBashEvent, { storage, clock, ledger, queue, normalizer });
    expect(await queue.count()).toBe(0);

    // 7. PostToolUse — WebFetch (ambiguous → pending queue)
    clock.advance(1000);
    const postFetchEvent: CanonicalEvent = {
      platform: "claude-code", stage: "tool-post", sessionId: "e2e-001",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "tool-post", toolName: "WebFetch", toolInput: { url: "https://example.com" }, toolOutput: "data", correlationId: "corr-003" },
      raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handlePostToolUse(postFetchEvent, { storage, clock, ledger, queue, normalizer });
    expect(await queue.count()).toBe(1);

    // 8. Verify pending queue content
    const pending = await queue.peek();
    expect(pending?.payload.type).toBe("tool:WebFetch");
    expect(pending?.payload.data._ambiguous).toBe(true);

    // 9. Simulate /cfgm-process: dequeue
    await queue.dequeue(pending!.id);
    expect(await queue.count()).toBe(0);

    // 10. SessionEnd
    clock.advance(5000);
    const endEvent: CanonicalEvent = {
      platform: "claude-code", stage: "session-end", sessionId: "e2e-001",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "session-end" }, raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handleSessionEnd(endEvent, { storage, clock, problemStore, ledger, queue, bundler });

    // 11. Verify final state
    const active = await problemStore.getActive();
    expect(active?.title).toBe("Fix auth timeout");

    // start + prompt + preEdit + postEdit + preBash + postBash + postFetch + end = 8
    const rawRecords = await storage.readJsonl("ledger/raw/2026/04/17/session-e2e-001.jsonl");
    expect(rawRecords.length).toBe(8);

    expect(await queue.count()).toBe(0);
  });

  test("session with expired pending items gets cleaned on restart", async () => {
    await queue.enqueue({ type: "old-item", data: {} });
    clock.advance(8 * 24 * 60 * 60 * 1000);

    const startEvent: CanonicalEvent = {
      platform: "claude-code", stage: "session-start", sessionId: "e2e-002",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handleSessionStart(startEvent, {
      storage, clock, problemStore, queue, ledger, expirer, bundler, injector, fallback,
    });

    expect(await queue.count()).toBe(0);
    const expired = await storage.readJsonl("ledger/expired-analysis.jsonl");
    expect(expired.length).toBe(1);
  });

  test("adapter mapper integration — fixture round-trip", () => {
    const rawInput = {
      type: "PreToolUse",
      session_id: "sess-fixture",
      cwd: "/project",
      tool_name: "Edit",
      tool_input: { file_path: "/src/a.ts" },
    };
    const event = mapClaudeCodeEvent(rawInput, "2026-04-17T10:00:00Z");
    expect(event.platform).toBe("claude-code");
    expect(event.stage).toBe("tool-pre");
    expect(event.sessionId).toBe("sess-fixture");
  });

  test("security redaction in pipeline", async () => {
    const promptEvent: CanonicalEvent = {
      platform: "claude-code", stage: "prompt-submit", sessionId: "e2e-sec",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "prompt-submit", message: "Set api_key=sk-ant-ABCDEFGHIJKLMNOPQRSTUV for auth" },
      raw: {}, adapterVersion: "claude-code@1.0",
    };

    const obs = await normalizer.normalize(promptEvent);
    expect(obs?.data.userIntentRaw).toContain("<REDACTED:");
    expect(obs?.data.userIntentRaw).not.toContain("sk-ant-");

    const redactLog = await storage.readJsonl("security/redacted.jsonl");
    expect(redactLog.length).toBeGreaterThan(0);
  });

  test("deterministic — same inputs produce same structure", async () => {
    const event: CanonicalEvent = {
      platform: "claude-code", stage: "tool-post", sessionId: "det-001",
      cwd: "/project", timestampIso: "2026-04-17T10:00:00Z",
      payload: { stage: "tool-post", toolName: "Edit", toolInput: { file_path: "/a.ts" }, toolOutput: "ok", correlationId: "c1" },
      raw: {}, adapterVersion: "claude-code@1.0",
    };

    const obs1 = await normalizer.normalize(event);
    const obs2 = await normalizer.normalize(event);
    expect(obs1?.type).toBe(obs2?.type);
    expect(obs1?.data).toEqual(obs2?.data);
  });
});
