---
job_id: norm-2026-05-05-bmad-editorial-review-structure
status: done
done_at: 2026-05-06T00:00:00.000Z
source_path: .claude/skills/bmad-editorial-review-structure/SKILL.md
source_sha256: 164444359d74f695a84faf7ea558d0eef39c75561e6b26669f97a165c6f75538
heuristic_path: memory/_pending/normalize/jobs/bmad-editorial-review-structure.heuristic.json
output_path: memory/concepts/_ssl/bmad-editorial-review-structure.json
enqueued_at: 2026-05-05T14:51:31.743Z
warnings_count: 1
---

# Normalize job — `bmad-editorial-review-structure`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/bmad-editorial-review-structure/SKILL.md`](.claude/skills/bmad-editorial-review-structure/SKILL.md) — SHA-256 `164444359d74f695a84faf7ea558d0eef39c75561e6b26669f97a165c6f75538`
- Heuristic 1차 (warnings 1): [`memory/_pending/normalize/jobs/bmad-editorial-review-structure.heuristic.json`](memory/_pending/normalize/jobs/bmad-editorial-review-structure.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/bmad-editorial-review-structure.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/bmad-editorial-review-structure.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
