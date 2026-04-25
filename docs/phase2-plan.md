# Phase 2 실행 계획 — PR-4 dedup (v3.1, codex 최종 점검 반영)

> 작성일: 2026-04-25 (v3.1 revision)
> 상태: **codex 최종 점검 통과 → 구현 착수**
> v3.1 보강: (1) `block-supersede` Set 기반 supersede 처리, (2) hash 입력 `JSON.stringify([type, label])`로 통일, (3) source-of-truth 경로 표기 정정 (`problems/${problemId}/flow-delta.jsonl`)
> 선행: Phase 1 완료 commits `4aa7b55`(PR-1) / `9cc21c5`(PR-3)
> 근거: `docs/pai-gap-report.md` v2.1, `docs/phase2-scope.md`, ADR-007, codex v1·v2 plan-check
> 기준 커밋: `1269fbc`
> 추정 성공률: **~78%** (codex 권장 반영, 보수적 재추정)
> 추정 TTS: **~1.0일**

---

## 0. v2 → v3 변경점 (codex 권장 반영)

| 항목 | v2 | v3 | 이유 |
|---|---|---|---|
| dedup 키 | `problemId + sha256(label)` | **`problemId + sha256(type + label)`** | `cfgm-flow-cli.test.ts:108`이 같은 label `"test block"` 두 번 사용. label-only는 즉시 깨짐 (codex C1 지적) |
| has() 소스 | sidecar `ledger/dedup-index.jsonl` 스캔 | **`ledger/flow-delta.jsonl` 직접 스캔** (source-of-truth) | partial-failure 자체 소멸 — sidecar가 ledger와 어긋날 가능성 제거 |
| sidecar 역할 | success+skip 통합 인덱스 | **skip audit log only** (best-effort, throw 안 함) | source-of-truth가 flow-delta로 일원화됨에 따라 sidecar는 감사 로그 기능만 남김 |
| sidecar append 실패 | main().catch로 빠져 rebuild 중단 | **try/catch로 warning만 stderr 출력**, write path 계속 진행 | rebuild가 dedup audit 실패로 중단되는 더 큰 불일치 방지 |
| `validBlock` helper | (수정 없음 가정) | **`label: \`test block ${blockId}\`` 패턴으로 수정** (1줄) | C1 충돌 회피. golden path 의도 보존 |

---

## 1. C1·C2 사전 회수 결과 (구현 전 검증 완료)

### C1 — `block-add` 동일 키 재삽입 경로 전수 스캔

| 경로 | 결과 | 조치 |
|---|---|---|
| `tests/bin/cfgm-flow-cli.test.ts:17,108~121` | helper 기본 `label: "test block"`로 두 블록 같은 키 | **helper 수정** — `label: \`test block ${blockId}\`` |
| `tests/bin/cfgm-flow-cli.test.ts:181~199` | Cause vs Gap (type 다름) | type 키 격상으로 안전 |
| `tests/bin/cfgm-apply-delta.test.ts:35` | `"가설 H1"` 단독 | 안전 |
| `tests/e2e/epic2-golden-path.test.ts` | `"src/auth.ts 편집"`, `"bun test 실패"` | label 모두 다름, 안전 |
| `tests/e2e/epic3-golden-path.test.ts` | `"src/auth.ts 편집"`, `"테스트 통과"` | 안전 |
| `tests/e2e/epic5-golden-path.test.ts` | `\`gap on ${subject}\``, `makeActionBlock`, `makeQuestionBlock` | 안전 |
| `tests/e2e/epic6-golden-path.test.ts:37` | `\`${type} block ${blockId}\`` | blockId unique → label unique, 안전 |

→ **수정 필요**: `cfgm-flow-cli.test.ts:17` 한 줄.

### C2 — `block-add` ledger 기록 호출부 전수 스캔

| 호출부 | op | 영향 |
|---|---|---|
| `bin/cfgm-apply-delta.ts:73` | block-add 포함 모든 op | dedup 훅 진입점 |
| `src/core/governance/StaleDecayEngine.ts:33` | **block-supersede만** | 무관 |
| `src/core/flow/FlowGraphStore.ts:16` | 정의부 | — |
| `src/core/flow/FlowGraphProjector.ts:67` | 읽기 경로 (fold) | — |
| `src/core/compaction/ResumeSheetWriter.ts:13` | 읽기 | — |

→ **block-add를 ledger에 기록하는 유일한 진입점은 `cfgm-apply-delta.ts:73`**. 단일 writer 원칙 자연 보장.

### Confidence 재삽입 흐름 조사

- `VoiScorer`, `LowConfidenceCriticalDetector`, `FlowGraphProjector`, `CueCardInjector`, `ObservationBundler` 전수 확인.
- "label 같은데 confidence 올리려고 block-add 재호출"하는 흐름 **없음**.
- → D4(hit 시 skip) 결정 안전.

---

## 2. 결정 확정 (D1~D5, v3)

| # | 결정 | 비고 |
|---|---|---|
| D1 | sidecar는 `security/dedup-skip.jsonl` (skip audit only, best-effort) | success index 없음, source-of-truth = `problems/${problemId}/flow-delta.jsonl` (store.readDeltas로 추상화) |
| D2 | NFKC · lowercase · whitespace squeeze 3단계 고정 | 엔티티 치환 Phase 3 |
| D3 | dedup 키 = `problemId + sha256(type + ":" + normalizedLabel)` | type 격상 (codex C1) |
| D4 | hit 시 delta skip + audit log best-effort 기록 | C1·C2 통과 확인됨 |
| D5 | ~~`FlowBlock.metadata?` 타입 추가~~ | Phase 3 이월 (드롭) |

---

## 3. 변경 사양

### 3.1 신규 모듈: `src/core/dedup/ContentHasher.ts`

```ts
export class ContentHasher {
  hash(type: FlowBlockType, label: string): string {
    const normalized = label
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    return createHash("sha256").update(JSON.stringify([type, normalized])).digest("hex");
  }
}
```

- 의존성: `node:crypto` only
- 키 입력: `JSON.stringify([type, normalized])` — 미래 필드 추가 시 안전한 직렬화 (codex 권장)

### 3.2 신규 모듈: `src/core/dedup/DedupIndex.ts`

```ts
export class DedupIndex {
  constructor(
    private store: FlowGraphStore,
    private storage: Storage,
    private clock: Clock,
    private hasher: ContentHasher,
  ) {}

  // source-of-truth = problems/${problemId}/flow-delta.jsonl (store.readDeltas로 추상화)
  // raw block-add는 status가 항상 "confirmed"로 박혀 있고, supersede는 별도 delta로 들어옴 →
  // block-supersede.blockId Set을 먼저 만들고 block-add 중 그 Set에 포함되지 않은 것만 비교 (codex 핵심 지적)
  async has(problemId: string, type: FlowBlockType, label: string): Promise<boolean> {
    const target = this.hasher.hash(type, label);
    const deltas = await this.store.readDeltas(problemId);
    const supersededIds = new Set<string>();
    for (const d of deltas) {
      if (d.op === "block-supersede") supersededIds.add(d.blockId);
    }
    for (const d of deltas) {
      if (d.op !== "block-add") continue;
      if (supersededIds.has(d.block.blockId)) continue;
      if (this.hasher.hash(d.block.type, d.block.label) === target) return true;
    }
    return false;
  }

  // skip audit only. throw 안 함 (best-effort)
  async logSkip(entry: { problemId: string; hash: string; attemptedBlockId: string; type: FlowBlockType; reason: string }): Promise<void> {
    try {
      await this.storage.appendJsonl("security/dedup-skip.jsonl", {
        ...entry, at: this.clock.isoNow(),
      });
    } catch (e) {
      console.error(`dedup skip-log failed (non-fatal): ${e}`);
    }
  }
}
```

- **success index 없음.** has()는 `store.readDeltas(problemId)`를 직접 스캔.
- skip audit log 실패는 stderr warning만, throw 안 함.
- supersede된 블록은 동일 키 재삽입 가능 (의도된 동작 — Phase 3 governance와 정합).
- **raw delta 모델 정합성**: `block-supersede`는 별도 delta로 추가되며 `block-add` 레코드의 status는 변경하지 않음 (`FlowGraphProjector`가 fold 시점에 status 변환). 따라서 supersede 무시는 `blockId` Set으로 처리.

### 3.3 `bin/cfgm-apply-delta.ts` 훅 삽입 (~8줄)

```ts
// validator.validateDelta(d) 성공 후 (line 71):
if (d.op === "block-add" && !process.env.CFGM_DEDUP_DISABLED) {
  if (await dedupIndex.has(d.block.problemId, d.block.type, d.block.label)) {
    await dedupIndex.logSkip({
      problemId: d.block.problemId,
      hash: hasher.hash(d.block.type, d.block.label),
      attemptedBlockId: d.block.blockId,
      type: d.block.type,
      reason: "duplicate-type-label",
    });
    console.error(`delta skipped (dedup): ${d.block.type}:${d.block.label.slice(0, 24)} ${d.block.blockId}`);
    continue; // applied 미증가, problemsTouched 미추가
  }
}

const problemId = deltaProblemId(d);
await store.appendDelta(problemId, d);
problemsTouched.add(problemId);
applied++;
```

**핵심 규칙:**
- has() 호출 → `flow-delta.jsonl` 스캔 (source-of-truth)
- hit 시: `logSkip()` 시도 후 continue. logSkip 실패해도 영향 없음
- miss 시: 기존 경로 그대로
- `problemsTouched` 미추가 (dedup hit은 graph 불변 → rebuild 불필요)
- `CFGM_DEDUP_DISABLED=1` 시 훅 전체 bypass

### 3.4 `tests/bin/cfgm-flow-cli.test.ts` helper 수정 (1줄)

```ts
// before: label: "test block",
// after:
label: `test block ${overrides.blockId ?? "b1"}`,
```

- C1 #1 충돌 해소
- 다른 default 필드 손대지 않음

---

## 4. 테스트 계획

### 4.1 신규 단위 테스트

- `tests/core/dedup/ContentHasher.test.ts` (5 cases)
  - NFKC 경계
  - whitespace 정규화
  - case insensitivity
  - type 분리 (`Cause:foo` ≠ `Gap:foo`)
  - 한국어 자모 NFKC
- `tests/core/dedup/DedupIndex.test.ts` (6 cases)
  - 빈 ledger → has=false
  - 같은 type+label block-add 후 → has=true
  - 같은 label, 다른 type → has=false
  - block-supersede 후 동일 type+label → has=false (supersede Set 적용 검증)
  - block-add 단독으로 status="superseded"는 의미 없음 (raw delta 모델 검증)
  - logSkip 실패 시 throw 안 함

### 4.2 CLI 회귀

- `tests/bin/cfgm-apply-delta.dedup.test.ts` (4 cases)
  - 동일 type+label 2회 → 1st applied, 2nd skip, dedup-skip.jsonl 1건
  - 같은 label, 다른 type 2회 → 둘 다 applied
  - `CFGM_DEDUP_DISABLED=1` → 둘 다 applied, dedup-skip.jsonl 미생성
  - dedup hit 시 `current-gaps.json`·snapshot byte-identical

### 4.3 기존 golden path

- `cfgm-flow-cli.test.ts:17` helper 수정 1줄로 dedup 충돌 해소
- 다른 E2E는 영향 없음 (C1 사전 회수 완료)

---

## 5. 수용 기준

- [ ] `bun test` 전체 통과 (현재 466 → 예상 ~480, +14)
- [ ] `cfgm-flow-cli.test.ts` 기존 케이스 모두 통과 (helper 수정만)
- [ ] 다른 E2E byte-identical 유지
- [ ] dedup hit E2E 1회: `security/dedup-skip.jsonl`에 1건, `flow-delta.jsonl`에 변화 없음
- [ ] Opt-out 수동 검증 1회
- [ ] 새 파일: `ContentHasher.ts`, `DedupIndex.ts`, 테스트 2개. 스키마 변경 없음.

---

## 6. 롤백

- `cfgm-apply-delta.ts`의 dedup 훅 revert
- `src/core/dedup/` 디렉토리 삭제
- `cfgm-flow-cli.test.ts` helper 1줄 원복
- `dedup-skip.jsonl`은 append-only이므로 잔존해도 무해

---

## 7. 잔여 리스크

| 위험 | 완화 |
|---|---|
| has() 스캔 비용 (problemId당 deltas 전체) | Phase 2 수백 블록 가정 마이크로초. Phase 3에서 캐싱 |
| superseded 블록의 동일 키 재삽입을 허용한 D4 결정이 의도와 어긋날 가능성 | governance와 정합 — supersede는 명시적 무효화이므로 재삽입은 자연스러운 흐름. 테스트로 의도 명시 |
| skip audit log 누락 (best-effort) | source-of-truth는 flow-delta. audit은 관측용 |
| Phase 3에서 `FlowBlock.metadata` 도입 시 기존 블록 backfill 필요 | 별도 ADR로 Phase 3 시작 시 결정. 이번 plan과 무관 |

---

## 8. 측정 커맨드

```bash
# 통합 테스트
bun test tests/core/dedup/ tests/bin/cfgm-apply-delta.dedup.test.ts tests/bin/cfgm-flow-cli.test.ts

# 전체 회귀
bun test

# dedup 실효 검증
CFGM_HOME=$(mktemp -d) bun bin/cfgm-apply-delta.ts < fixtures/dup-delta.json
CFGM_HOME=$(mktemp -d) bun bin/cfgm-apply-delta.ts < fixtures/dup-delta.json # 2회째 skip
```

---

## 9. 구현 순서

1. `ContentHasher.ts` + 단위 테스트
2. `DedupIndex.ts` + 단위 테스트
3. `cfgm-flow-cli.test.ts` helper 수정 (선행 — 다른 변경 없이 통과 확인)
4. `cfgm-apply-delta.ts` 훅 삽입
5. CLI dedup 회귀 테스트
6. 전체 회귀 + 수용 기준 체크
7. 단일 커밋: `feat(dedup): PR-4 type+label content dedup with audit-only sidecar`
