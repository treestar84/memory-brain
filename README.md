# CFGM-OS (Causal Flow Gap Memory Operating System)

Hook-based self-forming ontology memory system for Claude Code.

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
```

## Architecture

3-layer: Platform Adapter → Core → Storage

- **Adapters** (`src/adapters/`): Platform-specific JSON → CanonicalEvent
- **Core** (`src/core/`): Platform-free pure functions
- **Storage** (`src/core/storage/`): Injectable interface (Fs / Memory)

## Storage Paths

- User-level: `~/.memory-brain/`
- Project-level: `$PROJECT/.memory-brain/`

## PAI Session — 분리 영속 세션 (`docs/RULES.md` 원칙 5)

memory-brain 의 mutate 작업 (SSL normalize, governance, dedupe 등) 은 사용자의 **메인 세션** 이 아니라 **별도 PAI 세션** 에서 처리됩니다. 메인 세션은 본업에 집중하고, PAI 세션은 자기 일을 자기가 영속적으로 처리합니다.

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

PAI 세션은 시작 직후 자기 정체성 (`.claude-pai/CLAUDE.md`) 과 큐 상태를 인지하고 처리를 시작합니다. 메인 세션에서 `bun run bin/cfgm-ssl-enqueue.ts` 로 새 작업을 enqueue 하면 PAI 세션의 다음 hook 주입 시 자동 감지됩니다.

### KG-Brain Dashboard

```bash
bun run viewer:ssl
# → http://localhost:4041
```

Skill 목록 + SSL 3-layer 시각화 + 검색 + risk findings + queue 상태.
