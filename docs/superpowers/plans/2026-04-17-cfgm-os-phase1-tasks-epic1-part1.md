# Phase 1 Tasks — Epic 1: Hook-native Ledger MVP (Part 1: Core Modules)

Parent plan: [`2026-04-17-cfgm-os-phase1.md`](./2026-04-17-cfgm-os-phase1.md)

Tasks 8-11: RawLedger, ActiveProblemStore, ObservationNormalizer, PendingQueue + Expirer

---

## Task 8: E1-S1 — Raw Ledger Writer

**Files:**
- Create: `src/core/ledger/RawLedger.ts`
- Create: `tests/core/ledger/raw-ledger.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/core/ledger/raw-ledger.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { RawLedger } from "../../../src/core/ledger/RawLedger";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { CanonicalEvent } from "../../../src/core/events/CanonicalEvent";

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    platform: "claude-code",
    stage: "tool-post",
    sessionId: "sess-001",
    cwd: "/project",
    timestampIso: "2026-04-17T10:00:00.000Z",
    payload: { stage: "tool-post", toolName: "Edit", toolInput: {}, toolOutput: "ok", correlationId: "c1" },
    raw: {},
    adapterVersion: "claude-code@1.0",
    ...overrides,
  };
}

describe("RawLedger", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let ledger: RawLedger;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    ledger = new RawLedger(storage, clock);
  });

  test("appends event to session-based JSONL path", async () => {
    await ledger.append(makeEvent());
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("includes event hash in ledger entry", async () => {
    await ledger.append(makeEvent());
    const records = await storage.readJsonl<{ hash: string }>("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records[0].hash).toBeDefined();
    expect(typeof records[0].hash).toBe("string");
  });

  test("multiple events append in order", async () => {
    await ledger.append(makeEvent({ timestampIso: "2026-04-17T10:00:00Z" }));
    await ledger.append(makeEvent({ timestampIso: "2026-04-17T10:01:00Z" }));
    await ledger.append(makeEvent({ timestampIso: "2026-04-17T10:02:00Z" }));
    const records = await storage.readJsonl<{ event: CanonicalEvent }>("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(3);
    expect(records[0].event.timestampIso).toBe("2026-04-17T10:00:00Z");
    expect(records[2].event.timestampIso).toBe("2026-04-17T10:02:00Z");
  });

  test("different sessions go to different files", async () => {
    await ledger.append(makeEvent({ sessionId: "sess-A" }));
    await ledger.append(makeEvent({ sessionId: "sess-B" }));
    const a = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-A.jsonl");
    const b = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-B.jsonl");
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
  });

  test("concurrent appends preserve all records", async () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      ledger.append(makeEvent({ timestampIso: `2026-04-17T10:00:${String(i).padStart(2, "0")}Z` }))
    );
    await Promise.all(promises);
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(50);
  });

  test("date in path matches clock, not event timestamp", async () => {
    clock.set("2026-05-01T00:00:00Z");
    await ledger.append(makeEvent({ timestampIso: "2026-04-17T10:00:00Z" }));
    const records = await storage.readJsonl("ledger/raw/2026/05/01/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/core/ledger/raw-ledger.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement RawLedger**

Create `src/core/ledger/RawLedger.ts`:

```typescript
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { CanonicalEvent } from "../events/CanonicalEvent";

export class RawLedger {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock
  ) {}

  async append(event: CanonicalEvent): Promise<void> {
    const now = this.clock.now();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const path = `ledger/raw/${yyyy}/${mm}/${dd}/session-${event.sessionId}.jsonl`;

    const entry = {
      event,
      hash: await this.computeHash(event),
      recordedAt: this.clock.isoNow(),
    };

    await this.storage.appendJsonl(path, entry);
  }

  private async computeHash(event: CanonicalEvent): Promise<string> {
    const data = JSON.stringify({
      stage: event.stage,
      sessionId: event.sessionId,
      timestampIso: event.timestampIso,
      payload: event.payload,
    });
    const hash = new Bun.CryptoHasher("sha256").update(data).digest("hex");
    return hash.slice(0, 16);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/core/ledger/raw-ledger.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/ledger/RawLedger.ts tests/core/ledger/raw-ledger.test.ts
git commit -m "feat(E1-S1): Raw Ledger Writer with session-based JSONL paths"
```

---

## Task 9: E1-S2 — Active Problem State 관리자

**Files:**
- Create: `src/core/binder/ActiveProblemStore.ts`
- Create: `tests/core/binder/active-problem.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/core/binder/active-problem.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { ActiveProblemStore, type Problem } from "../../../src/core/binder/ActiveProblemStore";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("ActiveProblemStore", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let store: ActiveProblemStore;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    store = new ActiveProblemStore(storage, clock);
  });

  test("getActive returns null when no problem exists", async () => {
    expect(await store.getActive()).toBeNull();
  });

  test("create sets new active problem", async () => {
    const p = await store.create("fix auth bug", "fix-auth-bug");
    expect(p.id).toMatch(/^prob-/);
    expect(p.slug).toBe("fix-auth-bug");
    expect(p.title).toBe("fix auth bug");
    const active = await store.getActive();
    expect(active?.id).toBe(p.id);
  });

  test("switch changes active problem", async () => {
    const p1 = await store.create("problem 1", "prob-1");
    const p2 = await store.create("problem 2", "prob-2");
    expect((await store.getActive())?.id).toBe(p2.id);
    await store.switchTo(p1.id);
    expect((await store.getActive())?.id).toBe(p1.id);
  });

  test("switch to nonexistent throws", async () => {
    expect(store.switchTo("prob-nonexistent")).rejects.toThrow();
  });

  test("updateLastConfirmed updates timestamp", async () => {
    await store.create("test", "test");
    clock.advance(60_000);
    await store.updateLastConfirmed();
    const active = await store.getActive();
    expect(active?.lastConfirmedAt).toBe(clock.isoNow());
  });

  test("getHistory returns all problems", async () => {
    await store.create("p1", "p1");
    await store.create("p2", "p2");
    await store.create("p3", "p3");
    const history = await store.getHistory();
    expect(history.length).toBe(3);
  });

  test("getSummary returns markdown string", async () => {
    await store.create("fix login", "fix-login");
    const summary = await store.getSummary();
    expect(summary).toContain("fix login");
  });

  test("getSummary returns empty message when no active", async () => {
    const summary = await store.getSummary();
    expect(summary).toContain("활성 문제 없음");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/core/binder/active-problem.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ActiveProblemStore**

Create `src/core/binder/ActiveProblemStore.ts`:

```typescript
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { randomUUID } from "node:crypto";

export type Problem = {
  id: string;
  title: string;
  slug: string;
  createdAt: string;
  lastConfirmedAt: string;
};

type ActiveState = {
  activeId: string | null;
  problems: Problem[];
};

const STATE_PATH = "state/active-problem.json";

export class ActiveProblemStore {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock
  ) {}

  private async load(): Promise<ActiveState> {
    const data = await this.storage.readJson<ActiveState>(STATE_PATH);
    return data ?? { activeId: null, problems: [] };
  }

  private async save(state: ActiveState): Promise<void> {
    await this.storage.writeJsonAtomic(STATE_PATH, state);
  }

  async getActive(): Promise<Problem | null> {
    const state = await this.load();
    if (!state.activeId) return null;
    return state.problems.find((p) => p.id === state.activeId) ?? null;
  }

  async create(title: string, slug: string): Promise<Problem> {
    const state = await this.load();
    const problem: Problem = {
      id: `prob-${randomUUID().slice(0, 8)}`,
      title,
      slug,
      createdAt: this.clock.isoNow(),
      lastConfirmedAt: this.clock.isoNow(),
    };
    state.problems.push(problem);
    state.activeId = problem.id;
    await this.save(state);
    return problem;
  }

  async switchTo(problemId: string): Promise<void> {
    const state = await this.load();
    const found = state.problems.find((p) => p.id === problemId);
    if (!found) throw new Error(`Problem not found: ${problemId}`);
    state.activeId = problemId;
    found.lastConfirmedAt = this.clock.isoNow();
    await this.save(state);
  }

  async updateLastConfirmed(): Promise<void> {
    const state = await this.load();
    if (!state.activeId) return;
    const active = state.problems.find((p) => p.id === state.activeId);
    if (active) {
      active.lastConfirmedAt = this.clock.isoNow();
      await this.save(state);
    }
  }

  async getHistory(): Promise<Problem[]> {
    const state = await this.load();
    return state.problems;
  }

  async getSummary(): Promise<string> {
    const active = await this.getActive();
    if (!active) return "활성 문제 없음";
    return `**문제:** ${active.title} (\`${active.slug}\`)\n확인: ${active.lastConfirmedAt}`;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/core/binder/active-problem.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/binder/ActiveProblemStore.ts tests/core/binder/active-problem.test.ts
git commit -m "feat(E1-S2): ActiveProblemStore with create/switch/history"
```

---

## Task 10: E1-S3 — Observation Normalizer

**Files:**
- Create: `src/core/security/patterns.ts`
- Create: `src/core/security/Redactor.ts`
- Create: `src/core/normalizer/ObservationNormalizer.ts`
- Create: `tests/core/security/redactor.test.ts`
- Create: `tests/core/normalizer/normalizer.test.ts`

- [ ] **Step 1: Write security patterns**

Create `src/core/security/patterns.ts`:

```typescript
export type SensitivePattern = {
  name: string;
  regex: RegExp;
};

export const DEFAULT_PATTERNS: SensitivePattern[] = [
  { name: "anthropic-key", regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  { name: "openai-key", regex: /sk-[a-zA-Z0-9]{20,}/g },
  { name: "aws-key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "jwt", regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]*/g },
  { name: "password-field", regex: /password\s*[=:]\s*["']?[^\s"']{4,}/gi },
  { name: "generic-secret", regex: /(?:secret|token|apikey|api_key)\s*[=:]\s*["']?[^\s"']{8,}/gi },
];
```

- [ ] **Step 2: Write Redactor**

Create `src/core/security/Redactor.ts`:

```typescript
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { DEFAULT_PATTERNS, type SensitivePattern } from "./patterns";

export type RedactionRecord = {
  timestamp: string;
  patternName: string;
  context: string;
};

export class Redactor {
  private patterns: SensitivePattern[];

  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
    customPatterns?: SensitivePattern[]
  ) {
    this.patterns = customPatterns ?? DEFAULT_PATTERNS;
  }

  async redact(input: string): Promise<{ text: string; redacted: boolean }> {
    let text = input;
    let redacted = false;

    for (const pattern of this.patterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      if (regex.test(text)) {
        redacted = true;
        text = text.replace(new RegExp(pattern.regex.source, pattern.regex.flags), `<REDACTED:${pattern.name}>`);
        await this.storage.appendJsonl("security/redacted.jsonl", {
          timestamp: this.clock.isoNow(),
          patternName: pattern.name,
          context: input.slice(0, 100),
        } satisfies RedactionRecord);
      }
    }

    return { text, redacted };
  }
}
```

- [ ] **Step 3: Write redactor test**

Create `tests/core/security/redactor.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { Redactor } from "../../../src/core/security/Redactor";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("Redactor", () => {
  let storage: MemoryStorage;
  let redactor: Redactor;

  beforeEach(() => {
    storage = new MemoryStorage();
    redactor = new Redactor(storage, new FakeClock());
  });

  test("redacts Anthropic API key", async () => {
    const { text, redacted } = await redactor.redact("key is sk-ant-abcdefghijklmnopqrstuv");
    expect(redacted).toBe(true);
    expect(text).toContain("<REDACTED:anthropic-key>");
    expect(text).not.toContain("sk-ant-");
  });

  test("redacts OpenAI key", async () => {
    const { text, redacted } = await redactor.redact("sk-abcdefghijklmnopqrstuvwxyz");
    expect(redacted).toBe(true);
    expect(text).toContain("<REDACTED:openai-key>");
  });

  test("redacts AWS key", async () => {
    const { text } = await redactor.redact("AKIAIOSFODNN7EXAMPLE");
    expect(text).toContain("<REDACTED:aws-key>");
  });

  test("redacts JWT token", async () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123";
    const { text } = await redactor.redact(jwt);
    expect(text).toContain("<REDACTED:jwt>");
  });

  test("redacts password field", async () => {
    const { text } = await redactor.redact('password="mysecretpass123"');
    expect(text).toContain("<REDACTED:password-field>");
  });

  test("leaves clean text unchanged", async () => {
    const { text, redacted } = await redactor.redact("normal code without secrets");
    expect(redacted).toBe(false);
    expect(text).toBe("normal code without secrets");
  });

  test("logs to redacted.jsonl", async () => {
    await redactor.redact("sk-ant-abcdefghijklmnopqrstuv");
    const logs = await storage.readJsonl<{ patternName: string }>("security/redacted.jsonl");
    expect(logs.length).toBe(1);
    expect(logs[0].patternName).toBe("anthropic-key");
  });
});
```

- [ ] **Step 4: Write Observation types and normalizer**

Create `src/core/normalizer/ObservationNormalizer.ts`:

```typescript
import type { CanonicalEvent } from "../events/CanonicalEvent";
import type { Redactor } from "../security/Redactor";

export type Observation = {
  type: string;
  sessionId: string;
  timestamp: string;
  data: Record<string, unknown>;
  needsAnalysis: boolean;
};

export class ObservationNormalizer {
  constructor(private readonly redactor: Redactor) {}

  async normalize(event: CanonicalEvent): Promise<Observation | null> {
    const base = {
      sessionId: event.sessionId,
      timestamp: event.timestampIso,
    };

    switch (event.payload.stage) {
      case "tool-post": {
        const p = event.payload;
        const data = await this.normalizeToolPost(p.toolName, p.toolInput, p.toolOutput);
        return { ...base, type: `tool:${p.toolName}`, data, needsAnalysis: data._ambiguous === true };
      }
      case "prompt-submit": {
        const { text: redacted } = await this.redactor.redact(event.payload.message);
        return { ...base, type: "user-intent", data: { userIntentRaw: redacted }, needsAnalysis: true };
      }
      case "session-start":
        return { ...base, type: "session-start", data: {}, needsAnalysis: false };
      case "session-end":
        return { ...base, type: "session-end", data: {}, needsAnalysis: false };
      default:
        return null;
    }
  }

  private async normalizeToolPost(
    toolName: string,
    toolInput: unknown,
    toolOutput: unknown
  ): Promise<Record<string, unknown>> {
    const input = toolInput as Record<string, unknown>;
    const output = toolOutput as Record<string, unknown> | string;

    switch (toolName) {
      case "Edit":
      case "Write":
        return {
          filesTouched: [input.file_path ?? input.filePath ?? "unknown"],
          action: toolName.toLowerCase(),
        };
      case "Bash": {
        const { text: redactedCmd } = await this.redactor.redact(String(input.command ?? ""));
        const outputStr = typeof output === "string" ? output : JSON.stringify(output);
        return {
          command: redactedCmd,
          exitCode: typeof output === "object" && output !== null ? (output as any).exitCode ?? 0 : 0,
          outputSnippet: outputStr.slice(0, 200),
        };
      }
      case "Read":
        return { filesRead: [input.file_path ?? input.filePath ?? "unknown"] };
      case "Glob":
      case "Grep":
        return { searchPattern: input.pattern ?? input.glob ?? "", filesMatched: [] };
      default:
        return { toolName, _ambiguous: true };
    }
  }
}
```

- [ ] **Step 5: Write normalizer test**

Create `tests/core/normalizer/normalizer.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { ObservationNormalizer } from "../../../src/core/normalizer/ObservationNormalizer";
import { Redactor } from "../../../src/core/security/Redactor";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { CanonicalEvent } from "../../../src/core/events/CanonicalEvent";

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    platform: "claude-code", stage: "tool-post", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T10:00:00Z",
    payload: { stage: "tool-post", toolName: "Edit", toolInput: { file_path: "/src/a.ts" }, toolOutput: "ok", correlationId: "c1" },
    raw: {}, adapterVersion: "claude-code@1.0", ...overrides,
  };
}

describe("ObservationNormalizer", () => {
  let normalizer: ObservationNormalizer;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    normalizer = new ObservationNormalizer(new Redactor(storage, new FakeClock()));
  });

  test("Edit → filesTouched", async () => {
    const obs = await normalizer.normalize(makeEvent());
    expect(obs?.type).toBe("tool:Edit");
    expect(obs?.data.filesTouched).toEqual(["/src/a.ts"]);
    expect(obs?.needsAnalysis).toBe(false);
  });

  test("Write → filesTouched", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "Write", toolInput: { file_path: "/new.ts" }, toolOutput: "ok", correlationId: "c2" },
    }));
    expect(obs?.data.filesTouched).toEqual(["/new.ts"]);
  });

  test("Bash → command + exitCode", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "Bash", toolInput: { command: "bun test" }, toolOutput: "PASS", correlationId: "c3" },
    }));
    expect(obs?.type).toBe("tool:Bash");
    expect(obs?.data.command).toBe("bun test");
  });

  test("Bash with secret in command gets redacted", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "Bash", toolInput: { command: "curl -H 'Authorization: sk-ant-abcdefghijklmnopqrstuv'" }, toolOutput: "ok", correlationId: "c4" },
    }));
    expect(obs?.data.command).toContain("<REDACTED:");
  });

  test("Read → filesRead", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "Read", toolInput: { file_path: "/src/b.ts" }, toolOutput: "content", correlationId: "c5" },
    }));
    expect(obs?.data.filesRead).toEqual(["/src/b.ts"]);
  });

  test("Grep → searchPattern", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "Grep", toolInput: { pattern: "TODO" }, toolOutput: "", correlationId: "c6" },
    }));
    expect(obs?.data.searchPattern).toBe("TODO");
  });

  test("unknown tool → ambiguous + needsAnalysis", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "WebFetch", toolInput: {}, toolOutput: "", correlationId: "c7" },
    }));
    expect(obs?.needsAnalysis).toBe(true);
    expect(obs?.data._ambiguous).toBe(true);
  });

  test("prompt-submit → user-intent + needsAnalysis", async () => {
    const obs = await normalizer.normalize(makeEvent({
      stage: "prompt-submit",
      payload: { stage: "prompt-submit", message: "Fix the auth bug" },
    }));
    expect(obs?.type).toBe("user-intent");
    expect(obs?.data.userIntentRaw).toBe("Fix the auth bug");
    expect(obs?.needsAnalysis).toBe(true);
  });

  test("session-start → no analysis needed", async () => {
    const obs = await normalizer.normalize(makeEvent({
      stage: "session-start",
      payload: { stage: "session-start" },
    }));
    expect(obs?.type).toBe("session-start");
    expect(obs?.needsAnalysis).toBe(false);
  });

  test("tool-pre returns null (pre events not normalized)", async () => {
    const obs = await normalizer.normalize(makeEvent({
      stage: "tool-pre",
      payload: { stage: "tool-pre", toolName: "Edit", toolInput: {}, correlationId: "c8" },
    }));
    expect(obs).toBeNull();
  });

  test("prompt-submit with secret gets redacted", async () => {
    const obs = await normalizer.normalize(makeEvent({
      stage: "prompt-submit",
      payload: { stage: "prompt-submit", message: "use password=superSecret123 for testing" },
    }));
    expect(obs?.data.userIntentRaw).toContain("<REDACTED:");
  });
});
```

- [ ] **Step 6: Run tests**

```bash
bun test tests/core/security/redactor.test.ts tests/core/normalizer/normalizer.test.ts
```

Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/security/ src/core/normalizer/ tests/core/security/ tests/core/normalizer/
git commit -m "feat(E1-S3): ObservationNormalizer with Redactor and security patterns"
```

---

## Task 11: E1-S4 — Pending Analysis Queue + TTL Expirer

**Files:**
- Create: `src/core/ledger/PendingQueue.ts`
- Create: `src/core/ledger/Expirer.ts`
- Create: `tests/core/ledger/pending-queue.test.ts`
- Create: `tests/core/ledger/expirer.test.ts`

- [ ] **Step 1: Write PendingQueue test**

Create `tests/core/ledger/pending-queue.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { PendingQueue, type PendingItem } from "../../../src/core/ledger/PendingQueue";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("PendingQueue", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let queue: PendingQueue;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    queue = new PendingQueue(storage, clock);
  });

  test("enqueue adds item to pending-analysis.jsonl", async () => {
    await queue.enqueue({ type: "user-intent", data: { message: "fix bug" } });
    const items = await queue.list();
    expect(items.length).toBe(1);
    expect(items[0].payload.type).toBe("user-intent");
  });

  test("enqueue assigns unique id and timestamp", async () => {
    await queue.enqueue({ type: "test", data: {} });
    const items = await queue.list();
    expect(items[0].id).toBeDefined();
    expect(items[0].enqueuedAt).toBe("2026-04-17T10:00:00.000Z");
  });

  test("multiple items append in order", async () => {
    await queue.enqueue({ type: "a", data: {} });
    clock.advance(1000);
    await queue.enqueue({ type: "b", data: {} });
    const items = await queue.list();
    expect(items.length).toBe(2);
    expect(items[0].payload.type).toBe("a");
    expect(items[1].payload.type).toBe("b");
  });

  test("dequeue removes item by id", async () => {
    await queue.enqueue({ type: "a", data: {} });
    await queue.enqueue({ type: "b", data: {} });
    const items = await queue.list();
    await queue.dequeue(items[0].id);
    const remaining = await queue.list();
    expect(remaining.length).toBe(1);
    expect(remaining[0].payload.type).toBe("b");
  });

  test("count returns number of items", async () => {
    expect(await queue.count()).toBe(0);
    await queue.enqueue({ type: "a", data: {} });
    await queue.enqueue({ type: "b", data: {} });
    expect(await queue.count()).toBe(2);
  });

  test("peek returns oldest item without removing", async () => {
    await queue.enqueue({ type: "first", data: {} });
    await queue.enqueue({ type: "second", data: {} });
    const item = await queue.peek();
    expect(item?.payload.type).toBe("first");
    expect(await queue.count()).toBe(2);
  });

  test("peek returns null when empty", async () => {
    expect(await queue.peek()).toBeNull();
  });
});
```

- [ ] **Step 2: Write Expirer test**

Create `tests/core/ledger/expirer.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { Expirer } from "../../../src/core/ledger/Expirer";
import { PendingQueue } from "../../../src/core/ledger/PendingQueue";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("Expirer", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let queue: PendingQueue;
  let expirer: Expirer;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    queue = new PendingQueue(storage, clock);
    expirer = new Expirer(storage, clock, 7);
  });

  test("does nothing when queue is empty", async () => {
    const expired = await expirer.sweep(queue);
    expect(expired).toBe(0);
  });

  test("does not expire items within TTL", async () => {
    await queue.enqueue({ type: "recent", data: {} });
    clock.advance(6 * 24 * 60 * 60 * 1000); // 6 days
    const expired = await expirer.sweep(queue);
    expect(expired).toBe(0);
    expect(await queue.count()).toBe(1);
  });

  test("expires items past TTL", async () => {
    await queue.enqueue({ type: "old", data: {} });
    clock.advance(8 * 24 * 60 * 60 * 1000); // 8 days
    const expired = await expirer.sweep(queue);
    expect(expired).toBe(1);
    expect(await queue.count()).toBe(0);
  });

  test("moves expired items to expired-analysis.jsonl", async () => {
    await queue.enqueue({ type: "old", data: {} });
    clock.advance(8 * 24 * 60 * 60 * 1000);
    await expirer.sweep(queue);
    const archived = await storage.readJsonl<{ payload: { type: string } }>("ledger/expired-analysis.jsonl");
    expect(archived.length).toBe(1);
    expect(archived[0].payload.type).toBe("old");
  });

  test("mixed: expires old, keeps recent", async () => {
    await queue.enqueue({ type: "old-1", data: {} });
    clock.advance(5 * 24 * 60 * 60 * 1000);
    await queue.enqueue({ type: "recent", data: {} });
    clock.advance(3 * 24 * 60 * 60 * 1000); // old-1 = 8 days, recent = 3 days
    const expired = await expirer.sweep(queue);
    expect(expired).toBe(1);
    const remaining = await queue.list();
    expect(remaining.length).toBe(1);
    expect(remaining[0].payload.type).toBe("recent");
  });

  test("raw ledger is not affected by expiration", async () => {
    await storage.appendJsonl("ledger/raw/2026/04/17/session-test.jsonl", { preserved: true });
    await queue.enqueue({ type: "old", data: {} });
    clock.advance(8 * 24 * 60 * 60 * 1000);
    await expirer.sweep(queue);
    const raw = await storage.readJsonl("ledger/raw/2026/04/17/session-test.jsonl");
    expect(raw.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun test tests/core/ledger/pending-queue.test.ts tests/core/ledger/expirer.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Implement PendingQueue**

Create `src/core/ledger/PendingQueue.ts`:

```typescript
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { randomUUID } from "node:crypto";

export type PendingItem = {
  id: string;
  enqueuedAt: string;
  payload: { type: string; data: Record<string, unknown> };
};

const PENDING_PATH = "ledger/pending-analysis.jsonl";

export class PendingQueue {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock
  ) {}

  async enqueue(payload: { type: string; data: Record<string, unknown> }): Promise<PendingItem> {
    const item: PendingItem = {
      id: `pend-${randomUUID().slice(0, 8)}`,
      enqueuedAt: this.clock.isoNow(),
      payload,
    };
    await this.storage.appendJsonl(PENDING_PATH, item);
    return item;
  }

  async list(): Promise<PendingItem[]> {
    return this.storage.readJsonl<PendingItem>(PENDING_PATH);
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }

  async peek(): Promise<PendingItem | null> {
    const items = await this.list();
    return items.length > 0 ? items[0] : null;
  }

  async dequeue(id: string): Promise<void> {
    const items = await this.list();
    const filtered = items.filter((i) => i.id !== id);
    await this.rewrite(filtered);
  }

  async removeExpired(ids: string[]): Promise<void> {
    const items = await this.list();
    const idSet = new Set(ids);
    const filtered = items.filter((i) => !idSet.has(i.id));
    await this.rewrite(filtered);
  }

  private async rewrite(items: PendingItem[]): Promise<void> {
    const content = items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : "");
    await this.storage.writeJsonAtomic(PENDING_PATH + ".tmp", items);
    // Rewrite as JSONL by re-appending
    // We need a dedicated method — for now, use writeJsonAtomic with a manual JSONL write
    // Actually, we'll overwrite via a simple approach:
    const lines = items.map((i) => JSON.stringify(i) + "\n").join("");
    // Use a workaround: write empty then append each
    // Better: add a writeRaw method or just write the file directly
    // For MemoryStorage compatibility, we'll clear and re-append
    await this.storage.writeJsonAtomic(PENDING_PATH, "__JSONL_REWRITE__");
    // This is a hack; let's use a proper rewrite approach
    // We need to support this in storage. For now, write all as a JSON array
    // and adjust readback. But that breaks JSONL contract.
    // Best approach: add a helper that works with both storage types.
  }
}
```

Wait — the rewrite logic has a problem with the Storage interface. Let me fix this properly.

**Revised** `src/core/ledger/PendingQueue.ts`:

```typescript
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { randomUUID } from "node:crypto";

export type PendingItem = {
  id: string;
  enqueuedAt: string;
  payload: { type: string; data: Record<string, unknown> };
};

const PENDING_PATH = "ledger/pending-analysis.jsonl";

export class PendingQueue {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock
  ) {}

  async enqueue(payload: { type: string; data: Record<string, unknown> }): Promise<PendingItem> {
    const item: PendingItem = {
      id: `pend-${randomUUID().slice(0, 8)}`,
      enqueuedAt: this.clock.isoNow(),
      payload,
    };
    await this.storage.appendJsonl(PENDING_PATH, item);
    return item;
  }

  async list(): Promise<PendingItem[]> {
    return this.storage.readJsonl<PendingItem>(PENDING_PATH);
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }

  async peek(): Promise<PendingItem | null> {
    const items = await this.list();
    return items.length > 0 ? items[0] : null;
  }

  async dequeue(id: string): Promise<void> {
    const items = await this.list();
    const filtered = items.filter((i) => i.id !== id);
    await this.rewriteJsonl(filtered);
  }

  async removeExpired(ids: string[]): Promise<void> {
    const items = await this.list();
    const idSet = new Set(ids);
    const filtered = items.filter((i) => !idSet.has(i.id));
    await this.rewriteJsonl(filtered);
  }

  private async rewriteJsonl(items: PendingItem[]): Promise<void> {
    const jsonlContent = items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : "");
    await this.storage.writeJsonAtomic(PENDING_PATH, jsonlContent);
  }
}
```

Hmm, but `writeJsonAtomic` wraps in `JSON.stringify` which would double-encode the JSONL string. We need to add a `writeRaw` method to Storage or adjust the approach. Let's add `writeRaw` to the Storage interface.

**Update `src/core/storage/Storage.ts`** — add `writeRaw`:

```typescript
export interface Storage {
  appendJsonl(path: string, record: unknown): Promise<void>;
  readJsonl<T = unknown>(path: string): Promise<T[]>;
  readJson<T = unknown>(path: string): Promise<T | null>;
  writeJsonAtomic(path: string, data: unknown): Promise<void>;
  writeRaw(path: string, content: string): Promise<void>;
  listFiles(dir: string, pattern?: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;
  fileSize(path: string): Promise<number>;
}
```

This is the cleanest approach. Let me write the final correct version of PendingQueue using `writeRaw`. I'll include the Storage update and both impl updates in the task steps.

OK let me just write the file now with the correct approach.

- [ ] **Step 4: Update Storage interface — add `writeRaw`**

Add to `src/core/storage/Storage.ts`:

```typescript
export interface Storage {
  appendJsonl(path: string, record: unknown): Promise<void>;
  readJsonl<T = unknown>(path: string): Promise<T[]>;
  readJson<T = unknown>(path: string): Promise<T | null>;
  writeJsonAtomic(path: string, data: unknown): Promise<void>;
  writeRaw(path: string, content: string): Promise<void>;
  listFiles(dir: string, pattern?: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;
  fileSize(path: string): Promise<number>;
}
```

Add to `src/core/storage/MemoryStorage.ts`:

```typescript
async writeRaw(path: string, content: string): Promise<void> {
  this.files.set(path, content);
}
```

Add to `src/core/storage/FsStorage.ts`:

```typescript
async writeRaw(path: string, content: string): Promise<void> {
  const full = this.resolve(path);
  await mkdir(dirname(full), { recursive: true });
  const tmp = full + ".tmp." + randomUUID().slice(0, 8);
  await writeFile(tmp, content);
  await rename(tmp, full);
}
```

Update contract test `tests/core/storage/storage.contract.test.ts` — add:

```typescript
test("writeRaw + readJsonl round-trip", async () => {
  const content = '{"a":1}\n{"b":2}\n';
  await storage.writeRaw("raw.jsonl", content);
  const records = await storage.readJsonl("raw.jsonl");
  expect(records).toEqual([{ a: 1 }, { b: 2 }]);
  await cleanup();
});
```

- [ ] **Step 5: Implement PendingQueue**

Create `src/core/ledger/PendingQueue.ts`:

```typescript
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { randomUUID } from "node:crypto";

export type PendingItem = {
  id: string;
  enqueuedAt: string;
  payload: { type: string; data: Record<string, unknown> };
};

const PENDING_PATH = "ledger/pending-analysis.jsonl";

export class PendingQueue {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock
  ) {}

  async enqueue(payload: { type: string; data: Record<string, unknown> }): Promise<PendingItem> {
    const item: PendingItem = {
      id: `pend-${randomUUID().slice(0, 8)}`,
      enqueuedAt: this.clock.isoNow(),
      payload,
    };
    await this.storage.appendJsonl(PENDING_PATH, item);
    return item;
  }

  async list(): Promise<PendingItem[]> {
    return this.storage.readJsonl<PendingItem>(PENDING_PATH);
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }

  async peek(): Promise<PendingItem | null> {
    const items = await this.list();
    return items.length > 0 ? items[0] : null;
  }

  async dequeue(id: string): Promise<void> {
    const items = await this.list();
    const filtered = items.filter((i) => i.id !== id);
    await this.rewriteJsonl(filtered);
  }

  async removeExpired(ids: string[]): Promise<void> {
    const items = await this.list();
    const idSet = new Set(ids);
    const filtered = items.filter((i) => !idSet.has(i.id));
    await this.rewriteJsonl(filtered);
  }

  private async rewriteJsonl(items: PendingItem[]): Promise<void> {
    const content = items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : "");
    await this.storage.writeRaw(PENDING_PATH, content);
  }
}
```

- [ ] **Step 6: Implement Expirer**

Create `src/core/ledger/Expirer.ts`:

```typescript
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { PendingQueue, PendingItem } from "./PendingQueue";

const EXPIRED_PATH = "ledger/expired-analysis.jsonl";

export class Expirer {
  private readonly ttlMs: number;

  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
    ttlDays: number = 7
  ) {
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  }

  async sweep(queue: PendingQueue): Promise<number> {
    const items = await queue.list();
    const now = this.clock.now().getTime();
    const expired: PendingItem[] = [];
    const expiredIds: string[] = [];

    for (const item of items) {
      const age = now - new Date(item.enqueuedAt).getTime();
      if (age >= this.ttlMs) {
        expired.push(item);
        expiredIds.push(item.id);
      }
    }

    if (expired.length === 0) return 0;

    for (const item of expired) {
      await this.storage.appendJsonl(EXPIRED_PATH, {
        ...item,
        expiredAt: this.clock.isoNow(),
      });
    }

    await queue.removeExpired(expiredIds);
    return expired.length;
  }
}
```

- [ ] **Step 7: Run all tests**

```bash
bun test tests/core/ledger/pending-queue.test.ts tests/core/ledger/expirer.test.ts tests/core/storage/storage.contract.test.ts
```

Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/storage/Storage.ts src/core/storage/MemoryStorage.ts src/core/storage/FsStorage.ts src/core/ledger/PendingQueue.ts src/core/ledger/Expirer.ts tests/core/ledger/ tests/core/storage/
git commit -m "feat(E1-S4): PendingQueue + Expirer with 7-day TTL sweep"
```
