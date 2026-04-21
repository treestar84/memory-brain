#!/usr/bin/env bash
# memory-brain uninstaller
# 사용법:
#   ./uninstall.sh            # 훅/런처/manifest 제거 (memory-brain 데이터 보존)
#   ./uninstall.sh --purge    # ~/.claude-brain 전체 삭제 (확인 프롬프트)
#   ./uninstall.sh --purge -y # 확인 없이 전체 삭제
#   ./uninstall.sh --help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_HOME="${CFGM_BRAIN_HOME:-$HOME/.claude-brain}"
PURGE=0
YES=0

for arg in "$@"; do
  case "$arg" in
    --purge) PURGE=1 ;;
    -y|--yes) YES=1 ;;
    -h|--help)
      cat <<EOF
memory-brain uninstaller

  ./uninstall.sh             soft uninstall
                             — 훅·런처·manifest·skills 심링크만 제거
                             — identity/memory-brain 데이터는 보존
  ./uninstall.sh --purge     full wipe
                             — ~/.claude-brain 전체 삭제 (확인 프롬프트)
  ./uninstall.sh --purge -y  확인 없이 전체 삭제

환경 변수:
  CFGM_BRAIN_HOME  제거 대상 루트 (기본 ~/.claude-brain)
EOF
      exit 0 ;;
    *) echo "알 수 없는 옵션: $arg"; exit 2 ;;
  esac
done

if [[ "${NO_COLOR:-}" = "" && -t 1 ]]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_OFF=""
fi

log()  { printf "${C_DIM}[uninstall]${C_OFF} %s\n" "$*"; }
ok()   { printf "${C_OK}[ok]${C_OFF} %s\n" "$*"; }
warn() { printf "${C_WARN}[warn]${C_OFF} %s\n" "$*"; }
err()  { printf "${C_ERR}[err]${C_OFF} %s\n" "$*" >&2; }

if ! command -v bun >/dev/null 2>&1; then
  err "bun이 설치되어 있지 않습니다."
  exit 1
fi

cd "$SCRIPT_DIR"

if [[ ! -f bin/uninstall-brain.ts ]]; then
  err "bin/uninstall-brain.ts를 찾을 수 없습니다. 레포 루트에서 실행하세요."
  exit 1
fi

if [[ ! -d "$BRAIN_HOME" ]]; then
  warn "$BRAIN_HOME이 없습니다. 제거할 것이 없을 수 있습니다."
fi

if [[ $PURGE -eq 1 ]]; then
  warn "전체 삭제 대상: $BRAIN_HOME"
  warn "— identity (telos/persona/user/tools/voice), memory-brain ledger·flow-graph 포함"
  if [[ $YES -ne 1 ]]; then
    read -r -p "정말 삭제하시겠습니까? [y/N]: " REPLY
    case "$REPLY" in
      y|Y|yes|YES) ;;
      *) log "취소됨."; exit 0 ;;
    esac
  fi
  BACKUP="$BRAIN_HOME.bak-$(date +%Y%m%d-%H%M%S)"
  if [[ -d "$BRAIN_HOME" ]]; then
    cp -a "$BRAIN_HOME" "$BACKUP"
    ok "backup → $BACKUP (혹시 모를 복구용)"
  fi
  log "bun run bin/uninstall-brain.ts --purge 실행 중…"
  bun run bin/uninstall-brain.ts --purge
  ok "전체 제거 완료."
  log "복구가 필요하면: mv \"$BACKUP\" \"$BRAIN_HOME\""
  exit 0
fi

log "bun run bin/uninstall-brain.ts 실행 중…"
bun run bin/uninstall-brain.ts

echo
ok "제거 완료. 보존된 데이터:"
[[ -d "$BRAIN_HOME/memory-brain" ]] && echo "    $BRAIN_HOME/memory-brain"
[[ -d "$BRAIN_HOME/memory-brain/identity" ]] && echo "    $BRAIN_HOME/memory-brain/identity (telos/persona/user/tools/voice)"
echo
log "완전히 지우려면: ./uninstall.sh --purge"
