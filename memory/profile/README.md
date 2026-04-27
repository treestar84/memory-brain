# memory/profile/

L6 Persona Layer — PAI 9-file × PersonaStore 통합 (PR-V3.8).

## 두 layer 구분

| layer | 위치 | 종류 | 운영 |
|---|---|---|---|
| **PAI 9-file** | `identity/{telos,persona,user,tools,voice,beliefs,models,strategies,ideas}.md` | 정적 정체성 진술 (영구 source-of-truth, ADR-013) | 사용자 또는 cfgm-identity-bootstrap 으로 명시 작성 |
| **PersonaStore representations** | `.memory-brain/memory/profile/representations.jsonl` | 동적 inferred 모델 (사용자 발화 누적 + 명시 upsert) | `cfgm-persona-set representation` 또는 cfgm-process 의미 합성 |

비전 §3.3 "explicit fact / inferred profile / canonical knowledge 분리" 답습.

## view 매핑

| PAI 9-file | PersonaStore representation 매핑 (개념) |
|---|---|
| `telos.md` | (representation 없음 — 사용자 본질 목적, 영구 정적) |
| `persona.md` | `peer:user` representation 일부 — agent 입장에서 본 user 모델 |
| `user.md` | `peer:user` representation — explicit 선언 + inferred 모델 cross-link |
| `tools.md` | (representation 없음 — 도구 목록, 정적) |
| `voice.md` | `peer:user` representation 의 communication style 부분 |
| `beliefs.md` | (representation 없음 — 사용자 신념, 영구) |
| `models.md` | (representation 없음 — 사용자 멘탈 모델, 영구) |
| `strategies.md` | `peer:user` representation 의 work pattern 부분 |
| `ideas.md` | (representation 없음 — 아이디어 누적, 별도) |

→ `peer:user` 의 representation 1건이 user.md / voice.md / strategies.md 의 inferred 영역에 매핑. 9-file 의 정적 영역은 representation 영향 받지 않음. **explicit (9-file) ↔ inferred (representation) 분리 정신 보존**.

## session-start digest 통합

PR-V3.8 부터 session-start hook 의 stdout context 에 두 섹션 표시:

```
### 🪞 identity
- **Telos**: ...   (9-file 첫 의미 문단)
- **Persona**: ...
- **User**: ...
...

### 🧬 persona representations
- **user-1** (user): ... (PersonaStore representation)
- **agent** (agent): ...
```

두 섹션은 **별개**. identity 는 9-file (정적), representations 는 PersonaStore (동적). 의미 충돌 시 9-file 우선 (`memory/ROUTER.md` § 충돌 우선순위).

## CLI

```bash
# peer 등록
bun run bin/cfgm-persona-set.ts peer user-1 --kind user
bun run bin/cfgm-persona-set.ts peer agent --kind agent

# representation upsert (수동)
bun run bin/cfgm-persona-set.ts representation user-1 \
  --text "선호: 짧고 명확한 설명, 오버엔지 회피, OSS 통째 도입" \
  --evidence "session:2026-04-27,session:2026-04-28" \
  --by claude

# 조회
bun run bin/cfgm-persona-list.ts
bun run bin/cfgm-persona-list.ts --json
```

## 운영 규칙 (vision §3.3 답습)

1. **inferred 와 explicit 분리** — representation 은 9-file 을 직접 수정하지 않음.
2. **confidence 표기 의무** — representation 작성 시 evidence pointer 1건 이상 권장.
3. **사용자 반박 시 즉시 수정** — `cfgm-persona-set representation` 으로 새 버전 upsert. 이전 버전은 ledger 에 보존 (audit trail).
4. **9-file 우선** — 충돌 시 9-file 정적 진술이 우선. representation 은 보조.
5. **자동 LLM 호출 미도입** — 1차는 수동 upsert. 자동 합성은 후속 ADR.

## 후속 PR

- representation confidence 필드 (현재는 evidence 개수로 간접 표기)
- 자동 합성 (cfgm-process 시점에 representation 후보 생성)
- governance 통합 — stale representation / 9-file 충돌 detector

## 참고

- ADR-021 (`docs/adr/021-honcho-pattern-only.md`) — Honcho server 회수 + PersonaStore 결정
- `src/core/persona/PersonaStore.ts` — 구현
- `src/hooks/session-start.ts` § buildPersonaRepresentationDigest — digest 통합
- 비전 §3.3 / §5.5 / §7
