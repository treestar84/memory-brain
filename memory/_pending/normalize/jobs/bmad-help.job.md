---
job_id: norm-2026-05-05-bmad-help
status: pending
source_path: .claude/skills/bmad-help/SKILL.md
source_sha256: cd7096b2ff55b2b87e12d6b9c4c9ea13dfca78c49299a09327c97107f9531da8
heuristic_path: memory/_pending/normalize/jobs/bmad-help.heuristic.json
output_path: memory/concepts/_ssl/bmad-help.json
enqueued_at: 2026-05-05T14:51:31.743Z
warnings_count: 4
---

# Normalize job — `bmad-help`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/bmad-help/SKILL.md`](.claude/skills/bmad-help/SKILL.md) — SHA-256 `cd7096b2ff55b2b87e12d6b9c4c9ea13dfca78c49299a09327c97107f9531da8`
- Heuristic 1차 (warnings 4): [`memory/_pending/normalize/jobs/bmad-help.heuristic.json`](memory/_pending/normalize/jobs/bmad-help.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/bmad-help.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/bmad-help.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
