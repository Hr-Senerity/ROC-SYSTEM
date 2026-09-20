#!/usr/bin/env bash

# 验证前端入口、后端与数据库就绪状态，以及同源 WebSocket Upgrade 代理。
# 可通过 PUBLIC_BASE_URL 覆盖入口，例如 http://127.0.0.1:13000。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
load_env

PUBLIC_BASE_URL="${VERIFY_BASE_URL:-${PUBLIC_BASE_URL:-http://127.0.0.1:${FRONTEND_DOCKER_HOST_PORT:-3000}}}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"

require_cmd curl

check_json_ok() {
  local url="$1"
  local label="$2"
  local body
  body="$(curl --fail --silent --show-error --max-time 10 "${url}")"
  if [[ "${body}" != *'"ok":true'* && "${body}" != *'"ok": true'* ]]; then
    log_error "${label} 未返回 ok=true: ${body}"
    exit 1
  fi
  log_info "${label}通过: ${url}"
}

check_websocket_upgrade() {
  local url="$1"
  local output
  output="$(curl --http1.1 --silent --show-error --include --no-buffer \
    --max-time 2 \
    -H 'Connection: Upgrade' \
    -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    "${url}" 2>&1 || true)"
  if ! grep -Eq '^HTTP/[0-9.]+ 101([[:space:]]|$)' <<<"${output}"; then
    log_error "WebSocket Upgrade 代理失败: ${url}"
    printf '%s\n' "${output}" | head -n 20
    exit 1
  fi
  log_info "WebSocket Upgrade 代理通过: ${url}"
}

log_info "验证公开入口: ${PUBLIC_BASE_URL}"
curl --fail --silent --show-error --max-time 10 "${PUBLIC_BASE_URL}/" >/dev/null
log_info "前端页面通过"
check_json_ok "${PUBLIC_BASE_URL}/api/health" "后端健康检查"
check_json_ok "${PUBLIC_BASE_URL}/api/db/ping" "数据库连通检查"

check_websocket_upgrade "${PUBLIC_BASE_URL}/ws/status"

log_info "独立部署入口验证完成"
