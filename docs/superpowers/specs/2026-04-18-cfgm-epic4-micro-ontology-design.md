# CFGM-OS Epic 4 — Micro Ontology Compiler 설계 스펙

| 항목 | 값 |
|---|---|
| 스펙 ID | `SPEC-2026-04-18-epic4` |
| 작성일 | 2026-04-18 |
| 원본 스펙 | `docs/superpowers/specs/2026-04-17-cfgm-os-hook-memory-design.md` §Epic 4 |
| 의존 Epic | Epic 0, 1, 2, 3 (완료) |
| 상태 | Draft |

---

## 1. 목표

다중 flow 템플릿(`bugfix`, `architecture`, `general-task`) 기반의 **문제-스코프 미세 온톨로지**를 생성·갱신·승격하는 컴파일러 레이어를 추가한다.

**DoD (완료 기준):**
- `flow-patterns/*.yaml` 템플릿 스키마 + 3종 번들 파일
- `problems/<id>/ontology.module.yaml` 생성·갱신 로직
- `/cfgm-process` 스킬에 온톨로지 갱신 + 승격 체크 단계 추가
- `SessionStart` 훅에 현재 템플릿 정보 읽기 전용 주입
- `resolvedRuns >= 3` 달성 시 `~/.memory-brain/ontologies/promoted/` 복사
- 전체 테스트 그린 + typecheck 통과

---

## 2. 핵심 결정

| # | 결정 | 근거 |
|---|---|---|
| ED4-1 | 템플릿 선택·모듈 갱신은 `/cfgm-process` 스킬 전용 | D2 원칙: 지능은 Claude 본체, 훅은 결정적 규칙 |
| ED4-2 | SessionStart 훅은 읽기 전용 — 템플릿 이름·resolvedRuns 주입만 | 훅 복잡도 최소화 |
| ED4-3 | 승격은 파일 복사까지만 (재사용 매칭은 Epic 6 위임) | YAGNI, 범위 관리 |
| ED4-4 | YAML 파싱에 `yaml` npm 패키지 추가 | 기존 코드베이스에 YAML 파서 없음; `js-yaml`보다 TypeScript 친화적 |
| ED4-5 | `general-task` 템플릿을 신규 문제의 기본값으로 사용 | 모든 문제가 즉시 템플릿을 가지도록 |

---

## 3. 파일 구조

### 신규 생성

```
src/core/ontology/
  types.ts                 — FlowTemplate, OntologyModuleData 타입
  TemplateRegistry.ts      — YAML 로드·캐시·조회
  OntologyModule.ts        — per-problem 모듈 R/W
  PromotionEngine.ts       — resolvedRuns 체크 + 승격 복사

flow-patterns/
  general-task.yaml        — 범용 기본 템플릿
  bugfix.yaml              — 버그/장애 재현·수정 패턴
  architecture.yaml        — 아키텍처 결정 패턴

tests/core/ontology/
  template-registry.test.ts
  ontology-module.test.ts
  promotion-engine.test.ts

tests/e2e/
  epic4-golden-path.test.ts
```

### 수정

```
src/hooks/session-start.ts      — OntologyModule 읽기 전용 주입
skills/cfgm-process/SKILL.md    — 온톨로지 갱신 + 승격 체크 절차 추가
src/core/binder/ActiveProblemStore.ts — create() 시 templateId 파라미터 추가
tests/hooks/session-start.test.ts     — 모듈 주입 케이스 추가
```

### 저장 경로

```
$PROJECT/.memory-brain/
  problems/<problemId>/
    ontology.module.yaml           per-problem 모듈 (프로젝트 레벨)

~/.memory-brain/                   (CFGM_USER_HOME, 기본값 $HOME/.memory-brain)
  ontologies/promoted/
    <templateId>/
      <problemId>.yaml             승격된 모듈 (사용자 레벨)
```

---

## 4. 타입 스키마

### `FlowTemplate`

```typescript
type FlowTemplate = {
  id: string;                        // "bugfix" | "architecture" | "general-task"
  version: string;                   // "1.0.0"
  description: string;
  requiredBlockTypes: FlowBlockType[];
  recommendedBlockTypes: FlowBlockType[];
  expectedRelations: Array<{
    from: FlowBlockType;
    to: FlowBlockType;
    kind: RelationKind;
  }>;
  minConfidence: number;             // 0.0~1.0
};
```

### `OntologyModuleData`

```typescript
type OntologyModuleData = {
  problemId: string;
  templateId: string;
  templateVersion: string;
  resolvedRuns: number;              // 해결 완료 횟수 (0부터 시작)
  createdAt: string;
  lastUpdatedAt: string;
  observedPatterns: Record<string, number>;  // blockType → 누적 횟수
  promotedAt: string | null;
};
```

### `flow-patterns/bugfix.yaml` 예시

```yaml
id: bugfix
version: "1.0.0"
description: "버그/장애 재현 및 수정 패턴"
requiredBlockTypes:
  - Action
  - Outcome
recommendedBlockTypes:
  - Trigger
  - Cause
  - Evidence
  - Hypothesis
expectedRelations:
  - from: Action
    to: Outcome
    kind: followsFrom
  - from: Evidence
    to: Cause
    kind: evidencedBy
minConfidence: 0.6
```

---

## 5. 컴포넌트 인터페이스

### `TemplateRegistry`

```typescript
class TemplateRegistry {
  constructor(private readonly storage: Storage) {}

  async loadAll(): Promise<FlowTemplate[]>
  async get(templateId: string): Promise<FlowTemplate | null>
  async listIds(): Promise<string[]>
}
```

- `storage`는 `flow-patterns/` 를 루트로 하는 `FsStorage` 인스턴스 또는 테스트용 `MemoryStorage`
- YAML 파일을 `storage.readYaml()` 경유로 파싱, `FlowTemplate` 타입 검증
- 캐시 없음 (파일 수 적고 변경 빈도 낮음)

### `OntologyModule`

```typescript
class OntologyModule {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  async read(problemId: string): Promise<OntologyModuleData | null>
  async create(problemId: string, templateId: string, templateVersion: string): Promise<OntologyModuleData>
  async recordPatterns(problemId: string, blockTypeCounts: Record<string, number>): Promise<OntologyModuleData>
  async incrementResolvedRuns(problemId: string): Promise<OntologyModuleData>
  async markPromoted(problemId: string, promotedAt: string): Promise<OntologyModuleData>
}
```

저장 경로: `problems/<problemId>/ontology.module.yaml`  
파일 포맷: YAML (`yaml` 패키지 직렬화), atomic write (`writeJsonAtomic` 패턴과 동일하게 tmp→rename).

`Storage` 인터페이스에 `writeYamlAtomic` / `readYaml` 메서드 추가:
```typescript
writeYamlAtomic(path: string, data: unknown): Promise<void>
readYaml<T = unknown>(path: string): Promise<T | null>
```

### `PromotionEngine`

```typescript
class PromotionEngine {
  constructor(
    private readonly projectStorage: Storage,
    private readonly userStoragePath: string,   // ~/.memory-brain 절대 경로
    private readonly clock: Clock,
    private readonly minResolvedRuns = 3,
  ) {}

  // 승격 조건 충족 + 미승격 시 복사 실행, boolean 반환
  async maybePromote(module: OntologyModuleData): Promise<boolean>
}
```

승격 로직:
1. `module.resolvedRuns < minResolvedRuns` → return false
2. `module.promotedAt !== null` → return false (이미 승격)
3. `~/.memory-brain/ontologies/promoted/<templateId>/` 디렉터리 생성
4. 모듈 YAML을 해당 경로에 원자적 복사
5. `OntologyModule.markPromoted()` 호출 → return true

---

## 6. 기존 코드 변경

### `ActiveProblemStore.create()`

```typescript
// 기존
async create(title: string, id: string): Promise<Problem>

// 변경 후 (templateId 선택적)
async create(title: string, id: string, templateId = "general-task"): Promise<Problem>
```

Problem 생성 시 `OntologyModule.create()` 자동 호출.  
**의존성 주입**: `ActiveProblemStore` 생성자에 `ontologyModule?: OntologyModule` 추가 (optional — 없으면 모듈 미생성, 하위호환 유지).

### `SessionStart` 훅

`SessionStartDeps`에 `ontologyModule?: OntologyModule` 추가.  
active problem 있고 모듈 존재 시 stdout에 추가:

```
**템플릿:** bugfix v1.0.0
**완료 횟수:** 1 / 3
```

모듈 없거나 deps에 미전달 시 기존 동작 유지.

### `/cfgm-process` SKILL.md

기존 Step 9 (번들 처리 완료 마킹) 이전에 삽입:

```
### 9. Ontology 모듈 갱신

현재 problem의 ontology.module.yaml을 읽는다 (없으면 general-task로 create).
이번 합성에서 추가한 블록 타입 빈도를 recordPatterns()로 기록한다.
문제가 해결 완료됐다고 판단되면 (Outcome 블록이 positive + Problem supersede 등)
incrementResolvedRuns()를 호출한다.
PromotionEngine.maybePromote()를 호출해 승격 여부를 확인한다.
승격 발생 시 결과 요약에 포함한다.

bin/cfgm-ontology-record.ts 로 CLI 실행:
  echo '<json>' | bun run bin/cfgm-ontology-record.ts --problem <id> [--resolve]
```

---

## 7. 데이터 흐름

```
/cfgm-new-problem → ActiveProblemStore.create("auth bug", "auth", "bugfix")
                  → OntologyModule.create("auth", "bugfix", "1.0.0")
                  → problems/auth/ontology.module.yaml 생성

SessionStart 훅  → OntologyModule.read("auth")   [읽기 전용]
                  → stdout: "템플릿: bugfix v1.0.0 | 완료 0/3"

/cfgm-process    → FlowBlock 합성 (기존)
                  → OntologyModule.recordPatterns(blockTypeCounts)
                  → [해결 판단 시] OntologyModule.incrementResolvedRuns()
                  → PromotionEngine.maybePromote()
                  → [resolvedRuns=3] ~/.memory-brain/ontologies/promoted/bugfix/auth.yaml 복사
```

---

## 8. 테스트 전략

| 파일 | 케이스 |
|---|---|
| `tests/core/ontology/template-registry.test.ts` | YAML 로드, id 조회, 없는 id → null, listIds |
| `tests/core/ontology/ontology-module.test.ts` | create, read, recordPatterns 누적, incrementResolvedRuns, markPromoted |
| `tests/core/ontology/promotion-engine.test.ts` | resolvedRuns<3 → false, =3 → 복사+true, 이미 승격 → no-op false |
| `tests/hooks/session-start.test.ts` (확장) | 모듈 있을 때 templateId 주입, 없을 때 기존 동작 |
| `tests/e2e/epic4-golden-path.test.ts` | 문제 생성 → 합성 3회 → promoted/ 파일 존재 확인 |

`TemplateRegistry`는 실제 `flow-patterns/` 파일을 읽는 통합 테스트 1개 + MemoryStorage 기반 단위 테스트 분리.

---

## 9. 스토리 분해 (예비)

| 스토리 | 내용 |
|---|---|
| E4-S1 | `yaml` 패키지 추가 + Storage YAML 메서드 확장 |
| E4-S2 | `types.ts` + `flow-patterns/` 3종 YAML 파일 |
| E4-S3 | `TemplateRegistry` 구현 + 테스트 |
| E4-S4 | `OntologyModule` 구현 + 테스트 |
| E4-S5 | `ActiveProblemStore.create()` templateId 연동 |
| E4-S6 | `PromotionEngine` 구현 + 테스트 |
| E4-S7 | `SessionStart` 훅 읽기 전용 주입 |
| E4-S8 | `bin/cfgm-ontology-record.ts` CLI + `/cfgm-process` SKILL.md 확장 |
| E4-S9 | E2E golden path 테스트 |
