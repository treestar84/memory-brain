# Changelog

All notable changes to CFGM-OS are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.3.8] — 2026-05-06

### Added
- **TBox 확장** — `_canonical/capabilities.yaml` + `_canonical/scopes.yaml`
  - `capabilities.yaml`: action 범주 6종 (FILE_IO / MEMORY_PROCESSING / SCRIPT_EXECUTION / ORCHESTRATION / USER_INTERACTION / CONDITIONAL_BRANCHING). SSL Logical.actionRef → skill 능력 범주 매핑
  - `scopes.yaml`: resourceScope 위험 범주 5종 (EPHEMERAL / PERSISTENT_LOCAL / EXTERNAL / SENSITIVE / ASYNC). SSLRiskDetector 분류와 일관
  - IS-A 추론 없음 — yaml 어휘 정의만. 코드 변경 없이 확장 가능

- **`cfgm-find-chain --replay`** — goal → chain 발견 → replay plan 즉시 생성
  - `--replay` 플래그: top-1 chain 의 rootSlug 로 `buildChainReplayPlan` 즉시 실행
  - 출력: `memory/_pending/replay/<root>-chain.replay.md`
  - find-chain + replay 두 단계를 한 명령으로 완결

- **PAI spec 갱신** (`memory/_pending/normalize/_spec/prompt.md`)
  - 버전 표기 0.2.0 → 0.3.0
  - DecisionNode / InteractionNode / EvidenceNode / ProtocolNode 세부 필드 채우기 지침 추가 (branches[]{when,then}, expectedResponseType, successCriteria[], delegateTo 등)
  - TBox 파일 참조 안내 추가 (capabilities.yaml, scopes.yaml)

## [0.3.7] — 2026-05-06

### Added
- **V3.23 `KGChainFinder` + `cfgm-find-chain`** — goal-driven skill 체인 발견
  - `KGChainFinder.findChains(goal, opts)` — FTS5 `ssl_skills` 검색 → KGComposer COMPOSES 트리플로 체인 구성. 5단계 알고리즘:
    1. FTS5 prefix 검색 → hit slugs + BM25 score
    2. reverse-COMPOSES 인덱스 빌드
    3. 히트 slug에서 체인 root 후보 추출 (상위 전파)
    4. 각 root 에서 full chain 구성 + 히트 score 합산
    5. totalHitScore desc 정렬 → top N 반환
  - `bin/cfgm-find-chain.ts` — `--goal "..."` + `--top N` + `--json`
  - `bun run find-chain --goal "..."` 단축 명령
  - 8/8 테스트, coverage 100%

### Design
- 검색(FTS5) + 추론(KGComposer) + 체인(KG) 세 레이어를 최초로 수직 통합한 쿼리 경로
- ssl_skills 미초기화 시 빈 결과 반환 (예외 없음, graceful degradation)
- BM25 가중치는 SearchIndex와 동일 (scheduling=3.0, structural=1.5, logical=1.0)

## [0.3.6] — 2026-05-06

### Added
- **V3.22 `KGSharedNodeDetector` + `cfgm-dedup-actions`** — 체인 내 중복 actionRef 탐지
  - `KGSharedNodeDetector.detect()` — INSTANTIATES 엣지 기반으로 2+ skill이 공유하는 canonical actionRef 그룹화
  - `inChain=true`: COMPOSES 관계 내 중복 (체인 실행 시 같은 작업 반복) — 제거 후보
  - `inChain=false`: 독립 skill 간 어휘 공유 — 참고용
  - `bin/cfgm-dedup-actions.ts` — `--json` / `--chain-only` 지원
  - 8/8 테스트, coverage 100%

### Design
- KGComposer를 내부에서 실행해 COMPOSES 인덱스를 빌드 후 pair-wise 체인 관계 확인
- 탐지 결과를 수정하지 않음 — 보고만. 실제 dedup은 사용자/PAI 세션 판단

## [0.3.5] — 2026-05-06

### Added
- **V3.21 `cfgm-replay --chain`** — BFS 체인 순회 → 계층적 replay plan
  - `buildChainReplayPlan(rootSlug, sslDir, db)` — KGComposer COMPOSES 트리플로 루트 skill의 위임 체인을 BFS 탐색, 각 skill 의 replay 섹션을 깊이 순으로 결합
  - 출력: `memory/_pending/replay/<slug>-chain.replay.md` — frontmatter에 `chain_mode: true`, `chain_skills: [...]` 포함
  - `## Execution Order` 섹션: 깊이별 인덴트 + `← delegated by` 표기
  - `--chain` 플래그 추가 (`--slug`/`--query` 와 결합 사용)
  - `import.meta.main` 가드 추가 — 테스트 import 시 CLI 코드 미실행
  - 7/7 테스트

### Design
- COMPOSES 트리플(V3.20)을 직접 소비하는 첫 consumer — transitive closure가 실용적 가치를 입증
- 단일 skill replay 기존 동작 100% 유지 (회귀 0건)

## [0.3.4] — 2026-05-06

### Added
- **V3.20 R-COMPOSE inference (`KGComposer` + `cfgm-compose`)**
  - `KGComposer` — read-only inference engine on kg_edges. Computes:
    1. Transitive closure: A COMPOSES B if A →...→ B via DELEGATES_TO (depth ≤ 10, WITH RECURSIVE CTE)
    2. Cycle detection: paths where A →...→ A; deduplicated by canonical rotation (smallest slug first)
  - `bin/cfgm-compose.ts` — CLI with `--json` / `--no-report` / `--output` flags
  - Writes `memory/reports/skill-cycles.md` when cycles are detected
  - 13/13 tests, coverage 100%

### Design
- KGComposer operates read-only; does not mutate kg_edges — COMPOSES triples are always recomputed on demand
- Diamond deduplication: A→B, A→C, B→D, C→D produces exactly one A COMPOSES D triple (UNION not UNION ALL in CTE)
- Cycle canonical form: ring rotated so smallest slug appears first → same cycle from any starting node maps to one entry
- `bun run compose` shortcut added to package.json

## [0.3.3] — 2026-05-06

### Added
- **V3.19 Cross-skill 엣지 물질화 (KG-Brain 전역 그래프 인프라)**
  - `KGProjector` — SSLDocument를 typed KG 노드/엣지로 추출. CONTAINS/TRANSITIONS_TO/INSTANTIATES/DELEGATES_TO/SCOPED_TO 5종 relation 물질화
  - `KGGraph` — SQLite 기반 그래프 쿼리 API: `neighbors()` / `reverseDelegators()` / `reachable()` (재귀 CTE) / `danglingEdges()` / `stats()`
  - `cfgm-graph-query` CLI — 6개 subcommand: `neighbors` / `reverse-delegators` / `reachable` / `dangling` / `stats` / `node` / `skill-nodes`
  - `SearchIndex` SCHEMA_VERSION 2→3: `kg_nodes` + `kg_edges` 테이블 추가 (역방향 인덱스 포함)
  - `Indexer.rebuild()` — KGProjector 통합. rebuild 결과에 nodeCount/edgeCount/danglingEdgeCount 추가

### Design
- ProtocolNode.delegateTo가 처음으로 타입 엣지(DELEGATES_TO)로 물질화됨 — cross-skill 그래프 완성의 핵심 단계
- 같은 search.sqlite에 kg_nodes/kg_edges 추가 (별도 DB 없음) — FTS5↔graph 혼합 쿼리 가능
- 2-phase rebuild: 전체 노드 등록 → cross-skill resolve → bulk insert (부분 rebuild 없음, V1 full-only)
- canonical_action 가상 노드화: `neighbors("canonical_action:READ_LOCAL_FILE", dir=in)` → 해당 action 쓰는 모든 logical 노드

## [0.3.2] — 2026-05-06

### Added
- **Workflow Capture (`cfgm-learn`)** — "학습해라" 진입점. 사용자 기술 → `memory/workflows/<slug>.md` (SKILL.md 포맷) 생성 + SSL normalize enqueue. `bun run learn --name <slug> --goal "..."` 로 호출
- **SSL-guided Replay (`cfgm-replay`)** — "수행해라" 진입점. SSL 그래프를 Scene DAG 순서로 순회 → `memory/_pending/replay/<slug>.replay.md` (host LLM 실행 계획) 생성. `--slug` / `--query` / `--list` 지원
- **Replay spec** (`memory/_pending/replay/_spec/replay-guide.md`) — host LLM 이 replay plan 을 단계별로 실행하는 자연어 명세 (action type → tool 매핑 포함)
- `package.json` scripts: `learn` / `replay` / `enqueue` 단축 명령 추가

### Design
- V3.18 당초 "ExecutionBindingNode" 스키마 신설 방안 → **불채택**. 기존 SSL 그래프(StructuralNode.transitionsTo + containsLogicalIds + Decision/Interaction/Protocol 노드)가 이미 충분한 실행 구조를 보유. 스키마 변경 없이 CLI 2개로 해결
- SKILL.md 단독 대비 SSL replay 이점: 실행 순서 명시 / 분기 조건 명시 / 사용자 pause 명시 / 성공 기준 명시 / 위임 규약 명시

## [0.3.1] — 2026-05-06

### Added
- **V3.5 claim ledger 이관** — `memory/claims/ledger.jsonl` (git-tracked). 이전: `.memory-brain/claims/` (gitignored)
- `resolveProjectRoot()` + `buildClaimStorage()` — bootstrap 헬퍼, bin 7개 적용
- README quickstart 보강 — SSL normalize 흐름, CLI 참조표, Prerequisites
- CHANGELOG 초판

## [0.3.0] — 2026-05-06

### Added
- **Seed 9 canonical store** — `BRANCH_ON_LOCAL_FILE` + `READ_FROM_MEMORY` 2 신규 시드
- Canonical actionRef 사용률 **87.2% → 96%** (120/125 logical 노드)

## [0.2.0] — 2026-05-05

### Added
- **SSL 0.3.0 schema** — 4 신규 노드: DecisionNode / InteractionNode / EvidenceNode / ProtocolNode
- **Canonical Action Store** (`_canonical/actions.yaml`) — 시드 7: INFER/EMIT/BRANCH/TRANSFORM/READ/WRITE/CALL_LOCAL_SCRIPT
- **CanonicalCandidatesDetector** — inline 패턴 N≥3 자동 발견 (governance 6번째 detector)
- **KG-Brain Dashboard** (`cfgm-ssl-viewer`) — Bun.serve() + 5 API endpoint, XSS-safe DOM
- **PAI prompt spec** (`memory/_pending/normalize/_spec/`) — vendor-agnostic host-delegated normalize
- **`cfgm-ssl-stats`** — V3.17 효과 측정 CLI
- **SSL skill discovery** (`SearchIndex.searchSkills`) — FTS5 bm25 가중치 rich-field retrieval (논문 §4.1)
- **SSL risk gate** (`SSLRiskDetector`) — rule-based risk classifier, governance 통합
- **File-based pending normalize queue** — job.md + heuristic sidecar, host LLM 위임
- **`cfgm-ssl-normalize` / `cfgm-rebuild-index`** — end-to-end SSL normalize CLI

### Changed
- SSL_VERSION 0.1.0 → 0.2.0 → 0.3.0 (schema 풍부화: skillGoal, effects[], actionRef 등)
- `cfgm-rebuild-index` — SSLReader 통합, wiki+claim+SSL 단일 명령 인덱싱
- PR-V3.13 (Anthropic SDK 직접 호출) 회수 — `docs/RULES.md` 원칙 1·2 위반

## [0.1.0] — 2026-05-05

### Added
- **SSL 0.1.0 schema** — arXiv 2604.24026 기반 Scheduling–Structural–Logical 표현
- **`SkillNormalizer`** — heuristic md→SSL 1차 변환 (7/7 테스트)
- **`src/core/ontology/ssl.ts`** — closed vocabulary + `validateSSL`

## [0.0.x] — 2026-04-27 ~ 05-04

### Added
- 7-layer 아키텍처 확정 (Bootloader / Router / Wiki / Claim / Graph / Persona / Governance)
- MIT 라이선스 + 자체 PersonaStore (markdown+jsonl)
- memory/ 디렉토리 트리 + bootloader (`CLAUDE.md`, `memory/ROUTER.md`, `memory/current.md`)
- Platform Adapter → Core → Storage 3-layer 코드 구조
- Claim ledger, SearchIndex, GovernanceReporter, PersonaStore 초기 구현
- `cfgm-viewer` (전체 메모리 뷰어, http://localhost:4040)
