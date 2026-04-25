# PR-6 실행 계획 — `FlowBlock.metadata` reserved key 도입

> 작성일: 2026-04-26
> 상태: codex 토론·ADR-009 결정 반영 → codex plan-check 의뢰 후 구현 착수
> 선행: ADR-009 (Identity sidecar 모델, `0e2ecce`)
> 후속: PR-7 (Bundle→Identity sidecar MVP, 별도 세션)
> 추정 성공률: ~85%
> 추정 TTS: ~0.5~1일

---

## 0. 목적

`FlowBlock`에 provenance/extractor 라벨링용 `metadata?` optional 필드를 reserved key 형태로 추가한다. ADR-008 트리거 **T2 (metadata schema 도입)**를 충족한다.

본 PR은 **schema 도입만** — dedup 키 격상, governance 입력, extractor 통합은 모두 별도 PR로 분리한다.

---

## 1. 결정 사항 (ADR-009 / phase3-candidates v2 §2)

| # | 결정 | 비고 |
|---|---|---|
| M1 | `metadata?: { author?, subject?, source?, confidenceLabel?, [k]: string }` reserved key + 확장 슬롯 | provenance 라벨링 1차 소비자. **`confidenceLabel`** (FlowBlock.confidence number와 혼동 회피, codex 권장) |
| M2 | 값은 `string \| undefined` 단일 타입 | 직렬화 안전 (numeric/boolean 금지) |
| M3 | backfill 없음. 기존 블록은 metadata 없는 상태 허용 | PR-4와 동일 원칙 |
| M4 | 1차 소비자: provenance/extractor 라벨링 only. dedup 키 격상은 **별도 PR(Phase 4 이후)** | 운영 데이터 없이 키 격상은 위험 |
| M5 | `isFlowBlock` guard에 metadata shape 검증 (있으면 object + 모든 값 string) | T2 충족 주장의 실질적 근거 |

---

## 2. 변경 사양

### 2.1 `src/core/flow/types.ts` — FlowBlock 확장

```ts
export type FlowBlockMetadata = {
  author?: string;
  subject?: string;
  source?: string;
  confidenceLabel?: string;        // FlowBlock.confidence(number)와 의미 분리된 string 라벨
  [key: string]: string | undefined;
};

export type FlowBlock = {
  // ... 기존 필드 ...
  metadata?: FlowBlockMetadata;
};
```

- `confidence`는 reserved key로 둠. 기존 `FlowBlock.confidence: number`와 의미 분리 — metadata.confidence는 "추출 confidence를 string으로 라벨링" 용도. 혼동 방지를 위해 주석 명시.
- 이미 13개 type enum이 있으므로 metadata는 어떤 type에서도 사용 가능 (Gap·Question·Outcome 모두 부착 가능).

### 2.2 `src/core/flow/guards.ts` — metadata 검증 추가

```ts
function isFlowBlockMetadata(v: unknown): v is FlowBlockMetadata {
  if (v === undefined) return true;            // optional
  if (!v || typeof v !== "object") return false;
  if (Array.isArray(v)) return false;
  for (const val of Object.values(v)) {
    if (val !== undefined && typeof val !== "string") return false;
  }
  return true;
}

// isFlowBlock 마지막에 한 줄 추가:
//   && isFlowBlockMetadata((b as { metadata?: unknown }).metadata)
```

- metadata 미포함 블록은 그대로 통과 (`v === undefined`).
- metadata 포함 시: object여야 하고, array 아니어야 하고, 모든 값이 string 또는 undefined.

### 2.3 `FlowGraphValidator` 영향

- 기존 validator는 `isFlowDelta` → `isFlowBlock` 경로로 검증. guards.ts 확장만으로 자동 적용.
- 별도 변경 없음.

### 2.4 dedup·governance 영향

- `ContentHasher`·`DedupIndex`는 metadata를 키에 포함하지 않는다 (M4 결정). **변경 없음**.
- `StaleDecayEngine`도 metadata를 보지 않는다. **변경 없음**.

---

## 3. 테스트 계획

### 3.1 `tests/core/flow/guards.test.ts` (또는 신규) — metadata 검증

| Case | 입력 | 기대 |
|---|---|---|
| 1 | metadata 없는 기존 블록 | `isFlowBlock = true` |
| 2 | `metadata: {}` | true |
| 3 | `metadata: { author: "claude" }` | true |
| 4 | `metadata: { author: "claude", subject: "auth", source: "extractor-v1" }` | true |
| 5 | `metadata: { x: 123 }` (number 값) | **false** |
| 6 | `metadata: { x: true }` (boolean) | **false** |
| 7 | `metadata: ["a", "b"]` (array) | **false** |
| 8 | `metadata: null` | **false** |
| 9 | `metadata: { author: undefined, subject: "x" }` | true (undefined 허용) |
| 10 | 확장 슬롯 `metadata: { foo: "bar" }` | true |

### 3.2 `tests/core/flow/metadata-roundtrip.test.ts` (신규) — 직렬화 안전성

| Case | 동작 |
|---|---|
| 1 | metadata 없는 블록을 appendDelta → readDeltas → byte-identical |
| 2 | metadata 포함 블록을 appendDelta → readDeltas → metadata 보존 |
| 3 | snapshot 기록·복원 시 metadata 라운드트립 |
| 4 | metadata가 undefined인 필드는 직렬화 시 키 자체가 사라짐을 명시적 검증 |
| 5 | **`FlowGraphProjector.fold()` 통과 시 metadata 보존** (codex 권장) |

### 3.3 기존 golden path

- 기존 E2E는 metadata 없는 블록만 사용 → 영향 없음. byte-identical 유지.

---

## 4. 수용 기준

- [ ] `bun test` 전체 통과 (현재 481 → 예상 ~493, +12)
- [ ] 기존 golden path byte-identical
- [ ] metadata 있는 블록·없는 블록 모두 isFlowBlock 통과
- [ ] metadata에 non-string 값 들어가면 isFlowBlock false
- [ ] snapshot/delta 라운드트립에서 metadata 보존
- [ ] `bun x tsc --noEmit` 통과

---

## 5. 롤백

- types.ts·guards.ts 변경 revert
- 신규 테스트 파일 삭제
- 데이터 호환: metadata 필드가 사라져도 optional이므로 기존 데이터 무해

---

## 6. 잔여 리스크

| 위험 | 완화 |
|---|---|
| reserved key 4개가 부족함 | 확장 슬롯(`[k]: string`)으로 보강. PR-7 진행 중 부족하면 reserved key 추가 |
| `metadata.confidence` (string) vs `FlowBlock.confidence` (number) 혼동 | types.ts에 주석 명시. 실수 방지 위해 README/ADR-009 참조 |
| `Object.values()`는 own enumerable만 순회 | JSON 입력 기준 충분 (`Object.values`는 prototype 무시). 직접 호출 hardening은 본 PR 비목표 |
| 미래에 metadata에 number 타입을 넣고 싶어질 가능성 | M2 결정상 string으로 통일. 필요시 별도 ADR로 확장 |

---

## 7. 측정 커맨드

```bash
# 신규 테스트만
bun test tests/core/flow/guards.test.ts tests/core/flow/metadata-roundtrip.test.ts

# 전체 회귀
bun test

# 타입체크
bun x tsc --noEmit
```

---

## 8. 구현 순서

1. types.ts에 `FlowBlockMetadata` + `FlowBlock.metadata` 추가
2. guards.ts에 `isFlowBlockMetadata` + `isFlowBlock` 1줄 갱신
3. guards 단위 테스트 (10 case)
4. metadata-roundtrip 테스트 (4 case)
5. 전체 회귀 + tsc
6. 단일 커밋: `feat(metadata): FlowBlock.metadata reserved key 도입 (PR-6)`
