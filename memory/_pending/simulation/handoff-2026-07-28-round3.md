# 핸드오프 — 실효성 검증 시뮬레이션 round 3 완료 (2026-07-28)

> round 3(코드 수정 + 3-프로젝트 A→C→B 확장 시뮬레이션)는 **완료됐다**. 이 파일은 결과
> 기록이다. 다음 세션은 "그 외 미해결 항목" 절부터 보면 된다.

## 이번 라운드에서 한 일

1. **버그 수정 (커밋 `93a6f2c`)**: `resolveStorageRoot()`의 fallback을 `resolveRepoRoot()`와
   동일하게 cwd 기준으로 변경. env var 미지정 시 검색 인덱스가 `~/.claude-brain/memory-brain/`
   전역 경로 대신 `<cwd>/.memory-brain/`로 프로젝트별 분리됨. 회귀 테스트 5건 추가
   (`tests/hooks/bootstrap.test.ts`). `bun test` 1149/1149.
2. **확장 시뮬레이션 (round 2의 3배 규모)**: 온라인에서 수집한 실제 레퍼런스(largest remainder
   method/electowiki, GCRA·race condition/SlashID 블로그, Stripe idempotency 설계 원칙 +
   WooCommerce #2339·Evergreen #2057948 실제 버그 리포트)를 절반 이상 근거로 주입해 세 개의
   독립 프로젝트(A1 정산 알고리즘, A2 분산 rate limiter, A3 결제 idempotency)를 병렬 실행,
   각자 실제 레퍼런스를 재현하는 버그를 겪고 고치고 캡처했다.
3. **C(독립 체크포인트) 3-프로젝트 교차 검증**: 27개 키워드×프로젝트 조합 전수 실행 + 3라운드
   반복 → 완전한 블록 대각(자기 프로젝트만 hit, 교차 오염 0건), 툴 저장소 무오염.
   **VERDICT: PASS** — storageRoot fix가 다중 프로젝트 동시 사용 상황에서 격리를 보장함을 확인.
4. **B(블라인드 인수인계)**: A2(rate limiter) 프로젝트로 진행. memory-brain의 실제 부가가치를
   솔직하게 평가 — "이 프로젝트처럼 세션 기록 문서가 이미 잘 되어 있으면 정보 전달자로서는
   중복, 색인/라우터로서는 유효"라는 결론. `cfgm ask`가 도메인 어휘를 모르면 0건을 반환하는
   실제 UX 갭도 발견(자연어로 "왜 이런 구조인가"는 실패, "rate limiter를 왜 원자적으로
   묶었나"는 성공 — 인수인계 상황에서 정확히 그 어휘를 모르는 게 문제인데도).
5. **부가 DX 버그 3건 수정 (커밋 `a803f96`)**: A1/A2/A3/C가 공통으로 재현한 문제들.
   - `cfgm capture`가 신규 프로젝트에 `_spec/prompt.md`/`WIKI-FORMAT.md`를 스캐폴드하지
     않아 capture job의 지시를 따를 방법이 없었음 → 툴 저장소의 canonical 사본을 최초 1회
     복사하도록 수정(프로젝트가 자체 버전을 가지면 덮어쓰지 않음).
   - `capture-accept --help`/`-h`가 슬러그로 오인되어 "draft 를 찾을 수 없습니다: --help.md"
     라는 혼란스러운 에러가 나왔음(exit code는 원래도 1이었음 — "exit 0"이라는 서브에이전트
     보고는 직접 재현 결과 사실이 아니었다, 근거 없이 신뢰하지 않고 검증 후 진행) → 이제
     사용법을 출력하고 exit 0.
   - draft가 repo/storage 어느 큐에도 없을 때 에러 메시지가 한쪽 경로만 보여줘 사용자를
     엉뚱한 디렉토리로 유도 → 두 경로 모두 명시하도록 수정.
   - 회귀 테스트 4건 추가. `bun test` 1153/1153.

## 추가 수정 (2026-07-29, 커밋 `ea99ef4`)

`cfgm ask`의 도메인 어휘 의존 문제를 수정했다:
- `rebuild-index`/`capture-accept --reindex` 기본값을 하이브리드(FTS+벡터)로 전환
  (`--embeddings` opt-in → `--no-embeddings` opt-out, `--embeddings`는 하위호환 no-op로 유지).
  실제로 A2/A3 프로젝트에서 자연어 질의("이 코드는 왜 이렇게 짜여있나")가 이제 hit되는 것을
  재검증함.
- `ask`가 0건일 때 인덱스에 있는 페이지 목록을 제안으로 보여주도록 변경(`SearchIndex.listWikiPages()`
  신규). 도메인 어휘를 모르는 인수인계자가 다음 질의의 실마리를 얻을 수 있음.
- 회귀 테스트 7건 추가(`cfgm-ask.test.ts`, `cfgm-capture.test.ts`, 신규 `cfgm-rebuild-index.test.ts`).
  `bun test` 1160/1160.

## 검증된 결론

- **검색 인덱스 프로젝트 격리**: 수정 전 버그가 실제로 고쳐졌고, 단일 프로젝트뿐 아니라
  세 프로젝트가 번갈아/동시에 존재하는 상황에서도 유지된다.
- **memory-brain의 실제 가치는 상황 의존적**이다. 세션 기록 문서가 이미 상세하면(A2처럼)
  메모리는 "포인터" 이상의 정보를 주지 못한다. `cfgm stats`의 사용 로그가 오히려 코드/파일에
  없는 유일한 신호(전임자의 관심사 이력)를 줬다는 점은 흥미로운 발견 — wiki 콘텐츠가 아니라
  사용 패턴 자체가 부가가치의 원천이 될 수 있음을 시사한다.
- `cfgm ask`/`cfgm search`가 **도메인 어휘를 알아야 유효한 질의가 된다**는 것은 블라인드
  인수인계 상황에서 구조적 약점이다 — 다음에 개선을 고려한다면 이 지점(자연어 질의 → 코드베이스
  탐색과 결합해 어휘를 먼저 추출하는 2단계 검색, 또는 `ask`의 no-hit 시 관련 태그/유사 개념
  제안)이 후보다. 이번 라운드에서는 수정하지 않았다 — 검증된 사실로만 남긴다.

## 그 외 미해결 항목 (이월, 우선순위 낮음)

- **검색 정확도 격차(93.2% vs agentmemory 95.2%)** — 원인 가설 없음.
- **변리사 상담** — 여러 세션째 방치, 코드 작업 아닌데 계속 밀림. 시간 압박 가장 큼.
- **README.en.md 데모 예시** — 옛날 "Honcho self-host" 예시로 남아있음. 한국어판은 이미 교체됨.
- ~~push 여부~~ — `93a6f2c`, `a803f96`, `ea99ef4` 전부 push 완료(2026-07-29).
- ~~`cfgm ask` 도메인 어휘 의존 문제~~ — 2026-07-29 커밋 `ea99ef4`로 수정 완료.
- **Show HN 런치** — 로드맵 4단계 중 유일하게 미착수.
- `memory/_pending/replay/app-store-screenshots.run-plan.md` — 무관한 미추적 파일, 손대지 말 것.
