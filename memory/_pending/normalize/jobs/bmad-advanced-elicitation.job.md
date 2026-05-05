---
job_id: norm-2026-05-05-bmad-advanced-elicitation
status: done
done_at: 2026-05-05T15:50:27.000Z
source_path: .claude/skills/bmad-advanced-elicitation/SKILL.md
source_sha256: 1a7396d28ba7524588d44e5eac9b6a41372a0bf8d9e1c4c469728493abd5e12f
heuristic_path: memory/_pending/normalize/jobs/bmad-advanced-elicitation.heuristic.json
output_path: memory/concepts/_ssl/bmad-advanced-elicitation.json
enqueued_at: 2026-05-05T15:39:32.761Z
warnings_count: 4
---

# Normalize job — `bmad-advanced-elicitation`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/bmad-advanced-elicitation/SKILL.md`](.claude/skills/bmad-advanced-elicitation/SKILL.md) — SHA-256 `1a7396d28ba7524588d44e5eac9b6a41372a0bf8d9e1c4c469728493abd5e12f`
- Heuristic 1차 (warnings 4): [`memory/_pending/normalize/jobs/bmad-advanced-elicitation.heuristic.json`](memory/_pending/normalize/jobs/bmad-advanced-elicitation.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/bmad-advanced-elicitation.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/bmad-advanced-elicitation.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
