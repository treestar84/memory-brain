# Phase 1 Tasks — Epic 1: Hook-native Ledger MVP (Part 2: Hooks, Skills, E2E)

Parent plan: [`2026-04-17-cfgm-os-phase1.md`](./2026-04-17-cfgm-os-phase1.md)

Tasks 12-18: 5 Hooks, Slash Command Skills, E2E Golden Path

---

## Task 12: E1-S5 — SessionStart 훅

**Files:**
- Create: `src/hooks/session-start.ts`
- Create: `tests/hooks/session-start.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/hooks/session-start.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { handleSessionStart } from "../../../src/hooks/session-start";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../../src/core/binder/ActiveProblemStore";
import { PendingQueue } from "../../../src/core/ledger/PendingQueue";
import { RawLedger } from "../../../src/core/ledger/RawLedger";
import { Expirer } from "../../../src/core/ledger/Expirer";
import type { CanonicalEvent } from "../../../src/core/events/CanonicalEvent";

function makeSessionStart(sessionId = "sess-001"): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-start", sessionId, cwd: "/project",
    timestampIso: "2026-04-17T10:00:00Z", payload: { stage: "session-start" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("SessionStart hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let expirer: Expirer;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    expirer = new Expirer(storage, clock, 7);
  });

  test("emits init message on empty state", async () => {
    const output = await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    expect(output).toContain("memory-brain");
    expect(output).toContain("초기화");
  });

  test("emits active problem summary when exists", async () => {
    await problemStore.create("fix auth bug", "fix-auth");
    const output = await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    expect(output).toContain("fix auth bug");
  });

  test("includes pending queue count", async () => {
    await queue.enqueue({ type: "test", data: {} });
    await queue.enqueue({ type: "test2", data: {} });
    const output = await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    expect(output).toContain("2");
  });

  test("runs expirer sweep on startup", async () => {
    await queue.enqueue({ type: "old", data: {} });
    clock.advance(8 * 24 * 60 * 60 * 1000);
    await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    expect(await queue.count()).toBe(0);
  });

  test("appends to raw ledger", async () => {
    await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("output is under 2KB", async () => {
    await problemStore.create("test problem", "test-problem");
    for (let i = 0; i < 10; i++) {
      await queue.enqueue({ type: `item-${i}`, data: {} });
    }
    const output = await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    expect(new TextEncoder().encode(output).length).toBeLessThanOrEqual(2048);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/hooks/session-start.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SessionStart hook**

Create `src/hooks/session-start.ts`:

```typescript
import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { Expirer } from "../core/ledger/Expirer";

export type HookDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  queue: PendingQueue;
  ledger: RawLedger;
  expirer: Expirer;
};

export async function handleSessionStart(
  event: CanonicalEvent,
  deps: HookDeps
): Promise<string> {
  await deps.ledger.append(event);
  await deps.expirer.sweep(deps.queue);

  const active = await deps.problemStore.getActive();
  const pendingCount = await deps.queue.count();

  const lines: string[] = ["### 🧠 memory-brain"];

  if (!active) {
    lines.push("초기화됨. `/cfgm-new-problem`으로 문제를 생성하세요.");
  } else {
    lines.push(`**문제:** ${active.title} (\`${active.slug}\`)`);
    lines.push(`확인: ${active.lastConfirmedAt}`);
  }

  if (pendingCount > 0) {
    lines.push(`**대기 분석:** ${pendingCount}건 → \`/cfgm-process\`로 처리`);
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/hooks/session-start.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/session-start.ts tests/hooks/session-start.test.ts
git commit -m "feat(E1-S5): SessionStart hook with state restore and expiry sweep"
```

---

## Task 13: E1-S6 — UserPromptSubmit 훅

**Files:**
- Create: `src/hooks/user-prompt-submit.ts`
- Create: `tests/hooks/user-prompt-submit.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/hooks/user-prompt-submit.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { handleUserPromptSubmit } from "../../../src/hooks/user-prompt-submit";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../../src/core/binder/ActiveProblemStore";
import { PendingQueue } from "../../../src/core/ledger/PendingQueue";
import { RawLedger } from "../../../src/core/ledger/RawLedger";
import type { CanonicalEvent } from "../../../src/core/events/CanonicalEvent";

function makePromptSubmit(message = "Fix the bug"): CanonicalEvent {
  return {
    platform: "claude-code", stage: "prompt-submit", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T10:00:00Z",
    payload: { stage: "prompt-submit", message },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("UserPromptSubmit hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let queue: PendingQueue;
  let ledger: RawLedger;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
  });

  test("appends to raw ledger", async () => {
    await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger,
    });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("emits active problem summary", async () => {
    await problemStore.create("auth bug", "auth-bug");
    const output = await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger,
    });
    expect(output).toContain("auth bug");
  });

  test("emits null when no active problem", async () => {
    const output = await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger,
    });
    expect(output).toBeNull();
  });

  test("includes pending item hint when queue non-empty", async () => {
    await problemStore.create("test", "test");
    await queue.enqueue({ type: "user-intent", data: { message: "what about X?" } });
    const output = await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger,
    });
    expect(output).toContain("대기");
  });

  test("output is under 2KB", async () => {
    await problemStore.create("test problem", "test-problem");
    const output = await handleUserPromptSubmit(makePromptSubmit("a".repeat(500)), {
      storage, clock, problemStore, queue, ledger,
    });
    if (output) {
      expect(new TextEncoder().encode(output).length).toBeLessThanOrEqual(2048);
    }
  });
});
```

- [ ] **Step 2: Implement UserPromptSubmit hook**

Create `src/hooks/user-prompt-submit.ts`:

```typescript
import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { RawLedger } from "../core/ledger/RawLedger";

export type PromptSubmitDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  queue: PendingQueue;
  ledger: RawLedger;
};

export async function handleUserPromptSubmit(
  event: CanonicalEvent,
  deps: PromptSubmitDeps
): Promise<string | null> {
  await deps.ledger.append(event);

  const active = await deps.problemStore.getActive();
  if (!active) return null;

  const lines: string[] = [
    `### 🧠 memory-brain`,
    `**문제:** ${active.title}`,
  ];

  const pendingCount = await deps.queue.count();
  if (pendingCount > 0) {
    const peek = await deps.queue.peek();
    lines.push(`**대기 분석:** ${pendingCount}건`);
    if (peek) {
      lines.push(`최우선: \`${peek.payload.type}\``);
    }
  }

  return lines.join("\n");
}
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/hooks/user-prompt-submit.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/user-prompt-submit.ts tests/hooks/user-prompt-submit.test.ts
git commit -m "feat(E1-S6): UserPromptSubmit hook with problem summary and pending hints"
```

---

## Task 14: E1-S7 — PreToolUse 훅

**Files:**
- Create: `src/hooks/pre-tool-use.ts`
- Create: `tests/hooks/pre-tool-use.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/hooks/pre-tool-use.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { handlePreToolUse } from "../../../src/hooks/pre-tool-use";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { RawLedger } from "../../../src/core/ledger/RawLedger";
import type { CanonicalEvent } from "../../../src/core/events/CanonicalEvent";

function makePreTool(toolName = "Edit", command?: string): CanonicalEvent {
  const toolInput = toolName === "Bash" ? { command: command ?? "bun test" } : { file_path: "/src/a.ts" };
  return {
    platform: "claude-code", stage: "tool-pre", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T10:00:00Z",
    payload: { stage: "tool-pre", toolName, toolInput, correlationId: "corr-abc123" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("PreToolUse hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let ledger: RawLedger;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    ledger = new RawLedger(storage, clock);
  });

  test("appends pre marker to raw ledger", async () => {
    await handlePreToolUse(makePreTool(), { storage, clock, ledger });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("returns null for safe tools", async () => {
    const output = await handlePreToolUse(makePreTool("Edit"), { storage, clock, ledger });
    expect(output).toBeNull();
  });

  test("warns on rm -rf command", async () => {
    const output = await handlePreToolUse(makePreTool("Bash", "rm -rf /"), { storage, clock, ledger });
    expect(output).toContain("⚠️");
  });

  test("warns on sudo command", async () => {
    const output = await handlePreToolUse(makePreTool("Bash", "sudo apt install"), { storage, clock, ledger });
    expect(output).toContain("⚠️");
  });

  test("no warning for safe bash commands", async () => {
    const output = await handlePreToolUse(makePreTool("Bash", "bun test"), { storage, clock, ledger });
    expect(output).toBeNull();
  });
});
```

- [ ] **Step 2: Implement PreToolUse hook**

Create `src/hooks/pre-tool-use.ts`:

```typescript
import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { RawLedger } from "../core/ledger/RawLedger";

export type PreToolDeps = {
  storage: Storage;
  clock: Clock;
  ledger: RawLedger;
};

const DANGEROUS_PATTERNS = [
  /rm\s+(-[a-z]*f[a-z]*\s+|--force\s+)*\//i,
  /\bsudo\b/,
  /\brm\s+-rf\b/,
];

export async function handlePreToolUse(
  event: CanonicalEvent,
  deps: PreToolDeps
): Promise<string | null> {
  await deps.ledger.append(event);

  if (event.payload.stage !== "tool-pre") return null;
  if (event.payload.toolName !== "Bash") return null;

  const command = String((event.payload.toolInput as Record<string, unknown>)?.command ?? "");

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `### ⚠️ memory-brain\n위험 명령 감지: \`${command.slice(0, 80)}\``;
    }
  }

  return null;
}
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/hooks/pre-tool-use.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/pre-tool-use.ts tests/hooks/pre-tool-use.test.ts
git commit -m "feat(E1-S7): PreToolUse hook with dangerous command warning"
```

---

## Task 15: E1-S8 — PostToolUse 훅

**Files:**
- Create: `src/hooks/post-tool-use.ts`
- Create: `tests/hooks/post-tool-use.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/hooks/post-tool-use.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { handlePostToolUse } from "../../../src/hooks/post-tool-use";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { RawLedger } from "../../../src/core/ledger/RawLedger";
import { PendingQueue } from "../../../src/core/ledger/PendingQueue";
import { ObservationNormalizer } from "../../../src/core/normalizer/ObservationNormalizer";
import { Redactor } from "../../../src/core/security/Redactor";
import type { CanonicalEvent } from "../../../src/core/events/CanonicalEvent";

function makePostTool(toolName: string, toolInput: unknown = {}, toolOutput: unknown = "ok"): CanonicalEvent {
  return {
    platform: "claude-code", stage: "tool-post", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T10:00:00Z",
    payload: { stage: "tool-post", toolName, toolInput, toolOutput, correlationId: "corr-abc123" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("PostToolUse hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let ledger: RawLedger;
  let queue: PendingQueue;
  let normalizer: ObservationNormalizer;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    ledger = new RawLedger(storage, clock);
    queue = new PendingQueue(storage, clock);
    normalizer = new ObservationNormalizer(new Redactor(storage, clock));
  });

  test("appends to raw ledger", async () => {
    await handlePostToolUse(makePostTool("Edit", { file_path: "/a.ts" }), {
      storage, clock, ledger, queue, normalizer,
    });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("Edit event does not enqueue to pending", async () => {
    await handlePostToolUse(makePostTool("Edit", { file_path: "/a.ts" }), {
      storage, clock, ledger, queue, normalizer,
    });
    expect(await queue.count()).toBe(0);
  });

  test("unknown tool enqueues to pending", async () => {
    await handlePostToolUse(makePostTool("WebFetch", {}), {
      storage, clock, ledger, queue, normalizer,
    });
    expect(await queue.count()).toBe(1);
  });

  test("Bash event normalized correctly", async () => {
    await handlePostToolUse(makePostTool("Bash", { command: "bun test" }, "3 tests passed"), {
      storage, clock, ledger, queue, normalizer,
    });
    expect(await queue.count()).toBe(0);
  });

  test("Read event normalized correctly", async () => {
    await handlePostToolUse(makePostTool("Read", { file_path: "/b.ts" }, "content"), {
      storage, clock, ledger, queue, normalizer,
    });
    expect(await queue.count()).toBe(0);
  });

  test("returns null (no stdout output)", async () => {
    const output = await handlePostToolUse(makePostTool("Edit", { file_path: "/a.ts" }), {
      storage, clock, ledger, queue, normalizer,
    });
    expect(output).toBeNull();
  });
});
```

- [ ] **Step 2: Implement PostToolUse hook**

Create `src/hooks/post-tool-use.ts`:

```typescript
import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { ObservationNormalizer } from "../core/normalizer/ObservationNormalizer";

export type PostToolDeps = {
  storage: Storage;
  clock: Clock;
  ledger: RawLedger;
  queue: PendingQueue;
  normalizer: ObservationNormalizer;
};

export async function handlePostToolUse(
  event: CanonicalEvent,
  deps: PostToolDeps
): Promise<string | null> {
  await deps.ledger.append(event);

  const observation = await deps.normalizer.normalize(event);
  if (!observation) return null;

  if (observation.needsAnalysis) {
    await deps.queue.enqueue({
      type: observation.type,
      data: observation.data,
    });
  }

  return null;
}
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/hooks/post-tool-use.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/post-tool-use.ts tests/hooks/post-tool-use.test.ts
git commit -m "feat(E1-S8): PostToolUse hook with normalize and pending queue"
```

---

## Task 16: E1-S9 — SessionEnd 훅

**Files:**
- Create: `src/hooks/session-end.ts`
- Create: `tests/hooks/session-end.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/hooks/session-end.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { handleSessionEnd } from "../../../src/hooks/session-end";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../../src/core/binder/ActiveProblemStore";
import { RawLedger } from "../../../src/core/ledger/RawLedger";
import { PendingQueue } from "../../../src/core/ledger/PendingQueue";
import type { CanonicalEvent } from "../../../src/core/events/CanonicalEvent";

function makeSessionEnd(): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-end", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T11:00:00Z",
    payload: { stage: "session-end" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("SessionEnd hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let ledger: RawLedger;
  let queue: PendingQueue;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T11:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    ledger = new RawLedger(storage, clock);
    queue = new PendingQueue(storage, clock);
  });

  test("appends session-end to raw ledger", async () => {
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("updates lastConfirmedAt on active problem", async () => {
    await problemStore.create("test", "test");
    clock.advance(60_000);
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    const active = await problemStore.getActive();
    expect(active?.lastConfirmedAt).toBe(clock.isoNow());
  });

  test("safe when no active problem", async () => {
    const output = await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    expect(output).toBeNull();
  });

  test("idempotent — calling twice is safe", async () => {
    await problemStore.create("test", "test");
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(2);
  });

  test("returns null (no stdout output)", async () => {
    const output = await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    expect(output).toBeNull();
  });
});
```

- [ ] **Step 2: Implement SessionEnd hook**

Create `src/hooks/session-end.ts`:

```typescript
import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { PendingQueue } from "../core/ledger/PendingQueue";

export type SessionEndDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  ledger: RawLedger;
  queue: PendingQueue;
};

export async function handleSessionEnd(
  event: CanonicalEvent,
  deps: SessionEndDeps
): Promise<string | null> {
  await deps.ledger.append(event);
  await deps.problemStore.updateLastConfirmed();
  return null;
}
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/hooks/session-end.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/session-end.ts tests/hooks/session-end.test.ts
git commit -m "feat(E1-S9): SessionEnd hook with lastConfirmedAt update"
```

---

## Task 17: E1-S10 — 슬래시 커맨드 스킬 & CLI 헬퍼

**Files:**
- Create: `skills/cfgm-new-problem/SKILL.md`
- Create: `skills/cfgm-switch/SKILL.md`
- Create: `skills/cfgm-process/SKILL.md`
- Create: `skills/cfgm-requeue/SKILL.md`
- Create: `bin/cfgm-new-problem.ts`
- Create: `bin/cfgm-switch.ts`
- Create: `bin/cfgm-process.ts`
- Create: `bin/cfgm-requeue.ts`
- Create: `tests/bin/cfgm-cli.test.ts`

- [ ] **Step 1: Create SKILL.md files**

Create `skills/cfgm-new-problem/SKILL.md`:

```markdown
---
name: cfgm-new-problem
description: Create a new problem and set it as active
---

# Create New Problem

Run this CLI to create a new problem:

```bash
bun run bin/cfgm-new-problem.ts "<title>" "<slug>"
```

Example:
```bash
bun run bin/cfgm-new-problem.ts "Fix authentication timeout" "fix-auth-timeout"
```

The command creates the problem in `.memory-brain/state/active-problem.json` and sets it as the active problem.

After creating, confirm the problem context to the user and continue working within this problem scope.
```

Create `skills/cfgm-switch/SKILL.md`:

```markdown
---
name: cfgm-switch
description: Switch the active problem to a different one
---

# Switch Active Problem

List available problems and switch:

```bash
bun run bin/cfgm-switch.ts list
bun run bin/cfgm-switch.ts "<problem-id>"
```

After switching, summarize the new active problem context.
```

Create `skills/cfgm-process/SKILL.md`:

```markdown
---
name: cfgm-process
description: Process pending analysis queue items
---

# Process Pending Queue

View and process pending analysis items:

```bash
bun run bin/cfgm-process.ts list
bun run bin/cfgm-process.ts next
bun run bin/cfgm-process.ts done "<item-id>"
```

Use `list` to see all pending items. Use `next` to view the oldest item. After analyzing an item, mark it done with `done <id>`.

As Claude, your job is to:
1. Read the pending item
2. Determine if it reveals causal information about the active problem
3. If yes, record the insight (Phase 2 will structure this into flow blocks)
4. Mark the item as done
```

Create `skills/cfgm-requeue/SKILL.md`:

```markdown
---
name: cfgm-requeue
description: Requeue expired analysis items back to pending
---

# Requeue Expired Items

Move expired items back to the pending queue:

```bash
bun run bin/cfgm-requeue.ts list
bun run bin/cfgm-requeue.ts all
bun run bin/cfgm-requeue.ts "<item-id>"
```

Use this when expired items are still relevant and need re-analysis.
```

- [ ] **Step 2: Write CLI test**

Create `tests/bin/cfgm-cli.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cfgm CLI tools", () => {
  let tmpDir: string;
  let projectMb: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "cfgm-cli-"));
    projectMb = join(tmpDir, ".memory-brain");
    await mkdir(join(projectMb, "state"), { recursive: true });
    await mkdir(join(projectMb, "ledger"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const run = (script: string, args: string[] = []) =>
    Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin", script), ...args],
      env: { ...process.env, CFGM_PROJECT_ROOT: tmpDir },
    });

  test("cfgm-new-problem creates a problem", () => {
    const result = run("cfgm-new-problem.ts", ["Fix auth", "fix-auth"]);
    expect(result.exitCode).toBe(0);
    const out = result.stdout.toString();
    expect(out).toContain("fix-auth");
  });

  test("cfgm-switch list shows problems", () => {
    run("cfgm-new-problem.ts", ["Problem A", "prob-a"]);
    run("cfgm-new-problem.ts", ["Problem B", "prob-b"]);
    const result = run("cfgm-switch.ts", ["list"]);
    expect(result.stdout.toString()).toContain("prob-a");
    expect(result.stdout.toString()).toContain("prob-b");
  });

  test("cfgm-process list shows empty queue", () => {
    const result = run("cfgm-process.ts", ["list"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("0");
  });

  test("cfgm-requeue list shows empty", () => {
    const result = run("cfgm-requeue.ts", ["list"]);
    expect(result.exitCode).toBe(0);
  });
});
```

- [ ] **Step 3: Implement CLI helpers**

Create `bin/cfgm-new-problem.ts`:

```typescript
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { ActiveProblemStore } from "../src/core/binder/ActiveProblemStore";

const projectRoot = process.env.CFGM_PROJECT_ROOT || process.cwd();
const mbPath = `${projectRoot}/.memory-brain`;

const storage = new FsStorage(mbPath);
const clock = new RealClock();
const store = new ActiveProblemStore(storage, clock);

const [title, slug] = process.argv.slice(2);
if (!title || !slug) {
  console.error("Usage: cfgm-new-problem <title> <slug>");
  process.exit(1);
}

const problem = await store.create(title, slug);
console.log(`Created problem: ${problem.id} (${problem.slug})`);
console.log(`Title: ${problem.title}`);
console.log(`Active: true`);
```

Create `bin/cfgm-switch.ts`:

```typescript
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { ActiveProblemStore } from "../src/core/binder/ActiveProblemStore";

const projectRoot = process.env.CFGM_PROJECT_ROOT || process.cwd();
const storage = new FsStorage(`${projectRoot}/.memory-brain`);
const store = new ActiveProblemStore(storage, new RealClock());

const [action] = process.argv.slice(2);

if (action === "list") {
  const history = await store.getHistory();
  const active = await store.getActive();
  if (history.length === 0) {
    console.log("No problems found. Use cfgm-new-problem to create one.");
  } else {
    for (const p of history) {
      const marker = p.id === active?.id ? " ← active" : "";
      console.log(`${p.id} | ${p.slug} | ${p.title}${marker}`);
    }
  }
} else if (action) {
  await store.switchTo(action);
  const active = await store.getActive();
  console.log(`Switched to: ${active?.title} (${active?.slug})`);
} else {
  console.error("Usage: cfgm-switch list | <problem-id>");
  process.exit(1);
}
```

Create `bin/cfgm-process.ts`:

```typescript
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { PendingQueue } from "../src/core/ledger/PendingQueue";

const projectRoot = process.env.CFGM_PROJECT_ROOT || process.cwd();
const storage = new FsStorage(`${projectRoot}/.memory-brain`);
const queue = new PendingQueue(storage, new RealClock());

const [action, itemId] = process.argv.slice(2);

if (action === "list") {
  const items = await queue.list();
  console.log(`Pending items: ${items.length}`);
  for (const item of items) {
    console.log(`  ${item.id} | ${item.payload.type} | ${item.enqueuedAt}`);
  }
} else if (action === "next") {
  const item = await queue.peek();
  if (!item) {
    console.log("Queue is empty.");
  } else {
    console.log(JSON.stringify(item, null, 2));
  }
} else if (action === "done" && itemId) {
  await queue.dequeue(itemId);
  console.log(`Removed: ${itemId}`);
} else {
  console.error("Usage: cfgm-process list | next | done <item-id>");
  process.exit(1);
}
```

Create `bin/cfgm-requeue.ts`:

```typescript
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { PendingQueue } from "../src/core/ledger/PendingQueue";
import type { PendingItem } from "../src/core/ledger/PendingQueue";

const projectRoot = process.env.CFGM_PROJECT_ROOT || process.cwd();
const storage = new FsStorage(`${projectRoot}/.memory-brain`);
const clock = new RealClock();
const queue = new PendingQueue(storage, clock);

const EXPIRED_PATH = "ledger/expired-analysis.jsonl";

const [action, itemId] = process.argv.slice(2);

if (action === "list") {
  const expired = await storage.readJsonl<PendingItem & { expiredAt: string }>(EXPIRED_PATH);
  console.log(`Expired items: ${expired.length}`);
  for (const item of expired) {
    console.log(`  ${item.id} | ${item.payload.type} | expired: ${item.expiredAt}`);
  }
} else if (action === "all") {
  const expired = await storage.readJsonl<PendingItem>(EXPIRED_PATH);
  for (const item of expired) {
    await queue.enqueue(item.payload);
  }
  await storage.writeRaw(EXPIRED_PATH, "");
  console.log(`Requeued ${expired.length} items.`);
} else if (action && itemId === undefined) {
  const expired = await storage.readJsonl<PendingItem & { expiredAt: string }>(EXPIRED_PATH);
  const target = expired.find((i) => i.id === action);
  if (!target) {
    console.error(`Item not found: ${action}`);
    process.exit(1);
  }
  await queue.enqueue(target.payload);
  const remaining = expired.filter((i) => i.id !== action);
  const content = remaining.map((i) => JSON.stringify(i)).join("\n") + (remaining.length ? "\n" : "");
  await storage.writeRaw(EXPIRED_PATH, content);
  console.log(`Requeued: ${action}`);
} else {
  console.error("Usage: cfgm-requeue list | all | <item-id>");
  process.exit(1);
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/bin/cfgm-cli.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/ bin/cfgm-*.ts tests/bin/cfgm-cli.test.ts
git commit -m "feat(E1-S10): slash command skills and CLI helpers"
```

---

## Task 18: E1-S11 — E2E 통합 테스트 (골든 패스)

**Files:**
- Create: `tests/e2e/phase1-golden-path.test.ts`

- [ ] **Step 1: Write E2E golden path test**

Create `tests/e2e/phase1-golden-path.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { Expirer } from "../../src/core/ledger/Expirer";
import { ObservationNormalizer } from "../../src/core/normalizer/ObservationNormalizer";
import { Redactor } from "../../src/core/security/Redactor";
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

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    ledger = new RawLedger(storage, clock);
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    expirer = new Expirer(storage, clock, 7);
    normalizer = new ObservationNormalizer(new Redactor(storage, clock));
  });

  test("full session lifecycle: start → prompt → tools → end", async () => {
    // 1. SessionStart — empty state
    const startEvent: CanonicalEvent = {
      platform: "claude-code", stage: "session-start", sessionId: "e2e-001",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
    };
    const startOutput = await handleSessionStart(startEvent, {
      storage, clock, problemStore, queue, ledger, expirer,
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
      storage, clock, problemStore, queue, ledger,
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
    expect(await queue.count()).toBe(0); // Edit is deterministic

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
    expect(await queue.count()).toBe(0); // Bash is deterministic

    // 7. PostToolUse — WebFetch (ambiguous → pending queue)
    clock.advance(1000);
    const postFetchEvent: CanonicalEvent = {
      platform: "claude-code", stage: "tool-post", sessionId: "e2e-001",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "tool-post", toolName: "WebFetch", toolInput: { url: "https://example.com" }, toolOutput: "data", correlationId: "corr-003" },
      raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handlePostToolUse(postFetchEvent, { storage, clock, ledger, queue, normalizer });
    expect(await queue.count()).toBe(1); // WebFetch is ambiguous

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
    await handleSessionEnd(endEvent, { storage, clock, problemStore, ledger, queue });

    // 11. Verify final state
    const active = await problemStore.getActive();
    expect(active?.title).toBe("Fix auth timeout");

    // Verify raw ledger: start + prompt + preEdit + postEdit + preBash + postBash + postFetch + end = 8
    const rawRecords = await storage.readJsonl("ledger/raw/2026/04/17/session-e2e-001.jsonl");
    expect(rawRecords.length).toBe(8);

    // Verify pending queue is empty
    expect(await queue.count()).toBe(0);
  });

  test("session with expired pending items gets cleaned on restart", async () => {
    // Setup: enqueue an old item
    await queue.enqueue({ type: "old-item", data: {} });
    clock.advance(8 * 24 * 60 * 60 * 1000); // 8 days later

    // SessionStart sweeps expired items
    const startEvent: CanonicalEvent = {
      platform: "claude-code", stage: "session-start", sessionId: "e2e-002",
      cwd: "/project", timestampIso: clock.isoNow(),
      payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
    };
    await handleSessionStart(startEvent, {
      storage, clock, problemStore, queue, ledger, expirer,
    });

    // Pending should be empty, expired should have the item
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
```

- [ ] **Step 2: Run E2E test**

```bash
bun test tests/e2e/phase1-golden-path.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
bun test
```

Expected: All tests PASS across all files.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/phase1-golden-path.test.ts
git commit -m "feat(E1-S11): E2E golden path test for Phase 1 lifecycle"
```

---

## Phase 1 완료 체크

모든 태스크 완료 후 확인:

```bash
bun test --coverage
bun run typecheck
```

Expected:
- All tests PASS
- Line coverage ≥ 85%
- No type errors

최종 커밋:

```bash
git add -A
git commit -m "chore: Phase 1 complete — Epic 0 + Epic 1 all green"
```
