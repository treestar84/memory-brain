# memory/ROUTER.md — Retrieval Policy (1차, PR-V3.2)

> 비전 §5.2 / §6 답습. 본 파일은 **지식 목록이 아니라 retrieval policy**.
> 본격 RequestClassifier 11 카테고리 + LaneSelector 7 lane 구현은 PR-V3.3.
> 본 1차는 정책 명세만 — 코드 자동화 미연동.

## 핵심 원칙

1. **메모리 전체를 읽지 않는다**. 요청 분류 → lane 선택 → 필요한 1~3개 파일만 조회.
2. **source/evidence 우선**. claim 답변 시 evidence pointer 인용 의무.
3. **persona ≠ fact**. inferred profile은 confidence 표기 + 사용자 반박 시 즉시 수정.
4. **search index는 파생물**. markdown source가 source-of-truth. index 깨지면 rebuild.
5. **append-only + projection**. 직접 수정 금지, 새 엔트리 + last-wins reduce.

## 요청 분류 (vision §6.1)

요청을 다음 중 하나 이상으로 분류:

| 카테고리 | 설명 | 우선 lane |
|---|---|---|
| QUICK | 짧은 일반 답변 | (메모리 거의 안 봄) |
| DEEP | 복잡한 분석·설계·전략 | concepts + decisions + persona 일부 |
| PROJECT | 특정 프로젝트 관련 | current + projects/{slug}.md |
| PERSONAL | 사용자 상황·선호 반영 | profile/explicit + profile/inferred + profile/goals |
| VERIFY | 근거 확인·충돌 검증 | decisions + sources/evidence |
| WRITE | 새 메모리 저장·갱신 | duplicate detection + claim upsert |
| CODE | 코드·레포·구현 | projects + code lane |
| RESEARCH | 외부 자료·OSS 조사 | sources/research/ 저장 후보 |
| CONFLICT | 기존 ↔ 새 정보 충돌 | reports/contradictions + supersede flow |
| MAINTENANCE | 정리·압축·decay·archive·lint | reports/* governance |

## Memory Lane (vision §6.2)

| Lane | 위치 | 사용 시점 |
|---|---|---|
| current | `memory/current.md` | 현재 진행 중 작업 |
| project | `memory/projects/{slug}.md` | 특정 프로젝트 지식 |
| concept | `memory/concepts/{slug}.md` | 일반화된 개념·패턴·설계 원칙 |
| decision | `memory/decisions/*.md` | 확정된 의사결정 + 근거 |
| persona | `memory/profile/{peers,representations}.jsonl` | 사용자 정체성·선호·스타일 |
| evidence | `memory/sources/*` | source file, raw session, 원본 문서 |
| governance | `memory/reports/*.md` | duplicate, stale, contradiction, review queue |
| code | repo 그 자체 + `docs/adr/*.md` | 구현·아키텍처 결정 |
| research | `memory/sources/research/*` | 외부 조사 결과 |

## 기본 라우팅 순서 (vision §6.3)

1. 요청 분류 (위 표)
2. lane 선택 (위 표)
3. `memory/current.md` 확인 (현재 작업 컨텍스트)
4. 관련 domain index 조회 (PR-V3.6 이후 — 1차는 직접 lane 디렉토리 ls)
5. canonical page 1~3개 조회 (`projects/{slug}.md` 등)
6. 부족 시 search (PR-V3.6 이후)
7. 검증 필요 시 `sources/` evidence 조회
8. 개인화 필요 시 `profile/representations` 조회
9. 답변 후 memory update 후보 생성
10. 중복/충돌 검사 후 upsert/merge/supersede

## 라우팅 제한 (vision §6.4)

- **canonical page**: 한 번에 최대 **3개**
- **source file**: 검증 필요 시에만
- **archive**: 명시 요청 또는 충돌 해결 시에만
- **persona**: 답변 품질에 실제 영향을 줄 때만
- **본 ROUTER.md**: 개별 지식 항목 추가 금지 (정책만)

## 충돌 우선순위

1. **explicit fact** (사용자 직접 발화 + source/evidence) — 최우선
2. **canonical decision** (decisions/*.md, status: active)
3. **inferred profile** (confidence ≥ 0.7)
4. **stale claim** (last_accessed > 30일) — decay 우선순위↓

같은 layer 내 충돌 시 `updated_at` 최신 우선. 단 explicit fact가 inferred profile을 덮어쓰면 inferred 는 즉시 superseded.

## 오래된 정보 처리

- **decay**: 60일 미조회 + confidence < 0.5 → 라우팅 우선순위↓ (삭제 X)
- **archive**: 명시 요청 시 또는 superseded 누적 ≥ 3 → archive/ 이동
- **delete**: 사용자 명시 + 민감 정보 한정

## 후속 PR

- **PR-V3.3**: RequestClassifier + LaneSelector + ContextBudget 코드 구현, 본 ROUTER.md를 `src/core/router/` 에서 자동 참조.
- **PR-V3.4**: Wiki Layer (sources/projects/concepts/decisions) OpenClaw 포맷 incorporate.
- **PR-V3.6**: indexes/ derived index 추가 (sqlite + rebuild).
- **PR-V3.7**: Governance reports 5종 (duplicate, stale, contradiction, low-confidence, review-queue).

## 참고

- `CLAUDE.md` / `MEMORY.md` — bootloader (본 파일 위치 인용)
- `memory/SCHEMA.md` — 디렉토리 트리 전체 설명
- 비전 §5.2 / §6.1 / §6.2 / §6.3 / §6.4
- ADR-018 §1 (게이트), ADR-021 (PersonaStore — persona lane)
