---
job_id: norm-2026-05-05-bmad-brainstorming
status: done
done_at: 2026-05-05T00:51:00.000Z
source_path: .claude/skills/bmad-brainstorming/SKILL.md
source_sha256: f4a2c22b40ed34cdbd3282dd6161a3b869902f3bc75b58e181fc9faf78eedd9d
heuristic_path: memory/_pending/normalize/jobs/bmad-brainstorming.heuristic.json
output_path: memory/concepts/_ssl/bmad-brainstorming.json
enqueued_at: 2026-05-05T00:47:10.012Z
warnings_count: 4
---

# Normalize job — `bmad-brainstorming`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/bmad-brainstorming/SKILL.md`](.claude/skills/bmad-brainstorming/SKILL.md) — SHA-256 `f4a2c22b40ed34cdbd3282dd6161a3b869902f3bc75b58e181fc9faf78eedd9d`
- Heuristic 1차 (warnings 4): [`memory/_pending/normalize/jobs/bmad-brainstorming.heuristic.json`](memory/_pending/normalize/jobs/bmad-brainstorming.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/bmad-brainstorming.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/bmad-brainstorming.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
