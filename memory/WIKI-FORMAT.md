# memory/WIKI-FORMAT.md — Wiki Page 형식 명세

> 비전 §5.4 + OpenClaw 포맷 답습 (PR-V3.4). canonical knowledge page 의 표준 형식.
> 적용 위치: `memory/{projects,concepts,decisions}/*.md`. `memory/sources/` 는 raw evidence라 형식 자유.

## 기본 형식

```markdown
---
id: <type>.<slug>
type: project | concept | decision
status: active | draft | superseded | archived | deprecated
confidence: high | medium | low
tags: [tag1, tag2]
related: [<id>, <id>]
supersedes: [<id>]
updated_at: 2026-04-27
---

# <제목>

## Summary

<!-- claim:cl-<unique-id> -->
한 줄 핵심 진술. claim id 직전 HTML 주석으로 표기.

## Key Decisions / Concepts / Project State

<!-- claim:cl-<id> -->
의미 있는 진술 1건당 claim id 1개.

<!-- claim:cl-<id> -->
다음 진술.

## Evidence

- `<path:line>` — 인용 (선택적)
- `commit:<hash>` — 코드 결정
- `docs/adr/<n>.md` — ADR 인용
- `사용자 발화 (YYYY-MM-DD)`: "발화 인용"

## Related

- [[id-1]] — 같은 주제 다른 페이지 (cross-link)
- [[id-2]]
```

## frontmatter 필드 (의무 / 선택)

| 필드 | 의무? | 설명 |
|---|---|---|
| `id` | ✅ | `<type>.<slug>` (예: `decision.oss-incorporation`). 전역 unique. |
| `type` | ✅ | `project` / `concept` / `decision` 중 하나. 디렉토리와 일치. |
| `status` | ✅ | `active` / `draft` / `superseded` / `archived` / `deprecated` |
| `confidence` | 선택 | `high` / `medium` / `low`. 미지정 시 `medium` 가정. |
| `tags` | 선택 | 배열. 검색 / 필터링용. |
| `related` | 선택 | 다른 wiki page id 배열. cross-link. |
| `supersedes` | 선택 | superseded 시 이전 page id 배열. |
| `updated_at` | ✅ | ISO date. 수정 시점에 갱신 의무. |

## claim id 인라인 형식

```markdown
<!-- claim:cl-<unique-id> -->
진술 텍스트 (1~3 문장).
```

- HTML 주석 (`<!-- ... -->`) 으로 markdown 렌더에는 안 보임
- `cl-<id>` 형식 — claim id 전역 unique
- 의미 있는 진술 1건당 claim id 1개. 모든 문장에 다는 게 아니라 **외부에서 인용 가능한 단위**에만.
- WikiReader 가 grep 으로 추출 + ClaimStore (`.memory-brain/claims/ledger.jsonl`) 와 cross-reference 가능 (PR-V3.5 통합 예정)

## evidence pointer 형식

`Evidence` 섹션에 다음 중 하나 이상:

| 형식 | 예시 | 의미 |
|---|---|---|
| `<file>:<line>` | `src/core/router/Router.ts:23` | 코드 위치 |
| `commit:<hash>` | `commit:d6c4529` | git commit |
| `docs/adr/<n>.md` | `docs/adr/021-honcho-pattern-only.md` | ADR 인용 |
| `사용자 발화 (YYYY-MM-DD)` | `사용자 발화 (2026-04-27): "..."` | 사용자 직접 발화 |
| `flow-delta:<bundleId>:<blockId>` | `flow-delta:bnd-x:blk-1` | FlowGraph 블록 |

## 운영 규칙 (vision §5.4 답습)

1. **append 금지** — 새 파일 만들지 말고 기존 page 에 upsert / merge / replace.
2. **claim id 변경 금지** — supersede 만 가능. id 자체는 영구.
3. **evidence 의무** — `Evidence` 섹션 비우지 말 것. 출처 명확.
4. **cross-link 권장** — `related` frontmatter + 본문 `[[id]]` 사용.
5. **status 전환 정책**:
   - `draft` → `active`: evidence + claim ≥ 1 후
   - `active` → `superseded`: 새 page가 supersedes 인용 시 자동
   - `active` → `archived`: 60일 미접근 + governance lint 권고
   - `active` → `deprecated`: 명시 폐기 결정

## sample 페이지

- `memory/decisions/oss-incorporation.md` — ADR-019/021 합의
- `memory/concepts/memory-routing.md` — 비전 §6 정리
- `memory/projects/memory-brain.md` — 본 프로젝트 자체

## 후속 PR

- **PR-V3.5**: claim id ↔ ClaimStore ledger cross-reference. wiki page 의 claim 인라인이 `.memory-brain/claims/ledger.jsonl` 의 claim 과 자동 link.
- **PR-V3.6**: derived index (sqlite) — wiki page 전문 검색.
- **PR-V3.7**: governance lint — broken cross-link, evidence 누락, claim id 충돌, stale page 검출.

## 참고

- 비전 §5.4 — canonical knowledge page 규칙
- OpenClaw `openclaw/openclaw` — skill·SOUL.md 포맷 답습 (ADR-019 §결정 §2)
- `memory/SCHEMA.md` — 7-layer 디렉토리 트리
- `memory/ROUTER.md` — wiki lane 라우팅 정책
