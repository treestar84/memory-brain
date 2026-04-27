---
id: project.memory-brain
type: project
status: active
confidence: high
tags: [project, vision, plan-v3, claim-grounded-os]
related: [decision.oss-incorporation, concept.memory-routing]
supersedes: []
updated_at: 2026-04-27
---

# memory-brain — Claim-Grounded, Persona-Aware Memory Routing OS

## Summary

<!-- claim:cl-mb-001 -->
memory-brain 은 비전 §16 "지식은 claim/evidence, 검색은 index, 주입은 router, 개인화는 Honcho 패턴" 단일 추상 메모리 OS 를 목표로 한다. Claude Code hook 기반, Bun/TypeScript, local-first, MIT.

## 7-layer 아키텍처

<!-- claim:cl-mb-002 -->
사용자 명시 7-layer (2026-04-27): L1 Bootloader (CLAUDE.md/MEMORY.md) → L2 Router (memory/ROUTER.md) → L3 Wiki (memory/{sources,projects,concepts,decisions}/) → L4 Claim (memory/claims/, 현재 .memory-brain/claims/) → L5 Graph/Search (memory/indexes/) → L6 Persona (memory/profile/) → L7 Governance (memory/reports/).

## 진행 상태 (2026-04-27)

<!-- claim:cl-mb-003 -->
**Phase A1 (claim sidecar)**: PR-A1.0 머지 (`397e641`). 자체 ClaimStore + FlowBlock→claim 단방향 변환기 + cfgm-claim-list CLI. accept/reject CLI 는 PR-A1.1 로 분리.

<!-- claim:cl-mb-004 -->
**Phase A1 후속 (게이트 메타)**: ADR-018 (`64597ff`) 채택 — 시간 백스톱 ≠ phase-진입 트리거 + AND 게이트 + §3a 카탈로그 nudge.

<!-- claim:cl-mb-005 -->
**plan v3 진입 (Phase V3)**: 사용자 비전 발화 후 OSS 통째 도입 결정 (ADR-019/020/021), bootloader 재작성 (PR-V3.2), Router 코드 구현 (PR-V3.3), Wiki Layer (본 PR-V3.4).

<!-- claim:cl-mb-006 -->
**잔여 phase (V3)**: PR-V3.5 (Claim Layer 보강 + Graphiti supersede 모델) → PR-V3.6 (Graph/Search, bun:sqlite) → PR-V3.7 (Governance reports 5종) → PR-V3.8 (PAI 9-file × Persona 통합).

## 핵심 자산

<!-- claim:cl-mb-007 -->
- **인과 그래프 (Phase 1·2)**: `src/core/flow/` — FlowBlock (10 type) + ObservationBundle + cfgm-process 의미 합성
- **Identity sidecar (Phase 3)**: `src/core/identity/PromotionLedger` + 9-file (PAI 답습)
- **Claim sidecar (Phase A1)**: `src/core/claim/ClaimStore` + FlowBlockToClaimCandidate
- **Persona Layer (V3)**: `src/core/persona/PersonaStore` (markdown+jsonl, 자체 구현)
- **Router (V3)**: `src/core/router/{RequestClassifier,LaneSelector,ContextBudget,Router}`
- **Wiki Layer (V3)**: `memory/{sources,projects,concepts,decisions}/` (본 PR)

## ADR 인덱스 (코드 결정 21건)

<!-- claim:cl-mb-008 -->
ADR-001~007 (Phase 1~2 토대) / ADR-008 (게이트 정신) / ADR-009 (Identity sidecar) / ADR-011 (자가 호출 정신) / ADR-012 (claim sidecar) / ADR-018 (phase 게이트 메타) / ADR-019 (OSS 도입) / ADR-020 (라이선스 MIT) / ADR-021 (Honcho self-host 회수).

## Evidence

- `memory_system_improvement_prompt.md` — 비전 (1121줄, 17 섹션)
- `.omc/wiki/vision-7-layer-arch.md` — 7-layer × OSS 매트릭스
- `memory/ROUTER.md` — retrieval policy
- `memory/SCHEMA.md` — 디렉토리 트리
- `memory/WIKI-FORMAT.md` — wiki page 형식
- `docs/adr/` — 결정 21건
- 최근 머지: `commit:d6c4529` (PR-V3.3 Router) / `commit:200d462` (PR-V3.2 bootloader)

## Related

- [[decision.oss-incorporation]] — OSS 통째 도입 정책
- [[concept.memory-routing]] — Router 정책

## 다음 단계

- PR-V3.4 (본 PR): Wiki Layer + WikiReader 코드 모듈
- PR-V3.5: Claim Layer 보강 (Graphiti supersede 모델)
- 1주 운영 후: PR-A1.1 (accept/reject CLI)
