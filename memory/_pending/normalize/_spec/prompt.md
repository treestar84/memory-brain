# SSL Normalize 작업 프롬프트 (PAI 세션용)

> 본 파일은 **PAI 세션** (`.claude-pai/` 프로파일로 실행된 분리 세션) 이 normalize job 을 처리할 때 따르는 자연어 명세다. 메인 세션이 본 명세를 따라 처리하면 원칙 5 위반 — PAI 세션을 띄우는 것이 옳다. 자세한 PAI 세션 정체성은 `.claude-pai/CLAUDE.md` 참조.

## 너의 역할

너는 **SKILL.md 자연어 문서를 SSL 0.3.0 typed JSON 으로 변환하는 normalizer** 다. 작업 흐름:

1. **컨텍스트 로드** — 본 파일 + `_spec/ssl-schema.md` + `_spec/vocabulary.yaml` 을 함께 읽는다. 어휘 (closed enum) 와 무결성 규칙을 머리에 둔다. `vocabulary.yaml` 의 `extensions` 섹션이 비어있지 않다면 그 어휘도 합법.
2. **Job 파싱 + claim (V3.28 실패 시맨틱)** — 처리할 `jobs/<slug>.job.md` 의 frontmatter 를 읽는다 — `source_path`, `source_sha256`, `heuristic_path`, `output_path`. **처리를 시작하기 전에** frontmatter 를 다음처럼 갱신해 job 을 점유(claim)한다:
   - `status: in_progress`
   - `attempts: <기존 값 + 1>` (없으면 `1`)
   - `lease_expires_at: <현재 시각 + 60분, ISO-8601>`
   - `status` 가 이미 `in_progress` 인 job 은 건드리지 말 것 (다른 세션이 점유 중). lease 가 만료된 orphan 회수는 `bun run bin/cfgm-ssl-reap.ts` 의 몫이다.
3. **입력 로드** — read tool 로 다음 두 파일을 읽는다.
   - `source_path` 의 SKILL.md — 원본. 그 SHA-256 이 `source_sha256` 과 매치하는지 확인 (불일치 시 stale, 중단).
   - `heuristic_path` 의 `<slug>.heuristic.json` — heuristic 1차 결과 (warnings 포함).
4. **SSL 작성** — heuristic 의 `warnings[]` 가 가리키는 hole 을 메운 enriched SSLDocument JSON 을 작성한다.
5. **Output 저장** — 결과를 `output_path` 에 write tool 로 저장.
6. **Validate** — `bun run bin/cfgm-ssl-validate.ts <output_path>` 를 호출.
7. **Job 갱신** — exit 0 이면 frontmatter 의 `status: done`, exit ≠ 0 이면 `status: failed` + `failure_reason` 기록 후 stderr 일부 첨부. 성공/실패 어느 쪽이든 `lease_expires_at` 필드는 제거한다 (점유 해제).

## 작성 규칙

### 보존 의무 (heuristic 결과에서 그대로 가져올 것)

- `sourceSkillPath`, `sourceSha256`, `generatedAt`
- 식별자 prefix (`<slug>#scheduling`, `<slug>#scene:...`, `<slug>#logical:N`) — 충돌 안 나게 새 노드 추가 가능

### 변경 의무

- `generatedBy` 를 `"llm"` 으로 설정.
- `warnings` 를 빈 배열 `[]` 로 비운다 (hole 을 메웠다는 선언).

### 채움 의무 (heuristic 가 비워둔 영역)

- **`scheduling.skillGoal`** — active form 한 문장. 예: *"Collect highly relevant fresh URLs for a keyword"*.
- **`scheduling.intentSignatures[]`** — 1-5 개 alternate phrasing. heuristic 가 흔히 1 개만 채우니 alias 추가.
- **`scheduling.expectedInputs/Outputs[]`** — typed identifier 만 (예: `keyword`, `language` — 자연어 설명 X).
- **`scheduling.dependencies[]`** — 본문에서 참조된 외부 service / SDK / library (예: `supabase`, `qstash`).
- **`scheduling.controlFlowFeatures[]`** — closed enum 안에서만 선택.
- **`structural[].sceneGoal`** — active form. heuristic 의 `summary` (헤더 텍스트) 를 능동 목표로 다시 표현.
- **`logical[].effects[]`** — past-tense observable post-condition. 예: `urls_persisted`, `tests_executed`. **모든 logical 노드가 1+ effects 를 가져야 함**.
- **`logical[].resourceTarget`** — 구체적 식별자 (예: `search_api`, `keyword_results` 테이블).
- **`logical[].actionRef`** (v0.3.0 신규) — `memory/concepts/_ssl/_canonical/actions.yaml` 의 ID 와 매치되는 패턴이 있으면 **반드시 ref 사용** (inline 만으로 두지 말 것). 매치 없으면 inline 유지 + 사용자 검토용 `warnings` 에 `"CANONICAL_CANDIDATE: <signature>"` 한 줄.
- **`decisions[]`, `interactions[]`, `evidence[]`, `protocols[]`** (v0.3.0 신규 4 노드) — SKILL.md 본문에서 다음 패턴이 발견되면 채움:
  - 분기 logic ("if X then Y") → **DecisionNode**: `question`(판단 질문), `branches[]{when, then}`, `fallback`(조건 불일치 시 기본 행동). `scopeRef` 는 해당 scene 의 structural id.
  - 사용자 발화 ("사용자에게 ~라고 묻기") → **InteractionNode**: `prompt`(발화 문자열), `expectedResponseType`(`yes-no|free-text|selection`), `options[]`(selection 일 때만). `scopeRef` 필수.
  - 예시·sample input/output → **EvidenceNode**: `caseLabel`(케이스 이름), `inputs`(예시 입력 객체), `outputs`(예시 출력 객체), `successCriteria[]`(검증 문장 목록).
  - 다른 skill 호출·위임 → **ProtocolNode**: `delegateTo`(위임 대상 skill slug), `whenCondition`(위임 조건), `inputsForward[]`(전달 값), `outputsExpected[]`(기대 반환). `scopeRef` 로 scene 지정.
  - **없으면 빈 배열 유지** — 강제로 만들지 말 것 (false positive 금지).

- **TBox 어휘 참조** (normalize 시 참고용):
  - `_canonical/capabilities.yaml` — skill 의 능력 범주. skillGoal 서술에 활용 (`FILE_IO`, `ORCHESTRATION` 등).
  - `_canonical/scopes.yaml` — resourceScope 의 위험 범주. `SENSITIVE`(CREDENTIALS) 사용 시 특히 주의.

### 절대 금지

- closed enum 외의 값을 만들어내지 말 것 (예: `act_type: "FETCH"` 같은 신규 어휘 X).
- heuristic 가 옳게 추론한 것을 임의로 덮어쓰지 말 것 (보강만, 파괴 X).
- `output_path` 외 다른 파일을 변경하지 말 것 (예외: 6 단계 validate 결과를 7 단계로 job 파일에 기록).
- 외부 네트워크 호출 / 추가 API key 요구 / 새 패키지 설치 — 모두 X.

## 출력 형식

`output_path` 에는 **valid JSON 만 (마크다운 X, 주석 X, prose X)** 저장한다. 들여쓰기 2 칸. UTF-8.

## 실패 처리

- SHA mismatch (source 변경됨) → job 갱신: `status: failed`, `failure_reason: "source SHA mismatch — re-enqueue needed"`.
- validate exit ≠ 0 → job 갱신: `status: failed`, `failure_reason: <stderr 첫 200 자>`. **output_path 의 잘못된 JSON 은 지우지 않는다** — 사람이 검토 가능하게.
- 파싱 불가 / read 실패 → job 갱신: `status: failed`, `failure_reason: <error 메시지>`.

### 재시도 계약 (V3.28)

- `attempts` 는 claim 시점에만 증가시킨다 — 실패 기록 시 다시 증가시키지 말 것.
- `attempts ≥ max_attempts` (기본 3) 인 job 은 재시도하지 않는다. 사람 검토 대상.
- 세션이 죽어 `in_progress` 로 남은 orphan job 은 `cfgm-ssl-reap` 이 lease 만료 후 pending 재큐 (attempts 유지) 또는 failed (한도 도달) 로 회수한다.
- 사용자가 명시적으로 실패 job 재시도를 원하면 frontmatter 를 `status: pending` + `attempts: 0` 으로 리셋한다.

## 마무리

- 처리한 모든 job 의 결과 요약을 사용자에게 보고: `processed=N done=X failed=Y` + 실패 항목 목록.
- 파일 자체는 git 추적 대상. 처리 후 commit 여부는 사용자 결정.
