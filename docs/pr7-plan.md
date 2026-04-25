# PR-7 실행 계획 — Bundle→Identity sidecar MVP (v2)

> 작성일: 2026-04-26 (v2 — codex 권장 4건 반영)
> 상태: codex 최종 점검 통과 → 구현 착수
> v2 보강: (1) `sealTurn()` 반환값 직접 활용, (2) nudge를 SessionStart로 이동, (3) CLI accept/reject `--force --reason`, (4) "tools-only seed rule" 정직 표기
> 선행: ADR-009(`0e2ecce`), PR-6 metadata(`4716da1`)
> 후속: ADR-008 게이트 재점검 → ADR-010(transcript 도입) 작성 여부 결정
> 추정 성공률: ~70% (MVP, 운영 데이터 누적 후 튜닝 전제)
> 추정 TTS: ~3~5일

---

## 0. 목적

ADR-009에서 결정한 Bundle→Identity sidecar 모델을 MVP로 구현한다. ADR-008 트리거 **T3 (Bundle→Identity 승격 흐름)**를 완전 충족한다.

본 PR은 **rule-based 후보 탐지 + 명시 명령 승인**까지만. PAI 9-file로의 export는 범위 밖(후속 ADR로 분리).

---

## 1. 결정 사항 (ADR-009 P1~P6 + 본 PR 구체화)

| # | 결정 | 비고 |
|---|---|---|
| P1 | sidecar 경로: `identity/promoted-candidates.jsonl` (append-only) | ADR-009 P1 |
| P2 | 후보 탐지: rule-based만. LLM 합성 금지 | ADR-009 P2 |
| P3 | 승인 트리거: 명시 명령(`/cfgm-promote-*`). session-end 자동 승격 금지 | ADR-009 P3 |
| P4 | 상태 모델: `pending → accepted / rejected / superseded` | ADR-009 P4 |
| P5 | 신규 모듈: `src/core/identity/*` | ADR-009 P5. 기존 `PromotionEngine` 확장 금지 |
| P6 | accepted 후보의 PAI 9-file 직접 쓰기 금지 | ADR-009 P6. 본 PR은 ledger 상태 변경까지만 |
| **P7** | **레코드 구조**: 같은 파일에 candidate 전체 형태로 append, last-wins (같은 candidateId 마지막 줄 우선) | partial record 분기 회피, MVP 단순성 |
| **P8** | **MVP detector rule 1개**: bundle.metrics.toolCallCounts에서 한 tool ≥ 5회 사용 → `proposedTarget: "tools"` 후보 | 보수적 임계값. false positive 발생 시 PR-7 종료 후 튜닝 |
| **P9** | **SessionStart nudge 임계값**: pending ≥ 5 시 다음 SessionStart에서 stdout context로 nudge | session-end stderr는 UX 채널 신뢰도 낮음 (codex 권장). session-start.ts:240 패턴 정합 |
| **P10** | **CLI 출력**: 기본 plain text, `--json` 옵션 지원 | 기존 `cfgm-list-bundles` 패턴 정합 |
| **P11** | **MVP는 "tools-only seed rule"**: proposedTarget 단일(`"tools"`). 다른 IDENTITY_TARGETS 매핑은 후속 | T3 충족 보고 시 정직하게 "seed rule"로 표기 (codex 권장) |
| **P12** | **재결정(reversal) 정책**: 기본 throw, `--force --reason "..."`로만 last-wins reversal 허용 | legitimate reversal 경로 명시 (codex 권장). reason은 force 시 필수 |
| **P13** | **superseded 상태 진입 경로**: PR-7에서 생성하지 않음. enum에 예약만 두고 후속 PR에서 도입 | enum 안전 + 미래 호환 유지 |

---

## 2. 변경 사양

### 2.1 신규 모듈: `src/core/identity/types.ts`

```ts
export const IDENTITY_TARGETS = [
  "telos", "persona", "user", "tools", "voice",
  "beliefs", "models", "strategies", "ideas",
] as const;
export type IdentityTarget = typeof IDENTITY_TARGETS[number];

export const PROMOTION_STATUSES = ["pending", "accepted", "rejected", "superseded"] as const;
export type PromotionStatus = typeof PROMOTION_STATUSES[number];

export interface PromotedCandidate {
  candidateId: string;            // randomUUID
  bundleId: string;
  proposedTarget: IdentityTarget;
  proposedLabel: string;
  detectedBy: string;             // rule id
  metrics: Record<string, number>;
  status: PromotionStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;       // "user" or null
  reason: string | null;
}
```

### 2.2 신규 모듈: `src/core/identity/PromotionLedger.ts`

- 경로: `identity/promoted-candidates.jsonl` (append-only)
- API:
  - `append(candidate: PromotedCandidate): Promise<void>` — full record append
  - `list(filter?: { status?: PromotionStatus }): Promise<PromotedCandidate[]>` — last-wins로 최신 상태 reduce 후 필터링
  - `getById(candidateId: string): Promise<PromotedCandidate | null>` — list에서 단일 추출
  - `decide(candidateId, status: "accepted"|"rejected", reason?: string, decidedBy?: string): Promise<PromotedCandidate>` — getById로 base 가져와 status·decidedAt·decidedBy·reason만 갱신해 append. 미존재 시 throw.

### 2.3 신규 모듈: `src/core/identity/CandidateDetector.ts`

- 입력: `ObservationBundle`
- 출력: `PromotedCandidate[]` (status: "pending", decidedAt/decidedBy/reason: null)
- MVP rule: `high-tool-call-pattern`
  - bundle.metrics.toolCallCounts 순회 → count ≥ 5인 tool 각각에 대해 후보 1건
  - proposedTarget: `"tools"`
  - proposedLabel: `\`tool 사용 패턴: ${toolName} (${count}회)\``
  - detectedBy: `"high-tool-call-pattern"`
  - metrics: `{ toolCallCount: count }`
- candidateId는 `crypto.randomUUID()` (이미 FsStorage에서 사용)

### 2.4 신규 CLI: `bin/cfgm-promote-list.ts`

```bash
bun run bin/cfgm-promote-list.ts [--status pending|accepted|rejected|superseded] [--json]
```

- 기본: status=pending 필터
- text 출력: `${candidateId.slice(0,8)}  ${proposedTarget}  ${proposedLabel}  ${detectedBy}  ${createdAt}`
- `--json` 출력: 전체 PromotedCandidate 배열

### 2.5 신규 CLI: `bin/cfgm-promote-accept.ts`

```bash
bun run bin/cfgm-promote-accept.ts <candidateId> [--reason "..."] [--by "user"] [--force]
```

- 미존재 candidateId → exit 1, stderr 에러
- 이미 accepted/rejected이고 `--force` 없음 → exit 1, stderr `이미 결정됨 (--force --reason "..."으로 재결정)`
- `--force` 사용 시 `--reason` 필수. reason 없으면 exit 1
- 성공 → stdout `accepted ${candidateId}` 출력, exit 0

### 2.6 신규 CLI: `bin/cfgm-promote-reject.ts`

- accept와 동일 패턴. status="rejected". 동일하게 `--force --reason` 지원

### 2.7 `src/hooks/session-end.ts` — `sealTurn()` 반환값으로 detect

`sealTurn()`은 이미 primary `ObservationBundle | null`을 반환(`ObservationBundler.ts:36~74`). 현재는 반환값을 버리고 있음 → **이 값을 그대로 detector에 전달**한다. 신규 API 추가 없음.

```ts
// handleSessionEnd 안:
if (state && state.sessionId && !state.closed) {
  const drained = await deps.queue.drainForSession(event.sessionId);
  const observations = drained.map((p) => ({ type: p.payload.type, data: p.payload.data }));
  const sealed = await deps.bundler.sealTurn(event.sessionId, observations, []);
  if (sealed) {
    const candidates = deps.candidateDetector.detect(sealed);
    for (const c of candidates) await deps.promotionLedger.append(c);
  }
}
```

- nudge는 SessionEnd에서 발생시키지 않는다 (codex 권장 — stderr UX 채널 신뢰도 낮음).
- 자동 승격 절대 안 함 — ledger append만.

### 2.8 `src/hooks/session-start.ts` — nudge 추가

`session-start.ts:240` 패턴 (`unprocessedBundles ≥ PENDING_WARN_THRESHOLD` 시 lines.push) 정합으로 promotion pending nudge 추가.

```ts
// handleSessionStart 끝부분, identity nudge 직전:
const pendingPromotions = await deps.promotionLedger.list({ status: "pending" });
if (pendingPromotions.length >= 5) {
  lines.push("");
  lines.push(`> 🔔 promotion pending 후보 ${pendingPromotions.length}건 — \`bun run bin/cfgm-promote-list.ts\`로 확인 후 \`-accept\`/\`-reject\`. (PAI export는 후속 ADR)`);
}
```

- stdout context (system reminder 식 주입)로 신뢰도 확보.
- 메시지에 "PAI export는 후속 ADR" 한 줄 안내 (사용자 혼동 방지).
- 임계값 `5`는 일단 상수. 추후 settings overrideable.

### 2.9 `src/hooks/bootstrap.ts` deps 확장

- `BootstrappedDeps`에 `promotionLedger: PromotionLedger`, `candidateDetector: CandidateDetector` 추가
- `buildDeps()`에 두 객체 인스턴스화

---

## 3. 테스트 계획

### 3.1 단위 테스트

- `tests/core/identity/PromotionLedger.test.ts` (9 case)
  - 빈 ledger list → []
  - append 후 list → 1건
  - 같은 candidateId 두 번 append → list는 last-wins 1건
  - decide("accepted") → status·decidedAt·decidedBy 갱신
  - decide 미존재 candidateId → throw
  - 이미 accepted를 force 없이 decide → throw
  - 이미 accepted를 `decide(force=true, reason)`으로 reversal → 성공 (last-wins 적용)
  - status filter 동작 (pending/accepted)
  - getById null 케이스

- `tests/core/identity/CandidateDetector.test.ts` (4 case)
  - 빈 metrics → []
  - tool 4회 (임계값 미달) → []
  - tool 5회 → 후보 1건, proposedTarget=tools
  - 여러 tool 각각 ≥ 5 → 각각 후보

### 3.2 CLI 테스트

- `tests/bin/cfgm-promote-cli.test.ts` (8 case)
  - list 빈 ledger → exit 0, 빈 출력
  - list --json → JSON.parse 성공
  - accept 미존재 → exit 1, stderr 메시지
  - accept 성공 후 list 기본(pending) → 빈
  - accept 성공 후 list --status accepted → 1건
  - reject 동일 패턴 1 case
  - 이미 accepted를 `--force` 없이 accept → exit 1
  - `--force --reason "..."`로 reversal → exit 0, status 갱신

### 3.3 hook 통합

- `tests/hooks/session-end.promote.test.ts` (2 case)
  - sealTurn 반환 bundle을 detector에 전달 → 후보 ledger에 append
  - sealTurn이 null이면 detect 스킵
- `tests/hooks/session-start.promote.test.ts` (2 case)
  - pending < 5 → nudge 미발생
  - pending ≥ 5 → stdout context에 nudge 라인 포함

### 3.4 기존 회귀

- 기존 481+15=496 모두 그대로 통과
- session-end 기존 테스트 영향 없음 (nudge 추가는 비파괴)

---

## 4. 수용 기준

- [ ] `bun test` 전체 통과 (496 → 예상 ~521, +25 = ledger 9 + detector 4 + CLI 8 + hook 4)
- [ ] 기존 golden path byte-identical
- [ ] CLI 3종(list/accept/reject) + reversal(`--force --reason`) 수동 E2E 1회
- [ ] SessionStart nudge 수동 E2E 1회 (5건 만들고 hook 트리거)
- [ ] `bun x tsc --noEmit` 통과
- [ ] PAI 9-file 자동 쓰기 부재 확인 (grep `identity/.*\.md` 쓰는 코드 추가 안 됨)
- [ ] T3 보고에 "tools-only seed rule" 정직 표기

---

## 5. 롤백

- `src/core/identity/`, `bin/cfgm-promote-*`, 신규 테스트 삭제
- `src/hooks/session-end.ts` nudge 코드 revert
- `ObservationBundler.lastSealedForSession`(추가했다면) revert
- `identity/promoted-candidates.jsonl`은 append-only 잔존해도 무해

---

## 6. 잔여 리스크

| 위험 | 완화 |
|---|---|
| MVP rule 1개가 부족하거나 false positive 다수 | PR-7 종료 후 1주 운영 데이터 누적 후 임계값 튜닝 또는 rule 추가. 본 PR은 임계값 보수적 5회 |
| `last-wins` 모델이 ledger scan 비용↑ | append-only이므로 누적되나, 후보 수 가정 ≤ 수백. Phase 4 이후 압축 정책 |
| nudge 임계값 5가 너무 빈번하거나 너무 드묾 | 임계값을 모듈 상수로 빼서 향후 settings.json overrideable로 (이번 PR은 상수만) |
| `bundler.lastSealedForSession` 신규 추가 시 부수 영향 | 기존 `listUnprocessed` 활용 우선, 정말 필요하면 최소 추가 |
| accept한 후 PAI digest에 반영 안 됨 → 사용자 혼동 | nudge 메시지에 "PAI export는 별도 후속 ADR" 한 줄 안내 |

---

## 7. 측정 커맨드

```bash
# 단위 + CLI
bun test tests/core/identity/ tests/bin/cfgm-promote-cli.test.ts tests/hooks/session-end.promote.test.ts

# 전체 회귀
bun test

# 타입체크
bun x tsc --noEmit

# 수동 E2E (CLI)
CFGM_HOME=$(mktemp -d) bun run bin/cfgm-promote-list.ts --json
```

---

## 8. 구현 순서

1. `src/core/identity/types.ts` (PromotedCandidate, IDENTITY_TARGETS, PROMOTION_STATUSES)
2. `src/core/identity/PromotionLedger.ts` + 단위 테스트 8 case
3. `src/core/identity/CandidateDetector.ts` + 단위 테스트 4 case
4. CLI 3종 (`bin/cfgm-promote-{list,accept,reject}.ts`) + 통합 테스트 6 case
5. `src/hooks/session-end.ts` nudge 통합 + 테스트 3 case
6. 전체 회귀 + tsc
7. 단일 커밋: `feat(identity): PR-7 Bundle→Identity sidecar MVP (ADR-009)`
