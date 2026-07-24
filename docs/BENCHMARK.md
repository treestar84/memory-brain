# Benchmark Methodology — 팩트체크 가능한 측정 규약

> 목적: memory-brain 의 벤치마크 수치를 **누구든 재현·검증할 수 있게** 만드는
> 규약. 모든 공표 수치는 본 문서의 절차를 따르며, 절차를 벗어난 수치는
> 공표하지 않는다.

## 1. 데이터셋

- **LongMemEval_S** (Wu et al., ICLR 2025) — 500문항, MIT 라이선스
- 다운로드: `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json`
- **SHA-256**: `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`
  (재현 시 반드시 대조 — 데이터 변조/버전 차이 반박 장치)
- repo 에 커밋하지 않음 (`data/` gitignore)
- **LongMemEval_M** (동일 출처, rot-bench 용) — 500문항, 문항당 ~500세션 (2.5GB)
- 다운로드: `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_m_cleaned.json`
- **SHA-256**: `9d79e5524794a2e6900a3aa9cb7d9152c5a3e8319c9a87c25494ba1eacee495f`

## 2. Held-out split (과적합 방지)

- **분할 규칙**: `splitOf(question_id)` — question_id 의 FNV-1a 32-bit 해시
  짝홀 (`src/core/bench/LongMemEval.ts`). 데이터 내용과 무관한 결정론적
  분할로, 사전 공표되어 cherry-picking 이 불가능하다.
- 결과: dev 245문항 / test 255문항.
- **규약**: 모든 튜닝 결정 (파라미터·기법 채택/기각) 은 **dev 만** 사용.
  test 는 구성 확정 후 **1회만** 측정해 보고. dev–test 격차가 크면 과적합
  신호로 간주하고 해당 기법을 기각한다.

## 3. Retrieval 트랙 (LLM 호출 0)

- 프로토콜: 논문 §4.2 session-level Recall@K — 질문별 haystack 세션 인덱싱
  → 질문 검색 → `answer_session_ids` 대비 macro recall@{1,3,5,10} + MRR.
- 실행: `cfgm bench-lme -- --split test --prf` (report 에 config 문자열 기록)
- 결정론: 같은 입력이면 같은 결과 (FTS5 + 해시 n-gram 벡터 + 고정 tie-break).

### 튜닝 로그 (dev 기준 — 기각 포함 전부 기록)

| 기법 | dev R@5 | 판정 |
|---|---|---|
| baseline (V3.30 구성) | 92.8% | 기준선 |
| turn-level granularity + max-pooling | 89.7% | **기각** (-3.1pp — 발화 단절이 문맥 손실) |
| PRF (top-3 고정 + 꼬리 RRF 재정렬) | **94.3%** | **채택** (+1.5pp, preference +11.1pp) |

- **확증 (test, 1회)**: R@5 **93.2%** · R@10 95.8% · MRR 0.921 — dev 와
  1.1pp 차이로 일반화 확인.
- **전체 500 (추이 비교용)**: R@5 93.7% · R@10 96.5% · MRR 0.928.

### 금지 사항

- 벤치 정답에서 역산한 도메인 상수 (hypernym 사전 류) 를 검색 코드에 넣는 것
  — V3.30 설계 심사에서 기각된 전례 유지.
- test split 에서의 반복 측정·튜닝.

## 4. QA 트랙 (host-위임)

- **답변 생성**: 문항별 retrieval top-10 세션을 컨텍스트로 answer job 생성
  (`cfgm lme-enqueue`). **job 에 ground truth 미포함** (누출 차단 —
  `tests/core/bench/LmeQa.test.ts` 가 회귀 고정). 답변 모델과 prompt 버전은
  job frontmatter 에 기록 (`prompt_version`).
- **채점**: LLM judge 가 정답 대비 의미 동치 판정 (표현 차이 허용, 사실·수치
  불일치 불허, abstention 정답엔 abstention 답변만 정답). judge 는 답변
  생성과 **별개 컨텍스트**의 모델 인스턴스.
- 공표 시 명기 의무: 답변 모델 · judge 모델 · prompt 버전 · 실행일.
- 2026-07-22 실측: 답변 claude-sonnet-5 · judge claude-sonnet-5 · prompt v1
  → **QA accuracy 86.2%** (500/500).

## 5. 재현 절차 (전체)

```bash
git clone https://github.com/treestar84/memory-brain.git && cd memory-brain
bun install
mkdir -p data/longmemeval && cd data/longmemeval
curl -LO https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json
shasum -a 256 longmemeval_s_cleaned.json   # 위 SHA-256 과 대조
cd ../..
bun run bench:lme -- --split test --prf    # retrieval 확증 수치 재현 (LLM 0)
```

QA 트랙 재현은 LLM 이 필요하다: `cfgm lme-enqueue` → 임의 LLM 으로 job 처리
→ `cfgm lme-score --judge-enqueue` → judge 처리 → `--collect`. 사용 모델을
결과에 명기할 것.

## 6. 타사 비교 규칙

- 비교표에는 **동일 지표·동일 데이터셋** 수치만 나란히 둔다 (retrieval
  recall 과 QA accuracy 를 섞지 않는다).
- 타사 수치는 반드시 출처 (논문/블로그 URL + 날짜 + 사용 모델) 를 병기한다.
- 타사 수치를 우리 환경에서 재실행한 것이 아니라면 "self-reported" 로 표기.

## 7. 알려진 한계 (threats to validity)

1. **judge 가 자체 실행** — 공식 리더보드 부재로 제3자 검증은 재현 절차
   공개로 갈음. judge 모델 편향 가능성 있음 (동일 벤더 모델).
2. **단일 실행** — 검색은 결정론이라 분산 0, QA 는 생성 온도에 따라 ±1~2pp
   변동 가능.
3. **preference 유형** (n=30) — 표본이 작아 ±수 pp 는 노이즈 범위.
4. 500문항 전체로 이전에 튜닝한 이력 (V3.30) 이 있음 — split 도입 (V3.32)
   이후의 수치만 held-out 보증이 성립. test 수치가 canonical.
