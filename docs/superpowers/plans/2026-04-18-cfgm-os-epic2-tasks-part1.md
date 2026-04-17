# Epic 2 Tasks Part 1 — 코어 구조 & 번들링 (E2-S1 ~ E2-S6)

> 각 스토리는 TDD 엄격 적용. 실패 테스트 → 최소 구현 → 그린 → 커밋.

---

## Task E2-S1: Flow 타입 · 가드 · 설정

**Files:**
- Create: `src/core/flow/types.ts`
- Create: `src/core/flow/guards.ts`
- Create: `src/core/flow/config.ts`
- Test: `tests/core/flow/types.test.ts`

- [ ] **Step 1: 타입 정의**

Write `src/core/flow/types.ts`:
```typescript
export const FLOW_BLOCK_TYPES = [
  "Problem", "State", "Trigger", "Context", "Constraint",
  "Cause", "Hypothesis", "Action", "Evidence", "Outcome",
  "Rule", "Gap", "Question",
] as const;
export type FlowBlockType = typeof FLOW_BLOCK_TYPES[number];

export const RELATION_KINDS = [
  "causes", "evidencedBy", "mitigatedBy",
  "validatedBy", "followsFrom",
] as const;
export type RelationKind = typeof RELATION_KINDS[number];

export type Relation = {
  kind: RelationKind;
  targetBlockId: string;
  confidence: number;
};

export type FlowBlock = {
  blockId: string;
  problemId: string;
  type: FlowBlockType;
  status: "confirmed" | "superseded";
  label: string;
  confidence: number;
  supportedBy: string[];
  relations: Relation[];
  createdAt: string;
  lastConfirmedAt: string | null;
  staleAfter: string | null;
  supersededBy: string | null;
  bundleId: string;
};

export type FlowDelta =
  | { op: "block-add"; timestampIso: string; block: FlowBlock }
  | { op: "block-supersede"; timestampIso: string; problemId: string; blockId: string; supersededBy: string; reason: string }
  | { op: "relation-add"; timestampIso: string; problemId: string; fromBlockId: string; relation: Relation }
  | { op: "cue-card-regen"; timestampIso: string; problemId: string; bodyHash: string; bodyBytes: number };

export type BundleMetrics = {
  toolCallCounts: Record<string, number>;
  touchedFiles: string[];
  bashExit: { success: number; failure: number };
  promptCount: number;
};

export type ObservationBundle = {
  bundleId: string;
  activeProblemId: string | null;
  sessionId: string;
  turnOrdinal: number;
  openedAt: string;
  sealedAt: string;
  eventIds: string[];
  observations: Array<Record<string, unknown>>;
  metrics: BundleMetrics;
  recentBlockIds: string[];
  processedAt: string | null;
  processedByVersion: string | null;
};

export type FlowGraph = {
  problemId: string;
  blocks: FlowBlock[];
  cueCardMeta: {
    lastSyntheticAt: string | null;
    bodyHash: string | null;
    bodyBytes: number;
    stale: boolean;
  };
};
```

- [ ] **Step 2: 설정 상수**

Write `src/core/flow/config.ts`:
```typescript
export const FLOW_CONFIG = {
  MAX_EVENTS_PER_BUNDLE: 50,
  MAX_RECENT_BLOCKS_CTX: 10,
  PENDING_WARN_THRESHOLD: 3,
  BUNDLE_TTL_DAYS: 7,
  DELTA_LOG_ROTATE_MB: 10,
  DELTA_STALE_COUNT: 100,
  CUE_CARD_SOFT_KB: 4,
  CUE_CARD_HARD_KB: 6,
  STDOUT_INJECT_BUDGET_KB: 1.5,
  FALLBACK_CARD_BUDGET_KB: 1,
} as const;
```

- [ ] **Step 3: Write failing test**

Write `tests/core/flow/types.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import {
  isFlowBlock, isFlowDelta, isObservationBundle,
  isRelation, isFlowBlockType, isRelationKind,
} from "../../../src/core/flow/guards";

describe("Flow type guards", () => {
  test("isFlowBlockType accepts all 13 types", () => {
    ["Problem","State","Trigger","Context","Constraint","Cause","Hypothesis",
     "Action","Evidence","Outcome","Rule","Gap","Question"].forEach(t => {
      expect(isFlowBlockType(t)).toBe(true);
    });
    expect(isFlowBlockType("Unknown")).toBe(false);
  });

  test("isRelationKind accepts 5 kinds", () => {
    ["causes","evidencedBy","mitigatedBy","validatedBy","followsFrom"].forEach(k => {
      expect(isRelationKind(k)).toBe(true);
    });
    expect(isRelationKind("unknown")).toBe(false);
  });

  test("isRelation requires kind+target+confidence", () => {
    expect(isRelation({ kind: "causes", targetBlockId: "blk_x", confidence: 0.8 })).toBe(true);
    expect(isRelation({ kind: "causes", targetBlockId: "blk_x" })).toBe(false);
    expect(isRelation({ kind: "bad", targetBlockId: "blk_x", confidence: 0.8 })).toBe(false);
  });

  test("isFlowBlock requires all fields", () => {
    const block = {
      blockId: "blk_cause_abcd1234", problemId: "problem-x", type: "Cause",
      status: "confirmed", label: "test", confidence: 0.8,
      supportedBy: ["obs_1"], relations: [], createdAt: "2026-04-18T00:00:00Z",
      lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd_x",
    };
    expect(isFlowBlock(block)).toBe(true);
    expect(isFlowBlock({ ...block, type: "NotAType" })).toBe(false);
    expect(isFlowBlock({ ...block, confidence: 1.5 })).toBe(false);
  });

  test("isFlowDelta accepts 4 ops", () => {
    expect(isFlowDelta({ op: "block-add", timestampIso: "2026-04-18T00:00:00Z",
      block: { blockId: "b", problemId: "p", type: "Cause", status: "confirmed",
        label: "x", confidence: 0.5, supportedBy: [], relations: [],
        createdAt: "2026-04-18T00:00:00Z", lastConfirmedAt: null,
        staleAfter: null, supersededBy: null, bundleId: "bnd" } })).toBe(true);
    expect(isFlowDelta({ op: "block-supersede", timestampIso: "x",
      problemId: "p1", blockId: "b1", supersededBy: "b2", reason: "r" })).toBe(true);
    expect(isFlowDelta({ op: "relation-add", timestampIso: "x",
      problemId: "p1", fromBlockId: "b1", relation: { kind: "causes", targetBlockId: "b2", confidence: 0.5 } })).toBe(true);
    expect(isFlowDelta({ op: "cue-card-regen", timestampIso: "x",
      problemId: "p", bodyHash: "abc", bodyBytes: 100 })).toBe(true);
    expect(isFlowDelta({ op: "unknown" })).toBe(false);
  });

  test("isObservationBundle requires all fields", () => {
    const b = {
      bundleId: "bnd_s_1", activeProblemId: "p", sessionId: "s",
      turnOrdinal: 1, openedAt: "2026-04-18T00:00:00Z",
      sealedAt: "2026-04-18T00:00:01Z", eventIds: ["e1"], observations: [],
      metrics: { toolCallCounts: {}, touchedFiles: [], bashExit: { success: 0, failure: 0 }, promptCount: 0 },
      recentBlockIds: [], processedAt: null, processedByVersion: null,
    };
    expect(isObservationBundle(b)).toBe(true);
    expect(isObservationBundle({ ...b, turnOrdinal: "1" })).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify FAIL**

Run: `bun test tests/core/flow/types.test.ts`
Expected: FAIL (guards not found)

- [ ] **Step 5: 타입 가드 구현**

Write `src/core/flow/guards.ts`:
```typescript
import {
  FLOW_BLOCK_TYPES, RELATION_KINDS,
  type FlowBlock, type FlowDelta, type ObservationBundle, type Relation,
} from "./types";

export function isFlowBlockType(v: unknown): v is typeof FLOW_BLOCK_TYPES[number] {
  return typeof v === "string" && (FLOW_BLOCK_TYPES as readonly string[]).includes(v);
}

export function isRelationKind(v: unknown): v is typeof RELATION_KINDS[number] {
  return typeof v === "string" && (RELATION_KINDS as readonly string[]).includes(v);
}

export function isRelation(v: unknown): v is Relation {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return isRelationKind(r.kind) && typeof r.targetBlockId === "string"
    && typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1;
}

export function isFlowBlock(v: unknown): v is FlowBlock {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return typeof b.blockId === "string"
    && typeof b.problemId === "string"
    && isFlowBlockType(b.type)
    && (b.status === "confirmed" || b.status === "superseded")
    && typeof b.label === "string"
    && typeof b.confidence === "number" && b.confidence >= 0 && b.confidence <= 1
    && Array.isArray(b.supportedBy) && b.supportedBy.every(s => typeof s === "string")
    && Array.isArray(b.relations) && b.relations.every(isRelation)
    && typeof b.createdAt === "string"
    && (b.lastConfirmedAt === null || typeof b.lastConfirmedAt === "string")
    && (b.staleAfter === null || typeof b.staleAfter === "string")
    && (b.supersededBy === null || typeof b.supersededBy === "string")
    && typeof b.bundleId === "string";
}

export function isFlowDelta(v: unknown): v is FlowDelta {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  if (typeof d.timestampIso !== "string") return false;
  switch (d.op) {
    case "block-add": return isFlowBlock(d.block);
    case "block-supersede":
      return typeof d.problemId === "string"
        && typeof d.blockId === "string"
        && typeof d.supersededBy === "string"
        && typeof d.reason === "string";
    case "relation-add":
      return typeof d.problemId === "string"
        && typeof d.fromBlockId === "string"
        && isRelation(d.relation);
    case "cue-card-regen":
      return typeof d.problemId === "string"
        && typeof d.bodyHash === "string"
        && typeof d.bodyBytes === "number";
    default: return false;
  }
}

export function isObservationBundle(v: unknown): v is ObservationBundle {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return typeof b.bundleId === "string"
    && (b.activeProblemId === null || typeof b.activeProblemId === "string")
    && typeof b.sessionId === "string"
    && typeof b.turnOrdinal === "number"
    && typeof b.openedAt === "string"
    && typeof b.sealedAt === "string"
    && Array.isArray(b.eventIds)
    && Array.isArray(b.observations)
    && typeof b.metrics === "object" && b.metrics !== null
    && Array.isArray(b.recentBlockIds)
    && (b.processedAt === null || typeof b.processedAt === "string")
    && (b.processedByVersion === null || typeof b.processedByVersion === "string");
}
```

- [ ] **Step 6: Run test to verify PASS**

Run: `bun test tests/core/flow/types.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Typecheck**

Run: `bun run typecheck`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/core/flow/ tests/core/flow/types.test.ts
git commit -m "feat(E2-S1): Flow block, delta, bundle types with guards and config"
```

---

## Task E2-S2: FlowGraphStore

**Files:**
- Create: `src/core/flow/FlowGraphStore.ts`
- Test: `tests/core/flow/graph-store.test.ts`

- [ ] **Step 1: Write failing test**

Write `tests/core/flow/graph-store.test.ts`:
```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { FlowGraphStore } from "../../../src/core/flow/FlowGraphStore";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { FlowDelta, FlowGraph } from "../../../src/core/flow/types";

describe("FlowGraphStore", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let store: FlowGraphStore;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    store = new FlowGraphStore(storage, clock);
  });

  test("appendDelta writes to problem's delta log", async () => {
    const d: FlowDelta = {
      op: "block-add", timestampIso: clock.isoNow(),
      block: { blockId: "b1", problemId: "p1", type: "Cause", status: "confirmed",
        label: "x", confidence: 0.7, supportedBy: [], relations: [],
        createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
        supersededBy: null, bundleId: "bnd" },
    };
    await store.appendDelta("p1", d);
    const deltas = await store.readDeltas("p1");
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toEqual(d);
  });

  test("readDeltas returns empty array for unknown problem", async () => {
    expect(await store.readDeltas("missing")).toEqual([]);
  });

  test("writeSnapshot and readSnapshot round-trip", async () => {
    const graph: FlowGraph = {
      problemId: "p1", blocks: [],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
    };
    await store.writeSnapshot("p1", graph);
    expect(await store.readSnapshot("p1")).toEqual(graph);
  });

  test("readSnapshot returns null for missing", async () => {
    expect(await store.readSnapshot("missing")).toBeNull();
  });

  test("appendDelta preserves order under concurrency", async () => {
    const baseBlock = (id: string): FlowDelta => ({
      op: "block-add", timestampIso: clock.isoNow(),
      block: { blockId: id, problemId: "p1", type: "Cause", status: "confirmed",
        label: id, confidence: 0.5, supportedBy: [], relations: [],
        createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
        supersededBy: null, bundleId: "bnd" },
    });
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.appendDelta("p1", baseBlock(`b${i}`))));
    const deltas = await store.readDeltas("p1");
    expect(deltas).toHaveLength(20);
  });

  test("deltaLogPath scopes by problem", async () => {
    const d: FlowDelta = {
      op: "cue-card-regen", timestampIso: clock.isoNow(),
      problemId: "p1", bodyHash: "h", bodyBytes: 100,
    };
    await store.appendDelta("p1", d);
    await store.appendDelta("p2", { ...d, problemId: "p2" });
    expect(await store.readDeltas("p1")).toHaveLength(1);
    expect(await store.readDeltas("p2")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

Run: `bun test tests/core/flow/graph-store.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: 구현**

Write `src/core/flow/FlowGraphStore.ts`:
```typescript
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { FlowDelta, FlowGraph } from "./types";

export class FlowGraphStore {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  private deltaPath(problemId: string): string {
    return `problems/${problemId}/flow-delta.jsonl`;
  }

  private snapshotPath(problemId: string): string {
    return `problems/${problemId}/flow-graph.json`;
  }

  async appendDelta(problemId: string, delta: FlowDelta): Promise<void> {
    await this.storage.appendJsonl(this.deltaPath(problemId), delta);
  }

  async readDeltas(problemId: string, since?: string): Promise<FlowDelta[]> {
    const all = await this.storage.readJsonl<FlowDelta>(this.deltaPath(problemId));
    if (!since) return all;
    return all.filter(d => d.timestampIso >= since);
  }

  async writeSnapshot(problemId: string, graph: FlowGraph): Promise<void> {
    await this.storage.writeJsonAtomic(this.snapshotPath(problemId), graph);
  }

  async readSnapshot(problemId: string): Promise<FlowGraph | null> {
    return this.storage.readJson<FlowGraph>(this.snapshotPath(problemId));
  }
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `bun test tests/core/flow/graph-store.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/flow/FlowGraphStore.ts tests/core/flow/graph-store.test.ts
git commit -m "feat(E2-S2): FlowGraphStore with delta append and snapshot I/O"
```

---

## Task E2-S3: FlowGraphValidator

**Files:**
- Create: `src/core/flow/FlowGraphValidator.ts`
- Test: `tests/core/flow/validator.test.ts`

- [ ] **Step 1: Write failing test**

Write `tests/core/flow/validator.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { FlowGraphValidator } from "../../../src/core/flow/FlowGraphValidator";
import type { FlowBlock, FlowDelta } from "../../../src/core/flow/types";

const mkBlock = (overrides: Partial<FlowBlock> = {}): FlowBlock => ({
  blockId: "blk_cause_1", problemId: "p1", type: "Cause",
  status: "confirmed", label: "x", confidence: 0.5,
  supportedBy: [], relations: [], createdAt: "2026-04-18T00:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
  ...overrides,
});

describe("FlowGraphValidator", () => {
  const v = new FlowGraphValidator();

  test("validateBlock accepts valid block", () => {
    expect(v.validateBlock(mkBlock()).ok).toBe(true);
  });

  test("validateBlock rejects unknown type", () => {
    const res = v.validateBlock({ ...mkBlock(), type: "NotAType" as any });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("type");
  });

  test("validateBlock rejects confidence out of range", () => {
    expect(v.validateBlock({ ...mkBlock(), confidence: 1.5 }).ok).toBe(false);
    expect(v.validateBlock({ ...mkBlock(), confidence: -0.1 }).ok).toBe(false);
  });

  test("validateDelta accepts valid block-add", () => {
    const d: FlowDelta = { op: "block-add", timestampIso: "2026-04-18T00:00:00Z", block: mkBlock() };
    expect(v.validateDelta(d).ok).toBe(true);
  });

  test("validateDelta rejects relation-add with bad confidence", () => {
    const d: FlowDelta = {
      op: "relation-add", timestampIso: "2026-04-18T00:00:00Z",
      fromBlockId: "b1", relation: { kind: "causes", targetBlockId: "b2", confidence: 2 },
    };
    expect(v.validateDelta(d).ok).toBe(false);
  });

  test("detectCycles flags supersede cycle", () => {
    const blocks = [
      mkBlock({ blockId: "a", supersededBy: "b" }),
      mkBlock({ blockId: "b", supersededBy: "a" }),
    ];
    expect(v.detectSupersedeCycles(blocks).length).toBeGreaterThan(0);
  });

  test("detectCycles clean chain", () => {
    const blocks = [
      mkBlock({ blockId: "a", supersededBy: "b" }),
      mkBlock({ blockId: "b", supersededBy: null }),
    ];
    expect(v.detectSupersedeCycles(blocks)).toEqual([]);
  });

  test("validateRelationTargets requires target in same problem", () => {
    const blocks = [
      mkBlock({ blockId: "a", problemId: "p1",
        relations: [{ kind: "causes", targetBlockId: "b", confidence: 0.5 }] }),
      mkBlock({ blockId: "b", problemId: "p1" }),
    ];
    expect(v.validateRelationTargets(blocks).ok).toBe(true);

    const orphan = [
      mkBlock({ blockId: "a", problemId: "p1",
        relations: [{ kind: "causes", targetBlockId: "missing", confidence: 0.5 }] }),
    ];
    expect(v.validateRelationTargets(orphan).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

Run: `bun test tests/core/flow/validator.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

Write `src/core/flow/FlowGraphValidator.ts`:
```typescript
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
    if (d.op === "block-add") return this.validateBlock(d.block);
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
```

- [ ] **Step 4: Run test to verify PASS**

Run: `bun test tests/core/flow/validator.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/flow/FlowGraphValidator.ts tests/core/flow/validator.test.ts
git commit -m "feat(E2-S3): FlowGraphValidator with type, cycle, relation target checks"
```

---

## Task E2-S4: FlowGraphProjector

**Files:**
- Create: `src/core/flow/FlowGraphProjector.ts`
- Test: `tests/core/flow/projector.test.ts`

- [ ] **Step 1: Write failing test**

Write `tests/core/flow/projector.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { FlowGraphProjector } from "../../../src/core/flow/FlowGraphProjector";
import type { FlowBlock, FlowDelta } from "../../../src/core/flow/types";

const mkBlock = (id: string, overrides: Partial<FlowBlock> = {}): FlowBlock => ({
  blockId: id, problemId: "p1", type: "Cause", status: "confirmed",
  label: id, confidence: 0.5, supportedBy: [], relations: [],
  createdAt: "2026-04-18T00:00:00Z", lastConfirmedAt: null,
  staleAfter: null, supersededBy: null, bundleId: "bnd", ...overrides,
});

const addDelta = (b: FlowBlock, t = "2026-04-18T00:00:00Z"): FlowDelta =>
  ({ op: "block-add", timestampIso: t, block: b });

describe("FlowGraphProjector", () => {
  const p = new FlowGraphProjector();

  test("empty deltas produce empty graph", () => {
    const g = p.project("p1", []);
    expect(g.blocks).toEqual([]);
    expect(g.cueCardMeta.stale).toBe(false);
  });

  test("block-add appends to graph", () => {
    const g = p.project("p1", [addDelta(mkBlock("a"))]);
    expect(g.blocks).toHaveLength(1);
    expect(g.blocks[0].blockId).toBe("a");
  });

  test("block-supersede marks status", () => {
    const deltas: FlowDelta[] = [
      addDelta(mkBlock("a")),
      addDelta(mkBlock("b")),
      { op: "block-supersede", timestampIso: "2026-04-18T00:01:00Z",
        problemId: "p1", blockId: "a", supersededBy: "b", reason: "refined" },
    ];
    const g = p.project("p1", deltas);
    const a = g.blocks.find(b => b.blockId === "a")!;
    expect(a.status).toBe("superseded");
    expect(a.supersededBy).toBe("b");
  });

  test("relation-add attaches to source block", () => {
    const deltas: FlowDelta[] = [
      addDelta(mkBlock("a")), addDelta(mkBlock("b")),
      { op: "relation-add", timestampIso: "2026-04-18T00:01:00Z",
        problemId: "p1", fromBlockId: "a",
        relation: { kind: "causes", targetBlockId: "b", confidence: 0.8 } },
    ];
    const g = p.project("p1", deltas);
    const a = g.blocks.find(b => b.blockId === "a")!;
    expect(a.relations).toHaveLength(1);
    expect(a.relations[0].targetBlockId).toBe("b");
  });

  test("cue-card-regen updates meta", () => {
    const deltas: FlowDelta[] = [
      { op: "cue-card-regen", timestampIso: "2026-04-18T00:01:00Z",
        problemId: "p1", bodyHash: "abc123", bodyBytes: 500 },
    ];
    const g = p.project("p1", deltas);
    expect(g.cueCardMeta.bodyHash).toBe("abc123");
    expect(g.cueCardMeta.bodyBytes).toBe(500);
    expect(g.cueCardMeta.lastSyntheticAt).toBe("2026-04-18T00:01:00Z");
  });

  test("projection is deterministic for same input", () => {
    const deltas: FlowDelta[] = [
      addDelta(mkBlock("a")), addDelta(mkBlock("b")),
      { op: "relation-add", timestampIso: "2026-04-18T00:01:00Z",
        problemId: "p1", fromBlockId: "a",
        relation: { kind: "causes", targetBlockId: "b", confidence: 0.8 } },
    ];
    const g1 = p.project("p1", deltas);
    const g2 = p.project("p1", deltas);
    expect(g1).toEqual(g2);
  });

  test("stale flag true when delta count exceeds threshold", () => {
    const deltas: FlowDelta[] = Array.from({ length: 101 }, (_, i) => addDelta(mkBlock(`b${i}`)));
    const g = p.project("p1", deltas);
    expect(g.cueCardMeta.stale).toBe(true);
  });

  test("ignores deltas for other problems", () => {
    const deltas: FlowDelta[] = [
      addDelta(mkBlock("a", { problemId: "p1" })),
      addDelta(mkBlock("x", { problemId: "p2" })),
    ];
    const g = p.project("p1", deltas);
    expect(g.blocks).toHaveLength(1);
    expect(g.blocks[0].blockId).toBe("a");
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

Run: `bun test tests/core/flow/projector.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

Write `src/core/flow/FlowGraphProjector.ts`:
```typescript
import { FLOW_CONFIG } from "./config";
import type { FlowBlock, FlowDelta, FlowGraph } from "./types";

export class FlowGraphProjector {
  project(problemId: string, deltas: FlowDelta[]): FlowGraph {
    const blocks = new Map<string, FlowBlock>();
    let lastSyntheticAt: string | null = null;
    let bodyHash: string | null = null;
    let bodyBytes = 0;

    for (const d of deltas) {
      switch (d.op) {
        case "block-add":
          if (d.block.problemId === problemId) {
            blocks.set(d.block.blockId, { ...d.block, relations: [...d.block.relations] });
          }
          break;
        case "block-supersede": {
          if (d.problemId !== problemId) break;
          const b = blocks.get(d.blockId);
          if (b) {
            blocks.set(d.blockId, { ...b, status: "superseded", supersededBy: d.supersededBy });
          }
          break;
        }
        case "relation-add": {
          if (d.problemId !== problemId) break;
          const b = blocks.get(d.fromBlockId);
          if (b) {
            blocks.set(d.fromBlockId, { ...b, relations: [...b.relations, d.relation] });
          }
          break;
        }
        case "cue-card-regen":
          if (d.problemId === problemId) {
            lastSyntheticAt = d.timestampIso;
            bodyHash = d.bodyHash;
            bodyBytes = d.bodyBytes;
          }
          break;
      }
    }

    return {
      problemId,
      blocks: Array.from(blocks.values()),
      cueCardMeta: {
        lastSyntheticAt,
        bodyHash,
        bodyBytes,
        stale: deltas.length >= FLOW_CONFIG.DELTA_STALE_COUNT,
      },
    };
  }
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `bun test tests/core/flow/projector.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/flow/FlowGraphProjector.ts tests/core/flow/projector.test.ts
git commit -m "feat(E2-S4): FlowGraphProjector with deterministic delta -> snapshot projection"
```

---

## Task E2-S5: ObservationBundler

**Files:**
- Create: `src/core/flow/ObservationBundler.ts`
- Test: `tests/core/flow/bundler.test.ts`

- [ ] **Step 1: Write failing test**

Write `tests/core/flow/bundler.test.ts`:
```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { ObservationBundler } from "../../../src/core/flow/ObservationBundler";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("ObservationBundler", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let b: ObservationBundler;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    b = new ObservationBundler(storage, clock);
  });

  test("openTurn writes current-turn state", async () => {
    await b.openTurn("sess1", "p1", 1);
    const state = await storage.readJson("state/current-turn-sess1.json");
    expect(state).toMatchObject({ sessionId: "sess1", activeProblemId: "p1", turnOrdinal: 1 });
  });

  test("sealTurn produces bundle with active problem", async () => {
    await b.openTurn("sess1", "p1", 1);
    clock.advance(5000);
    const bundle = await b.sealTurn("sess1", [{ type: "user-intent", data: { userIntentRaw: "hi" } } as any], []);
    expect(bundle).not.toBeNull();
    expect(bundle!.activeProblemId).toBe("p1");
    expect(bundle!.turnOrdinal).toBe(1);
    expect(bundle!.observations).toHaveLength(1);
  });

  test("sealTurn with no active problem goes to orphan", async () => {
    await b.openTurn("sess1", null, 1);
    const bundle = await b.sealTurn("sess1", [], []);
    expect(bundle!.activeProblemId).toBeNull();
    const orphans = await storage.readJsonl("ledger/orphan-bundles.jsonl");
    expect(orphans).toHaveLength(1);
  });

  test("sealTurn returns null if no open turn", async () => {
    const bundle = await b.sealTurn("sess_nope", [], []);
    expect(bundle).toBeNull();
  });

  test("sealTurn splits when events exceed MAX_EVENTS_PER_BUNDLE", async () => {
    await b.openTurn("sess1", "p1", 1);
    const observations = Array.from({ length: 60 }, (_, i) => ({ type: "x", data: { i } } as any));
    await b.sealTurn("sess1", observations, []);
    const list = await b.listUnprocessed("p1");
    expect(list.length).toBeGreaterThan(1);
  });

  test("listUnprocessed filters by problem", async () => {
    await b.openTurn("sess1", "p1", 1);
    await b.sealTurn("sess1", [], []);
    await b.openTurn("sess2", "p2", 1);
    await b.sealTurn("sess2", [], []);
    expect((await b.listUnprocessed("p1"))).toHaveLength(1);
    expect((await b.listUnprocessed("p2"))).toHaveLength(1);
  });

  test("markProcessed updates bundle", async () => {
    await b.openTurn("sess1", "p1", 1);
    const bundle = await b.sealTurn("sess1", [], []);
    await b.markProcessed(bundle!.bundleId, "claude-code@1.0.0");
    const list = await b.listUnprocessed("p1");
    expect(list).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

Run: `bun test tests/core/flow/bundler.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

Write `src/core/flow/ObservationBundler.ts`:
```typescript
import { randomUUID } from "node:crypto";
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { FLOW_CONFIG } from "./config";
import type { BundleMetrics, ObservationBundle } from "./types";

type CurrentTurn = {
  sessionId: string;
  activeProblemId: string | null;
  turnOrdinal: number;
  openedAt: string;
};

export class ObservationBundler {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  private turnStatePath(sessionId: string): string {
    return `state/current-turn-${sessionId}.json`;
  }

  private bundlePath(bundleId: string, sealedAt: string): string {
    const d = new Date(sealedAt);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `ledger/bundles/${y}/${m}/${day}/${bundleId}.json`;
  }

  async openTurn(sessionId: string, activeProblemId: string | null, turnOrdinal: number): Promise<void> {
    const state: CurrentTurn = {
      sessionId, activeProblemId, turnOrdinal, openedAt: this.clock.isoNow(),
    };
    await this.storage.writeJsonAtomic(this.turnStatePath(sessionId), state);
  }

  async sealTurn(
    sessionId: string,
    observations: Array<Record<string, unknown>>,
    recentBlockIds: string[],
  ): Promise<ObservationBundle | null> {
    const state = await this.storage.readJson<CurrentTurn>(this.turnStatePath(sessionId));
    if (!state) return null;

    const sealedAt = this.clock.isoNow();
    const chunks = this.splitObservations(observations, FLOW_CONFIG.MAX_EVENTS_PER_BUNDLE);

    let primary: ObservationBundle | null = null;
    for (let i = 0; i < chunks.length; i++) {
      const isPart = chunks.length > 1;
      const bundleId = `bnd_${sessionId}_t${state.turnOrdinal}${isPart ? `_p${i + 1}` : ""}_${randomUUID().slice(0, 4)}`;
      const bundle: ObservationBundle = {
        bundleId,
        activeProblemId: state.activeProblemId,
        sessionId,
        turnOrdinal: state.turnOrdinal,
        openedAt: state.openedAt,
        sealedAt,
        eventIds: [],
        observations: chunks[i],
        metrics: this.deriveMetrics(chunks[i]),
        recentBlockIds,
        processedAt: null,
        processedByVersion: null,
      };
      if (state.activeProblemId === null) {
        await this.storage.appendJsonl("ledger/orphan-bundles.jsonl", bundle);
      } else {
        await this.storage.writeJsonAtomic(this.bundlePath(bundleId, sealedAt), bundle);
      }
      if (i === 0) primary = bundle;
    }
    await this.storage.writeJsonAtomic(this.turnStatePath(sessionId), { closed: true, sealedAt });
    return primary;
  }

  private splitObservations<T>(obs: T[], max: number): T[][] {
    if (obs.length <= max) return [obs];
    const out: T[][] = [];
    for (let i = 0; i < obs.length; i += max) out.push(obs.slice(i, i + max));
    return out;
  }

  private deriveMetrics(obs: Array<Record<string, unknown>>): BundleMetrics {
    const toolCallCounts: Record<string, number> = {};
    const touched = new Set<string>();
    let success = 0, failure = 0, promptCount = 0;
    for (const o of obs) {
      const t = String(o.type ?? "");
      if (t.startsWith("tool:")) {
        toolCallCounts[t] = (toolCallCounts[t] ?? 0) + 1;
        const data = (o.data ?? {}) as Record<string, unknown>;
        for (const f of (data.filesTouched as string[] | undefined) ?? []) touched.add(f);
        if (typeof data.exitCode === "number") (data.exitCode === 0 ? success++ : failure++);
      } else if (t === "user-intent") {
        promptCount++;
      }
    }
    return { toolCallCounts, touchedFiles: Array.from(touched), bashExit: { success, failure }, promptCount };
  }

  async listUnprocessed(problemId?: string): Promise<ObservationBundle[]> {
    const root = "ledger/bundles";
    const results: ObservationBundle[] = [];
    await this.collect(root, results);
    const orphans = await this.storage.readJsonl<ObservationBundle>("ledger/orphan-bundles.jsonl");
    results.push(...orphans);
    return results.filter(b =>
      b.processedAt === null
      && (problemId === undefined || b.activeProblemId === problemId)
    );
  }

  private async collect(dir: string, out: ObservationBundle[]): Promise<void> {
    const entries = await this.storage.listFiles(dir);
    for (const e of entries) {
      if (e.endsWith(".json")) {
        const b = await this.storage.readJson<ObservationBundle>(`${dir}/${e}`);
        if (b) out.push(b);
      } else {
        await this.collect(`${dir}/${e}`, out);
      }
    }
  }

  async markProcessed(bundleId: string, version: string): Promise<void> {
    const root = "ledger/bundles";
    const found = await this.findBundle(root, bundleId);
    if (found) {
      found.bundle.processedAt = this.clock.isoNow();
      found.bundle.processedByVersion = version;
      await this.storage.writeJsonAtomic(found.path, found.bundle);
      return;
    }
    const orphans = await this.storage.readJsonl<ObservationBundle>("ledger/orphan-bundles.jsonl");
    const idx = orphans.findIndex(o => o.bundleId === bundleId);
    if (idx >= 0) {
      orphans[idx].processedAt = this.clock.isoNow();
      orphans[idx].processedByVersion = version;
      const content = orphans.map(o => JSON.stringify(o)).join("\n") + "\n";
      await this.storage.writeRaw("ledger/orphan-bundles.jsonl", content);
    }
  }

  private async findBundle(dir: string, bundleId: string): Promise<{ path: string; bundle: ObservationBundle } | null> {
    const entries = await this.storage.listFiles(dir);
    for (const e of entries) {
      const path = `${dir}/${e}`;
      if (e.endsWith(".json")) {
        const b = await this.storage.readJson<ObservationBundle>(path);
        if (b?.bundleId === bundleId) return { path, bundle: b };
      } else {
        const nested = await this.findBundle(path, bundleId);
        if (nested) return nested;
      }
    }
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `bun test tests/core/flow/bundler.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/flow/ObservationBundler.ts tests/core/flow/bundler.test.ts
git commit -m "feat(E2-S5): ObservationBundler with turn-boundary bundling and orphan routing"
```

---

## Task E2-S6: OrphanBundleManager (재귀속 경로)

**Files:**
- Create: `src/core/flow/OrphanBundleManager.ts`
- Test: `tests/core/flow/orphan.test.ts`

S5의 ObservationBundler가 이미 orphan append/list를 지원하지만, **재귀속(re-attribution)** 로직과 **TTL 정리**는 별도 책임으로 분리한다.

- [ ] **Step 1: Write failing test**

Write `tests/core/flow/orphan.test.ts`:
```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { OrphanBundleManager } from "../../../src/core/flow/OrphanBundleManager";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { ObservationBundle } from "../../../src/core/flow/types";

const mkOrphan = (bundleId: string, sealedAt: string): ObservationBundle => ({
  bundleId, activeProblemId: null, sessionId: "s1", turnOrdinal: 1,
  openedAt: sealedAt, sealedAt, eventIds: [], observations: [],
  metrics: { toolCallCounts: {}, touchedFiles: [], bashExit: { success: 0, failure: 0 }, promptCount: 0 },
  recentBlockIds: [], processedAt: null, processedByVersion: null,
});

describe("OrphanBundleManager", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let m: OrphanBundleManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    m = new OrphanBundleManager(storage, clock);
  });

  test("listOrphans returns unprocessed orphans", async () => {
    await storage.appendJsonl("ledger/orphan-bundles.jsonl", mkOrphan("o1", "2026-04-18T09:00:00Z"));
    expect((await m.listOrphans()).length).toBe(1);
  });

  test("attributeToProblem moves orphan to problem's bundle store", async () => {
    const orphan = mkOrphan("o1", "2026-04-18T09:00:00Z");
    await storage.appendJsonl("ledger/orphan-bundles.jsonl", orphan);
    await m.attributeToProblem("o1", "p1");

    const orphans = await m.listOrphans();
    expect(orphans).toHaveLength(0);

    // Bundle 파일이 problem-scoped 경로에 생성됨
    const files = await storage.listFiles("ledger/bundles/2026/04/18");
    expect(files.some(f => f.includes("o1"))).toBe(true);
  });

  test("sweepExpired moves old orphans to expired bucket", async () => {
    await storage.appendJsonl("ledger/orphan-bundles.jsonl", mkOrphan("old", "2026-04-10T00:00:00Z"));
    await storage.appendJsonl("ledger/orphan-bundles.jsonl", mkOrphan("new", "2026-04-17T00:00:00Z"));
    const moved = await m.sweepExpired();
    expect(moved).toBe(1);

    const remaining = await m.listOrphans();
    expect(remaining.map(o => o.bundleId)).toEqual(["new"]);

    const expired = await storage.readJsonl("ledger/expired-bundles.jsonl");
    expect(expired).toHaveLength(1);
  });

  test("discardOrphan moves to discarded bucket", async () => {
    await storage.appendJsonl("ledger/orphan-bundles.jsonl", mkOrphan("o1", "2026-04-18T09:00:00Z"));
    await m.discardOrphan("o1", "not relevant");

    expect((await m.listOrphans()).length).toBe(0);
    const discarded = await storage.readJsonl("ledger/discarded-orphans.jsonl");
    expect(discarded).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

Run: `bun test tests/core/flow/orphan.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

Write `src/core/flow/OrphanBundleManager.ts`:
```typescript
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { FLOW_CONFIG } from "./config";
import type { ObservationBundle } from "./types";

const ORPHAN_PATH = "ledger/orphan-bundles.jsonl";
const EXPIRED_PATH = "ledger/expired-bundles.jsonl";
const DISCARDED_PATH = "ledger/discarded-orphans.jsonl";

export class OrphanBundleManager {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  async listOrphans(): Promise<ObservationBundle[]> {
    const all = await this.storage.readJsonl<ObservationBundle>(ORPHAN_PATH);
    return all.filter(o => o.processedAt === null);
  }

  async attributeToProblem(bundleId: string, problemId: string): Promise<void> {
    const all = await this.storage.readJsonl<ObservationBundle>(ORPHAN_PATH);
    const idx = all.findIndex(o => o.bundleId === bundleId);
    if (idx < 0) return;
    const bundle = { ...all[idx], activeProblemId: problemId };
    all.splice(idx, 1);
    await this.storage.writeRaw(ORPHAN_PATH, all.map(o => JSON.stringify(o)).join("\n") + (all.length ? "\n" : ""));

    const d = new Date(bundle.sealedAt);
    const y = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    await this.storage.writeJsonAtomic(`ledger/bundles/${y}/${mm}/${dd}/${bundle.bundleId}.json`, bundle);
  }

  async sweepExpired(): Promise<number> {
    const all = await this.storage.readJsonl<ObservationBundle>(ORPHAN_PATH);
    const now = this.clock.now().getTime();
    const ttlMs = FLOW_CONFIG.BUNDLE_TTL_DAYS * 24 * 60 * 60 * 1000;
    const keep: ObservationBundle[] = [];
    const expired: ObservationBundle[] = [];
    for (const o of all) {
      if (now - new Date(o.sealedAt).getTime() > ttlMs) expired.push(o);
      else keep.push(o);
    }
    await this.storage.writeRaw(ORPHAN_PATH, keep.map(o => JSON.stringify(o)).join("\n") + (keep.length ? "\n" : ""));
    for (const e of expired) await this.storage.appendJsonl(EXPIRED_PATH, e);
    return expired.length;
  }

  async discardOrphan(bundleId: string, reason: string): Promise<void> {
    const all = await this.storage.readJsonl<ObservationBundle>(ORPHAN_PATH);
    const idx = all.findIndex(o => o.bundleId === bundleId);
    if (idx < 0) return;
    const bundle = all[idx];
    all.splice(idx, 1);
    await this.storage.writeRaw(ORPHAN_PATH, all.map(o => JSON.stringify(o)).join("\n") + (all.length ? "\n" : ""));
    await this.storage.appendJsonl(DISCARDED_PATH, { ...bundle, discardReason: reason, discardedAt: this.clock.isoNow() });
  }
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `bun test tests/core/flow/orphan.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/flow/OrphanBundleManager.ts tests/core/flow/orphan.test.ts
git commit -m "feat(E2-S6): OrphanBundleManager with attribute, sweep, discard paths"
```

---

**Part 1 완료 확인**

```bash
bun test tests/core/flow/
bun run typecheck
```

Expected: 6 테스트 파일 모두 PASS, 타입체크 클린. Part 2로 이동.
