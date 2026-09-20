#!/bin/bash

# ROC-SYSTEM 后端 Docker 部署脚本（模块化：从 scripts/config 读取配置）
# 使用方法: ./scripts/deploy-backend-docker.sh [选项]
# 选项:
#   -b, --build    构建 Docker 镜像（需要 docker/backend/Dockerfile 已实现）
#   -r, --run      运行 Docker 容器
#   -s, --stop     停止 Docker 容器
#   -d, --delete   删除 Docker 容器和镜像
#   -a, --all      执行完整流程：构建 -> 停止旧容器 -> 运行新容器
#   -h, --help     显示帮助信息

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
load_env

check_docker() {
  docker_must_exist
  log_info "Docker 检查通过"
}

load_backend_cfg() {
  IMAGE_NAME="${BACKEND_DOCKER_IMAGE:-roc-backend}"
  CONTAINER_NAME="${BACKEND_DOCKER_CONTAINER:-roc-backend}"
  HOST_PORT="${BACKEND_DOCKER_HOST_PORT:-8080}"
  CONTAINER_PORT="${BACKEND_CONTAINER_PORT:-8080}"
  DOCKERFILE_PATH="${BACKEND_DOCKERFILE:-docker/backend/Dockerfile}"
  CONTEXT_PATH="${DOCKER_CONTEXT_PATH:-.}"

  DB_HOST_VAL="${DB_HOST:-127.0.0.1}"
  DB_PORT_VAL="${DB_PORT:-5432}"
  DB_NAME_VAL="${DB_NAME:-roc_db}"
  DB_USER_VAL="${DB_USER:-roc_user}"
  DB_PASSWORD_VAL="${DB_PASSWORD:-}"
  DB_SSLMODE_VAL="${DB_SSLMODE:-disable}"
  DB_SSLROOTCERT_VAL="${DB_SSLROOTCERT:-}"
  DB_SSLCERT_VAL="${DB_SSLCERT:-}"
  DB_SSLKEY_VAL="${DB_SSLKEY:-}"
  DB_SSL_CERT_DIR_VAL="${DB_SSL_CERT_DIR:-}"
  MAP_STORAGE_VOLUME_VAL="${BACKEND_MAP_VOLUME:-roc_static}"
}

validate_db_tls_cfg() {
  case "${DB_SSLMODE_VAL}" in
    disable|require|verify-ca|verify-full) ;;
    *)
      log_error "DB_SSLMODE 无效：${DB_SSLMODE_VAL}（允许 disable/require/verify-ca/verify-full）"
      exit 1
      ;;
  esac

  if [[ "${DB_SSLMODE_VAL}" == "verify-ca" || "${DB_SSLMODE_VAL}" == "verify-full" ]]; then
    if [[ -z "${DB_SSLROOTCERT_VAL}" ]]; then
      log_error "${DB_SSLMODE_VAL} 模式必须配置 DB_SSLROOTCERT"
      exit 1
    fi
  fi
  if [[ -n "${DB_SSLCERT_VAL}" && -z "${DB_SSLKEY_VAL}" ]] || \
     [[ -z "${DB_SSLCERT_VAL}" && -n "${DB_SSLKEY_VAL}" ]]; then
    log_error "DB_SSLCERT 与 DB_SSLKEY 必须成对配置"
    exit 1
  fi

  local configured_path
  for configured_path in "${DB_SSLROOTCERT_VAL}" "${DB_SSLCERT_VAL}" "${DB_SSLKEY_VAL}"; do
    [[ -z "${configured_path}" ]] && continue
    if [[ -z "${DB_SSL_CERT_DIR_VAL}" || ! -d "${DB_SSL_CERT_DIR_VAL}" ]]; then
      log_error "已配置数据库证书，但 DB_SSL_CERT_DIR 不是有效宿主机目录"
      exit 1
    fi
    if [[ "${configured_path}" != /run/secrets/roc-db/* ]]; then
      log_error "容器内数据库证书路径必须位于 /run/secrets/roc-db/"
      exit 1
    fi
    if [[ ! -f "${DB_SSL_CERT_DIR_VAL}/$(basename "${configured_path}")" ]]; then
      log_error "宿主机证书文件不存在：${DB_SSL_CERT_DIR_VAL}/$(basename "${configured_path}")"
      exit 1
    fi
  done
}

build_image() {
  load_backend_cfg
  if [[ ! -f "${REPO_ROOT}/${DOCKERFILE_PATH}" && ! -f "${DOCKERFILE_PATH}" ]]; then
    log_error "未找到后端 Dockerfile：${DOCKERFILE_PATH}"
    log_info  "提示：当前后端还未实现 Docker 构建（需要补 docker/backend/Dockerfile + roc-backend 的构建入口）"
    exit 1
  fi

  log_info "开始构建后端镜像: ${IMAGE_NAME}:latest"
  (cd "${REPO_ROOT}" && docker build -f "${DOCKERFILE_PATH}" -t "${IMAGE_NAME}:latest" "${CONTEXT_PATH}")
  log_info "镜像构建完成: ${IMAGE_NAME}:latest"
}

stop_container() {
  load_backend_cfg
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_info "停止并删除旧容器: ${CONTAINER_NAME}"
    docker stop "${CONTAINER_NAME}" 2>/dev/null || true
    docker rm "${CONTAINER_NAME}" 2>/dev/null || true
    log_info "旧容器已删除"
  else
    log_info "未找到运行中的容器"
  fi
}

run_container() {
  load_backend_cfg
  require_vars DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD
  if [[ -z "${DB_PASSWORD_VAL}" ]]; then
    log_error "DB_PASSWORD 未设置；请在 scripts/config/secrets.env 中配置强随机密码"
    exit 1
  fi
  validate_db_tls_cfg

  # 后端监听（容器内）
  local listen_host="${BACKEND_LISTEN_HOST:-0.0.0.0}"
  local listen_port="${BACKEND_LISTEN_PORT:-$CONTAINER_PORT}"

  # 如果镜像不存在且你没 build，则提示
  if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:latest$"; then
    log_warn "镜像不存在：${IMAGE_NAME}:latest"
    log_warn "你可以先执行：$0 --build"
  fi

  stop_container

  local -a tls_mount_args=()
  if [[ -n "${DB_SSL_CERT_DIR_VAL}" ]]; then
    tls_mount_args=(-v "${DB_SSL_CERT_DIR_VAL}:/run/secrets/roc-db:ro")
  fi

  log_info "启动后端容器: ${CONTAINER_NAME}"
  docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${HOST_PORT}:${CONTAINER_PORT}" \
    -e "BACKEND_LISTEN_HOST=${listen_host}" \
    -e "BACKEND_LISTEN_PORT=${listen_port}" \
    -e "DB_HOST=${DB_HOST_VAL}" \
    -e "DB_PORT=${DB_PORT_VAL}" \
    -e "DB_NAME=${DB_NAME_VAL}" \
    -e "DB_USER=${DB_USER_VAL}" \
    -e "DB_PASSWORD=${DB_PASSWORD_VAL}" \
    -e "DB_SSLMODE=${DB_SSLMODE_VAL}" \
    -e "DB_SSLROOTCERT=${DB_SSLROOTCERT_VAL}" \
    -e "DB_SSLCERT=${DB_SSLCERT_VAL}" \
    -e "DB_SSLKEY=${DB_SSLKEY_VAL}" \
    -e "JWT_SECRET=${JWT_SECRET:-roc-system-default-secret-change-in-production}" \
    -e "JWT_EXPIRE_SECONDS=${JWT_EXPIRE_SECONDS:-86400}" \
    -e "WS_ALLOWED_ORIGINS=${WS_ALLOWED_ORIGINS:-}" \
    -e "DEVICE_HEARTBEAT_SECONDS=${DEVICE_HEARTBEAT_SECONDS:-30}" \
    -e "DEVICE_IDLE_TIMEOUT_SECONDS=${DEVICE_IDLE_TIMEOUT_SECONDS:-45}" \
    -e "TASK_LEASE_SECONDS=${TASK_LEASE_SECONDS:-1800}" \
    -e "MAP_STORAGE_DIR=${MAP_STORAGE_DIR:-/app/static/maps}" \
    -v "${MAP_STORAGE_VOLUME_VAL}:/app/static" \
    "${tls_mount_args[@]}" \
    --health-cmd "curl -fsS http://127.0.0.1:${listen_port}/api/db/ping || exit 1" \
    --health-interval 5s \
    --health-timeout 3s \
    --health-retries 12 \
    --health-start-period 5s \
    --restart unless-stopped \
    "${IMAGE_NAME}:latest"

  wait_for_container_healthy "${CONTAINER_NAME}" 60
  log_info "容器启动成功"
  log_info "后端端口映射: localhost:${HOST_PORT} -> container:${CONTAINER_PORT}"
  log_info "后端数据库连接目标: ${DB_HOST_VAL}:${DB_PORT_VAL}/${DB_NAME_VAL}"
  log_info "PostgreSQL TLS 模式: ${DB_SSLMODE_VAL}"
  log_info "地图制品持久卷: ${MAP_STORAGE_VOLUME_VAL} -> /app/static"
  log_info "查看容器日志: docker logs -f ${CONTAINER_NAME}"
}

stop_only() {
  load_backend_cfg
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_info "停止容器: ${CONTAINER_NAME}"
    docker stop "${CONTAINER_NAME}"
    log_info "容器已停止"
  else
    log_warn "容器未运行"
  fi
}

delete_all() {
  load_backend_cfg
  stop_container
  if docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:latest$"; then
    log_info "删除镜像: ${IMAGE_NAME}:latest"
    docker rmi "${IMAGE_NAME}:latest"
    log_info "镜像已删除"
  else
    log_warn "镜像不存在"
  fi
}

show_help() {
  echo "ROC-SYSTEM 后端 Docker 部署脚本"
  echo ""
  echo "配置文件:"
  echo "  scripts/config/deploy.env (+ 可选 scripts/config/secrets.env)"
  echo ""
  echo "使用方法:"
  echo "  $0 [选项]"
  echo ""
  echo "选项:"
  echo "  -b, --build     构建 Docker 镜像"
  echo "  -r, --run       运行 Docker 容器"
  echo "  -s, --stop      停止 Docker 容器"
  echo "  -d, --delete    删除 Docker 容器和镜像"
  echo "  -a, --all       执行完整流程：构建 -> 停止旧容器 -> 运行新容器"
  echo "  -h, --help      显示帮助信息"
}

main() {
  check_docker
  load_backend_cfg

  case "${1:-}" in
    -b|--build) build_image ;;
    -r|--run) run_container ;;
    -s|--stop) stop_only ;;
    -d|--delete) delete_all ;;
    -a|--all)
      log_info "开始完整部署流程..."
      build_image
      run_container
      log_info "部署完成！"
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

