---
name: cfgm-identity
description: pai-memory의 정체성 층(TELOS·Persona·User·Tools·Voice·Goals)을 조회·수정하고, 장기 목표(Goal)를 관리한다. `~/.claude-brain/CLAUDE.md`에 @import된 파일들이 모든 `claude-pai` 세션의 시스템 프롬프트에 자동 주입된다.
---

# /cfgm-identity

**역할**: 사용자의 정체성·가치관·장기 목표를 마크다운 파일로 영속화하고, 그것이 `claude-pai` 세션의 시스템 프롬프트에 자동 포함되도록 한다. 본 스킬은 직접 파일을 쓰지 않고, CLI(`bin/cfgm-identity-goal.ts`)와 `/memory` 편집기를 안내한다.

## Identity 파일 구조

```
~/.claude-brain/
├── CLAUDE.md                                   # @import glue (installer가 managed block 관리)
└── memory-brain/identity/
    ├── telos.md       # 존재 목적 · 원칙
    ├── persona.md     # 원하는 AI 성격·어조
    ├── user.md        # 사용자 프로필
    ├── tools.md       # 자주 쓰는 도구·환경
    ├── voice.md       # 응답 스타일 가이드
    └── goals/
        ├── _index.md              # CLI 자동 재생성
        └── <goal-id>.md           # 사용자가 채우는 본문
```

## 파일 편집 (사람이 채운다)

1. **설치 후 최초**: `telos.md` → `persona.md` → `user.md` 순으로 채우는 걸 권장.
2. **편집 방법**:
   - 직접: `$EDITOR ~/.claude-brain/memory-brain/identity/telos.md`
   - 세션 안에서: `/memory`를 실행하면 현재 프로파일의 `CLAUDE.md`가 열리고, `@import` 대상까지 편집 가능.
3. **비파괴 원칙**: `bin/install-brain.ts` 재실행은 identity 파일을 **덮어쓰지 않는다**. `--purge` uninstall에서만 삭제.

## Goals CLI

```bash
# 목록
bun run bin/cfgm-identity-goal.ts list

# 추가 (id는 소문자/숫자/대시/언더스코어, 최대 64자)
bun run bin/cfgm-identity-goal.ts add "Rust 숙련" learn-rust

# 완료 처리
bun run bin/cfgm-identity-goal.ts done learn-rust

# FlowGraph의 Problem과 링크 (soft-ref — 문자열만 저장)
bun run bin/cfgm-identity-goal.ts link learn-rust prob-1234abcd

# 현재 identity 총 크기 + goals 요약
bun run bin/cfgm-identity-goal.ts show
```

### Goal frontmatter 스키마

```yaml
---
id: learn-rust
title: Rust 숙련
status: planned       # planned | in-progress | on-hold | done | abandoned
priority: medium      # low | medium | high
createdAt: 2026-04-20T...
targetDate: null
completedAt: null
relatedProblems: []   # FlowGraph problem id 배열 (soft-ref)
---
```

본문(`##` 이하)은 자유롭게 편집. 템플릿은 `# title / ## Why / ## Success criteria / ## Notes` 구조로 제공된다.

## 토큰 예산

`~/.claude-brain/CLAUDE.md`와 @import 대상은 **매 턴 시스템 프롬프트에 포함**된다. 총합을 작게 유지하라:

- 개별 파일은 2~5KB 상한을 권장.
- 전체 identity 총합이 **20KB**를 초과하면 `show`가 경고.
- 초과 시 goal의 본문을 짧게 줄이거나, 완료된 goal은 `done` 처리(상태만 바뀌고 내용은 보존).

## 검증

설치 직후:
```bash
cat ~/.claude-brain/CLAUDE.md                      # managed block 확인
ls ~/.claude-brain/memory-brain/identity/          # 6개 파일 + goals/
```

실제 로드 확인은 `claude-pai` 세션 안에서:
- `/memory` 실행 → CLAUDE.md가 열리고 `@import` 목록이 보여야 함.
- 프롬프트: "내 TELOS가 뭐야?" → `telos.md` 내용을 Claude가 인용·요약해야 성공.

## 주의

- `~/.claude/CLAUDE.md`(기본 프로파일)은 건드리지 않는다. pai-memory는 `~/.claude-brain/CLAUDE.md`만 관리.
- CLAUDE.md의 managed block 경계(`<!-- PAI-MEMORY:BEGIN/END -->`)를 수동 편집하지 말 것. 파괴되면 재설치가 **skip + 경고**로 방어하지만, 수동 복구 필요.
- `goals/_index.md`는 CLI가 자동 재생성한다. 직접 편집하지 말 것.
