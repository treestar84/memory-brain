# ADR-008: Transcript 데이터 소스 도입 추가 보류 — 재진입 트리거 명확화

**날짜**: 2026-04-26
**상태**: 채택됨
**관련 에픽**: PR-5 (Phase 2)
**연관**: ADR-007 (보강), commit `acf1899` (PR-4 완료)

---

## 결정

`CanonicalEvent.payload`에 transcript path / assistant prose 필드를 추가하지 않는다. PAI(`Personal_AI_Infrastructure/Releases/v4.0.3`) 식 transcript-backed extractor 이식도 진행하지 않는다.

ADR-007의 "재진입 조건 2개 이상 충족" 기준에서 현재 1개만 충족됐으므로 transcript 도입은 추가 보류한다. 다음 진입 결정은 본 ADR-008에서 정의하는 **재진입 트리거(T1~T3)** 중 **2개 이상이 동시에 충족된 시점**에 별도 ADR-009로 작성한다.

ADR-007은 "채택됨" 상태를 유지하며 본 ADR-008이 그 재평가/보강이다. ADR-007을 superseded로 표시하지 않는다.

## 배경

PR-4 dedup(`acf1899`)이 머지된 시점에 ADR-007의 재진입 조건 4개를 재평가했다.

| # | ADR-007 재진입 조건 | 2026-04-26 시점 충족 |
|---|---|---|
| 1 | Bundle → Identity 블록 승격 설계 확정 | ❌ Phase 3 이월 |
| 2 | LLM 기반 blanket 합성 파이프라인 설계·승인 | ❌ Phase 3 이월 |
| 3 | 사용자가 세션 단위 관계 노트/작업 학습 파일을 **명시적으로 요구** | ❌ 사용 사례 미확정 |
| 4 | Phase 2 dedup 설계 완료로 extractor 출력의 중복 저장 리스크가 통제됨 | ✅ PR-4(`acf1899`) |

`docs/phase2-scope.md` §2.1의 PR-5 재개 조건도 동일한 결과를 가리킨다:

- ✅ PR-4 dedup 기반 확보 (단, `FlowBlock.metadata`는 Phase 3로 이월되어 부분 충족)
- ❌ 사용자의 구체 사용 사례 확정

따라서 객관 기준상 transcript 도입은 ADR-007의 "2개 이상" 게이트를 통과하지 못한다.

## 결과

### Phase 2 영향

- PR-5는 본 Phase에서 코드 변경을 동반하지 않는다 — Phase 2의 본체는 PR-4(완료)뿐.
- `CanonicalEvent` / `mapper.ts` / `hook-runner.ts` / fixtures **불변** (ADR-007과 동일).
- PAI extractor 이식 작업 없음. 관계 노트(`RelationshipMemory`)·작업 학습(`WorkCompletionLearning`) 파일도 생성하지 않음.
- `docs/pai-gap-report.md`의 "transcript-backed extractor" 항목은 Phase 3 이후 태깅으로 이동한다.

### 재진입 트리거 (ADR-009 작성 조건)

다음 **T1~T3 중 2개 이상**이 동시에 충족된 시점에 별도 세션에서 ADR-009(`transcript-source-introduction`)를 작성한다.

#### T1. 사용자 사용 사례 ≥ 1건 확정

다음 형식의 사용 사례 1건이 사용자로부터 확정되어야 한다:

- **시나리오**: "세션 종료 시 X를 추출해서 Y에 저장한다" 형태로 1줄 기술 가능
- **소비자**: 추출 결과를 읽는 모듈/프로세스가 명시 (예: "다음 세션 session-start digest", "주간 retrospective", "PAI export 뷰")
- **측정 가능한 outcome**: 1주 이상 운용 시 기대 결과 (예: "관계 노트 ≥ 5건/주", "작업 학습 정확도 ≥ 70%")

위 3개 항목을 모두 채울 수 없는 사용 사례는 T1을 충족하지 않는다.

#### T2. `FlowBlock.metadata` 또는 동등 메커니즘이 Phase 3에서 도입됨

extractor 출력에 `author` / `subject` 필드를 부착해 dedup 키와 정합하려면 metadata schema가 필요하다. PR-4 v3.1에서 `FlowBlock.metadata`는 Phase 3 이월로 결정됐으므로, Phase 3에서 metadata가 실제로 도입(또는 별도 sidecar로 동등 기능 구현)된 시점에 T2 충족.

#### T3. Bundle → Identity 블록 승격 흐름이 결정됨

extractor 결과의 final destination이 명확해야 한다. 다음 중 하나가 결정되면 T3 충족:

- Bundle → Identity 승격 ADR 작성 완료
- LLM 기반 합성 파이프라인 ADR 작성 완료
- 별도 sidecar(예: `identity/relationship-notes.md`) 운영 정책 확정

### 재진입 시점 운영 규칙

- 트리거 충족 여부는 **PR 머지 직후마다** 본 ADR-008을 재읽어 자가 점검한다.
- 2개 이상 충족이 명확히 보이는 시점에 ADR-009를 작성한다. 1개만 충족된 상태에서의 즉흥 도입은 금지.
- ADR-009 채택 시 ADR-007과 ADR-008은 **superseded로 표시**한다.

### Phase 2 종결 선언

본 ADR-008 채택으로 Phase 2의 모든 결정 항목이 마감된다:

- PR-4 dedup → 완료(`acf1899`)
- PR-5 transcript → **본 ADR로 추가 보류 + 트리거 정식화**

Phase 3 후보(이월): `FlowBlock.metadata`, entity normalization, k-NN, Bundle→Identity 승격, transcript 도입(트리거 충족 시).

## 대안

### B안: 즉시 도입 (transcript 가결)

- 장점: PAI 호환도↑, Phase 3 시작 시점에 transcript 인프라가 이미 준비됨.
- 단점: 사용 사례 부재로 결과 저장 경로가 공중에 뜸. metadata schema 부재 상태에서 extractor 출력이 dedup·governance와 정합할 수단이 없음. 결국 ADR-007과 동일 거부 사유 재현.
- 거부 사유: 충족된 조건은 1개(dedup)뿐이며, ADR-007의 "2개 이상" 기준을 임의로 완화하는 것은 ADR 불변 원칙 훼손.

### C안: 자동 진입 트리거(조건부 채택)

- 장점: 트리거 충족 시 ADR 작성 없이 자동 진행 → 의사결정 비용 절감.
- 단점: 자동 진입은 사람이 한 번도 들여다보지 않은 채 코드 변경이 시작될 위험. transcript 도입은 schema·hook·fixtures 다중 변경이라 자동 진입의 risk profile에 맞지 않음.
- 거부 사유: ADR-009를 명시적으로 작성하는 게이트 한 단계가 안전 마진으로 필요함.

## 참고

- ADR-007 (`docs/adr/007-transcript-source-decision.md`)
- `docs/phase2-scope.md` §2 (PR-5 재개 조건)
- `docs/phase2-plan.md` v3.1 (PR-4 완료판)
- `docs/pai-gap-report.md` §4·§7 (transcript-backed extractor 후보)
- commit `acf1899` (PR-4 contentHash dedup 완료)
- PAI 원본: `~/dev/Personal_AI_Infrastructure/Releases/v4.0.3/.claude/hooks/RelationshipMemory.hook.ts:36`, `WorkCompletionLearning.hook.ts:257`
