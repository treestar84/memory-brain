# MEMORY.md — Bootloader

> 비전 §5.1 답습 (PR-V3.2). 본 파일은 memory bootloader.
> **전체 메모리를 읽지 마라**. ROUTER.md 의 retrieval policy 만 보고 lane 결정.

## 핵심 규칙 (5)

1. **bootloader only**: 본 파일 + `CLAUDE.md` 는 진입점. 지식 항목 직접 추가 금지.
2. **ROUTER.md 우선**: `memory/ROUTER.md` 의 정책으로 lane 결정 → 1~3 파일만 조회.
3. **source/evidence 의무**: claim 답변 시 evidence pointer 인용. 없는 high-confidence claim 금지.
4. **persona ≠ fact**: `inferred profile` 은 confidence + evidence pointer. 사용자 반박 시 즉시 수정.
5. **append-only + projection**: 모든 원장은 last-wins reduce. 직접 수정 X, supersede / decay / archive 우선.

## 진입 경로

```
요청 들어옴
  ↓
CLAUDE.md / MEMORY.md (본 파일) — bootloader 규칙 확인
  ↓
memory/ROUTER.md — 요청 분류 + lane 선택
  ↓
필요한 lane (current / projects / concepts / decisions / profile / sources / reports) 의 1~3 파일만 조회
  ↓
답변 후 memory update 후보 생성 (duplicate/conflict 검사 후 upsert)
```

## 7-layer 빠른 참조

상세는 `CLAUDE.md` 또는 `memory/SCHEMA.md`.

```
L1 Bootloader  CLAUDE.md / MEMORY.md (본 파일)
L2 Router      memory/ROUTER.md
L3 Wiki        memory/{sources,projects,concepts,decisions}/
L4 Claim       .memory-brain/claims/ledger.jsonl  (→ memory/claims/ PR-V3.5)
L5 Graph       memory/indexes/  (PR-V3.6)
L6 Persona     .memory-brain/memory/profile/*.jsonl  (PersonaStore)
L7 Governance  memory/reports/  (PR-V3.7)
```

## 본 프로젝트 정신

`Claim-Grounded, Persona-Aware Memory Routing OS` — 비전 §16.

> 지식은 claim/evidence 로 관리, 검색은 index 가 담당, 주입은 router 가 제어,
> 개인화는 Honcho 패턴(자체 PersonaStore) 가 담당하는 메모리 운영체제.

## 금지 사항

- ❌ `CLAUDE.md` / `MEMORY.md` 에 프로젝트 히스토리·과거 의사결정·사용자 선호 누적
- ❌ `ROUTER.md` 에 topic 목록·프로젝트 목록·구체 지식
- ❌ inference 를 evidence 없이 fact 로 승격
- ❌ search index 를 source-of-truth 로 사용 (markdown 이 source)
- ❌ append-only ledger 직접 수정 (새 엔트리만)

## 참고

- `memory/ROUTER.md` — retrieval policy
- `memory/current.md` — 현재 작업 표면
- `memory/SCHEMA.md` — 디렉토리 트리
- `docs/adr/` — 코드 결정 (ADR-018·019·020·021 등)
- `memory_system_improvement_prompt.md` — 비전 (1121줄, 17 섹션)
