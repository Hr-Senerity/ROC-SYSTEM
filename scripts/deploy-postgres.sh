#!/bin/bash

# PostgreSQL 本地部署脚本
# 使用方法: ./scripts/deploy-postgres.sh [选项]
# 选项:
#   -i, --install    安装 PostgreSQL
#   -s, --start      启动 PostgreSQL 服务
#   -t, --stop       停止 PostgreSQL 服务
#   -r, --restart    重启 PostgreSQL 服务
#   -c, --create     创建数据库和用户
#   -h, --help       显示帮助信息

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
DB_NAME="roc_db"
DB_USER="roc_user"
DB_PASSWORD="roc_password"
DB_PORT="5432"

# 打印带颜色的消息
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 PostgreSQL 是否安装
check_postgres() {
    if ! command -v psql &> /dev/null; then
        print_error "PostgreSQL 未安装"
        return 1
    fi
    print_info "PostgreSQL 检查通过"
    return 0
}

# 安装 PostgreSQL (Linux)
install_postgres() {
    print_info "安装 PostgreSQL..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y postgresql postgresql-contrib
        elif command -v yum &> /dev/null; then
            sudo yum install -y postgresql-server postgresql-contrib
        else
            print_error "不支持的 Linux 发行版"
            exit 1
        fi
    else
        print_error "此脚本仅支持 Linux 系统"
        exit 1
    fi
    
    print_info "PostgreSQL 安装完成"
}

# 启动 PostgreSQL 服务
start_postgres() {
    print_info "启动 PostgreSQL 服务..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
    else
        print_error "此脚本仅支持 Linux 系统"
        exit 1
    fi
    
    print_info "PostgreSQL 服务已启动"
}

# 停止 PostgreSQL 服务
stop_postgres() {
    print_info "停止 PostgreSQL 服务..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo systemctl stop postgresql
    else
        print_error "此脚本仅支持 Linux 系统"
        exit 1
    fi
    
    print_info "PostgreSQL 服务已停止"
}

# 创建数据库和用户
create_database() {
    print_info "创建数据库和用户..."
    
    sudo -u postgres psql <<EOF
CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
\q
EOF
    
    print_info "数据库和用户创建完成"
    print_info "数据库名: ${DB_NAME}"
    print_info "用户名: ${DB_USER}"
    print_info "端口: ${DB_PORT}"
}

# 显示帮助信息
show_help() {
    echo "PostgreSQL 本地部署脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -i, --install    安装 PostgreSQL"
    echo "  -s, --start      启动 PostgreSQL 服务"
    echo "  -t, --stop       停止 PostgreSQL 服务"
    echo "  -r, --restart    重启 PostgreSQL 服务"
    echo "  -c, --create     创建数据库和用户"
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
        -h|--help|"")
            show_help
            ;;
        *)
            print_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"

