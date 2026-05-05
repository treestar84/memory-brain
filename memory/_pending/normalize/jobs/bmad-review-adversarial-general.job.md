---
job_id: norm-2026-05-05-bmad-review-adversarial-general
status: done
done_at: 2026-05-05T15:50:27.000Z
source_path: .claude/skills/bmad-review-adversarial-general/SKILL.md
source_sha256: 7bffc39e6dba4d9123648c5d4d79e17c3c5b1efbd927c3fe0026c2dbb8d99cff
heuristic_path: memory/_pending/normalize/jobs/bmad-review-adversarial-general.heuristic.json
output_path: memory/concepts/_ssl/bmad-review-adversarial-general.json
enqueued_at: 2026-05-05T15:39:32.761Z
warnings_count: 4
---

# Normalize job — `bmad-review-adversarial-general`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/bmad-review-adversarial-general/SKILL.md`](.claude/skills/bmad-review-adversarial-general/SKILL.md) — SHA-256 `7bffc39e6dba4d9123648c5d4d79e17c3c5b1efbd927c3fe0026c2dbb8d99cff`
- Heuristic 1차 (warnings 4): [`memory/_pending/normalize/jobs/bmad-review-adversarial-general.heuristic.json`](memory/_pending/normalize/jobs/bmad-review-adversarial-general.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/bmad-review-adversarial-general.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/bmad-review-adversarial-general.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
