#!/bin/bash

# PostgreSQL Docker 部署脚本
# 使用方法: ./scripts/deploy-postgres-docker.sh [选项]
# 选项:
#   -b, --build    构建 Docker 镜像
#   -r, --run      运行 Docker 容器
#   -s, --stop     停止 Docker 容器
#   -d, --delete   删除 Docker 容器和镜像
#   -a, --all      执行完整流程：构建 -> 停止旧容器 -> 运行新容器
#   -h, --help     显示帮助信息

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
IMAGE_NAME="roc-postgres"
CONTAINER_NAME="roc-postgres-container"
PORT=5432
DOCKERFILE_PATH="docker/postgres/Dockerfile"
CONTEXT_PATH="."

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

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    print_info "Docker 检查通过"
}

# 构建 Docker 镜像
build_image() {
    print_info "开始构建 Docker 镜像: ${IMAGE_NAME}"
    docker build -f ${DOCKERFILE_PATH} -t ${IMAGE_NAME}:latest ${CONTEXT_PATH}
    if [ $? -eq 0 ]; then
        print_info "镜像构建成功: ${IMAGE_NAME}:latest"
    else
        print_error "镜像构建失败"
        exit 1
    fi
}

# 停止并删除旧容器
stop_container() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_info "停止并删除旧容器: ${CONTAINER_NAME}"
        docker stop ${CONTAINER_NAME} 2>/dev/null || true
        docker rm ${CONTAINER_NAME} 2>/dev/null || true
        print_info "旧容器已删除"
    else
        print_info "未找到运行中的容器"
    fi
}

# 运行 Docker 容器
run_container() {
    print_info "启动 Docker 容器: ${CONTAINER_NAME}"
    
    # 检查镜像是否存在
    if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:latest$"; then
        print_warn "镜像不存在，开始构建..."
        build_image
    fi
    
    stop_container
    
    docker run -d \
        --name ${CONTAINER_NAME} \
        -p ${PORT}:5432 \
        -e POSTGRES_DB=roc_db \
        -e POSTGRES_USER=roc_user \
        -e POSTGRES_PASSWORD=roc_password \
        -v roc_postgres_data:/var/lib/postgresql/data \
        --restart unless-stopped \
        ${IMAGE_NAME}:latest
    
    if [ $? -eq 0 ]; then
        print_info "容器启动成功"
        print_info "PostgreSQL 服务访问地址: localhost:${PORT}"
        print_info "数据库名: roc_db"
        print_info "用户名: roc_user"
        print_info "查看容器日志: docker logs -f ${CONTAINER_NAME}"
    else
        print_error "容器启动失败"
        exit 1
    fi
}

# 停止容器
stop_only() {
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_info "停止容器: ${CONTAINER_NAME}"
        docker stop ${CONTAINER_NAME}
        print_info "容器已停止"
    else
        print_warn "容器未运行"
    fi
}

# 删除容器和镜像
delete_all() {
    stop_container
    
    if docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:latest$"; then
        print_info "删除镜像: ${IMAGE_NAME}:latest"
        docker rmi ${IMAGE_NAME}:latest
        print_info "镜像已删除"
    else
        print_warn "镜像不存在"
    fi
    
    # 删除数据卷（可选，谨慎使用）
    if docker volume ls --format '{{.Name}}' | grep -q "^roc_postgres_data$"; then
        read -p "是否删除数据卷 roc_postgres_data? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker volume rm roc_postgres_data
            print_info "数据卷已删除"
        fi
    fi
}

# 显示帮助信息
show_help() {
    echo "PostgreSQL Docker 部署脚本"
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
    echo ""
    echo "示例:"
    echo "  $0 --build      # 仅构建镜像"
    echo "  $0 --run        # 仅运行容器"
    echo "  $0 --all        # 完整部署流程"
}

# 主函数
main() {
    check_docker
    
    case "${1:-}" in
        -b|--build)
            build_image
            ;;
        -r|--run)
            run_container
            ;;
        -s|--stop)
            stop_only
            ;;
        -d|--delete)
            delete_all
            ;;
        -a|--all)
            print_info "开始完整部署流程..."
            build_image
            run_container
            print_info "部署完成！"
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

