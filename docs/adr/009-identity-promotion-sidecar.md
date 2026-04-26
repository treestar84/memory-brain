# ADR-009: Bundle→Identity 승격 — sidecar 모델 + 명시 승인 정책

**날짜**: 2026-04-26
**상태**: 채택됨 (§결정 §3 amended by ADR-011)
**관련 에픽**: PR-7 (Phase 3)
**연관**: ADR-007, ADR-008 (트리거 T3), `docs/phase3-candidates.md` v2, ADR-011 (UX amend)

---

## 결정

`ObservationBundle`을 PAI Identity로 승격하는 흐름을 다음과 같이 정한다:

1. **저장 모델은 sidecar**. `identity/promoted-candidates.jsonl` (append-only). `FlowBlock`을 확장하지 않으며 `FlowBlockType`에 `Identity`를 추가하지 않는다.
2. **후보 탐지는 rule-based**. LLM 합성을 본 PR에서 도입하지 않는다.
3. **승인은 명시 명령**. session-end 자동 승격은 금지. nudge만 허용. *(ADR-011에 의해 amended: 단건 명시 명령 → "한 번에 모두 디스플레이 후 번호/ID별 명시 결정"으로 운영 형태 확장. 광범위 동의 거부 + session-end 자동 승격 금지는 유지.)*
4. **상태 모델은 `pending → accepted / rejected / superseded`**.
5. **신규 모듈로 분리**. 기존 `src/core/ontology/PromotionEngine.ts`를 확장하지 않는다.
6. **accepted 후보는 PAI 9-file에 직접 쓰지 않는다**. 별도 export 흐름이 필요하면 후속 ADR로 분리한다.

본 ADR 채택으로 ADR-008 트리거 **T3("Bundle→Identity 승격 흐름이 결정됨")**가 부분 충족된다. 완전 충족은 PR-7 머지 시점.

## 배경

Phase 3 후보 토론(`docs/phase3-candidates.md` v2)에서 codex(gpt-5.5)가 다음 4건의 비평을 제기했다:

1. "Identity 블록"이 `FlowBlock`인지 sidecar인지 미결정. `FlowBlockType` enum(`src/core/flow/types.ts:1`)에 `Identity`가 없으므로 FlowBlock으로 가면 union/validator/projector/CLI/tests 전체가 흔들린다.
2. 기존 `PromotionEngine`은 ontology yaml 승격용(`src/core/ontology/PromotionEngine.ts:15`)이라 의미·저장소·정책이 완전히 다르다. 이름이 같다는 이유로 확장하면 경계가 흐려진다.
3. PAI digest 흐름은 9-file(`session-start.ts:32`) 첫 의미 문단 320B만 잘라 주입(`session-start.ts:54,72,110`)한다. 직접 append가 정합성 향상이 아니다.
4. session-end 자동 승격은 ADR-008이 거부한 "자동 진입" 위험과 동일하다. Phase 3 첫 진입은 자동 쓰기를 모두 금지하는 게 안전하다.

위 4건을 받아들여 본 ADR로 결정 사항을 정식화한다.

## 결과

### Phase 3 PR-7 사양 (가이드)

#### 저장 모델
- 경로: `identity/promoted-candidates.jsonl`
- 한 줄 = 후보 1건. append-only.
- 스키마(가안):
  ```ts
  type PromotedCandidate = {
    candidateId: string;            // ULID/UUID
    bundleId: string;               // 출처 ObservationBundle
    proposedTarget: "telos" | "persona" | "user" | "tools" | "voice" | "beliefs" | "models" | "strategies" | "ideas";
    proposedLabel: string;
    detectedBy: string;             // rule id (예: "high-tool-call-pattern")
    metrics: Record<string, number>;
    status: "pending" | "accepted" | "rejected" | "superseded";
    createdAt: string;
    decidedAt: string | null;
    decidedBy: string | null;       // 사용자 ID 또는 "user"
    reason: string | null;          // accepted/rejected 시 사유
  };
  ```

#### 후보 탐지 (rule-based)
- 입력: `ObservationBundle.metrics` (`toolCallCounts`, `touchedFiles`, `bashExit`, `promptCount`)
- 출력: 0~N개의 후보. 임계값은 보수적으로 시작(예: 동일 tool ≥ 5회 사용 + 동일 prompt 패턴 반복).
- 판단 기준이 자주 발화하지 않는 임계값을 사용해 false positive를 줄인다.

#### 승인 흐름
- 명시 명령: `/cfgm-promote-list` (pending 후보 출력), `/cfgm-promote-accept <candidateId> [--reason ...]`, `/cfgm-promote-reject <candidateId> [--reason ...]`
- session-end 훅은 후보 수 임계값(예: pending ≥ 5) 초과 시에만 nudge 메시지. 승격은 절대 자동 실행하지 않는다.

#### accepted 후보의 운명
- 본 PR에서는 **상태만 `accepted`로 갱신**한다. PAI 9-file로의 export는 본 ADR 범위 밖.
- export가 필요해지는 시점에 후속 ADR(예: ADR-011 "PAI export 흐름")을 작성한다.

### 거부된 대안

#### 대안 X1: FlowBlock으로 Identity 표현
- 거부 사유: `FlowBlockType` 변경, validator/projector/CLI/tests 다중 변경. 의미적으로도 FlowBlock(인과 그래프 노드)과 Identity(자기 정체성 진술)는 다른 추상이다.

#### 대안 X2: 기존 `PromotionEngine` 확장
- 거부 사유: 기존 엔진은 `ontologies/promoted/...yaml`로 ontology 정의를 승격. Identity 승격은 사용자 정체성을 다루므로 운영·롤백·신뢰 정책이 완전히 다름. 엔진 통합은 경계 모호화.

#### 대안 X3: rule-based + LLM 합성 동시 도입
- 거부 사유: Phase 3 첫 진입에서 LLM 합성은 비용·재현성·신뢰 모든 축에서 검증 부담이 크다. 후속 ADR로 분리.

#### 대안 X4: session-end 자동 승격
- 거부 사유: ADR-008이 거부한 "자동 진입" 위험. 자동 쓰기는 사용자가 한 번도 들여다보지 않은 채 Identity 변경이 누적되는 위험을 만든다.

#### 대안 X5: PAI 9-file 직접 append
- 거부 사유: digest는 첫 문단만 주입(`session-start.ts:110`)하므로 직접 append가 정합성 향상이 아님. 잘못된 entries가 누적되면 markdown patch/merge 문제가 됨. sidecar는 `pending/accepted/rejected/superseded` 상태로 깔끔한 롤백을 보장.

### ADR-008 트리거 충족 영향

| ADR-008 트리거 | 본 ADR 채택 시 | PR-7 머지 시 |
|---|---|---|
| T1 (사용자 사용 사례) | 변화 없음 | 부분 충족 가능 (사용 사례 발견) |
| T2 (metadata schema) | 변화 없음 | PR-6 머지 후 충족 |
| T3 (Bundle→Identity 승격 흐름 결정) | **부분 충족** ("결정됨") | 완전 충족 ("결정+구현") |

→ ADR-009 채택 + PR-6 머지 시점에 T2·T3 동시 부분 충족. T1이 그 시점에 확정되어 있으면 ADR-010(transcript 도입) 작성 가능.

## 참고

- ADR-007 (`docs/adr/007-transcript-source-decision.md`)
- ADR-008 (`docs/adr/008-transcript-reentry-gates.md`)
- `docs/phase3-candidates.md` v2 (codex 토론 결과)
- `src/core/flow/types.ts:1` (`FlowBlockType` enum, `Identity` 없음)
- `src/core/ontology/PromotionEngine.ts:15` (기존 yaml 승격 엔진)
- `src/hooks/session-start.ts:32,54,72,110` (PAI 9-file digest 흐름)
- `skills/cfgm-process/SKILL.md:8` (의미 판단은 Claude 본체 담당 철학)
