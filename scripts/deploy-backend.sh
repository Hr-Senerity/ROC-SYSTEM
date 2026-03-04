#!/bin/bash

# ROC-SYSTEM 后端本地部署脚本（模块化：从 scripts/config 读取配置）
# 说明：本地部署 = 在宿主机编译/安装后端，并用 systemd 管理（start/stop/status）
#
# 注意：当前项目后端代码尚未实现构建入口（例如 CMakeLists.txt / 可执行文件名）。
# 本脚本先提供“框架与约定”，后续后端落地后再补齐编译与服务文件细节。
#
# 使用方法: ./scripts/deploy-backend.sh [选项]
# 选项:
#   --status     查看服务状态
#   --start      启动服务
#   --stop       停止服务
#   --restart    重启服务
#   -h, --help   显示帮助信息

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
load_env

SERVICE_NAME="roc-backend"

show_help() {
  echo "ROC-SYSTEM 后端本地部署脚本（占位框架）"
  echo ""
  echo "配置文件:"
  echo "  scripts/config/deploy.env (+ 可选 scripts/config/secrets.env)"
  echo ""
  echo "说明:"
  echo "  当前后端尚未实现可执行程序与 systemd service 文件生成逻辑。"
  echo "  你可以先用 Docker 部署后端（deploy-backend-docker.sh）。"
  echo ""
  echo "选项:"
  echo "  --status     查看服务状态"
  echo "  --start      启动服务"
  echo "  --stop       停止服务"
  echo "  --restart    重启服务"
  echo "  -h, --help   显示帮助信息"
}

main() {
  case "${1:-}" in
    --status)
      systemctl status "${SERVICE_NAME}" --no-pager || true
      ;;
    --start)
      log_error "后端本地部署尚未落地：缺少 systemd service 文件与可执行程序。"
      exit 1
      ;;
    --stop)
      systemctl stop "${SERVICE_NAME}" || true
      ;;
    --restart)
      log_error "后端本地部署尚未落地：缺少 systemd service 文件与可执行程序。"
      exit 1
      ;;
    -h|--help|"")
      show_help
      ;;
    *)
      log_error "未知选项: $1"
      show_help
      exit 1
      ;;
  esac
}

main "$@"
