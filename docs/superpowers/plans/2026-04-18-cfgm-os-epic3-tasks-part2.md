# Epic 3 Tasks Part 2 — 큐·훅·스킬·CLI·E2E (E3-S7 ~ E3-S11)

> 각 스토리는 TDD 엄격 적용. 실패 테스트 → 최소 구현 → 그린 → 커밋.

---

## Task E3-S7: QuestionQueue

**Files:**
- Create: `src/core/gap/QuestionQueue.ts`
- Test: `tests/core/gap/queue.test.ts`

`pending.jsonl`·`current-gaps.json`·`asked.jsonl` 파일 I/O. projection 직후 `rebuild(graph)` 호출로 파생물 재작성. 훅 경로에서는 `listPending()`·`appendAsked()`만 사용.

- [ ] **Step 1: 실패 테스트**

Write `tests/core/gap/queue.test.ts`:
```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { QuestionQueue } from "../../../src/core/gap/QuestionQueue";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x", problemId: "p", type: "Gap", status: "confirmed", label: "x",
  confidence: 1, supportedBy: [], relations: [], createdAt: "2026-04-18T10:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd", ...over });

describe("QuestionQueue", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let queue: QuestionQueue;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    queue = new QuestionQueue(storage, clock);
  });

  test("빈 graph → 빈 pending, 빈 current-gaps", async () => {
    const graph: FlowGraph = { problemId: "p", blocks: [],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } };
    await queue.rebuild(graph);
    expect(await queue.listPending()).toEqual([]);
    expect((await queue.readCurrentGaps()).gaps).toEqual([]);
  });

  test("pending Question은 VOI 내림차순으로 정렬", async () => {
    const gap1 = mkBlock({ blockId: "g1", detectorId: "semantic",
      subject: { blockId: "s1" }, severity: 0.5, voiCached: 0.4 });
    const gap2 = mkBlock({ blockId: "g2", detectorId: "semantic",
      subject: { blockId: "s2" }, severity: 0.5, voiCached: 0.8 });
    const q1 = mkBlock({ blockId: "q1", type: "Question", label: "Q1",
      gapBlockId: "g1", lifecycle: "pending", voiCached: 0.4 });
    const q2 = mkBlock({ blockId: "q2", type: "Question", label: "Q2",
      gapBlockId: "g2", lifecycle: "pending", voiCached: 0.8 });
    const graph: FlowGraph = { problemId: "p", blocks: [gap1, gap2, q1, q2],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } };
    await queue.rebuild(graph);
    const pending = await queue.listPending();
    expect(pending.map((p) => p.questionBlockId)).toEqual(["q2", "q1"]);
  });

  test("lifecycle!=pending인 Question은 pending에서 제외", async () => {
    const gap = mkBlock({ blockId: "g1", detectorId: "semantic",
      subject: { blockId: "s" }, severity: 0.5, voiCached: 0.5 });
    const asked = mkBlock({ blockId: "q1", type: "Question", label: "asked",
      gapBlockId: "g1", lifecycle: "asked", voiCached: 0.5 });
    const graph: FlowGraph = { problemId: "p", blocks: [gap, asked],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } };
    await queue.rebuild(graph);
    expect(await queue.listPending()).toEqual([]);
  });

  test("tie-break: VOI 동점 → createdAt 오름차순, blockId 오름차순", async () => {
    const gap = mkBlock({ blockId: "g1", detectorId: "semantic",
      subject: { blockId: "s" }, severity: 0.5, voiCached: 0.5 });
    const qA = mkBlock({ blockId: "qA", type: "Question", label: "A",
      gapBlockId: "g1", lifecycle: "pending", voiCached: 0.5,
      createdAt: "2026-04-18T09:00:00Z" });
    const qB = mkBlock({ blockId: "qB", type: "Question", label: "B",
      gapBlockId: "g1", lifecycle: "pending", voiCached: 0.5,
      createdAt: "2026-04-18T08:00:00Z" });
    const graph: FlowGraph = { problemId: "p", blocks: [gap, qA, qB],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } };
    await queue.rebuild(graph);
    const pending = await queue.listPending();
    expect(pending.map((p) => p.questionBlockId)).toEqual(["qB", "qA"]);
  });

  test("current-gaps에 hasQuestion·questionBlockId 반영", async () => {
    const gap = mkBlock({ blockId: "g1", detectorId: "semantic",
      subject: { blockId: "s" }, severity: 0.5, voiCached: 0.5 });
    const q = mkBlock({ blockId: "q1", type: "Question", label: "?",
      gapBlockId: "g1", lifecycle: "pending", voiCached: 0.5 });
    const graph: FlowGraph = { problemId: "p", blocks: [gap, q],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } };
    await queue.rebuild(graph);
    const snap = await queue.readCurrentGaps();
    expect(snap.gaps[0].hasQuestion).toBe(true);
    expect(snap.gaps[0].questionBlockId).toBe("q1");
  });

  test("appendAsked / listAsked", async () => {
    await queue.appendAsked({ questionBlockId: "q1", problemId: "p",
      askedAtIso: "2026-04-18T10:00:00Z", sessionId: "s", promptTurnOrdinal: 1 });
    const asked = await queue.listAsked();
    expect(asked).toHaveLength(1);
    expect(asked[0].questionBlockId).toBe("q1");
  });

  test("rebuild은 기존 pending 덮어씀", async () => {
    const gap = mkBlock({ blockId: "g1", detectorId: "semantic",
      subject: { blockId: "s" }, severity: 0.5, voiCached: 0.5 });
    const q1 = mkBlock({ blockId: "q1", type: "Question", label: "old",
      gapBlockId: "g1", lifecycle: "pending", voiCached: 0.5 });
    await queue.rebuild({ problemId: "p", blocks: [gap, q1],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } });
    expect(await queue.listPending()).toHaveLength(1);

    await queue.rebuild({ problemId: "p", blocks: [],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } });
    expect(await queue.listPending()).toEqual([]);
  });
});
```

Run: expected FAIL

- [ ] **Step 2: 구현**

Write `src/core/gap/QuestionQueue.ts`:
```typescript
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { FlowGraph } from "../flow/types";
import type { AskedRecord, CurrentGapsSnapshot, PendingQuestionRecord } from "./types";

const QUEUE_VERSION = "gap-analyzer@1.0.0";
const PENDING_PATH = "ledger/questions/pending.jsonl";
const ASKED_PATH = "ledger/questions/asked.jsonl";
const CURRENT_GAPS_PATH = "state/current-gaps.json";

export class QuestionQueue {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  async rebuild(graph: FlowGraph): Promise<void> {
    const gaps = graph.blocks.filter((b) => b.type === "Gap");
    const questions = graph.blocks.filter((b) => b.type === "Question");
    const questionByGap = new Map<string, string>();
    for (const q of questions) if (q.gapBlockId) questionByGap.set(q.gapBlockId, q.blockId);

    const snap: CurrentGapsSnapshot = {
      generatedAt: this.clock.isoNow(),
      generatorVersion: QUEUE_VERSION,
      gaps: gaps.map((g) => ({
        gapBlockId: g.blockId,
        problemId: g.problemId,
        detectorId: (g.detectorId ?? "semantic") as CurrentGapsSnapshot["gaps"][number]["detectorId"],
        subjectBlockId: g.subject?.blockId ?? "",
        severity: g.severity ?? 0,
        voi: g.voiCached ?? 0,
        hasQuestion: questionByGap.has(g.blockId),
        questionBlockId: questionByGap.get(g.blockId) ?? null,
      })),
    };
    await this.storage.writeJsonAtomic(CURRENT_GAPS_PATH, snap);

    const pending: PendingQuestionRecord[] = questions
      .filter((q) => q.lifecycle === "pending")
      .map((q) => ({
        questionBlockId: q.blockId,
        problemId: q.problemId,
        gapBlockId: q.gapBlockId ?? "",
        label: q.label,
        voi: q.voiCached ?? 0,
        createdAt: q.createdAt,
      }))
      .sort((a, b) => {
        if (a.voi !== b.voi) return b.voi - a.voi;
        if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
        return a.questionBlockId.localeCompare(b.questionBlockId);
      });

    // JSONL 원자 재작성: tmp 파일 → rewriteJsonl 패턴
    await this.storage.rewriteJsonl(PENDING_PATH, pending as unknown as Array<Record<string, unknown>>);
  }

  async listPending(): Promise<PendingQuestionRecord[]> {
    const rows = await this.storage.readJsonl(PENDING_PATH);
    return rows as unknown as PendingQuestionRecord[];
  }

  async readCurrentGaps(): Promise<CurrentGapsSnapshot> {
    const snap = await this.storage.readJson<CurrentGapsSnapshot>(CURRENT_GAPS_PATH);
    return snap ?? { generatedAt: this.clock.isoNow(), generatorVersion: QUEUE_VERSION, gaps: [] };
  }

  async appendAsked(rec: AskedRecord): Promise<void> {
    await this.storage.appendJsonl(ASKED_PATH, rec as unknown as Record<string, unknown>);
  }

  async listAsked(): Promise<AskedRecord[]> {
    const rows = await this.storage.readJsonl(ASKED_PATH);
    return rows as unknown as AskedRecord[];
  }
}
```

> **참고**: `Storage.rewriteJsonl()`가 기존 인터페이스에 없으면 `src/core/storage/Storage.ts`에 추가:
> ```typescript
> rewriteJsonl(path: string, rows: Array<Record<string, unknown>>): Promise<void>;
> ```
> FsStorage: tmp 파일 → atomic rename. MemoryStorage: Map 교체.

이 메서드가 Epic 1의 `PendingQueue`에서 이미 사용됨 (존재 확인). 부재면 추가.

Run: expected PASS

- [ ] **Step 3: 커밋**

```bash
bun run typecheck && bun test
git add src/core/gap/QuestionQueue.ts tests/core/gap/queue.test.ts
git commit -m "feat(E3-S7): QuestionQueue with pending.jsonl/current-gaps.json/asked.jsonl I/O"
```

---

## Task E3-S8: UserPromptSubmit 훅 확장

**Files:**
- Modify: `src/hooks/user-prompt-submit.ts` — Question 주입 + 3-gate 중복 억제
- Test: `tests/hooks/user-prompt-submit.test.ts` (확장)

- [ ] **Step 1: 실패 테스트**

Append to `tests/hooks/user-prompt-submit.test.ts`:
```typescript
describe("user-prompt-submit — Epic 3 Question 주입", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let queue: QuestionQueue;
  let problemStore: ActiveProblemStore;
  // ... Epic 2 기존 deps 생성 ...

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    queue = new QuestionQueue(storage, clock);
    problemStore = new ActiveProblemStore(storage, clock);
    // ... 나머지 Epic 2 deps ...
  });

  const mkEvent = (): CanonicalEvent => ({
    platform: "claude-code", stage: "prompt-submit", sessionId: "sess1",
    cwd: "/p", timestampIso: clock.isoNow(),
    payload: { stage: "prompt-submit", message: "continue" },
    raw: {}, adapterVersion: "claude-code@1.0",
  });

  test("active problem 있고 pending 상위 1개 있음 → stdout 주입 + asked append", async () => {
    const prob = await problemStore.create("bug", "bug");
    await queue.rebuild({ problemId: prob.id,
      blocks: [
        { blockId: "g1", problemId: prob.id, type: "Gap", status: "confirmed", label: "결손",
          confidence: 1, supportedBy: [], relations: [], createdAt: clock.isoNow(),
          lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "",
          detectorId: "semantic", subject: { blockId: "s" }, severity: 0.5, voiCached: 0.5 },
        { blockId: "q1", problemId: prob.id, type: "Question", status: "confirmed",
          label: "증거를 공유해줘", confidence: 1, supportedBy: [], relations: [],
          createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
          supersededBy: null, bundleId: "", gapBlockId: "g1",
          lifecycle: "pending", voiCached: 0.5 }],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } });

    const out = await handleUserPromptSubmit(mkEvent(), {
      storage, clock, problemStore, queue, ledger, bundler, questionQueue: queue });

    expect(out).toContain("## 🧠 memory-brain — 확인 질문");
    expect(out).toContain("증거를 공유해줘");
    const asked = await queue.listAsked();
    expect(asked).toHaveLength(1);
    expect(asked[0].questionBlockId).toBe("q1");
  });

  test("gate 1 (동일 questionBlockId asked) → 스킵", async () => {
    const prob = await problemStore.create("bug", "bug");
    await queue.appendAsked({ questionBlockId: "q1", problemId: prob.id,
      askedAtIso: clock.isoNow(), sessionId: "prev", promptTurnOrdinal: 1 });
    // pending에 q1 존재 → 주입되면 안 됨
    await queue.rebuild(/* graph with pending q1 */);
    const out = await handleUserPromptSubmit(mkEvent(), { /* deps */ });
    expect(out).not.toContain("확인 질문");
    expect((await queue.listAsked())).toHaveLength(1); // 중복 append 없음
  });

  test("gate 2 (동일 gapBlockId asked) → 스킵", async () => {
    // q1이 이미 asked, q2가 같은 gap을 참조하며 pending → q2도 스킵
  });

  test("label > 500B → 스킵 + hook-errors.jsonl 기록", async () => {
    const bigLabel = "가".repeat(200); // 600B
    // ...
    const out = await handleUserPromptSubmit(mkEvent(), { /* deps */ });
    expect(out).not.toContain("확인 질문");
    const errors = await storage.readJsonl("security/hook-errors.jsonl");
    expect(errors.some((e) => (e as any).kind === "question-oversized")).toBe(true);
  });

  test("active problem 없음 → 주입 스킵", async () => {
    const out = await handleUserPromptSubmit(mkEvent(), { /* deps */ });
    expect(out).not.toContain("확인 질문");
  });

  test("pending 비어 있음 → 주입 스킵", async () => {
    await problemStore.create("bug", "bug");
    const out = await handleUserPromptSubmit(mkEvent(), { /* deps */ });
    expect(out).not.toContain("확인 질문");
  });
});
```

Run: expected FAIL

- [ ] **Step 2: 훅 확장**

Edit `src/hooks/user-prompt-submit.ts`:
```typescript
import type { QuestionQueue } from "../core/gap/QuestionQueue";
import { FLOW_CONFIG } from "../core/flow/config";

export type PromptSubmitDeps = {
  // ... 기존 deps ...
  questionQueue?: QuestionQueue;
};

export async function handleUserPromptSubmit(
  event: CanonicalEvent, deps: PromptSubmitDeps,
): Promise<string> {
  // ... 기존 Epic 2 로직: bundle seal + new turn open + raw append ...

  // Epic 3: Question 주입
  let injection = "";
  if (deps.questionQueue) {
    injection = await injectQuestion(event, deps);
  }

  return existingStdout + injection;
}

async function injectQuestion(event: CanonicalEvent, deps: PromptSubmitDeps): Promise<string> {
  const { questionQueue, problemStore, storage, clock } = deps;
  if (!questionQueue) return "";

  const active = await problemStore.getActive();
  if (!active) return "";

  const pending = await questionQueue.listPending();
  const asked = await questionQueue.listAsked();
  const askedIds = new Set(asked.map((a) => a.questionBlockId));
  const askedGapIds = new Set<string>();
  for (const a of asked) {
    const q = pending.find((p) => p.questionBlockId === a.questionBlockId);
    if (q) askedGapIds.add(q.gapBlockId);
  }
  // asked에만 있고 pending에 없는 Question의 gapBlockId도 포함하려면 별도 index 필요
  // 간단화: pending.jsonl에 남아 있다 = 아직 아무도 asked 안 한 상태. gate 2는 asked 기록을 보고 gapBlockId 역조회.
  // 더 안전한 접근: asked 레코드에 gapBlockId도 담기. 현재 타입 확장.

  for (const cand of pending) {
    if (cand.problemId !== active.id) continue;
    if (askedIds.has(cand.questionBlockId)) continue; // gate 1
    if (askedGapIds.has(cand.gapBlockId)) continue;   // gate 2
    // gate 3은 pending 자체가 stale 제외 (projection 단계에서 해결)

    const label = cand.label;
    const bytes = new TextEncoder().encode(label).length;
    if (bytes > FLOW_CONFIG.QUESTION_LABEL_MAX_BYTES) {
      await storage.appendJsonl("security/hook-errors.jsonl", {
        kind: "question-oversized",
        questionBlockId: cand.questionBlockId,
        bytes,
        at: clock.isoNow(),
      });
      continue;
    }

    await questionQueue.appendAsked({
      questionBlockId: cand.questionBlockId,
      problemId: cand.problemId,
      askedAtIso: clock.isoNow(),
      sessionId: event.sessionId,
      promptTurnOrdinal: /* 현재 턴 ordinal */,
    });

    return `\n\n## 🧠 memory-brain — 확인 질문\n> ${label}\n\n(답변은 다음 /cfgm-process에 반영됩니다)\n`;
  }
  return "";
}
```

> **AskedRecord에 gapBlockId 추가**: gate 2 구현 위해 `src/core/gap/types.ts` `AskedRecord`에 `gapBlockId: string` 필드 추가. QuestionQueue.appendAsked 시 기록, asked.jsonl 읽을 때 바로 사용. 이 변경은 E3-S7 구현 시 포함해야 함 → E3-S7 커밋 전 반영:
> ```typescript
> export type AskedRecord = {
>   questionBlockId: string;
>   gapBlockId: string;    // gate 2 용
>   problemId: string;
>   askedAtIso: string;
>   sessionId: string;
>   promptTurnOrdinal: number;
> };
> ```
> 이 필드 추가 시 E3-S7 테스트도 업데이트 필요. **E3-S7 진행 시 반영**.

Run: expected PASS

- [ ] **Step 3: 커밋**

```bash
bun run typecheck && bun test
git add src/hooks/user-prompt-submit.ts src/core/gap/types.ts \
        src/core/gap/QuestionQueue.ts tests/hooks/user-prompt-submit.test.ts \
        tests/core/gap/queue.test.ts
git commit -m "feat(E3-S8): UserPromptSubmit injects top-VOI pending question with 3-gate dedup"
```

---

## Task E3-S9: `/cfgm-process` SKILL.md 확장

**Files:**
- Modify: `skills/cfgm-process/SKILL.md`

- [ ] **Step 1: Gap/Question/Answer 규칙 섹션 추가**

Append to `skills/cfgm-process/SKILL.md`:
```markdown
## Gap 블록 생성 규칙 (Epic 3)

- `type: "Gap"`, `detectorId: "semantic"` (구조적 `rule:*`는 코어가 자동 산출하므로 생성 금지)
- `subject.blockId` 필수 — 결손의 대상 블록
- `severity`: 0.0~1.0
- `semanticBoost` 선택: 이 Gap이 특히 중요한 경우 0.5~1.0 부여 (VOI 가중)

## Question 블록 생성 규칙 (Epic 3)

- `type: "Question"`, `gapBlockId` 필수 — 대응하는 Gap의 blockId
- `relations: [{ kind: "followsFrom", targetBlockId: <gapBlockId>, confidence: 1.0 }]`
- `label`: 500 바이트 이내 권장. 초과 시 UserPromptSubmit에서 주입 스킵됨
- `problemId`: Gap과 동일해야 함

## Answer 기록 규칙 (Epic 3)

Question에 답변된 bundle을 발견하면:
1. 답변 내용에 대응하는 블록(Evidence/Outcome/Cause 등)을 `block-add`
2. Question을 `block-supersede` delta로 마감: `supersededBy`에 답변 블록의 blockId, `reason: "answered"`
3. 연관 Gap이 해소되었다면 Gap도 `block-supersede` (semantic Gap만. 구조적 Gap은 projection에서 자동 제거됨)

## Question 리프레이즈 규칙 (Epic 3)

- 기존 Question 문구를 바꾸고 싶으면 기존 Question을 `block-supersede`로 교체(`reason: "rephrased"`) + 새 Question `block-add`
- 새 Question의 `gapBlockId`는 기존과 동일해야 함
- 중복 주입 방지를 위해 텍스트 유사도가 아닌 `block-supersede`를 통해 명시적으로 교체
```

- [ ] **Step 2: 커밋**

```bash
git add skills/cfgm-process/SKILL.md
git commit -m "feat(E3-S9): document Gap/Question/Answer rules in cfgm-process skill"
```

---

## Task E3-S10: CLI 확장

**Files:**
- Create: `bin/cfgm-list-gaps.ts`
- Modify: `bin/cfgm-inspect-graph.ts` — `--filter gap|question` 옵션 추가
- Test: `tests/bin/cfgm-gap-cli.test.ts`

- [ ] **Step 1: `cfgm-list-gaps` 실패 테스트**

Write `tests/bin/cfgm-gap-cli.test.ts`:
```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_ENV = (projectDir: string) => ({ ...process.env, CFGM_PROJECT: projectDir });

describe("bin/cfgm-list-gaps", () => {
  let projectDir: string;
  beforeEach(async () => { projectDir = await mkdtemp(join(tmpdir(), "cfgm-gaps-")); });
  afterEach(async () => { await rm(projectDir, { recursive: true, force: true }); });

  test("빈 current-gaps.json → 빈 배열", () => {
    const result = spawnSync("bun", ["run", "bin/cfgm-list-gaps.ts", "--json"], {
      cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8" });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });

  test("current-gaps.json 있으면 reflect", async () => {
    const dir = join(projectDir, ".memory-brain", "state");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "current-gaps.json"), JSON.stringify({
      generatedAt: "2026-04-18T10:00:00Z", generatorVersion: "x",
      gaps: [{ gapBlockId: "gap:semantic:s", problemId: "p", detectorId: "semantic",
        subjectBlockId: "s", severity: 0.5, voi: 0.3, hasQuestion: false, questionBlockId: null }],
    }));
    const result = spawnSync("bun", ["run", "bin/cfgm-list-gaps.ts", "--json"], {
      cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8" });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].gapBlockId).toBe("gap:semantic:s");
  });
});
```

Run: expected FAIL

- [ ] **Step 2: 구현**

Write `bin/cfgm-list-gaps.ts`:
```typescript
#!/usr/bin/env bun
import { resolve } from "node:path";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { QuestionQueue } from "../src/core/gap/QuestionQueue";

const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const storage = new FsStorage(resolve(PROJECT, ".memory-brain"));
const queue = new QuestionQueue(storage, new RealClock());

const args = process.argv.slice(2);
const json = args.includes("--json");
const problemIdx = args.indexOf("--problem");
const problemFilter = problemIdx >= 0 ? args[problemIdx + 1] : undefined;

async function main() {
  const snap = await queue.readCurrentGaps();
  const filtered = problemFilter
    ? snap.gaps.filter((g) => g.problemId === problemFilter)
    : snap.gaps;
  if (json) {
    console.log(JSON.stringify(filtered, null, 2));
  } else {
    for (const g of filtered) {
      console.log(`${g.gapBlockId}  voi=${g.voi.toFixed(2)}  sev=${g.severity.toFixed(2)}  hasQ=${g.hasQuestion}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Run: expected PASS

- [ ] **Step 3: `cfgm-inspect-graph` 확장**

Edit `bin/cfgm-inspect-graph.ts` — `--filter` 옵션 추가:
```typescript
const filterIdx = args.indexOf("--filter");
const filter = filterIdx >= 0 ? args[filterIdx + 1] : undefined;

// ... main() 내부, graph.blocks 출력 전:
let blocks = graph.blocks;
if (filter === "gap") blocks = blocks.filter((b) => b.type === "Gap");
else if (filter === "question") blocks = blocks.filter((b) => b.type === "Question");
```

테스트 추가: `tests/bin/cfgm-flow-cli.test.ts`에 `--filter gap` 케이스.

- [ ] **Step 4: 커밋**

```bash
bun test tests/bin/cfgm-gap-cli.test.ts tests/bin/cfgm-flow-cli.test.ts
bun run typecheck
git add bin/cfgm-list-gaps.ts bin/cfgm-inspect-graph.ts \
        tests/bin/cfgm-gap-cli.test.ts tests/bin/cfgm-flow-cli.test.ts
git commit -m "feat(E3-S10): cfgm-list-gaps CLI and inspect-graph filter option"
```

---

## Task E3-S11: E2E golden path

**Files:**
- Create: `tests/e2e/epic3-golden-path.test.ts`

- [ ] **Step 1: E2E 시나리오**

Write `tests/e2e/epic3-golden-path.test.ts`:
```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
// ... imports: FsStorage, FakeClock, Epic 2 deps ...
import { GapAnalyzer } from "../../src/core/gap/GapAnalyzer";
import { OrphanActionDetector } from "../../src/core/gap/detectors/OrphanActionDetector";
import { UnsupportedHypothesisDetector } from "../../src/core/gap/detectors/UnsupportedHypothesisDetector";
// ... 나머지 6 detector
import { VoiScorer } from "../../src/core/gap/VoiScorer";
import { QuestionLifecycleResolver } from "../../src/core/gap/QuestionLifecycleResolver";
import { QuestionQueue } from "../../src/core/gap/QuestionQueue";

describe("Epic 3 golden path — gap detect → question → inject → answer", () => {
  let projectDir: string;
  let storage: FsStorage;
  let clock: FakeClock;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-e3-"));
    storage = new FsStorage(join(projectDir, ".memory-brain"));
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
  });

  afterEach(async () => { await rm(projectDir, { recursive: true, force: true }); });

  test("full cycle: Action → OrphanAction gap → Question → inject → answer → lifecycle=answered", async () => {
    const detectors = [new OrphanActionDetector(), /* ... 7종 */ ];
    const scorer = new VoiScorer();
    const resolver = new QuestionLifecycleResolver();
    const projector = new FlowGraphProjector(detectors, scorer, resolver);
    const graphStore = new FlowGraphStore(storage, clock);
    const queue = new QuestionQueue(storage, clock);
    const problemStore = new ActiveProblemStore(storage, clock);

    const prob = await problemStore.create("auth bug", "auth");

    // 1. Claude가 Action 블록 add
    const actionDelta: FlowDelta = {
      op: "block-add", timestampIso: clock.isoNow(),
      block: { blockId: "a1", problemId: prob.id, type: "Action", status: "confirmed",
        label: "src/auth.ts 편집", confidence: 0.8, supportedBy: [], relations: [],
        createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
        supersededBy: null, bundleId: "bnd1" } };
    await graphStore.appendDelta(prob.id, actionDelta);

    // 2. projection → OrphanAction gap 산출
    let deltas = await graphStore.readDeltas(prob.id);
    let graph = projector.project(prob.id, deltas, [], clock);
    await queue.rebuild(graph);
    expect(graph.blocks.find((b) => b.type === "Gap")?.blockId).toBe("gap:rule:orphan-action:a1");

    // 3. Claude가 Question block add (gap 참조)
    const qDelta: FlowDelta = {
      op: "block-add", timestampIso: clock.isoNow(),
      block: { blockId: "q1", problemId: prob.id, type: "Question", status: "confirmed",
        label: "src/auth.ts 편집 후 테스트 결과를 공유해줘", confidence: 1,
        supportedBy: [], relations: [{ kind: "followsFrom",
          targetBlockId: "gap:rule:orphan-action:a1", confidence: 1 }],
        createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
        supersededBy: null, bundleId: "bnd1", gapBlockId: "gap:rule:orphan-action:a1" } };
    await graphStore.appendDelta(prob.id, qDelta);

    // 4. 재-projection + rebuild
    deltas = await graphStore.readDeltas(prob.id);
    const asked = await queue.listAsked();
    graph = projector.project(prob.id, deltas, asked, clock);
    await queue.rebuild(graph);
    let pending = await queue.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].questionBlockId).toBe("q1");

    // 5. UserPromptSubmit 훅이 주입
    clock.advance(1000);
    const stdoutInject = await handleUserPromptSubmit({
      platform: "claude-code", stage: "prompt-submit", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: { stage: "prompt-submit", message: "계속" }, raw: {},
      adapterVersion: "claude-code@1.0",
    } as CanonicalEvent, {
      storage, clock, problemStore, queue: /* pending raw queue */, ledger, bundler,
      questionQueue: queue,
    });
    expect(stdoutInject).toContain("확인 질문");
    expect(stdoutInject).toContain("테스트 결과를");
    const askedAfter = await queue.listAsked();
    expect(askedAfter).toHaveLength(1);

    // 6. Claude가 답변 블록 + supersede
    const answerDelta: FlowDelta = {
      op: "block-add", timestampIso: clock.isoNow(),
      block: { blockId: "out1", problemId: prob.id, type: "Outcome", status: "confirmed",
        label: "테스트 통과", confidence: 0.9, supportedBy: ["bnd2"], relations: [],
        createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
        supersededBy: null, bundleId: "bnd2", polarity: "+" } };
    const supersedeDelta: FlowDelta = {
      op: "block-supersede", timestampIso: clock.isoNow(),
      problemId: prob.id, blockId: "q1", supersededBy: "out1", reason: "answered" };
    await graphStore.appendDelta(prob.id, answerDelta);
    await graphStore.appendDelta(prob.id, supersedeDelta);

    // 7. 재-projection → Question lifecycle=answered
    deltas = await graphStore.readDeltas(prob.id);
    graph = projector.project(prob.id, deltas, await queue.listAsked(), clock);
    await queue.rebuild(graph);
    const finalQ = graph.blocks.find((b) => b.blockId === "q1")!;
    expect(finalQ.lifecycle).toBe("answered");
    expect(finalQ.answerBlockId).toBe("out1");
    expect(finalQ.answeredByBundleId).toBe("bnd2");

    // 8. pending.jsonl은 비어 있음
    expect(await queue.listPending()).toHaveLength(0);
  });

  test("stale: 30일 경과 pending Question → lifecycle=stale, pending에서 제외", async () => {
    // ... 비슷한 설정, createdAt을 30일 이전으로 ...
    // 재-projection → lifecycle=stale
  });

  test("결정성: 동일 (deltas, asked, now) → 동일 current-gaps.json", async () => {
    // ... 동일 설정 두 번 projection, byte-identical 검증
  });
});
```

Run: expected FAIL (hooks 확장이 안 된 경우), 모두 그린 시 PASS

- [ ] **Step 2: 커밋**

```bash
bun test tests/e2e/epic3-golden-path.test.ts
bun run typecheck
bun test  # 전체 회귀
git add tests/e2e/epic3-golden-path.test.ts
git commit -m "feat(E3-S11): E2E golden path for gap detection to answered lifecycle"
```

---

## 에필로그 — 최종 검증

모든 스토리 완료 후:

```bash
bun run typecheck
bun test
# 목표: 기존 210 + Epic 3 80+ 테스트 모두 그린, typecheck 깨끗
git log --oneline -15  # E3-S1 ~ E3-S11 + 필요 시 이중 커밋(docs/fix) 확인
```

다음 Epic (Epic 4 Micro Ontology Compiler) 브레인스토밍 진입 조건:
- Epic 3 모든 커밋 green
- `skills/cfgm-process/SKILL.md` Gap/Question/Answer 규칙 섹션 확인
- `/cfgm-process` 실제 호출 시 Gap → Question → Answer 사이클 manual smoke 1회

사용자 승인 시 subagent-driven-development로 E3-S1부터 순차 디스패치.
