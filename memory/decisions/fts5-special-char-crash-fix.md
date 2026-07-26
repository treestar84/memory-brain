---
id: decision.fts5-special-char-crash-fix
type: decision
status: active
confidence: high
tags: [search, fts5, bugfix, reliability]
related: [project.memory-brain]
supersedes: []
updated_at: 2026-07-21
---

# 검색어 특수문자로 인한 FTS5 크래시 수정

## Summary

<!-- claim:cl-fts5-001 -->
"KG-Brain" 처럼 하이픈(`-`)이 포함된 실사용 검색어가 SQLite FTS5 의 MATCH 쿼리 파서를 깨뜨려 크래시하는 버그를, 내부 memory quality 벤치마크(`cfgm bench`)를 처음 돌렸을 때 발견했다.

## Key Decisions

<!-- claim:cl-fts5-002 -->
원인: FTS5 쿼리 문법에서 `-` 는 NOT 연산자 등으로 해석될 수 있어, 사용자가 입력한 원문 검색어를 그대로 MATCH 절에 넣으면 구문 오류가 나거나 의도와 다른 결과가 나온다.

<!-- claim:cl-fts5-003 -->
수정: `SearchIndex.queryFtsWithFallback()` (`src/core/search/SearchIndex.ts`) 에 3단 fallback 을 도입했다 — ① raw 쿼리(사용자 고급 구문 보존) 시도 → 구문 오류나 0건이면 ② `toContentFtsQuery()` (불용어 제거·경량 스테밍 적용 쿼리) 시도 → 그래도 안 되면 ③ `toLooseFtsQuery()` (전체 토큰 OR + prefix 매치, 최후 안전망). 각 단계는 try/catch 로 감싸 구문 오류가 나도 다음 단계로 넘어가며 절대 크래시하지 않는다.

<!-- claim:cl-fts5-004 -->
이 fallback 구조는 이후 V3.30 에서 LongMemEval 검색 품질 튜닝을 위한 content 쿼리 단계로 확장되며 그대로 재사용됐다 — 처음엔 크래시 방지용이었지만, 나중엔 정확도 개선의 기반이 됐다.

## Evidence

- `src/core/search/SearchIndex.ts` — `queryFtsWithFallback()` 메서드, 주석에 "FTS MATCH 3단 fallback (V3.28 방어 → V3.30 content 쿼리 삽입)" 명시.
- `CHANGELOG.md` V3.28 항목 — "부수 수정: 실사용 하이픈 쿼리 ('KG-Brain') FTS5 크래시 → sanitize 폴백 (벤치마크 첫 실행이 발견)."

## Related

- [[project.memory-brain]]
