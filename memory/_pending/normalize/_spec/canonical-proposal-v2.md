# Canonical Store v2 — V3.17 처리 결과 + 시드 9 확장 (2026-05-06)

> **본 파일의 목적**: V3.17 사이클 (a~d) 후 11 BMAD 실 처리 결과의 audit log + 시드 7 → 9 확장 근거.
> 직전 v1: `canonical-proposal-v1.md` (V3.17 시드 분석, 코드 변경 0).

## V3.17 효과 측정 결과

PAI 세션이 11 BMAD SSL 을 0.3.0 schema 로 재정규화 (2026-05-06):

| 지표 | Before (V3.17 시드 7) | After |
|---|---|---|
| Canonical 사용률 | 0% | **87.2%** (109/125 logical) |
| validateSSL 통과 | 11/11 | 11/11 |
| 4 노드 채움 (D+I+E+P) | 0/11 skill | 1/11 (bmad-distillator) |
| 평균 SSL 크기 | 9792B | 10844B (+10%) |
| Dedup 후보 발견 | 2건 | 2건 (등록 검토 가치) |

## 발견 사항

### 1. Canonical 87.2% — 목표 50% 크게 초과

시드 7개로 logical 노드 109/125 커버. PAI 가 actionRef 의무 규칙 잘 지킴.

### 2. 4 노드 채움 1/11 = 정상

`bmad-distillator` (가장 복잡한 BMAD skill) 만 D=5 I=1 E=4 P=3 채움.
나머지 10 skill 은 단순해서 4 노드 가질 logic 없음 → PAI 가 강제 안 만든 것 = **prompt 의 *"없으면 빈 배열 유지"* 규칙 잘 지킴**.

### 3. Canonical 미사용 16건 — 시드 추가 가치 입증

빈도 ≥ 3 패턴 2개 발견 (dedup detector 자동 출력):

| signature | 빈도 | 사용 skill | 등록 시 효과 |
|---|---|---|---|
| `BRANCH/LOCAL_FS` | 6× | 4 skill | → `BRANCH_ON_LOCAL_FILE` |
| `READ/MEMORY` | 5× | 5 skill | → `READ_FROM_MEMORY` |

빈도 < 3 (등록 보류):
- `CALL_TOOL/LOCAL_FS` (2×) — 시드 `CALL_LOCAL_SCRIPT` 와 같은 signature, PAI 미스로 추정
- `CALL_TOOL/NETWORK` (1×), `CALL_TOOL/LOCAL_FS,NETWORK` (1×), `WAIT/MEMORY` (1×)

## 시드 7 → 9 확장 (commit 동시 적용)

추가된 항목:

```yaml
BRANCH_ON_LOCAL_FILE:
  action: BRANCH
  resources: [LOCAL_FS]
  description: "Conditional path selection based on local filesystem state."

READ_FROM_MEMORY:
  action: READ
  resources: [MEMORY]
  description: "Read previously-set in-process state (no external I/O)."
```

→ PAI 재처리 시 예상 사용률: **87.2% → ~96%+**.

## V3.17 사이클 평가

**매우 성공적**. 사용자 우려 4 가지 모두 데이터로 검증:

| 우려 | 검증 결과 |
|---|---|
| 오버엔지니어링 | SSL +10% 만, 수용 가능 |
| 중복 처리 | canonical 87.2%, dedup detector 자동 발견 |
| LLM 혼동 | 11/11 validateSSL 통과 |
| 하드코딩 | yaml 편집만으로 시드 확장 (본 PR 이 입증) |

## 다음 단계

- (사용자 결정 후) 11 SSL 재 enqueue → PAI 재처리 → ~96%+ 달성 측정
- 더 복잡한 skill 흡수 시 4 노드 채움률 자연 증가 예상
- V3.18 (ExecutionBindingNode) 검토 — V3.17 안정성 확인 후 결정
