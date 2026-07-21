# CFGM-OS 확장 가이드

memory-brain 은 코어 수정 없이 확장할 수 있는 seam 을 의도적으로 열어 둔다.
본 문서는 그 지점들의 계약을 정리한다. 전 항목 공통 원칙: LLM API 직접 호출
금지 (`docs/RULES.md` 원칙 2), 신규 의존성 최소화, back-compat.

## 1. Embedder 교체 — semantic 검색 주입

기본 `HashedNgramEmbedder` 는 의존성 0 의 결정론적 char n-gram 벡터라이저다
(lexical similarity — semantic 아님). 실제 embedding 모델을 쓰려면
`Embedder` 인터페이스만 구현하면 된다:

```ts
import type { Embedder } from "./src/core/search/Embedder";

class MyLocalEmbedder implements Embedder {
  readonly dims = 384;
  embed(text: string): Float32Array {
    // 예: 로컬 ONNX 모델, 본인 호스팅 inference 서버 (사용자 자유 선택)
    // 주의: default 흐름에 API key 요구를 넣으면 원칙 2 위반
  }
}

// 주입 지점: SearchIndex.rebuild({ ..., embedder }) 또는 Indexer 5번째 인자
```

계약: `embed()` 는 결정론적이어야 하고 (같은 입력 → 같은 벡터), L2-normalized
권장. dims 가 다른 embedder 로 재인덱싱하면 기존 벡터는 자동 무시된다 (방어 내장).

## 2. Hybrid fusion 전략

`searchWikiHybrid(query, embedder, { fusion })` 의 3전략:

| 전략 | 동작 | 적합 코퍼스 |
|---|---|---|
| `rescue` (기본) | FTS 순위 보존 + 벡터-only 문서 뒤에 보충 | 일반 (안전 기본값) |
| `rescue-rerank` | top-3 고정 + rank 4+ 만 벡터 재정렬 | 긴 문서 대량 (LongMemEval 실측 최고) |
| `rrf` | 동등 Reciprocal Rank Fusion | 짧은 문서 + 오타 다발 |

선택 근거는 CHANGELOG V3.29~30 의 실측 기록 참조.

## 3. 날짜 인식 검색 (dateWindow)

문서 body 선두에 `[date: YYYY/MM/DD ...]` 를 넣으면 인덱싱 시 `wiki_dates`
에 등록되고, `searchWiki(query, { dateWindow })` 로 창 안 문서를 우선 승격할
수 있다 (soft filter — 창 밖 문서도 유지). 자연어 질문에서 창을 뽑으려면:

```ts
import { parseTemporalWindow } from "./src/core/search/TemporalQuery";
const window = parseTemporalWindow("what did I buy two weeks ago", "2026/07/22");
```

## 4. Router 매핑 확장

`src/core/router/RouterMappings.ts` 의 `ROUTER_MAPPINGS` 배열에 rule 을
추가한다 (pattern → lanes → files). `memory/ROUTER.md` 의 표는 사람용 view —
코드가 truth-source 이므로 둘을 함께 갱신한다. 적중률은 `cfgm bench` 의
router 섹션으로 회귀 검증한다 (fixture: `fixtures/bench/cases.json`).

## 5. SSL 어휘 확장 (canonical actions / TBox)

- `memory/concepts/_ssl/_canonical/actions.yaml` — canonical action 시드.
  **yaml 만 편집해 확장** (코드 수정 불필요). `cfgm dedup-actions` 가 N≥3 회
  반복 inline 패턴을 후보로 자동 발견한다.
- `capabilities.yaml` / `scopes.yaml` — 능력·위험 범주 어휘.
- 도메인 특화 어휘는 본체 enum 이 아니라 `vocabulary.yaml` 의 `extensions:`
  영역에만 추가한다.

## 6. OKF 반출입

`cfgm okf-export` 가 L3 wiki 를 Google OKF v0.1 번들로 export 한다. 다른
시스템의 OKF 번들을 받아들이려면 frontmatter 의 `type` (필수) 를 wiki type
(project/concept/decision) 으로 매핑해 `memory/{...}/` 에 두면 된다 — OKF 는
어댑터 경계 뒤 파생물이며 wiki 스키마가 truth 다.

## 7. Host-위임 작업 큐 패턴 (LLM 작업 추가)

새로운 LLM 작업 (요약, 분류 등) 이 필요하면 SDK 를 호출하지 말고 기존 패턴을
따른다:

1. `memory/_pending/<작업명>/jobs/<id>.job.md` — frontmatter 계약:
   `status: pending|in_progress|done|failed`, `attempts`, `max_attempts`,
   `lease_expires_at`, `output_path`
2. `_spec/prompt.md` — host LLM (PAI 세션) 이 읽는 자연어 명세
3. 결과 검증 gate CLI (예: `cfgm-ssl-validate`)
4. orphan 회수는 `src/core/normalizer/JobLifecycle.ts` 의 claim/reap 함수 재사용

## 8. 벤치마크 케이스 추가

- 내부: `fixtures/bench/cases.json` (router / wikiSearch / skillSearch)
- 외부: `src/core/bench/LongMemEval.ts` 어댑터 패턴을 따라 새 데이터셋 어댑터
  작성 (데이터는 `data/` — git 미추적)

주의: 벤치 정답에서 역산한 도메인 상수 (hypernym 사전 류) 를 검색 코드에 넣는
것은 과적합 — 금지 (CHANGELOG V3.30 판정 기록 참조).
