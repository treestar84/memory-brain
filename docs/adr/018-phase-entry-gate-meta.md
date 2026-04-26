# ADR-018: phase 진입 게이트 메타-ADR — 시간 백스톱 ≠ 진입 트리거

**날짜**: 2026-04-27
**상태**: 채택됨
**관련 에픽**: vision evolution Phase A1~A6 (plan v2)
**연관**: ADR-008 (2개 이상 게이트 정신 — 본 ADR이 phase 일반에 확장), ADR-012 (PR-A1.0 우회 결정 사례), `.omc/plans/vision-evolution-claim-grounded-os.md` v2 §2 P5

---

## 결정

vision evolution plan v2 의 6 phase (A1~A6) + 모든 후속 phase 진입 게이트에 다음 메타 정책을 일괄 적용한다.

### §1. 모든 phase 진입 게이트는 AND 조건

phase 진입은 다음 두 항이 **동시에** 충족된 시점에만 트리거된다.

- **AND 항 1 (객관 데이터)**: 직전 phase 의 운영 데이터(예: 후보 발화 ≥ N건 + accept 비율 ≥ M%) 충족.
- **AND 항 2 (사용 사례)**: `docs/phase3-entry-snapshot-2026-04-26.md` §4 카탈로그(S1/S2/S3) 형식의 사용자 명시 사용 사례 1건 이상.

OR 분기는 허용하지 않는다(plan v2 §7.1 답습).

### §2. 시간 백스톱은 phase-진입을 절대 트리거하지 않는다

시간 백스톱(예: 7일 경과)은 다음만 트리거한다.

- **룰 재설계 PR 트리거** (예: PR-7 룰이 1주 0건 발화 시 detector 룰 재설계 PR 의무화).
- **현 phase 의 데이터 부족 진단 보고** (snapshot §2.2 "데이터 부족" 케이스).

시간 백스톱이 다음 phase 진입을 우회하는 경로는 본 ADR 채택으로 영구 폐기. 6 phase × 시간 백스톱 = "객관 데이터 0건도 6 phase 다 진입" 시나리오(plan v2 §2 P5)는 본 §2로 차단.

### §3. 객관 항목 절대 우선

- AND 항 1 미충족 + AND 항 2 미충족 → phase 정지.
- AND 항 1 충족 + AND 항 2 미충족 → phase 정지 + §3a 카탈로그 nudge.
- AND 항 1 미충족 + AND 항 2 충족 → phase 정지 (사용자 발화는 객관 데이터 부재를 우회하지 않음).
- AND 항 1 + AND 항 2 모두 충족 → phase 진입 가능.

**우회 채널**: 사용자가 ADR 본문에 "특정 phase 우회 결정"을 명시하고 후속 검증 의무를 함께 박는 경우에 한해 임시 ARM-DOWN 가능 (ADR-012 §진입 게이트 처리가 첫 사례). 이 경우에도 본 ADR §3 정신은 보존되며, 우회는 단일 phase 한정·1주 후 재평가 의무를 동반한다.

### §3a. 카탈로그 nudge (Architect v2 권장 3 흡수)

AND 항 1이 **2주 연속 충족**되었으나 AND 항 2가 미충족인 경우, 시스템은 **카탈로그 nudge 1회**를 사용자에게 표시한다.

- **nudge 형식**: `docs/phase3-entry-snapshot-2026-04-26.md` §4 의 S1(주간 retrospective) / S2(관계 노트) / S3(작업 학습 패턴) 카탈로그 그대로 제시.
- **인터뷰 유도 금지**: nudge는 카탈로그 제시일 뿐이며, 사용자에게 응답을 강요하지 않는다(`phase3-snapshot §3` "인터뷰로 유도 금지" 답습).
- **사용자 침묵 = 정지 유지**: nudge 후 사용자 발화가 없으면 phase 정지 유지. nudge 재발화는 추가 2주 경과 후 1회.
- **목적**: "사용자가 vision 을 forget → plan 도 forget" 단일 실패점(Architect v2 T-v2)을 alarm 채널 1개로 격하. 인터뷰 유도와 침묵 유지 사이의 균형.

### §4. 모든 phase 진입 게이트는 본 ADR §의존 §1 인용 의무

향후 작성되는 phase 진입 ADR(예: ADR-013, ADR-013-pre, ADR-013-pre2, ADR-014, ADR-015, ADR-016, ADR-017) 은 본 ADR §1·§2·§3·§3a 를 §의존 §1 으로 인용해야 한다. 인용 없는 phase 진입 ADR 은 본 ADR 정신 위반으로 amend 의무.

**예외**: PR-A1.0 ADR-012 는 본 ADR 작성 이전 채택됐으므로 §우회 결정 형식으로 §3 ARM-DOWN 명시 — 본 ADR 채택 후 retrofit 인용 추가 의무 없음(과거 결정 보존).

## 배경

vision evolution plan v2 (`.omc/plans/vision-evolution-claim-grounded-os.md`) 의 ralplan consensus 과정에서 두 가지 위험이 식별됨.

1. **시간 백스톱 누적 우회** (Critic v1 추가 5건 중 C2): 6 phase × 7일 백스톱 = 객관 데이터 0건도 모든 phase 진입 가능.
2. **사용자 자연 발화 단일 실패점** (Architect v2 T-v2): `phase3-snapshot §3` "T1 인터뷰 유도 금지" + ADR-018 §3 "객관 항목 절대 우선" 합으로 "사용자가 vision 을 forget" 시 plan 영구 정지.

본 ADR 은 두 위험을 §2(시간 백스톱 차단) + §3a(카탈로그 nudge) 로 동시에 회수.

## 결과

### Phase 게이트 영향 (plan v2 §4 답습)

| Phase | AND 항 1 | AND 항 2 |
|---|---|---|
| A1 (PR-A1.0) | PR-7 운영 ≥ 5건 + accept ≥ 30% | 사용 사례 1건 (S1/S2/S3) — ADR-012 §우회 결정으로 ARM-DOWN |
| A1.1 (accept/reject CLI) | claim 후보 ≥ 5건 + 1주 운영 | 사용 사례 1건 |
| A2 (Profile layer) | A1.1 머지 + 1주 운영 | 사용 사례 1건 + ADR-013-pre + ADR-013-pre2 채택 |
| A3 (governance) | A2 머지 + claim/profile 동시 운영 ≥ 1주 | 사용 사례 1건 |
| A4 (Router) | A2 + A3 머지 + governance 운영 ≥ 1주 | 사용 사례 1건 |
| A5 (Honcho) | ADR-013-pre 통과 + A4 머지 + 1주 | 사용 사례 1건 |
| A6 (Derived index) | A5 머지 + 1주 | 사용 사례 1건 |

### 운영 규칙

- **phase 머지 직후마다** 본 ADR 을 재읽어 다음 phase 게이트 자가 점검.
- AND 항 1 충족 검증은 phase 별 stats CLI 또는 snapshot 으로(예: `bin/cfgm-promote-stats.ts`, `bin/cfgm-claim-stats.ts`).
- AND 항 2 충족 검증은 사용자 발화 인용 본 phase ADR §우회 결정 또는 §진입 게이트 §사용 사례 섹션에 기록.

### 거부된 대안

#### X1. OR 분기 일부 허용
- 거부 사유: ADR-008 §대안 B 거부 사유("결과 저장 경로 공중에 뜸") 답습. 사용 사례 미충족 phase 진입은 결과 사용처 부재로 dead code 누적 위험.

#### X2. 시간 백스톱이 phase 진입을 트리거하되 "rollback 가능 dormant 진입"
- 거부 사유: dormant 진입도 코드·ADR commit 발생. rollback 비용↑. plan v2 §2 P5 회수 메커니즘과 직접 충돌.

#### X3. AND 항 2 인터뷰 유도 허용
- 거부 사유: `phase3-snapshot §3` "T1 인터뷰 유도 금지" 직접 위반. 유도된 발화는 ADR-008 게이트 정신 약화.

#### X4. 카탈로그 nudge 매주 재발화
- 거부 사유: 사용자 nudge fatigue. §3a 의 "2주 연속 + 1회" 보수 정책이 균형점.

## 참고

- ADR-008 (`docs/adr/008-transcript-reentry-gates.md`) — 게이트 정신 원본
- ADR-009 (`docs/adr/009-identity-promotion-sidecar.md`) — sidecar 패턴 답습 (Phase A1.0 모델)
- ADR-011 (`docs/adr/011-workflow-auto-orchestration.md`) — 자가 호출 임계값 ≥ 3 답습
- ADR-012 (`docs/adr/012-claim-evidence-sidecar.md`) — §우회 결정 첫 사례
- `.omc/plans/vision-evolution-claim-grounded-os.md` v2 §2 P5 — 본 ADR 의 형식적 근거
- `docs/phase3-entry-snapshot-2026-04-26.md` §2.2·§3·§4 — AND 항 1 임계, T1 카탈로그 S1/S2/S3
- ralplan consensus: Architect v2 권장 3 (§3a 카탈로그 nudge), Critic v1 추가 5 중 C2 (시간 백스톱 차단)
