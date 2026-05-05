---
job_id: norm-2026-05-05-bmad-review-edge-case-hunter
status: done
done_at: 2026-05-06T00:00:00.000Z
source_path: .claude/skills/bmad-review-edge-case-hunter/SKILL.md
source_sha256: f49ed9976f46b4cefa1fc8b4f0a495f16089905e6a7bbf4ce73b8f05c9ae3ee6
heuristic_path: memory/_pending/normalize/jobs/bmad-review-edge-case-hunter.heuristic.json
output_path: memory/concepts/_ssl/bmad-review-edge-case-hunter.json
enqueued_at: 2026-05-05T14:51:31.743Z
warnings_count: 3
---

# Normalize job — `bmad-review-edge-case-hunter`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/bmad-review-edge-case-hunter/SKILL.md`](.claude/skills/bmad-review-edge-case-hunter/SKILL.md) — SHA-256 `f49ed9976f46b4cefa1fc8b4f0a495f16089905e6a7bbf4ce73b8f05c9ae3ee6`
- Heuristic 1차 (warnings 3): [`memory/_pending/normalize/jobs/bmad-review-edge-case-hunter.heuristic.json`](memory/_pending/normalize/jobs/bmad-review-edge-case-hunter.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/bmad-review-edge-case-hunter.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/bmad-review-edge-case-hunter.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
