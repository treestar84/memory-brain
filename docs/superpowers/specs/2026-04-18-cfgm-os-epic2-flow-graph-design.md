# CFGM-OS Epic 2 — Flow Graph Engine 설계 스펙

| 항목 | 값 |
|---|---|
| 스펙 ID | `SPEC-2026-04-18-cfgm-os-epic2` |
| 작성일 | 2026-04-18 |
| 상위 스펙 | [`2026-04-17-cfgm-os-hook-memory-design.md`](./2026-04-17-cfgm-os-hook-memory-design.md) |
| Phase | 2 — Flow Graph Engine |
| Epic | 2 |
| 선행 | Phase 1 (Epic 0 + Epic 1) 완료 ✅ |
| 상태 | Draft → 사용자 리뷰 대기 |

---

## 1. 요약

Observation을 Flow Block으로 **합성**하여 problem별 인과 그래프를 유지하는 레이어. 합성 주체는 **Claude 본체(지능)**, 훅·코어는 **관측의 보존·묶음·투영만** 담당한다. 어떤 문자열 절단·카운트 임계·키워드 매칭도 결정적 경로에 두지 않는다.

Epic 1이 "관측을 놓치지 않는다"를 달성했다면, Epic 2는 "관측을 이해한다"의 무대를 **오염 없이** 마련한다.

---

## 2. 핵심 의사결정 로그

| # | 주제 | 결정 | 근거 |
|---|---|---|---|
| E2-D1 | 지능 배치 재확정 | 블록 생성(type·label·confidence·relations)은 **100% Claude**. 훅/코어는 관측 **묶음만** | 상위 스펙 D2, §3.2. 하드코딩 절단/키워드/임계값이 품질 오염 진입점 |
| E2-D2 | 번들링 경계 | **1 턴 = UserPromptSubmit → 다음 UserPromptSubmit**. 결정적 단일 규칙 | 자연스럽고 결정적. 사용자 시점과 일치 |
| E2-D3 | 그래프 저장 모델 | **델타 로그(`flow-delta.jsonl`) + 스냅샷(`flow-graph.json`)** | Epic 5 graph delta 추출 원시 포맷, 특허 청구항 #3 dual-ledger |
| E2-D4 | Problem 전환 시 귀속 | 번들은 생성 시 `activeProblemId` stamping, 불변. Claude가 합성 시 `problemId` 덮어쓰기 허용 | 번들=불변 힌트, 합성=가변 판단 |
| E2-D5 | Active 없을 때 | `orphan-bundles.jsonl`에 분리 저장. 다음 `/cfgm-process`에서 Claude가 귀속 판단 | 빈 그래프 리스크 근본 해결 |
| E2-D6 | Fallback cue card | 통계·파일 경로·원문 포인터만 표시. **요약 금지** | 요약은 판단, 판단은 Claude 몫 |
| E2-D7 | 크기 예산 | cue card soft 4KB / hard 6KB, stdout 주입 1.5KB, fallback 1KB | 상위 스펙 §7.10 2KB 한도 내 배분 |
| E2-D8 | stdout 절단 규칙 | **마크다운 섹션 경계(`## `)에서만**, 문장 중간 절대 금지 | 의미 단위 보존 |
| E2-D9 | confidence 기준 | Claude가 부여, 스킬 문서에 의미적 기준표 제공 | 수치는 판단의 표현. 하드코딩 금지 |
| E2-D10 | TTL | ObservationBundle·orphan에도 7일 TTL 적용. 만료 시 `expired-bundles.jsonl`로 이동(raw ledger는 영구) | 상위 스펙 D6 일관 |

---

## 3. 아키텍처

### 3.1 데이터 흐름

```
[훅 계층, 결정적]
UserPromptSubmit
  └─ 턴 경계 마커 기록 · 이전 턴 번들 봉인
PostToolUse (Epic 1)
  └─ pending-analysis.jsonl 적재

[코어 계층, 결정적]
ObservationBundler
  └─ 봉인된 턴의 이벤트를 1개 ObservationBundle로 묶음
     · activeProblemId stamping (없으면 orphan 큐)
     · 턴 내 구조적 메트릭 집계

[지능 계층, Claude 본체]
/cfgm-process 스킬
  └─ 미처리 번들 읽기 → Flow Block 합성 → 관계 부착
     → flow-delta.jsonl 커밋 → cue-card.md 재작성

[코어 계층, 결정적]
FlowGraphProjector
  └─ flow-delta.jsonl → flow-graph.json 스냅샷 재계산
FlowGraphValidator
  └─ 스키마 · 타입 · 순환 참조 검증
CueCardFallback
  └─ 스킬 미호출 시 통계만의 대기 카드 생성
```

### 3.2 파일 레이아웃 확장

```
$PROJECT/.memory-brain/
├─ ledger/
│  ├─ bundles/YYYY/MM/DD/bundle-<id>.json    신규 · 봉인된 턴 단위 번들
│  ├─ orphan-bundles.jsonl                   신규 · active 없을 때 적재
│  ├─ expired-bundles.jsonl                  신규 · 7일 TTL 만료 이동
│  └─ (기존 Epic 1 파일 유지)
├─ problems/problem-<id>/
│  ├─ flow-delta.jsonl                       신규 · append-only 델타 로그
│  ├─ flow-graph.json                        신규 · 투영된 현재 스냅샷
│  ├─ cue-card.md                            신규 · YAML front matter + markdown
│  └─ problem.yaml (Epic 1)
└─ state/
   ├─ current-turn.json                      신규 · 열린 턴의 시작 시각·이벤트 버퍼 포인터
   └─ bundle-stats.json                      신규 · 미처리 번들 수·프로블럼별 집계
```

### 3.3 Flow Block 스키마

```typescript
type FlowBlockType =
  | "Problem" | "State" | "Trigger" | "Context" | "Constraint"
  | "Cause" | "Hypothesis" | "Action" | "Evidence" | "Outcome"
  | "Rule" | "Gap" | "Question";

type RelationKind =
  | "causes" | "evidencedBy" | "mitigatedBy"
  | "validatedBy" | "followsFrom";

type FlowBlock = {
  blockId: string;                    // blk_<type>_<8hex>
  problemId: string;
  type: FlowBlockType;
  status: "confirmed" | "superseded";
  label: string;                      // Claude 작성, 절단 없음
  confidence: number;                 // Claude 부여, 0.0~1.0
  supportedBy: string[];              // observation/event id
  relations: Array<{
    kind: RelationKind;
    targetBlockId: string;
    confidence: number;
  }>;
  createdAt: string;                  // ISO8601
  lastConfirmedAt: string | null;
  staleAfter: string | null;          // Epic 6 정책화. Epic 2는 필드만
  supersededBy: string | null;
  bundleId: string;                   // 출처 번들 역참조
};
```

### 3.4 Delta 이벤트

```typescript
type FlowDelta =
  | { op: "block-add";        timestampIso: string; block: FlowBlock }
  | { op: "block-supersede";  timestampIso: string; blockId: string; supersededBy: string; reason: string }
  | { op: "relation-add";     timestampIso: string; fromBlockId: string; relation: FlowBlock["relations"][number] }
  | { op: "cue-card-regen";   timestampIso: string; problemId: string; bodyHash: string; bodyBytes: number };
```

**원칙**: 삭제·수정 op 없음. `block-supersede`가 삭제를 대신. Projector는 supersede 체인을 따라 최신 버전만 스냅샷에 반영.

### 3.5 ObservationBundle 스키마

```typescript
type ObservationBundle = {
  bundleId: string;                   // bnd_<sessionId>_<turnOrdinal>
  activeProblemId: string | null;     // 없으면 orphan
  sessionId: string;
  turnOrdinal: number;                // 세션 내 턴 순번
  openedAt: string;                   // UserPromptSubmit 시각
  sealedAt: string;                   // 다음 UserPromptSubmit 또는 SessionEnd
  eventIds: string[];                 // raw ledger 이벤트 역참조
  observations: Observation[];        // Epic 1 Normalizer 출력 전문 보존
  metrics: {
    toolCallCounts: Record<string, number>;  // Edit: 3, Bash: 2, …
    touchedFiles: string[];
    bashExit: { success: number; failure: number };
    promptCount: number;
  };
  recentBlockIds: string[];           // 해당 problem의 최근 블록 최대 10개
  processedAt: string | null;         // 합성 완료 시각
  processedByVersion: string | null;  // 합성 당시 adapter version
};
```

### 3.6 Cue Card 스키마

```markdown
---
problemId: problem-<id>
problemTitle: "<Claude 제공>"
blockCount: <int>
openGapCount: <int>
lastSyntheticAt: <iso>
freshnessScore: <0.0-1.0, Claude 부여>
dominantConfidence: <0.0-1.0, Claude 부여>
bodyBytes: <int>
stale: <bool>                        # delta 100개 쌓이면 true
awaitingSynthesis: <bool>            # fallback 모드일 때 true
pendingBundleCount: <int>
---

## 핵심 문제
<Claude 작성, 절단 없음>

## 원인 사슬
<Claude 작성>

## 현재 상태
<Claude 작성>

## 남은 결손
<Claude 작성>
```

---

## 4. 코어 모듈 상세

### 4.1 `core/flow/types.ts`
- 위 스키마 타입 정의와 타입 가드(`isFlowDelta`, `isFlowBlock`, `isObservationBundle`).

### 4.2 `core/flow/FlowGraphStore.ts`
**책임**: 델타 append와 스냅샷 atomic 쓰기. **판단 금지**.
- `appendDelta(problemId, delta)`: `flow-delta.jsonl`에 append. 파일 10MB 초과 시 같은 날짜 내 `-part2.jsonl` 분할.
- `writeSnapshot(problemId, graph)`: atomic tmp+rename.
- `readSnapshot(problemId): FlowGraph | null`.
- `readDeltas(problemId, since?): FlowDelta[]`.

### 4.3 `core/flow/FlowGraphValidator.ts`
**결정적 검증**: 판단 아닌 규칙.
- 블록 타입이 enum 13종에 포함되는가
- 필수 필드 모두 존재 · 타입 일치
- 관계의 `targetBlockId`가 같은 problem 내 블록을 참조하는가
- supersede 체인이 순환하지 않는가
- `supportedBy`의 observation/event id가 raw ledger에 존재하는가 (warn only, not fatal)
- confidence ∈ [0, 1]
- **위반 시**: Validator가 거부, Projector는 해당 delta 무시하고 `security/hook-errors.jsonl` 기록

### 4.4 `core/flow/FlowGraphProjector.ts`
**책임**: 델타 로그 → 스냅샷. 순수 함수.
- `project(deltas: FlowDelta[]): FlowGraph`
- 입력 불변. 출력은 `{blocks, edges, cueCardMeta}` 구조.
- supersede 체인 따라 최신만 반영.
- 같은 delta 집합이면 항상 같은 스냅샷 (결정적).

### 4.5 `core/flow/ObservationBundler.ts`
**책임**: 턴 경계 기반 번들 생성. **의미 판단 없음**.
- `openTurn(sessionId, problemId, turnOrdinal, timestamp)`: `state/current-turn.json` 기록.
- `sealTurn(sessionId, observations, recentBlockIds): ObservationBundle`: 봉인하고 `ledger/bundles/…`에 쓴다. `activeProblemId=null`이면 `orphan-bundles.jsonl`로.
- `listUnprocessed(problemId?): ObservationBundle[]`: 미처리 번들 조회.
- `markProcessed(bundleId, version)`: 번들 파일에 `processedAt` 마킹.
- 이벤트 50개 초과 시 번들 분할(`bundleId-part2` 생성, `turnOrdinal` 공유).

### 4.6 `core/flow/CueCardFallback.ts`
**책임**: 스킬 미호출 상태에서 YAML 프론트매터 + 통계 body를 생성. **요약 판단 금지**.
- 입력: ObservationBundle 목록 + 기존 cue card(있으면 YAML 병합).
- 출력: cue card markdown 문자열.
- body는 고정 섹션:
  - `## 합성 대기 중` — `pendingBundleCount`, `lastBundleAt`
  - `## 활동 지표 (자동 집계)` — toolCallCounts, touchedFiles 상위 N개, bashExit 분포
- 파일 경로·숫자 외 어떤 문자열도 생성 안 함.

### 4.7 `core/flow/CueCardInjector.ts`
**책임**: SessionStart stdout 주입용 절단.
- `projectForStdout(cueCardMd, budgetBytes): string`
- 바디 바이트가 예산 초과 시 **마크다운 헤더 단위로만** 잘라냄. 섹션 중간 절대 불가.
- 잘렸으면 말미에 `> (섹션 N개 생략, 풀 뷰: .memory-brain/problems/<id>/cue-card.md)` 주석.

---

## 5. 스킬 · CLI 계약

### 5.1 `skills/cfgm-process/SKILL.md`
Claude가 읽을 문서. 다음을 명시:

**실행 절차**:
1. `bun run bin/cfgm-list-bundles.ts --unprocessed`로 미처리 번들 목록 조회 (active problem + orphan)
2. 각 번들에 대해:
   - 전문 보존된 관측 읽기
   - 해당 problem 맥락(최근 10블록) 확인
   - **의미 있는 Flow Block들 합성**: 한 관측이 여러 블록 가능, 노이즈면 블록 안 만듦
   - 기존 블록과의 관계 부착, 필요 시 supersede
3. 각 블록·관계·cue card를 `bun run bin/cfgm-apply-delta.ts`로 커밋
4. 번들을 processed 마킹 (같은 CLI가 담당)
5. 결과 요약 stdout

**판단 가이드라인** (Claude의 자유도를 해치지 않는 선에서):
- type enum 13종 중 선택
- label은 한 줄, 절단 없이 의미 보존
- confidence 기준표:
  - `0.9+`: 직접 증거 있음, 재현 완료
  - `0.7~0.9`: 명시적 증거 있음, 미재현
  - `0.5~0.7`: 추론, 부분 증거
  - `0.3~0.5`: 가설, 간접 증거
  - `<0.3`: 권장 회피 (이 수준은 Question으로 만들 것)
- 관계는 양방향 모두 필요 없음. `causes/evidencedBy`처럼 의미 있는 방향만.
- **cue card 바디 6KB 초과 시 다음 실행에서 압축**.

### 5.2 CLI 3종

#### `bin/cfgm-list-bundles.ts`
- 플래그: `--unprocessed`, `--problem <id>`, `--orphan`, `--json`
- 출력: 번들 메타 + 파일 경로 (내용은 Claude가 파일 Read로 직접 읽음)

#### `bin/cfgm-apply-delta.ts`
- stdin으로 FlowDelta JSON 수신 (단일 또는 배열)
- Validator 통과 시 FlowGraphStore에 커밋, 프로젝터 돌려 스냅샷 갱신, cue card 메타 필드 재계산
- 검증 실패 시 stderr에 이유, exit=1 (스킬 레벨이므로 hook과 달리 non-zero OK)
- 부분 실패 시 atomic: 번들 전체 rollback? → **커밋 단위는 델타 1개**. 하나 실패해도 나머지 적용.

#### `bin/cfgm-inspect-graph.ts`
- 플래그: `--problem <id>`, `--format md|json`, `--depth <n>`
- 디버깅·수동 확인용. cue card + 블록 리스트 출력.

---

## 6. 훅 확장

### 6.1 UserPromptSubmit (Epic 1 확장)
**신규 동작**: 열린 턴이 있으면 **봉인**(이전 턴의 observation을 ObservationBundler로 넘김), 새 턴 오픈.

### 6.2 SessionEnd (Epic 1 확장)
**신규 동작**: 열린 턴이 있으면 봉인. `bundle-stats.json` 갱신.

### 6.3 SessionStart (Epic 1 확장)
**신규 동작**:
- `bundle-stats.json`에서 미처리 번들 수 조회
- active problem의 cue card 존재 시 `CueCardInjector`로 1.5KB 예산 내 주입
- 미처리 번들 ≥ 3 시 `### 🧠 memory-brain` 섹션에 "미처리 번들 N개 · `/cfgm-process` 권장" 한 줄 추가
- fallback cue card도 같은 경로로 주입 (awaitingSynthesis=true 표시)

---

## 7. 동시성 · 실패 모드

### 7.1 번들 봉인 경쟁
- 동일 세션 내 UserPromptSubmit 훅은 직렬 실행 (Claude Code 보장)
- 다중 세션 동시 실행: 각 세션이 자기 `current-turn.json`을 별도 키로 관리 (`state/current-turn-<sessionId>.json`)

### 7.2 `apply-delta` 중간 실패
- 델타 단위 커밋. 하나 실패해도 진행. 실패 델타는 `security/hook-errors.jsonl`에 기록.
- Projector는 전체 델타 로그 재투영 가능 (결정적) → 수동 복구 경로 존재.

### 7.3 Claude가 잘못된 problemId로 블록 생성
- Validator가 "해당 problem에 existing target 없음" 로 거부 가능하지만, 새 블록끼리 관계면 허용. 즉 cross-problem 관계는 같은 delta 배치에서만 생성 가능.
- 잘못된 stamping을 Claude가 고쳐야 할 때: `block-supersede`로 구 블록 invalidate + 올바른 problem에 새 블록 추가.

### 7.4 델타 로그 폭증
- Epic 6 rotation까지 방치. 소프트 limit 10MB/day/problem. 초과 시 SessionStart 주입에 경고.

---

## 8. 테스트 전략

### 8.1 코어 (단위, 100%)
- **types**: 타입 가드 8종
- **FlowGraphStore**: append/read/concurrent 18 케이스
- **FlowGraphValidator**: 24 케이스 (enum·필드·순환·양수 confidence·type mismatch)
- **FlowGraphProjector**: 결정성(같은 input → 같은 output), supersede 체인, 빈 델타
- **ObservationBundler**: 턴 열기·봉인·분할·orphan 분기·TTL 만료
- **CueCardFallback**: 프론트매터 병합·통계 정확성·무절단 확인
- **CueCardInjector**: 섹션 절단·예산 정확성·바디 없음 시 헤더만

### 8.2 어댑터 (스냅샷)
- UserPromptSubmit 확장: 열린 턴 있을 때 봉인 스냅샷
- SessionEnd 확장: 봉인 + stats 갱신 스냅샷
- SessionStart 확장: 3 시나리오(cue card 있음·fallback·awaiting≥3)

### 8.3 CLI (통합)
- `list-bundles`: 8 케이스 (unprocessed / problem 필터 / orphan / 빈 결과 / json 출력)
- `apply-delta`: stdin 파싱 · Validator 실패 시 exit=1 · 부분 실패 허용 · 스냅샷 반영 확인
- `inspect-graph`: 출력 포맷 2종

### 8.4 E2E 골든 패스 (E2-S12)
**시나리오** (tmpdir):
1. `cfgm-new-problem "auth bug"`
2. 턴 1: UserPromptSubmit → Read → Edit → PostToolUse → UserPromptSubmit (턴 1 봉인)
3. 턴 2: Bash 실패 → PostToolUse → SessionEnd (턴 2 봉인)
4. SessionStart → fallback cue card 주입 확인 (미처리 2개)
5. `/cfgm-process` 시뮬레이션: 하드코딩된 FlowDelta 배열 준비 → `apply-delta`로 커밋
6. `inspect-graph` → 블록 수·관계·cue card 확인
7. SessionStart (다시) → 정식 cue card 1.5KB 내 주입 확인
8. 델타 재투영(Projector 직접 호출) → 동일 스냅샷 재현 (결정성)

**DoD**: 15+ 이벤트 체인, 15+ assertion, 2회 재실행 결정성.

---

## 9. 스토리 분해 (총 12)

| ID | 제목 | DoD | 의존 |
|---|---|---|---|
| **E2-S1** | Flow 타입 & 스키마 | types.ts + 8 타입 가드 + 단위 테스트 | Epic 1 |
| **E2-S2** | FlowGraphStore | append/read/snapshot atomic I/O, 분할 규칙 | S1 |
| **E2-S3** | FlowGraphValidator | 24 검증 규칙 테스트 그린 | S1 |
| **E2-S4** | FlowGraphProjector | 결정성 테스트 + supersede 체인 | S1, S2, S3 |
| **E2-S5** | ObservationBundler | 턴 열기·봉인·분할·orphan | S1, Epic 1 |
| **E2-S6** | Orphan Bundle 관리 | orphan 큐·TTL·재귀속 경로 | S5 |
| **E2-S7** | CueCardFallback | 프론트매터 + 통계 body, 무절단 | S5 |
| **E2-S8** | UserPromptSubmit 훅 확장 | 턴 경계 마커·이전 봉인 | S5 |
| **E2-S9** | SessionStart 훅 확장 | CueCardInjector·stats 주입·fallback | S2, S7, S8 |
| **E2-S10** | `/cfgm-process` 스킬 문서 | SKILL.md + 판단 가이드라인 | S4 |
| **E2-S11** | CLI 3종 | list-bundles·apply-delta·inspect-graph | S2, S4, S5 |
| **E2-S12** | E2E 골든 패스 | 15+ 이벤트 체인, 결정성 재현 | S1~S11 |

### 의존 그래프

```
S1 ──┬── S2 ──┬── S3
     │        └── S4 ─────────┐
     │                        │
     ├── S5 ──┬── S6          ├── S11 ── S12
     │       └── S7 ──┐       │
     │                │       │
     ├── S8 ──────────┼── S9  │
     │                │       │
     └── S10 ─────────┴───────┘
```

S11(CLI)은 S2·S4·S5 모두 필요. S9(SessionStart 확장)는 S2·S7·S8 필요. S12는 전체 선행.

---

## 10. 진척 체크리스트

- [ ] E2-S1 Flow 타입 & 스키마
- [ ] E2-S2 FlowGraphStore
- [ ] E2-S3 FlowGraphValidator
- [ ] E2-S4 FlowGraphProjector
- [ ] E2-S5 ObservationBundler
- [ ] E2-S6 Orphan Bundle 관리
- [ ] E2-S7 CueCardFallback
- [ ] E2-S8 UserPromptSubmit 훅 확장
- [ ] E2-S9 SessionStart 훅 확장
- [ ] E2-S10 `/cfgm-process` 스킬 문서
- [ ] E2-S11 CLI 3종
- [ ] E2-S12 E2E 골든 패스

---

## 10.1 설정 가능 상수

정책 파라미터는 상수 1곳(`core/flow/config.ts`)에 모아 Epic 6(Governance)에서 재튜닝 가능하게 한다. 하드코딩된 의미 판단이 아니라 **시스템 정책 파라미터**임.

| 상수 | 기본값 | 의미 |
|---|---|---|
| `MAX_EVENTS_PER_BUNDLE` | 50 | 초과 시 번들 자동 분할 |
| `MAX_RECENT_BLOCKS_CTX` | 10 | 번들의 `recentBlockIds`에 포함할 최근 블록 수 |
| `PENDING_WARN_THRESHOLD` | 3 | 미처리 번들 수 ≥ 이 값이면 SessionStart에 `/cfgm-process` 권장 주입 |
| `BUNDLE_TTL_DAYS` | 7 | ObservationBundle·orphan 만료 기간 (상위 스펙 D6 일관) |
| `DELTA_LOG_ROTATE_MB` | 10 | delta 파일 분할 임계 |
| `DELTA_STALE_COUNT` | 100 | delta 누적 시 cue card `stale=true` |
| `CUE_CARD_SOFT_KB` | 4 | 이 이상이면 다음 스킬 실행에서 "압축 요청" 힌트 |
| `CUE_CARD_HARD_KB` | 6 | 초과 시 SessionStart 주입 생략, 로그 기록 |
| `STDOUT_INJECT_BUDGET_KB` | 1.5 | cue card 주입 최대 바이트 |
| `FALLBACK_CARD_BUDGET_KB` | 1 | fallback 생성 시 목표 크기 |

## 11. Out of Scope

- Gap detection · VOI (Epic 3)
- 다중 템플릿·문제 분류 (Epic 4)
- staleAfter 정책 및 자동 decay (Epic 6)
- cross-problem Rule 공유·승격 (Epic 4)
- PreCompact 훅 snapshot (Epic 5) — 단, 델타 로그가 원시 포맷 제공
- Codex 어댑터 (Epic 7)

---

## 12. 다음 단계

1. 본 스펙 사용자 리뷰
2. `superpowers:writing-plans`로 12 스토리 구현 계획 작성
3. `superpowers:subagent-driven-development`로 구현
4. 스토리 완료 시 §10 체크리스트 갱신
