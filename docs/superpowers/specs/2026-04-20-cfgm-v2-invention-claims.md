# CFGM-OS v2 Invention Claims — 신규 청구항 및 선행기술 분석

작성: 2026-04-20
근거: T6 보고서(patent-worker), T5 synthesizer 주문 #1 (compaction-surviving causal graph → independent)
관련 RFC: `2026-04-20-cfgm-v2-rfc.md §10`

---

## 0. 개요

본 문서는 CFGM-OS v2의 **1% 발명 요소**를 기존 PRD §16의 4개 청구점을 **초과하는** 형태로 청구항 초안화한 것이다.

**Critic 주문 #1 수용**: **compaction-surviving causal graph를 independent claim으로 승격**, Claim I(orphan bundle)·Claim II(multi-detector VOI)·Claim III(delta-fold projector)·Claim IV(identity-aligned VOI)는 dependent로 재조합.

이는 PRD §16의 4개 청구 중 유일한 실측 독점이 **compaction-surviving causal state** 이기 때문이다 (T5 Adversary A5 분석: hook-native problem graph / gap-driven completion / dual-ledger는 선행기술과 부분 충돌).

발명성 규칙(team.md §1% 발명 요소 도출 규칙):
1. PRD §16의 4개 청구 포인트를 **넘어서는** 것
2. 단순 조합이 아닌 **상호작용 메커니즘**
3. **파일 흔적**으로 입증 가능
4. **1년 내** 구현 가능

---

## 1. 후보 12개 → 5개 청구 (선별 결과)

| # | 후보 | 파일 근거 | 결과 |
|---|------|-----------|------|
| C1 | Orphan Bundle Late-Binding Re-Attribution | `ObservationBundler.ts:66-73`, `OrphanBundleManager.ts:18-31` | **Dependent #1a** |
| C2 | 다요인 VOI 융합 (5-factor) | `VoiScorer.ts:22-28` | **Dependent #1b** |
| C3 | Multi-detector ensemble (현 8개, extensible to ≥9) + dedupe | `GapAnalyzer.ts:26-28` | **Dependent #1b** |
| C4 | 질문-블록 일급화 + supersede-by-answer | `QuestionLifecycleResolver.ts:37-88` | **Dependent #1b** |
| C5 | 결정론적 델타 폴드 + 구조추론 오버레이 | `FlowGraphProjector.ts:21-57` | **Independent #1 (합병)** |
| C6 | 거버넌스 sentinel supersede + validator-aware | `StaleDecayEngine.ts:24-41`, `StructuralValidator.ts:17-20,64-77` | **Dependent #1d** |
| C7 | SessionStart cue-card byte-budget 적응 | `CueCardInjector.ts:1-33` | 실시예 편입 |
| C8 | Identity Goal × FlowGraph Problem VOI 가중 | `skills/cfgm-identity/SKILL.md:40-45` | **Dependent #1c (Epic 7+)** |
| C9 | Bundle `processedAt`/`processedByVersion` 이중 멱등 | `ObservationBundler.ts:126-143` | 실시예 편입 |
| C10 | 번들 TTL 만료 + discard 원장 | `OrphanBundleManager.ts:33-56` | 실시예 편입 (TTL 방어) |
| C11 | Rotation archive-index | `RotationEngine.ts:67-110` | 제외 (일반 패턴) |
| C12 | Promotion threshold `resolvedRuns≥N` | `PromotionEngine.ts:15-25` | 제외 (§16에 이미 존재) |

---

## 2. Independent Claim #1 — Compaction-Surviving Causal Graph + Deterministic Delta-Fold Projector + Inference Overlay

### 2.1 청구항 (한 문장)

AI 대화 시스템에서 **문제 중심 인과 흐름 그래프(Problem-scoped Causal Flow Graph)**를 (a) 훅에 의해 생성된 **델타 원장(flow-delta.jsonl)의 좌측 폴드(left-fold)로 순수 함수로 재투사**하되, (b) 상기 폴드 결과 위에 **(i) 구조적 결손 검출 결과의 주입, (ii) 정보가치(VOI) 값의 Gap 블록 캐싱, (iii) 질문 블록의 수명주기 필드 파생**을 오버레이하고, (c) 대화 세션이 모델의 컨텍스트 한계를 초과하여 압축(compaction)을 겪더라도 **resume-sheet 구조 요약과 델타 원장으로부터 인과 상태를 온전히 재도출**할 수 있는, **compaction-surviving reproducible-inference causal memory 시스템**.

### 2.2 실시예 스케치

**(a) Deterministic delta-fold** (`src/core/flow/FlowGraphProjector.ts:21-57`):
```
project(problemId, deltas, asked, clock)
  → base = fold(problemId, deltas)     // pure function
  → structural = analyzer.analyze(base, clock)
  → base.blocks.push(...structural)
  → forEach Gap: b.voiCached = scorer.score(b, base, clock)
  → forEach Question: b.lifecycle/askedAt/answeredBy = resolver.resolve(...)
  → return base
```
동일 delta 원장 + 동일 asked 기록 + 동일 clock → 동일 FlowGraph **(테스트 보장)**.

**(b) Inference overlay**: `cueCardMeta.stale = deltas.length >= FLOW_CONFIG.DELTA_STALE_COUNT` → 자가 재생성 트리거 (`FlowGraphProjector.ts:104-106`). 세 가지 오버레이 모두 폴드 결과에 적용되는 결정론적 단일 투사 함수.

**(c) Compaction-surviving**: `src/core/compaction/ResumeSheetWriter.ts`가 PreCompact 훅에서 active problem의 요약을 `.memory-brain/compaction/resume-sheet.json`에 기록. 압축 후 SessionStart에서 `ResumeSheetReader`가 읽어 + `FlowGraphStore.readDeltas()`로 상태 복구.

### 2.3 §16 4개 청구와의 차이

| §16 청구 | 본 Independent와의 관계 |
|---|---|
| §16 청구 1: hook-native problem graph compilation | **포섭되고 확장**: 컴파일 자체보다 **투사 시점의 추론 오버레이 3종**을 청구의 핵심으로 둠 |
| §16 청구 2: gap-driven interactive completion | Dependent #1b로 재조합 — independent 안에서 "VOI 캐싱" 오버레이 하나로 병합 |
| §16 청구 3: dual-ledger reconstructability | **한 단계 상위**: raw→pure fn→{curated+overlay} 형태로 정식화 |
| §16 청구 4: compaction-surviving causal state | **통합 + 구체화**: compaction-surviving을 "delta-fold 재투사"의 귀결로 묶음 |

### 2.4 선행기술 점검

- **Event Sourcing / CQRS (Fowler 등)**: **공지 기술**. 따라서 "event sourcing 일반"은 청구 불가. **"(i)(ii)(iii) 오버레이를 단일 투사 함수로 수행 + compaction-survival 재도출"** 조합이 신규성 확보 지점. 청구항 문구에 반드시 명시 (T6 권고 #1).
- **SimpleMem (arxiv 2601.02553)**: 3단계(Semantic Compression / Online Synthesis / Intent-Aware Retrieval)는 **의미 압축**이지 델타-폴드 인과 그래프 투사 아님. **구분 가능**.
- **ClawVM (arxiv 2604.10352)**: 하니스 **가상 메모리** residency·compaction이지 인과 그래프 재투사 아님. **구분 가능**.
- **GraphRAG (MS)**: Leiden 커뮤니티 상향 그래프 정적 구축 + 저장. 델타-폴드 순수함수 **아님**. **구분 가능**.
- **claude-memory-compiler (coleam00)**: LLM compiler로 구조화된 기사 생성이지 델타-폴드 pure fn **아님**. **구분 가능**.
- **Zep (temporal KG)**: 팩트 시간 변경 추적이지 compaction-survival 재도출 **없음**. **구분 가능**.
- **Letta/mem0**: self-editing agent, user_id 스코프. 그래프 델타 폴드 **없음**. **구분 가능**.
- **PAI (claude-pai)**: 3-tier file memory. 델타 원장 + 인과 그래프 투사 **없음**. **구분 가능**.
- **Hermes agent harness**: closed learning loop + self-written skills. 그러나 **델타-폴드 기반 compaction-surviving 인과 기억 없음**. **구분 가능**.
- **Anthropic Skills + memory tool**: 공식 3-layer progressive disclosure. Skill은 사람-작성 markdown. 델타 폴드 **없음**. **구분 가능**.

**결론**: **CONDITIONAL CLEAR** — 청구항 문구에서 "(i)(ii)(iii) 오버레이를 단일 투사 함수로 수행" + "compaction 이후 동일 재도출 가능성" **둘 다** 명시 필수.

### 2.5 실시 요건

- 파일 존재: `src/core/flow/FlowGraphProjector.ts`, `src/core/flow/FlowGraphStore.ts`, `src/core/compaction/ResumeSheetWriter.ts`, `src/core/compaction/ResumeSheetReader.ts`
- 테스트: 동일 델타 원장 + 동일 asked + 동일 clock → 동일 FlowGraph 재현 (E2E)
- 테스트: 압축 전후 problem 상태 동치성 (기존 Epic 5 테스트 재사용)

---

## 3. Dependent Claims

### 3.1 Dependent #1a — Orphan Bundle Late-Binding Re-Attribution

**청구항**: 제1항에 있어서, 훅 이벤트를 **턴 단위로 관측 번들(observation bundle)로 봉인**하되 활성 문제가 바인딩되지 않은 시점의 번들을 별도 **고아 원장(`ledger/orphan-bundles.jsonl`)**에 보관하고, 이후 사용자가 문제를 활성화하면 해당 고아 번들을 **소급 귀속(late-binding attribution)** 하여 상기 delta-fold 재투사의 증거로 편입시키는 것을 특징으로 하는 방법.

**파일 근거**:
- `src/core/flow/ObservationBundler.ts:66-73` — `sealTurn()` with `activeProblemId` nullable
- `src/core/flow/OrphanBundleManager.ts:18-31` — `attributeToProblem(bundleId, problemId)`
- `src/core/flow/OrphanBundleManager.ts:33-56` — `sweepExpired()` with `BUNDLE_TTL_DAYS`

**실시예**: 사용자가 `ls`·`cat` 탐색 6턴 후 `"인증 버그를 고치자"` 발화 → `ObservationBundler.sealTurn`은 앞 6턴을 `activeProblemId=null`로 `orphan-bundles.jsonl`에 append → 문제 활성화 시 `attributeToProblem()` 호출 → 번들은 `ledger/bundles/YYYY/MM/DD/`로 이동 + `activeProblemId` 패치 + Independent #1의 delta-fold 경로에 합류. 만료 시 `sweepExpired()`가 `expired-bundles.jsonl`로 격리하여 증거 체인 보존.

**§16과의 차이**: §16 청구 1(hook-native problem graph compilation)은 "문제 있는 시점의 컴파일"만. 본 dependent는 **문제 없는 시점의 관측까지 시간 역행으로 인과 그래프에 엮는 4요소 상호작용**: `null activeProblemId + orphan ledger + 재귀속 API + TTL`.

**선행기술**:
- PAI, claude-mem, Hermes, Zep, mem0, Letta, GraphRAG, Anthropic Skills, OpenClaw/ClawVM: **모두 부재**
- **결론**: CLEAR

**TTL 방어 (Critic A1 대응)**: `sweepExpired()` + `BUNDLE_TTL_DAYS` (기본 14)를 청구항 문구에 명시 — 개인정보·영구 보관 공격 방어.

### 3.2 Dependent #1b — Multi-Detector + 5-Factor VOI + Question-Block Supersede-by-Answer

**청구항**: 제1항에 있어서, 상기 "VOI 값의 Gap 블록 캐싱" 오버레이가 **직교하는 복수의 구조 결손 검출기**(미완화 원인·미지원 가설·고아 행동·모순 결과·저신뢰 임계·스테일 확정·무원인 문제·증거-없음 가설·댕글링 증거 등)가 각각 생성한 후보 각각에 대해 **그래프 중심성(in-degree + out-degree 정규화) × 최근성(1/(1+days)) × 신뢰 결손(1-confidence) × 심각도 × 의미 부스트**를 가중합(clamp01)하여 VOI를 산출하고, 상기 VOI에 따라 선택된 **질문 자체가 흐름 그래프의 1급 블록**으로 저장되어 후속 답변 블록에 의해 `supersededBy` 필드로 소멸되는 수명주기 FSM을 포함하는 것을 특징으로 하는 방법.

**파일 근거**:
- `src/core/gap/GapAnalyzer.ts:14-51` — 현 8개 detector 순회 + `onError` 격리 + `gap:<detectorId>:<subjectBlockId>` dedupe (multi-detector ensemble, extensible to ≥9; Epic 8에서 9번째 detector 추가 예정)
- `src/core/gap/VoiScorer.ts:11-29, 22-28` — 5요소 가중합 + clamp01
- `src/core/gap/QuestionLifecycleResolver.ts:37-88` — FSM: `pending`→`asked`→`answered`|`stale`
- `src/core/gap/detectors/*.ts` — 현 8개 독립 구현 (ConflictingOutcomes/DanglingEvidence/LowConfidenceCritical/OrphanAction/StaleConfirmed/UncausedProblem/UnmitigatedCause/UnsupportedHypothesis), Detector 인터페이스 기반 확장형

**실시예**: 현 8개 검출기(multi-detector ensemble, ≥9 확장형)가 `GapAnalyzer.analyze()`에서 순회되고, 각 gap 후보에 `block.voiCached = VoiScorer.score(b, graph, clock)`로 캐시. VOI 상위 1~3개 질문이 QuestionBundler에 의해 묶여 inject됨. 답변이 오면 Question 블록의 `status="superseded"` + `supersededBy=<AnswerBlockId>` 설정 → lifecycle=`answered`.

**§16과의 차이**: §16 청구 2(gap-driven interactive completion)는 "VoI 기반 질문" 추상 언급. 본 dependent는 **(a) 5요소 수식, (b) multi-detector ensemble 아키텍처(현 8개 직교 검출기, ≥9개로 확장 가능), (c) 질문-블록 일급화 + supersede-by-answer FSM** 셋이 **함께** 동작하는 구체 실시예 수준을 청구.

**선행기술**:
- Letta self-edit: 능동적 자체 수정, 구조 결손 검출기 복수 조합·VOI 수치식 **없음**
- Zep temporal: 시간 팩트 추적, gap-to-question 파이프라인 **없음**
- mem0/PAI/claude-mem: **없음**
- GraphRAG drift detection: 커뮤니티 탐색 맥락, 결손-질문 아님 — 청구항에서 "질문 블록이 답변에 supersede"로 구분
- VOI 자체는 정보이론 공지 — 그러나 **graph-centrality × staleness × confidence-deficit × semantic-boost 5요소 융합**으로 agent memory gap 블록 순위화는 **미확인**
- **결론**: CLEAR (단, 3요소 동시 명시 필수)

### 3.3 Dependent #1c — Identity-Aligned VOI (PAI Goal × FlowGraph Problem) *(Epic 7+)*

**청구항**: 제1항 또는 제3.2항에 있어서, `~/.claude-brain/memory-brain/identity/goals/<goal-id>.md`의 `relatedProblems[]` soft-ref를 통해 **장기 목표(Goal)와 흐름 그래프 문제(Problem)가 양방향 연결**되며, 결손 질의 엔진이 VOI 가중합에 **goal-alignment factor**를 추가 주입하여 장기 목표 정렬 문제에 대한 질문을 우선 노출하는 것을 특징으로 하는 방법.

**파일 근거**:
- `skills/cfgm-identity/SKILL.md:40-45` — `link <goal-id> <problem-id>` CLI (soft-ref 제공)
- `src/core/binder/ActiveProblemStore.ts` — active problem 경로

**실시예** (Epic 7+): `FLOW_CONFIG.VOI_WEIGHTS.goalAlignment` 추가 + `VoiScorer.score()`에서 `graph.problemId ∈ activeGoal.relatedProblems`일 때 boost factor. 수십 줄로 구현 가능.

**§16과의 차이**: §16에 **Identity 층 자체 부재**. PAI 정체성 층과 FlowGraph가 **gap-질문 순위화 레벨에서 상호작용**하는 것은 신규.

**선행기술**:
- PAI Miessler: identity + 3-tier memory 있으나 gap-VOI 가중 **없음**, 인과 그래프 자체 **없음**
- Anthropic Skills: 스킬 메타 태깅이지 goal × problem VOI 가중 **아님**
- Hermes: 경험→스킬 합성, Identity Goal × FlowGraph Problem soft-ref VOI 가중 **부재**
- mem0/Letta/Zep: identity 층 **없음**
- **결론**: CLEAR (Epic 7+ 구현 가정 청구항)

**유의**: 현재 `relatedProblems[]` soft-ref만 존재, VOI 가중 배선 미구현. Roadmap Epic 7 또는 Epic 8의 VOI 확장 단계(goalAlignment factor)에 반드시 배치. 구현 없이 청구하면 실시예 부족 (Lead 권고 #3).

### 3.4 Dependent #1d — Sentinel Supersede + Validator-Aware Chain Integrity

**청구항**: 제1항 내지 제3.2항 중 어느 하나에 있어서, **거버넌스가 발행하는 supersede**(예: `decay:stale`)를 블록 ID가 아닌 **sentinel 문자열**로 표현하고, 구조 검증기가 `SUPERSEDE_SENTINELS` 집합을 통해 sentinel과 블록-ID 참조를 구분하여 체인 무결성을 유지하는 것을 특징으로 하는 방법.

**파일 근거**:
- `src/core/governance/StaleDecayEngine.ts:16-49, 24-41` — sentinel 발행
- `src/core/governance/StructuralValidator.ts:17-20, 64-77` — `SUPERSEDE_SENTINELS` 분기

**실시예**: `StaleDecayEngine.sweep()`이 stale 블록에 `supersededBy="decay:stale"` (sentinel) 설정. `StructuralValidator`가 `SUPERSEDE_SENTINELS.has(supersededBy)` 이면 block-ID 참조 무결성 검사를 스킵하되, 그렇지 않으면 block-ID 체인 완결성을 강제. v2에서 `supersededBy`가 discriminated union `{kind:"sentinel"|"block"}`으로 진화하더라도 의미 유지.

**§16과의 차이**: §9 time-internal memory의 "supersededBy" 필드는 있으나, **거버넌스 발행 supersede와 사용자/증거 발행 supersede의 이원화 + 검증기 sentinel-aware**는 미기재.

**선행기술**:
- Zep fact-invalidation: 팩트 내재 무효화 vs 그래프-구조적 supersede (서로 다른 층위)
- 기타 모두 없음
- **결론**: CLEAR

---

## 4. §16 기존 4개 청구 커버리지 매트릭스

| §16 기존 청구 | 본 RFC v2 신규 청구 | 관계 |
|---|---|---|
| (1) hook-native problem graph compilation | Independent #1 + Dependent #1a + #1c | **확장**: 문제 없는 시점 포섭(#1a), 정체성 축 추가(#1c) |
| (2) gap-driven interactive completion | Dependent #1b | **구체화**: multi-detector ensemble(현 8개, ≥9 확장형) + 5-factor VOI + question-block FSM 셋 동시 명시 |
| (3) dual-ledger reconstructability | Independent #1 흡수 | **한 단계 상위**: raw→pure fn→{curated+inference overlay} 정식화 |
| (4) compaction-surviving causal state | Independent #1에 통합 | **통합**: compaction-survival을 delta-fold 재투사의 귀결로 묶음 |

---

## 5. 선행기술 표 — 9개 경쟁자 × 5개 청구

| 경쟁자 | Indep#1 | Dep#1a | Dep#1b | Dep#1c | Dep#1d |
|---|---|---|---|---|---|
| PAI (Miessler) | **없음** (3-tier file memory, 델타 폴드 X) | **없음** | **없음** | **없음** (identity는 있으나 VOI 가중 X) | **없음** |
| claude-mem | **없음** (SQLite+FTS5, 인과 투사 X) | **없음** (문제-바인딩 없음 원장 X) | **없음** | **없음** | **없음** |
| Hermes agent | **없음** (closed loop·self-written skill, 델타 폴드 X) | **없음** | **없음** | **없음** (Goal × Problem soft-ref X) | **없음** |
| mem0 | **없음** (user_id 스코프) | **없음** | **없음** | **없음** | **없음** |
| Letta | **없음** (self-editing memory, 인과 그래프 X) | **없음** | **없음** (gap-Q VOI 수치식 X) | **없음** | **없음** |
| Zep | **없음** (temporal KG, compaction-survival 재도출 X) | **없음** | **부분 유사** (fact invalidation) — 구분 가능 | **없음** | **부분 유사** (fact invalidation) — 층위 구분 |
| GraphRAG | **없음** (Leiden 정적 상향) | **없음** | **부분 유사** (drift detection) — 질문 FSM로 구분 | **없음** | **없음** |
| Anthropic Skills + memory tool | **없음** (사람-작성 skill, 델타 폴드 X) | **없음** | **없음** | **없음** | **없음** |
| OpenClaw/ClawVM | **없음** (harness VM residency) | **없음** | **없음** | **없음** | **없음** |

**종합 결론**: 5개 청구 모두 **CLEAR**. 단, Independent #1은 **event sourcing 공지**와의 구분을 위해 청구항 문구 내 "(i)(ii)(iii) 오버레이를 단일 투사 함수 + compaction-survival 재도출" **양쪽 모두 명시** 필수 (CONDITIONAL CLEAR).

---

## 6. 위험 + 완화

| # | 위험 | 완화 |
|---|---|---|
| P-R1 | Independent #1 문구가 event sourcing 일반으로 해석될 위험 | "(i)(ii)(iii) 3단 오버레이 + 순수 함수 단일 투사 + compaction 이후 재도출" **3요소 동시 한정** 필수 |
| P-R2 | Dependent #1b의 VOI 자체가 정보이론 공지로 반박될 위험 | "5요소 융합식 + 검출기 복수 + supersede-by-answer FSM" **3요소 동시 인용** 필수 |
| P-R3 | Dependent #1c (Identity-aligned VOI)의 실시예 부족 | Roadmap Epic 7 또는 Epic 8의 VOI 확장 단계(goalAlignment factor)에 배치, 14일 내 Canary 구동 증명 |
| P-R4 | Dependent #1a (orphan bundle)가 개인정보·영구 보관 공격 받을 위험 | TTL 만료(`sweepExpired`, `BUNDLE_TTL_DAYS`) 청구항 내 명시 (Critic A1 대응) |
| P-R5 | Hermes가 독립적으로 유사 개념 청구할 위험 | compaction-surviving + delta-fold + inference overlay 3-way 결합이 Hermes에 **없음**을 선행기술 표로 방어 |

---

## 7. Lead 이행 체크리스트

- [x] Independent Claim 1개 + Dependent 4개 문구화
- [x] 각 청구에 대한 §16 차이 명시
- [x] 각 청구에 대한 9개 경쟁자 선행기술 표 (섹션 5)
- [x] 파일 근거 인용 (line 수준)
- [x] 실시예 스케치
- [x] 위험 + 완화
- [ ] patent-worker sign-off (Task #12)

---

## 8. 참고 파일

### 8.1 Independent #1 (Compaction-Surviving + Delta-Fold + Overlay)
- `src/core/flow/FlowGraphProjector.ts:21-57, 104-106`
- `src/core/flow/FlowGraphStore.ts`
- `src/core/compaction/ResumeSheetWriter.ts`
- `src/core/compaction/ResumeSheetReader.ts`
- `src/core/compaction/types.ts:4-29`

### 8.2 Dependent #1a (Orphan Bundle)
- `src/core/flow/ObservationBundler.ts:66-73, 126-143`
- `src/core/flow/OrphanBundleManager.ts:18-31, 33-56`

### 8.3 Dependent #1b (Multi-Detector + VOI + Question FSM)
- `src/core/gap/GapAnalyzer.ts:14-51, 17-24, 26-28`
- `src/core/gap/VoiScorer.ts:11-29, 22-28, 49`
- `src/core/gap/QuestionLifecycleResolver.ts:37-88`
- `src/core/gap/detectors/*.ts`

### 8.4 Dependent #1c (Identity-Aligned VOI, Epic 7+)
- `skills/cfgm-identity/SKILL.md:40-45`
- `src/core/binder/ActiveProblemStore.ts`
- `src/core/gap/VoiScorer.ts:11-29` (확장 예정)
- `src/core/flow/config.ts:15-21` (`VOI_WEIGHTS` 확장)

### 8.5 Dependent #1d (Sentinel Supersede)
- `src/core/governance/StaleDecayEngine.ts:16-49, 24-41`
- `src/core/governance/StructuralValidator.ts:17-20, 64-77`

### 8.6 PRD 참조
- `docs/hook_memory_system_invention_prd_ko.md §16` — 기존 4개 청구
- `docs/adr/004-session-scoped-resume-sheet.md` — ADR-004 (v2에서 opt-in 확장)
- `docs/adr/005-memory-brain-directory-rename.md` — 디렉토리 구조 경로

---

## 9. Sign-off 대기

- **Adversary (critic-worker)**: Task #11 블록 해제 필요
- **Patentability (patent-worker)**: Task #12 블록 해제 필요

양 워커가 모두 승인하면 팀 종료 (`TeamDelete`).
반려 시 해당 라운드부터 재진행 (team.md 종료 조건).
