# Rot Bench — Measuring Memory Rot

> Reproduction command, adapter protocol, and honest-reporting rules for the
> memory rot benchmark. See [`docs/BENCHMARK.md`](./BENCHMARK.md) for the
> broader retrieval/QA measurement methodology this benchmark shares
> principles with.

## What memory rot is

The claim under test: *"append-only memory degrades retrieval quality as it
accumulates, and memory-brain's governed retrieval is more robust to that
accumulation."* Rot Bench measures this directly instead of assuming it —
LongMemEval questions are evaluated at four checkpoints of haystack-session
accumulation (25% / 50% / 75% / 100% of a question's sessions, ordered by
date), and retrieval quality is tracked across checkpoints per condition.

Results are reported as measured, in both directions — no tuning constant is
introduced to make either condition look better (same rule as
`docs/BENCHMARK.md` §3 "금지 사항").

### Cohort results (n=64, `memory/reports/rot-bench-cohort-latest.md`, generated 2026-07-24)

Cohort mode restricts the question set to the 64 questions (out of 500) whose
answer sessions are covered at **all four** checkpoints, so every row below
is the same fixed set of questions — the checkpoint-over-checkpoint
comparison isn't confounded by a changing question population.

| checkpoint | condition | n | R@5 (hit) | MRR | avg top-5 tokens (est.) |
|---|---|---|---|---|---|
| 25% | naive | 64 | 92.2% | 0.831 | 15610 |
| 25% | governed | 64 | 96.9% | 0.886 | 16848 |
| 25% | consolidated | 64 | 65.6% | 0.621 | 1176 |
| 50% | naive | 64 | 89.1% | 0.775 | 15900 |
| 50% | governed | 64 | 92.2% | 0.830 | 17019 |
| 50% | consolidated | 64 | 62.5% | 0.543 | 1214 |
| 75% | naive | 64 | 82.8% | 0.723 | 16121 |
| 75% | governed | 64 | 84.4% | 0.734 | 17267 |
| 75% | consolidated | 64 | 57.8% | 0.529 | 1305 |
| 100% | naive | 64 | 79.7% | 0.722 | 16046 |
| 100% | governed | 64 | 82.8% | 0.720 | 16945 |
| 100% | consolidated | 64 | 57.8% | 0.505 | 1278 |

Both `naive` and `governed` recall degrade as sessions accumulate (naive:
92.2% → 79.7%, governed: 96.9% → 82.8%), and `governed` stays consistently
above `naive` at every checkpoint. `consolidated` trades a large drop in
token footprint (~1.2K vs ~16-17K avg top-5 tokens) for lower recall — see
the source report for the full question-type breakdown and consolidation
stats.

## Methodology summary

- **Checkpoints**: for each question, haystack sessions are sorted by date
  ascending (or dataset order with `--seed-order`); at checkpoint `f` only
  the first `⌈f·N⌉` sessions form the haystack.
- **Evaluate/skip**: a question is only scored at checkpoint `f` if *all* of
  its `answer_session_ids` are already present in that partial haystack —
  otherwise it's skipped (an unseen answer session isn't scored as "no
  answer").
- **Cohort mode** (`--cohort`): only questions covered at all four
  checkpoints are included, giving a fixed question population for direct
  checkpoint-to-checkpoint comparison.
- **Conditions**: `naive` (lexical+vector hybrid, no date window/body_user
  weighting/PRF/rerank — a stand-in for an append-only dump, not a
  strawman), `governed` (memory-brain's production retrieval config,
  `retrieveTopSessions` with PRF), `consolidated` (governed retrieval over
  `SessionConsolidator`-deduplicated sessions, `--consolidated`), and
  `external` (a subprocess adapter, `--adapter`, see below).
- **Metrics**: R@5 is a binary per-question hit (at least one answer session
  in the top-5); MRR is the reciprocal rank of the first answer session
  (0 if outside top-10); avg top-5 tokens is `estimateTokens` summed over
  the top-5 session texts.

Reproduction:

```bash
cfgm rot-bench -- --cohort
```

See [`docs/BENCHMARK.md`](./BENCHMARK.md) for dataset provenance (SHA-256,
license) and the held-out split policy used by the sibling retrieval/QA
benchmarks.

## Adapter protocol

`cfgm rot-bench -- --adapter "<command...>"` spawns your command **once**
per run and drives it over stdin/stdout with newline-delimited JSON
(JSONL) — one evaluation per line, in both directions. This lets any memory
tool, in any language, be measured under the exact same checkpoints and
scoring as `naive`/`governed`/`consolidated`.

- The adapter process is spawned once for the whole run (not once per
  question) — requests are sent to it sequentially, one at a time, waiting
  for each response before sending the next.
- **Request** (one line per evaluation), written to the adapter's stdin:

  ```json
  {"id": "q_1@0.25", "query": "What degree did I graduate with?", "top_k": 10, "sessions": [{"id": "s1", "date": "2023/01/10 (Tue)", "text": "..."}, {"id": "s2", "text": "..."}]}
  ```

  `id` is `"<questionId>@<checkpoint>"`. `sessions` is the full partial
  haystack for that checkpoint (`date` is optional). `top_k` is the number
  of ranked session ids expected back.

- **Response** (one line per evaluation, matched by `id`), read from the
  adapter's stdout:

  ```json
  {"id": "q_1@0.25", "ranked": ["s1", "s7", "s3"]}
  ```

  `ranked` should have at most `top_k` entries, most relevant first. Extra
  entries are ignored; ids not present in that request's `sessions` are
  filtered out before scoring.

- **Timeout**: 30 seconds per evaluation by default (`--adapter-timeout-ms`
  is not exposed as a CLI flag today — pass a custom `timeoutMs` via the
  `RotBenchOpts.externalAdapter` option if calling the library directly).
- **Error handling**: a timeout, malformed JSON line, non-string-array
  `ranked`, or the adapter process exiting early (EOF) is recorded as an
  error for that evaluation and scored honestly as `ranked: []` (a miss) —
  no partial credit, no crash. Errored evaluations still count toward
  `externalErrorCount` in the result, which is surfaced in the report and
  CLI summary.
- Implementation: [`src/core/bench/RotAdapter.ts`](../src/core/bench/RotAdapter.ts)
  (`runExternalAdapter`); integration point:
  [`src/core/bench/RotBench.ts`](../src/core/bench/RotBench.ts)
  (`RotBenchOpts.externalAdapter`).

## Measure your memory tool

A minimal reference adapter is provided at
[`examples/rot-adapter-bm25.ts`](../examples/rot-adapter-bm25.ts) — it reads
JSONL requests from stdin, ranks sessions by a simple word-overlap score
(not an optimization target, just a protocol demonstration), and writes
JSONL responses to stdout.

```bash
cfgm rot-bench -- --adapter "bun examples/rot-adapter-bm25.ts" --adapter-label bm25-example
```

`--adapter-label` sets the display name used in the report and CLI output
(defaults to the first token of the command). `--adapter` can be combined
with `--cohort` and `--consolidated`.

To measure your own tool, implement the protocol above in any language that
can read/write lines over stdin/stdout, and pass its invocation command to
`--adapter`.

## Submitting results

Results from this benchmark are welcome as a PR adding or updating a report
under `memory/reports/`. Self-run results (numbers you produced by running
`cfgm rot-bench` yourself, especially for a third-party adapter) should be
labeled **self-reported** in the PR description — this project does not
independently re-run submitted adapters before merging, so honesty here is
load-bearing for the whole benchmark's credibility.

## Threats to validity

1. **This measures robustness to session-count accumulation, not calendar
   time.** Checkpoints are haystack session-count ratios (`f`), not a
   controlled elapsed-time measurement (days/weeks/months). The benchmark
   observes the correlation between session count and retrieval quality —
   it does not directly demonstrate rot as a function of calendar time.
2. **The `naive` condition is an approximation.** It uses lexical+vector
   hybrid search (no date window / body_user weighting / PRF / rerank) as a
   stand-in for an append-only dump, specifically to avoid a strawman. A
   real append-only system (pure vector similarity, pure keyword search,
   etc.) may perform worse, or differently, than this approximation.
3. **Single run.** Retrieval is deterministic (FTS5 + hashed n-gram vectors
   + fixed tie-break), so repeated-run variance is zero, but dataset-level
   sampling bias is not controlled for.
4. **Honesty principle.** This benchmark reports results as measured in
   either direction and does not introduce tuning constants that favor
   either condition.
