# Epic 5 — Compaction Survival 설계

**날짜**: 2026-04-19
**의존성**: Epic 2 (FlowGraph), Epic 3 (GapQuestionEngine) 완료
**DoD**: resume-sheet 생성·복원 E2E 통합 테스트 통과

---

## 목표

Claude Code 컨텍스트 컴팩션 전/후에 그래프 델타·미해결 gap·다음 질문을 보존하고 복원한다.

## 아키텍처

```
PreCompact → pre-compact.ts → ResumeSheetWriter → state/resume-sheet-<sid>.json
                                                          ↓
SessionStart → session-start.ts ← ResumeSheetReader ◄────┘ (consume-once)
```

**파일 4개 신규:**
- `src/core/compaction/types.ts`
- `src/core/compaction/config.ts`
- `src/core/compaction/ResumeSheetWriter.ts`
- `src/core/compaction/ResumeSheetReader.ts`
- `src/hooks/pre-compact.ts`

**파일 3개 수정:**
- `src/core/storage/Storage.ts` — `delete(path)` 메서드 추가
- `src/hooks/session-start.ts` — ResumeSheetReader 주입 + 복원 주입
- `bin/install.ts` — PreCompact 훅 등록

## 데이터 구조

```typescript
export type ResumeSheet = {
  version: "resume-sheet@1.0.0";
  generatedAt: string;
  sessionId: string;
  problemId: string | null;
  recentDeltas: Array<{ op: string; timestampIso: string; summary: string }>;
  openGaps: Array<{
    gapBlockId: string;
    detectorId: string;
    subjectBlockId: string;
    severity: number;
    voi: number;
    hasQuestion: boolean;
  }>;
  topPendingQuestions: Array<{
    questionBlockId: string;
    label: string;
    voi: number;
  }>;
};
```

**예산 (`config.ts`):**
- `MAX_DELTAS = 20`
- `MAX_GAPS = 10`
- `MAX_PENDING_QUESTIONS = 5`

## 저장 위치

- `state/resume-sheet-<sessionId>.json`
- 세션 스코프 + consume-once 복원 (ADR-004 참조)

## 에러 처리

- **PreCompact**: best-effort. `writeJsonAtomic` 실패 시 훅 에러 로그, 컴팩션은 계속
- **SessionStart**: 절대 실패 금지. 파일 없음/파싱 실패/버전 불일치 시 null 반환 + 파일 삭제

## 스토리 분할 (TDD)

| ID | 내용 | 산출물 |
|---|---|---|
| E5-S1 | `Storage.delete()` contract + 구현 | Storage/FsStorage/MemoryStorage + 테스트 |
| E5-S2 | `ResumeSheet` 타입 + `ResumeSheetWriter` | types.ts, config.ts, Writer + 단위 테스트 |
| E5-S3 | `ResumeSheetReader` (consume-once) | Reader + 단위 테스트 |
| E5-S4 | `pre-compact.ts` 훅 | 훅 파일 + 훅 레벨 테스트 |
| E5-S5 | SessionStart 통합 | session-start.ts 수정 + 회귀 테스트 |
| E5-S6 | `install.ts`에 PreCompact 등록 | install 스크립트 수정 |
| E5-S7 | E2E golden path | epic5-compaction-survival.test.ts |

## 테스트 요약

- 단위: ~15개 (writer 6, reader 6, storage.delete 3)
- 훅 레벨: ~7개 (pre-compact 3, session-start 확장 4)
- E2E: 4개
- 합계: **~26개 추가**
