# LongMemEval QA Benchmark (host-delegated)

> 생성: 2026-07-21T22:23:36.896Z · 답변 500/500 · judge 판정 500
> proxy 지표 (EM/contains/F1) 는 참고용 — **공식 지표는 judge accuracy**.

| 지표 | 값 |
|---|---|
| answered | 500/500 |
| exact match (proxy) | 6.0% |
| contains match (proxy) | 55.6% |
| mean token-F1 (proxy) | 0.319 |
| **judge accuracy (공식)** | 86.2% |

## Question type 별

| type | n | mean F1 | judge acc |
|---|---|---|---|
| knowledge-update | 78 | 0.343 | 93.6% |
| multi-session | 133 | 0.162 | 77.4% |
| single-session-assistant | 56 | 0.587 | 100.0% |
| single-session-preference | 30 | 0.141 | 43.3% |
| single-session-user | 70 | 0.459 | 98.6% |
| temporal-reasoning | 133 | 0.317 | 88.0% |
