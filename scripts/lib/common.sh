#!/bin/bash
set -euo pipefail

# 通用工具库：统一加载配置、日志、校验等

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SCRIPTS_DIR}/.." && pwd)"

CONFIG_DIR="${SCRIPTS_DIR}/config"
DEFAULT_ENV_FILE="${CONFIG_DIR}/deploy.env"
DEFAULT_SECRETS_FILE="${CONFIG_DIR}/secrets.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || { log_error "缺少命令：$cmd"; exit 1; }
}

require_vars() {
  local missing=0
  for v in "$@"; do
    if [[ -z "${!v:-}" ]]; then
      log_error "缺少必填配置：$v"
      missing=1
    fi
  done
  [[ $missing -eq 0 ]] || exit 1
}

load_env() {
  # 允许外部覆盖 env 文件位置（便于多环境）
  local env_file="${DEPLOY_ENV_FILE:-$DEFAULT_ENV_FILE}"
  local secrets_file="${DEPLOY_SECRETS_FILE:-$DEFAULT_SECRETS_FILE}"

  if [[ ! -f "$env_file" ]]; then
    log_error "未找到配置文件：$env_file"
    log_info  "请先复制：scripts/config/deploy.env.example -> scripts/config/deploy.env"
    exit 1
  fi

  # shellcheck disable=SC1090
  source "$env_file"

  if [[ -f "$secrets_file" ]]; then
    # shellcheck disable=SC1090
    source "$secrets_file"
  else
    log_warn "未找到 secrets 配置：$secrets_file（可忽略，或复制 scripts/config/secrets.env.example）"
  fi
}

docker_must_exist() {
  require_cmd docker
  docker info >/dev/null 2>&1 || { log_error "Docker 不可用（daemon 未启动或权限不足）"; exit 1; }
}

