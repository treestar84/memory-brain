---
job_id: norm-2026-05-05-bmad-index-docs
status: done
done_at: 2026-05-05T15:50:27.000Z
source_path: .claude/skills/bmad-index-docs/SKILL.md
source_sha256: a855d7060414e73ca4fe8e1a3e1cc4d0f2ce394846e52340bdf5a1317e0d234a
heuristic_path: memory/_pending/normalize/jobs/bmad-index-docs.heuristic.json
output_path: memory/concepts/_ssl/bmad-index-docs.json
enqueued_at: 2026-05-05T15:39:32.761Z
warnings_count: 5
---

# Normalize job — `bmad-index-docs`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/bmad-index-docs/SKILL.md`](.claude/skills/bmad-index-docs/SKILL.md) — SHA-256 `a855d7060414e73ca4fe8e1a3e1cc4d0f2ce394846e52340bdf5a1317e0d234a`
- Heuristic 1차 (warnings 5): [`memory/_pending/normalize/jobs/bmad-index-docs.heuristic.json`](memory/_pending/normalize/jobs/bmad-index-docs.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/bmad-index-docs.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/bmad-index-docs.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
