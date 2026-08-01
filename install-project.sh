#!/usr/bin/env bash
# memory-brain project-level installer
# 전역 ~/.claude-brain 프로필 대신, 지정한 프로젝트의 .claude/settings.json 에
# 직접 훅을 등록한다. 그 프로젝트에서 평범한 `claude` 로 바로 동작한다.
#
# 사용법:
#   ./install-project.sh                     # 현재 디렉토리에 설치
#   ./install-project.sh --project <path>    # 다른 프로젝트에 설치
#   ./install-project.sh --dry-run           # 계획만 출력
#   ./install-project.sh --help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 아래에서 $SCRIPT_DIR (툴 저장소)로 cd 하기 전에, 사용자가 실제로 이 스크립트를
# 실행한 디렉토리를 먼저 저장해둔다 — 안 그러면 --project 를 생략했을 때
# "현재 디렉토리"가 사용자 프로젝트가 아니라 이 툴 저장소 자신이 되어버린다
# (--project 없이 실행 시 실제로 재현된 사고: 대상이 이 레포 자신으로 잘못 잡혔었음).
ORIG_CWD="$PWD"

if ! command -v bun >/dev/null 2>&1; then
  echo "[install-project] bun이 설치되어 있지 않습니다." >&2
  echo "    설치: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

if [[ ! -f "$SCRIPT_DIR/bin/install-project.ts" ]]; then
  echo "[install-project] bin/install-project.ts를 찾을 수 없습니다. 레포 루트에서 실행하세요." >&2
  exit 1
fi

PROJECT_ARG=""
REST=()
i=1
while [[ $i -le $# ]]; do
  arg="${!i}"
  case "$arg" in
    --project)
      i=$((i + 1))
      PROJECT_ARG="${!i:-}"
      ;;
    *) REST+=("$arg") ;;
  esac
  i=$((i + 1))
done

# --project 를 생략했으면 사용자의 원래 위치를 기본값으로 쓰고,
# 상대 경로로 줬으면 원래 위치 기준으로 절대경로로 만든다 (cd 이후 해석되면 틀어짐).
if [[ -z "$PROJECT_ARG" ]]; then
  PROJECT_ARG="$ORIG_CWD"
elif [[ "$PROJECT_ARG" != /* ]]; then
  PROJECT_ARG="$ORIG_CWD/$PROJECT_ARG"
fi

cd "$SCRIPT_DIR"
bun run bin/install-project.ts --project "$PROJECT_ARG" "${REST[@]+"${REST[@]}"}"
