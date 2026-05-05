# Changelog

All notable changes to CFGM-OS are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
