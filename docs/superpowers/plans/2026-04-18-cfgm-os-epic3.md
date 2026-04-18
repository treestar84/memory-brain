# Epic 3 — Gap Question Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flow Graph의 결손(Gap)을 탐지하고 정보가치(VOI)로 순위를 매긴 뒤 UserPromptSubmit에 질문 1개를 주입한다. 구조적 Gap은 코어가 결정적으로, 의미적 Gap은 Claude가 `/cfgm-process`에서 생성.

**Architecture:** 훅 계층(UserPromptSubmit 확장: 3-gate 중복 억제 주입) → 코어 계층(8 Detector → GapAnalyzer → VoiScorer → QuestionLifecycleResolver → QuestionQueue) → projection 계층(FlowGraphProjector 확장으로 Gap/VOI/lifecycle 병합) → 지능 계층(Claude via `/cfgm-process`). 파생물(current-gaps.json · pending.jsonl)은 deterministic하게 재생성 가능, asked.jsonl만 append-only 보존.

**Tech Stack:** Bun + TypeScript strict, `bun:test`, 기존 Storage/Clock 주입 패턴 재사용, Epic 2의 FlowDelta 스키마 확장 없이 optional 필드와 projection 파생으로 해결.

**Spec:** [`docs/superpowers/specs/2026-04-18-cfgm-os-epic3-gap-question-engine-design.md`](../specs/2026-04-18-cfgm-os-epic3-gap-question-engine-design.md)

---

## 원칙

1. **결정성**: 동일 입력(FlowGraph + asked + now) → 동일 출력(projection 결과·pending.jsonl·current-gaps.json)
2. **델타 스키마 불변**: Epic 2의 FlowDelta 4 op 유지. lifecycle/voiCached는 절대 delta에 기록 안 함, projection 파생
3. **하드코딩 절단/키워드/요약 금지**: Epic 2 원칙 일관. 의미 해석은 전부 Claude
4. **파생물 복구성**: current-gaps.json·pending.jsonl 소실 시 flow-delta.jsonl + asked.jsonl로 재생성 가능
5. **훅 예산 보호**: 훅 경로는 projection/탐지 재계산 금지, 이미 산출된 파생물 read만

---

## 파일 구조

### 신규 소스
```
src/core/gap/
├─ types.ts                          E3-S1  Gap · VoiFactors · QuestionLifecycle 타입
├─ guards.ts                         E3-S1  타입 가드
├─ detectors/
│  ├─ Detector.ts                    E3-S2  인터페이스
│  ├─ OrphanActionDetector.ts        E3-S2
│  ├─ UnsupportedHypothesisDetector.ts E3-S2
│  ├─ StaleConfirmedDetector.ts      E3-S2
│  ├─ UncausedProblemDetector.ts     E3-S2
│  ├─ LowConfidenceCriticalDetector.ts E3-S2
│  ├─ ConflictingOutcomesDetector.ts E3-S2
│  ├─ DanglingEvidenceDetector.ts    E3-S2
│  └─ UnmitigatedCauseDetector.ts    E3-S2
├─ GapAnalyzer.ts                    E3-S3  Detector orchestration · 예외 격리 · blockId 규약
├─ VoiScorer.ts                      E3-S4  VOI 공식
├─ QuestionLifecycleResolver.ts      E3-S5  4 상태 전이
└─ QuestionQueue.ts                  E3-S7  pending.jsonl · asked.jsonl · current-gaps.json I/O
```

### 확장 파일
```
src/core/flow/types.ts               E3-S1  FlowBlock에 optional 필드 추가
src/core/flow/config.ts              E3-S1  VOI_WEIGHTS · DEFAULT_STALE_DAYS 추가
src/core/flow/FlowGraphValidator.ts  E3-S1  type별 필수 필드 검증
src/core/flow/FlowGraphProjector.ts  E3-S6  analyze · score · resolve 병합
src/hooks/user-prompt-submit.ts      E3-S8  Question 주입 + 3-gate 중복 억제
```

### 신규 CLI · 스킬
```
bin/cfgm-list-gaps.ts                E3-S10  current-gaps.json 덤프
bin/cfgm-inspect-graph.ts            E3-S10  (확장) Gap 필터 옵션
skills/cfgm-process/SKILL.md         E3-S9   (확장) Gap/Question/Answer 규칙 섹션
```

### 테스트
```
tests/core/gap/types.test.ts                         E3-S1
tests/core/gap/detectors/orphan-action.test.ts       E3-S2
tests/core/gap/detectors/unsupported-hypothesis.test.ts E3-S2
tests/core/gap/detectors/stale-confirmed.test.ts     E3-S2
tests/core/gap/detectors/uncaused-problem.test.ts    E3-S2
tests/core/gap/detectors/low-confidence-critical.test.ts E3-S2
tests/core/gap/detectors/conflicting-outcomes.test.ts E3-S2
tests/core/gap/detectors/dangling-evidence.test.ts   E3-S2
tests/core/gap/detectors/unmitigated-cause.test.ts   E3-S2
tests/core/gap/analyzer.test.ts                      E3-S3
tests/core/gap/voi-scorer.test.ts                    E3-S4
tests/core/gap/lifecycle-resolver.test.ts            E3-S5
tests/core/flow/projector.test.ts                    E3-S6  (확장)
tests/core/gap/queue.test.ts                         E3-S7
tests/hooks/user-prompt-submit.test.ts               E3-S8  (확장)
tests/bin/cfgm-gap-cli.test.ts                       E3-S10
tests/e2e/epic3-golden-path.test.ts                  E3-S11
```

---

## 스토리 맵

| ID | 스토리 | Part | 산출물 |
|---|---|---|---|
| E3-S1 | 데이터 타입 확장 + Validator | 1 | FlowBlock optional 필드, Gap/Question validator 규칙, config 상수 |
| E3-S2 | Detector 인터페이스 + 8종 구현 | 1 | 8 detector 각 순수 함수 + 케이스별 테스트 |
| E3-S3 | GapAnalyzer | 1 | detector 오케스트레이션, blockId 규약, 예외 격리 |
| E3-S4 | VoiScorer | 1 | 5요인 가중합, 정규화, tie-break |
| E3-S5 | QuestionLifecycleResolver | 1 | 4 상태 산출, asked dedup |
| E3-S6 | FlowGraphProjector 확장 | 1 | Gap/VOI/lifecycle 병합, 결정성 테스트 |
| E3-S7 | QuestionQueue | 2 | pending.jsonl · current-gaps.json 원자 재작성, asked.jsonl append |
| E3-S8 | UserPromptSubmit 훅 확장 | 2 | 3-gate 주입, 500B 체크, asked append |
| E3-S9 | `/cfgm-process` SKILL.md 확장 | 2 | Gap/Question/Answer 규칙 섹션 |
| E3-S10 | CLI 확장 | 2 | `cfgm-list-gaps`, `cfgm-inspect-graph` 확장 |
| E3-S11 | E2E golden path | 2 | Gap 탐지 → Question 생성 → 주입 → 답변 → stale 전환 |

상세 task는:
- **Part 1 (E3-S1~S6)**: `2026-04-18-cfgm-os-epic3-tasks-part1.md`
- **Part 2 (E3-S7~S11)**: `2026-04-18-cfgm-os-epic3-tasks-part2.md`

---

## 진행 규율

- 스토리 단위 순차 진행. 각 스토리는 실패 테스트 → 최소 구현 → 그린 → 커밋
- 커밋 포맷: `feat(E3-SN): <description>`
- `bun run typecheck` + `bun test` 그린 상태에서만 다음 스토리 진입
- Epic 2의 210 테스트 regression 없음 확인 (각 스토리 commit 후)
- 최종 Epic 3 완료 시 테스트 수 목표: 210 + 80+ ≥ 290

---

## 다음

이 plan 승인 시 `superpowers:subagent-driven-development`로 E3-S1부터 순차 디스패치. Epic 2와 동일 실행 규율.
