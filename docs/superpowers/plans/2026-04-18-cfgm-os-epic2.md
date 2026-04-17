# Epic 2 — Flow Graph Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Observation을 Flow Block으로 구조화하는 합성 레이어를 구현한다. 훅/코어는 관측의 보존·묶음·투영만, 의미 부여는 100% Claude 본체(`/cfgm-process` 스킬).

**Architecture:** 훅 계층(Epic 1 확장: 턴 경계 마커) → 코어 계층(ObservationBundler → flow-delta.jsonl → Projector → flow-graph.json → cue-card.md) → 지능 계층(Claude via `/cfgm-process`). 델타 로그 기반 append-only, 스냅샷은 투영(projection).

**Tech Stack:** Bun + TypeScript strict, `bun:test`, 기존 Storage/Clock 주입 패턴 재사용.

**Spec:** [`docs/superpowers/specs/2026-04-18-cfgm-os-epic2-flow-graph-design.md`](../specs/2026-04-18-cfgm-os-epic2-flow-graph-design.md)

---

## 파일 구조

### 신규 소스
```
src/core/flow/
├─ types.ts              E2-S1  Flow Block · Delta · ObservationBundle 타입
├─ guards.ts             E2-S1  타입 가드 8종
├─ config.ts             E2-S1  설정 가능 상수 10종
├─ FlowGraphStore.ts     E2-S2  델타 append + 스냅샷 I/O
├─ FlowGraphValidator.ts E2-S3  스키마·구조 검증
├─ FlowGraphProjector.ts E2-S4  델타 → 스냅샷 결정적 재계산
├─ ObservationBundler.ts E2-S5  턴 경계 번들 생성
├─ OrphanBundleManager.ts E2-S6 active 없을 때 orphan 큐
├─ CueCardFallback.ts    E2-S7  통계 기반 대기 카드
└─ CueCardInjector.ts    E2-S9  SessionStart stdout 절단
```

### 신규 CLI · 스킬
```
bin/cfgm-list-bundles.ts  E2-S11  미처리 번들 조회
bin/cfgm-apply-delta.ts   E2-S11  델타 커밋
bin/cfgm-inspect-graph.ts E2-S11  디버깅용 덤프
skills/cfgm-process/SKILL.md  E2-S10  Claude용 합성 절차
```

### 변경 파일
```
src/hooks/user-prompt-submit.ts  E2-S8  턴 경계 마커·이전 봉인
src/hooks/session-start.ts       E2-S9  cue card 주입·권장 메시지
src/hooks/session-end.ts         E2-S8  마지막 턴 봉인
```

### 테스트
```
tests/core/flow/types.test.ts            E2-S1
tests/core/flow/graph-store.test.ts      E2-S2
tests/core/flow/validator.test.ts        E2-S3
tests/core/flow/projector.test.ts        E2-S4
tests/core/flow/bundler.test.ts          E2-S5
tests/core/flow/orphan.test.ts           E2-S6
tests/core/flow/cue-card-fallback.test.ts E2-S7
tests/hooks/user-prompt-submit.test.ts   E2-S8 (확장)
tests/hooks/session-start.test.ts        E2-S9 (확장)
tests/hooks/session-end.test.ts          E2-S8 (확장)
tests/bin/cfgm-flow-cli.test.ts          E2-S11
tests/e2e/epic2-golden-path.test.ts      E2-S12
```

---

## 태스크 파일 인덱스

| 파일 | 스토리 | 설명 |
|---|---|---|
| [part1 — 코어 구조 & 번들링](./2026-04-18-cfgm-os-epic2-tasks-part1.md) | E2-S1 ~ E2-S6 | 타입, Store, Validator, Projector, Bundler, Orphan |
| [part2 — 표현 & 통합](./2026-04-18-cfgm-os-epic2-tasks-part2.md) | E2-S7 ~ E2-S12 | Fallback, 훅 확장, 스킬·CLI, E2E |

각 태스크는 0.5~1일 크기(TDD 포함). 모든 스텝은 실행 가능한 코드와 명령·기대 출력·커밋 메시지를 포함한다.

---

## 진행 원칙

- **TDD 엄격**: 각 스토리는 실패 테스트 → 최소 구현 → 그린 → 커밋 순서
- **의미 판단 금지 (코어)**: 어떤 코어 모듈도 문자열 절단·키워드·카운트 기반 의미 판단을 하지 않는다. 이 원칙 위반 시 리뷰 reject
- **결정성**: Projector와 Validator는 같은 입력 → 같은 출력. 테스트에서 보장
- **커밋 단위**: 스토리 단위 1 커밋, 형식 `feat(E2-SN): <제목>` 또는 `test(E2-SN): ...`

---

## 진척 체크리스트

- [ ] E2-S1 Flow 타입 & 스키마
- [ ] E2-S2 FlowGraphStore
- [ ] E2-S3 FlowGraphValidator
- [ ] E2-S4 FlowGraphProjector
- [ ] E2-S5 ObservationBundler
- [ ] E2-S6 Orphan Bundle 관리
- [ ] E2-S7 CueCardFallback
- [ ] E2-S8 UserPromptSubmit 훅 확장
- [ ] E2-S9 SessionStart 훅 확장
- [ ] E2-S10 `/cfgm-process` 스킬 문서
- [ ] E2-S11 CLI 3종
- [ ] E2-S12 E2E 골든 패스
