#!/usr/bin/env bash
# 在独立构建机上构建、测试并导出 ROC-SYSTEM Docker release bundle。
# 主服务器不得运行本脚本。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

VERSION="${1:-}"
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
OUTPUT_ROOT="${RELEASE_OUTPUT_DIR:-${REPO_ROOT}/release-output}"
APT_MIRROR="${APT_MIRROR:-default}"
NPM_MIRROR="${NPM_MIRROR:-default}"

usage() {
  echo "用法: $0 v0.1.0"
  echo "可选环境变量: TARGET_PLATFORM=linux/amd64 RELEASE_OUTPUT_DIR=/path APT_MIRROR=tsinghua NPM_MIRROR=npmmirror"
}

if [[ ! "${VERSION}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  usage
  exit 1
fi

PACKAGE_VERSION="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "${REPO_ROOT}/roc-frontend/package.json" | head -n 1)"
CMAKE_VERSION="$(sed -n 's/^project(roc_backend VERSION \([^ ]*\).*/\1/p' "${REPO_ROOT}/roc-backend/CMakeLists.txt" | head -n 1)"
RELEASE_VERSION="${VERSION#v}"
RELEASE_BASE_VERSION="${RELEASE_VERSION%%-*}"
RELEASE_BASE_VERSION="${RELEASE_BASE_VERSION%%+*}"
if [[ "${RELEASE_VERSION}" != "${PACKAGE_VERSION}" || "${RELEASE_BASE_VERSION}" != "${CMAKE_VERSION}" ]]; then
  echo "版本不一致: 参数=${RELEASE_VERSION}, frontend=${PACKAGE_VERSION}, backend-base=${CMAKE_VERSION}" >&2
  exit 1
fi

for command_name in docker git gzip sha256sum tar sed; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "缺少命令: ${command_name}" >&2
    exit 1
  }
done

docker info >/dev/null 2>&1 || {
  echo "Docker daemon 不可用" >&2
  exit 1
}

if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain --untracked-files=normal)" && "${ALLOW_DIRTY_BUILD:-false}" != "true" ]]; then
  echo "工作区存在未提交变更；release 构建默认拒绝不可追溯源码。请先提交，或仅在明确授权时设置 ALLOW_DIRTY_BUILD=true。" >&2
  exit 1
fi

mkdir -p "${OUTPUT_ROOT}"
OUTPUT_ROOT="$(cd "${OUTPUT_ROOT}" && pwd)"
BUNDLE_NAME="roc-system-${VERSION}-${TARGET_PLATFORM##*/}"
BUNDLE_PATH="${OUTPUT_ROOT}/${BUNDLE_NAME}.bundle.tar"
BUNDLE_CHECKSUM_PATH="${BUNDLE_PATH}.sha256"

if [[ -e "${BUNDLE_PATH}" || -e "${BUNDLE_CHECKSUM_PATH}" ]]; then
  echo "交付物已存在，请先归档或指定新的 RELEASE_OUTPUT_DIR: ${BUNDLE_PATH}" >&2
  exit 1
fi

STAGING_DIR="$(mktemp -d "${OUTPUT_ROOT}/.${BUNDLE_NAME}.XXXXXX")"
cleanup() {
  rm -rf -- "${STAGING_DIR}"
}
trap cleanup EXIT

GIT_REVISION="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BACKEND_BUILDER_IMAGE="roc-system/backend-builder:${VERSION}"
FRONTEND_BUILDER_IMAGE="roc-system/frontend-builder:${VERSION}"
BACKEND_IMAGE="roc-system/backend:${VERSION}"
FRONTEND_IMAGE="roc-system/frontend:${VERSION}"
POSTGRES_IMAGE="roc-system/postgres:${VERSION}"

echo "[1/8] 构建后端 builder 并运行 CTest"
docker build --platform "${TARGET_PLATFORM}" \
  --target builder \
  --build-arg "APT_MIRROR=${APT_MIRROR}" \
  --build-arg "ROC_VERSION=${VERSION}" \
  --build-arg "ROC_REVISION=${GIT_REVISION}" \
  -f "${REPO_ROOT}/docker/backend/Dockerfile" \
  -t "${BACKEND_BUILDER_IMAGE}" "${REPO_ROOT}"
docker run --rm "${BACKEND_BUILDER_IMAGE}" \
  ctest --test-dir /src/roc-backend/build --output-on-failure

echo "[2/8] 构建后端运行镜像"
docker build --platform "${TARGET_PLATFORM}" \
  --build-arg "APT_MIRROR=${APT_MIRROR}" \
  --build-arg "ROC_VERSION=${VERSION}" \
  --build-arg "ROC_REVISION=${GIT_REVISION}" \
  -f "${REPO_ROOT}/docker/backend/Dockerfile" \
  -t "${BACKEND_IMAGE}" "${REPO_ROOT}"

echo "[3/8] 构建前端 builder 并运行 lint/Vitest"
docker build --platform "${TARGET_PLATFORM}" \
  --target builder \
  --build-arg "NPM_MIRROR=${NPM_MIRROR}" \
  --build-arg "VITE_API_BASE_URL=" \
  --build-arg "ROC_VERSION=${VERSION}" \
  --build-arg "ROC_REVISION=${GIT_REVISION}" \
  -f "${REPO_ROOT}/docker/frontend/Dockerfile" \
  -t "${FRONTEND_BUILDER_IMAGE}" "${REPO_ROOT}"
docker run --rm "${FRONTEND_BUILDER_IMAGE}" sh -lc \
  "pnpm run lint && pnpm test"

echo "[4/8] 运行 Playwright 画布与键盘门禁"
docker build --platform "${TARGET_PLATFORM}" \
  --target e2e \
  --build-arg "NPM_MIRROR=${NPM_MIRROR}" \
  -f "${REPO_ROOT}/docker/frontend/Dockerfile" \
  -t "roc-system/frontend-e2e:${VERSION}" "${REPO_ROOT}"

echo "[5/8] 构建前端运行镜像"
docker build --platform "${TARGET_PLATFORM}" \
  --build-arg "NPM_MIRROR=${NPM_MIRROR}" \
  --build-arg "VITE_API_BASE_URL=" \
  --build-arg "ROC_VERSION=${VERSION}" \
  --build-arg "ROC_REVISION=${GIT_REVISION}" \
  -f "${REPO_ROOT}/docker/frontend/Dockerfile" \
  -t "${FRONTEND_IMAGE}" "${REPO_ROOT}"

echo "[6/8] 构建 PostgreSQL 运行镜像"
docker build --platform "${TARGET_PLATFORM}" \
  --build-arg "ROC_VERSION=${VERSION}" \
  --build-arg "ROC_REVISION=${GIT_REVISION}" \
  -f "${REPO_ROOT}/docker/postgres/Dockerfile" \
  -t "${POSTGRES_IMAGE}" "${REPO_ROOT}"

echo "[7/8] 导出镜像和运行配置"
docker save "${POSTGRES_IMAGE}" "${BACKEND_IMAGE}" "${FRONTEND_IMAGE}" \
  | gzip -1 > "${STAGING_DIR}/images.tar.gz"
(
  cd "${STAGING_DIR}"
  sha256sum images.tar.gz > images.tar.gz.sha256
)
cp "${REPO_ROOT}/docker/compose/docker-compose.release.yml" \
  "${STAGING_DIR}/docker-compose.release.yml"
cp "${REPO_ROOT}/docker/compose/release.env.example" \
  "${STAGING_DIR}/release.env.example"
sed -i "s/__ROC_RELEASE_VERSION__/${VERSION}/g" \
  "${STAGING_DIR}/release.env.example"
cp "${REPO_ROOT}/scripts/deploy-release-runtime.sh" \
  "${STAGING_DIR}/deploy.sh"
chmod +x "${STAGING_DIR}/deploy.sh"
mkdir -p "${STAGING_DIR}/migrations"
cp "${REPO_ROOT}"/postgres/migrations/*.sql \
  "${STAGING_DIR}/migrations/"
mkdir -p "${STAGING_DIR}/certs/postgres"

{
  echo "ROC-SYSTEM release bundle"
  echo "version=${VERSION}"
  echo "git_revision=${GIT_REVISION}"
  echo "build_time_utc=${BUILD_TIME}"
  echo "target_platform=${TARGET_PLATFORM}"
  echo "postgres_image=${POSTGRES_IMAGE}"
  echo "backend_image=${BACKEND_IMAGE}"
  echo "frontend_image=${FRONTEND_IMAGE}"
} > "${STAGING_DIR}/RELEASE-MANIFEST.txt"

echo "[8/8] 生成单文件交付包"
tar -cf "${BUNDLE_PATH}" -C "${STAGING_DIR}" .
(
  cd "${OUTPUT_ROOT}"
  sha256sum "$(basename "${BUNDLE_PATH}")" > "$(basename "${BUNDLE_CHECKSUM_PATH}")"
)

echo "交付包: ${BUNDLE_PATH}"
echo "校验文件: ${BUNDLE_CHECKSUM_PATH}"
echo "把这两个文件传到主服务器；主服务器只需解包、配置 release.env 并运行 deploy.sh。"
