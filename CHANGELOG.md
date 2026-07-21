# Changelog

All notable changes to CFGM-OS are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added — V3.30 LongMemEval Retrieval Tuning (2026-07-22, 워크플로우 진단 기반)
6-agent 워크플로우 (유형별 miss 진단 3 + 독립 설계 2 + 합성 1) 가 R@3 실패 29건에서 도출한 설계를 P1→P4 단계별 격리 측정으로 구현:
- **P1 Content 쿼리** — `toContentFtsQuery`: 영어 폐쇄류 stopword + 상대시간 어휘 제거 + 경량 스테밍 (`trips* OR trip*`). `queryFtsWithFallback` 3단 체인 (raw → content → loose). 일반동사 (like/want/need) 는 preference 내용어라 보존 (실측 근거 주석)
- **P2 rescue-rerank fusion** — top-3 고정 (R@1 무퇴행 불변식) + FTS rank 4+ 꼬리만 벡터 RRF 재정렬. opt-in (`fusion: "rescue-rerank"`), 기본값은 rescue 유지
- **P3 Temporal** — `TemporalQuery.ts` (결정론 상대시간 파서: "N weeks ago" / "last Saturday" / "past three months" → epoch day 창, "last name" 오탐 차단) + schema v5 (`wiki_dates` 테이블, `body_user` 컬럼, **마이그레이션 가드**: 버전 불일치 시 derived 테이블 drop&recreate) + `dateWindow` soft filter (창 안 문서 stable-partition 승격) + 요일 전체명 병기 + abstention 분리 집계
- **P4 user-turn 가중** — `WikiPage.bodyUser?` + bm25 명시 가중 (BODY_USER_WEIGHT 2.0, ablation 1.0/2.0/3.0 실측으로 결정). 빈 bodyUser 는 기존 랭킹과 수학적 동치 (회귀 테스트 고정)
- **실측 (LongMemEval_S 500, hybrid)**: R@1 55.2→**56.6%** · R@3 85.9→**87.2%** · R@5 91.7→**92.2%** · R@10 94.5→**96.2%** · MRR 0.909→**0.927**. temporal MRR 0.867→**0.927** (목표 0.91+ 달성) · multi-session 86.6→88.7% · knowledge-update 98.1% 유지
- **알려진 퇴행 (정직 보고)**: single-session-preference R@5 86.7→80.0% / MRR 0.630→0.561 (n=30). 원인: content 쿼리가 preference 질문에서 우연히 도움되던 stopword 매칭을 제거. hypernym 사전으로 회복 가능하나 벤치 과적합 위험으로 의도적 제외 (설계 합성 판정) — held-out split 도입 후 재시도 권고

### Added — V3.29 External Benchmarks: LongMemEval (2026-07-21)
- **① Retrieval-only 트랙** (LLM 호출 0)
  - `LongMemEval` 어댑터 (`src/core/bench/LongMemEval.ts`) — 질문별 haystack 세션 인덱싱 → `answer_session_ids` 대비 session-level Recall@K + MRR (논문 §4.2 프로토콜). fts/hybrid 비교, question type 별 분해, haystack 중복 세션 id dedupe
  - `cfgm-lme-retrieval` CLI (`bun run bench:lme`) → `memory/reports/longmemeval-retrieval.md`
  - **첫 실측 (LongMemEval_S 500문항)**: R@1 55.2% · R@3 85.9% · **R@5 91.7% · R@10 94.5% · MRR 0.909** (89초, LLM 0회)
- **② 풀 QA 트랙** (host-위임 — 원칙 2 준수)
  - `LmeQa` (`src/core/bench/LmeQa.ts`) — answer job (ground truth 미포함, 누출 방지) / judge job (truth 포함) / SQuAD-style token-F1 proxy / judge accuracy 집계
  - `cfgm-lme-enqueue` (retrieval top-k 컨텍스트 포함 job 생성) + `cfgm-lme-score` (proxy 채점 · `--judge-enqueue` · `--collect`)
  - PAI 세션 처리 전제 (원칙 5). `memory/_pending/lme/` 는 gitignore (재생성 가능 대용량)
- **③ Skill retrieval 트랙** — 데이터 소스 확정 (benchflow-ai/skillsbench: 87 tasks + 229 matched skills). 구현은 다음 사이클

### Changed — V3.29
- **Hybrid fusion 기본 전략 rrf → rescue**: LongMemEval 실측에서 동등 RRF 가 긴 세션 문서 코퍼스의 R@1 을 96%→64% 로 퇴행시키는 것을 확인. rescue (FTS 랭킹 보존 + 벡터는 FTS 미발견 문서만 뒤에 보충) 로 전환 — LongMemEval R@1 96% 유지 + wiki 마이크로벤치 구제 효과 (37.5%→100%) 유지 + skills MRR 1.000. `fusion: "rrf"` 옵션으로 기존 동작 선택 가능
- `SearchIndex` vectors insert → `INSERT OR REPLACE` (외부 데이터셋 중복 doc id 방어)

### Added — V3.28 Frontier Gap Closure (2026-07-21)
- **OKF 호환 export** — Google OKF (Open Knowledge Format) v0.1 번들 어댑터
  - `OkfExporter` (`src/core/okf/OkfExporter.ts`) — L3 wiki page → OKF concept 문서 (`type` 필수 + title/description/resource/tags/timestamp 정렬, `x_cfgm_*` provenance 보존, `[[id]]` → 상대 링크 변환)
  - `cfgm-okf-export` CLI (`bun run okf:export`) — dir index + root index 포함 번들 생성 (기본 `dist/okf`)
  - 코어 재구조화 없음 — wiki 스키마가 truth, OKF 는 어댑터 경계 뒤 파생물
- **Hybrid 검색 (opt-in)** — FTS5 BM25 + 벡터 cosine 랭킹 RRF 융합
  - `Embedder` 인터페이스 + `HashedNgramEmbedder` (의존성 0, 결정론적 char n-gram — 원칙 2 준수, API key 불요. 실제 embedding 모델은 인터페이스 구현으로 주입 가능)
  - `SearchIndex` schema v3→v4: `vectors` 테이블 + `searchWikiHybrid` / `searchSkillsHybrid` (벡터 없으면 FTS fallback — back-compat)
  - `cfgm-rebuild-index --embeddings` opt-in 플래그
- **Memory quality benchmark** — 코드 정확성과 별개로 메모리 품질을 정량 측정
  - `BenchRunner` — router lane 적중률 (hit rate + macro P/R) + wiki/skill 검색 recall@1/3/5 + MRR (fts vs hybrid 비교)
  - `fixtures/bench/cases.json` — 한/영 혼합 + 오타 케이스 30건, `cfgm-bench` CLI (`bun run bench`) → `memory/reports/benchmark-latest.md`
  - 첫 실측 (wiki 5 pages / skills 12): router lane hit 87.5% · wiki recall@5 fts 37.5% → **hybrid 100%** · MRR 0.375 → 0.938
- **Pending queue 실패 시맨틱** — orphan job 회수 계약
  - `JobLifecycle` (`src/core/normalizer/JobLifecycle.ts`) — claim (attempts+1 + `lease_expires_at`) / reap (lease 만료 → pending 재큐 또는 max_attempts 도달 시 failed) / 수동 requeue. legacy job 은 mtime+TTL 판정 (back-compat)
  - `cfgm-ssl-reap` CLI (`bun run reap`) — `--dry-run` / `--ttl-minutes` / `--max-attempts`
  - `cfgm-ssl-enqueue` 신규 job frontmatter 에 `attempts` / `max_attempts` 추가, `cfgm-ssl-status` 에 stale 카운트 + reap 권고 표시
  - `_spec/prompt.md` — PAI 세션 claim 프로토콜 + 재시도 계약 명세

### Fixed
- `SearchIndex.searchWiki` / `searchClaims` — 하이픈/콜론 포함 실사용 쿼리 ("KG-Brain", "bun:sqlite") 가 FTS5 구문 오류로 크래시하던 문제. raw MATCH 실패 시 sanitize 재시도 폴백 (첫 벤치마크 실행이 발견한 실 버그)

## [0.3.9] — 2026-05-08

### Added
- **V3.24 Executable SSL** — SSL JSON이 실행 프로그램을 겸하도록 확장
  - `LogicalNode.instructions?: string` — 자연어 실행 지시 슬롯 (optional, back-compat)
  - `SSLRunner` (`src/core/runner/SSLRunner.ts`) — BFS topological sort → `Step[]` 생성. CollectStep / BranchStep / ExecuteStep 세 종류. 병렬 실행 감지 (resourceTarget conflict) + 사이클 감지
  - `cfgm-run` CLI (`bin/cfgm-run.ts`) — plan-generator (기본) / `--interactive` / `--json` 세 모드. 슬러그 regex 검증 (path traversal 방어) + `validateSSL` 게이트
  - `app-store-screenshots.json` — 7개 logical 노드에 instructions 채움 (최초 완전 실행 가능 SSL JSON)
  - `bun run run:skill --skill <slug>` 단축 명령

### Fixed
- `LogicalNode.description`, `evidenceClaimIds`, `InteractionNode.variables` → optional (실제 JSON 아티팩트와 타입 계약 일치)
- `isParallelSafe`: resourceTarget 없는 노드 → `parallel: false` (unknown = unsafe)
- `SearchIndex`: `l.description ?? ""` (undefined 오염 방지)

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
