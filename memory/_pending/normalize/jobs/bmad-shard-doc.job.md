---
job_id: norm-2026-05-05-bmad-shard-doc
status: pending
source_path: .claude/skills/bmad-shard-doc/SKILL.md
source_sha256: 3a1538536514725fd4f31aded280ee56b9645fc61d114fd94aacb3ac52304e52
heuristic_path: memory/_pending/normalize/jobs/bmad-shard-doc.heuristic.json
output_path: memory/concepts/_ssl/bmad-shard-doc.json
enqueued_at: 2026-05-05T00:47:10.012Z
warnings_count: 3
---

# Normalize job — `bmad-shard-doc`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/bmad-shard-doc/SKILL.md`](.claude/skills/bmad-shard-doc/SKILL.md) — SHA-256 `3a1538536514725fd4f31aded280ee56b9645fc61d114fd94aacb3ac52304e52`
- Heuristic 1차 (warnings 3): [`memory/_pending/normalize/jobs/bmad-shard-doc.heuristic.json`](memory/_pending/normalize/jobs/bmad-shard-doc.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/bmad-shard-doc.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/bmad-shard-doc.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
