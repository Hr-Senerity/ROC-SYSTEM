#!/bin/bash

# ROC-SYSTEM 前端本地部署脚本（模块化：从 scripts/config 读取配置）
# 说明：本地部署 = 构建前端静态文件并发布到宿主机目录（供“宿主机 Nginx”直接 root）
#
# 使用方法: ./scripts/deploy-frontend.sh [选项]
# 选项:
#   -b, --build     构建前端
#   -p, --publish   发布构建产物到宿主机目录
#   -a, --all       build + publish
#   -h, --help      显示帮助信息

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
load_env

load_frontend_local_cfg() {
  SRC_DIR="${FRONTEND_SOURCE_DIR:-roc-frontend}"
  BUILD_DIR="${FRONTEND_BUILD_DIR:-roc-frontend/build}"
  PUBLISH_DIR="${FRONTEND_LOCAL_PUBLISH_DIR:-/var/www/roc-frontend}"
}

build_frontend() {
  load_frontend_local_cfg
  require_cmd npm

  log_info "开始构建前端（本地）..."
  (cd "${REPO_ROOT}/${SRC_DIR}" && npm install && npm run build)
  log_info "构建完成: ${REPO_ROOT}/${BUILD_DIR}"
}

publish_frontend() {
  load_frontend_local_cfg

  if [[ ! -d "${REPO_ROOT}/${BUILD_DIR}" ]]; then
    log_error "未找到构建产物目录：${REPO_ROOT}/${BUILD_DIR}"
    log_info  "请先执行：$0 --build"
    exit 1
  fi

  log_info "发布前端到: ${PUBLISH_DIR}"
  if [[ "${USE_SUDO:-false}" == "true" ]]; then
    sudo mkdir -p "${PUBLISH_DIR}"
    sudo rsync -a --delete "${REPO_ROOT}/${BUILD_DIR}/" "${PUBLISH_DIR}/"
  else
    mkdir -p "${PUBLISH_DIR}"
    rsync -a --delete "${REPO_ROOT}/${BUILD_DIR}/" "${PUBLISH_DIR}/"
  fi
  log_info "发布完成（宿主机 Nginx 可直接 root 该目录）"
}

show_help() {
  echo "ROC-SYSTEM 前端本地部署脚本"
  echo ""
  echo "配置文件:"
  echo "  scripts/config/deploy.env (+ 可选 scripts/config/secrets.env)"
  echo ""
  echo "使用方法:"
  echo "  $0 [选项]"
  echo ""
  echo "选项:"
  echo "  -b, --build     构建前端"
  echo "  -p, --publish   发布到 FRONTEND_LOCAL_PUBLISH_DIR"
  echo "  -a, --all       build + publish"
  echo "  -h, --help      显示帮助信息"
}

main() {
  case "${1:-}" in
    -b|--build) build_frontend ;;
    -p|--publish) publish_frontend ;;
    -a|--all)
      build_frontend
      publish_frontend
      ;;
    -h|--help|"") show_help ;;
    *)
      log_error "未知选项: $1"
      show_help
      exit 1
      ;;
  esac
}

main "$@"
