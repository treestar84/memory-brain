#!/usr/bin/env bash
# memory-brain project-level uninstaller
# 사용법:
#   ./uninstall-project.sh                     # 도구만 제거, .memory-brain/ 데이터 보존
#   ./uninstall-project.sh --project <path>    # 다른 프로젝트 대상
#   ./uninstall-project.sh --purge             # 데이터까지 완전 삭제 (확인 프롬프트)
#   ./uninstall-project.sh --purge -y          # 확인 없이 완전 삭제
#   ./uninstall-project.sh --dry-run           # 계획만 출력
#   ./uninstall-project.sh --help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# --project 없이 실행했을 때 "현재 디렉토리"가 사용자 프로젝트가 아니라 이 툴 저장소
# 자신이 되어버리는 사고를 막기 위해, $SCRIPT_DIR 로 cd 하기 전에 원래 위치를 저장한다.
ORIG_CWD="$PWD"

if ! command -v bun >/dev/null 2>&1; then
  echo "[uninstall-project] bun이 설치되어 있지 않습니다." >&2
  exit 1
fi

if [[ ! -f "$SCRIPT_DIR/bin/uninstall-project.ts" ]]; then
  echo "[uninstall-project] bin/uninstall-project.ts를 찾을 수 없습니다. 레포 루트에서 실행하세요." >&2
  exit 1
fi

PROJECT_ARG=""
PURGE=0
YES=0
DRY_RUN=0
REST=()

i=1
while [[ $i -le $# ]]; do
  arg="${!i}"
  case "$arg" in
    --project)
      i=$((i + 1))
      PROJECT_ARG="${!i:-}"
      ;;
    --purge) PURGE=1; REST+=("$arg") ;;
    --dry-run) DRY_RUN=1; REST+=("$arg") ;;
    -y|--yes) YES=1 ;;
    -h|--help)
      cat <<EOF
memory-brain project-level uninstaller

  ./uninstall-project.sh                   soft uninstall — 훅·commands·manifest만 제거
                                            .memory-brain/ 데이터는 보존
  ./uninstall-project.sh --project <path>  대상 프로젝트 지정 (기본: 현재 디렉토리)
  ./uninstall-project.sh --purge           full wipe — .memory-brain/ 데이터까지 삭제 (확인 프롬프트)
  ./uninstall-project.sh --purge -y        확인 없이 완전 삭제
  ./uninstall-project.sh --dry-run         계획만 출력, 실제로 지우지 않음
EOF
      exit 0 ;;
    *) REST+=("$arg") ;;
  esac
  i=$((i + 1))
done

if [[ -z "$PROJECT_ARG" ]]; then
  PROJECT_ARG="$ORIG_CWD"
elif [[ "$PROJECT_ARG" != /* ]]; then
  PROJECT_ARG="$ORIG_CWD/$PROJECT_ARG"
fi

cd "$SCRIPT_DIR"

if [[ $PURGE -eq 1 && $YES -ne 1 && $DRY_RUN -ne 1 ]]; then
  echo "[uninstall-project] --purge 는 대상 프로젝트(${PROJECT_ARG})의 .memory-brain/ (캡처된 메모리 데이터)를 완전히 삭제합니다."
  read -r -p "정말 삭제하시겠습니까? [y/N]: " REPLY
  case "$REPLY" in
    y|Y|yes|YES) ;;
    *) echo "[uninstall-project] 취소됨."; exit 0 ;;
  esac
fi

bun run bin/uninstall-project.ts --project "$PROJECT_ARG" "${REST[@]+"${REST[@]}"}"
