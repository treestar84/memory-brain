# ADR-020: memory-brain 라이선스 MIT 명시

**날짜**: 2026-04-27
**상태**: 채택됨
**관련 에픽**: plan v3 PR-V3.0
**연관**: ADR-018 §1 (게이트 메타), ADR-019 (OSS 도입 정책 — 본 ADR 선행)

---

## 결정

`memory-brain` 프로젝트의 라이선스를 **MIT**로 명시한다.

- `package.json` 에 `"license": "MIT"` 필드 추가.
- 본 ADR 채택으로 향후 의존성 호환성 평가의 기준이 확정됨.

## 배경

`package.json` 에 `license` 필드가 미선언 상태였음. plan v3가 Honcho(AGPL-3.0) self-host 의존성을 도입하려는 시점에서, 본체 라이선스 미선언은 다음 위험을 낳음:

1. **AGPL 전염 모호성**: AGPL 의존성을 import/link 하면 본체에 전염될 수 있는데, 본체 라이선스 미선언이면 전염 평가 불가.
2. **OSS 라이선스 호환성 매트릭스 불가**: ADR-019에서 다중 OSS 라이선스(MIT/Apache/AGPL)와의 호환성 결정을 내리려면 본체 라이선스 확정 선행 의무.
3. **공유 시 사용자 권리 모호**: 외부 사용자가 본 코드를 가져갈 때 라이선스 부재로 권리 모호.

## MIT 선택 사유

- **OSS 친화도 최대**: MIT는 가장 permissive한 OSI-승인 라이선스. memory-brain의 사용자 자유도 우선.
- **호환성 폭**: MIT 본체는 MIT/Apache/BSD/ISC OSS 도입에 마찰 없음. AGPL은 별도 격리 정책으로 처리(ADR-019).
- **PAI 정합**: PAI(Personal AI Infrastructure)도 permissive 라이선스 가정. 9-file identity 코드 차용 시 마찰 없음.
- **대안 거부**:
  - **Apache-2.0**: 특허 조항 추가로 좀 더 강함이나, 본 단일 사용자 프로젝트에 과함.
  - **AGPL**: 자체호스팅 강제로 사용자 자유도↓. 본 프로젝트 의도와 충돌.
  - **MIT-0 / Unlicense**: copyright notice 의무 제거가 OSS 생태계 표준에서 벗어남.

## 결과

### 라이선스 호환성 매트릭스 (ADR-019 입력)

| 의존성 라이선스 | 본체(MIT) 영향 | 정책 |
|---|---|---|
| MIT / BSD / ISC / Apache-2.0 | 영향 없음 | 자유 도입 |
| LGPL | 동적 링크만 허용 (Bun deps는 기본적으로 동적) | 도입 가능, 정적 링크 금지 |
| **AGPL-3.0** | **link/import 시 본체 전염** | **별도 컨테이너 격리 + HTTP 호출만**(ADR-019 §격리 정책) |
| GPL-3.0 | 본체 전염 (네트워크 예외 없음) | **금지** |
| commercial / proprietary | 라이선스별 평가 | 케이스별 ADR |

### 즉시 영향

- `package.json` license 필드 추가 (commit 시점에 채택).
- ADR-019(OSS 도입 결정) 작성 시 본 ADR §결과 매트릭스 인용.
- npm registry / GitHub 메타데이터에 라이선스 명시되어 외부 사용자 권리 명확.

### 향후 변경 정책

- 본 ADR 변경 (예: AGPL로 전환)은 **별도 ADR-020-amend** 작성 의무. 단순 commit 금지.
- LICENSE 파일 작성은 본 PR 범위 밖 (`package.json` 명시만으로 npm 표준 충족, 후속 PR로 분리 가능).

## 거부 대안

### X1. 라이선스 미선언 유지
- 거부 사유: AGPL 의존성(Honcho) 도입 평가 불가. plan v3 진행 차단.

### X2. Apache-2.0
- 거부 사유: 단일 사용자 프로젝트에 특허 조항 과함. 마찰↑.

### X3. AGPL-3.0
- 거부 사유: 자체호스팅 강제. memory-brain은 사용자 환경 다양성을 가정하므로 AGPL은 사용자 자유도 훼손.

## 참고

- ADR-018 (`docs/adr/018-phase-entry-gate-meta.md`) §1 인용 — 본 ADR이 plan v3 PR-V3.0 진입 게이트 객관 항목 1 충족.
- `.omc/wiki/vision-7-layer-arch.md` — OSS 도입 매핑 (Honcho AGPL-3.0 격리 결정 근거)
- `.omc/autopilot/spec.md` — 본 ADR 사이클 산출
- npm registry license 표준: https://docs.npmjs.com/cli/v10/configuring-npm/package-json#license
