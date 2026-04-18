# CFGM-OS Epic 4 — Micro Ontology Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 다중 flow 템플릿(bugfix/architecture/general-task) 기반 per-problem ontology.module.yaml 생성·갱신·승격 컴파일러 레이어를 추가한다.

**Architecture:** `src/core/ontology/` 아래에 TemplateRegistry(YAML 템플릿 로드), OntologyModule(per-problem 모듈 R/W), PromotionEngine(resolvedRuns≥3 시 사용자 홈 복사) 3개 컴포넌트를 추가한다. `/cfgm-process` 스킬과 SessionStart 훅은 이 컴포넌트들을 통해 상호작용하며, 훅은 읽기 전용, 쓰기 판단은 Claude 본체(`/cfgm-process`)가 담당한다.

**Tech Stack:** Bun, TypeScript strict, `yaml` npm 패키지(YAML 직렬화), `bun:test`, MemoryStorage/FsStorage DI 패턴 (기존 Epic 0~3 코드베이스와 동일)

---

## 파일 구조

**신규 생성:**
```
src/core/ontology/types.ts
src/core/ontology/TemplateRegistry.ts
src/core/ontology/OntologyModule.ts
src/core/ontology/PromotionEngine.ts
flow-patterns/general-task.yaml
flow-patterns/bugfix.yaml
flow-patterns/architecture.yaml
bin/cfgm-ontology-record.ts
tests/core/ontology/template-registry.test.ts
tests/core/ontology/ontology-module.test.ts
tests/core/ontology/promotion-engine.test.ts
tests/e2e/epic4-golden-path.test.ts
```

**수정:**
```
src/core/binder/ActiveProblemStore.ts   — create() templateId 파라미터 + optional ontologyModule
src/hooks/session-start.ts              — HookDeps에 optional ontologyModule 추가
skills/cfgm-process/SKILL.md            — Step 9 온톨로지 갱신 삽입, 기존 9→10, 10→11 재번호
tests/core/binder/active-problem.test.ts — 새 케이스 추가
tests/hooks/session-start.test.ts        — 새 케이스 추가
```

---

## Task E4-S1: yaml 패키지 설치

**Files:**
- Modify: `package.json`
- Create: `tests/smoke/yaml-pkg.test.ts`

- [ ] **Step 1: yaml 패키지 설치**

```bash
bun add yaml
```

Expected: `package.json`에 `"yaml": "^2.x.x"` 추가됨

- [ ] **Step 2: 스모크 테스트 작성**

```typescript
// tests/smoke/yaml-pkg.test.ts
import { test, expect } from "bun:test";
import { parse, stringify } from "yaml";

test("yaml parse/stringify roundtrip", () => {
  const obj = { id: "bugfix", version: "1.0.0", minConfidence: 0.6 };
  const raw = stringify(obj);
  expect(parse(raw)).toEqual(obj);
});

test("yaml parses multiline with arrays", () => {
  const raw = `id: bugfix\nrequiredBlockTypes:\n  - Action\n  - Outcome\n`;
  const parsed = parse(raw) as { id: string; requiredBlockTypes: string[] };
  expect(parsed.id).toBe("bugfix");
  expect(parsed.requiredBlockTypes).toEqual(["Action", "Outcome"]);
});
```

- [ ] **Step 3: 테스트 실행 확인**

```bash
bun test tests/smoke/yaml-pkg.test.ts
```

Expected: `2 pass, 0 fail`

- [ ] **Step 4: 커밋**

```bash
git add package.json bun.lock tests/smoke/yaml-pkg.test.ts
git commit -m "feat(E4-S1): add yaml package for YAML serialization"
```

---

## Task E4-S2: 타입 정의 + flow-patterns 3종 YAML

**Files:**
- Create: `src/core/ontology/types.ts`
- Create: `flow-patterns/general-task.yaml`
- Create: `flow-patterns/bugfix.yaml`
- Create: `flow-patterns/architecture.yaml`

- [ ] **Step 1: types.ts 작성**

```typescript
// src/core/ontology/types.ts
import type { FlowBlockType, RelationKind } from "../flow/types";

export type FlowTemplate = {
  id: string;
  version: string;
  description: string;
  requiredBlockTypes: FlowBlockType[];
  recommendedBlockTypes: FlowBlockType[];
  expectedRelations: Array<{
    from: FlowBlockType;
    to: FlowBlockType;
    kind: RelationKind;
  }>;
  minConfidence: number;
};

export type OntologyModuleData = {
  problemId: string;
  templateId: string;
  templateVersion: string;
  resolvedRuns: number;
  createdAt: string;
  lastUpdatedAt: string;
  observedPatterns: Record<string, number>;
  promotedAt: string | null;
};
```

- [ ] **Step 2: general-task.yaml 작성**

```yaml
# flow-patterns/general-task.yaml
id: general-task
version: "1.0.0"
description: "범용 기본 문제 해결 패턴"
requiredBlockTypes:
  - Action
recommendedBlockTypes:
  - Cause
  - Evidence
  - Outcome
expectedRelations:
  - from: Action
    to: Outcome
    kind: followsFrom
minConfidence: 0.5
```

- [ ] **Step 3: bugfix.yaml 작성**

```yaml
# flow-patterns/bugfix.yaml
id: bugfix
version: "1.0.0"
description: "버그/장애 재현 및 수정 패턴"
requiredBlockTypes:
  - Action
  - Outcome
recommendedBlockTypes:
  - Trigger
  - Cause
  - Evidence
  - Hypothesis
expectedRelations:
  - from: Action
    to: Outcome
    kind: followsFrom
  - from: Evidence
    to: Cause
    kind: evidencedBy
minConfidence: 0.6
```

- [ ] **Step 4: architecture.yaml 작성**

```yaml
# flow-patterns/architecture.yaml
id: architecture
version: "1.0.0"
description: "아키텍처 결정 패턴"
requiredBlockTypes:
  - Context
  - Action
recommendedBlockTypes:
  - Constraint
  - Hypothesis
  - Evidence
  - Outcome
  - Rule
expectedRelations:
  - from: Evidence
    to: Hypothesis
    kind: validatedBy
  - from: Action
    to: Outcome
    kind: followsFrom
minConfidence: 0.65
```

- [ ] **Step 5: typecheck 확인**

```bash
bun run typecheck
```

Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/core/ontology/types.ts flow-patterns/
git commit -m "feat(E4-S2): ontology types and 3 flow-pattern templates"
```

---

## Task E4-S3: TemplateRegistry

**Files:**
- Create: `src/core/ontology/TemplateRegistry.ts`
- Create: `tests/core/ontology/template-registry.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```typescript
// tests/core/ontology/template-registry.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { TemplateRegistry } from "../../../src/core/ontology/TemplateRegistry";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { stringify } from "yaml";
import type { FlowTemplate } from "../../../src/core/ontology/types";

const bugfixTemplate: FlowTemplate = {
  id: "bugfix",
  version: "1.0.0",
  description: "버그 수정",
  requiredBlockTypes: ["Action", "Outcome"],
  recommendedBlockTypes: ["Cause", "Evidence"],
  expectedRelations: [{ from: "Action", to: "Outcome", kind: "followsFrom" }],
  minConfidence: 0.6,
};

const archTemplate: FlowTemplate = {
  id: "architecture",
  version: "1.0.0",
  description: "아키텍처 결정",
  requiredBlockTypes: ["Context", "Action"],
  recommendedBlockTypes: ["Constraint"],
  expectedRelations: [],
  minConfidence: 0.65,
};

describe("TemplateRegistry", () => {
  let storage: MemoryStorage;
  let registry: TemplateRegistry;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.writeRaw("flow-patterns/bugfix.yaml", stringify(bugfixTemplate));
    await storage.writeRaw("flow-patterns/architecture.yaml", stringify(archTemplate));
    registry = new TemplateRegistry(storage);
  });

  test("loadAll returns all seeded templates", async () => {
    const all = await registry.loadAll();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.id).sort()).toEqual(["architecture", "bugfix"]);
  });

  test("get(id) returns matching template", async () => {
    const t = await registry.get("bugfix");
    expect(t?.id).toBe("bugfix");
    expect(t?.requiredBlockTypes).toEqual(["Action", "Outcome"]);
  });

  test("get(missing) returns null", async () => {
    const t = await registry.get("nonexistent");
    expect(t).toBeNull();
  });

  test("listIds returns sorted ids", async () => {
    const ids = await registry.listIds();
    expect(ids.sort()).toEqual(["architecture", "bugfix"]);
  });

  test("loadAll on empty storage returns empty array", async () => {
    const empty = new TemplateRegistry(new MemoryStorage());
    expect(await empty.loadAll()).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
bun test tests/core/ontology/template-registry.test.ts
```

Expected: FAIL (모듈 없음)

- [ ] **Step 3: TemplateRegistry 구현**

```typescript
// src/core/ontology/TemplateRegistry.ts
import { parse } from "yaml";
import type { Storage } from "../storage/Storage";
import type { FlowTemplate } from "./types";

export class TemplateRegistry {
  constructor(private readonly storage: Storage) {}

  async loadAll(): Promise<FlowTemplate[]> {
    const files = await this.storage.listFiles("flow-patterns", "*.yaml");
    const templates: FlowTemplate[] = [];
    for (const file of files) {
      const content = await this.storage.readText(`flow-patterns/${file}`);
      if (!content) continue;
      templates.push(parse(content) as FlowTemplate);
    }
    return templates;
  }

  async get(templateId: string): Promise<FlowTemplate | null> {
    const content = await this.storage.readText(`flow-patterns/${templateId}.yaml`);
    if (!content) return null;
    return parse(content) as FlowTemplate;
  }

  async listIds(): Promise<string[]> {
    const files = await this.storage.listFiles("flow-patterns", "*.yaml");
    return files.map((f) => f.replace(/\.yaml$/, ""));
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
bun test tests/core/ontology/template-registry.test.ts
```

Expected: `5 pass, 0 fail`

- [ ] **Step 5: typecheck 확인**

```bash
bun run typecheck
```

Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/core/ontology/TemplateRegistry.ts tests/core/ontology/template-registry.test.ts
git commit -m "feat(E4-S3): TemplateRegistry with YAML load and lookup"
```

---

## Task E4-S4: OntologyModule

**Files:**
- Create: `src/core/ontology/OntologyModule.ts`
- Create: `tests/core/ontology/ontology-module.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```typescript
// tests/core/ontology/ontology-module.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { OntologyModule } from "../../../src/core/ontology/OntologyModule";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("OntologyModule", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let module: OntologyModule;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    module = new OntologyModule(storage, clock);
  });

  test("read returns null when no file exists", async () => {
    expect(await module.read("p1")).toBeNull();
  });

  test("create persists module and returns data", async () => {
    const data = await module.create("p1", "bugfix", "1.0.0");
    expect(data.problemId).toBe("p1");
    expect(data.templateId).toBe("bugfix");
    expect(data.resolvedRuns).toBe(0);
    expect(data.promotedAt).toBeNull();
    expect(data.observedPatterns).toEqual({});
    expect(await module.read("p1")).toEqual(data);
  });

  test("recordPatterns累積: 두 번 호출하면 합산", async () => {
    await module.create("p1", "bugfix", "1.0.0");
    await module.recordPatterns("p1", { Action: 2, Outcome: 1 });
    const after = await module.recordPatterns("p1", { Action: 1, Cause: 1 });
    expect(after.observedPatterns).toEqual({ Action: 3, Outcome: 1, Cause: 1 });
  });

  test("incrementResolvedRuns +1씩 증가", async () => {
    await module.create("p1", "bugfix", "1.0.0");
    const r1 = await module.incrementResolvedRuns("p1");
    expect(r1.resolvedRuns).toBe(1);
    const r2 = await module.incrementResolvedRuns("p1");
    expect(r2.resolvedRuns).toBe(2);
  });

  test("markPromoted sets promotedAt", async () => {
    await module.create("p1", "bugfix", "1.0.0");
    const result = await module.markPromoted("p1", "2026-04-18T12:00:00Z");
    expect(result.promotedAt).toBe("2026-04-18T12:00:00Z");
    expect((await module.read("p1"))?.promotedAt).toBe("2026-04-18T12:00:00Z");
  });

  test("recordPatterns throws when module missing", async () => {
    expect(module.recordPatterns("missing", {})).rejects.toThrow();
  });

  test("incrementResolvedRuns throws when module missing", async () => {
    expect(module.incrementResolvedRuns("missing")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
bun test tests/core/ontology/ontology-module.test.ts
```

Expected: FAIL (모듈 없음)

- [ ] **Step 3: OntologyModule 구현**

```typescript
// src/core/ontology/OntologyModule.ts
import { parse, stringify } from "yaml";
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { OntologyModuleData } from "./types";

export class OntologyModule {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
  ) {}

  private path(problemId: string): string {
    return `problems/${problemId}/ontology.module.yaml`;
  }

  async read(problemId: string): Promise<OntologyModuleData | null> {
    const content = await this.storage.readText(this.path(problemId));
    if (!content) return null;
    return parse(content) as OntologyModuleData;
  }

  async create(
    problemId: string,
    templateId: string,
    templateVersion: string,
  ): Promise<OntologyModuleData> {
    const now = this.clock.isoNow();
    const data: OntologyModuleData = {
      problemId,
      templateId,
      templateVersion,
      resolvedRuns: 0,
      createdAt: now,
      lastUpdatedAt: now,
      observedPatterns: {},
      promotedAt: null,
    };
    await this.storage.writeRaw(this.path(problemId), stringify(data));
    return data;
  }

  async recordPatterns(
    problemId: string,
    blockTypeCounts: Record<string, number>,
  ): Promise<OntologyModuleData> {
    const existing = await this.read(problemId);
    if (!existing) throw new Error(`ontology module not found: ${problemId}`);
    const merged: Record<string, number> = { ...existing.observedPatterns };
    for (const [type, count] of Object.entries(blockTypeCounts)) {
      merged[type] = (merged[type] ?? 0) + count;
    }
    const updated: OntologyModuleData = {
      ...existing,
      observedPatterns: merged,
      lastUpdatedAt: this.clock.isoNow(),
    };
    await this.storage.writeRaw(this.path(problemId), stringify(updated));
    return updated;
  }

  async incrementResolvedRuns(problemId: string): Promise<OntologyModuleData> {
    const existing = await this.read(problemId);
    if (!existing) throw new Error(`ontology module not found: ${problemId}`);
    const updated: OntologyModuleData = {
      ...existing,
      resolvedRuns: existing.resolvedRuns + 1,
      lastUpdatedAt: this.clock.isoNow(),
    };
    await this.storage.writeRaw(this.path(problemId), stringify(updated));
    return updated;
  }

  async markPromoted(problemId: string, promotedAt: string): Promise<OntologyModuleData> {
    const existing = await this.read(problemId);
    if (!existing) throw new Error(`ontology module not found: ${problemId}`);
    const updated: OntologyModuleData = {
      ...existing,
      promotedAt,
      lastUpdatedAt: this.clock.isoNow(),
    };
    await this.storage.writeRaw(this.path(problemId), stringify(updated));
    return updated;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
bun test tests/core/ontology/ontology-module.test.ts
```

Expected: `7 pass, 0 fail`

- [ ] **Step 5: 커밋**

```bash
git add src/core/ontology/OntologyModule.ts tests/core/ontology/ontology-module.test.ts
git commit -m "feat(E4-S4): OntologyModule for per-problem YAML module R/W"
```

---

## Task E4-S5: ActiveProblemStore templateId 연동

**Files:**
- Modify: `src/core/binder/ActiveProblemStore.ts`
- Modify: `tests/core/binder/active-problem.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

`tests/core/binder/active-problem.test.ts` 파일 끝에 추가:

```typescript
import { OntologyModule } from "../../../src/core/ontology/OntologyModule";
import { parse } from "yaml";
import type { OntologyModuleData } from "../../../src/core/ontology/types";

describe("ActiveProblemStore — ontologyModule 연동", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
  });

  test("create with ontologyModule → module 파일 생성", async () => {
    const ontologyModule = new OntologyModule(storage, clock);
    const store = new ActiveProblemStore(storage, clock, ontologyModule);
    const prob = await store.create("auth bug", "auth", "bugfix");
    const module = await ontologyModule.read(prob.id);
    expect(module?.templateId).toBe("bugfix");
    expect(module?.resolvedRuns).toBe(0);
  });

  test("create without ontologyModule → 모듈 파일 미생성 (하위호환)", async () => {
    const store = new ActiveProblemStore(storage, clock);
    const prob = await store.create("auth bug", "auth");
    const content = await storage.readText(`problems/${prob.id}/ontology.module.yaml`);
    expect(content).toBeNull();
  });

  test("create templateId 기본값 general-task", async () => {
    const ontologyModule = new OntologyModule(storage, clock);
    const store = new ActiveProblemStore(storage, clock, ontologyModule);
    const prob = await store.create("auth bug", "auth");
    const module = await ontologyModule.read(prob.id);
    expect(module?.templateId).toBe("general-task");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
bun test tests/core/binder/active-problem.test.ts
```

Expected: 새 케이스 FAIL

- [ ] **Step 3: ActiveProblemStore 수정**

`src/core/binder/ActiveProblemStore.ts`를 다음과 같이 수정:

```typescript
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { OntologyModule } from "../ontology/OntologyModule";
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
    private readonly clock: Clock,
    private readonly ontologyModule?: OntologyModule,
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

  async create(title: string, slug: string, templateId = "general-task"): Promise<Problem> {
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
    if (this.ontologyModule) {
      await this.ontologyModule.create(problem.id, templateId, "1.0.0");
    }
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

- [ ] **Step 4: 전체 테스트 확인**

```bash
bun test tests/core/binder/active-problem.test.ts
```

Expected: 모든 케이스 pass (기존 + 신규)

- [ ] **Step 5: 전체 회귀 확인**

```bash
bun test
```

Expected: 기존 299 + 신규 3 = 302 pass, 0 fail

- [ ] **Step 6: 커밋**

```bash
git add src/core/binder/ActiveProblemStore.ts tests/core/binder/active-problem.test.ts
git commit -m "feat(E4-S5): ActiveProblemStore wires templateId to OntologyModule on create"
```

---

## Task E4-S6: PromotionEngine

**Files:**
- Create: `src/core/ontology/PromotionEngine.ts`
- Create: `tests/core/ontology/promotion-engine.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```typescript
// tests/core/ontology/promotion-engine.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { PromotionEngine } from "../../../src/core/ontology/PromotionEngine";
import { OntologyModule } from "../../../src/core/ontology/OntologyModule";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("PromotionEngine", () => {
  let projectStorage: MemoryStorage;
  let userStorage: MemoryStorage;
  let clock: FakeClock;
  let ontologyModule: OntologyModule;
  let engine: PromotionEngine;

  beforeEach(async () => {
    projectStorage = new MemoryStorage();
    userStorage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    ontologyModule = new OntologyModule(projectStorage, clock);
    engine = new PromotionEngine(ontologyModule, userStorage, clock);
  });

  test("resolvedRuns < 3 → false, 복사 없음", async () => {
    await ontologyModule.create("p1", "bugfix", "1.0.0");
    await ontologyModule.incrementResolvedRuns("p1");
    await ontologyModule.incrementResolvedRuns("p1");
    const module = (await ontologyModule.read("p1"))!;
    const result = await engine.maybePromote(module);
    expect(result).toBe(false);
    expect(await userStorage.exists("ontologies/promoted/bugfix/p1.yaml")).toBe(false);
  });

  test("resolvedRuns >= 3 → true, 복사 완료", async () => {
    await ontologyModule.create("p1", "bugfix", "1.0.0");
    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns("p1");
    const module = (await ontologyModule.read("p1"))!;
    const result = await engine.maybePromote(module);
    expect(result).toBe(true);
    expect(await userStorage.exists("ontologies/promoted/bugfix/p1.yaml")).toBe(true);
  });

  test("승격 후 projectStorage의 promotedAt 갱신", async () => {
    await ontologyModule.create("p1", "bugfix", "1.0.0");
    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns("p1");
    const module = (await ontologyModule.read("p1"))!;
    await engine.maybePromote(module);
    const updated = await ontologyModule.read("p1");
    expect(updated?.promotedAt).toBe(clock.isoNow());
  });

  test("이미 승격됨 → false, 중복 복사 없음", async () => {
    await ontologyModule.create("p1", "bugfix", "1.0.0");
    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns("p1");
    const module = (await ontologyModule.read("p1"))!;
    await engine.maybePromote(module);
    // 두 번째 호출
    const already = (await ontologyModule.read("p1"))!;
    const result = await engine.maybePromote(already);
    expect(result).toBe(false);
  });

  test("minResolvedRuns 커스텀 설정 가능", async () => {
    const strictEngine = new PromotionEngine(ontologyModule, userStorage, clock, 5);
    await ontologyModule.create("p2", "architecture", "1.0.0");
    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns("p2");
    const module = (await ontologyModule.read("p2"))!;
    const result = await strictEngine.maybePromote(module);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
bun test tests/core/ontology/promotion-engine.test.ts
```

Expected: FAIL (모듈 없음)

- [ ] **Step 3: PromotionEngine 구현**

```typescript
// src/core/ontology/PromotionEngine.ts
import { stringify } from "yaml";
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { OntologyModuleData } from "./types";
import { OntologyModule } from "./OntologyModule";

export class PromotionEngine {
  constructor(
    private readonly ontologyModule: OntologyModule,
    private readonly userStorage: Storage,
    private readonly clock: Clock,
    private readonly minResolvedRuns = 3,
  ) {}

  async maybePromote(module: OntologyModuleData): Promise<boolean> {
    if (module.resolvedRuns < this.minResolvedRuns) return false;
    if (module.promotedAt !== null) return false;

    const promotedAt = this.clock.isoNow();
    const promoted: OntologyModuleData = { ...module, promotedAt };
    const path = `ontologies/promoted/${module.templateId}/${module.problemId}.yaml`;
    await this.userStorage.writeRaw(path, stringify(promoted));
    await this.ontologyModule.markPromoted(module.problemId, promotedAt);
    return true;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
bun test tests/core/ontology/promotion-engine.test.ts
```

Expected: `5 pass, 0 fail`

- [ ] **Step 5: 커밋**

```bash
git add src/core/ontology/PromotionEngine.ts tests/core/ontology/promotion-engine.test.ts
git commit -m "feat(E4-S6): PromotionEngine copies module to user home on resolvedRuns>=3"
```

---

## Task E4-S7: SessionStart 훅 읽기 전용 주입

**Files:**
- Modify: `src/hooks/session-start.ts`
- Modify: `tests/hooks/session-start.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

`tests/hooks/session-start.test.ts` 기존 describe 블록 끝 또는 새 describe 블록으로 추가:

```typescript
import { OntologyModule } from "../../src/core/ontology/OntologyModule";

describe("SessionStart hook — Epic 4 ontology 주입", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let expirer: Expirer;
  let bundler: ObservationBundler;
  let injector: CueCardInjector;
  let fallback: CueCardFallback;
  let ontologyModule: OntologyModule;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    expirer = new Expirer(storage, clock, 7);
    bundler = new ObservationBundler(storage, clock);
    injector = new CueCardInjector();
    fallback = new CueCardFallback();
    ontologyModule = new OntologyModule(storage, clock);
  });

  const evt = (): CanonicalEvent => ({
    platform: "claude-code", stage: "session-start", sessionId: "sess-e4",
    cwd: "/p", timestampIso: clock.isoNow(),
    payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
  });

  test("모듈 있을 때 templateId + resolvedRuns 주입", async () => {
    const prob = await problemStore.create("auth bug", "auth");
    await ontologyModule.create(prob.id, "bugfix", "1.0.0");
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, ontologyModule,
    });
    expect(out).toContain("bugfix");
    expect(out).toContain("0 / 3");
  });

  test("resolvedRuns 1 후 반영", async () => {
    const prob = await problemStore.create("auth bug", "auth");
    await ontologyModule.create(prob.id, "bugfix", "1.0.0");
    await ontologyModule.incrementResolvedRuns(prob.id);
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, ontologyModule,
    });
    expect(out).toContain("1 / 3");
  });

  test("ontologyModule 미전달 시 기존 동작 유지", async () => {
    await problemStore.create("auth bug", "auth");
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback,
    });
    expect(out).toContain("auth bug");
    expect(out).not.toContain("템플릿");
  });

  test("모듈 파일 없음 → 주입 스킵", async () => {
    await problemStore.create("auth bug", "auth");
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, ontologyModule,
    });
    expect(out).not.toContain("템플릿");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
bun test tests/hooks/session-start.test.ts
```

Expected: 신규 케이스 FAIL

- [ ] **Step 3: session-start.ts 수정**

`src/hooks/session-start.ts`의 `HookDeps` 타입과 `handleSessionStart` 함수를 수정:

```typescript
import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { Expirer } from "../core/ledger/Expirer";
import type { ObservationBundler } from "../core/flow/ObservationBundler";
import type { CueCardInjector } from "../core/flow/CueCardInjector";
import type { CueCardFallback } from "../core/flow/CueCardFallback";
import type { OntologyModule } from "../core/ontology/OntologyModule";
import { FLOW_CONFIG } from "../core/flow/config";

export type HookDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  queue: PendingQueue;
  ledger: RawLedger;
  expirer: Expirer;
  bundler: ObservationBundler;
  injector: CueCardInjector;
  fallback: CueCardFallback;
  ontologyModule?: OntologyModule;
};

export async function handleSessionStart(
  event: CanonicalEvent,
  deps: HookDeps,
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

    if (deps.ontologyModule) {
      const moduleData = await deps.ontologyModule.read(active.id);
      if (moduleData) {
        lines.push(`**템플릿:** ${moduleData.templateId} v${moduleData.templateVersion}`);
        lines.push(`**완료 횟수:** ${moduleData.resolvedRuns} / 3`);
      }
    }

    const cueCardPath = `problems/${active.id}/cue-card.md`;
    let cueCardMd = await deps.storage.readText(cueCardPath);

    const unprocessedBundles = await deps.bundler.listUnprocessed(active.id);

    if (!cueCardMd && unprocessedBundles.length > 0) {
      cueCardMd = deps.fallback.generate(active.id, active.title, unprocessedBundles);
    }

    if (cueCardMd) {
      const budgetBytes = Math.floor(FLOW_CONFIG.STDOUT_INJECT_BUDGET_KB * 1024);
      const projected = deps.injector.projectForStdout(cueCardMd, budgetBytes);
      lines.push("");
      lines.push(projected);
    }

    if (unprocessedBundles.length >= FLOW_CONFIG.PENDING_WARN_THRESHOLD) {
      lines.push("");
      lines.push(`> 미처리 번들 ${unprocessedBundles.length}개 · \`/cfgm-process\` 권장`);
    }
  }

  if (pendingCount > 0) {
    lines.push(`**대기 분석:** ${pendingCount}건 → \`/cfgm-process\`로 처리`);
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: 전체 session-start 테스트 확인**

```bash
bun test tests/hooks/session-start.test.ts
```

Expected: 모든 케이스 pass

- [ ] **Step 5: 전체 회귀 확인**

```bash
bun test
```

Expected: 0 fail

- [ ] **Step 6: 커밋**

```bash
git add src/hooks/session-start.ts tests/hooks/session-start.test.ts
git commit -m "feat(E4-S7): SessionStart injects template info from OntologyModule (read-only)"
```

---

## Task E4-S8: CLI + SKILL.md 확장

**Files:**
- Create: `bin/cfgm-ontology-record.ts`
- Modify: `skills/cfgm-process/SKILL.md`
- Create: `tests/bin/cfgm-ontology-cli.test.ts`

- [ ] **Step 1: CLI 실패 테스트 작성**

```typescript
// tests/bin/cfgm-ontology-cli.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_ENV = (projectDir: string) => ({ ...process.env, CFGM_PROJECT: projectDir });

describe("bin/cfgm-ontology-record", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-e4-"));
  });
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("--problem 없으면 exit=1", () => {
    const r = spawnSync("bun", ["run", "bin/cfgm-ontology-record.ts"], {
      cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8",
    });
    expect(r.status).not.toBe(0);
  });

  test("신규 모듈 생성 + 패턴 기록", () => {
    const r = spawnSync("bun", ["run", "bin/cfgm-ontology-record.ts", "--problem", "p1"], {
      cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8",
      input: JSON.stringify({ blockTypeCounts: { Action: 2, Outcome: 1 } }),
    });
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.problemId).toBe("p1");
    expect(data.observedPatterns.Action).toBe(2);
  });

  test("--resolve 시 resolvedRuns 증가", () => {
    // 먼저 모듈 생성
    spawnSync("bun", ["run", "bin/cfgm-ontology-record.ts", "--problem", "p1"], {
      cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8",
      input: JSON.stringify({ blockTypeCounts: {} }),
    });
    const r = spawnSync(
      "bun",
      ["run", "bin/cfgm-ontology-record.ts", "--problem", "p1", "--resolve"],
      { cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8",
        input: JSON.stringify({ blockTypeCounts: {} }) },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("resolvedRuns=1");
  });
});
```

- [ ] **Step 2: CLI 실패 확인**

```bash
bun test tests/bin/cfgm-ontology-cli.test.ts
```

Expected: FAIL (파일 없음)

- [ ] **Step 3: CLI 구현**

```typescript
#!/usr/bin/env bun
// bin/cfgm-ontology-record.ts
// Usage: echo '{"blockTypeCounts":{"Action":2}}' | bun run bin/cfgm-ontology-record.ts --problem <id> [--resolve]
import { resolve } from "node:path";
import { homedir } from "node:os";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { OntologyModule } from "../src/core/ontology/OntologyModule";
import { PromotionEngine } from "../src/core/ontology/PromotionEngine";

const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const USER_HOME = process.env.CFGM_USER_HOME || resolve(homedir(), ".memory-brain");

const storage = new FsStorage(resolve(PROJECT, ".memory-brain"));
const userStorage = new FsStorage(USER_HOME);
const clock = new RealClock();
const ontologyModule = new OntologyModule(storage, clock);
const promotionEngine = new PromotionEngine(ontologyModule, userStorage, clock);

const args = process.argv.slice(2);
const problemIdx = args.indexOf("--problem");
if (problemIdx < 0) {
  console.error("--problem <id> required");
  process.exit(1);
}
const problemId = args[problemIdx + 1];
const shouldResolve = args.includes("--resolve");

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString("utf-8").trim();

  if (body) {
    const { blockTypeCounts } = JSON.parse(body) as {
      blockTypeCounts: Record<string, number>;
    };
    const existing = await ontologyModule.read(problemId);
    if (!existing) {
      await ontologyModule.create(problemId, "general-task", "1.0.0");
    }
    await ontologyModule.recordPatterns(problemId, blockTypeCounts);
  }

  if (shouldResolve) {
    const existing = await ontologyModule.read(problemId);
    if (!existing) {
      console.error(`module not found: ${problemId}`);
      process.exit(1);
    }
    const updated = await ontologyModule.incrementResolvedRuns(problemId);
    console.log(`resolvedRuns=${updated.resolvedRuns}`);
    const promoted = await promotionEngine.maybePromote(updated);
    if (promoted) console.log(`promoted to ${USER_HOME}/ontologies/promoted/${updated.templateId}/`);
  }

  const final = await ontologyModule.read(problemId);
  process.stdout.write(JSON.stringify(final, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: CLI 테스트 통과 확인**

```bash
bun test tests/bin/cfgm-ontology-cli.test.ts
```

Expected: `3 pass, 0 fail`

- [ ] **Step 5: SKILL.md 수정 — Step 9 삽입, 기존 9→10·10→11 재번호**

`skills/cfgm-process/SKILL.md`에서 `### 9. 번들 처리 완료 마킹` 앞에 삽입하고, 이후 번호 갱신:

기존 `### 9. 번들 처리 완료 마킹` → `### 10. 번들 처리 완료 마킹`

기존 `### 10. 결과 요약` → `### 11. 결과 요약`

새 Step 9 삽입:

```markdown
### 9. Ontology 모듈 갱신 (Epic 4)

이번 합성에서 추가한 블록 타입 빈도를 `bin/cfgm-ontology-record.ts`로 기록한다.
해당 problem의 `ontology.module.yaml`이 없으면 `general-task`로 자동 생성된다.

```bash
echo '{"blockTypeCounts":{"Action":1,"Outcome":1}}' | \
  bun run bin/cfgm-ontology-record.ts --problem <problemId>
```

문제가 해결 완료됐다고 판단되면 (Outcome positive + 더 이상 열린 Gap 없음 등) `--resolve` 추가:

```bash
echo '{"blockTypeCounts":{}}' | \
  bun run bin/cfgm-ontology-record.ts --problem <problemId> --resolve
```

`resolvedRuns`가 3에 도달하면 승격이 자동 트리거된다.
Step 11 결과 요약에 `resolvedRuns` 값과 승격 여부를 포함한다.
```

- [ ] **Step 6: 커밋**

```bash
git add bin/cfgm-ontology-record.ts tests/bin/cfgm-ontology-cli.test.ts skills/cfgm-process/SKILL.md
git commit -m "feat(E4-S8): cfgm-ontology-record CLI and cfgm-process SKILL.md update"
```

---

## Task E4-S9: E2E golden path

**Files:**
- Create: `tests/e2e/epic4-golden-path.test.ts`

- [ ] **Step 1: E2E 테스트 작성**

```typescript
// tests/e2e/epic4-golden-path.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FsStorage } from "../../src/core/storage/FsStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { OntologyModule } from "../../src/core/ontology/OntologyModule";
import { PromotionEngine } from "../../src/core/ontology/PromotionEngine";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";

describe("Epic 4 golden path — create → record × 3 → promote", () => {
  let projectDir: string;
  let projectStorage: FsStorage;
  let userStorage: MemoryStorage;
  let clock: FakeClock;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-e4-e2e-"));
    projectStorage = new FsStorage(join(projectDir, ".memory-brain"));
    userStorage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("문제 생성 → 3회 합성 → 승격", async () => {
    const ontologyModule = new OntologyModule(projectStorage, clock);
    const promotionEngine = new PromotionEngine(ontologyModule, userStorage, clock);
    const problemStore = new ActiveProblemStore(projectStorage, clock, ontologyModule);

    const prob = await problemStore.create("auth bug", "auth", "bugfix");

    // 모듈 생성 확인
    const initial = await ontologyModule.read(prob.id);
    expect(initial?.templateId).toBe("bugfix");
    expect(initial?.resolvedRuns).toBe(0);

    // 3번 합성 (패턴 기록 + resolvedRuns 증가)
    for (let i = 1; i <= 3; i++) {
      clock.advance(60_000);
      await ontologyModule.recordPatterns(prob.id, { Action: 1, Outcome: 1 });
      const updated = await ontologyModule.incrementResolvedRuns(prob.id);
      expect(updated.resolvedRuns).toBe(i);
      const promoted = await promotionEngine.maybePromote(updated);
      if (i < 3) {
        expect(promoted).toBe(false);
      } else {
        expect(promoted).toBe(true);
      }
    }

    // 최종 상태 확인
    const final = await ontologyModule.read(prob.id);
    expect(final?.resolvedRuns).toBe(3);
    expect(final?.promotedAt).not.toBeNull();
    expect(final?.observedPatterns).toEqual({ Action: 3, Outcome: 3 });

    // 승격 파일 확인
    expect(await userStorage.exists(`ontologies/promoted/bugfix/${prob.id}.yaml`)).toBe(true);
  });

  test("4번째 maybePromote 호출 → no-op (이미 승격)", async () => {
    const ontologyModule = new OntologyModule(projectStorage, clock);
    const promotionEngine = new PromotionEngine(ontologyModule, userStorage, clock);
    const problemStore = new ActiveProblemStore(projectStorage, clock, ontologyModule);
    const prob = await problemStore.create("p", "p", "bugfix");

    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns(prob.id);
    const m3 = (await ontologyModule.read(prob.id))!;
    await promotionEngine.maybePromote(m3);

    const m4 = (await ontologyModule.read(prob.id))!;
    const result = await promotionEngine.maybePromote(m4);
    expect(result).toBe(false);
  });

  test("general-task 기본 템플릿 사용 시 promoted 경로 일치", async () => {
    const ontologyModule = new OntologyModule(projectStorage, clock);
    const promotionEngine = new PromotionEngine(ontologyModule, userStorage, clock);
    const problemStore = new ActiveProblemStore(projectStorage, clock, ontologyModule);
    const prob = await problemStore.create("p", "p"); // templateId 기본값 = general-task

    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns(prob.id);
    const m = (await ontologyModule.read(prob.id))!;
    await promotionEngine.maybePromote(m);
    expect(
      await userStorage.exists(`ontologies/promoted/general-task/${prob.id}.yaml`),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
bun test tests/e2e/epic4-golden-path.test.ts
```

Expected: `3 pass, 0 fail`

- [ ] **Step 3: 전체 회귀 + typecheck**

```bash
bun run typecheck
bun test
```

Expected: typecheck 오류 없음, 0 fail

- [ ] **Step 4: 커밋**

```bash
git add tests/e2e/epic4-golden-path.test.ts
git commit -m "feat(E4-S9): E2E golden path for ontology create → record → promote"
```

---

## 에필로그

모든 스토리 완료 후:

```bash
bun run typecheck
bun test
git log --oneline -12  # E4-S1 ~ E4-S9 확인
```

목표: 기존 299 + Epic 4 ~25 = 320+ 테스트 그린.

다음 단계: Epic 5 (Compaction Survival) 브레인스토밍.
