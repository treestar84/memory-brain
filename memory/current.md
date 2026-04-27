# memory/current.md — 현재 작업 컨텍스트 표면

> 비전 §4 답습. 본 파일은 **현재 진행 중인 작업의 1쪽 요약**.
> 사용자 또는 Claude 본체가 session-start / session-end 시점에 갱신.
> 너무 길어지면 `memory/projects/{slug}.md` 또는 `memory/journal/`로 이관.

## 형식

```markdown
## 최근 진행 (2026-04-27)

- vision evolution Phase A1.0 (claim sidecar) 머지 → ADR-012/PR-A1.0
- ADR-018 phase 게이트 메타 채택
- plan v3 전환: ADR-019(OSS 도입) → ADR-021(Honcho self-host 회수)
- PR-V3.0/V3.1 머지: 라이선스 MIT + 자체 PersonaStore (markdown+jsonl)

## 현재 작업

- PR-V3.2: memory/ 디렉토리 트리 + bootloader 재작성 (vision §14.1) — 진행 중

## 다음 단계

- PR-V3.3: ROUTER 1차 (RequestClassifier + LaneSelector 코드 구현)
- PR-V3.4: Wiki Layer (sources/projects/concepts/decisions, OpenClaw 포맷)

## 미해결 질문

(없음 — 사용자 합의 단계 모두 통과)

## 관련 ADR / commits

- 최근: ADR-021 (3c7027e), ADR-018 (64597ff)
- plan: .omc/plans/vision-evolution-claim-grounded-os.md (v2 superseded)
- 비전: memory_system_improvement_prompt.md
```

## 운영 규칙

- **갱신 주기**: 의미 있는 진행 1건 이상 발생 시 1줄 추가 또는 섹션 갱신.
- **크기 상한**: ~ 100줄. 초과 시 `memory/journal/YYYY-MM-DD.md`로 일부 이관.
- **자동 갱신**: 후속 PR-V3.3 ROUTER + cfgm-process 통합 시 Claude 본체가 session-end 직후 자동 후보 생성. 사용자 검토 후 commit.
- **본 1차**: 사용자/Claude 명시 갱신만. 자동 갱신 아직 없음.

## 현재 상태 (placeholder)

- vision evolution Phase A1·A1.1 진행 중 (plan v3, 2026-04-27)
- 본 파일은 PR-V3.2 머지 직후 상태
- 다음 갱신은 PR-V3.3 시작 시점
