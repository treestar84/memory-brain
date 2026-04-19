# CFGM-OS 핸드오프 문서

> 최종 갱신: 2026-04-19  
> 목적: 컨텍스트 압축(컴팩션) 또는 세션 전환 시 빠른 재개를 위한 상태 기록

---

## 현재 위치

**브랜치**: `master`  
**마지막 커밋**: `f2eb6f7` feat(E6-S7): E2E golden path for Epic 6 governance lifecycle  
**진행 단계**: Epic 0~6 완료. **Epic 7 (Codex Adapter) 보류 중.**

---

## 완료 현황 (Epic 0~6)

| Epic | 내용 | 테스트 |
|---|---|---|
| 0 | Hook-native Ledger MVP | ✅ |
| 1 | Hook-native Ledger MVP (확장) | ✅ |
| 2 | Flow Graph Engine | ✅ |
| 3 | Gap Question Engine | ✅ |
| 4 | Micro Ontology Compiler | ✅ |
| 5 | Compaction Survival | ✅ |
| 6 | Governance (Lean) | ✅ |

**총 테스트: 411 pass / 0 fail, typecheck clean**

---

## Epic 6 추가된 주요 컴포넌트

| 컴포넌트 | 경로 | 설명 |
|---|---|---|
| `ProblemStatus` | `src/core/binder/ActiveProblemStore.ts` | `active\|resolved\|archived` 라이프사이클 |
| `StaleDecayEngine` | `src/core/governance/StaleDecayEngine.ts` | staleAfter 지난 블록 자동 supersede |
| `StructuralValidator` | `src/core/governance/StructuralValidator.ts` | shacl-lite.yaml 기반 그래프 검증 |
| `RotationEngine` | `src/core/governance/RotationEngine.ts` | 90일 경과 resolved 문제 → `.archive/` 이동 |
| `GOVERNANCE_CONFIG` | `src/core/governance/config.ts` | decay grace, rotation days 등 |
| `shacl-lite.yaml` | `src/core/governance/assets/shacl-lite.yaml` | 기본 검증 규칙 (커스텀 오버라이드 가능) |
| `/cfgm-validate` | `bin/cfgm-validate.ts`, `skills/cfgm-validate/` | on-demand 그래프 검증 |
| `/cfgm-rotate` | `bin/cfgm-rotate.ts`, `skills/cfgm-rotate/` | dry-run/apply 아카이브 이동 |

---

## Epic 5 Codex 지적 사항 처리 현황

| 항목 | 상태 | 내용 |
|---|---|---|
| PreCompact best-effort try/catch | ✅ 완료 | `src/hooks/pre-compact.ts` — ledger/writer 예외 삼킴 |
| consume-once cross-session 문제 | ✅ 의도적 결정 | ADR-004에 "단일 세션 모델 non-goal" 명시 |

## 미해결 Codex 지적 사항

| 우선순위 | 내용 | 파일 |
|---|---|---|
| P2 | `_bmad/` gitignore 제거 — BMad 스킬이 `_bmad/_config/` 파일에 의존 | `.gitignore:6` |
| P2 | `.agents` gitignore 제거 — 에이전트 런타임 변경이 리뷰에서 숨겨짐 | `.gitignore` |
| P2 | raw 훅 페이로드 리댁션 강화 — `raw: unknown` 허용 목록 기반으로 변경 | hook-memory-design.md |

---

## 다음 단계

### Epic 7 (보류 중)
- **목표**: Codex CLI에서 동일 코어 작동 · 메모리 크로스-플랫폼 공유
- **DoD**: `adapters/codex/` · Codex fixture · `--platform=codex` 설치 · 크로스-플랫폼 smoke
- **의존성**: Epic 1~3 (Epic 4~6 완료 후 진행 가능)
- **상태**: 브레인스토밍 미시작

### 기타 잠재 작업
- gitignore 정리 (Codex P2 항목들)
- `docs/artifacts.md` 업데이트 (Epic 6 항목 추가)

---

## 빠른 재개 체크리스트

```bash
# 테스트 확인
bun test

# 타입체크
bun run typecheck

# 최근 커밋 확인
git log --oneline -10

# Epic 7 시작하려면
# → /brainstorming Epic 7 Codex Adapter 설계
```

---

## 핵심 파일 경로 참조

| 역할 | 경로 |
|---|---|
| 메인 스펙 | `docs/superpowers/specs/2026-04-17-cfgm-os-hook-memory-design.md` |
| Epic 5 스펙 | `docs/superpowers/specs/2026-04-19-cfgm-epic5-compaction-survival-design.md` |
| Epic 6 ADR | `docs/adr/004-session-scoped-resume-sheet.md` |
| 아티팩트 인벤토리 | `docs/artifacts.md` |
| ADR 목록 | `docs/adr/` |
| Governance 설정 | `src/core/governance/config.ts` |
| SessionStart 훅 | `src/hooks/session-start.ts` |
| PreCompact 훅 | `src/hooks/pre-compact.ts` |
| FlowGraphStore | `src/core/flow/FlowGraphStore.ts` |
