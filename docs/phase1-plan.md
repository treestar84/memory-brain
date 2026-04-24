# Phase 1 실행 계획 (B안 확정 · PR-1/PR-2/PR-3)

> 작성일: 2026-04-24
> 상태: 설계 초안 — 사용자 승인 대기
> 근거:
> - `docs/pai-gap-report.md` v2
> - `docs/_codex_plan_check.md` (1차·2차 Codex 교차검토)
> - `docs/adr/007-transcript-source-decision.md` (PR-2 B안 확정)
> 기준 커밋: `0f93e91`
> 추정 체인룰 성공률: **~74%** (PR-1 95% × PR-2 97% × PR-3 80%)
> 추정 TTS: **~2.25일**

---

## 0. 범위

**IN (Phase 1):**
- PR-1: `settings.json` additive key (hooks 외 top-level key 보호 + 정책 파라미터 주입)
- PR-2: ADR-007 확정 (transcript 미도입) — **완료됨**
- PR-3: question-policy 확장 + `QuestionQueue.rebuild()` 단일 writer 확정

**OUT (Phase 2 이후):**
- PR-4 (`contentHash` dedup + metadata 태깅) — 이월 사유는 ADR-007 §결과·v2 gap report §4
- PAI transcript extractor 이식
- Bundle → Identity 블록 승격
- LLM 기반 합성 고도화
- 3-Mode 응답 헤더

---

## 1. PR-2 — ADR-007 (완료)

`docs/adr/007-transcript-source-decision.md` 작성 완료. Phase 1은 transcript 미도입으로 확정. 본 PR은 코드 변경 없음.

---

## 2. PR-1 — `settings.json` additive key 설계

### 2.1 현행 동작 (확인된 사실)

- `bin/install-brain.ts:67` — `buildHookEntries()`는 오직 `settings.hooks[HookType]` 항목만 설정.
- `bin/install-brain.ts:528-538` — `loadSettings()`는 기존 파일 전체를 JSON parse → `settings.hooks`만 병합(matcher로 기존 entry 교체 또는 append) → 전체 재기록. **기타 top-level key는 자동 보존**됨.
- `tests/bin/install-brain.test.ts:48,113` — idempotent marker 기반 검증 (T1~T9 있음).

### 2.2 도입할 additive key (hooks와 동급 top-level)

```json
{
  "hooks": { ... 기존 설정 ... },
  "memoryBrain": {
    "questionPolicy": {
      "cooldownMinutes": 1440,
      "dailyCap": 3
    }
  }
}
```

- **key 이름 네임스페이스**: `memoryBrain.*`로 격리하여 Claude Code 자체 설정 키와 충돌 방지.
- **기본값 배치**: settings.json에 기본값을 박지 않고 `src/core/flow/config.ts`(FLOW_CONFIG)에 정의. settings.json은 **override 용도**로만 쓰고, key 자체가 없으면 기본값 사용. (→ settings.json을 실제로 쓰지 않아도 PR-3 동작 가능. 설치 경험 단순화.)

### 2.3 구현 범위

- `bin/install-brain.ts` — **본 PR에서는 코드 변경 없음**. 기존 `loadSettings()`가 top-level key를 이미 보존하므로 사용자/상위 레이어가 `memoryBrain.*` key를 직접 추가해도 기존 테스트 통과.
- `src/core/flow/config.ts` — `QUESTION_POLICY` 섹션 추가:
  ```ts
  QUESTION_POLICY: {
    COOLDOWN_MINUTES: 1440,  // 24h
    DAILY_CAP: 3,
  }
  ```
- `src/core/settings/SettingsReader.ts` (신규) — `CLAUDE_CONFIG_DIR/settings.json`을 읽어 `memoryBrain.*` key가 있으면 FLOW_CONFIG 기본값 대신 반환. 없으면 기본값.
- 의존성: `CLAUDE_CONFIG_DIR` env var(런처가 설정함). 테스트는 `MemoryStorage` 대신 `CLAUDE_CONFIG_DIR` tmpdir 사용.

### 2.4 테스트 계획

- `tests/core/settings/SettingsReader.test.ts` (신규)
  - R1: settings.json 없음 → FLOW_CONFIG 기본값 반환.
  - R2: `memoryBrain.questionPolicy.cooldownMinutes=60` → 60 반환.
  - R3: JSON 깨짐 → 기본값 반환 + stderr 경고.
  - R4: `memoryBrain` 누락 + `hooks` 정상 → 기본값 반환 + 기존 `hooks` 무해.
- **기존 T1~T9 테스트 수정 없음** 목표. `bin/install-brain.ts` 자체 변경이 없으므로 자연 만족.

### 2.5 수용 기준

- [ ] `bun test` 전부 통과 + 기존 테스트 수정 0건
- [ ] `SettingsReader` 단위 테스트 4개 통과
- [ ] `install-brain` 재실행 후 settings.json의 `memoryBrain.*` 사용자 추가 값 보존 (수동 E2E 1회)
- [ ] 난이도 1/5, 예상 성공률 95%, 예상 TTS 0.5일

### 2.6 롤백

- 신규 파일(`SettingsReader.ts`)과 config 상수 추가만. revert 1 커밋으로 완전 원복.

---

## 3. PR-3 — question-policy 확장 + `rebuild()` 단일 writer

### 3.1 현행 동작 (확인된 사실)

- `src/core/gap/QuestionQueue.ts:22` — `rebuild(graph)`는 존재하지만 **프로덕션 호출 0곳**. 테스트만 호출. (Codex 검증)
- `src/hooks/user-prompt-submit.ts:69-113` — `injectQuestion()`이 `listPending()` → `listAsked()` → 중복 체크 → `appendAsked()` → system-reminder 반환. 이미 Gap→Question 루프 존재. **cooldown 체크는 없음**.
- `src/core/gap/QuestionLifecycleResolver.ts:37` — Question이 `supersededBy` 로 닫히면 `answered` 판정. Q1 합의안(answer block + supersede reason)이 그대로 적용 가능.
- `bin/cfgm-apply-delta.ts:63-80` — 델타 append → projection → snapshot 쓰기. **`rebuild()`를 여기에 연결하는 것이 단일 writer 확정 지점**.

### 3.2 변경 사양

#### 3.2.1 `bin/cfgm-apply-delta.ts` — `rebuild()` 호출 주입

```ts
// existing loop:
for (const pid of problemsTouched) {
  const allDeltas = await store.readDeltas(pid);
  const graph = projector.project(pid, allDeltas);
  await store.writeSnapshot(pid, graph);
  await questionQueue.rebuild(graph);  // ← 신규 1줄
}
```

- 단일 writer 확정. 별도 hook 연결 없음.
- 측정: `rg -n "\.rebuild\(" src bin` 결과 `src/` 0건 + `bin/cfgm-apply-delta.ts` 1건만.

#### 3.2.2 `src/core/gap/QuestionQueue.ts` — cooldown 메타 기록

`AskedRecord` 자체는 이미 `askedAtIso`를 가짐. 새 필드 추가 불필요. cooldown 체크는 consumer 측(`user-prompt-submit.ts`)에서 `asked.jsonl` 전체를 읽어 같은 `gapBlockId`의 최신 `askedAtIso`를 비교.

#### 3.2.3 `src/hooks/user-prompt-submit.ts:85-108` — cooldown + day-cap 가드 추가

```ts
// pseudo:
const now = clock.now().getTime();
const todayIso = clock.todayIsoDate();
const cfg = await settings.getQuestionPolicy();  // PR-1 consumer
const cooldownMs = cfg.cooldownMinutes * 60_000;
const askedTodayCount = asked.filter(r => r.askedAtIso.startsWith(todayIso)).length;
if (askedTodayCount >= cfg.dailyCap) return null;  // day-cap

for (const cand of pending) {
  // 기존 체크 유지 …
  const lastAskedSameGap = asked
    .filter(r => r.gapBlockId === cand.gapBlockId)
    .sort((a,b) => b.askedAtIso.localeCompare(a.askedAtIso))[0];
  if (lastAskedSameGap) {
    const elapsed = now - new Date(lastAskedSameGap.askedAtIso).getTime();
    if (elapsed < cooldownMs) continue;  // cooldown
  }
  // 기존 appendAsked + return ...
}
```

- cooldown은 **gap 단위**(Q2 합의: `gapBlockId`). subject가 superseded되면 GapAnalyzer가 재detect 안 함(`FlowGraphProjector.ts:27`·`GapAnalyzer.ts:26`).
- day-cap은 **ISO 날짜 prefix 비교**. 타임존은 UTC 고정.

#### 3.2.4 `resolvedAs=unknown` 표현 (Q1 C안)

- 별도 필드/파일 없음. 사용자가 "모름" 응답을 `/cfgm-process`에서 기록할 때, delta를 다음으로 구성:
  1. `block-add` — type=`Outcome`, label=`"(사용자 응답: 모름)"`, confidence=0.3, problemId 동일
  2. `block-supersede` — targetBlockId = Question blockId, supersededBy = (1) 블록, reason=`"resolved:unknown"`
- `QuestionLifecycleResolver.ts:37` 로직 자체는 변경 없음 (`supersededBy != null` → `answered` 판정 유지).
- 후속 통계에서 `reason` 문자열로 unknown 분리. Phase 1에서는 통계 집계 추가는 안 함(스크립트 1개만 준비).

### 3.3 테스트 계획

- `tests/core/gap/QuestionQueue.test.ts` (기존 확장)
  - cooldown 경계: `cooldownMinutes=60`, 59분 경과 → skip, 61분 경과 → 주입.
  - 동일 gapBlockId 재주입 0회.
- `tests/hooks/user-prompt-submit.test.ts` (기존 확장)
  - day-cap 리셋: UTC 자정 경계 mock.
  - pending.length>0 but 모두 cooldown → null 반환.
  - `resolvedAs=unknown` 시나리오: supersede reason 분리.
- `tests/bin/cfgm-apply-delta.test.ts` (기존 확장 또는 신규)
  - `rebuild()` 호출 1회 정확성: 스파이로 검증.
  - `current-gaps.json` byte-identical 재현: 동일 deltas/asked로 2회 실행 결과 비교.
- 기존 `tests/e2e/epic3-golden-path.test.ts:258` 의 byte-identical 보증 유지.

### 3.4 수용 기준

- [ ] `bun test` 전부 통과 + 기존 테스트 수정 0건 (신규 추가만)
- [ ] `rg -n "\.rebuild\(" src bin` → `bin/cfgm-apply-delta.ts` 1건만
- [ ] `current-gaps.json` byte-identical 재현 (golden path)
- [ ] 쿨다운 내 동일 `gapBlockId` 재주입 0회
- [ ] day-cap 초과 시 null 반환
- [ ] `resolvedAs=unknown` 경로: supersede reason으로 분기 가능
- [ ] 수동 수용 테스트 5개:
  1. 신규 질문 생성 → 주입
  2. 같은 gap 재요청 (cooldown 내) → 억제
  3. `/cfgm-process` "모름" 응답 → supersede+reason 기록, 이후 lifecycle `answered`
  4. 일일 cap 초과 → 주입 중단
  5. UTC 자정 경계 이후 → cap 리셋

### 3.5 롤백

- `cfgm-apply-delta.ts`의 `rebuild()` 호출 1줄 revert + `user-prompt-submit.ts`의 cooldown 가드 블록 revert. 기존 동작 100% 복원.
- 난이도 3/5, 예상 성공률 80%, 예상 TTS 1.5일

---

## 4. 의존성 / 순서

```
PR-2 (ADR-007, 완료)
      ↓
  PR-1 (settings 읽기) —— 독립 가능
      ↓
  PR-3 (policy 적용, PR-1의 SettingsReader 소비)
```

PR-1과 PR-3은 merge 순서상 PR-1 먼저. 단 설계 리뷰는 병렬 가능.

---

## 5. 전체 Phase 1 완료 기준 (합의)

- [x] PR-2 ADR-007 작성 완료
- [ ] PR-1 구현·테스트 통과
- [ ] PR-3 구현·테스트 통과 + `rebuild()` 단일 writer 확정
- [ ] `bun test` 전부 통과, 기존 테스트 수정 0건
- [ ] 수동 수용 시나리오 5개 통과
- [ ] 문서: 본 계획서 상태를 "완료"로 전환, PAI gap report v2에 "Phase 1 종료" 각주 추가

---

## 6. 측정 커맨드 (체크포인트)

```bash
# 단일 writer 확인
rg -n "\.rebuild\(" src bin

# 기존 테스트 수정 0건 확인
git diff --stat origin/main..HEAD -- tests/

# 전체 테스트
bun test

# 린트/타입체크 (리포지토리 표준)
bun run --if-present typecheck
```

---

## 7. 리스크 / 미해결 질문

- **Q(남은 위험)**: PR-3에서 `user-prompt-submit.ts`에 `clock.todayIsoDate()` 같은 미존재 API를 참조하게 되면 소폭 확장 필요. → 구현 단계에서 `Clock` 인터페이스에 `isoDate()` 메서드 추가 여부만 결정(간단).
- **Q(재검토 필요)**: 사용자가 `/cfgm-process` 에서 "모름" 응답을 내는 UX가 아직 미정. PR-3 착수 시 delta 생성 CLI/프롬프트 확정 필요. 큰 변경은 아니나 먼저 확인.

---

## 8. 승인 요청 사항

1. 본 계획대로 **PR-1 구현 착수** 승인 여부.
2. PR-3의 `resolvedAs=unknown` UX (모름 응답 입력 경로)를 `/cfgm-process` 확장으로 갈지 별도 CLI(`cfgm-answer-unknown`)로 갈지 결정.
3. 성공률 74%·TTS 2.25일 추정치 수용 여부.

