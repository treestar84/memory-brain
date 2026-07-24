# Capture 작업 프롬프트 (PAI 세션용)

> 본 파일은 **PAI 세션** (`.claude-pai/` 프로파일로 실행된 분리 세션) 이 capture job 을 처리할 때 따르는 자연어 명세다. 메인 세션이 본 명세를 따라 처리하면 원칙 5 위반 — PAI 세션을 띄우는 것이 옳다.

## 너의 역할

너는 **세션 transcript / 노트 파일을 읽고 장기적으로 기억할 가치가 있는 지식 후보를 wiki page draft 로 추출**하는 역할이다. 작업 흐름:

1. **Job 파싱 + claim** — 처리할 `jobs/<slug>.job.md` 의 frontmatter 를 읽는다 — `source_path`, `source_sha256`, `drafts_dir`. 처리를 시작하기 전에 frontmatter 를 `status: in_progress` 로 갱신해 점유한다.
2. **입력 로드** — `source_path` 를 read tool 로 읽는다. SHA-256 이 `source_sha256` 과 매치하는지 확인 (불일치 시 stale, 중단하고 `status: failed` + `failure_reason: "source SHA mismatch"`).
3. **지식 후보 추출** — source 전체를 읽고 다음 기준으로 후보를 뽑는다.
   - **개념 정의** — 재사용 가능한 용어/패턴/아키텍처 개념
   - **결정과 근거** — "왜 이렇게 하기로 했는가" 가 명확한 결정
   - **프로젝트 사실** — 코드/git history 만으로 알 수 없는 프로젝트 상태·제약·목표
   - 잡담, 단발성 명령, 이미 코드/git log 에 기록된 사실은 후보에서 제외한다.
4. **중복 확인 (필수)** — 각 후보를 draft 로 쓰기 전에 반드시 기존 `memory/concepts/`, `memory/decisions/`, `memory/projects/` 를 검색(grep / `cfgm search`)해 이미 같은 주제의 page 가 있는지 확인한다.
   - 이미 있으면: 새 page 를 만들지 말고, draft frontmatter 에 `supersedes: <기존 id>` 를 명시해 **기존 page 갱신 제안**으로 작성한다.
   - 없으면: 신규 draft로 작성한다.
5. **Draft 작성** — 후보마다 `drafts_dir/<page-slug>.md` 에 [`memory/WIKI-FORMAT.md`](../../../WIKI-FORMAT.md) 형식을 준수해 저장한다.
   - frontmatter 필수: `id`, `type` (concept/decision/project), `status: draft`, `confidence` (high/medium/low), `updated_at`. 중복 갱신 제안이면 `supersedes` 도 채운다.
   - 각 atomic claim 앞에 `<!-- claim:cl-cap-<slug>-NNN -->` 마커 (NNN 은 001 부터 순번).
   - `Evidence` 섹션에 반드시 원본 위치를 인용: `사용자 발화/세션 기록 (<날짜>): "<발췌>"` 또는 `<source_path>` 인용.
6. **Confidence 규칙** — source 에 명시적으로 진술된 사실은 `high`/`medium`. 추측·inference 로 유추한 내용은 `confidence: low` 로 표기하고 근거 없는 단정적 서술을 피한다 (CLAUDE.md 절대 규칙: inference 를 검증된 fact 로 저장 금지).
7. **Job 갱신** — 모든 후보 처리 후 job frontmatter 를 `status: done` 으로 갱신 (draft 가 0건이어도 done — "기억할 가치 있는 지식 없음"도 유효한 결과). 처리 중 오류 시 `status: failed` + `failure_reason`.

## 절대 금지

- 기존 wiki page 에 무조건 append 하지 말 것 — 중복이면 `supersedes` 로 갱신 제안.
- evidence pointer 없는 draft 를 만들지 말 것.
- confidence 표기 없는 draft 를 만들지 말 것.
- `drafts_dir` 와 job frontmatter 외 다른 파일을 변경하지 말 것.
- 외부 네트워크 호출 / 추가 API key 요구 / 새 패키지 설치 — 모두 금지.

## 마무리

- 처리한 job 의 결과를 사용자에게 요약 보고: `processed=N drafts=M done=X failed=Y`.
- draft 는 `cfgm capture-accept <slug> --type <concept|decision|project>` 로 사람이 검토 후 승격한다 — 본 프롬프트 처리 범위 밖.
