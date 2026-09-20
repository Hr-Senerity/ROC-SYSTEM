#!/usr/bin/env bash
# ROC-SYSTEM 整体 Docker 部署
# 使用 docker/compose/docker-compose.yml 编排所有服务

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$SCRIPTS_DIR")"

# shellcheck source=lib/common.sh
source "${SCRIPTS_DIR}/lib/common.sh"

COMPOSE_DIR="${REPO_ROOT}/docker/compose"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.yml"
ENV_FILE="${COMPOSE_DIR}/.env"

usage() {
  cat <<EOF
用法: $0 [选项]

整体 Docker 部署（启动所有服务: postgres + backend + frontend）

选项:
  --up          构建并启动所有服务（默认）
  --down        停止并移除所有服务
  --build       仅重新构建镜像
  --restart     重启所有服务
  --logs        查看所有服务日志
  --status      查看服务状态
  --help        显示帮助
EOF
  exit 0
}

check_prereqs() {
  require_cmd docker
  docker_must_exist
  docker_compose_must_exist

  if [[ ! -f "$COMPOSE_FILE" ]]; then
    log_error "未找到 compose 文件: $COMPOSE_FILE"
    exit 1
  fi

  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "${COMPOSE_DIR}/.env.example" ]]; then
      log_warn ".env 文件不存在，从 .env.example 复制"
      cp "${COMPOSE_DIR}/.env.example" "$ENV_FILE"
      log_warn "请编辑 ${ENV_FILE} 中的配置后重新运行"
      exit 1
    fi
  fi
}

do_up() {
  log_info "构建并启动所有服务..."
  cd "$COMPOSE_DIR"
  docker_compose -f "$COMPOSE_FILE" up -d --build
  log_info "所有服务已启动"
  echo ""
  log_info "访问: 前端 http://localhost:3000  后端 http://localhost:8080"
}

do_down() {
  log_info "停止并移除所有服务..."
  cd "$COMPOSE_DIR"
  docker_compose -f "$COMPOSE_FILE" down
}

do_build() {
  log_info "重新构建镜像..."
  cd "$COMPOSE_DIR"
  docker_compose -f "$COMPOSE_FILE" build --no-cache
}

do_restart() {
  cd "$COMPOSE_DIR"
  docker_compose -f "$COMPOSE_FILE" restart
}

do_logs() {
  cd "$COMPOSE_DIR"
  docker_compose -f "$COMPOSE_FILE" logs -f --tail=100
}

do_status() {
  cd "$COMPOSE_DIR"
  docker_compose -f "$COMPOSE_FILE" ps
}

if [[ $# -eq 0 ]]; then
  check_prereqs
  do_up
  exit 0
fi

case "${1:-}" in
  --up)       check_prereqs; do_up ;;
  --down)     check_prereqs; do_down ;;
  --build)    check_prereqs; do_build ;;
  --restart)  check_prereqs; do_restart ;;
  --logs)     do_logs ;;
  --status)   do_status ;;
  --help)     usage ;;
  *)          usage ;;
esac
