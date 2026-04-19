# Phase 1 Tasks — Epic 0: Dev Infrastructure

Parent plan: [`2026-04-17-cfgm-os-phase1.md`](./2026-04-17-cfgm-os-phase1.md)

---

## Task 1: E0-S1 — Bun 프로젝트 초기화

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bunfig.toml`
- Create: `tests/smoke/setup.test.ts`

- [ ] **Step 1: Initialize Bun project**

```bash
cd /Users/treestar/dev/memory-brain
bun init -y
```

- [ ] **Step 2: Configure package.json**

Replace `package.json`:

```json
{
  "name": "cfgm-os",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "bun test",
    "typecheck": "bun x tsc --noEmit",
    "test:coverage": "bun test --coverage"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 3: Configure tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "types": ["bun-types"],
    "paths": {
      "@core/*": ["./src/core/*"],
      "@adapters/*": ["./src/adapters/*"],
      "@fixtures/*": ["./fixtures/*"]
    }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "bin/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Configure bunfig.toml**

```toml
[test]
root = "./tests"
preload = []

[test.coverage]
enabled = true
```

- [ ] **Step 5: Create directory skeleton**

```bash
mkdir -p src/core/{events,storage,ledger,normalizer,binder,security,clock}
mkdir -p src/adapters/claude-code
mkdir -p src/hooks
mkdir -p bin
mkdir -p skills/{cfgm-new-problem,cfgm-switch,cfgm-process,cfgm-requeue}
mkdir -p fixtures/claude-code/v1
mkdir -p templates
mkdir -p tests/{helpers,smoke,core/{storage,events,ledger,normalizer,binder,security},adapters/claude-code,hooks,bin,e2e}
```

- [ ] **Step 6: Write smoke test**

Create `tests/smoke/setup.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

describe("project skeleton", () => {
  const requiredDirs = [
    "src/core/events",
    "src/core/storage",
    "src/core/ledger",
    "src/core/normalizer",
    "src/core/binder",
    "src/core/security",
    "src/core/clock",
    "src/adapters/claude-code",
    "src/hooks",
    "bin",
    "fixtures/claude-code/v1",
    "tests/helpers",
  ];

  for (const dir of requiredDirs) {
    test(`${dir}/ exists`, () => {
      expect(existsSync(join(ROOT, dir))).toBe(true);
    });
  }

  test("package.json has correct name", async () => {
    const pkg = await Bun.file(join(ROOT, "package.json")).json();
    expect(pkg.name).toBe("cfgm-os");
  });
});
```

- [ ] **Step 7: Install and run**

```bash
bun install && bun test tests/smoke/setup.test.ts && bun run typecheck
```

Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git init
git add package.json tsconfig.json bunfig.toml bun.lock tests/smoke/setup.test.ts src/ bin/ skills/ fixtures/ templates/ tests/
git commit -m "feat(E0-S1): initialize Bun project with directory skeleton"
```

---

## Task 2: E0-S2 — Storage 인터페이스

**Files:**
- Create: `src/core/storage/Storage.ts`
- Create: `src/core/storage/FsStorage.ts`
- Create: `src/core/storage/MemoryStorage.ts`
- Create: `tests/core/storage/storage.contract.test.ts`

- [ ] **Step 1: Write Storage interface**

Create `src/core/storage/Storage.ts`:

```typescript
export interface Storage {
  appendJsonl(path: string, record: unknown): Promise<void>;
  readJsonl<T = unknown>(path: string): Promise<T[]>;
  readJson<T = unknown>(path: string): Promise<T | null>;
  writeJsonAtomic(path: string, data: unknown): Promise<void>;
  listFiles(dir: string, pattern?: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;
  fileSize(path: string): Promise<number>;
}
```

- [ ] **Step 2: Write contract test**

Create `tests/core/storage/storage.contract.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FsStorage } from "../../../src/core/storage/FsStorage";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Storage } from "../../../src/core/storage/Storage";

function contractSuite(
  name: string,
  factory: () => Promise<{ storage: Storage; cleanup: () => Promise<void> }>
) {
  describe(`Storage contract: ${name}`, () => {
    let storage: Storage;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const ctx = await factory();
      storage = ctx.storage;
      cleanup = ctx.cleanup;
    });

    test("appendJsonl + readJsonl round-trip", async () => {
      await storage.appendJsonl("test.jsonl", { a: 1 });
      await storage.appendJsonl("test.jsonl", { b: 2 });
      const records = await storage.readJsonl("test.jsonl");
      expect(records).toEqual([{ a: 1 }, { b: 2 }]);
      await cleanup();
    });

    test("writeJsonAtomic + readJson round-trip", async () => {
      await storage.writeJsonAtomic("data.json", { key: "value" });
      const data = await storage.readJson("data.json");
      expect(data).toEqual({ key: "value" });
      await cleanup();
    });

    test("readJson returns null for missing file", async () => {
      const data = await storage.readJson("nonexistent.json");
      expect(data).toBeNull();
      await cleanup();
    });

    test("readJsonl returns empty array for missing file", async () => {
      const records = await storage.readJsonl("nonexistent.jsonl");
      expect(records).toEqual([]);
      await cleanup();
    });

    test("exists returns false/true correctly", async () => {
      expect(await storage.exists("nope.json")).toBe(false);
      await storage.writeJsonAtomic("yep.json", {});
      expect(await storage.exists("yep.json")).toBe(true);
      await cleanup();
    });

    test("ensureDir creates nested directories", async () => {
      await storage.ensureDir("a/b/c");
      await storage.writeJsonAtomic("a/b/c/file.json", { ok: true });
      const data = await storage.readJson("a/b/c/file.json");
      expect(data).toEqual({ ok: true });
      await cleanup();
    });

    test("listFiles returns matching files", async () => {
      await storage.writeJsonAtomic("dir/a.json", {});
      await storage.writeJsonAtomic("dir/b.jsonl", {});
      await storage.writeJsonAtomic("dir/c.json", {});
      const all = await storage.listFiles("dir");
      expect(all.sort()).toEqual(["a.json", "b.jsonl", "c.json"]);
      const jsonOnly = await storage.listFiles("dir", "*.json");
      expect(jsonOnly.sort()).toEqual(["a.json", "c.json"]);
      await cleanup();
    });

    test("listFiles returns empty for missing dir", async () => {
      expect(await storage.listFiles("nope")).toEqual([]);
      await cleanup();
    });

    test("fileSize returns byte count", async () => {
      await storage.writeJsonAtomic("sized.json", { hello: "world" });
      expect(await storage.fileSize("sized.json")).toBeGreaterThan(0);
      await cleanup();
    });

    test("fileSize returns 0 for missing file", async () => {
      expect(await storage.fileSize("missing.json")).toBe(0);
      await cleanup();
    });

    test("appendJsonl creates parent directories", async () => {
      await storage.appendJsonl("deep/nested/file.jsonl", { x: 1 });
      const records = await storage.readJsonl("deep/nested/file.jsonl");
      expect(records).toEqual([{ x: 1 }]);
      await cleanup();
    });

    test("writeJsonAtomic overwrites existing", async () => {
      await storage.writeJsonAtomic("over.json", { v: 1 });
      await storage.writeJsonAtomic("over.json", { v: 2 });
      expect(await storage.readJson("over.json")).toEqual({ v: 2 });
      await cleanup();
    });

    test("concurrent appendJsonl preserves all records", async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        storage.appendJsonl("concurrent.jsonl", { i })
      );
      await Promise.all(promises);
      const records = await storage.readJsonl<{ i: number }>("concurrent.jsonl");
      expect(records.length).toBe(50);
      const indices = records.map((r) => r.i).sort((a, b) => a - b);
      expect(indices).toEqual(Array.from({ length: 50 }, (_, i) => i));
      await cleanup();
    });
  });
}

contractSuite("MemoryStorage", async () => ({
  storage: new MemoryStorage(),
  cleanup: async () => {},
}));

contractSuite("FsStorage", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "cfgm-test-"));
  return {
    storage: new FsStorage(tmpDir),
    cleanup: () => rm(tmpDir, { recursive: true, force: true }),
  };
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun test tests/core/storage/storage.contract.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Implement MemoryStorage**

Create `src/core/storage/MemoryStorage.ts`:

```typescript
import type { Storage } from "./Storage";

export class MemoryStorage implements Storage {
  private files = new Map<string, string>();

  async appendJsonl(path: string, record: unknown): Promise<void> {
    const existing = this.files.get(path) ?? "";
    this.files.set(path, existing + JSON.stringify(record) + "\n");
  }

  async readJsonl<T = unknown>(path: string): Promise<T[]> {
    const content = this.files.get(path);
    if (!content) return [];
    return content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
  }

  async readJson<T = unknown>(path: string): Promise<T | null> {
    const content = this.files.get(path);
    if (content === undefined) return null;
    return JSON.parse(content) as T;
  }

  async writeJsonAtomic(path: string, data: unknown): Promise<void> {
    this.files.set(path, JSON.stringify(data, null, 2));
  }

  async listFiles(dir: string, pattern?: string): Promise<string[]> {
    const prefix = dir.endsWith("/") ? dir : dir + "/";
    const results: string[] = [];
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const relative = key.slice(prefix.length);
      if (relative.includes("/")) continue;
      if (pattern) {
        const ext = pattern.replace("*", "");
        if (!relative.endsWith(ext)) continue;
      }
      results.push(relative);
    }
    return results;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async ensureDir(_path: string): Promise<void> {}

  async fileSize(path: string): Promise<number> {
    const content = this.files.get(path);
    if (content === undefined) return 0;
    return new TextEncoder().encode(content).length;
  }
}
```

- [ ] **Step 5: Implement FsStorage**

Create `src/core/storage/FsStorage.ts`:

```typescript
import type { Storage } from "./Storage";
import {
  appendFile,
  readFile,
  writeFile,
  readdir,
  stat,
  mkdir,
  rename,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

export class FsStorage implements Storage {
  constructor(private readonly root: string) {}

  private resolve(path: string): string {
    return join(this.root, path);
  }

  async appendJsonl(path: string, record: unknown): Promise<void> {
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    await appendFile(full, JSON.stringify(record) + "\n", { flag: "a" });
  }

  async readJsonl<T = unknown>(path: string): Promise<T[]> {
    try {
      const content = await readFile(this.resolve(path), "utf-8");
      return content.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }

  async readJson<T = unknown>(path: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.resolve(path), "utf-8")) as T;
    } catch (e: any) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }

  async writeJsonAtomic(path: string, data: unknown): Promise<void> {
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    const tmp = full + ".tmp." + randomUUID().slice(0, 8);
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, full);
  }

  async listFiles(dir: string, pattern?: string): Promise<string[]> {
    try {
      const entries = await readdir(this.resolve(dir));
      if (!pattern) return entries;
      const ext = pattern.replace("*", "");
      return entries.filter((e) => e.endsWith(ext));
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(this.resolve(path));
  }

  async ensureDir(path: string): Promise<void> {
    await mkdir(this.resolve(path), { recursive: true });
  }

  async fileSize(path: string): Promise<number> {
    try {
      return (await stat(this.resolve(path))).size;
    } catch {
      return 0;
    }
  }
}
```

- [ ] **Step 6: Run tests**

```bash
bun test tests/core/storage/storage.contract.test.ts
```

Expected: All 24 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/storage/ tests/core/storage/
git commit -m "feat(E0-S2): Storage interface with FsStorage and MemoryStorage"
```

---

## Task 3: E0-S3 — CanonicalEvent 타입 & 유틸

**Files:**
- Create: `src/core/events/CanonicalEvent.ts`
- Create: `src/core/events/guards.ts`
- Create: `src/core/clock/Clock.ts`
- Create: `tests/core/events/guards.test.ts`

- [ ] **Step 1: Write CanonicalEvent types**

Create `src/core/events/CanonicalEvent.ts`:

```typescript
export type Stage =
  | "session-start" | "prompt-submit" | "tool-pre" | "tool-post"
  | "compact-pre" | "session-end" | "stop";

export type SessionStartPayload = { stage: "session-start" };
export type PromptSubmitPayload = { stage: "prompt-submit"; message: string };
export type ToolPrePayload = { stage: "tool-pre"; toolName: string; toolInput: unknown; correlationId: string };
export type ToolPostPayload = { stage: "tool-post"; toolName: string; toolInput: unknown; toolOutput: unknown; correlationId: string };
export type CompactPrePayload = { stage: "compact-pre"; turnCount: number };
export type SessionEndPayload = { stage: "session-end" };
export type StopPayload = { stage: "stop" };

export type StagePayload =
  | SessionStartPayload | PromptSubmitPayload | ToolPrePayload | ToolPostPayload
  | CompactPrePayload | SessionEndPayload | StopPayload;

export type CanonicalEvent = {
  platform: string;
  stage: Stage;
  sessionId: string;
  cwd: string;
  timestampIso: string;
  payload: StagePayload;
  raw: unknown;
  adapterVersion: string;
};
```

- [ ] **Step 2: Write Clock interface**

Create `src/core/clock/Clock.ts`:

```typescript
export interface Clock {
  now(): Date;
  isoNow(): string;
}

export class RealClock implements Clock {
  now(): Date { return new Date(); }
  isoNow(): string { return new Date().toISOString(); }
}

export class FakeClock implements Clock {
  constructor(private current: Date = new Date("2026-04-17T10:00:00+09:00")) {}
  now(): Date { return new Date(this.current); }
  isoNow(): string { return this.current.toISOString(); }
  advance(ms: number): void { this.current = new Date(this.current.getTime() + ms); }
  set(date: Date | string): void { this.current = typeof date === "string" ? new Date(date) : date; }
}
```

- [ ] **Step 3: Write type guards**

Create `src/core/events/guards.ts`:

```typescript
import type { CanonicalEvent, Stage, ToolPrePayload, ToolPostPayload, PromptSubmitPayload, CompactPrePayload } from "./CanonicalEvent";

const VALID_STAGES: Stage[] = ["session-start", "prompt-submit", "tool-pre", "tool-post", "compact-pre", "session-end", "stop"];

export function isValidStage(s: unknown): s is Stage {
  return typeof s === "string" && VALID_STAGES.includes(s as Stage);
}

export function isCanonicalEvent(obj: unknown): obj is CanonicalEvent {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.platform === "string" && isValidStage(o.stage) && typeof o.sessionId === "string"
    && typeof o.cwd === "string" && typeof o.timestampIso === "string"
    && typeof o.payload === "object" && o.payload !== null && typeof o.adapterVersion === "string";
}

export function isToolPre(e: CanonicalEvent): e is CanonicalEvent & { payload: ToolPrePayload } { return e.stage === "tool-pre"; }
export function isToolPost(e: CanonicalEvent): e is CanonicalEvent & { payload: ToolPostPayload } { return e.stage === "tool-post"; }
export function isPromptSubmit(e: CanonicalEvent): e is CanonicalEvent & { payload: PromptSubmitPayload } { return e.stage === "prompt-submit"; }
export function isCompactPre(e: CanonicalEvent): e is CanonicalEvent & { payload: CompactPrePayload } { return e.stage === "compact-pre"; }
```

- [ ] **Step 4: Write guards test**

Create `tests/core/events/guards.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { isValidStage, isCanonicalEvent, isToolPre, isToolPost, isPromptSubmit } from "../../../src/core/events/guards";
import type { CanonicalEvent } from "../../../src/core/events/CanonicalEvent";

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-start", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T10:00:00.000Z",
    payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
    ...overrides,
  };
}

describe("isValidStage", () => {
  test("accepts all 7 stages", () => {
    for (const s of ["session-start","prompt-submit","tool-pre","tool-post","compact-pre","session-end","stop"])
      expect(isValidStage(s)).toBe(true);
  });
  test("rejects invalid", () => { expect(isValidStage("bogus")).toBe(false); expect(isValidStage(42)).toBe(false); });
});

describe("isCanonicalEvent", () => {
  test("accepts valid event", () => { expect(isCanonicalEvent(makeEvent())).toBe(true); });
  test("rejects null", () => { expect(isCanonicalEvent(null)).toBe(false); });
  test("rejects missing fields", () => { const { platform, ...rest } = makeEvent(); expect(isCanonicalEvent(rest)).toBe(false); });
});

describe("stage guards", () => {
  test("isToolPre", () => {
    const pre = makeEvent({ stage: "tool-pre", payload: { stage: "tool-pre", toolName: "Edit", toolInput: {}, correlationId: "c1" } });
    expect(isToolPre(pre)).toBe(true);
    expect(isToolPre(makeEvent())).toBe(false);
  });
  test("isToolPost", () => {
    const post = makeEvent({ stage: "tool-post", payload: { stage: "tool-post", toolName: "Edit", toolInput: {}, toolOutput: {}, correlationId: "c1" } });
    expect(isToolPost(post)).toBe(true);
  });
  test("isPromptSubmit", () => {
    const ps = makeEvent({ stage: "prompt-submit", payload: { stage: "prompt-submit", message: "hi" } });
    expect(isPromptSubmit(ps)).toBe(true);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/core/events/guards.test.ts
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/events/ src/core/clock/ tests/core/events/
git commit -m "feat(E0-S3): CanonicalEvent types, guards, and Clock interface"
```

---

## Task 4: E0-S4 — Claude Code 어댑터 매퍼

**Files:**
- Create: `src/adapters/claude-code/mapper.ts`
- Create: `src/adapters/claude-code/hook-runner.ts`
- Create: `src/adapters/claude-code/VERSION`
- Create: 10 fixture JSON files in `fixtures/claude-code/v1/`
- Create: `tests/adapters/claude-code/mapper.test.ts`

- [ ] **Step 1: Create all 10 fixture files**

`fixtures/claude-code/v1/session-start.json`:
```json
{ "type": "SessionStart", "session_id": "sess-abc-123", "cwd": "/Users/treestar/dev/my-project" }
```

`fixtures/claude-code/v1/prompt-submit.json`:
```json
{ "type": "UserPromptSubmit", "session_id": "sess-abc-123", "cwd": "/Users/treestar/dev/my-project", "message": "Fix the authentication bug in user.ts" }
```

`fixtures/claude-code/v1/pre-tool-edit.json`:
```json
{ "type": "PreToolUse", "session_id": "sess-abc-123", "cwd": "/Users/treestar/dev/my-project", "tool_name": "Edit", "tool_input": { "file_path": "/project/src/api/user.ts", "old_string": "if (token.expired)", "new_string": "if (token.expired || !token.valid)" } }
```

`fixtures/claude-code/v1/pre-tool-bash.json`:
```json
{ "type": "PreToolUse", "session_id": "sess-abc-123", "cwd": "/Users/treestar/dev/my-project", "tool_name": "Bash", "tool_input": { "command": "bun test src/api/user.test.ts" } }
```

`fixtures/claude-code/v1/pre-tool-read.json`:
```json
{ "type": "PreToolUse", "session_id": "sess-abc-123", "cwd": "/Users/treestar/dev/my-project", "tool_name": "Read", "tool_input": { "file_path": "/project/src/api/user.ts" } }
```

`fixtures/claude-code/v1/post-tool-edit.json`:
```json
{ "type": "PostToolUse", "session_id": "sess-abc-123", "cwd": "/Users/treestar/dev/my-project", "tool_name": "Edit", "tool_input": { "file_path": "/project/src/api/user.ts" }, "tool_output": "File edited successfully" }
```

`fixtures/claude-code/v1/post-tool-bash.json`:
```json
{ "type": "PostToolUse", "session_id": "sess-abc-123", "cwd": "/Users/treestar/dev/my-project", "tool_name": "Bash", "tool_input": { "command": "bun test" }, "tool_output": "3 tests passed" }
```

`fixtures/claude-code/v1/post-tool-read.json`:
```json
{ "type": "PostToolUse", "session_id": "sess-abc-123", "cwd": "/Users/treestar/dev/my-project", "tool_name": "Read", "tool_input": { "file_path": "/project/src/api/user.ts" }, "tool_output": "export function validateToken() {}" }
```

`fixtures/claude-code/v1/pre-compact.json`:
```json
{ "type": "PreCompact", "session_id": "sess-abc-123", "cwd": "/Users/treestar/dev/my-project", "turn_count": 42 }
```

`fixtures/claude-code/v1/session-end.json`:
```json
{ "type": "SessionEnd", "session_id": "sess-abc-123", "cwd": "/Users/treestar/dev/my-project" }
```

`src/adapters/claude-code/VERSION`:
```
1.0.0
```

- [ ] **Step 2: Write mapper test**

Create `tests/adapters/claude-code/mapper.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { mapClaudeCodeEvent } from "../../../src/adapters/claude-code/mapper";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "../../../fixtures/claude-code/v1");
const load = (name: string) => JSON.parse(readFileSync(join(DIR, name), "utf-8"));

describe("mapClaudeCodeEvent", () => {
  test("maps SessionStart", () => {
    const e = mapClaudeCodeEvent(load("session-start.json"), "2026-04-17T10:00:00Z");
    expect(e.platform).toBe("claude-code");
    expect(e.stage).toBe("session-start");
    expect(e.sessionId).toBe("sess-abc-123");
  });

  test("maps PromptSubmit", () => {
    const e = mapClaudeCodeEvent(load("prompt-submit.json"), "2026-04-17T10:01:00Z");
    expect(e.stage).toBe("prompt-submit");
    if (e.payload.stage === "prompt-submit") expect(e.payload.message).toContain("authentication");
  });

  test("maps PreToolUse with correlationId", () => {
    const e = mapClaudeCodeEvent(load("pre-tool-edit.json"), "2026-04-17T10:02:00Z");
    expect(e.stage).toBe("tool-pre");
    if (e.payload.stage === "tool-pre") {
      expect(e.payload.toolName).toBe("Edit");
      expect(e.payload.correlationId).toMatch(/^corr-/);
    }
  });

  test("maps PostToolUse", () => {
    const e = mapClaudeCodeEvent(load("post-tool-edit.json"), "2026-04-17T10:03:00Z");
    expect(e.stage).toBe("tool-post");
    if (e.payload.stage === "tool-post") expect(e.payload.toolOutput).toBe("File edited successfully");
  });

  test("maps PreCompact", () => {
    const e = mapClaudeCodeEvent(load("pre-compact.json"), "2026-04-17T10:04:00Z");
    if (e.payload.stage === "compact-pre") expect(e.payload.turnCount).toBe(42);
  });

  test("all 10 fixtures produce valid events", () => {
    const files = readdirSync(DIR).filter(f => f.endsWith(".json"));
    expect(files.length).toBe(10);
    for (const f of files) {
      const e = mapClaudeCodeEvent(load(f), "2026-04-17T10:00:00Z");
      expect(typeof e.sessionId).toBe("string");
    }
  });

  test("throws on unknown type", () => {
    expect(() => mapClaudeCodeEvent({ type: "Unknown" }, "now")).toThrow();
  });
});
```

- [ ] **Step 3: Implement mapper**

Create `src/adapters/claude-code/mapper.ts`:

```typescript
import type { CanonicalEvent, StagePayload, Stage } from "../../core/events/CanonicalEvent";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const VERSION_PATH = join(import.meta.dir, "VERSION");
let adapterVersion: string;
try { adapterVersion = "claude-code@" + readFileSync(VERSION_PATH, "utf-8").trim(); }
catch { adapterVersion = "claude-code@unknown"; }

type Raw = Record<string, unknown>;
const STAGE_MAP: Record<string, Stage> = {
  SessionStart: "session-start", UserPromptSubmit: "prompt-submit",
  PreToolUse: "tool-pre", PostToolUse: "tool-post",
  PreCompact: "compact-pre", SessionEnd: "session-end", Stop: "stop",
};

function payload(type: string, r: Raw): StagePayload {
  const corrId = () => "corr-" + randomUUID().slice(0, 12);
  switch (type) {
    case "SessionStart": return { stage: "session-start" };
    case "UserPromptSubmit": return { stage: "prompt-submit", message: String(r.message ?? "") };
    case "PreToolUse": return { stage: "tool-pre", toolName: String(r.tool_name ?? ""), toolInput: r.tool_input, correlationId: corrId() };
    case "PostToolUse": return { stage: "tool-post", toolName: String(r.tool_name ?? ""), toolInput: r.tool_input, toolOutput: r.tool_output, correlationId: corrId() };
    case "PreCompact": return { stage: "compact-pre", turnCount: Number(r.turn_count ?? 0) };
    case "SessionEnd": return { stage: "session-end" };
    case "Stop": return { stage: "stop" };
    default: throw new Error(`Unknown hook type: ${type}`);
  }
}

export function mapClaudeCodeEvent(rawInput: unknown, timestampIso: string): CanonicalEvent {
  const r = rawInput as Raw;
  const type = String(r.type ?? "");
  const stage = STAGE_MAP[type];
  if (!stage) throw new Error(`Unknown hook type: ${type}`);
  return { platform: "claude-code", stage, sessionId: String(r.session_id ?? ""), cwd: String(r.cwd ?? ""), timestampIso, payload: payload(type, r), raw: rawInput, adapterVersion };
}
```

- [ ] **Step 4: Implement hook-runner**

Create `src/adapters/claude-code/hook-runner.ts`:

```typescript
import { mapClaudeCodeEvent } from "./mapper";
import type { CanonicalEvent } from "../../core/events/CanonicalEvent";

export async function readStdinJson(): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf-8").trim();
  if (!text) return null;
  return JSON.parse(text);
}

export async function runHook(handler: (event: CanonicalEvent) => Promise<string | null>): Promise<void> {
  try {
    const raw = await readStdinJson();
    if (!raw) return;
    const event = mapClaudeCodeEvent(raw, new Date().toISOString());
    const output = await handler(event);
    if (output) process.stdout.write(output);
  } catch (e) {
    try {
      const { appendFileSync, mkdirSync } = await import("node:fs");
      const home = process.env.CFGM_HOME || `${process.env.HOME}/.memory-brain`;
      mkdirSync(`${home}/security`, { recursive: true });
      appendFileSync(`${home}/security/hook-errors.jsonl`, JSON.stringify({ error: String(e), ts: new Date().toISOString() }) + "\n");
    } catch {}
  }
}
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/adapters/claude-code/mapper.test.ts
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/claude-code/ fixtures/ tests/adapters/
git commit -m "feat(E0-S4): Claude Code adapter mapper with 10 fixtures"
```

---

## Task 5: E0-S5 — 설치/제거 스크립트

**Files:**
- Create: `bin/install.ts`
- Create: `bin/uninstall.ts`
- Create: `tests/bin/install.test.ts`

- [ ] **Step 1: Write install test**

Create `tests/bin/install.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const MARKER = "cfgm-os";

async function readSettings(home: string) {
  const p = join(home, ".claude", "settings.json");
  try { return JSON.parse(await readFile(p, "utf-8")); }
  catch { return null; }
}

describe("install.ts", () => {
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), "cfgm-install-"));
    await mkdir(join(fakeHome, ".claude"), { recursive: true });
  });

  afterEach(async () => {
    await rm(fakeHome, { recursive: true, force: true });
  });

  test("creates settings.json with hooks when none exists", async () => {
    const proc = Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/install.ts")],
      env: { ...process.env, HOME: fakeHome, CFGM_PROJECT: fakeHome },
    });
    expect(proc.exitCode).toBe(0);
    const settings = await readSettings(fakeHome);
    expect(settings).not.toBeNull();
    expect(settings.hooks).toBeDefined();
    const hookStr = JSON.stringify(settings.hooks);
    expect(hookStr).toContain(MARKER);
  });

  test("preserves existing hooks on install", async () => {
    const existing = {
      hooks: {
        PreToolUse: [{ matcher: "custom", hooks: ["echo custom"] }],
      },
    };
    await writeFile(
      join(fakeHome, ".claude", "settings.json"),
      JSON.stringify(existing, null, 2)
    );
    Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/install.ts")],
      env: { ...process.env, HOME: fakeHome, CFGM_PROJECT: fakeHome },
    });
    const settings = await readSettings(fakeHome);
    const pre = settings.hooks.PreToolUse;
    expect(pre.some((h: any) => h.matcher === "custom")).toBe(true);
    expect(pre.some((h: any) => JSON.stringify(h).includes(MARKER))).toBe(true);
  });

  test("idempotent — double install no duplicates", async () => {
    const run = () =>
      Bun.spawnSync({
        cmd: ["bun", "run", join(import.meta.dir, "../../bin/install.ts")],
        env: { ...process.env, HOME: fakeHome, CFGM_PROJECT: fakeHome },
      });
    run();
    run();
    const settings = await readSettings(fakeHome);
    const hookStr = JSON.stringify(settings.hooks);
    const count = (hookStr.match(new RegExp(MARKER, "g")) || []).length;
    expect(count).toBeLessThanOrEqual(5);
  });

  test("uninstall removes only cfgm-os hooks", async () => {
    const existing = {
      hooks: {
        PreToolUse: [{ matcher: "custom", hooks: ["echo custom"] }],
      },
    };
    await writeFile(
      join(fakeHome, ".claude", "settings.json"),
      JSON.stringify(existing, null, 2)
    );
    Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/install.ts")],
      env: { ...process.env, HOME: fakeHome, CFGM_PROJECT: fakeHome },
    });
    Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/uninstall.ts")],
      env: { ...process.env, HOME: fakeHome },
    });
    const settings = await readSettings(fakeHome);
    expect(JSON.stringify(settings.hooks)).not.toContain(MARKER);
    expect(settings.hooks.PreToolUse.some((h: any) => h.matcher === "custom")).toBe(true);
  });

  test("uninstall on clean state is safe", async () => {
    const proc = Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/uninstall.ts")],
      env: { ...process.env, HOME: fakeHome },
    });
    expect(proc.exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/bin/install.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement install.ts**

Create `bin/install.ts`:

```typescript
import { readFile, writeFile, mkdir, symlink, readlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

const MARKER = "cfgm-os";
const HOME = process.env.HOME!;
const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const SETTINGS_PATH = join(HOME, ".claude", "settings.json");
const HOOKS_DIR = resolve(PROJECT, "src/hooks");
const SKILL_LINK = join(HOME, ".claude", "skills", "CFGM-OS");

type HookEntry = { matcher: string; hooks: string[] };
type HookType = "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "Stop";

function buildHookEntries(): Record<HookType, HookEntry> {
  const entry = (type: string): HookEntry => ({
    matcher: MARKER,
    hooks: [`bun run ${HOOKS_DIR}/${kebab(type)}.ts`],
  });
  return {
    SessionStart: entry("SessionStart"),
    UserPromptSubmit: entry("UserPromptSubmit"),
    PreToolUse: entry("PreToolUse"),
    PostToolUse: entry("PostToolUse"),
    Stop: entry("Stop"),
  };
}

function kebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

async function loadSettings(): Promise<Record<string, any>> {
  try {
    return JSON.parse(await readFile(SETTINGS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function main() {
  await mkdir(join(HOME, ".claude"), { recursive: true });

  const settings = await loadSettings();
  if (!settings.hooks) settings.hooks = {};

  const entries = buildHookEntries();
  for (const [type, entry] of Object.entries(entries)) {
    if (!settings.hooks[type]) settings.hooks[type] = [];
    const arr: HookEntry[] = settings.hooks[type];
    const idx = arr.findIndex((h) => h.matcher === MARKER);
    if (idx >= 0) {
      arr[idx] = entry;
    } else {
      arr.push(entry);
    }
  }

  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));

  await mkdir(join(HOME, ".claude", "skills"), { recursive: true });
  const skillSrc = resolve(PROJECT, "skills");
  if (existsSync(skillSrc) && !existsSync(SKILL_LINK)) {
    try { await symlink(skillSrc, SKILL_LINK); } catch {}
  }

  await mkdir(join(HOME, ".memory-brain"), { recursive: true });
  await mkdir(join(PROJECT, ".memory-brain", "state"), { recursive: true });
  await mkdir(join(PROJECT, ".memory-brain", "ledger", "raw"), { recursive: true });

  console.log(`[cfgm-os] installed. hooks → ${HOOKS_DIR}`);
}

main().catch((e) => { console.error("[cfgm-os] install failed:", e.message); process.exit(1); });
```

- [ ] **Step 4: Implement uninstall.ts**

Create `bin/uninstall.ts`:

```typescript
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const MARKER = "cfgm-os";
const HOME = process.env.HOME!;
const SETTINGS_PATH = join(HOME, ".claude", "settings.json");
const SKILL_LINK = join(HOME, ".claude", "skills", "CFGM-OS");

async function main() {
  if (!existsSync(SETTINGS_PATH)) {
    console.log("[cfgm-os] nothing to uninstall.");
    return;
  }

  const settings = JSON.parse(await readFile(SETTINGS_PATH, "utf-8"));
  if (settings.hooks) {
    for (const type of Object.keys(settings.hooks)) {
      settings.hooks[type] = settings.hooks[type].filter(
        (h: any) => h.matcher !== MARKER
      );
      if (settings.hooks[type].length === 0) delete settings.hooks[type];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }

  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));

  if (existsSync(SKILL_LINK)) {
    try { await unlink(SKILL_LINK); } catch {}
  }

  console.log("[cfgm-os] uninstalled.");
}

main().catch((e) => { console.error("[cfgm-os] uninstall failed:", e.message); process.exit(1); });
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/bin/install.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add bin/install.ts bin/uninstall.ts tests/bin/install.test.ts
git commit -m "feat(E0-S5): install/uninstall scripts with idempotent settings merge"
```

---

## Task 6: E0-S6 — 테스트 하니스 & fixture 로더

**Files:**
- Create: `tests/helpers/fixture.ts`
- Create: `tests/helpers/tmpenv.ts`

- [ ] **Step 1: Write fixture loader**

Create `tests/helpers/fixture.ts`:

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_ROOT = join(import.meta.dir, "../../fixtures");

export function loadFixture<T = unknown>(platform: string, version: string, name: string): T {
  const path = join(FIXTURE_ROOT, platform, version, `${name}.json`);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function claudeCodeFixture<T = unknown>(name: string): T {
  return loadFixture<T>("claude-code", "v1", name);
}
```

- [ ] **Step 2: Write tmpenv helper**

Create `tests/helpers/tmpenv.ts`:

```typescript
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FsStorage } from "../../src/core/storage/FsStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import type { Storage } from "../../src/core/storage/Storage";

export type TestEnv = {
  storage: Storage;
  clock: FakeClock;
  cfgmHome: string;
  projectHome: string;
  cleanup: () => Promise<void>;
};

export async function createTmpEnv(opts?: { useFs?: boolean }): Promise<TestEnv> {
  const tmpRoot = await mkdtemp(join(tmpdir(), "cfgm-env-"));
  const cfgmHome = join(tmpRoot, ".memory-brain");
  const projectHome = join(tmpRoot, "project", ".memory-brain");

  await mkdir(cfgmHome, { recursive: true });
  await mkdir(projectHome, { recursive: true });

  const storage = opts?.useFs
    ? new FsStorage(projectHome)
    : new MemoryStorage();

  return {
    storage,
    clock: new FakeClock(),
    cfgmHome,
    projectHome,
    cleanup: () => rm(tmpRoot, { recursive: true, force: true }),
  };
}
```

- [ ] **Step 3: Verify imports work**

```bash
bun run --bun -e "import { claudeCodeFixture } from './tests/helpers/fixture'; console.log(typeof claudeCodeFixture)"
```

Expected: `function`

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/
git commit -m "feat(E0-S6): test harness with fixture loader and tmpenv helper"
```

---

## Task 7: E0-S7 — `.gitignore` & README

**Files:**
- Create: `.gitignore`
- Create: `templates/project-gitignore.txt`
- Create: `README.md`

- [ ] **Step 1: Create .gitignore**

Create `.gitignore`:

```gitignore
node_modules/
dist/
*.tsbuildinfo
.memory-brain/
.DS_Store
```

- [ ] **Step 2: Create project gitignore template**

Create `templates/project-gitignore.txt`:

```gitignore
# memory-brain: default is all local. Uncomment to share.
.memory-brain/ledger/raw/
.memory-brain/ledger/curated/
.memory-brain/ledger/pending-analysis.jsonl
.memory-brain/ledger/expired-analysis.jsonl
.memory-brain/state/
.memory-brain/security/

# Team sharing (opt-in)
# !.memory-brain/problems/*/problem.yaml
# !.memory-brain/problems/*/ontology.module.yaml
# !.memory-brain/ontologies/modules/
```

- [ ] **Step 3: Create README.md**

Create `README.md`:

```markdown
# CFGM-OS (Causal Flow Gap Memory Operating System)

Hook-based self-forming ontology memory system for Claude Code.

## Quick Start

```bash
bun install
bun run bin/install.ts
```

## Uninstall

```bash
bun run bin/uninstall.ts
```

## Test

```bash
bun test
```

## Architecture

3-layer: Platform Adapter → Core → Storage

- **Adapters** (`src/adapters/`): Platform-specific JSON → CanonicalEvent
- **Core** (`src/core/`): Platform-free pure functions
- **Storage** (`src/core/storage/`): Injectable interface (Fs / Memory)

## Storage Paths

- User-level: `~/.memory-brain/`
- Project-level: `$PROJECT/.memory-brain/`
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore templates/project-gitignore.txt README.md
git commit -m "feat(E0-S7): .gitignore, project template, and README"
```
