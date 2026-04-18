# Epic 3 Tasks Part 1 — 코어 탐지·스코어링·라이프사이클 (E3-S1 ~ E3-S6)

> 각 스토리는 TDD 엄격 적용. 실패 테스트 → 최소 구현 → 그린 → 커밋.

---

## Task E3-S1: 데이터 타입 확장 + Validator

**Files:**
- Modify: `src/core/flow/types.ts` — FlowBlock에 Gap/Question optional 필드 추가
- Modify: `src/core/flow/config.ts` — VOI_WEIGHTS, DEFAULT_STALE_DAYS 추가
- Modify: `src/core/flow/FlowGraphValidator.ts` — type별 필수 필드 검증 추가
- Create: `src/core/gap/types.ts` — GapCandidate, VoiFactors, QuestionLifecycle
- Create: `src/core/gap/guards.ts` — 가드
- Test: `tests/core/gap/types.test.ts`
- Test: `tests/core/flow/validator.test.ts` (확장)

- [ ] **Step 1: FlowBlock 타입 확장**

Edit `src/core/flow/types.ts` — add optional fields (하위 호환):
```typescript
export type FlowBlock = {
  // ... 기존 Epic 2 필드 유지 ...

  // Gap 전용 (type === "Gap")
  detectorId?: string;
  subject?: { blockId: string };
  severity?: number;
  semanticBoost?: number;

  // Question 전용 (type === "Question")
  gapBlockId?: string;
  lifecycle?: "pending" | "asked" | "answered" | "stale";
  askedAt?: string | null;
  answeredByBundleId?: string | null;
  answerBlockId?: string | null;

  // Gap·Question 공통
  voiCached?: number;

  // Outcome 전용 (polarity, ConflictingOutcomes detector가 읽음)
  polarity?: "+" | "-" | null;
};
```

- [ ] **Step 2: config 확장**

Edit `src/core/flow/config.ts`:
```typescript
export const FLOW_CONFIG = {
  // ... 기존 ...
  DEFAULT_STALE_DAYS: 7,
  QUESTION_PENDING_STALE_DAYS: 30,
  QUESTION_LABEL_MAX_BYTES: 500,
  VOI_WEIGHTS: {
    severity: 0.35,
    centrality: 0.20,
    recency: 0.15,
    confidenceGap: 0.15,
    semanticBoost: 0.15,
  },
} as const;
```

- [ ] **Step 3: Gap 전용 타입**

Write `src/core/gap/types.ts`:
```typescript
export const STRUCTURAL_DETECTOR_IDS = [
  "rule:orphan-action",
  "rule:unsupported-hypothesis",
  "rule:stale-confirmed",
  "rule:uncaused-problem",
  "rule:low-confidence-critical",
  "rule:conflicting-outcomes",
  "rule:dangling-evidence",
  "rule:unmitigated-cause",
] as const;

export type StructuralDetectorId = typeof STRUCTURAL_DETECTOR_IDS[number];
export type DetectorId = StructuralDetectorId | "semantic";

export type GapCandidate = {
  detectorId: DetectorId;
  subjectBlockId: string;
  severity: number;
  label: string;
  extra?: Record<string, unknown>;
};

export type VoiFactors = {
  severity: number;
  centrality: number;
  recency: number;
  confidenceGap: number;
  semanticBoost: number;
};

export type QuestionLifecycle = "pending" | "asked" | "answered" | "stale";

export type AskedRecord = {
  questionBlockId: string;
  problemId: string;
  askedAtIso: string;
  sessionId: string;
  promptTurnOrdinal: number;
};

export type CurrentGapsSnapshot = {
  generatedAt: string;
  generatorVersion: string;
  gaps: Array<{
    gapBlockId: string;
    problemId: string;
    detectorId: DetectorId;
    subjectBlockId: string;
    severity: number;
    voi: number;
    hasQuestion: boolean;
    questionBlockId: string | null;
  }>;
};

export type PendingQuestionRecord = {
  questionBlockId: string;
  problemId: string;
  gapBlockId: string;
  label: string;
  voi: number;
  createdAt: string;
};
```

- [ ] **Step 4: 가드**

Write `src/core/gap/guards.ts`:
```typescript
import { STRUCTURAL_DETECTOR_IDS, type DetectorId, type QuestionLifecycle } from "./types";

const LIFECYCLES: QuestionLifecycle[] = ["pending", "asked", "answered", "stale"];

export function isStructuralDetectorId(v: unknown): boolean {
  return typeof v === "string" && (STRUCTURAL_DETECTOR_IDS as readonly string[]).includes(v);
}

export function isDetectorId(v: unknown): v is DetectorId {
  return isStructuralDetectorId(v) || v === "semantic";
}

export function isQuestionLifecycle(v: unknown): v is QuestionLifecycle {
  return typeof v === "string" && LIFECYCLES.includes(v as QuestionLifecycle);
}
```

- [ ] **Step 5: Validator 확장 — 실패 테스트**

Write `tests/core/flow/validator.test.ts` (추가 케이스):
```typescript
describe("FlowGraphValidator — Epic 3 확장", () => {
  const validator = new FlowGraphValidator();
  const baseBlock = (over = {}) => ({
    blockId: "b1", problemId: "p1", type: "Problem" as const,
    status: "confirmed" as const, label: "x", confidence: 0.8,
    supportedBy: [], relations: [], createdAt: "2026-04-18T00:00:00Z",
    lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
    ...over,
  });

  test("Gap 블록 필수 필드: detectorId, subject", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Gap" }) };
    expect(validator.validateDelta(delta).ok).toBe(false);
  });

  test("Gap 블록에 detectorId·subject 있으면 통과", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Gap", detectorId: "semantic", subject: { blockId: "b2" } }) };
    expect(validator.validateDelta(delta).ok).toBe(true);
  });

  test("Gap 블록의 detectorId는 rule:* 허용 안 함 (delta 경로)", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Gap", detectorId: "rule:orphan-action", subject: { blockId: "b2" } }) };
    expect(validator.validateDelta(delta).ok).toBe(false);
  });

  test("Question 블록 필수 필드: gapBlockId", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Question" }) };
    expect(validator.validateDelta(delta).ok).toBe(false);
  });

  test("Question 블록에 gapBlockId 있으면 통과", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Question", gapBlockId: "gap:semantic:b2" }) };
    expect(validator.validateDelta(delta).ok).toBe(true);
  });

  test("Outcome polarity는 '+' | '-' | null만 허용", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Outcome", polarity: "?" as any }) };
    expect(validator.validateDelta(delta).ok).toBe(false);
  });
});
```

Run: `bun test tests/core/flow/validator.test.ts` → expected FAIL (validator 미확장)

- [ ] **Step 6: Validator 확장**

Edit `src/core/flow/FlowGraphValidator.ts` — `validateDelta(delta)` 내부 `block-add` 케이스에 검증 추가:
```typescript
if (delta.op === "block-add") {
  const b = delta.block;
  // 기존 검증 유지 ...

  if (b.type === "Gap") {
    if (!b.detectorId || !b.subject?.blockId) {
      return { ok: false, reason: "Gap block requires detectorId and subject" };
    }
    if (b.detectorId.startsWith("rule:")) {
      return { ok: false, reason: "Structural Gap (rule:*) cannot be added via delta; they are projection-derived" };
    }
  }
  if (b.type === "Question") {
    if (!b.gapBlockId) {
      return { ok: false, reason: "Question block requires gapBlockId" };
    }
  }
  if (b.type === "Outcome" && b.polarity !== undefined && b.polarity !== null) {
    if (b.polarity !== "+" && b.polarity !== "-") {
      return { ok: false, reason: "Outcome polarity must be '+' | '-' | null" };
    }
  }
}
```

Run: `bun test tests/core/flow/validator.test.ts` → expected PASS

- [ ] **Step 7: Gap types 스모크 테스트**

Write `tests/core/gap/types.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { isStructuralDetectorId, isDetectorId, isQuestionLifecycle } from "../../../src/core/gap/guards";

describe("Gap type guards", () => {
  test("structural ids", () => {
    expect(isStructuralDetectorId("rule:orphan-action")).toBe(true);
    expect(isStructuralDetectorId("rule:unknown")).toBe(false);
  });
  test("semantic is valid detector id but not structural", () => {
    expect(isDetectorId("semantic")).toBe(true);
    expect(isStructuralDetectorId("semantic")).toBe(false);
  });
  test("lifecycle", () => {
    (["pending", "asked", "answered", "stale"] as const).forEach((l) =>
      expect(isQuestionLifecycle(l)).toBe(true));
    expect(isQuestionLifecycle("done")).toBe(false);
  });
});
```

Run: `bun test tests/core/gap/types.test.ts` → expected PASS

- [ ] **Step 8: typecheck + 커밋**

```bash
bun run typecheck
bun test
git add src/core/flow/types.ts src/core/flow/config.ts src/core/flow/FlowGraphValidator.ts \
        src/core/gap/types.ts src/core/gap/guards.ts \
        tests/core/flow/validator.test.ts tests/core/gap/types.test.ts
git commit -m "feat(E3-S1): extend FlowBlock with Gap/Question fields + validator"
```

---

## Task E3-S2: Detector 인터페이스 + 8종 구현

**Files:**
- Create: `src/core/gap/detectors/Detector.ts`
- Create: `src/core/gap/detectors/OrphanActionDetector.ts`
- Create: `src/core/gap/detectors/UnsupportedHypothesisDetector.ts`
- Create: `src/core/gap/detectors/StaleConfirmedDetector.ts`
- Create: `src/core/gap/detectors/UncausedProblemDetector.ts`
- Create: `src/core/gap/detectors/LowConfidenceCriticalDetector.ts`
- Create: `src/core/gap/detectors/ConflictingOutcomesDetector.ts`
- Create: `src/core/gap/detectors/DanglingEvidenceDetector.ts`
- Create: `src/core/gap/detectors/UnmitigatedCauseDetector.ts`
- Test: `tests/core/gap/detectors/*.test.ts` (8 파일)

- [ ] **Step 1: Detector 인터페이스**

Write `src/core/gap/detectors/Detector.ts`:
```typescript
import type { FlowGraph } from "../../flow/types";
import type { GapCandidate } from "../types";
import type { Clock } from "../../clock/Clock";

export interface Detector {
  readonly id: string;
  readonly severity: number;
  detect(graph: FlowGraph, clock: Clock): GapCandidate[];
}
```

- [ ] **Step 2: OrphanActionDetector — 실패 테스트**

Write `tests/core/gap/detectors/orphan-action.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { OrphanActionDetector } from "../../../../src/core/gap/detectors/OrphanActionDetector";
import { FakeClock } from "../../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x", problemId: "p", type: "Action", status: "confirmed", label: "x",
  confidence: 0.8, supportedBy: [], relations: [], createdAt: "2026-04-18T00:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
  ...over,
});

const mkGraph = (blocks: FlowBlock[]): FlowGraph => ({
  problemId: "p", blocks, cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
});

describe("OrphanActionDetector", () => {
  const detector = new OrphanActionDetector();
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("Action with no followsFrom Outcome → gap", () => {
    const graph = mkGraph([mkBlock({ blockId: "a1", type: "Action" })]);
    const gaps = detector.detect(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].subjectBlockId).toBe("a1");
    expect(gaps[0].detectorId).toBe("rule:orphan-action");
  });

  test("Action followsFrom Outcome → no gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "a1", type: "Action",
        relations: [{ kind: "followsFrom", targetBlockId: "o1", confidence: 0.9 }] }),
      mkBlock({ blockId: "o1", type: "Outcome" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("followsFrom Outcome is superseded → gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "a1", type: "Action",
        relations: [{ kind: "followsFrom", targetBlockId: "o1", confidence: 0.9 }] }),
      mkBlock({ blockId: "o1", type: "Outcome", status: "superseded" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(1);
  });

  test("superseded Action is ignored", () => {
    const graph = mkGraph([mkBlock({ blockId: "a1", type: "Action", status: "superseded" })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });
});
```

Run: `bun test tests/core/gap/detectors/orphan-action.test.ts` → expected FAIL

- [ ] **Step 3: OrphanActionDetector 구현**

Write `src/core/gap/detectors/OrphanActionDetector.ts`:
```typescript
import type { Detector } from "./Detector";
import type { FlowGraph } from "../../flow/types";
import type { GapCandidate } from "../types";
import type { Clock } from "../../clock/Clock";

export class OrphanActionDetector implements Detector {
  readonly id = "rule:orphan-action";
  readonly severity = 0.7;

  detect(graph: FlowGraph, _clock: Clock): GapCandidate[] {
    const byId = new Map(graph.blocks.map((b) => [b.blockId, b]));
    const gaps: GapCandidate[] = [];
    for (const a of graph.blocks) {
      if (a.type !== "Action" || a.status !== "confirmed") continue;
      const hasConfirmedOutcome = a.relations.some((r) => {
        if (r.kind !== "followsFrom") return false;
        const target = byId.get(r.targetBlockId);
        return target?.type === "Outcome" && target.status === "confirmed";
      });
      if (!hasConfirmedOutcome) {
        gaps.push({
          detectorId: "rule:orphan-action",
          subjectBlockId: a.blockId,
          severity: this.severity,
          label: `행동 '${a.label}'의 결과가 관측되지 않음`,
        });
      }
    }
    return gaps;
  }
}
```

Run: `bun test tests/core/gap/detectors/orphan-action.test.ts` → expected PASS

- [ ] **Step 4: 나머지 7 detector 반복 (각 TDD)**

각 detector는 동일 패턴: 테스트 → 실패 → 구현 → 그린. 각 4케이스 이상 (양성·음성·edge·상태전이).

상세 판정 로직은 스펙 §5.2~§5.8 참조. 아래는 각 detector 핵심 구현만:

**UnsupportedHypothesisDetector** (severity=1.0):
```typescript
detect(graph: FlowGraph): GapCandidate[] {
  const evidencedBySet = new Set<string>();
  for (const b of graph.blocks) for (const r of b.relations)
    if (r.kind === "evidencedBy") evidencedBySet.add(r.targetBlockId);
  return graph.blocks
    .filter((h) => h.type === "Hypothesis" && h.status === "confirmed" && !evidencedBySet.has(h.blockId))
    .map((h) => ({ detectorId: "rule:unsupported-hypothesis", subjectBlockId: h.blockId,
      severity: this.severity, label: `가설 '${h.label}'에 대한 증거가 없음` }));
}
```

**StaleConfirmedDetector** (severity=0.6):
```typescript
detect(graph: FlowGraph, clock: Clock): GapCandidate[] {
  const now = clock.now().getTime();
  const STALE_MS = FLOW_CONFIG.DEFAULT_STALE_DAYS * 24 * 60 * 60 * 1000;
  const gaps: GapCandidate[] = [];
  for (const b of graph.blocks) {
    if (b.status !== "confirmed" || b.lastConfirmedAt === null) continue;
    if (b.type === "Gap" || b.type === "Question") continue; // 자기 재귀 방지
    const lastMs = new Date(b.lastConfirmedAt).getTime();
    let isStale = false;
    if (b.staleAfter !== null) {
      isStale = now > new Date(b.staleAfter).getTime();
    } else {
      isStale = (now - lastMs) > STALE_MS;
    }
    if (isStale) {
      const days = Math.floor((now - lastMs) / (24 * 60 * 60 * 1000));
      gaps.push({ detectorId: "rule:stale-confirmed", subjectBlockId: b.blockId,
        severity: this.severity, label: `'${b.label}'의 마지막 확인이 ${days}일 지남`,
        extra: { days } });
    }
  }
  return gaps;
}
```

**UncausedProblemDetector** (severity=0.85):
```typescript
detect(graph: FlowGraph): GapCandidate[] {
  const causesSet = new Set<string>();
  for (const b of graph.blocks) for (const r of b.relations)
    if (r.kind === "causes") causesSet.add(r.targetBlockId);
  return graph.blocks
    .filter((p) => p.type === "Problem" && p.status === "confirmed" && !causesSet.has(p.blockId))
    .map((p) => ({ detectorId: "rule:uncaused-problem", subjectBlockId: p.blockId,
      severity: this.severity, label: `문제 '${p.label}'의 원인이 미지정` }));
}
```

**LowConfidenceCriticalDetector** (severity=0.5):
```typescript
detect(graph: FlowGraph): GapCandidate[] {
  const critical = new Set(["Hypothesis", "Cause", "Outcome"]);
  return graph.blocks
    .filter((b) => critical.has(b.type) && b.status === "confirmed" && b.confidence < 0.5)
    .map((b) => ({ detectorId: "rule:low-confidence-critical", subjectBlockId: b.blockId,
      severity: this.severity, label: `${b.type} '${b.label}' confidence ${b.confidence.toFixed(2)}` }));
}
```

**ConflictingOutcomesDetector** (severity=0.9):
```typescript
detect(graph: FlowGraph): GapCandidate[] {
  const byId = new Map(graph.blocks.map((b) => [b.blockId, b]));
  const gaps: GapCandidate[] = [];
  // Action별 followsFrom Outcome 집합
  for (const action of graph.blocks) {
    if (action.type !== "Action" || action.status !== "confirmed") continue;
    const polarities = new Set<string>();
    for (const r of action.relations) {
      if (r.kind !== "followsFrom") continue;
      const t = byId.get(r.targetBlockId);
      if (!t || t.type !== "Outcome" || t.status !== "confirmed") continue;
      if (t.polarity === "+" || t.polarity === "-") polarities.add(t.polarity);
    }
    if (polarities.has("+") && polarities.has("-")) {
      gaps.push({ detectorId: "rule:conflicting-outcomes", subjectBlockId: action.blockId,
        severity: this.severity, label: `행동 '${action.label}'의 결과가 모순됨(양성/음성 공존)` });
    }
  }
  return gaps;
}
```

**DanglingEvidenceDetector** (severity=0.4):
```typescript
detect(graph: FlowGraph): GapCandidate[] {
  const referenced = new Set<string>();
  for (const b of graph.blocks) for (const r of b.relations)
    if (r.kind === "evidencedBy" || r.kind === "validatedBy") referenced.add(r.targetBlockId);
  return graph.blocks
    .filter((e) => e.type === "Evidence" && e.status === "confirmed" && !referenced.has(e.blockId))
    .map((e) => ({ detectorId: "rule:dangling-evidence", subjectBlockId: e.blockId,
      severity: this.severity, label: `증거 '${e.label}'가 어떤 가설과도 연결되지 않음` }));
}
```

**UnmitigatedCauseDetector** (severity=0.75):
```typescript
detect(graph: FlowGraph): GapCandidate[] {
  const mitigatedSet = new Set<string>();
  for (const b of graph.blocks) for (const r of b.relations)
    if (r.kind === "mitigatedBy") mitigatedSet.add(r.targetBlockId);
  return graph.blocks
    .filter((c) => c.type === "Cause" && c.status === "confirmed" && !mitigatedSet.has(c.blockId))
    .map((c) => ({ detectorId: "rule:unmitigated-cause", subjectBlockId: c.blockId,
      severity: this.severity, label: `원인 '${c.label}'에 대한 대응 행동이 없음` }));
}
```

**주의**: `mitigatedBy`는 "X mitigatedBy Y" 의미 = X(Cause)를 Y(Action)가 완화. 즉 Cause의 relations에 mitigatedBy가 있음 (Cause가 주어). 하지만 모델 관례상 "Action mitigatedBy Cause"로 쓸 수도 있음 — 스펙 §4.3 표준 방향: **Cause가 Action을 가리키는 mitigatedBy**. 구현은 "Cause를 타깃으로 가진 mitigatedBy relation"을 찾는 위 코드와 같음(대상이 Cause인 경우). 스펙 §5.8 원문 "`Cause`에 `mitigatedBy` 타깃 Action 없음" 일관.

> ⚠️ 테스트에서 relation 방향 명시 필수: Cause.relations에 `{kind:"mitigatedBy", targetBlockId:action.blockId}` 추가 시 Cause→Action 방향. 위 detector는 `referenced(targetBlockId)` 방식으로 타깃을 셋업. Cause의 blockId가 mitigatedBy relation의 target으로 한 번이라도 쓰이면 pass — 즉 Action.relations에 `{mitigatedBy, target:cause}` 형태 (반대 방향). 방향 혼선 방지를 위해 테스트 코드에서 한 방향만 고정:

**표준 방향**: `Cause.relations: [{ kind: "mitigatedBy", targetBlockId: action.id }]` (Cause→Action).
UnmitigatedCauseDetector는 "어떤 Cause가 mitigatedBy를 통해 Action으로 나가지 못함"을 탐지하도록 수정:

```typescript
detect(graph: FlowGraph): GapCandidate[] {
  const byId = new Map(graph.blocks.map((b) => [b.blockId, b]));
  return graph.blocks
    .filter((c) => c.type === "Cause" && c.status === "confirmed")
    .filter((c) => {
      const mitigators = c.relations.filter((r) => {
        if (r.kind !== "mitigatedBy") return false;
        const t = byId.get(r.targetBlockId);
        return t?.type === "Action" && t.status === "confirmed";
      });
      return mitigators.length === 0;
    })
    .map((c) => ({ detectorId: "rule:unmitigated-cause", subjectBlockId: c.blockId,
      severity: this.severity, label: `원인 '${c.label}'에 대한 대응 행동이 없음` }));
}
```

각 detector마다 위 형태로 테스트 + 구현 커밋:

- [ ] **Step 5: 모든 detector 테스트 그린 + 커밋**

```bash
bun test tests/core/gap/detectors/
bun run typecheck
git add src/core/gap/detectors/ tests/core/gap/detectors/
git commit -m "feat(E3-S2): 8 structural gap detectors with Detector interface"
```

---

## Task E3-S3: GapAnalyzer

**Files:**
- Create: `src/core/gap/GapAnalyzer.ts`
- Test: `tests/core/gap/analyzer.test.ts`

- [ ] **Step 1: 실패 테스트**

Write `tests/core/gap/analyzer.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { GapAnalyzer } from "../../../src/core/gap/GapAnalyzer";
import { OrphanActionDetector } from "../../../src/core/gap/detectors/OrphanActionDetector";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x", problemId: "p", type: "Action", status: "confirmed", label: "x",
  confidence: 0.8, supportedBy: [], relations: [], createdAt: "2026-04-18T00:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd", ...over });

const mkGraph = (blocks: FlowBlock[]): FlowGraph => ({
  problemId: "p", blocks, cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } });

describe("GapAnalyzer", () => {
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("생성한 Gap 블록의 blockId 규약: gap:detectorId:subjectBlockId", () => {
    const analyzer = new GapAnalyzer([new OrphanActionDetector()]);
    const graph = mkGraph([mkBlock({ blockId: "a1", type: "Action" })]);
    const gaps = analyzer.analyze(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].blockId).toBe("gap:rule:orphan-action:a1");
    expect(gaps[0].type).toBe("Gap");
    expect(gaps[0].detectorId).toBe("rule:orphan-action");
    expect(gaps[0].subject?.blockId).toBe("a1");
  });

  test("예외 발생 detector는 격리, 다른 detector는 정상 동작", () => {
    const throwing = { id: "rule:bad", severity: 0.5,
      detect: () => { throw new Error("boom"); } };
    const errors: unknown[] = [];
    const analyzer = new GapAnalyzer([throwing, new OrphanActionDetector()], {
      onError: (e) => errors.push(e),
    });
    const graph = mkGraph([mkBlock({ blockId: "a1", type: "Action" })]);
    const gaps = analyzer.analyze(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  test("의미적 Gap(delta-added)은 analyzer 결과와 병합 가능", () => {
    const analyzer = new GapAnalyzer([new OrphanActionDetector()]);
    const existing = mkBlock({
      blockId: "gap:semantic:x", type: "Gap",
      detectorId: "semantic", subject: { blockId: "x" }, severity: 0.6,
    });
    const graph = mkGraph([existing, mkBlock({ blockId: "a1", type: "Action" })]);
    const gaps = analyzer.analyze(graph, clock);
    // analyzer는 구조적 Gap만 반환; 의미적은 graph.blocks에 이미 있음
    expect(gaps).toHaveLength(1);
    expect(gaps[0].blockId).toBe("gap:rule:orphan-action:a1");
  });

  test("동일 blockId 중복 시 첫 번째만 보존", () => {
    const d1 = { id: "rule:dup", severity: 0.5, detect: () => [
      { detectorId: "rule:dup" as const, subjectBlockId: "x", severity: 0.5, label: "first" }] };
    const d2 = { id: "rule:dup2", severity: 0.5, detect: () => [
      { detectorId: "rule:dup" as const, subjectBlockId: "x", severity: 0.5, label: "second" }] };
    const analyzer = new GapAnalyzer([d1 as any, d2 as any]);
    const gaps = analyzer.analyze(mkGraph([]), clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].label).toBe("first");
  });
});
```

Run: `bun test tests/core/gap/analyzer.test.ts` → expected FAIL

- [ ] **Step 2: 구현**

Write `src/core/gap/GapAnalyzer.ts`:
```typescript
import type { Detector } from "./detectors/Detector";
import type { FlowGraph, FlowBlock } from "../flow/types";
import type { Clock } from "../clock/Clock";

type Options = { onError?: (err: unknown, detectorId: string) => void };

export class GapAnalyzer {
  constructor(
    private readonly detectors: Detector[],
    private readonly options: Options = {},
  ) {}

  analyze(graph: FlowGraph, clock: Clock): FlowBlock[] {
    const seen = new Set<string>();
    const result: FlowBlock[] = [];
    for (const detector of this.detectors) {
      let candidates;
      try {
        candidates = detector.detect(graph, clock);
      } catch (e) {
        this.options.onError?.(e, detector.id);
        continue;
      }
      for (const c of candidates) {
        const blockId = `gap:${c.detectorId}:${c.subjectBlockId}`;
        if (seen.has(blockId)) continue;
        seen.add(blockId);
        const subject = graph.blocks.find((b) => b.blockId === c.subjectBlockId);
        result.push({
          blockId,
          problemId: subject?.problemId ?? graph.problemId,
          type: "Gap",
          status: "confirmed",
          label: c.label,
          confidence: 1.0,
          supportedBy: [],
          relations: [],
          createdAt: clock.isoNow(),
          lastConfirmedAt: clock.isoNow(),
          staleAfter: null,
          supersededBy: null,
          bundleId: "",
          detectorId: c.detectorId,
          subject: { blockId: c.subjectBlockId },
          severity: c.severity,
        });
      }
    }
    return result;
  }
}
```

Run: `bun test tests/core/gap/analyzer.test.ts` → PASS

- [ ] **Step 3: 커밋**

```bash
bun run typecheck && bun test
git add src/core/gap/GapAnalyzer.ts tests/core/gap/analyzer.test.ts
git commit -m "feat(E3-S3): GapAnalyzer orchestration with blockId convention and error isolation"
```

---

## Task E3-S4: VoiScorer

**Files:**
- Create: `src/core/gap/VoiScorer.ts`
- Test: `tests/core/gap/voi-scorer.test.ts`

- [ ] **Step 1: 실패 테스트**

Write `tests/core/gap/voi-scorer.test.ts` — 공식 검증·tie-break·edge:
```typescript
import { describe, test, expect } from "bun:test";
import { VoiScorer } from "../../../src/core/gap/VoiScorer";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x", problemId: "p", type: "Hypothesis", status: "confirmed", label: "x",
  confidence: 0.5, supportedBy: [], relations: [], createdAt: "2026-04-18T10:00:00Z",
  lastConfirmedAt: "2026-04-18T10:00:00Z", staleAfter: null, supersededBy: null, bundleId: "bnd", ...over });

describe("VoiScorer", () => {
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("기본 공식: severity=1 나머지 최소 → 0.35 + 0 + 0.15 + 0 + 0 ≈ 0.5", () => {
    const scorer = new VoiScorer();
    const subject = mkBlock({ blockId: "s", confidence: 1.0 });
    const gap = mkBlock({ blockId: "g", type: "Gap", detectorId: "semantic",
      subject: { blockId: "s" }, severity: 1.0, semanticBoost: 0 });
    const graph: FlowGraph = { problemId: "p", blocks: [subject, gap],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } };
    const voi = scorer.score(gap, graph, clock);
    // severity=1.0 → 0.35, recency=1/(1+0)=1 → 0.15, centrality=0, confidenceGap=0, semanticBoost=0
    expect(voi).toBeCloseTo(0.5, 2);
  });

  test("subject 없는 경우 confidenceGap=0.5", () => {
    const scorer = new VoiScorer();
    const gap = mkBlock({ blockId: "g", type: "Gap", detectorId: "semantic",
      subject: { blockId: "ghost" }, severity: 0, semanticBoost: 0 });
    const graph: FlowGraph = { problemId: "p", blocks: [gap],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } };
    const voi = scorer.score(gap, graph, clock);
    // severity=0, centrality=0, recency=1(=gap.createdAt=now), confidenceGap=0.5, semanticBoost=0
    // = 0 + 0 + 0.15 + 0.075 + 0 = 0.225
    expect(voi).toBeCloseTo(0.225, 3);
  });

  test("recency clamp: 시계 역행 → 1.0", () => {
    const scorer = new VoiScorer();
    const future = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    const gap = mkBlock({ blockId: "g", type: "Gap", detectorId: "semantic",
      subject: { blockId: "s" }, severity: 0, semanticBoost: 0 });
    const subject = mkBlock({ blockId: "s", lastConfirmedAt: "2026-04-18T10:00:00Z" });
    const graph: FlowGraph = { problemId: "p", blocks: [subject, gap],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } };
    const voi = scorer.score(gap, graph, future);
    expect(voi).toBeGreaterThanOrEqual(0.14);
    expect(voi).toBeLessThanOrEqual(0.16);
  });

  test("centrality: 많이 연결된 subject일수록 높음", () => {
    const scorer = new VoiScorer();
    const subject = mkBlock({ blockId: "s",
      relations: [
        { kind: "causes", targetBlockId: "x1", confidence: 0.5 },
        { kind: "causes", targetBlockId: "x2", confidence: 0.5 }] });
    const gap = mkBlock({ blockId: "g", type: "Gap", detectorId: "semantic",
      subject: { blockId: "s" }, severity: 0, semanticBoost: 0 });
    const other1 = mkBlock({ blockId: "o1",
      relations: [{ kind: "causes", targetBlockId: "s", confidence: 0.5 }] });
    const other2 = mkBlock({ blockId: "o2", relations: [] });
    const graph: FlowGraph = { problemId: "p", blocks: [subject, gap, other1, other2],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } };
    const voi = scorer.score(gap, graph, clock);
    expect(voi).toBeGreaterThan(0.15); // centrality 기여분 추가
  });

  test("semanticBoost 1.0 → VOI 약 0.15 상향", () => {
    const scorer = new VoiScorer();
    const subject = mkBlock({ blockId: "s", confidence: 1.0 });
    const base = mkBlock({ blockId: "g1", type: "Gap", detectorId: "semantic",
      subject: { blockId: "s" }, severity: 0, semanticBoost: 0 });
    const boosted = mkBlock({ blockId: "g2", type: "Gap", detectorId: "semantic",
      subject: { blockId: "s" }, severity: 0, semanticBoost: 1 });
    const graph: FlowGraph = { problemId: "p", blocks: [subject, base, boosted],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } };
    expect(scorer.score(boosted, graph, clock) - scorer.score(base, graph, clock)).toBeCloseTo(0.15, 2);
  });

  test("결과 범위 0~1 보장", () => {
    const scorer = new VoiScorer();
    const subject = mkBlock({ blockId: "s" });
    const gap = mkBlock({ blockId: "g", type: "Gap", detectorId: "semantic",
      subject: { blockId: "s" }, severity: 1.0, semanticBoost: 1.0 });
    const graph: FlowGraph = { problemId: "p", blocks: [subject, gap],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false } };
    const voi = scorer.score(gap, graph, clock);
    expect(voi).toBeGreaterThanOrEqual(0);
    expect(voi).toBeLessThanOrEqual(1);
  });
});
```

Run: expected FAIL

- [ ] **Step 2: 구현**

Write `src/core/gap/VoiScorer.ts`:
```typescript
import type { FlowGraph, FlowBlock } from "../flow/types";
import type { Clock } from "../clock/Clock";
import { FLOW_CONFIG } from "../flow/config";

const DAY_MS = 24 * 60 * 60 * 1000;

export class VoiScorer {
  score(gap: FlowBlock, graph: FlowGraph, clock: Clock): number {
    if (gap.type !== "Gap") return 0;

    const w = FLOW_CONFIG.VOI_WEIGHTS;
    const subject = gap.subject ? graph.blocks.find((b) => b.blockId === gap.subject!.blockId) : undefined;

    const severity = clamp01(gap.severity ?? 0);
    const centrality = this.centrality(subject, graph);
    const recency = this.recency(subject ?? gap, clock);
    const confidenceGap = subject ? clamp01(1 - subject.confidence) : 0.5;
    const semanticBoost = clamp01(gap.semanticBoost ?? 0);

    const voi =
      w.severity * severity +
      w.centrality * centrality +
      w.recency * recency +
      w.confidenceGap * confidenceGap +
      w.semanticBoost * semanticBoost;
    return clamp01(voi);
  }

  private centrality(subject: FlowBlock | undefined, graph: FlowGraph): number {
    if (!subject) return 0;
    const outDegree = subject.relations.length;
    const inDegree = graph.blocks.reduce((acc, b) =>
      acc + b.relations.filter((r) => r.targetBlockId === subject.blockId).length, 0);
    const degrees = graph.blocks.map((b) => b.relations.length);
    const avg = degrees.length === 0 ? 0 : degrees.reduce((a, b) => a + b, 0) / degrees.length;
    if (avg === 0) return 0;
    return clamp01((inDegree + outDegree) / (avg * 2));
  }

  private recency(ref: FlowBlock, clock: Clock): number {
    const last = ref.lastConfirmedAt ?? ref.createdAt;
    const lastMs = new Date(last).getTime();
    const nowMs = clock.now().getTime();
    const days = Math.max(0, (nowMs - lastMs) / DAY_MS);
    return 1 / (1 + days);
  }
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
```

Run: expected PASS

- [ ] **Step 3: 커밋**

```bash
bun run typecheck && bun test
git add src/core/gap/VoiScorer.ts tests/core/gap/voi-scorer.test.ts
git commit -m "feat(E3-S4): VOI scorer with 5-factor weighted formula"
```

---

## Task E3-S5: QuestionLifecycleResolver

**Files:**
- Create: `src/core/gap/QuestionLifecycleResolver.ts`
- Test: `tests/core/gap/lifecycle-resolver.test.ts`

- [ ] **Step 1: 실패 테스트**

Write `tests/core/gap/lifecycle-resolver.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { QuestionLifecycleResolver } from "../../../src/core/gap/QuestionLifecycleResolver";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { FlowBlock } from "../../../src/core/flow/types";
import type { AskedRecord } from "../../../src/core/gap/types";

const mkQ = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "q1", problemId: "p", type: "Question", status: "confirmed", label: "?",
  confidence: 1, supportedBy: [], relations: [], createdAt: "2026-04-18T10:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
  gapBlockId: "gap:semantic:s", ...over });

describe("QuestionLifecycleResolver", () => {
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
  const resolver = new QuestionLifecycleResolver();

  test("answered: status=superseded + supersededBy 블록 존재", () => {
    const gap: FlowBlock = { ...mkQ({ blockId: "gap:semantic:s", type: "Gap",
      detectorId: "semantic", subject: { blockId: "s" }, severity: 0.5 }) };
    const answer: FlowBlock = mkQ({ blockId: "ans1", type: "Evidence", bundleId: "bnd_ans" });
    const question = mkQ({ status: "superseded", supersededBy: "ans1" });
    const result = resolver.resolve([question, answer, gap], [], clock);
    expect(result.get("q1")).toEqual({
      lifecycle: "answered", askedAt: null,
      answeredByBundleId: "bnd_ans", answerBlockId: "ans1",
    });
  });

  test("stale: gapBlockId가 graph에 없음", () => {
    const question = mkQ({ gapBlockId: "gap:ghost" });
    const result = resolver.resolve([question], [], clock);
    expect(result.get("q1")?.lifecycle).toBe("stale");
  });

  test("asked: asked.jsonl에 기록 있음", () => {
    const gap: FlowBlock = mkQ({ blockId: "gap:semantic:s", type: "Gap",
      detectorId: "semantic", subject: { blockId: "s" }, severity: 0.5 });
    const question = mkQ();
    const asked: AskedRecord[] = [
      { questionBlockId: "q1", problemId: "p", askedAtIso: "2026-04-18T09:00:00Z",
        sessionId: "sess", promptTurnOrdinal: 3 }];
    const result = resolver.resolve([question, gap], asked, clock);
    expect(result.get("q1")?.lifecycle).toBe("asked");
    expect(result.get("q1")?.askedAt).toBe("2026-04-18T09:00:00Z");
  });

  test("pending: gap 존재, asked 기록 없음", () => {
    const gap: FlowBlock = mkQ({ blockId: "gap:semantic:s", type: "Gap",
      detectorId: "semantic", subject: { blockId: "s" }, severity: 0.5 });
    const question = mkQ();
    const result = resolver.resolve([question, gap], [], clock);
    expect(result.get("q1")?.lifecycle).toBe("pending");
  });

  test("30일 pending 경과 → stale", () => {
    const gap: FlowBlock = mkQ({ blockId: "gap:semantic:s", type: "Gap",
      detectorId: "semantic", subject: { blockId: "s" }, severity: 0.5 });
    const oldQ = mkQ({ createdAt: "2026-03-01T00:00:00Z" });
    const result = resolver.resolve([oldQ, gap], [], clock);
    expect(result.get("q1")?.lifecycle).toBe("stale");
  });

  test("asked.jsonl 중복 → 가장 이른 askedAt 채택", () => {
    const gap: FlowBlock = mkQ({ blockId: "gap:semantic:s", type: "Gap",
      detectorId: "semantic", subject: { blockId: "s" }, severity: 0.5 });
    const question = mkQ();
    const asked: AskedRecord[] = [
      { questionBlockId: "q1", problemId: "p", askedAtIso: "2026-04-18T09:00:00Z",
        sessionId: "s1", promptTurnOrdinal: 1 },
      { questionBlockId: "q1", problemId: "p", askedAtIso: "2026-04-18T08:00:00Z",
        sessionId: "s2", promptTurnOrdinal: 2 }];
    const result = resolver.resolve([question, gap], asked, clock);
    expect(result.get("q1")?.askedAt).toBe("2026-04-18T08:00:00Z");
  });
});
```

Run: expected FAIL

- [ ] **Step 2: 구현**

Write `src/core/gap/QuestionLifecycleResolver.ts`:
```typescript
import type { FlowBlock } from "../flow/types";
import type { Clock } from "../clock/Clock";
import { FLOW_CONFIG } from "../flow/config";
import type { AskedRecord, QuestionLifecycle } from "./types";

export type LifecycleFields = {
  lifecycle: QuestionLifecycle;
  askedAt: string | null;
  answeredByBundleId: string | null;
  answerBlockId: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class QuestionLifecycleResolver {
  resolve(blocks: FlowBlock[], asked: AskedRecord[], clock: Clock): Map<string, LifecycleFields> {
    const byId = new Map(blocks.map((b) => [b.blockId, b]));
    const earliestAsked = new Map<string, AskedRecord>();
    for (const rec of asked) {
      const prev = earliestAsked.get(rec.questionBlockId);
      if (!prev || rec.askedAtIso < prev.askedAtIso) earliestAsked.set(rec.questionBlockId, rec);
    }

    const nowMs = clock.now().getTime();
    const staleMs = FLOW_CONFIG.QUESTION_PENDING_STALE_DAYS * DAY_MS;
    const result = new Map<string, LifecycleFields>();

    for (const q of blocks) {
      if (q.type !== "Question") continue;

      // 1. answered
      if (q.status === "superseded" && q.supersededBy !== null) {
        const answer = byId.get(q.supersededBy);
        result.set(q.blockId, {
          lifecycle: "answered", askedAt: earliestAsked.get(q.blockId)?.askedAtIso ?? null,
          answeredByBundleId: answer?.bundleId ?? null, answerBlockId: q.supersededBy,
        });
        continue;
      }

      // 2. stale via gap missing
      const gapExists = q.gapBlockId ? byId.has(q.gapBlockId) : false;
      if (!gapExists) {
        result.set(q.blockId, {
          lifecycle: "stale", askedAt: earliestAsked.get(q.blockId)?.askedAtIso ?? null,
          answeredByBundleId: null, answerBlockId: null,
        });
        continue;
      }

      // 3. 30일 경과 pending → stale
      const createdMs = new Date(q.createdAt).getTime();
      if ((nowMs - createdMs) > staleMs) {
        const askedRec = earliestAsked.get(q.blockId);
        result.set(q.blockId, {
          lifecycle: "stale", askedAt: askedRec?.askedAtIso ?? null,
          answeredByBundleId: null, answerBlockId: null,
        });
        continue;
      }

      // 4. asked
      const askedRec = earliestAsked.get(q.blockId);
      if (askedRec) {
        result.set(q.blockId, {
          lifecycle: "asked", askedAt: askedRec.askedAtIso,
          answeredByBundleId: null, answerBlockId: null,
        });
        continue;
      }

      // 5. pending
      result.set(q.blockId, {
        lifecycle: "pending", askedAt: null,
        answeredByBundleId: null, answerBlockId: null,
      });
    }
    return result;
  }
}
```

Run: expected PASS

- [ ] **Step 3: 커밋**

```bash
bun run typecheck && bun test
git add src/core/gap/QuestionLifecycleResolver.ts tests/core/gap/lifecycle-resolver.test.ts
git commit -m "feat(E3-S5): Question lifecycle resolver with 4-state transition"
```

---

## Task E3-S6: FlowGraphProjector 확장

**Files:**
- Modify: `src/core/flow/FlowGraphProjector.ts` — analyze + score + resolve 병합
- Test: `tests/core/flow/projector.test.ts` (확장)

- [ ] **Step 1: 실패 테스트**

Append to `tests/core/flow/projector.test.ts`:
```typescript
describe("FlowGraphProjector — Epic 3 확장", () => {
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("구조적 Gap 블록이 projection 결과에 포함됨", () => {
    const projector = new FlowGraphProjector(
      [new OrphanActionDetector()], new VoiScorer(), new QuestionLifecycleResolver());
    const deltas: FlowDelta[] = [
      { op: "block-add", timestampIso: "2026-04-18T00:00:00Z",
        block: { blockId: "a1", problemId: "p", type: "Action", status: "confirmed",
          label: "edit", confidence: 0.8, supportedBy: [], relations: [],
          createdAt: "2026-04-18T00:00:00Z", lastConfirmedAt: null, staleAfter: null,
          supersededBy: null, bundleId: "bnd" } }];
    const graph = projector.project("p", deltas, [], clock);
    const gap = graph.blocks.find((b) => b.type === "Gap");
    expect(gap).toBeDefined();
    expect(gap!.blockId).toBe("gap:rule:orphan-action:a1");
    expect(gap!.voiCached).toBeGreaterThan(0);
  });

  test("의미적 Gap(delta) + 구조적 Gap 공존", () => {
    const projector = new FlowGraphProjector(
      [new OrphanActionDetector()], new VoiScorer(), new QuestionLifecycleResolver());
    const deltas: FlowDelta[] = [
      { op: "block-add", timestampIso: "2026-04-18T00:00:00Z",
        block: { blockId: "a1", problemId: "p", type: "Action", status: "confirmed",
          label: "edit", confidence: 0.8, supportedBy: [], relations: [],
          createdAt: "2026-04-18T00:00:00Z", lastConfirmedAt: null, staleAfter: null,
          supersededBy: null, bundleId: "bnd" } },
      { op: "block-add", timestampIso: "2026-04-18T00:00:01Z",
        block: { blockId: "gap:semantic:a1", problemId: "p", type: "Gap", status: "confirmed",
          label: "의미적 결손", confidence: 1, supportedBy: [], relations: [],
          createdAt: "2026-04-18T00:00:01Z", lastConfirmedAt: null, staleAfter: null,
          supersededBy: null, bundleId: "bnd",
          detectorId: "semantic", subject: { blockId: "a1" }, severity: 0.8 } }];
    const graph = projector.project("p", deltas, [], clock);
    const gaps = graph.blocks.filter((b) => b.type === "Gap");
    expect(gaps).toHaveLength(2);
    expect(gaps.every((g) => g.voiCached !== undefined)).toBe(true);
  });

  test("Question 블록에 lifecycle 병합", () => {
    const projector = new FlowGraphProjector(
      [], new VoiScorer(), new QuestionLifecycleResolver());
    const deltas: FlowDelta[] = [
      { op: "block-add", timestampIso: "2026-04-18T00:00:00Z",
        block: { blockId: "g1", problemId: "p", type: "Gap", status: "confirmed",
          label: "?", confidence: 1, supportedBy: [], relations: [],
          createdAt: "2026-04-18T00:00:00Z", lastConfirmedAt: null, staleAfter: null,
          supersededBy: null, bundleId: "bnd",
          detectorId: "semantic", subject: { blockId: "x" }, severity: 0.5 } },
      { op: "block-add", timestampIso: "2026-04-18T00:00:01Z",
        block: { blockId: "q1", problemId: "p", type: "Question", status: "confirmed",
          label: "증거 있어?", confidence: 1, supportedBy: [], relations: [],
          createdAt: "2026-04-18T00:00:01Z", lastConfirmedAt: null, staleAfter: null,
          supersededBy: null, bundleId: "bnd",
          gapBlockId: "g1" } }];
    const graph = projector.project("p", deltas, [], clock);
    const q = graph.blocks.find((b) => b.blockId === "q1")!;
    expect(q.lifecycle).toBe("pending");
    expect(q.voiCached).toBeDefined();
  });

  test("결정성: 동일 입력 → 동일 출력", () => {
    const projector1 = new FlowGraphProjector(
      [new OrphanActionDetector()], new VoiScorer(), new QuestionLifecycleResolver());
    const projector2 = new FlowGraphProjector(
      [new OrphanActionDetector()], new VoiScorer(), new QuestionLifecycleResolver());
    const deltas: FlowDelta[] = [
      { op: "block-add", timestampIso: "2026-04-18T00:00:00Z",
        block: { blockId: "a1", problemId: "p", type: "Action", status: "confirmed",
          label: "edit", confidence: 0.8, supportedBy: [], relations: [],
          createdAt: "2026-04-18T00:00:00Z", lastConfirmedAt: null, staleAfter: null,
          supersededBy: null, bundleId: "bnd" } }];
    const g1 = projector1.project("p", deltas, [], clock);
    const g2 = projector2.project("p", deltas, [], clock);
    expect(JSON.stringify(g1)).toBe(JSON.stringify(g2));
  });
});
```

Run: expected FAIL (projector가 deps를 안 받음)

- [ ] **Step 2: Projector 확장**

Edit `src/core/flow/FlowGraphProjector.ts`:
```typescript
import type { FlowGraph, FlowBlock, FlowDelta } from "./types";
import type { Clock } from "../clock/Clock";
import type { Detector } from "../gap/detectors/Detector";
import type { VoiScorer } from "../gap/VoiScorer";
import type { QuestionLifecycleResolver } from "../gap/QuestionLifecycleResolver";
import { GapAnalyzer } from "../gap/GapAnalyzer";
import type { AskedRecord } from "../gap/types";

export class FlowGraphProjector {
  private readonly analyzer: GapAnalyzer;
  constructor(
    detectors: Detector[] = [],
    private readonly scorer?: VoiScorer,
    private readonly resolver?: QuestionLifecycleResolver,
  ) {
    this.analyzer = new GapAnalyzer(detectors);
  }

  // 기존 시그니처 유지: project(problemId, deltas). 새 시그니처: project(problemId, deltas, asked, clock)
  project(problemId: string, deltas: FlowDelta[], asked: AskedRecord[] = [], clock?: Clock): FlowGraph {
    // 1. Epic 2 fold 로직 유지
    const base = this.fold(problemId, deltas);

    // 2. 구조적 Gap 추가 (clock 있을 때만)
    if (this.scorer && this.resolver && clock) {
      const structural = this.analyzer.analyze(base, clock);
      base.blocks.push(...structural);

      // 3. Gap·Question에 voiCached 부여
      for (const b of base.blocks) {
        if (b.type === "Gap") b.voiCached = this.scorer.score(b, base, clock);
      }

      // 4. Question lifecycle 병합 + VOI 전파 (Gap의 VOI = Question의 VOI)
      const lifecycles = this.resolver.resolve(base.blocks, asked, clock);
      for (const b of base.blocks) {
        if (b.type === "Question") {
          const lc = lifecycles.get(b.blockId);
          if (lc) {
            b.lifecycle = lc.lifecycle;
            b.askedAt = lc.askedAt;
            b.answeredByBundleId = lc.answeredByBundleId;
            b.answerBlockId = lc.answerBlockId;
          }
          // VOI 전파
          if (b.gapBlockId) {
            const gap = base.blocks.find((g) => g.blockId === b.gapBlockId);
            if (gap?.voiCached !== undefined) b.voiCached = gap.voiCached;
          }
        }
      }
    }
    return base;
  }

  private fold(problemId: string, deltas: FlowDelta[]): FlowGraph {
    // 기존 Epic 2 로직 그대로
    // ... (생략 — 현 파일의 기존 구현 유지)
  }
}
```

> 주의: `fold()`는 기존 Epic 2의 project() 본문을 private 메서드로 추출한 형태. 기존 테스트가 `new FlowGraphProjector()`로 인자 없이 호출하므로 생성자 파라미터 모두 optional.

Run: expected PASS (기존 + 신규 테스트 모두)

- [ ] **Step 3: 기존 호출부 체크 + 커밋**

기존 `bin/cfgm-apply-delta.ts` 등에서 `new FlowGraphProjector()` 호출 — 인자 없는 형태는 여전히 유효. Epic 3 경로에서 detectors/scorer/resolver 주입만 추가.

```bash
bun run typecheck && bun test
git add src/core/flow/FlowGraphProjector.ts tests/core/flow/projector.test.ts
git commit -m "feat(E3-S6): projector merges structural Gap, VOI, Question lifecycle"
```
