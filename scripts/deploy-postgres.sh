#!/bin/bash

# PostgreSQL 本地部署脚本（模块化：从 scripts/config 读取配置）
# 使用方法: ./scripts/deploy-postgres.sh [选项]
# 选项:
#   -i, --install    安装 PostgreSQL
#   -s, --start      启动 PostgreSQL 服务
#   -t, --stop       停止 PostgreSQL 服务
#   -r, --restart    重启 PostgreSQL 服务
#   -c, --create     创建数据库和用户
#   --apply          执行 postgres/init/init.sql（扩展/时区等）
#   -a, --all        install -> start -> create -> apply
#   -h, --help       显示帮助信息

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
load_env

load_pg_local_cfg() {
  DB_NAME_VAL="${DB_NAME:-roc_db}"
  DB_USER_VAL="${DB_USER:-roc_user}"
  DB_PASSWORD_VAL="${DB_PASSWORD:-}"
  DB_PORT_VAL="${DB_PORT:-5432}"
  INIT_SQL="${REPO_ROOT}/postgres/init/init.sql"
}

# 检查 PostgreSQL 是否安装
check_postgres() {
    if ! command -v psql &> /dev/null; then
        log_error "PostgreSQL 未安装"
        return 1
    fi
    log_info "PostgreSQL 检查通过"
    return 0
}

# 安装 PostgreSQL (Linux)
install_postgres() {
    log_info "安装 PostgreSQL..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y postgresql postgresql-contrib
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y postgresql-server postgresql-contrib
        elif command -v yum &> /dev/null; then
            sudo yum install -y postgresql-server postgresql-contrib
        else
            log_error "不支持的 Linux 发行版"
            exit 1
        fi
    else
        log_error "此脚本仅支持 Linux 系统"
        exit 1
    fi
    
    log_info "PostgreSQL 安装完成"
}

detect_pg_service() {
  # 尽量兼容不同发行版的服务名
  if systemctl list-unit-files | grep -q '^postgresql\.service'; then
    echo "postgresql"
    return
  fi
  local svc
  svc="$(systemctl list-unit-files | awk '{print $1}' | grep -E '^postgresql(-[0-9]+)?\.service$' | head -n 1 | sed 's/\.service$//')"
  if [[ -n "$svc" ]]; then
    echo "$svc"
    return
  fi
  echo "postgresql"
}

# 启动 PostgreSQL 服务
start_postgres() {
    log_info "启动 PostgreSQL 服务..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        local svc
        svc="$(detect_pg_service)"
        sudo systemctl start "$svc"
        sudo systemctl enable "$svc"
    else
        log_error "此脚本仅支持 Linux 系统"
        exit 1
    fi
    
    log_info "PostgreSQL 服务已启动"
}

# 停止 PostgreSQL 服务
stop_postgres() {
    log_info "停止 PostgreSQL 服务..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        local svc
        svc="$(detect_pg_service)"
        sudo systemctl stop "$svc"
    else
        log_error "此脚本仅支持 Linux 系统"
        exit 1
    fi
    
    log_info "PostgreSQL 服务已停止"
}

# 创建数据库和用户
create_database() {
    load_pg_local_cfg
    require_vars DB_NAME DB_USER
    if [[ -z "${DB_PASSWORD_VAL}" ]]; then
      log_warn "DB_PASSWORD 未设置（建议放在 scripts/config/secrets.env）"
      DB_PASSWORD_VAL="roc_password"
    fi

    log_info "创建数据库和用户..."
    
    sudo -u postgres psql <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER_VAL}') THEN
    CREATE ROLE ${DB_USER_VAL} LOGIN PASSWORD '${DB_PASSWORD_VAL}';
  END IF;
END
\$\$;
CREATE DATABASE ${DB_NAME_VAL} OWNER ${DB_USER_VAL};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME_VAL} TO ${DB_USER_VAL};
\q
EOF
    
    log_info "数据库和用户创建完成"
    log_info "数据库名: ${DB_NAME_VAL}"
    log_info "用户名: ${DB_USER_VAL}"
    log_info "端口: ${DB_PORT_VAL}"
}

apply_init_sql() {
  load_pg_local_cfg
  if [[ ! -f "${INIT_SQL}" ]]; then
    log_error "未找到初始化 SQL：${INIT_SQL}"
    exit 1
  fi
  log_info "执行初始化 SQL：${INIT_SQL}"
  sudo -u postgres psql -d "${DB_NAME_VAL}" -f "${INIT_SQL}"
  log_info "初始化 SQL 执行完成"
}

# 显示帮助信息
show_help() {
    echo "PostgreSQL 本地部署脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [选项]"
    echo ""
    echo "配置文件:"
    echo "  scripts/config/deploy.env (+ 可选 scripts/config/secrets.env)"
    echo ""
    echo "选项:"
    echo "  -i, --install    安装 PostgreSQL"
    echo "  -s, --start      启动 PostgreSQL 服务"
    echo "  -t, --stop       停止 PostgreSQL 服务"
    echo "  -r, --restart    重启 PostgreSQL 服务"
    echo "  -c, --create     创建数据库和用户"
    echo "  --apply          执行 postgres/init/init.sql"
    echo "  -a, --all        install -> start -> create -> apply"
    echo "  -h, --help       显示帮助信息"
}

# 主函数
main() {
    case "${1:-}" in
        -i|--install)
            install_postgres
            ;;
        -s|--start)
            check_postgres || exit 1
            start_postgres
            ;;
        -t|--stop)
            stop_postgres
            ;;
        -r|--restart)
            stop_postgres
            start_postgres
            ;;
        -c|--create)
            check_postgres || exit 1
            create_database
            ;;
        --apply)
            check_postgres || exit 1
            apply_init_sql
            ;;
        -a|--all)
            if ! check_postgres; then
              install_postgres
            fi
            start_postgres
            create_database
            apply_init_sql
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

# 执行主函数
main "$@"

