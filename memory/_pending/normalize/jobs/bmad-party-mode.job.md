---
job_id: norm-2026-05-05-bmad-party-mode
status: done
done_at: 2026-05-05T00:52:00.000Z
source_path: .claude/skills/bmad-party-mode/SKILL.md
source_sha256: 0e24fb777af648d3f093b6f8932a4b91a9fe1b459439b661fcb7879ac50e2ac0
heuristic_path: memory/_pending/normalize/jobs/bmad-party-mode.heuristic.json
output_path: memory/concepts/_ssl/bmad-party-mode.json
enqueued_at: 2026-05-05T00:47:10.012Z
warnings_count: 4
---

# Normalize job — `bmad-party-mode`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/bmad-party-mode/SKILL.md`](.claude/skills/bmad-party-mode/SKILL.md) — SHA-256 `0e24fb777af648d3f093b6f8932a4b91a9fe1b459439b661fcb7879ac50e2ac0`
- Heuristic 1차 (warnings 4): [`memory/_pending/normalize/jobs/bmad-party-mode.heuristic.json`](memory/_pending/normalize/jobs/bmad-party-mode.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/bmad-party-mode.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/bmad-party-mode.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
