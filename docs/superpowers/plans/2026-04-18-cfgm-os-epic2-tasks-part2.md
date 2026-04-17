# Epic 2 Tasks Part 2 — 표현 & 통합 (E2-S7 ~ E2-S12)

> Part 1 완료 후 진행. 훅/CLI/스킬 문서/E2E.

---

## Task E2-S7: CueCardFallback

**Files:**
- Create: `src/core/flow/CueCardFallback.ts`
- Test: `tests/core/flow/cue-card-fallback.test.ts`

- [ ] **Step 1: Write failing test**

Write `tests/core/flow/cue-card-fallback.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { CueCardFallback } from "../../../src/core/flow/CueCardFallback";
import type { ObservationBundle } from "../../../src/core/flow/types";

const mkBundle = (id: string, sealedAt: string, touched: string[] = [], tools: Record<string, number> = {}): ObservationBundle => ({
  bundleId: id, activeProblemId: "p1", sessionId: "s", turnOrdinal: 1,
  openedAt: sealedAt, sealedAt, eventIds: [], observations: [],
  metrics: { toolCallCounts: tools, touchedFiles: touched, bashExit: { success: 0, failure: 0 }, promptCount: 0 },
  recentBlockIds: [], processedAt: null, processedByVersion: null,
});

describe("CueCardFallback", () => {
  const fb = new CueCardFallback();

  test("generate produces YAML front matter + body", () => {
    const bundles = [mkBundle("b1", "2026-04-18T10:00:00Z", ["a.ts"], { "tool:Edit": 2 })];
    const md = fb.generate("p1", "auth bug", bundles);
    expect(md).toContain("---");
    expect(md).toContain("problemId: p1");
    expect(md).toContain("awaitingSynthesis: true");
    expect(md).toContain("pendingBundleCount: 1");
    expect(md).toContain("## 활동 지표");
  });

  test("generate aggregates metrics across bundles", () => {
    const bundles = [
      mkBundle("b1", "2026-04-18T10:00:00Z", ["a.ts", "b.ts"], { "tool:Edit": 1 }),
      mkBundle("b2", "2026-04-18T11:00:00Z", ["a.ts", "c.ts"], { "tool:Bash": 2 }),
    ];
    const md = fb.generate("p1", "bug", bundles);
    expect(md).toContain("a.ts");
    expect(md).toContain("b.ts");
    expect(md).toContain("c.ts");
    expect(md).toContain("tool:Edit");
    expect(md).toContain("tool:Bash");
  });

  test("generate with empty bundles still emits header", () => {
    const md = fb.generate("p1", "t", []);
    expect(md).toContain("pendingBundleCount: 0");
  });

  test("generate never truncates file paths or numbers (no judgement)", () => {
    const veryLongPath = "src/this/is/a/really/long/path/to/file/that/should/never/be/truncated.ts";
    const bundles = [mkBundle("b1", "2026-04-18T10:00:00Z", [veryLongPath], {})];
    const md = fb.generate("p1", "bug", bundles);
    expect(md).toContain(veryLongPath);
  });

  test("generate ranks touched files by frequency", () => {
    const bundles = [
      mkBundle("b1", "2026-04-18T10:00:00Z", ["common.ts", "rare.ts"], {}),
      mkBundle("b2", "2026-04-18T11:00:00Z", ["common.ts"], {}),
      mkBundle("b3", "2026-04-18T12:00:00Z", ["common.ts"], {}),
    ];
    const md = fb.generate("p1", "bug", bundles);
    const commonIdx = md.indexOf("common.ts");
    const rareIdx = md.indexOf("rare.ts");
    expect(commonIdx).toBeGreaterThan(-1);
    expect(rareIdx).toBeGreaterThan(commonIdx);
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

Run: `bun test tests/core/flow/cue-card-fallback.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

Write `src/core/flow/CueCardFallback.ts`:
```typescript
import type { ObservationBundle } from "./types";

export class CueCardFallback {
  generate(problemId: string, problemTitle: string, bundles: ObservationBundle[]): string {
    const fileFreq = new Map<string, number>();
    const toolFreq = new Map<string, number>();
    let totalSuccess = 0, totalFailure = 0, promptCount = 0;
    let lastBundleAt: string | null = null;

    for (const b of bundles) {
      for (const f of b.metrics.touchedFiles) fileFreq.set(f, (fileFreq.get(f) ?? 0) + 1);
      for (const [k, v] of Object.entries(b.metrics.toolCallCounts)) toolFreq.set(k, (toolFreq.get(k) ?? 0) + v);
      totalSuccess += b.metrics.bashExit.success;
      totalFailure += b.metrics.bashExit.failure;
      promptCount += b.metrics.promptCount;
      if (!lastBundleAt || b.sealedAt > lastBundleAt) lastBundleAt = b.sealedAt;
    }

    const fileLines = [...fileFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `  - ${f} (${n}회)`)
      .join("\n");

    const toolLines = [...toolFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `  - ${t}: ${n}`)
      .join("\n");

    const frontMatter = [
      "---",
      `problemId: ${problemId}`,
      `problemTitle: ${JSON.stringify(problemTitle)}`,
      `awaitingSynthesis: true`,
      `pendingBundleCount: ${bundles.length}`,
      `lastBundleAt: ${lastBundleAt ?? "null"}`,
      "---",
    ].join("\n");

    const body = [
      "",
      "## 합성 대기 중",
      `이 문제에 ${bundles.length}개의 ObservationBundle이 미처리 상태입니다. \`/cfgm-process\` 실행 시 Flow Block으로 합성됩니다.`,
      "",
      "## 활동 지표",
      fileLines ? "터치한 파일:" : "터치한 파일 없음",
      fileLines,
      "",
      toolLines ? "도구 호출:" : "도구 호출 없음",
      toolLines,
      "",
      `bash 종료: 성공 ${totalSuccess} · 실패 ${totalFailure}`,
      `프롬프트 수: ${promptCount}`,
    ].filter(l => l !== "").join("\n");

    return frontMatter + "\n" + body + "\n";
  }
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `bun test tests/core/flow/cue-card-fallback.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/flow/CueCardFallback.ts tests/core/flow/cue-card-fallback.test.ts
git commit -m "feat(E2-S7): CueCardFallback with deterministic metrics-only body"
```

---

## Task E2-S8: UserPromptSubmit · SessionEnd 훅 확장 (턴 경계)

**Files:**
- Modify: `src/hooks/user-prompt-submit.ts`
- Modify: `src/hooks/session-end.ts`
- Test: `tests/hooks/user-prompt-submit.test.ts` (확장)
- Test: `tests/hooks/session-end.test.ts` (확장)

- [ ] **Step 1: Write failing test (UserPromptSubmit)**

Add to `tests/hooks/user-prompt-submit.test.ts`:
```typescript
test("seals previous turn and opens new turn", async () => {
  const storage = new MemoryStorage();
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
  const bundler = new ObservationBundler(storage, clock);
  const problemStore = new ActiveProblemStore(storage, clock);
  await problemStore.create("bug", "bug");

  // Open initial turn
  await bundler.openTurn("sess1", (await problemStore.getActive())!.id, 1);

  const deps = {
    storage, clock, problemStore,
    queue: new PendingQueue(storage),
    ledger: new RawLedger(storage, clock),
    bundler,
  };

  const event: CanonicalEvent = {
    platform: "claude-code", stage: "prompt-submit",
    sessionId: "sess1", cwd: "/x", timestampIso: clock.isoNow(),
    payload: { stage: "prompt-submit", message: "next turn" },
    raw: {}, adapterVersion: "claude-code@1.0.0",
  };

  await handleUserPromptSubmit(event, deps);

  // 이전 턴이 봉인되고 새 턴(ordinal=2)이 열려야 함
  const state = await storage.readJson<any>("state/current-turn-sess1.json");
  expect(state?.turnOrdinal).toBe(2);

  const unprocessed = await bundler.listUnprocessed();
  expect(unprocessed).toHaveLength(1);
  expect(unprocessed[0].turnOrdinal).toBe(1);
});
```

- [ ] **Step 2: 구현 — UserPromptSubmit 확장**

Modify `src/hooks/user-prompt-submit.ts`:
```typescript
import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { ObservationBundler } from "../core/flow/ObservationBundler";

export type PromptSubmitDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  queue: PendingQueue;
  ledger: RawLedger;
  bundler: ObservationBundler;
};

export async function handleUserPromptSubmit(
  event: CanonicalEvent,
  deps: PromptSubmitDeps
): Promise<string | null> {
  await deps.ledger.append(event);

  const active = await deps.problemStore.getActive();

  // 이전 턴 봉인 + 새 턴 오픈
  const currentTurnKey = `state/current-turn-${event.sessionId}.json`;
  const currentTurn = await deps.storage.readJson<any>(currentTurnKey);

  if (currentTurn && !currentTurn.closed) {
    // 봉인: 누적된 observation은 pending queue에서 수집
    const pending = await deps.queue.drainForSession(event.sessionId);
    await deps.bundler.sealTurn(event.sessionId, pending.map(p => p.payload as any), []);
  }

  const nextOrdinal = currentTurn?.turnOrdinal ? currentTurn.turnOrdinal + 1 : 1;
  await deps.bundler.openTurn(event.sessionId, active?.id ?? null, nextOrdinal);

  if (!active) return null;

  const lines: string[] = [
    `### 🧠 memory-brain`,
    `**문제:** ${active.title}`,
  ];

  const pendingCount = await deps.queue.count();
  if (pendingCount > 0) {
    const peek = await deps.queue.peek();
    lines.push(`**대기 분석:** ${pendingCount}건`);
    if (peek) lines.push(`최우선: \`${peek.payload.type}\``);
  }

  return lines.join("\n");
}
```

- [ ] **Step 3: PendingQueue에 drainForSession 추가**

Check `src/core/ledger/PendingQueue.ts` — `drainForSession(sessionId)` 메서드가 없다면 추가 (특정 세션의 pending 항목 제거·반환).

```typescript
async drainForSession(sessionId: string): Promise<PendingItem[]> {
  const all = await this.storage.readJsonl<PendingItem>("ledger/pending-analysis.jsonl");
  const mine = all.filter(p => p.sessionId === sessionId);
  const rest = all.filter(p => p.sessionId !== sessionId);
  await this.storage.writeRaw("ledger/pending-analysis.jsonl",
    rest.map(p => JSON.stringify(p)).join("\n") + (rest.length ? "\n" : ""));
  return mine;
}
```

Add minimal test for `drainForSession` in existing `tests/core/ledger/pending-queue.test.ts`.

- [ ] **Step 4: Write failing test (SessionEnd)**

Add to `tests/hooks/session-end.test.ts`:
```typescript
test("seals last open turn", async () => {
  const storage = new MemoryStorage();
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
  const bundler = new ObservationBundler(storage, clock);
  await bundler.openTurn("sess1", "p1", 1);
  // ... rest follows session-end pattern, asserts unprocessed bundle count = 1
});
```

- [ ] **Step 5: 구현 — SessionEnd 확장**

Modify `src/hooks/session-end.ts` to call `bundler.sealTurn(event.sessionId, observations, [])` before the existing logic.

- [ ] **Step 6: Run tests**

Run: `bun test tests/hooks/user-prompt-submit.test.ts tests/hooks/session-end.test.ts tests/core/ledger/pending-queue.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/hooks/user-prompt-submit.ts src/hooks/session-end.ts src/core/ledger/PendingQueue.ts tests/hooks/ tests/core/ledger/pending-queue.test.ts
git commit -m "feat(E2-S8): UserPromptSubmit and SessionEnd seal observation bundles"
```

---

## Task E2-S9: SessionStart 훅 확장 + CueCardInjector

**Files:**
- Create: `src/core/flow/CueCardInjector.ts`
- Modify: `src/hooks/session-start.ts`
- Test: `tests/core/flow/cue-card-injector.test.ts`
- Test: `tests/hooks/session-start.test.ts` (확장)

- [ ] **Step 1: Write failing test (CueCardInjector)**

Write `tests/core/flow/cue-card-injector.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { CueCardInjector } from "../../../src/core/flow/CueCardInjector";

describe("CueCardInjector", () => {
  const inj = new CueCardInjector();

  test("returns full body when under budget", () => {
    const md = "---\nproblemId: p\n---\n\n## A\nshort\n\n## B\nalso short";
    const out = inj.projectForStdout(md, 10_000);
    expect(out).toBe(md);
  });

  test("truncates at section boundary when over budget", () => {
    const body = "## A\n" + "x".repeat(300) + "\n\n## B\n" + "y".repeat(300) + "\n\n## C\n" + "z".repeat(300);
    const md = "---\nproblemId: p\n---\n\n" + body;
    const out = inj.projectForStdout(md, 400);
    expect(out).toContain("## A");
    expect(out).not.toContain("## C");
    expect(out).toContain("섹션");
    expect(out).toContain("생략");
  });

  test("never cuts mid-section", () => {
    const md = "---\n---\n\n## A\n" + "x".repeat(5000);
    const out = inj.projectForStdout(md, 200);
    // A 섹션이 너무 커서 포함 불가 → 프론트매터 + 생략 주석만
    expect(out).not.toContain("xxxxx");
  });

  test("preserves front matter", () => {
    const md = "---\nproblemId: p\nblockCount: 5\n---\n\n## A\n" + "x".repeat(5000);
    const out = inj.projectForStdout(md, 200);
    expect(out).toContain("problemId: p");
    expect(out).toContain("blockCount: 5");
  });
});
```

- [ ] **Step 2: 구현**

Write `src/core/flow/CueCardInjector.ts`:
```typescript
export class CueCardInjector {
  projectForStdout(cueCardMd: string, budgetBytes: number): string {
    const encoder = new TextEncoder();
    if (encoder.encode(cueCardMd).length <= budgetBytes) return cueCardMd;

    const { frontMatter, body } = this.split(cueCardMd);
    const sections = this.splitSections(body);

    const included: string[] = [];
    const budgetForBody = budgetBytes - encoder.encode(frontMatter).length - 100; // reserve for omission comment
    let used = 0;
    let omittedCount = 0;

    for (const sec of sections) {
      const size = encoder.encode(sec).length;
      if (used + size <= budgetForBody) {
        included.push(sec);
        used += size;
      } else {
        omittedCount++;
      }
    }

    const omission = omittedCount > 0
      ? `\n> (섹션 ${omittedCount}개 생략, 풀 뷰: 프로젝트의 \`.memory-brain/problems/<id>/cue-card.md\`)`
      : "";

    return frontMatter + "\n" + included.join("") + omission;
  }

  private split(md: string): { frontMatter: string; body: string } {
    const m = md.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
    if (!m) return { frontMatter: "", body: md };
    return { frontMatter: m[1], body: m[2] };
  }

  private splitSections(body: string): string[] {
    const sections: string[] = [];
    let current = "";
    const lines = body.split("\n");
    for (const line of lines) {
      if (line.startsWith("## ") && current) {
        sections.push(current);
        current = line + "\n";
      } else {
        current += line + "\n";
      }
    }
    if (current) sections.push(current);
    return sections;
  }
}
```

- [ ] **Step 3: Run test to verify PASS**

Run: `bun test tests/core/flow/cue-card-injector.test.ts`
Expected: PASS

- [ ] **Step 4: SessionStart 훅 확장**

Modify `src/hooks/session-start.ts`:
```typescript
import type { CueCardInjector } from "../core/flow/CueCardInjector";
import type { ObservationBundler } from "../core/flow/ObservationBundler";
import type { CueCardFallback } from "../core/flow/CueCardFallback";
import { FLOW_CONFIG } from "../core/flow/config";
// ... existing imports

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

    const cueCardPath = `problems/${active.id}/cue-card.md`;
    let cueCardMd = await deps.storage.readJson<string>(cueCardPath).catch(() => null);
    // cue-card.md는 raw markdown임. readRaw가 필요할 수 있음 → readJson 대신 storage.fileSize와 readJsonl 대체 경로
    // 실제로는 Storage에 readText가 있어야 함. 없으면 여기서 추가.

    const unprocessedBundles = await deps.bundler.listUnprocessed(active.id);

    if (!cueCardMd && unprocessedBundles.length > 0) {
      cueCardMd = deps.fallback.generate(active.id, active.title, unprocessedBundles);
    }

    if (cueCardMd && typeof cueCardMd === "string") {
      const budgetBytes = FLOW_CONFIG.STDOUT_INJECT_BUDGET_KB * 1024;
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
    lines.push(`**대기 분석:** ${pendingCount}건`);
  }

  return lines.join("\n");
}
```

- [ ] **Step 5: Storage 인터페이스에 readText 추가**

`src/core/storage/Storage.ts`:
```typescript
readText(path: string): Promise<string | null>;
```

MemoryStorage/FsStorage 각각:
```typescript
// MemoryStorage
async readText(path: string): Promise<string | null> {
  return this.files.get(path) ?? null;
}
// FsStorage
async readText(path: string): Promise<string | null> {
  try { return await readFile(this.resolve(path), "utf-8"); }
  catch (e: any) { if (e.code === "ENOENT") return null; throw e; }
}
```

Update hook to use `storage.readText(cueCardPath)`. Add contract test for `readText` in `tests/core/storage/storage.contract.test.ts`.

- [ ] **Step 6: SessionStart 테스트 확장 (3 시나리오)**

Add to `tests/hooks/session-start.test.ts`:
```typescript
test("injects cue card when problem active and card exists", async () => { /* ... */ });
test("injects fallback cue card when card missing and bundles pending", async () => { /* ... */ });
test("emits /cfgm-process warning when unprocessed >= 3", async () => { /* ... */ });
```

- [ ] **Step 7: Run tests**

Run: `bun test tests/core/flow/cue-card-injector.test.ts tests/hooks/session-start.test.ts tests/core/storage/`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/core/flow/CueCardInjector.ts src/core/storage/ src/hooks/session-start.ts tests/core/flow/cue-card-injector.test.ts tests/hooks/session-start.test.ts tests/core/storage/
git commit -m "feat(E2-S9): SessionStart cue card injection with section-boundary truncation"
```

---

## Task E2-S10: `/cfgm-process` 스킬 문서

**Files:**
- Create: `skills/cfgm-process/SKILL.md` (기존 파일 업데이트)

- [ ] **Step 1: 기존 스킬 파일 확인**

Run: `cat skills/cfgm-process/SKILL.md`

Epic 1 때 만든 초기 버전이 있으면 이를 확장. 없으면 신규 생성.

- [ ] **Step 2: Write SKILL.md**

Write `skills/cfgm-process/SKILL.md`:
```markdown
---
name: cfgm-process
description: 미처리 ObservationBundle을 Flow Block으로 합성하여 문제의 인과 그래프를 갱신한다. 훅이 자동으로 수행하지 않는 의미 판단 전체가 이 스킬의 책임이다.
---

# /cfgm-process

**역할**: ObservationBundle을 읽고, 의미 있는 Flow Block으로 합성하여 `flow-delta.jsonl`에 커밋. 번들에는 관측의 전문이 보존돼 있으므로 **절단된 요약이 아닌 전체 맥락**을 기반으로 판단한다.

## 실행 절차

### 1. 미처리 번들 목록 조회
\`\`\`bash
bun run bin/cfgm-list-bundles.ts --unprocessed --json
\`\`\`

출력: 번들 메타와 파일 경로 배열. `activeProblemId === null`은 orphan 번들이며 별도 귀속 판단 필요.

### 2. 각 번들 분석

번들 파일을 직접 Read 툴로 읽는다. 각 번들에는:
- `observations`: 이 턴에서 발생한 정규화된 관측 전문 (절단 없음)
- `metrics`: 턴 내 구조적 통계
- `recentBlockIds`: 해당 problem의 최근 블록 (맥락)

### 3. Flow Block 합성 판단

**Block type 13종** (하나만 선택):
- `Problem` / `State` / `Trigger` / `Context` / `Constraint`
- `Cause` / `Hypothesis` / `Action` / `Evidence` / `Outcome`
- `Rule` / `Gap` / `Question`

**판단 원칙**:
- 한 관측이 **여러 블록**을 만들 수 있다 (예: Edit 하나 = Action + Evidence)
- **노이즈면 블록을 만들지 않는다** — 모든 툴 호출이 의미 있는 블록은 아님
- Orphan 번들: 내용을 보고 어느 problem에 귀속할지 판단. 귀속 부적합이면 `discard` 결정

### 4. Confidence 기준표

| 범위 | 기준 |
|---|---|
| `0.9~1.0` | 직접 증거 있음, 재현 완료 |
| `0.7~0.9` | 명시적 증거 있음, 미재현 |
| `0.5~0.7` | 추론, 부분 증거 |
| `0.3~0.5` | 가설, 간접 증거 |
| `< 0.3` | 블록으로 만들지 말고 Question으로 변환 |

### 5. 관계 부착

`relations` 종류:
- `causes` — A → B의 인과
- `evidencedBy` — 근거 관계
- `mitigatedBy` — 완화
- `validatedBy` — 검증
- `followsFrom` — 시간적/논리적 후속

관계는 방향성이 중요. 불필요하게 양방향 만들지 않는다.

### 6. label 작성

- 한 줄 (줄바꿈 없음)
- 의미 보존 (절단 금지)
- 한국어/영어 자유. 검색 가능성 고려

### 7. 델타 커밋

각 블록 · 관계 · cue card 재생성을 FlowDelta로 만들어 stdin으로 파이프:
\`\`\`bash
echo '{"op":"block-add","timestampIso":"...","block":{...}}' | bun run bin/cfgm-apply-delta.ts
\`\`\`

또는 배열로 일괄:
\`\`\`bash
cat delta-batch.json | bun run bin/cfgm-apply-delta.ts
\`\`\`

검증 실패 시 stderr로 이유 출력, exit=1. 스킬은 이를 보고 판단 수정.

### 8. Cue Card 재작성

블록 변경 후 해당 problem의 cue card를 재작성:
- `.memory-brain/problems/<id>/cue-card.md`를 Write 툴로 쓴다
- YAML 프론트매터의 `awaitingSynthesis`를 `false`로
- 바디는 자유 형식이나 기본 섹션: `## 핵심 문제` / `## 원인 사슬` / `## 현재 상태` / `## 남은 결손`
- **soft 예산 4KB 준수**, 6KB 초과 절대 금지
- 재작성 후 `cue-card-regen` 델타로 hash/bytes 기록

### 9. 번들 처리 완료 마킹

\`\`\`bash
bun run bin/cfgm-apply-delta.ts --mark-processed <bundleId>
\`\`\`

모든 번들 처리 완료 후 `bun run bin/cfgm-list-bundles.ts --unprocessed`로 확인.

### 10. 결과 요약

사용자에게 stdout으로:
- 처리한 번들 수
- 추가한 블록 수 (타입별)
- 관계 수
- cue card 재작성 여부
- 이상 상황 (discard, 검증 실패 등)

## 금지 사항

- 번들 관측의 내용을 절단·키워드 매칭 후 type 결정하지 않는다 — 전체 읽고 판단
- Confidence를 임의 고정값(0.5 등)으로 일괄 부여하지 않는다 — 맥락별 판단
- cue card 바디에 시간표·할 일 목록·사용자에 대한 지시를 쓰지 않는다 — 이 스킬은 기술적 지식 저장만 담당
```

- [ ] **Step 3: Commit**

```bash
git add skills/cfgm-process/SKILL.md
git commit -m "feat(E2-S10): /cfgm-process skill doc with synthesis procedure and judgement guidelines"
```

---

## Task E2-S11: CLI 3종

**Files:**
- Create: `bin/cfgm-list-bundles.ts`
- Create: `bin/cfgm-apply-delta.ts`
- Create: `bin/cfgm-inspect-graph.ts`
- Test: `tests/bin/cfgm-flow-cli.test.ts`

- [ ] **Step 1: Write failing test**

Write `tests/bin/cfgm-flow-cli.test.ts`:
```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

describe("bin/cfgm-list-bundles", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-cli-"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("returns empty json array when no bundles", () => {
    const result = spawnSync("bun", ["run", "bin/cfgm-list-bundles.ts", "--unprocessed", "--json"], {
      cwd: process.cwd(),
      env: { ...process.env, CFGM_PROJECT: projectDir },
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });
});

describe("bin/cfgm-apply-delta", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-cli-"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("applies single block-add delta via stdin", () => {
    const delta = {
      op: "block-add", timestampIso: "2026-04-18T00:00:00Z",
      block: { blockId: "b1", problemId: "p1", type: "Cause", status: "confirmed",
        label: "test", confidence: 0.7, supportedBy: [], relations: [],
        createdAt: "2026-04-18T00:00:00Z", lastConfirmedAt: null,
        staleAfter: null, supersededBy: null, bundleId: "bnd" },
    };
    const result = spawnSync("bun", ["run", "bin/cfgm-apply-delta.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, CFGM_PROJECT: projectDir },
      input: JSON.stringify(delta),
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
  });

  test("rejects invalid delta", () => {
    const result = spawnSync("bun", ["run", "bin/cfgm-apply-delta.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, CFGM_PROJECT: projectDir },
      input: '{"op":"invalid"}',
      encoding: "utf-8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("delta");
  });
});

describe("bin/cfgm-inspect-graph", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-cli-"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("returns empty graph when no deltas", () => {
    const result = spawnSync("bun", ["run", "bin/cfgm-inspect-graph.ts", "--problem", "p1", "--format", "json"], {
      cwd: process.cwd(),
      env: { ...process.env, CFGM_PROJECT: projectDir },
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    const graph = JSON.parse(result.stdout);
    expect(graph.blocks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

Run: `bun test tests/bin/cfgm-flow-cli.test.ts`
Expected: FAIL (CLI not found)

- [ ] **Step 3: bin/cfgm-list-bundles.ts 구현**

```typescript
import { resolve } from "node:path";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { ObservationBundler } from "../src/core/flow/ObservationBundler";

const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const storage = new FsStorage(resolve(PROJECT, ".memory-brain"));
const clock = new RealClock();
const bundler = new ObservationBundler(storage, clock);

const args = process.argv.slice(2);
const unprocessed = args.includes("--unprocessed");
const json = args.includes("--json");
const problemIdx = args.indexOf("--problem");
const problemId = problemIdx >= 0 ? args[problemIdx + 1] : undefined;

async function main() {
  if (!unprocessed) {
    console.error("Only --unprocessed is supported in MVP");
    process.exit(1);
  }
  const list = await bundler.listUnprocessed(problemId);
  if (json) {
    console.log(JSON.stringify(list.map(b => ({
      bundleId: b.bundleId,
      activeProblemId: b.activeProblemId,
      sessionId: b.sessionId,
      turnOrdinal: b.turnOrdinal,
      sealedAt: b.sealedAt,
      eventCount: b.observations.length,
    })), null, 2));
  } else {
    for (const b of list) {
      console.log(`${b.bundleId}  problem=${b.activeProblemId ?? "orphan"}  events=${b.observations.length}  ${b.sealedAt}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: bin/cfgm-apply-delta.ts 구현**

```typescript
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { FlowGraphStore } from "../src/core/flow/FlowGraphStore";
import { FlowGraphValidator } from "../src/core/flow/FlowGraphValidator";
import { FlowGraphProjector } from "../src/core/flow/FlowGraphProjector";
import { ObservationBundler } from "../src/core/flow/ObservationBundler";
import type { FlowDelta } from "../src/core/flow/types";

const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const storage = new FsStorage(resolve(PROJECT, ".memory-brain"));
const clock = new RealClock();
const store = new FlowGraphStore(storage, clock);
const validator = new FlowGraphValidator();
const projector = new FlowGraphProjector();
const bundler = new ObservationBundler(storage, clock);

const args = process.argv.slice(2);
const markProcessedIdx = args.indexOf("--mark-processed");
const VERSION = "claude-code@1.0.0";

async function main() {
  if (markProcessedIdx >= 0) {
    const bundleId = args[markProcessedIdx + 1];
    await bundler.markProcessed(bundleId, VERSION);
    console.log(`marked ${bundleId}`);
    return;
  }

  const input = await Bun.stdin.text();
  let parsed: unknown;
  try { parsed = JSON.parse(input); }
  catch (e: any) { console.error("JSON parse error:", e.message); process.exit(1); }

  const deltas: FlowDelta[] = Array.isArray(parsed) ? parsed as FlowDelta[] : [parsed as FlowDelta];

  const problemsTouched = new Set<string>();
  let applied = 0, failed = 0;

  for (const d of deltas) {
    const res = validator.validateDelta(d);
    if (!res.ok) {
      console.error(`delta rejected: ${res.reason}`);
      failed++;
      continue;
    }
    const problemId = deltaProblemId(d);
    await store.appendDelta(problemId, d);
    problemsTouched.add(problemId);
    applied++;
  }

  // 스냅샷 재투영
  for (const pid of problemsTouched) {
    const allDeltas = await store.readDeltas(pid);
    const graph = projector.project(pid, allDeltas);
    await store.writeSnapshot(pid, graph);
  }

  if (failed > 0) {
    console.error(`applied=${applied} failed=${failed}`);
    process.exit(1);
  }
  console.log(`applied=${applied}`);
}

function deltaProblemId(d: FlowDelta): string {
  switch (d.op) {
    case "block-add": return d.block.problemId;
    case "cue-card-regen": return d.problemId;
    case "block-supersede":
    case "relation-add":
      throw new Error(`${d.op} requires problemId in delta (extend schema if needed)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

**스키마 참고**: `block-supersede`와 `relation-add`는 problemId가 필요한데 현재 스키마에 없음. Task E2-S1 스키마에 추가 권장:

```typescript
| { op: "block-supersede"; timestampIso: string; problemId: string; blockId: string; supersededBy: string; reason: string }
| { op: "relation-add"; timestampIso: string; problemId: string; fromBlockId: string; relation: Relation }
```

타입 업데이트 후 가드·Validator·Projector·Store 테스트 모두 조정. **이 수정을 E2-S1 단계에서 반영**(즉 S1 타입 정의에 problemId 포함).

- [ ] **Step 5: bin/cfgm-inspect-graph.ts 구현**

```typescript
import { resolve } from "node:path";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { FlowGraphStore } from "../src/core/flow/FlowGraphStore";
import { FlowGraphProjector } from "../src/core/flow/FlowGraphProjector";

const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const storage = new FsStorage(resolve(PROJECT, ".memory-brain"));
const store = new FlowGraphStore(storage, new RealClock());
const projector = new FlowGraphProjector();

const args = process.argv.slice(2);
const problemIdx = args.indexOf("--problem");
if (problemIdx < 0) { console.error("--problem <id> required"); process.exit(1); }
const problemId = args[problemIdx + 1];
const formatIdx = args.indexOf("--format");
const format = formatIdx >= 0 ? args[formatIdx + 1] : "md";

async function main() {
  const deltas = await store.readDeltas(problemId);
  const graph = projector.project(problemId, deltas);

  if (format === "json") {
    console.log(JSON.stringify(graph, null, 2));
    return;
  }

  // markdown
  console.log(`# Flow Graph: ${problemId}`);
  console.log(`blocks: ${graph.blocks.length}  deltas: ${deltas.length}`);
  console.log();
  for (const b of graph.blocks) {
    console.log(`## ${b.type} ${b.blockId} (${b.status}, c=${b.confidence})`);
    console.log(b.label);
    if (b.relations.length > 0) {
      for (const r of b.relations) console.log(`  → ${r.kind} ${r.targetBlockId} (${r.confidence})`);
    }
    console.log();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Run tests**

Run: `bun test tests/bin/cfgm-flow-cli.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add bin/cfgm-list-bundles.ts bin/cfgm-apply-delta.ts bin/cfgm-inspect-graph.ts tests/bin/cfgm-flow-cli.test.ts
git commit -m "feat(E2-S11): CLI trio for listing bundles, applying deltas, inspecting graph"
```

---

## Task E2-S12: E2E 골든 패스

**Files:**
- Create: `tests/e2e/epic2-golden-path.test.ts`

- [ ] **Step 1: Write comprehensive E2E test**

Write `tests/e2e/epic2-golden-path.test.ts`:
```typescript
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
import type { CanonicalEvent, FlowDelta } from "../../src/core/flow/types";

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
    const queue = new PendingQueue(storage);
    const expirer = new Expirer(storage, clock);
    const redactor = new Redactor(storage);
    const normalizer = new ObservationNormalizer(redactor);
    const bundler = new ObservationBundler(storage, clock);
    const graphStore = new FlowGraphStore(storage, clock);
    const projector = new FlowGraphProjector();
    const validator = new FlowGraphValidator();
    const injector = new CueCardInjector();
    const fallback = new CueCardFallback();

    // 1. 문제 생성
    const prob = await problemStore.create("auth bug", "auth-bug");

    // 2. SessionStart (빈 상태)
    const sessionStartEvent: CanonicalEvent = {
      platform: "claude-code", stage: "session-start", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0.0",
    };
    const s1 = await handleSessionStart(sessionStartEvent, {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback,
    });
    expect(s1).toContain("auth bug");

    // 3. UserPromptSubmit (턴 1 시작)
    clock.advance(1000);
    const prompt1: CanonicalEvent = {
      platform: "claude-code", stage: "prompt-submit", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: { stage: "prompt-submit", message: "auth 오류 고쳐줘" },
      raw: {}, adapterVersion: "claude-code@1.0.0",
    };
    await handleUserPromptSubmit(prompt1, {
      storage, clock, problemStore, queue, ledger, bundler,
    });

    // 4. PostToolUse × 2 (Edit + Bash)
    clock.advance(5000);
    const editEvent: CanonicalEvent = {
      platform: "claude-code", stage: "tool-post", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: { stage: "tool-post", toolName: "Edit", toolInput: { file_path: "src/auth.ts" },
        toolOutput: { success: true }, correlationId: "c1" },
      raw: {}, adapterVersion: "claude-code@1.0.0",
    };
    await handlePostToolUse(editEvent, {
      storage, clock, problemStore, queue, ledger, normalizer,
    });

    clock.advance(3000);
    const bashEvent: CanonicalEvent = {
      platform: "claude-code", stage: "tool-post", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: { stage: "tool-post", toolName: "Bash", toolInput: { command: "bun test" },
        toolOutput: { exitCode: 1, stderr: "FAIL" }, correlationId: "c2" },
      raw: {}, adapterVersion: "claude-code@1.0.0",
    };
    await handlePostToolUse(bashEvent, {
      storage, clock, problemStore, queue, ledger, normalizer,
    });

    // 5. UserPromptSubmit (턴 2 시작 → 턴 1 봉인)
    clock.advance(1000);
    const prompt2: CanonicalEvent = {
      platform: "claude-code", stage: "prompt-submit", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: { stage: "prompt-submit", message: "왜 실패해?" },
      raw: {}, adapterVersion: "claude-code@1.0.0",
    };
    await handleUserPromptSubmit(prompt2, {
      storage, clock, problemStore, queue, ledger, bundler,
    });

    // 6. SessionEnd (턴 2 봉인)
    clock.advance(500);
    await handleSessionEnd({
      platform: "claude-code", stage: "session-end", sessionId: "sess1",
      cwd: projectDir, timestampIso: clock.isoNow(),
      payload: { stage: "session-end" }, raw: {}, adapterVersion: "claude-code@1.0.0",
    } as any, {
      storage, clock, problemStore, ledger, bundler,
    } as any);

    // 7. 번들 2개 확인
    const bundles = await bundler.listUnprocessed(prob.id);
    expect(bundles.length).toBe(2);

    // 8. `/cfgm-process` 시뮬레이션 — Claude가 만들 델타 배열
    const deltas: FlowDelta[] = [
      {
        op: "block-add", timestampIso: clock.isoNow(),
        block: {
          blockId: "blk_action_1", problemId: prob.id, type: "Action",
          status: "confirmed", label: "src/auth.ts 편집",
          confidence: 0.8, supportedBy: [bundles[0].bundleId], relations: [],
          createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
          supersededBy: null, bundleId: bundles[0].bundleId,
        },
      },
      {
        op: "block-add", timestampIso: clock.isoNow(),
        block: {
          blockId: "blk_outcome_1", problemId: prob.id, type: "Outcome",
          status: "confirmed", label: "bun test 실패",
          confidence: 0.9, supportedBy: [bundles[0].bundleId], relations: [],
          createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
          supersededBy: null, bundleId: bundles[0].bundleId,
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

    // 번들 processed 마킹
    for (const b of bundles) await bundler.markProcessed(b.bundleId, "claude-code@1.0.0");

    // 9. 스냅샷 재계산
    const allDeltas = await graphStore.readDeltas(prob.id);
    const graph = projector.project(prob.id, allDeltas);
    await graphStore.writeSnapshot(prob.id, graph);

    expect(graph.blocks).toHaveLength(2);
    expect(graph.blocks.find(b => b.blockId === "blk_action_1")!.relations).toHaveLength(1);
    expect(graph.cueCardMeta.bodyHash).toBe("abc123");

    // 10. cue card 파일 작성 (스킬이 썼다고 가정)
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

    // 11. SessionStart (다시) — 정식 cue card 주입 확인
    clock.advance(1000);
    const s2 = await handleSessionStart(sessionStartEvent, {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback,
    });
    expect(s2).toContain("auth bug");
    expect(s2).toContain("## 핵심 문제");
    expect(s2).not.toContain("합성 대기");  // awaitingSynthesis=false

    // 12. 결정성 재현 검증
    const graph2 = projector.project(prob.id, allDeltas);
    expect(graph2).toEqual(graph);
  });

  test("orphan bundle when no active problem", async () => {
    const problemStore = new ActiveProblemStore(storage, clock);
    const ledger = new RawLedger(storage, clock);
    const queue = new PendingQueue(storage);
    const bundler = new ObservationBundler(storage, clock);

    // active 없음
    await bundler.openTurn("sess1", null, 1);
    await bundler.sealTurn("sess1", [{ type: "user-intent", data: {} } as any], []);

    const orphans = await storage.readJsonl("ledger/orphan-bundles.jsonl");
    expect(orphans.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run E2E test**

Run: `bun test tests/e2e/epic2-golden-path.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 3: 전체 회귀**

Run: `bun test && bun run typecheck`
Expected: 모든 테스트 PASS, 타입체크 클린

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/epic2-golden-path.test.ts
git commit -m "feat(E2-S12): E2E golden path covering bundle -> synthesis -> graph -> cue card"
```

---

## Epic 2 완료 체크

- [ ] 모든 `E2-S*` 스토리 커밋 12개
- [ ] `bun test` 전체 그린
- [ ] `bun run typecheck` 클린
- [ ] 스펙 §10 진척 체크리스트 전부 체크
- [ ] 커밋 로그에 E2-S1 ~ E2-S12 순서대로 존재

다음 단계: Epic 3(Gap Question Engine) 브레인스톰.
