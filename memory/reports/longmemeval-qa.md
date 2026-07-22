# LongMemEval QA Benchmark (host-delegated)

> 생성: 2026-07-22T13:17:57.004Z · 답변 255/500 · judge 판정 255
> proxy 지표 (EM/contains/F1) 는 참고용 — **공식 지표는 judge accuracy**.

| 지표 | 값 |
|---|---|
| answered | 255/500 |
| exact match (proxy) | 3.9% |
| contains match (proxy) | 57.6% |
| mean token-F1 (proxy) | 0.255 |
| **judge accuracy (공식)** | 89.0% |

## Question type 별

| type | n | mean F1 | judge acc |
|---|---|---|---|
| knowledge-update | 30 | 0.240 | 93.3% |
| multi-session | 72 | 0.111 | 79.2% |
| single-session-assistant | 28 | 0.494 | 100.0% |
| single-session-preference | 12 | 0.177 | 58.3% |
| single-session-user | 41 | 0.428 | 97.6% |
| temporal-reasoning | 72 | 0.226 | 93.1% |
