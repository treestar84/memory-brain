# ADR-007: Transcript 데이터 소스 도입 보류 (PAI extractor 이식 Phase 2 이월)

**날짜**: 2026-04-24
**상태**: 채택됨
**관련 에픽**: PAI 통합 Phase 1 (PR-2)

---

## 결정

`CanonicalEvent.payload`에 transcript path / assistant prose 필드를 추가하지 않는다. PAI(`Personal_AI_Infrastructure/Releases/v4.0.3`)의 `RelationshipMemory.hook.ts` · `WorkCompletionLearning.hook.ts` 식 transcript 기반 extractor는 Phase 1에서 이식하지 않고 Phase 2 이후로 이월한다. Phase 1은 기존 `ObservationBundle` 데이터만으로 완결한다.

## 배경

PAI 추출기는 세션 종료 시 `transcript_path`를 받아 TranscriptParser로 prose를 읽고 정규식 5종(preference/frustration/positive/learning/milestone)을 돌려 W/B/O 노트를 생성한다. 이를 memory-brain에 이식하려면 다음이 필요하다:

- `CanonicalEvent.payload`에 `transcriptPath?: string` 또는 `lastAssistantMessage?: string` 추가
- `src/adapters/claude-code/mapper.ts`에서 Claude Code stdin → CanonicalEvent 매핑 확장
- `fixtures/claude-code/v1/*.json` 신규 필드 반영
- 추출기 훅 2개 신규(관계 노트/작업 학습)
- extractor가 만들어낸 결과를 어디로 흘릴지 결정(블록 합성 큐? 별도 sidecar?)

한편 현재 `ObservationBundle.observations`는 정규화된 요약형 필드(`userIntentRaw`, `filesTouched`, `command`, `outputSnippet`)만 담는다. PAI extractor가 참조하는 "assistant의 완전 응답 텍스트"는 bundle에 없다.

## 결과

### 선택 근거

- A안(transcript 도입) 자체의 구현 범위는 installer-wide가 아니라 `CanonicalEvent` + adapter mapper + fixtures로 국한된다(코덱스 검증: `install-brain.ts:527`가 stdin schema를 소유하지 않음).
- 그러나 A안을 지금 넣더라도 **Phase 1 범위 안에 소비자가 없다**. PR-1(config) · PR-3(question-policy)은 transcript에 의존하지 않고, PR-4(dedup)는 Phase 2로 이월되었다.
- bundle-only 상태로는 PAI extractor급 prose 추출이 불가하며, 강행 시 extractor가 허위 매칭(빈약한 snippet만 보고 W/B/O를 만들어냄)을 낼 위험이 크다.
- 따라서 Phase 1은 transcript 미도입으로 확정하고, extractor 이식은 소비자 설계(Bundle→Identity 승격 · LLM 기반 합성 등)가 구체화된 Phase 2 이후에 재진입한다.

### Phase 1 영향

- `CanonicalEvent`/`mapper.ts`/`hook-runner.ts`/fixtures **불변**.
- PAI extractor 이식 작업 없음. 관계 노트/작업 학습 파일도 생성하지 않음.
- `docs/pai-gap-report.md` v2의 "이식 가치 잔류 항목 중 transcript-backed extractor" 열은 Phase 2 태깅으로 이동.

### Phase 2 재진입 조건

아래 조건 중 **2개 이상**이 충족될 때 ADR-007 재방문:

1. Bundle→Identity 블록 승격 설계가 확정되어 extractor 결과의 소비자가 명확해진다.
2. LLM 기반 blanket 합성(예: bundle → Claim/Evidence 자동 생성) 파이프라인이 설계·승인된다.
3. 사용자가 세션 단위 관계 노트/작업 학습 파일(PAI-호환 마크다운 뷰 등)을 명시적으로 요구한다.
4. Phase 2 dedup(`contentHash` + entity alias) 설계가 끝나 extractor 출력의 중복 저장 리스크가 통제된다.

재진입 시 세부 설계는 별도 ADR로 분리(`ADR-0xx-transcript-source-introduction`).

## 대안

### A안: Phase 1에서 `transcriptPath` 도입 + PAI extractor 2개 이식

- 장점: PAI 호환도↑, Phase 2 재진입 비용 분산.
- 단점: 소비자 부재로 결과 저장 경로가 공중에 뜸. extractor 출력의 중복 저장/정합성 문제를 dedup(Phase 2) 없이 수용해야 함. `ObservationNormalizer`·`ObservationBundler`·`SessionEnd` 훅 계약이 전부 흔들림.
- 거부 사유: 회귀 리스크 대비 Phase 1 내 가치 미약.

### C안: bundle에 prose 보강(`ObservationBundler`가 assistant snippet을 더 길게 저장)

- 장점: transcript 미도입 유지, bundle만으로 제한된 prose 확보.
- 단점: bundle이 비대해져 snapshot/rewrite 경합 증가. 부분 prose로는 PAI extractor가 여전히 품질 낮은 결과를 생성. 결국 Phase 2에서 transcript로 갈 확률이 높아 중복 투자.
- 거부 사유: bundle 계약 변경은 Phase 2 설계 공간을 오히려 좁힘.

## 참고

- `docs/pai-gap-report.md` §7(v1 제거 항목), §4(PR-2), §5(OSS 후보)
- `docs/_codex_plan_check.md` Q4 합의안
- `src/core/events/CanonicalEvent.ts:17-26`
- `src/core/flow/ObservationBundler.ts:52`
- `src/core/normalizer/ObservationNormalizer.ts:21`
- PAI 원본: `~/dev/Personal_AI_Infrastructure/Releases/v4.0.3/.claude/hooks/RelationshipMemory.hook.ts:36`, `WorkCompletionLearning.hook.ts:257`
