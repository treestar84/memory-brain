# Memory Quality Benchmark

> 생성: 2026-07-21T15:25:18.463Z · corpus: wiki 5 pages / skills 12 / vector dims 256
> 실행: `bun run bench` (fixtures/bench/cases.json). 수치는 실제 memory/ 코퍼스 대상 측정값.

## Router 적중률 (RouterMappings.resolve)

| 지표 | 값 |
|---|---|
| lane hit rate (기대 lane 전부 포함) | 87.5% (14/16) |
| macro lane precision | 84.4% |
| macro lane recall | 87.5% |
| file hit rate | 100.0% |

### Miss 케이스 (튜닝 대상)

- `r-paraphrase-evidence` "이 주장의 출처가 뭐야" — 기대 [decision] vs 실제 []
- `r-paraphrase-dup` "중복된 기억 정리해줘" — 기대 [governance] vs 실제 []

## Wiki 검색 recall (fts vs hybrid)

| mode | recall@1 | recall@3 | recall@5 | MRR |
|---|---|---|---|---|
| fts | 62.5% | 87.5% | 87.5% | 0.729 |
| hybrid | 75.0% | 100.0% | 100.0% | 0.854 |

hybrid 효과 (recall@5): +12.5pp — 개선

### hybrid 가 구제한 케이스 (fts 0건 → hybrid 적중)

- `w-morph` "라우팅하는 정책들의 제한사항" → rank 1

## Skill discovery recall (fts vs hybrid)

| mode | recall@1 | recall@3 | recall@5 | MRR |
|---|---|---|---|---|
| fts | 100.0% | 100.0% | 100.0% | 1.000 |
| hybrid | 100.0% | 100.0% | 100.0% | 1.000 |

hybrid 효과 (recall@5): +0.0pp — 동일
