---
job_id: norm-2026-05-05-bmad-editorial-review-prose
status: pending
source_path: .claude/skills/bmad-editorial-review-prose/SKILL.md
source_sha256: b3687fe80567378627bc2a0c5034ae8d65dfeedcf2b6c90da077f4feca462d0c
heuristic_path: memory/_pending/normalize/jobs/bmad-editorial-review-prose.heuristic.json
output_path: memory/concepts/_ssl/bmad-editorial-review-prose.json
enqueued_at: 2026-05-05T14:51:31.743Z
warnings_count: 1
---

# Normalize job — `bmad-editorial-review-prose`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/bmad-editorial-review-prose/SKILL.md`](.claude/skills/bmad-editorial-review-prose/SKILL.md) — SHA-256 `b3687fe80567378627bc2a0c5034ae8d65dfeedcf2b6c90da077f4feca462d0c`
- Heuristic 1차 (warnings 1): [`memory/_pending/normalize/jobs/bmad-editorial-review-prose.heuristic.json`](memory/_pending/normalize/jobs/bmad-editorial-review-prose.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/bmad-editorial-review-prose.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/bmad-editorial-review-prose.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
