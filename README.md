# CFGM-OS (Causal Flow Gap Memory Operating System)

Persistent memory engine for Claude Code. Tracks skills as SSL (Scheduling–Structural–Logical) knowledge graphs, detects gaps and duplicates, and surfaces them via a dashboard — without MCP, external APIs, or subscriptions.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- Claude Code CLI

## Quick Start

```bash
bun install
bun run bin/install.ts
```

## Uninstall

```bash
bun run bin/uninstall.ts
```

## Test

```bash
bun test
bun run typecheck
```

## SSL Normalize Flow (KG-Brain)

Convert `.claude/skills/**` into typed SSL knowledge graphs:

```bash
# 1. Heuristic 1차 변환 + pending queue 생성
bun run bin/cfgm-ssl-enqueue.ts

# 2. Queue 상태 확인
bun run bin/cfgm-ssl-status.ts

# 3. PAI 세션에서 LLM 보강 처리 (아래 PAI 세션 섹션 참조)

# 4. 결과 인덱스 갱신
bun run bin/cfgm-rebuild-index.ts

# 5. 지표 확인
bun run bin/cfgm-ssl-stats.ts
```

### KG-Brain Dashboard

```bash
bun run viewer:ssl
# → http://localhost:4041
```

Skill 목록 · SSL 3-layer 시각화 · 검색 · risk findings · queue 상태.

## Workflow Learn & Replay (V3.18)

세션에서 수행한 워크플로우를 SSL 지식 그래프로 저장하고, 다음 세션에서 재실행합니다.

```bash
# 1. 워크플로우 학습 ("학습해라")
bun run learn --name ssl-normalize-workflow --goal "SSL normalize 후 index rebuild"

# stdin 으로 단계 기술
echo "1. cfgm-ssl-enqueue 실행\n2. PAI 세션 처리 대기\n3. cfgm-rebuild-index 실행" \
  | bun run learn --name ssl-normalize-workflow --goal "SSL 전체 normalize 파이프라인"

# 2. 다음 세션에서 재실행 ("수행해라")
bun run replay --slug ssl-normalize-workflow       # slug 직접 지정
bun run replay --query "ssl normalize"             # 검색어로 찾기
bun run replay --list                              # 저장된 워크플로우 목록
```

`cfgm-learn` 은 `memory/workflows/<slug>.md` (SKILL.md 포맷) 를 생성하고 SSL normalize 큐에 enqueue 합니다.
`cfgm-replay` 는 SSL 그래프를 Scene DAG 순서로 순회해 `memory/_pending/replay/<slug>.replay.md` 를 생성합니다. host LLM 이 이 파일을 읽고 단계별 실행합니다.

SKILL.md 단독 대비 SSL-guided replay 이점:

| 항목 | SKILL.md 단독 | SSL replay plan |
|------|--------------|----------------|
| 실행 순서 | prose 해석 의존 | Scene DAG 명시 |
| 분기 처리 | 암묵적 | DecisionNode when/then |
| 사용자 pause | 불명확 | InteractionNode 명시 |
| 성공 기준 | 없음 | EvidenceNode successCriteria |
| 위임 규약 | 없음 | ProtocolNode delegateTo |

## KG-Brain Graph (V3.19)

Cross-skill 엣지가 물질화된 전역 지식 그래프. `cfgm-rebuild-index` 실행 후 사용 가능.

```bash
# 인접 노드 조회
bun run bin/cfgm-graph-query.ts neighbors <node_id> --relation DELEGATES_TO

# 이 skill을 위임받는 모든 skill
bun run bin/cfgm-graph-query.ts reverse-delegators <skill_slug>

# N홉 도달 가능 노드
bun run bin/cfgm-graph-query.ts reachable <node_id> --depth 2

# dangling 엣지 (broken protocol delegation)
bun run bin/cfgm-graph-query.ts dangling

# 전체 통계
bun run bin/cfgm-graph-query.ts stats
```

KG 구조: `CONTAINS` / `TRANSITIONS_TO` / `INSTANTIATES` / `DELEGATES_TO` / `SCOPED_TO` 5종 관계.
`ProtocolNode.delegateTo`가 처음으로 타입 엣지(DELEGATES_TO)로 물질화됨 — cross-skill 체인 탐색의 기반.

## R-COMPOSE Inference (V3.20)

`cfgm-compose` 는 `DELEGATES_TO` 엣지의 전이 폐포를 계산해 `COMPOSES` 트리플을 도출하고, 순환 의존을 감지합니다.

```bash
# COMPOSES 트리플 출력 + 사이클이 있으면 memory/reports/skill-cycles.md 생성
bun run compose

# JSON 출력 (CI/파이프라인용)
bun run compose --json

# 보고서 파일 생성 없이 출력만
bun run compose --no-report
```

예: A → B → C 위임 체인이 있으면 `A COMPOSES [B, C]` 트리플이 도출됩니다.
사이클(A → B → A)은 `memory/reports/skill-cycles.md` 에 기록됩니다.

## Key CLI Reference

| 명령 | 설명 |
|------|------|
| `cfgm-learn` | 워크플로우 학습 → `memory/workflows/<slug>.md` + SSL enqueue |
| `cfgm-replay` | SSL-guided replay plan 생성 (`--slug` / `--query` / `--list`) |
| `cfgm-ssl-enqueue` | skills → pending normalize jobs 생성 (`--force` 재처리) |
| `cfgm-ssl-validate <path>` | SSL JSON 스키마 검증 |
| `cfgm-ssl-stats` | canonical 사용률 · 4 신규 노드 채움률 등 지표 |
| `cfgm-ssl-status` | pending/done/failed 큐 통계 |
| `cfgm-rebuild-index` | wiki + claim + SSL 전체 인덱스 재생성 |
| `cfgm-graph-query` | KG 그래프 쿼리 (`neighbors` / `reverse-delegators` / `reachable` / `dangling` / `stats`) |
| `cfgm-find-chain` | goal 문자열로 skill 체인 발견 (`--goal "..."` / `--top N` / `--json`) |
| `cfgm-compose` | R-COMPOSE 추론: COMPOSES 트리플 + 사이클 감지 (`--json` / `--no-report`) |
| `cfgm-dedup-actions` | 체인 내 중복 actionRef 탐지 (`--chain-only` / `--json`) |
| `cfgm-governance-report` | 중복·stale·contradiction 감지 보고서 |
| `cfgm-viewer` | 전체 메모리 뷰어 (http://localhost:4040) |
| `cfgm-ssl-viewer` | KG-Brain SSL 뷰어 (http://localhost:4041) |

## Architecture

7-layer: Bootloader → Router → Wiki → Claim → Graph/Search → Persona → Governance

코드 레벨 3-layer:

- **Adapters** (`src/adapters/`): Platform-specific JSON → CanonicalEvent
- **Core** (`src/core/`): Platform-free pure functions
- **Storage** (`src/core/storage/`): Injectable interface (Fs / Memory)

자세한 아키텍처는 `docs/adr/` 참조.

## Storage Paths

- User-level: `~/.memory-brain/`
- Project-level: `$PROJECT/.memory-brain/`

## PAI Session — 분리 영속 세션 (`docs/RULES.md` 원칙 5)

memory-brain 의 mutate 작업 (SSL normalize, governance, dedupe 등) 은 사용자의 **메인 세션** 이 아니라 **별도 PAI 세션** 에서 처리됩니다.

```
┌─ 메인 세션 (사용자 본업) ─────────────┐    ┌─ PAI 세션 (.claude-pai/) ──────┐
│ 코딩 · 분석 · 일반 대화                  │    │ 영속 단일 세션                   │
│ viewer 로 검색 · 확인                    │    │ SessionStart / UserPromptSubmit  │
│ cfgm-ssl-enqueue (트리거)                │    │   hook 으로 큐 자동 인지          │
│ 메모리 정리 작업 호출 X                   │    │ pending 작업 자율 처리            │
└──────────────┬──────────────────────────┘    │ mutate (write SSL JSON)          │
               │                                │ validate + job status 갱신        │
               │ memory/ 파일 시스템             │                                  │
               └────────────────────────────────┴──────────────────────────────────┘
                              (양방향 read/write — 다른 통신 없음)
```

### PAI 세션 띄우기

```bash
# 별도 터미널에서:
CLAUDE_CONFIG_DIR=.claude-pai claude

# (또는 alias 등록)
alias claude-pai="CLAUDE_CONFIG_DIR=.claude-pai claude"
claude-pai
```

PAI 세션은 시작 직후 자기 정체성 (`.claude-pai/CLAUDE.md`) 과 큐 상태를 인지하고 처리를 시작합니다. 메인 세션에서 `cfgm-ssl-enqueue` 로 새 작업을 enqueue 하면 PAI 세션의 다음 hook 주입 시 자동 감지됩니다.

## License

MIT
