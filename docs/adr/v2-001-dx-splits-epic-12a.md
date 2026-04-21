# ADR-v2-001: Epic 12 → Epic 12a + Epic 12b 분할 (DX 선행 분할)

**날짜**: 2026-04-20
**상태**: 채택됨 (2026-04-20 ralplan 합의 후 Epic 12a 구현 완료, 본 커밋에서 5개 태스크 완결)
**관련 에픽**: Epic 12 → Epic 12a (install 위생) + Epic 12b (skill/CLI 표면)
**참조**: `docs/superpowers/specs/2026-04-20-cfgm-v2-rfc.md` §9·§11, `docs/superpowers/specs/2026-04-20-cfgm-v2-distribution-dx.md`, `docs/superpowers/plans/2026-04-20-cfgm-v2-roadmap.md` §0

---

## 결정

Epic 12 "Distribution DX (1.5주, Epic 7~11 후)"를 **Epic 12a (설치 위생, 3일, Epic 7 이전)** + **Epic 12b (skill/CLI 표면, 1.5주, Epic 11 후)** 로 분할한다.

Epic 12a는 Epic 7~13을 **먼저 선행**한다. 근거:

1. **현재 레거시 `bin/install.ts`가 broken hook 경로를 기록 중**이다 (`kebab("Stop") → "stop.ts"`가 존재하지 않는 파일; 실제 훅 파일은 `src/hooks/session-end.ts`). 이는 v1 사용자에게도 즉시 깨진 상태다. Epic 7~11 작업 전에 **반드시** 고쳐야 Epic 7 이후 신규 설치 경로가 역대 동일한 브로큰 상태에서 출발하지 않는다.
2. **Epic 7+ 작업이 모두 `install-brain.ts`와 `~/.claude-brain/` 프로파일 생태계에 새로운 상태(예: `decayPolicy`, `voi-weights.json`)를 쓴다.** `install-manifest.json` + `CFGM:VERSION` 마커 + resume checkpoint 없이 Epic 7 상태를 추가하면 후속 마이그레이션이 불가능해진다.
3. **ralplan critic 지적 R8**: "Epic 12가 Epic 7~11 뒤에 있으면, 그 기간 동안 사용자는 v1 broken installer를 계속 밟는다." → Epic 12의 "install 위생" 부분만 앞당기면 본 리스크가 해소되며 Epic 12b의 UX 스킬(`/cfgm-doctor` 등)은 여전히 Epic 7~11 완료 후 붙여도 된다.

---

## 배경

**Epic 12 원래 범위 (RFC §11)**:

- `/cfgm-doctor`: HEALTHY/DEGRADED/BROKEN 진단
- `/cfgm-setup`: 대화형 설치 + migrate 1→2
- `/cfgm-hud`: 상태바 통계
- install-manifest.json, CFGM:VERSION marker
- install-progress.json resume
- 8개 에러코드 (E-code) 카탈로그
- rollback/dry-run

**Critic 주문 #5 (T5 adversary A7)**: "OMX/OMC 운영툴 0%. `/cfgm-doctor`·`/cfgm-hud`·`/cfgm-setup` 없음. R5에서 3 스킬 + install dry-run/rollback을 **P0 필수**."

그러나 R5 3 스킬의 **구현** 자체는 Epic 7~11의 새로운 엔진(Temporal, VOI, QuestionBundler 등)이 먼저 존재해야 의미 있는 진단을 낼 수 있다. 반면 **install 레이어의 위생** (manifest + version + resume + Stop 매핑 수정 + deprecation) 은 엔진 의존성 없이 독립 가능하며, 그것 자체만으로도 Epic 7+ 진입 조건을 만든다.

## 분할 결과

### Epic 12a (선행, 3일, 본 커밋 완료)

| 태스크 | 내용 | 파일 | 테스트 |
|---|---|---|---|
| T-12a.1 | `install.ts` Stop 매핑 버그 수정 + stderr deprecation warning | `bin/install.ts`, `tests/bin/install.test.ts` | +2 (Stop→session-end.ts, deprecation) |
| T-12a.2 | `install-manifest.json` 스키마 + writer | `bin/install-brain.ts`, `bin/uninstall-brain.ts`, `tests/bin/install-brain.test.ts` | +1 (T16 idempotent) |
| T-12a.3 | `CFGM:VERSION` 마커 도입 + parser upgrade branch | `bin/install-brain.ts`, `tests/bin/install-brain.test.ts` | +1 (T17 version bump → upgraded) |
| T-12a.4 | `install-progress.json` phase checkpointing (preflight/staging/commit/welcome) + resume 로그 | `bin/install-brain.ts`, `bin/uninstall-brain.ts`, `tests/bin/install-brain.test.ts` | +1 (T18 interrupted 재개) |
| T-12a.5 | Roadmap 재정화 + ADR-v2-001 (본 문서) + 411→439 교정 | `docs/**` | 0 (docs only) |

**합계**: +5 tests, 434 (Epic 6) → **439 tests**.

### Epic 12b (후행, 1.5주, Epic 7~11 후)

| 태스크 | 내용 | 의존 |
|---|---|---|
| T-12b.1 | `/cfgm-doctor` skill + 진단 규칙 | Epic 7~11 엔진 |
| T-12b.2 | `/cfgm-setup` skill (대화형 + `migrate 1→2`) | T-12a.3 version marker |
| T-12b.3 | `/cfgm-hud` statusline | Epic 7 StaleDecay, Epic 8 VoiLearner 노출 |
| T-12b.4 | E-code 카탈로그 (E01~E08) + `/cfgm-doctor`가 dispatch | T-12b.1 |
| T-12b.5 | Rollback/dry-run 모드 (`install-brain.ts --dry-run`, `--rollback <manifest-id>`) | T-12a.2 manifest |

**합계**: +18 회귀 가드 tests (변동 없음).

## 트레이드오프

### 분할의 비용
- **문서 파편화**: Epic 12를 한 군데 설명에서 2군데로 나눠야 함. Roadmap §0 표 + 본 ADR + Distribution DX spec 3곳 유지.
- **중복 노출 관리**: 두 Epic이 모두 `install-brain.ts` 파일을 수정 → PR 간 머지 충돌 리스크 (실제로는 Epic 12a가 먼저 완료되어 Epic 12b는 그 위에서만 작업).

### 분할의 이점
- **Epic 7 진입 조건 충족**: manifest + CFGM:VERSION 없이는 Epic 7의 `decayPolicy` 마이그레이션이 안전하게 작동 안함. Epic 12a 먼저 함으로써 Epic 7~11 각각이 자체 마이그레이션 책임을 manifest/version 기반으로 분리 가능.
- **레거시 사용자 즉시 구제**: `install.ts` Stop 매핑 버그는 현재 사용자에게도 영향. Epic 12를 1.5주+6주 뒤에 하기엔 너무 오래 걸림.
- **ralplan critic 수용**: R8 블로커(411→434 교정 범위)를 T-12a.5에서 처리해 Epic 7 착수 전에 모든 수치 앵커 교정.

## 결과

- Epic 12a 완료 상태에서 **439 tests green / tsc clean**.
- `~/.claude-brain/install-manifest.json`, `install-progress.json`, CLAUDE.md `<!-- CFGM:VERSION 0.1.0 -->` 마커 모두 실제 생성 확인.
- `bin/install.ts` 실행 시 stderr로 "deprecated. Use 'bun run bin/install-brain.ts'" 경고 출력; 훅 경로가 정상 `session-end.ts`로 기록됨.
- Epic 7 착수 조건 충족: 새 상태(예: `state/temporal-policy.json`)를 manifest에 추가하는 방식으로 마이그레이션 가능.

## 대안

- **대안 A**: Epic 12를 원안대로 Epic 7~11 뒤에 유지 → R8 리스크 미해결, Epic 7~11 각각이 자체 파편화된 마이그레이션 로직 작성 필요. **거부**.
- **대안 B**: Epic 12 전체를 선행 → 1.5주 블로킹, 그러나 `/cfgm-doctor`의 진단 규칙은 Epic 7~11 엔진 없이는 의미 없음 (빈 껍데기). **거부**.
- **대안 C (채택)**: install 위생층(12a)만 선행, skill/CLI 표면층(12b)은 원래 위치 유지.

## 후속

- Epic 7 착수 시 본 ADR의 "Epic 7 진입 조건" 섹션을 회귀 가드로 참조 (manifest.files에 Epic 7 신규 파일 추가됨을 T16 스타일 idempotency 테스트로 검증).
- 6개월 후(v0.3 릴리스) `install.ts` 완전 제거 — `bin/install.ts` 상단 deprecation 경고 문구에 버전 예고된 대로.
