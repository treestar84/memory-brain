# LongMemEval Retrieval Benchmark (session-level)

> 생성: 2026-07-21T15:24:49.569Z · 평가 500 문항 (근거 라벨 없는 0 문항 제외, abstention 30 문항 포함)
> 프로토콜: 질문별 haystack 세션 인덱싱 → 질문 검색 → answer_session_ids 대비 Recall@K.
> LLM 호출 0 (retrieval-only 트랙). 실행: `bun run bench:lme`
> harness V3.30: content 쿼리 + rescue-rerank + temporal 날짜창 + user-turn 가중 + 요일 병기

## Overall (abs 포함 — run 간 추이 비교용)

| mode | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| fts | 56.6% | 87.2% | 91.8% | 95.3% | 0.927 |
| hybrid | 56.6% | 87.2% | 92.2% | 96.2% | 0.927 |

## Overall (abstention 제외)

| mode | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| fts | 57.4% | 87.9% | 92.4% | 95.8% | 0.931 |
| hybrid | 57.4% | 87.9% | 92.7% | 96.5% | 0.932 |

## Question type 별

### knowledge-update (78)

| mode | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| fts | 49.4% | 97.4% | 97.4% | 97.4% | 0.987 |
| hybrid | 49.4% | 97.4% | 98.1% | 98.1% | 0.987 |

### multi-session (133)

| mode | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| fts | 37.9% | 80.5% | 87.2% | 94.6% | 0.932 |
| hybrid | 37.9% | 80.5% | 88.7% | 95.1% | 0.933 |

### single-session-assistant (56)

| mode | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| fts | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 |
| hybrid | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 |

### single-session-preference (30)

| mode | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| fts | 40.0% | 63.3% | 83.3% | 90.0% | 0.568 |
| hybrid | 40.0% | 63.3% | 80.0% | 90.0% | 0.561 |

### single-session-user (70)

| mode | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| fts | 92.9% | 95.7% | 97.1% | 98.6% | 0.949 |
| hybrid | 92.9% | 95.7% | 98.6% | 100.0% | 0.951 |

### temporal-reasoning (133)

| mode | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| fts | 46.1% | 83.5% | 88.6% | 92.4% | 0.926 |
| hybrid | 46.1% | 83.5% | 88.5% | 94.2% | 0.927 |
