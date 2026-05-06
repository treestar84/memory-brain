---
job_id: norm-2026-05-06-app-store-screenshots
status: done
source_path: .claude/skills/app-store-screenshots/SKILL.md
source_sha256: 69cc79a20801c7efccd3dfe202a3998b3189b7c7bf394cbe74a9b9c11141f13f
heuristic_path: memory/_pending/normalize/jobs/app-store-screenshots.heuristic.json
output_path: memory/concepts/_ssl/app-store-screenshots.json
enqueued_at: 2026-05-06T16:10:26.532Z
warnings_count: 3
---

# Normalize job — `app-store-screenshots`

이 작업의 처리 방법은 [`memory/_pending/normalize/_spec/prompt.md`](memory/_pending/normalize/_spec/prompt.md) + [`memory/_pending/normalize/_spec/ssl-schema.md`](memory/_pending/normalize/_spec/ssl-schema.md) 를 먼저 읽고 따른다.

## 입력

- 원본: [`.claude/skills/app-store-screenshots/SKILL.md`](.claude/skills/app-store-screenshots/SKILL.md) — SHA-256 `69cc79a20801c7efccd3dfe202a3998b3189b7c7bf394cbe74a9b9c11141f13f`
- Heuristic 1차 (warnings 3): [`memory/_pending/normalize/jobs/app-store-screenshots.heuristic.json`](memory/_pending/normalize/jobs/app-store-screenshots.heuristic.json)

## 완료 후

1. `memory/concepts/_ssl/app-store-screenshots.json` 에 enriched SSL JSON 저장.
2. `bun run bin/cfgm-ssl-validate.ts memory/concepts/_ssl/app-store-screenshots.json` 호출.
3. exit 0 → 본 파일 frontmatter `status: done` 으로 갱신.
4. exit ≠ 0 → `status: failed` + `failure_reason: <stderr 일부>` 추가.
