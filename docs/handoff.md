# CFGM-OS 핸드오프 문서

> 최종 갱신: 2026-04-19  
> 목적: 컨텍스트 압축(컴팩션) 또는 세션 전환 시 빠른 재개를 위한 상태 기록

---

## 현재 위치

**브랜치**: `master`  
**마지막 커밋**: `a6bfe71` feat(E4-S9): E2E golden path for Epic 4 ontology lifecycle  
**진행 단계**: Epic 5 (Compaction Survival) 브레인스토밍 중

---

## Epic 0~4 완료 상태

모두 완료. 테스트 332개 통과, typecheck 클린.  
상세 아티팩트 목록: `docs/artifacts.md`

---

## Epic 5 브레인스토밍 결정 사항

### 확정된 설계 결정

| 결정 | 내용 |
|---|---|
| resume-sheet 위치 | `state/resume-sheet-<sessionId>.json` (세션 스코프) |
| 복원 방식 | consume-once: SessionStart에서 읽고 즉시 삭제 |
| 아키텍처 | ResumeSheetWriter 서비스 클래스 (`src/core/compaction/`) |

### resume-sheet 포함 내용 (미확정, 브레인스토밍 진행 중)

- 그래프 델타 (최근 N개 or 마지막 스냅샷 이후)
- 미해결 gap (`QuestionQueue.readCurrentGaps()`)
- 다음 질문 Top-N (`QuestionQueue.listPending()`)

### 미결정 사항

- 델타 범위: 전체 vs 최근 N개
- resume-sheet에 포함할 최대 바이트 예산 (SessionStart stdout 제한 있음)
- `install.ts`에 PreCompact 훅 등록 필요 (현재 미등록)

---

## Codex 리뷰 지적 사항 (미해결)

| 우선순위 | 내용 | 파일 |
|---|---|---|
| P2 | `_bmad/` gitignore 제거 — BMad 스킬이 `_bmad/_config/` 파일에 의존 | `.gitignore:6` |
| High | `.agents` gitignore 제거 — 에이전트 런타임 변경이 리뷰에서 숨겨짐 | `.gitignore` |
| High | raw 훅 페이로드 리댁션 강화 — `raw: unknown` 허용 목록 기반으로 변경 필요 | `docs/...hook-memory-design.md:60-68` |

---

## 다음 단계

1. **Epic 5 브레인스토밍 완료** → 스펙 파일 작성 (`docs/superpowers/specs/2026-04-19-cfgm-epic5-compaction-survival-design.md`)
2. **writing-plans 스킬** → 구현 플랜 작성
3. **subagent-driven-development** → E5-S1부터 TDD 구현
4. **gitignore 정리** (Codex P2) — `_bmad/`, `.agents` 처리

---

## 빠른 재개 체크리스트

```bash
# 테스트 확인
bun test

# 타입체크
bun run typecheck

# 현재 브레인스토밍 위치
# Epic 5: 접근 방식 제안 완료, 설계 섹션 발표 단계
```

---

## 핵심 파일 경로 참조

| 역할 | 경로 |
|---|---|
| 메인 스펙 | `docs/superpowers/specs/2026-04-17-cfgm-os-hook-memory-design.md` |
| Epic 4 스펙 | `docs/superpowers/specs/2026-04-18-cfgm-epic4-micro-ontology-design.md` |
| 아티팩트 인벤토리 | `docs/artifacts.md` |
| ADR 목록 | `docs/adr/` |
| SessionStart 훅 | `src/hooks/session-start.ts` |
| FlowGraphStore | `src/core/flow/FlowGraphStore.ts` |
| QuestionQueue | `src/core/gap/QuestionQueue.ts` |
