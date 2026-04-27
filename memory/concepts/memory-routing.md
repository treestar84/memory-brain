---
id: concept.memory-routing
type: concept
status: active
confidence: high
tags: [router, retrieval-policy, lane, context-budget]
related: [decision.oss-incorporation, project.memory-brain]
supersedes: []
updated_at: 2026-04-27
---

# Memory Routing — 정책 기반 lane 선택

## Summary

<!-- claim:cl-route-001 -->
Memory Router 는 사용자 발화를 11 카테고리 중 하나 이상으로 분류하고, 카테고리 → lane 매핑으로 1~3개 파일만 조회한다. 전체 메모리 스캔은 금지.

## Key Concepts

<!-- claim:cl-route-002 -->
**요청 분류 (10 카테고리)**: QUICK / DEEP / PROJECT / PERSONAL / VERIFY / WRITE / CODE / RESEARCH / CONFLICT / MAINTENANCE. 다중 매치 가능 (CODE+WRITE 등). PR-V3.3 RequestClassifier 가 keyword/regex 1차 구현.

<!-- claim:cl-route-003 -->
**Memory Lane (9개)**: current / project / concept / decision / persona / evidence / governance / code / research. 카테고리 → lane 정적 매핑은 LaneSelector 가 담당. union 으로 다중 lane 결정.

<!-- claim:cl-route-004 -->
**ContextBudget**: canonical pages ≤ 3, source files ≤ 3, persona files ≤ 2 per request. 비전 §6.4 답습. 슬롯별 카운터로 강제.

<!-- claim:cl-route-005 -->
**기본 라우팅 순서 (vision §6.3)**: (1) 분류 → (2) lane 선택 → (3) `current.md` 확인 → (4) domain index → (5) canonical page 1~3 → (6) 부족 시 search → (7) 검증 시 evidence → (8) 개인화 시 persona → (9) 답변 후 update 후보 → (10) duplicate/conflict 검사 후 upsert.

<!-- claim:cl-route-006 -->
**충돌 우선순위**: explicit fact > canonical decision (active) > inferred profile (confidence ≥ 0.7) > stale claim. 같은 layer 충돌 시 `updated_at` 최신 우선.

<!-- claim:cl-route-007 -->
**LLM 분류 미도입**: PR-V3.3 1차는 keyword/regex 매칭만. Claude 본체가 명시 호출하는 LLM 분류는 후속 PR (cfgm-process 패턴 답습).

## Evidence

- `memory/ROUTER.md` — retrieval policy 본문
- `src/core/router/RequestClassifier.ts` — keyword 매칭 1차
- `src/core/router/LaneSelector.ts` — 카테고리 → lane 매핑
- `src/core/router/ContextBudget.ts` — 슬롯 카운터
- `src/core/router/Router.ts` — facade
- `src/hooks/user-prompt-submit.ts:65-70` — 통합 호출
- `commit:d6c4529` — PR-V3.3 머지
- `memory_system_improvement_prompt.md` §6 — 비전 routing 사양

## Related

- [[decision.oss-incorporation]] — Hermes 라우팅 패턴 답습 결정
- [[project.memory-brain]] — 진행 상태

## 후속 진화

- LLM 분류 도입 시 keyword 1차와 hybrid (정규식 통과 시 confidence high, 미통과 시 LLM fallback)
- search index (PR-V3.6 sqlite) 도입 후 "분류 실패" 케이스에서 keyword 검색으로 fallback
- governance lint (PR-V3.7) — router 결정 ↔ 실제 lane 사용 감사
