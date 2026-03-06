#!/bin/bash

# ROC-SYSTEM 宿主机 Nginx 网关部署脚本（模板渲染 + 安装 + reload）
#
# 使用方法: ./scripts/deploy-gateway.sh [选项]
# 选项:
#   --render     仅渲染配置到临时文件（打印路径）
#   --install    安装站点配置到 Nginx 并启用
#   --reload     nginx -t 并 reload
#   --all        install + reload
#   -h, --help   显示帮助
#
# 依赖:
# - 宿主机已安装 nginx
# - 站点配置目录：Debian/Ubuntu（sites-available/enabled）或 RHEL 系（conf.d）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
load_env

# 注意：common.sh 会重新定义 SCRIPT_DIR，所以使用 SCRIPTS_DIR（指向 scripts 目录）
TEMPLATE_FILE="${SCRIPTS_DIR}/templates/nginx-site.conf.template"

detect_nginx_layout() {
  if [[ -d "/etc/nginx/sites-available" && -d "/etc/nginx/sites-enabled" ]]; then
    echo "debian"
    return
  fi
  echo "rhel"
}

nginx_conf_paths() {
  local layout
  layout="$(detect_nginx_layout)"
  if [[ "$layout" == "debian" ]]; then
    echo "/etc/nginx/sites-available /etc/nginx/sites-enabled"
  else
    echo "/etc/nginx/conf.d /etc/nginx/conf.d"
  fi
}

render_frontend_block() {
  # 根据 FRONTEND_MODE 决定“静态 root”还是“反代到前端容器”
  if [[ "${FRONTEND_MODE:-docker}" == "local" ]]; then
    require_vars FRONTEND_LOCAL_PUBLISH_DIR
    cat <<EOF
    root {{FRONTEND_LOCAL_PUBLISH_DIR}};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }
EOF
  else
    # docker 模式：反代到本机前端容器映射端口（或你指定的前端服务器）
    # 这里默认反代到本机：http://127.0.0.1:FRONTEND_DOCKER_HOST_PORT
    local host_port="${FRONTEND_DOCKER_HOST_PORT:-3000}"
    cat <<EOF
    location / {
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_pass http://127.0.0.1:${host_port};
    }
EOF
  fi
}

render_site_conf() {
  require_cmd nginx
  require_vars DOMAIN BACKEND_HOST BACKEND_PORT

  if [[ ! -f "$TEMPLATE_FILE" ]]; then
    log_error "未找到模板文件：$TEMPLATE_FILE"
    exit 1
  fi

  local api_upstream="http://${BACKEND_HOST}:${BACKEND_PORT}"
  local frontend_block
  frontend_block="$(render_frontend_block)"

  local tmp
  tmp="$(mktemp)"

  # 基础 80 配置
  sed \
    -e "s|{{DOMAIN}}|${DOMAIN}|g" \
    -e "s|{{API_UPSTREAM}}|${api_upstream}|g" \
    -e "s|{{FRONTEND_BLOCK}}|${frontend_block//$'\n'/\\n}|g" \
    -e "s|{{FRONTEND_LOCAL_PUBLISH_DIR}}|${FRONTEND_LOCAL_PUBLISH_DIR:-}|g" \
    "$TEMPLATE_FILE" > "$tmp"

  # TLS (manual) 时追加 443 server block
  if [[ "${TLS_MODE:-off}" == "manual" ]]; then
    require_vars TLS_CERT_PATH TLS_KEY_PATH
    cat >> "$tmp" <<EOF

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate ${TLS_CERT_PATH};
    ssl_certificate_key ${TLS_KEY_PATH};

$(render_frontend_block | sed 's/^/    /')

    location /api/ {
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_pass ${api_upstream};
    }
}
EOF
  elif [[ "${TLS_MODE:-off}" == "letsencrypt" ]]; then
    log_warn "TLS_MODE=letsencrypt：需要后续集成 certbot（当前脚本暂不自动申请证书）"
  fi

  echo "$tmp"
}

install_site_conf() {
  local tmp
  tmp="$(render_site_conf)"

  local avail_dir enabled_dir
  read -r avail_dir enabled_dir <<<"$(nginx_conf_paths)"

  local site_name="roc-system.conf"
  local dest="${avail_dir}/${site_name}"

  log_info "安装 Nginx 配置到: ${dest}"
  sudo cp "$tmp" "$dest"

  # Debian layout 需要启用链接
  if [[ "$(detect_nginx_layout)" == "debian" ]]; then
    if [[ ! -L "${enabled_dir}/${site_name}" ]]; then
      sudo ln -s "${dest}" "${enabled_dir}/${site_name}"
    fi
    
    # 禁用默认站点（如果存在），避免优先级冲突
    if [[ -L "${enabled_dir}/default" ]]; then
      log_info "禁用默认站点: ${enabled_dir}/default"
      sudo rm -f "${enabled_dir}/default"
    fi
  fi

  rm -f "$tmp"
  log_info "安装完成"
}

reload_nginx() {
  require_cmd nginx
  log_info "校验 Nginx 配置: nginx -t"
  sudo nginx -t
  log_info "Reload Nginx"
  sudo systemctl reload nginx || sudo nginx -s reload
  log_info "Nginx reload 完成"
}

show_help() {
  echo "ROC-SYSTEM 宿主机 Nginx 网关部署脚本"
  echo ""
  echo "配置文件:"
  echo "  scripts/config/deploy.env (+ 可选 scripts/config/secrets.env)"
  echo ""
  echo "使用方法:"
  echo "  $0 [选项]"
  echo ""
  echo "选项:"
  echo "  --render     仅渲染配置到临时文件"
  echo "  --install    安装站点配置到 Nginx"
  echo "  --reload     nginx -t 并 reload"
  echo "  --all        install + reload"
  echo "  -h, --help   显示帮助"
}

main() {
  case "${1:-}" in
    --render)
      echo "$(render_site_conf)"
      ;;
    --install)
      install_site_conf
      ;;
    --reload)
      reload_nginx
      ;;
    --all)
      install_site_conf
      reload_nginx
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

