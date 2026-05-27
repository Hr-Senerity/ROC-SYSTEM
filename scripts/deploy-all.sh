#!/usr/bin/env bash
# ROC-SYSTEM 整体本地/混合部署编排
# 按顺序: PostgreSQL → Backend → Frontend

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(dirname "$SCRIPT_DIR")"

# shellcheck source=lib/common.sh
source "${SCRIPTS_DIR}/lib/common.sh"

usage() {
  cat <<EOF
用法: $0 [选项]

整体部署编排。各服务模式由 deploy.env 的 *_MODE 变量控制。

选项:
  --all        部署所有服务（postgres → backend → frontend）
  --status     检查所有服务状态
  --help       显示帮助
EOF
  exit 0
}

deploy_postgres() {
  if [[ "${DB_MODE:-docker}" == "docker" ]]; then
    "${SCRIPTS_DIR}/deploy-postgres-docker.sh" --all
  else
    "${SCRIPTS_DIR}/deploy-postgres.sh" --start
  fi
}

deploy_backend() {
  if [[ "${BACKEND_MODE:-docker}" == "docker" ]]; then
    "${SCRIPTS_DIR}/deploy-backend-docker.sh" --all
  else
    log_warn "后端本地部署尚未落地，跳过"
  fi
}

deploy_frontend() {
  if [[ "${FRONTEND_MODE:-docker}" == "docker" ]]; then
    "${SCRIPTS_DIR}/deploy-frontend-docker.sh" --all
  else
    "${SCRIPTS_DIR}/deploy-frontend.sh" --all
  fi
}

do_all() {
  log_info "====== ROC-SYSTEM 整体部署 ======"
  log_info "模式: 前端=${FRONTEND_MODE:-docker} 后端=${BACKEND_MODE:-docker} 数据库=${DB_MODE:-docker}"

  deploy_postgres
  sleep 3
  deploy_backend
  sleep 2
  deploy_frontend

  log_info "====== 部署完成 ====="
  log_info "建议: bash scripts/deploy-gateway.sh --all"
}

do_status() {
  docker ps --filter "name=roc-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
}

load_env "${SCRIPTS_DIR}/config/deploy.env"
load_env "${SCRIPTS_DIR}/config/secrets.env" 2>/dev/null || true

case "${1:-}" in
  --all)    do_all ;;
  --status) do_status ;;
  --help)   usage ;;
  *)        usage ;;
esac
