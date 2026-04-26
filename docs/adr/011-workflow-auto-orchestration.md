# ADR-011: 워크플로우 자동 오케스트레이션 — Claude 화면 구성 + 일괄 결정

**날짜**: 2026-04-26
**상태**: 채택됨
**관련 에픽**: PR-7 후속 UX 재설계
**연관**: ADR-009 (amended by 본 ADR §3)

---

## 결정

`/cfgm-process` 의미 합성과 `/cfgm-promote` Identity 결정을 사용자가 매번 슬래시 명령으로 호출하는 현행 UX를 다음과 같이 바꾼다.

### 1. `/cfgm-process` 자가 호출 정책
- **트리거**: session-start nudge에 "미처리 번들 ≥ 3" 또는 "대기 분석 ≥ 3"이 표시되면, **Claude 본체가 자연 흐름으로 자가 호출**한다(자가 호출 임계값 = 3, `src/core/flow/config.ts`의 `PENDING_WARN_THRESHOLD`와 정합).
- **매직 토큰 사용 금지**. 사용자 화면에 노출되는 가이드 토큰을 두지 않는다. 자가 호출은 nudge 자연어 + skill 가이드만으로 유도한다.
- **표시 임계값과 자가 호출 임계값 분리**: nudge 표시는 ≥ 1(사용자에게 인지를 줌), 자가 호출은 ≥ 3(매 세션 발화 비용 회피).

### 2. `/cfgm-promote` 일괄 결정 정책
- **트리거**: pending ≥ `PROMOTION_NUDGE_THRESHOLD = 5` (`src/hooks/session-start.ts:18`, 기존 임계값 유지). 임계값 도달 시 nudge 표시.
- **자동 화면 구성**: nudge를 본 직후 Claude 본체가 `cfgm-promote-review` 호출 → 후보를 target별 그룹화한 표 + 위험 후보(예: 동일 target 중복 제안, accept 비율 낮은 detector) 별도 마커 → 사용자에게 "이 결정으로 진행할까요?" 제안문 화면 구성.
- **결정 형식**: 사용자는 **번호/ID별로 명시 응답**한다(`accept 1,3,5` / `reject 2,4` / `skip 6`). **광범위 동의(예: "다 좋아", "all accept")는 거부**한다 — 본 ADR §3의 §3 amended 정신을 훼손.
- **batch 처리**: 사용자 응답을 Claude가 `cfgm-promote-batch --accept ID,ID --reject ID,ID --reason "..."` CLI로 옮긴다. batch는 부분 실패 시 stop + 처리된 ID·실패 ID 리포트(append-only이므로 자연 롤백은 불가, 보고 후 사용자 재결정).

### 3. ADR-009 §결정 §3 amended
ADR-009 §결정 §3("승인은 명시 명령. session-end 자동 승격은 금지. nudge만 허용")의 정신을 다음과 같이 amend한다(superseded 아님 — sidecar 모델·rule-based detector·9-file 직접 미작성 결정은 모두 유지).

- **정신 보존**: "사용자가 모르는 사이 Identity 변경이 누적되는 위험" 회피.
- **운영 형태 변경**: "단건 명시 명령"에서 "한 번에 모두 디스플레이 후 번호/ID별 명시 결정"으로 확장. 후자도 사용자가 모든 변경을 화면으로 보고 명시 결정한다는 점에서 §3 정신을 보존한다.
- **금지 사항(R2 완화)**:
  - 광범위 동의("다 좋아", "all accept", "y") 거부.
  - 번호/ID 명시 없는 응답 거부.
  - target별 그룹화 + 위험 후보 별도 확인 미수행 시 batch 호출 금지.
- **session-end 자동 승격 금지는 유지**: 자동 화면 구성은 session-start 트리거에서만, session-end 훅은 후보 append만 수행(현행 유지).

### 4. 표시 임계값과 유도 임계값 분리

| 시그널 | 표시 임계값 | 자가 호출 임계값 |
|---|---|---|
| 미처리 번들 (`unprocessedBundles.length`) | ≥ 1 | ≥ 3 |
| 대기 분석 (`pendingCount`) | ≥ 1 | ≥ 3 |
| promotion pending | ≥ 5 (현재와 동일) | ≥ 5 (현재와 동일) |

표시는 사용자 인지 보장용, 자가 호출은 비용 절약용. 사용자가 nudge를 보고도 자가 호출 임계값 미달이면 자연어로 직접 요청 가능(A안 commit `fb5b772`).

## 배경

PR-7 머지 후 사용자가 다음 두 UX 결함을 명시 발화:
1. `/cfgm-process`와 `/cfgm-promote accept/reject`가 **정확히 무엇을 하는지 모호** — nudge가 결과의 가치를 못 보여줌.
2. 매번 사용자가 슬래시 명령을 머리에 이고 있어야 하고, 5건 결정 = 5번 호출이라 **사용성이 매우 나쁨**.

A안(자연어 트리거 부각, commit `fb5b772`)은 즉시 적용했으나, 본질은 워크플로우 설계 문제이므로 본 ADR로 정식화한다.

## 결과

### 영향 받는 파일 (가이드)

| 파일 | 변경 |
|---|---|
| `bin/cfgm-promote-review.ts` (신규) | target별 그룹·위험 마커·추천 컬럼 표 출력 |
| `bin/cfgm-promote-batch.ts` (신규) | `--accept ID,ID --reject ID,ID --reason "..."` 일괄 처리 |
| `skills/cfgm-promote/SKILL.md` | review→사용자 응답→batch 흐름 명시. 광범위 동의 거부 명시 |
| `skills/cfgm-process/SKILL.md` | 자가 호출 임계값(≥ 3) 트리거 안내 |
| `src/hooks/session-start.ts` | (선택) 자가 호출 임계값 별도 표시 마커. 사용자 노출 X. |

### 거부된 대안

#### X1. 매직 토큰(`[AUTO_PROCESS_TRIGGER]`) 가시화
- 거부 사유: 사용자 화면에 토큰이 노출되면 노이즈. nudge 자연어와 skill 강제문이 충분.

#### X2. 광범위 동의("다 좋아") 허용
- 거부 사유: ADR-009 §3 정신("사용자 모르게 누적 금지") 직접 훼손. 사용자가 표를 대충 훑고 동의하면 자동 쓰기와 동일.

#### X3. ADR-009 superseded 처리
- 거부 사유: ADR-009의 핵심 결정(sidecar 모델, rule-based detector, 9-file 직접 미작성)은 본 ADR이 변경하지 않음. superseded는 과함. amended가 정확.

#### X4. 자가 호출 임계값 ≥ 1
- 거부 사유: 매 session-start마다 자가 호출 발화 시 LLM 비용·세션 시작 지연. `PENDING_WARN_THRESHOLD = 3`과 정합한 ≥ 3이 보수적.

#### X5. PR-A(자가 호출 안내)를 PR-B(review/batch)보다 먼저
- 거부 사유: 현재 `/cfgm-promote`는 list/accept/reject 단건 흐름뿐. 자가 호출 안내가 가도 사용자가 결정할 도구 부재. PR-B 우선이 안전.

## 진행 순서

1. **본 ADR 채택** (commit, no-code).
2. **PR-B**: `cfgm-promote-review`/`cfgm-promote-batch` CLI + `skills/cfgm-promote/SKILL.md` 흐름 갱신. PR-A의 SKILL.md 갱신(`cfgm-process` 자가 호출 안내)도 본 PR에 흡수.
3. **PR-C**: `src/core/flow/CueCardFallback.ts:42`, `src/hooks/user-prompt-submit.ts:60,137` 문구를 자연어 트리거로 정렬.
4. **운영**: 1~3일 운영 후 자가 호출 작동·일괄 결정 UX 평가. 결과를 `docs/journal/`(또는 `docs/`) snapshot으로 기록.

## 참고

- ADR-008 (`docs/adr/008-transcript-reentry-gates.md`)
- ADR-009 (`docs/adr/009-identity-promotion-sidecar.md`) — 본 ADR §3에 의해 §3 amended
- `src/core/flow/config.ts` (`PENDING_WARN_THRESHOLD = 3`)
- `src/hooks/session-start.ts:18` (`PROMOTION_NUDGE_THRESHOLD = 5`)
- `src/core/identity/PromotionLedger.ts` (`decide(force, reason)` 가역)
- A안 commit `fb5b772` (자연어 트리거 부각)
- 본 ADR plan-check: `docs/_codex_plan_check.md` (B안), codex(gpt-5.5) 검증 완료
