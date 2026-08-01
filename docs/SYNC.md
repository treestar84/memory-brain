# 여러 머신 간 동기화 — 서버 없이

memory-brain 은 상시 서버를 두지 않는다는 원칙(`docs/RULES.md` 원칙 1·3)을 지킨다.
그래서 "여러 머신에서 같은 기억을 쓰고 싶다"는 요구도 서버를 새로 띄우지 않고,
`memory/` 가 이미 markdown/JSONL 텍스트라는 사실 하나로 해결한다: **git 으로
동기화**하면 된다. 별도 계정도, 우리가 관리하는 토큰도, 상주 프로세스도 없다.

## 3계층 — 무엇이 동기화 대상인가

| 계층 | 경로 | 성격 | 동기화 |
|---|---|---|---|
| append-only 원장 | `memory/claims/ledger.jsonl` 등 `memory/**/*.jsonl` | last-wins reduce, 교환법칙 성립 | **자동 병합** (`.gitattributes` `merge=union`) |
| upsert 문서 | `memory/{projects,concepts,decisions}/*.md`, `current.md` | 진짜 충돌 가능 — 자동 병합하면 지식이 깨짐 | **일반 git 병합** (충돌 시 직접 해결) |
| 파생물 | `.memory-brain/indexes/*.sqlite*`, `.memory-brain/state/` | 재생성 가능, 동기화 자체가 무의미·유해(바이너리 충돌) | **동기화 금지** (`.gitignore`) |

## 설정

`cfgm install-project` 실행 시 프로젝트 루트에 `.gitattributes` 를 자동 생성/병합한다
(마커: `cfgm-os:merge=union for jsonl ledgers`, 기존 내용은 보존):

```
memory/**/*.jsonl merge=union
```

이게 왜 필요한가: 이 줄이 없으면 일반 3-way merge 가 동시 append 된 두 줄 사이에
`<<<<<<<` 충돌 마커를 끼워 넣는데, `parseJsonlLenient()` 는 그 줄을 "손상된 줄"로
간주해 **에러 없이 건너뛴다** — claim 이 조용히 사라진다. `merge=union` 은 양쪽 줄을
모두 보존해 이 문제 자체를 없앤다.

`ClaimStore.list()` 는 각 레코드의 `recordedAt`(append 시점, `createdAt` 과 다름 —
후자는 후보 최초 생성 시점으로 리비전 간 불변) 으로 승자를 가리므로, union 병합으로
파일상 줄 순서가 뒤섞여도 실제로 더 나중에 append 된 레코드가 항상 이긴다.

## 사용법 — 순수 git, 별도 CLI 없음

```bash
# 머신 A
git add memory/ && git commit -m "session notes" && git push

# 머신 B
git pull
cfgm rebuild-index --embeddings   # 인덱스는 파생물이라 동기화 안 됨 — pull 후 재생성 필수
```

**`cfgm sync` 같은 별도 명령을 의도적으로 만들지 않았다.** git 자체를 감싸는 래퍼는
rebase 중단·detached HEAD·submodule 같은 git 의 엣지케이스를 전부 재현해야 하고,
결국 "얇은 래퍼"가 아니게 된다. 위 두 gitattributes/reduce 수정만으로 일반 `git
pull`/`git push` 가 이미 안전하게 동작하므로, 그 위에 우리 코드를 얹지 않는다.

## `cfgm doctor` 가 잡아주는 것

- **git 충돌 마커** — `.gitattributes` 를 아직 안 켰거나 병합 전에 수동 편집
  실수가 있었다면, `memory/**/*.jsonl` 에 남은 `<<<<<<< / ======= / >>>>>>>` 를
  스캔해 알려준다. 발견 시 해당 줄을 직접 정리해야 한다 — 자동 복구는 하지 않는다
  (원장 내용을 추측으로 고치는 것 자체가 위험).
- **벡터 인덱스 차원 불일치** — 파생물이라 동기화 대상이 아니지만, pull 직후
  `cfgm rebuild-index` 를 잊었을 때의 증상(검색 결과 이상)과는 별개로, dims 설정을
  바꾼 채 재구축을 안 했을 때도 잡아준다.

## 알려진 한계

- **`.md` 문서 충돌은 자동 해결하지 않는다.** 같은 concept 페이지를 두 머신에서
  동시에 고치면 일반 git 충돌이 나고, 직접 해결해야 한다 — 이건 의도된 설계다
  (지식 문서를 자동 병합하면 내용이 깨질 수 있어, 중복 감수가 유실보다 낫다).
- **private 저장소 사용을 강력히 권장한다.** `memory/` 에는 개인 대화 맥락이
  포함될 수 있고, `Redactor` 는 capture 승격 시점에만 동작하므로 원문(`memory/sources/`)
  자체엔 민감정보가 그대로 남을 수 있다. public remote 에 push 하기 전 반드시 확인할 것.
