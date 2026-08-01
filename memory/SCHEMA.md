# memory/SCHEMA.md — 디렉토리 트리 명세

> 비전 §4 + 사용자 7-layer 인풋 + plan v3 답습. memory-brain의 메모리 구조.

## 7-layer 아키텍처 (사용자 인풋, 2026-04-27)

```
[L1 Bootloader]   CLAUDE.md / MEMORY.md (repo 루트)
[L2 Router]       memory/ROUTER.md
[L3 Wiki Layer]   memory/{sources, projects, concepts, decisions}/
[L4 Claim Layer]  memory/claims/ledger.jsonl  (git 트래킹 — ClaimStore.ts, PR-V3.5)
[L5 Graph/Search] memory/{index.sqlite, vector.index, graph.json}  (PR-V3.6)
[L6 Persona]      memory/profile/{peers,sessions,messages,representations}.jsonl  (PR-V3.1, PersonaStore)
[L7 Governance]   memory/reports/  (PR-V3.7)
```

## git 트래킹 vs 사용자 데이터 분리

| 위치 | 트래킹 여부 | 역할 |
|---|---|---|
| `memory/ROUTER.md` | ✅ 트래킹 | default retrieval policy (사용자 override 가능) |
| `memory/current.md` | ✅ 트래킹 | 현재 작업 컨텍스트 표면 |
| `memory/SCHEMA.md` | ✅ 트래킹 | 본 파일 |
| `memory/{sources,projects,concepts,decisions}/*.md` | ✅ 트래킹 (canonical knowledge) | 후속 PR-V3.4에서 채움 |
| `memory/reports/*.md` | ✅ 트래킹 (governance 메타 + sample) | 후속 PR-V3.7 |
| `.memory-brain/memory/profile/*.jsonl` | ❌ gitignore (사용자 개인 데이터) | PersonaStore 출력 (PR-V3.1) |
| `memory/claims/ledger.jsonl` | ✅ 트래킹 (append-only, `merge=union`) | ClaimStore 출력 (PR-A1.0) — `.memory-brain/` 아래가 아니라 `memory/` 아래에 있다: claim은 wiki와 함께 팀이 리뷰·공유하는 원장이라 개인 프로필과 달리 의도적으로 git 대상. `docs/SYNC.md` 참고. |

`.gitignore` 의 `.memory-brain/` 정책으로 분리. **본체 git은 OSS template / policy + claim 원장, `.memory-brain/` 아래(검색 인덱스 같은 파생물 + persona 개인 데이터)는 절대 트래킹 안 함**.

## 디렉토리 트리 (현재 + 미래)

```
memory-brain/                            # repo root
├── CLAUDE.md                            # bootloader (Bun 정책 + bootloader 섹션)
├── MEMORY.md                            # bootloader (PR-V3.2 신규)
├── memory/                              # OSS template / default policy
│   ├── ROUTER.md                        # retrieval policy (PR-V3.2)
│   ├── current.md                       # 현재 작업 표면 (PR-V3.2)
│   ├── SCHEMA.md                        # 본 파일 (PR-V3.2)
│   ├── sources/                         # PR-V3.4 — raw evidence
│   │   ├── sessions/
│   │   ├── documents/
│   │   ├── research/
│   │   └── raw/
│   ├── projects/                        # PR-V3.4 — canonical project knowledge
│   ├── concepts/                        # PR-V3.4 — 일반 개념·패턴
│   ├── decisions/                       # PR-V3.4 — 의사결정 + 근거
│   ├── reports/                         # PR-V3.7 — governance
│   │   ├── duplicate-candidates.md
│   │   ├── stale-claims.md
│   │   ├── contradictions.md
│   │   ├── low-confidence.md
│   │   ├── decay-report.md
│   │   └── review-queue.md
│   └── (indexes/, claims/ 는 .memory-brain/ 아래 사용자 데이터)
└── .memory-brain/                       # 사용자 개인 데이터 (gitignore)
    ├── memory/
    │   ├── profile/
    │   │   ├── peers.jsonl              # PR-V3.1 (PersonaStore)
    │   │   ├── sessions.jsonl
    │   │   ├── messages.jsonl
    │   │   └── representations.jsonl
    │   ├── claims/                      # PR-V3.5 (이관 — 현재 .memory-brain/claims/)
    │   ├── indexes/                     # PR-V3.6
    │   └── reports/                     # 사용자별 governance 출력
    └── (다른 storage root 산출물)
```

## 운영 규칙

1. **bootloader (L1)**: 전체 메모리 읽지 말 것. ROUTER.md만 보고 lane 결정.
2. **router (L2)**: 정책 only. 지식 항목 직접 추가 금지.
3. **wiki (L3)**: append 금지 — upsert / merge / supersede.
4. **claim (L4)**: append-only ledger + projection (PR-A1.0 패턴).
5. **graph/search (L5)**: derived 만. markdown source에서 rebuild 가능.
6. **persona (L6)**: inferred profile은 confidence + evidence pointer 의무. fact 분리.
7. **governance (L7)**: lint / detector 자동. 사용자 검토 후 결정.

## 후속 PR 의존관계

```
PR-V3.2 (현재) — bootloader + ROUTER + current + SCHEMA
   ↓
PR-V3.3 — RequestClassifier + LaneSelector + ContextBudget 코드 구현
   ↓
PR-V3.4 — Wiki Layer (sources/projects/concepts/decisions) + OpenClaw 포맷
   ↓
PR-V3.5 — Claim Layer 보강 (Graphiti valid_from/valid_to/invalid_at) + memory/claims/ 이관
   ↓
PR-V3.6 — Graph/Search Layer (bun:sqlite + rebuild 스크립트)
   ↓
PR-V3.7 — Governance reports 5 detector + memory/reports/
   ↓
PR-V3.8 — PAI 9-file × Persona 통합 (memory/profile/representations 와 9-file view 정렬)
```

## 참고

- 비전 §4 (목표 아키텍처)
- 사용자 7-layer 인풋 (2026-04-27, `.omc/wiki/vision-7-layer-arch.md`)
- ADR-018 §1, ADR-019, ADR-020, ADR-021
- bootstrap.ts `resolveStorageRoot()` — `.memory-brain/` storage root
