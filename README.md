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

## Key CLI Reference

| 명령 | 설명 |
|------|------|
| `cfgm-ssl-enqueue` | skills → pending normalize jobs 생성 (`--force` 재처리) |
| `cfgm-ssl-validate <path>` | SSL JSON 스키마 검증 |
| `cfgm-ssl-stats` | canonical 사용률 · 4 신규 노드 채움률 등 지표 |
| `cfgm-ssl-status` | pending/done/failed 큐 통계 |
| `cfgm-rebuild-index` | wiki + claim + SSL 전체 인덱스 재생성 |
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
