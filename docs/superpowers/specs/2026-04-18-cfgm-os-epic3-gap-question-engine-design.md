# CFGM-OS Epic 3 — Gap Question Engine 설계 스펙

| 항목 | 값 |
|---|---|
| 스펙 ID | `SPEC-2026-04-18-cfgm-os-epic3` |
| 작성일 | 2026-04-18 |
| 상위 스펙 | [`2026-04-17-cfgm-os-hook-memory-design.md`](./2026-04-17-cfgm-os-hook-memory-design.md) |
| 선행 스펙 | [`2026-04-18-cfgm-os-epic2-flow-graph-design.md`](./2026-04-18-cfgm-os-epic2-flow-graph-design.md) |
| Phase | 3 — Gap Question Engine |
| Epic | 3 |
| 선행 | Phase 1 + Epic 2 완료 ✅ |
| 상태 | Draft → 사용자 리뷰 대기 |

---

## 1. 요약

Flow Graph의 **결손(Gap)을 탐지**하고, **정보 가치(VOI)로 순위**를 매긴 뒤, **질문 1개를 UserPromptSubmit에 주입**하는 레이어. 결손 중 **구조적인 것은 코어가 결정적으로 산출**, **의미적인 것은 Claude가 `/cfgm-process`에서 추가**. Epic 2의 원칙 "지능은 Claude, 결정성은 코어"가 그대로 이어진다.

Epic 2가 "관측을 이해한다"였다면, Epic 3는 "이해의 구멍을 능동적으로 메우러 간다"다.

---

## 2. 핵심 의사결정 로그

| # | 주제 | 결정 | 근거 |
|---|---|---|---|
| E3-D1 | 탐지 주체 분할 | **구조적 Gap = 코어 결정적**, **의미적 Gap = Claude**. VOI 공식은 결정적, 가중치는 `semanticBoost` 필드로 Claude가 주입 | Epic 2 D1 일관성. 하드코딩 의미 해석 배제 |
| E3-D2 | Gap/Question 관계 | **둘 다 1급 블록**. Question이 Gap을 `followsFrom`으로 참조 | 리프레이즈·멀티 질문·Answer 추적 단순화 |
| E3-D3 | 구조적 Gap의 저장 | **delta 로그 없음, projection 단계에서 파생**. 그래프 상태의 함수 | 결손 해소 시 자동 사라짐. Gap 무한 증식 방지 |
| E3-D4 | 의미적 Gap의 저장 | **`block-add` delta + `detectorId: "semantic"`** | Claude의 명시적 판단은 이력 보존 |
| E3-D5 | VOI 계산 시점 | **projection 단계**. 훅 경로에서는 재계산 금지 | 훅 300ms 예산 보호, 결정적 재생성 |
| E3-D6 | Question lifecycle 산출 | **projection이 `asked.jsonl` + supersede 이력을 병합**해 블록 필드로 산출. FlowDelta 스키마 확장 없음 | E2 스키마 안정성 보존. 운영 이력 ≠ 의미 델타 |
| E3-D7 | Answer 인식 | Claude가 `block-supersede`로 Question 마감 + 답변 블록(Evidence/Outcome)의 blockId를 `supersededBy`로 지정 | 기존 스키마로 표현 가능. 규약 최소화 |
| E3-D8 | 중복 억제 기준 | **3단계 결정적 게이트** (questionBlockId / gapBlockId / Gap status). 텍스트 유사도 금지 | 결정성·재현성. 리프레이즈는 Claude가 `block-supersede`로 명시 |
| E3-D9 | 주입 포맷 | UserPromptSubmit stdout, **500B 이내**. cue card(SessionStart)와 별도 예산 | 상위 스펙 §7.10 2KB 한도 내. 사용자 프롬프트 방해 최소 |
| E3-D10 | 주입 동시성 | 여러 세션이 동일 Question asked 경쟁 시 **append-only + post-hoc 중복 제거** (세션별 append, 프로젝션 시 dedup) | JSONL append 원자성. lock 회피 |
| E3-D11 | pending.jsonl 복구 | **손실 시 projection에서 재생성 가능** (순수 파생물). asked.jsonl만 append-only 보존 | 이중 장부 원칙(특허 §4) |
| E3-D12 | 주입 예산 초과 | 질문 label이 500B 초과 시 **주입 스킵 + 경고 로그**. 절단 금지 | Epic 2 D8 "문장 중간 절단 금지" 일관 |

---

## 3. 아키텍처

### 3.1 데이터 흐름

```
[훅 계층, 결정적]
SessionStart (Epic 1+2)
  └─ cue card 주입
UserPromptSubmit
  └─ pending.jsonl[0] 주입 · asked.jsonl append · 이전 턴 bundle seal
PostToolUse (Epic 1+2)
  └─ pending-analysis.jsonl append

[스킬 계층, Claude]
/cfgm-process
  ├─ unprocessed bundles 읽기
  ├─ current-gaps.json 읽기 (구조적 Gap 힌트)
  ├─ 의미적 Gap/Question/Answer 판단
  └─ flow-delta.jsonl에 block-add/supersede/relation-add append

[projection 계층, 결정적]
FlowGraphProjector.project(deltas)
  ├─ 1단계: delta fold → blocks, relations
  ├─ 2단계: GapAnalyzer.analyze(graph) → 구조적 Gap 블록 추가
  ├─ 3단계: VoiScorer.score(graph) → Gap·Question에 voiCached 부여
  ├─ 4단계: QuestionLifecycleResolver → asked.jsonl + supersede 병합
  └─ 5단계: QueueProjector → pending.jsonl · current-gaps.json 재작성
```

경계선: 훅은 **주입·append만**, projection은 **파생물 재계산만**, Claude는 **의미 판단만**.

### 3.2 계층 추가

Epic 2 대비 신규 디렉터리:

```
src/core/gap/
├─ GapAnalyzer.ts            # 탐지기 orchestrator
├─ detectors/
│  ├─ Detector.ts            # 인터페이스
│  ├─ OrphanActionDetector.ts
│  ├─ UnsupportedHypothesisDetector.ts
│  ├─ StaleConfirmedDetector.ts
│  ├─ UncausedProblemDetector.ts
│  ├─ LowConfidenceCriticalDetector.ts
│  ├─ ConflictingOutcomesDetector.ts
│  ├─ DanglingEvidenceDetector.ts
│  └─ UnmitigatedCauseDetector.ts
├─ VoiScorer.ts
├─ QuestionLifecycleResolver.ts
├─ QuestionQueue.ts           # pending.jsonl · asked.jsonl 파일 조작
└─ types.ts                   # Gap, VoiFactors, QuestionLifecycle

src/hooks/user-prompt-submit.ts   # Epic 2 → Epic 3로 주입 로직 확장
src/hooks/post-tool-use.ts         # 변화 없음 (pending queue는 Epic 2와 동일)
```

---

## 4. 데이터 모델 확장

### 4.1 FlowBlock 필드 확장 (optional, type별 의미)

Epic 2의 기존 FlowBlock은 **하위 호환**으로 유지. 추가되는 필드는 모두 optional:

```typescript
export type FlowBlock = {
  // ... Epic 2 기존 필드 유지 ...

  // Gap 블록 전용 (type === "Gap")
  detectorId?: string;        // "rule:orphan-action" | "rule:stale-confirmed" | ... | "semantic"
  subject?: { blockId: string }; // 결손의 대상 블록
  severity?: number;          // 0~1, 규칙별 상수 or Claude 주입
  semanticBoost?: number;     // 0~1, Claude만 설정 가능. VOI 가중 요소

  // Question 블록 전용 (type === "Question")
  gapBlockId?: string;        // 이 질문이 대응하는 Gap (followsFrom relation과 동의)
  lifecycle?: "pending" | "asked" | "answered" | "stale"; // projection 산출
  askedAt?: string | null;
  answeredByBundleId?: string | null;  // projection 산출 (supersede 이력에서)
  answerBlockId?: string | null;       // projection 산출 (supersededBy에서)

  // Gap·Question 공통
  voiCached?: number;         // projection 산출. 0~1
};
```

원칙:
- 훅·코어 결정적 경로는 `detectorId`, `subject`, `severity`(규칙 상수), `voiCached`, `lifecycle`, `askedAt`, `answeredByBundleId`, `answerBlockId`를 계산
- Claude는 `detectorId="semantic"`인 Gap에서 `severity`, `semanticBoost`를 자유 지정. 구조적 필드(`subject`) 위조 금지
- FlowGraphValidator가 type별 필수 필드 검증

### 4.2 구조적 Gap의 blockId 규약

구조적 Gap은 **projection 파생**이므로 delta 로그에 없음. 그러나 Claude가 `/cfgm-process`에서 참조하려면 안정적 식별자가 필요:

```
blockId = `gap:${detectorId}:${subject.blockId}`
예: "gap:rule:orphan-action:blk_action_7"
```

- 결정적 — 동일 (detector, subject) 조합은 항상 동일 blockId
- Claude가 Question block 생성 시 `gapBlockId` 참조 가능
- Gap 해소 시 projection에서 블록 자체가 사라짐 → 참조하는 Question은 `lifecycle="stale"`로 전환

### 4.3 Relation 카탈로그 변경 없음

Epic 2의 5종 relation(`causes`, `evidencedBy`, `mitigatedBy`, `validatedBy`, `followsFrom`) 그대로. Question ↔ Gap은 `followsFrom` 재사용.

---

## 5. 결손 탐지 규칙 (8종)

각 규칙은 `Detector` 인터페이스 구현:

```typescript
export interface Detector {
  readonly id: string;                 // "rule:orphan-action"
  readonly severity: number;           // 규칙별 고정 상수
  detect(graph: FlowGraph): GapCandidate[];
}

export type GapCandidate = {
  detectorId: string;
  subjectBlockId: string;
  severity: number;
  label: string;           // Claude가 읽을 인간 가독 요약 (탐지기가 템플릿으로 생성)
  extra?: Record<string, unknown>;
};
```

등록식: `GapAnalyzer` 생성자가 `Detector[]`를 받아 순회. 테스트·확장·비활성화 가능.

### 5.1 OrphanAction (severity=0.7)

- **판정**: `type==="Action"` AND `status==="confirmed"` AND `relations` 중 `kind==="followsFrom"` 타깃 블록이 `type==="Outcome"`인 것이 하나도 없음
- **label 템플릿**: `"행동 '${action.label}'의 결과가 관측되지 않음"`
- **edge case**: `Outcome` 블록이 `status==="superseded"`인 것은 카운트하지 않음

### 5.2 UnsupportedHypothesis (severity=1.0)

- **판정**: `type==="Hypothesis"` AND `status==="confirmed"` AND 그래프 내 어떤 블록도 `relations`에 `{kind:"evidencedBy", targetBlockId: hypothesis.blockId}`를 갖지 않음
- **label**: `"가설 '${h.label}'에 대한 증거가 없음"`

### 5.3 StaleConfirmed (severity=0.6)

- **판정**: `status==="confirmed"` AND `lastConfirmedAt !== null` AND 다음 조건 중 하나
  - `staleAfter !== null` AND `now > staleAfter` (Claude가 명시적으로 만료 시각 설정한 경우)
  - `staleAfter === null` AND `(now - lastConfirmedAt) > 7일` (기본 TTL)
- `staleAfter`는 Epic 2의 기존 필드(ISO timestamp). 없으면 `FLOW_CONFIG.DEFAULT_STALE_DAYS = 7` 적용
- **label**: `"'${b.label}'의 마지막 확인이 ${days}일 지남"`
- **주의**: `type === "Gap" | "Question"`인 블록은 이 규칙 적용 제외(자기 재귀 방지)

### 5.4 UncausedProblem (severity=0.85)

- **판정**: `type==="Problem"` AND `status==="confirmed"` AND 그래프 내 어떤 블록도 `relations`에 `{kind:"causes", targetBlockId: problem.blockId}`를 갖지 않음
- **label**: `"문제 '${p.label}'의 원인이 미지정"`

### 5.5 LowConfidenceCritical (severity=0.5)

- **판정**: `type ∈ {Hypothesis, Cause, Outcome}` AND `status==="confirmed"` AND `confidence < 0.5`
- **label**: `"${type} '${b.label}' confidence ${b.confidence.toFixed(2)}"`

### 5.6 ConflictingOutcomes (severity=0.9)

- **전제**: Outcome 블록에 optional `polarity: "+" | "-"` 필드(Claude 주입). `null`/없음이면 이 규칙 무시.
- **판정**: 동일 Action에 `followsFrom` 타깃된 Outcome 블록 집합 중 `polarity: "+"`와 `"-"`가 공존
- **subject**: Action blockId (Outcome이 아닌 Action이 주어 — 한 Action의 모순)
- **label**: `"행동 '${a.label}'의 결과가 모순됨(양성/음성 공존)"`

### 5.7 DanglingEvidence (severity=0.4)

- **판정**: `type==="Evidence"` AND `status==="confirmed"` AND 그래프 내 어떤 블록도 `relations`에 `{kind:"evidencedBy", targetBlockId: evidence.blockId}`를 갖지 않음 AND 어떤 블록도 `relations`에 `{kind:"validatedBy", targetBlockId: evidence.blockId}`를 갖지 않음
- **label**: `"증거 '${e.label}'가 어떤 가설과도 연결되지 않음"`

### 5.8 UnmitigatedCause (severity=0.75)

- **판정**: `type==="Cause"` AND `status==="confirmed"` AND 그래프 내 어떤 블록도 `relations`에 `{kind:"mitigatedBy", targetBlockId: cause.blockId}`를 갖지 않음
- **label**: `"원인 '${c.label}'에 대한 대응 행동이 없음"`

### 5.9 탐지기 합성

`GapAnalyzer.analyze(graph)`:
1. 각 detector를 순회하며 `detect(graph)` 호출
2. 결과를 `blockId = "gap:${detectorId}:${subject.blockId}"` 규약으로 변환해 FlowBlock 형태로 만듦
3. 동일 blockId 중복 시 첫 번째만 보존(결정적 순서 = detector 등록 순서)
4. Claude의 의미적 Gap 블록(delta-based, `detectorId="semantic"`)과 병합
5. `graph.blocks`에 추가하여 확장된 그래프 반환

결정적·멱등. 동일 graph → 동일 Gap 집합.

---

## 6. VOI 공식

### 6.1 입력 요인

| 요인 | 계산 | 범위 | 가중치 |
|---|---|---|---|
| `severity` | 규칙 상수 or Claude `semanticBoost` 대체 | 0~1 | 0.35 |
| `centrality` | `(inDegree + outDegree) / max(1, graphAvgDegree*2)` clamp 0~1 | 0~1 | 0.20 |
| `recency` | `1 / (1 + daysSinceLastTouched)`, `lastTouched = max(subject.lastConfirmedAt, subject.createdAt)`. subject 없으면 `gap.createdAt` | 0~1 | 0.15 |
| `confidenceGap` | subject가 있으면 `1 - subject.confidence`, 없으면 `0.5` | 0~1 | 0.15 |
| `semanticBoost` | Claude가 Gap 블록에 주입한 값. 기본 `0` | 0~1 | 0.15 |

합 = 1.0.

### 6.2 공식

```
voi(gap) = 0.35 · severity
         + 0.20 · centrality(subject)
         + 0.15 · recency(subject)
         + 0.15 · confidenceGap(subject)
         + 0.15 · semanticBoost
```

- 결과는 0~1 정규화 (가중치 합이 1이므로 각 입력 0~1이면 출력도 0~1)
- `FLOW_CONFIG.VOI_WEIGHTS`로 상수 집중 관리. 버전 변경 시 재계산 가능한 결정적 파이프라인
- Question 블록의 `voiCached`는 연관 Gap의 VOI를 그대로 전파 (Question은 Gap의 외피)

### 6.3 tie-break 규칙

동일 VOI 시:
1. `createdAt` 이른 것 우선 (오래 기다린 질문 먼저)
2. `blockId` 사전식 오름차순 (완전 결정성 보장)

---

## 7. Question 라이프사이클

### 7.1 상태 전이

```
            block-add (Claude)            UserPromptSubmit 주입
  [없음] ─────────────────────▶ pending ─────────────────────▶ asked
                                   │                             │
                                   │                             │
              Gap superseded       │                             │ block-supersede(supersededBy=answerBlock)
                  ▼                ▼                             ▼
                stale           stale                         answered
```

### 7.2 lifecycle 필드 산출 규칙

projection의 `QuestionLifecycleResolver`가 다음 우선순위로 판정:

1. 해당 Question 블록이 `status==="superseded"` AND `supersededBy !== null` → `answered`, `answerBlockId=supersededBy`, `answeredByBundleId = (supersededBy 블록).bundleId`
2. 해당 Question의 `gapBlockId`로 지정된 Gap이 graph.blocks에 존재하지 않음 (구조적 Gap 해소 or 의미적 Gap supersede됨) → `stale`
3. `asked.jsonl`에 `questionBlockId` 기록 존재 → `asked`, `askedAt = 가장 이른 기록`
4. 그 외 → `pending`

### 7.3 30일 stale 규칙

`lifecycle === "pending"` AND `(now - createdAt) > 30일` → `stale` 강제. `QuestionLifecycleResolver`가 `now`를 주입받아 판정. 테스트에서 FakeClock 주입.

---

## 8. 저장소

### 8.1 프로젝트 레벨

```
$PROJECT_ROOT/.memory-brain/
├─ state/
│  └─ current-gaps.json                     [신규, 파생물]
├─ ledger/
│  └─ questions/
│     ├─ pending.jsonl                      [신규, 파생물]
│     └─ asked.jsonl                        [신규, append-only]
└─ problems/<id>/
   └─ flow-graph.json                       [Epic 2, Gap·Question 블록 포함되도록 확장]
```

### 8.2 파일 스펙

#### `state/current-gaps.json`

전체 문제를 통괄하는 Gap 요약. SessionStart·UserPromptSubmit 경로에서 빠르게 조회:

```json
{
  "generatedAt": "2026-04-18T10:00:00Z",
  "generatorVersion": "gap-analyzer@1.0.0",
  "gaps": [
    {
      "gapBlockId": "gap:rule:orphan-action:blk_action_7",
      "problemId": "prb_auth_bug",
      "detectorId": "rule:orphan-action",
      "subjectBlockId": "blk_action_7",
      "severity": 0.7,
      "voi": 0.63,
      "hasQuestion": true,
      "questionBlockId": "blk_question_3"
    }
  ]
}
```

atomic write (`writeJsonAtomic`). projection 완료 시 재작성.

#### `ledger/questions/pending.jsonl`

주입 후보 큐. 한 줄 = 한 Question:

```json
{"questionBlockId":"blk_question_3","problemId":"prb_auth_bug","gapBlockId":"gap:rule:orphan-action:blk_action_7","label":"src/auth.ts 편집 후 테스트 결과를 공유해줄 수 있어?","voi":0.63,"createdAt":"2026-04-18T10:05:00Z"}
```

- VOI 내림차순 정렬 (동점 시 createdAt 오름차순, blockId 오름차순)
- projection 시 재작성(기존 파일 overwrite). 파일 없으면 빈 파일 생성
- `lifecycle==="pending"`인 Question만 포함

#### `ledger/questions/asked.jsonl`

append-only 히스토리:

```json
{"questionBlockId":"blk_question_3","problemId":"prb_auth_bug","askedAtIso":"2026-04-18T10:06:23Z","sessionId":"sess_a1","promptTurnOrdinal":5}
```

- 훅만 append. projection은 읽기 전용
- 멀티 세션 동시 주입 시 중복 append 가능 — projection이 dedup (동일 questionBlockId 여러 기록 중 가장 이른 askedAtIso 채택)
- 아카이빙: Phase 6 rotation 대상

### 8.3 flow-graph.json 확장

Epic 2 스키마와 동일. Gap·Question 블록이 `blocks` 배열에 섞여 들어감. 새 필드는 optional이라 Epic 2 로더와 호환(모른 필드 무시).

### 8.4 Storage 인터페이스 추가

기존 `readJson`·`writeJsonAtomic`·`appendJsonl`·`readJsonl`로 충분. 신규 메서드 없음.

---

## 9. 프로젝션 알고리즘

`FlowGraphProjector.project(problemId, deltas, asked, now)`:

```
입력: problemId, deltas: FlowDelta[], asked: AskedRecord[], now: Date

1. (Epic 2 로직) deltas를 fold하여 blocks·cueCardMeta 생성
2. GapAnalyzer.analyze(graphSoFar) → gapBlocks[]
3. blocks.push(...gapBlocks)
4. VoiScorer.score(blocks) → Map<blockId, number>
5. QuestionLifecycleResolver.resolve(blocks, asked, now) → Map<questionBlockId, LifecycleFields>
6. 각 Gap/Question 블록에 voiCached 병합
7. 각 Question 블록에 lifecycle·askedAt·answeredByBundleId·answerBlockId 병합
8. 반환: FlowGraph
```

부산물(`QueueProjector`가 프로젝션 직후 생성):
- `pending.jsonl` 재작성 (lifecycle=pending Question만, VOI 정렬)
- `current-gaps.json` 재작성 (모든 Gap 블록 요약)

**결정성**: 동일 (deltas, asked, now) → 동일 그래프·동일 pending.jsonl·동일 current-gaps.json.

**복구**: pending.jsonl·current-gaps.json 소실 시 flow-delta.jsonl + asked.jsonl로 재생성 가능. asked.jsonl 소실 시 라이프사이클 이력만 손실(블록 자체는 보존됨).

---

## 10. 주입 규칙 (UserPromptSubmit 확장)

Epic 2의 UserPromptSubmit은 bundle seal + cue card 미주입(다음 SessionStart에서)만 담당. Epic 3에서 Question 주입 단계 추가:

```
handleUserPromptSubmit(event, deps):
  1. 기존 Epic 2 로직: 이전 턴 bundle seal + 새 턴 open
  2. (신규) current active problemId 확인
  3. (신규) pending.jsonl 읽기
  4. (신규) activeProblemId 일치 + asked.jsonl에 questionBlockId 없는 것 중 첫 번째 선택
  5. (신규) label 바이트 수 체크:
      - > 500B: 주입 스킵, hook-errors.jsonl에 기록
      - <= 500B: stdout에 markdown 주입
  6. (신규) asked.jsonl append
```

stdout 포맷:

```markdown
### 🧠 memory-brain — 확인 질문
> {question.label}

(답변은 다음 /cfgm-process에 반영됩니다)
```

예산: 500B (Epic 2 SessionStart cue card 1500B와 독립). 상위 스펙 2KB 한도 내 분할.

### 10.1 활성 문제 없을 때

`activeProblemId === null` → 주입 스킵. pending.jsonl은 문제별이므로 애초에 매칭 안 됨.

### 10.2 pending 비어 있을 때

주입 스킵. 조용히 통과.

### 10.3 새 문제 전환 직후

Question 블록은 `problemId` 속성을 가지므로, 전환된 문제의 pending만 조회. 이전 문제의 pending Question은 조회 대상 아님.

---

## 11. 중복 억제

### 11.1 3단계 게이트 (주입 시점)

```
after step 3 (pending.jsonl 읽기):
  for each candidate in pending:
    if candidate.questionBlockId in asked.jsonl:
      skip  # gate 1
      continue
    if any other question block with same gapBlockId in asked.jsonl:
      skip  # gate 2
      continue
    # gate 3은 projection에서 이미 처리 (stale Question은 pending에 없음)
    return candidate
  return null  # 모두 스킵됨
```

### 11.2 Gate별 의도

| Gate | 목적 |
|---|---|
| 1. questionBlockId | 같은 Question 재주입 방지 |
| 2. gapBlockId | Claude가 리프레이즈한 중복 질문 방지. 리프레이즈는 `block-supersede`로 명시적 교체해야 함 |
| 3. Gap superseded | pending.jsonl 재작성 시 제외되므로 자동 억제 |

### 11.3 텍스트 유사도 금지

이유: 결정적 판단 불가. 한국어/영어 혼재, 공백·구두점 차이에 취약. Claude가 필요하면 명시적으로 `block-supersede` delta 발행.

---

## 12. Answer 인식

### 12.1 Claude의 책임

`/cfgm-process` 스킬에서 unprocessed bundle을 합성하며:
1. 기존 pending Question 블록 중 "이 번들이 답변하는" 것 식별
2. Evidence/Outcome/Cause 등 답변 블록을 `block-add` (해당 번들을 supportedBy로)
3. Question을 `block-supersede` delta 발행, `supersededBy = 답변 블록.blockId`, `reason = "answered"`

### 12.2 Projection의 산출

`QuestionLifecycleResolver`:
- Question.status === "superseded" AND supersededBy !== null:
  - lifecycle = "answered"
  - answerBlockId = supersededBy
  - answeredByBundleId = lookup(supersededBy).bundleId

### 12.3 스킬 문서 (SKILL.md)에 명시

`/cfgm-process`에 다음 규칙 추가:

- Question 답변 시 반드시 `block-supersede` + `supersededBy` 지정
- 답변 블록과 Question의 `problemId` 일치 강제
- 새 Question 생성 시 `gapBlockId` 필드 필수 (followsFrom relation도 동시 설정)

---

## 13. 엣지 케이스 & 에러 핸들링

### 13.1 순환 참조

- Gap이 Question을 참조하고 Question이 Gap을 참조 → 구조상 불가 (Gap은 type="Gap"만, Question은 type="Question"만 생성됨)
- 의미적 Gap의 subject가 다른 Gap을 가리킴 → FlowGraphValidator가 reject (`subject.blockId`는 Gap/Question type이면 안 됨)

### 13.2 삭제된 블록 참조

- Question의 gapBlockId가 가리키는 Gap이 projection 결과에 없음 → lifecycle="stale"
- Gap의 subjectBlockId가 가리키는 블록이 graph에 없음 → 해당 detector가 애초에 해당 Gap을 산출 안 함 (탐지기가 graph만 보고 동작). 의미적 Gap의 dangling subject → Validator가 `block-add` 시 reject

### 13.3 asked.jsonl 동시 append 중복

- 여러 세션이 동일 Question을 거의 동시에 주입 가능 → asked.jsonl에 중복 레코드
- projection의 resolver가 dedup: 동일 questionBlockId 기록 여러 개 중 가장 이른 askedAtIso 채택
- 중복 주입 자체는 막지 않음 (lock은 훅 300ms 예산 위협)

### 13.4 pending.jsonl 경쟁

- 여러 세션 동시 `/cfgm-process` → 동시 projection → 동시 pending.jsonl overwrite
- writeJsonAtomic 사용 → 원자성 보장. 마지막 쓰기 승
- 미세한 VOI 차이는 다음 projection에서 자기 교정

### 13.5 label 500B 초과

- 주입 스킵 + `security/hook-errors.jsonl`에 `{kind: "question-oversized", questionBlockId, bytes}` 기록
- 절단 금지 — Epic 2 D8 원칙 일관
- Claude가 다음 `/cfgm-process`에서 더 짧은 Question으로 `block-supersede` 권장

### 13.6 탐지기 예외

- 단일 detector가 예외 throw → `GapAnalyzer`가 해당 detector만 skip + `hook-errors.jsonl`에 `{kind: "detector-exception", detectorId, error}` 기록. 나머지 detector는 정상 동작
- 결과: Gap 집합이 부분적으로 줄어듦. 훅 전체는 실패하지 않음

### 13.7 VOI 계산 이상치

- `centrality` 계산 시 graphAvgDegree=0 (블록 0개) → 0.0
- `recency` 계산 시 `daysSinceLastTouched < 0` (시계 역행) → 1.0으로 clamp
- `subject` 없는 Claude 의미적 Gap → `centrality=0.0`, `confidenceGap=0.5`

### 13.8 `status` 충돌

Question 블록의 Epic 2 `status` 필드(`confirmed|superseded`)와 Epic 3 `lifecycle` 필드는 **독립**:
- Question 생성 시 `status="confirmed"`, `lifecycle="pending"`
- 주입 시 `status="confirmed"`, `lifecycle="asked"`
- 답변 시 `status="superseded"`, `lifecycle="answered"`
- 30일 무응답 stale 시 `status="confirmed"`, `lifecycle="stale"` (블록은 살아있음 — 재활성 여지)

### 13.9 새 Claude Code 세션의 기존 질문 보존

- asked.jsonl은 프로젝트 영구 저장 → 세션 재시작해도 중복 주입 안 됨
- projection은 now를 이용해 30일 stale 계산

---

## 14. 테스트 전략

### 14.1 레이어별

| 레이어 | 테스트 유형 | 샘플 수 |
|---|---|---|
| detectors (8종) | 순수 함수 단위 테스트. 최소·양성·음성·edge 케이스 각 1개 | 32+ |
| VoiScorer | 공식 검증, 경계값, 결정적 tie-break | 10+ |
| QuestionLifecycleResolver | 4 상태 각 진입 경로 | 8+ |
| GapAnalyzer | detector 등록·예외 격리·dedup | 5+ |
| QuestionQueue (pending.jsonl 조작) | rebuild·read·동시성 | 6+ |
| FlowGraphProjector 확장 | Epic 2 + Gap 주입 시 불변성 | 5+ |
| UserPromptSubmit 주입 | 3-gate 중복 억제·label 초과·빈 pending | 8+ |
| E2E golden path | Gap 탐지 → Question 생성 → 주입 → 답변 전환 | 2 |

합계 목표: ≥ 76 신규 테스트. Epic 3 라인 커버리지 ≥ 90%.

### 14.2 fixture

- `fixtures/flow-graph/with-orphan-action.json` 등 detector별 최소 그래프
- `fixtures/asked/*.jsonl` 다양한 이력 상태
- `fixtures/e2e/gap-question-cycle.json` 완전 시나리오

### 14.3 결정성 검증

- 동일 입력(FlowGraph + asked + now) → projection 반복 실행 시 byte 동일 결과
- 1 프로젝션 당 `hashSha256(JSON.stringify(graph))` 기록 + 2번째 실행과 비교 테스트

---

## 15. 성능 예산

| 경로 | 예산 | 근거 |
|---|---|---|
| GapAnalyzer.analyze (블록 100개, detector 8종) | < 10ms | O(N·M) 수준, 전부 메모리 연산 |
| VoiScorer.score (블록 100개) | < 5ms | 선형 |
| QuestionLifecycleResolver (블록 100개, asked 1000개) | < 15ms | asked.jsonl 해시맵 사전 구축 |
| UserPromptSubmit 훅 전체 | < 300ms (상위 스펙 §7.2) | 파일 read + append만. 탐지/VOI 재계산 없음 |
| SessionStart cue card + current-gaps 조회 | < 300ms | 파일 2개 read |

Projection은 훅 경로 밖이므로 훅 예산과 독립. Claude `/cfgm-process` 스킬이 apply-delta CLI 호출 → CLI가 projection 실행 → 완료되면 다음 훅부터 최신 pending.jsonl 사용.

---

## 16. 스킬 문서 변경 (`skills/cfgm-process/SKILL.md`)

Epic 2의 SKILL.md에 다음 절 추가:

- **Gap 블록 생성 규칙**: `detectorId="semantic"`, `subject.blockId` 필수, 구조적 Gap(rule:*)은 생성 금지
- **Question 블록 생성 규칙**: type="Question", `gapBlockId` 필수, `followsFrom` relation 동시 설정, label ≤ 500B 권장
- **Answer 기록 규칙**: Question을 `block-supersede`로 마감, `supersededBy`에 답변 블록 blockId, `reason="answered"` 규약
- **리프레이즈 규칙**: 기존 Question을 `block-supersede`로 교체(reason="rephrased") + 새 Question `block-add`. 두 Question의 `gapBlockId` 동일해야 함

---

## 17. 파일 스코프 & 경로 표준

### 17.1 신규 파일 (프로젝트 레벨)

```
.memory-brain/
├─ state/current-gaps.json              [파생, gitignore]
└─ ledger/questions/
   ├─ pending.jsonl                      [파생, gitignore]
   └─ asked.jsonl                        [append-only, gitignore]
```

### 17.2 .gitignore 추가

```gitignore
.memory-brain/memory/state/current-gaps.json
.memory-brain/memory/ledger/questions/
```

### 17.3 기존 파일 변경

- `flow-graph.json` — 스키마 확장(optional 필드)만. 기존 로더 호환
- `skills/cfgm-process/SKILL.md` — Gap/Question 섹션 추가

---

## 18. 에픽 내 스토리 계획 (개요, plan 문서에서 상세화)

| ID | 범위 | 산출물 |
|---|---|---|
| E3-S1 | 데이터 타입 확장 + Validator | `types.ts` 확장 · `FlowGraphValidator` 확장 · 단위 테스트 |
| E3-S2 | Detector 인터페이스 + 8종 구현 | `detectors/*.ts` · detector별 단위 테스트 |
| E3-S3 | GapAnalyzer | detector orchestration · 예외 격리 · blockId 규약 |
| E3-S4 | VoiScorer | VOI 공식 · 경계 · tie-break |
| E3-S5 | QuestionLifecycleResolver | 4 상태 전이 · dedup |
| E3-S6 | FlowGraphProjector 확장 | 기존 + Gap/VOI/lifecycle 병합 · 결정성 테스트 |
| E3-S7 | QuestionQueue (pending.jsonl·current-gaps.json 재작성) | rebuild · 원자성 |
| E3-S8 | UserPromptSubmit 훅 확장 | 3-gate 주입 · 500B 체크 · asked.jsonl append |
| E3-S9 | `/cfgm-process` SKILL.md 확장 | Gap/Question/Answer 규칙 섹션 |
| E3-S10 | CLI 확장 (`cfgm-inspect-graph` Gap 필터, `cfgm-list-gaps`) | CLI 단위 테스트 |
| E3-S11 | E2E golden path | Gap → Question → 주입 → 답변 → lifecycle="answered" 전환 |

스토리 수: 11. Phase 2의 Epic 2 12 스토리와 유사 규모.

---

## 19. 선결정 로그 (구현 중 재토론 금지)

- 탐지 규칙 추가는 Epic 3 종료 후 `core/gap/detectors/` 디렉터리에 새 Detector 구현체 + 등록 배열 수정으로 진행. 기존 스키마 변경 불필요
- VOI 가중치(`FLOW_CONFIG.VOI_WEIGHTS`)는 구현 중 튜닝 가능. 테스트는 가중치 상수에 의존하지 않고 "상대 순위"로 검증(예: gap_a.voi > gap_b.voi)
- Question label 500B 한도는 고정. 400B·1KB 논의 불가 — 변경 시 별도 스펙 업데이트
- 구조적 Gap의 blockId 문자열 규약(`gap:${detectorId}:${subject.blockId}`) 변경 금지 — 스킬 문서·테스트가 의존
- `lifecycle`·`voiCached`는 절대 flow-delta.jsonl에 기록 안 함. 항상 projection 파생

---

## 20. 다음 단계

1. 본 스펙 사용자 리뷰
2. 승인 시 `docs/superpowers/plans/2026-04-18-cfgm-os-epic3-plan.md` 작성 (writing-plans 스킬)
3. plan 승인 시 subagent-driven-development로 11 스토리 순차 구현
