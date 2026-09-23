#!/usr/bin/env bash
# 该脚本由构建脚本复制进 release bundle，在运行主机上加载并启动已构建镜像。
# 它不会执行 docker build、包管理器安装或源码编译。

set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${BUNDLE_DIR}/docker-compose.release.yml"
ENV_FILE="${BUNDLE_DIR}/release.env"
ENV_EXAMPLE="${BUNDLE_DIR}/release.env.example"
IMAGE_ARCHIVE="${BUNDLE_DIR}/images.tar.gz"
MANIFEST_FILE="${BUNDLE_DIR}/RELEASE-MANIFEST.txt"

usage() {
  cat <<EOF
用法: $0 <命令>

  --prepare  首次生成 release.env，随后必须人工填写密码和密钥
  --load     校验并加载构建机导出的 Docker 镜像
  --up       仅使用已加载镜像启动，不拉取、不构建
  --install  依次执行 --load 与 --up
  --status   查看服务状态
  --logs     查看服务日志
  --down     停止服务但保留 PostgreSQL 与地图数据卷
EOF
}

require_file() {
  [[ -f "$1" ]] || {
    echo "缺少文件: $1" >&2
    exit 1
  }
}

require_docker() {
  command -v docker >/dev/null 2>&1 || {
    echo "缺少 Docker" >&2
    exit 1
  }
  docker info >/dev/null 2>&1 || {
    echo "Docker daemon 不可用" >&2
    exit 1
  }
  docker compose version >/dev/null 2>&1 || {
    echo "release 部署要求 Docker Compose v2" >&2
    exit 1
  }
}

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

manifest_value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "${MANIFEST_FILE}"
}

normalize_arch() {
  case "$1" in
    amd64|x86_64) echo "amd64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) echo "$1" ;;
  esac
}

validate_platform() {
  require_file "${MANIFEST_FILE}"
  command -v awk >/dev/null 2>&1 || {
    echo "缺少 awk" >&2
    exit 1
  }
  local target_platform target_arch runtime_arch
  target_platform="$(manifest_value target_platform)"
  target_arch="$(normalize_arch "${target_platform##*/}")"
  runtime_arch="$(normalize_arch "$(docker info --format '{{.Architecture}}')")"
  if [[ -z "${target_arch}" || "${target_arch}" != "${runtime_arch}" ]]; then
    echo "镜像架构不匹配: bundle=${target_platform:-unknown}, runtime=${runtime_arch:-unknown}" >&2
    exit 1
  fi
}

wait_for_health() {
  local container_name="$1"
  local timeout_seconds="${2:-180}"
  local deadline=$((SECONDS + timeout_seconds))
  local state=""

  while (( SECONDS < deadline )); do
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_name}" 2>/dev/null || true)"
    case "${state}" in
      healthy|running)
        echo "容器就绪: ${container_name} (${state})"
        return 0
        ;;
      unhealthy|exited|dead)
        echo "容器启动失败: ${container_name} (${state})" >&2
        docker logs --tail 100 "${container_name}" 2>/dev/null || true
        return 1
        ;;
    esac
    sleep 2
  done

  echo "等待容器健康超时: ${container_name} (${state:-unknown})" >&2
  docker logs --tail 100 "${container_name}" 2>/dev/null || true
  return 1
}

prepare_env() {
  require_file "${ENV_EXAMPLE}"
  if [[ -e "${ENV_FILE}" ]]; then
    echo "release.env 已存在，未覆盖: ${ENV_FILE}"
    return 0
  fi
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  echo "已生成 ${ENV_FILE}。请先填写 DB_PASSWORD、JWT_SECRET 和目标端口，再执行 --install。"
}

validate_env() {
  require_file "${ENV_FILE}"
  if grep -Eq '^(DB_PASSWORD|JWT_SECRET)=[[:space:]]*$' "${ENV_FILE}"; then
    echo "release.env 中的 DB_PASSWORD/JWT_SECRET 不得为空" >&2
    exit 1
  fi
}

env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "${ENV_FILE}" | tail -n 1
}

validate_data_volumes() {
  local require_existing postgres_volume map_volume
  require_existing="$(env_value REQUIRE_EXISTING_DATA_VOLUMES)"
  postgres_volume="$(env_value POSTGRES_DOCKER_VOLUME)"
  map_volume="$(env_value BACKEND_MAP_VOLUME)"

  if [[ -z "${postgres_volume}" || -z "${map_volume}" ]]; then
    echo "release.env 必须明确设置 POSTGRES_DOCKER_VOLUME 和 BACKEND_MAP_VOLUME" >&2
    exit 1
  fi
  if [[ "${postgres_volume}" == "${map_volume}" ]]; then
    echo "PostgreSQL 数据卷与地图制品卷不能使用同一个卷: ${postgres_volume}" >&2
    exit 1
  fi
  case "${require_existing:-true}" in
    false)
      echo "允许创建新数据卷；仅全新安装应使用 REQUIRE_EXISTING_DATA_VOLUMES=false"
      return 0
      ;;
    true) ;;
    *)
      echo "REQUIRE_EXISTING_DATA_VOLUMES 只能是 true 或 false" >&2
      exit 1
      ;;
  esac
  for volume_name in "${postgres_volume}" "${map_volume}"; do
    docker volume inspect "${volume_name}" >/dev/null 2>&1 || {
      echo "要求复用的数据卷不存在: ${volume_name}。请修正卷名；只有全新安装才关闭现有卷保护。" >&2
      exit 1
    }
  done
}

validate_container_ownership() {
  local container_name project_name
  for container_name in roc-postgres roc-backend roc-frontend; do
    if ! docker container inspect "${container_name}" >/dev/null 2>&1; then
      continue
    fi
    project_name="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "${container_name}" 2>/dev/null || true)"
    if [[ "${project_name}" != "roc-system" ]]; then
      echo "发现旧部署容器 ${container_name}（Compose project=${project_name:-none}）。" >&2
      echo "请先停止并移除三个旧容器，但不要删除数据卷，然后重新执行 --up。" >&2
      exit 1
    fi
  done
}

load_images() {
  require_docker
  validate_platform
  require_file "${IMAGE_ARCHIVE}"
  require_file "${BUNDLE_DIR}/images.tar.gz.sha256"
  command -v sha256sum >/dev/null 2>&1 || {
    echo "缺少 sha256sum" >&2
    exit 1
  }
  command -v gzip >/dev/null 2>&1 || {
    echo "缺少 gzip" >&2
    exit 1
  }
  (
    cd "${BUNDLE_DIR}"
    sha256sum -c images.tar.gz.sha256
  )
  gzip -dc "${IMAGE_ARCHIVE}" | docker load
  local image_key image_name
  for image_key in postgres_image backend_image frontend_image; do
    image_name="$(manifest_value "${image_key}")"
    [[ -n "${image_name}" ]] || {
      echo "manifest 缺少 ${image_key}" >&2
      exit 1
    }
    docker image inspect "${image_name}" >/dev/null
  done
}

up_services() {
  require_docker
  require_file "${COMPOSE_FILE}"
  validate_env
  validate_data_volumes
  validate_container_ownership
  compose config >/dev/null
  compose up -d --no-build --pull never
  wait_for_health roc-postgres
  wait_for_health roc-backend
  wait_for_health roc-frontend
  echo "release 已启动。公网入口由 FRONTEND_DOCKER_HOST_PORT 及服务器防火墙配置决定。"
}

case "${1:-}" in
  --prepare) prepare_env ;;
  --load) load_images ;;
  --up) up_services ;;
  --install) load_images; up_services ;;
  --status) require_docker; validate_env; compose ps ;;
  --logs) require_docker; validate_env; compose logs -f --tail=100 ;;
  --down) require_docker; validate_env; compose down ;;
  --help|-h|"") usage ;;
  *) usage; exit 1 ;;
esac
