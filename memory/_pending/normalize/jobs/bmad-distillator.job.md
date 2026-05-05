---
job_id: norm-2026-05-05-bmad-distillator
status: done
done_at: 2026-05-05T15:50:27.000Z
source_path: .claude/skills/bmad-distillator/SKILL.md
source_sha256: 756ee0706ff6b8a3d5726b465e81ba244e4eaeba21b7de0d2390473acebb5ddc
heuristic_path: memory/_pending/normalize/jobs/bmad-distillator.heuristic.json
output_path: memory/concepts/_ssl/bmad-distillator.json
enqueued_at: 2026-05-05T15:39:32.761Z
warnings_count: 1
---

# Normalize job — `bmad-distillator`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/bmad-distillator/SKILL.md`](.claude/skills/bmad-distillator/SKILL.md) — SHA-256 `756ee0706ff6b8a3d5726b465e81ba244e4eaeba21b7de0d2390473acebb5ddc`
- Heuristic 1차 (warnings 1): [`memory/_pending/normalize/jobs/bmad-distillator.heuristic.json`](memory/_pending/normalize/jobs/bmad-distillator.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/bmad-distillator.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/bmad-distillator.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
