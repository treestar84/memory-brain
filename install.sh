#!/usr/bin/env bash
# memory-brain installer
# 사용법:
#   ./install.sh              # 기본 설치 (기존 ~/.claude-brain 자동 백업)
#   ./install.sh --no-backup  # 백업 건너뛰기
#   ./install.sh --help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_HOME="${CFGM_BRAIN_HOME:-$HOME/.claude-brain}"
DO_BACKUP=1

for arg in "$@"; do
  case "$arg" in
    --no-backup) DO_BACKUP=0 ;;
    -h|--help)
      cat <<EOF
memory-brain installer

  ./install.sh              기존 ~/.claude-brain이 있으면 자동으로 백업 후 설치
  ./install.sh --no-backup  백업 없이 덮어쓰기
  ./install.sh --help       이 도움말

환경 변수:
  CFGM_BRAIN_HOME   설치 루트 (기본 ~/.claude-brain)
  CFGM_PROJECT      프로젝트 루트 (기본 현재 디렉토리)
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

log()  { printf "${C_DIM}[install]${C_OFF} %s\n" "$*"; }
ok()   { printf "${C_OK}[ok]${C_OFF} %s\n" "$*"; }
warn() { printf "${C_WARN}[warn]${C_OFF} %s\n" "$*"; }
err()  { printf "${C_ERR}[err]${C_OFF} %s\n" "$*" >&2; }

if ! command -v bun >/dev/null 2>&1; then
  err "bun이 설치되어 있지 않습니다."
  echo "    설치: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

cd "$SCRIPT_DIR"

if [[ ! -f bin/install-brain.ts ]]; then
  err "bin/install-brain.ts를 찾을 수 없습니다. 레포 루트에서 실행하세요."
  exit 1
fi

log "bun version: $(bun --version)"
log "repo:        $SCRIPT_DIR"
log "target:      $BRAIN_HOME"

if [[ -d "$BRAIN_HOME" && $DO_BACKUP -eq 1 ]]; then
  BACKUP="$BRAIN_HOME.bak-$(date +%Y%m%d-%H%M%S)"
  cp -a "$BRAIN_HOME" "$BACKUP"
  ok "backup → $BACKUP"
else
  [[ -d "$BRAIN_HOME" ]] && warn "--no-backup: 기존 $BRAIN_HOME을 백업하지 않습니다."
fi

log "bun run bin/install-brain.ts 실행 중…"
if ! bun run bin/install-brain.ts; then
  err "설치 스크립트 실행 실패."
  echo "    재시도 시 중단 지점에서 이어집니다 ($BRAIN_HOME/install-progress.json)."
  exit 1
fi

echo
if [[ -f "$BRAIN_HOME/install-manifest.json" ]]; then
  ok "install-manifest.json 작성 완료"
  if command -v jq >/dev/null 2>&1; then
    jq -r '"    version:  \(.cfgmVersion)\n    hooks:    \(.hooksRegistered | join(\", \"))\n    files:    \(.files | length) tracked"' \
      "$BRAIN_HOME/install-manifest.json"
  fi
else
  warn "install-manifest.json이 생성되지 않았습니다."
fi

if [[ -x "$BRAIN_HOME/bin/claude-pai" ]]; then
  ok "launcher:  $BRAIN_HOME/bin/claude-pai"
else
  warn "launcher가 없거나 실행 권한이 없습니다."
fi

if [[ -L "$HOME/.local/bin/claude-pai" ]]; then
  ok "symlink:   ~/.local/bin/claude-pai"
elif ! echo ":$PATH:" | grep -q ":$HOME/.local/bin:"; then
  warn "\$HOME/.local/bin이 PATH에 없습니다. 아래를 ~/.zshrc 등에 추가하세요:"
  echo "      export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

echo
ok "설치 완료. 새 셸에서 다음과 같이 실행하세요:"
echo "    claude-pai"
