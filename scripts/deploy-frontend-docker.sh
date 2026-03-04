#!/bin/bash

# ROC-SYSTEM 前端 Docker 部署脚本（模块化：从 scripts/config 读取配置）
# 使用方法: ./scripts/deploy-frontend-docker.sh [选项]
# 选项:
#   -b, --build    构建 Docker 镜像
#   -r, --run      运行 Docker 容器
#   -s, --stop     停止 Docker 容器
#   -d, --delete   删除 Docker 容器和镜像
#   -a, --all      执行完整流程：构建 -> 停止旧容器 -> 运行新容器

set -e  # 遇到错误立即退出

# 统一加载配置
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
load_env

# 检查 Docker 是否安装
check_docker() {
    docker_must_exist
    log_info "Docker 检查通过"
}

load_frontend_cfg() {
    IMAGE_NAME="${FRONTEND_DOCKER_IMAGE:-roc-frontend}"
    CONTAINER_NAME="${FRONTEND_DOCKER_CONTAINER:-roc-frontend}"
    HOST_PORT="${FRONTEND_DOCKER_HOST_PORT:-3000}"
    CONTAINER_PORT="${FRONTEND_CONTAINER_PORT:-80}"
    DOCKERFILE_PATH="${FRONTEND_DOCKERFILE:-docker/frontend/Dockerfile}"
    CONTEXT_PATH="${DOCKER_CONTEXT_PATH:-.}"
}

# 构建 Docker 镜像
build_image() {
    load_frontend_cfg
    log_info "开始构建前端镜像: ${IMAGE_NAME}:latest"
    docker build -f "${DOCKERFILE_PATH}" -t "${IMAGE_NAME}:latest" "${CONTEXT_PATH}"
    if [ $? -eq 0 ]; then
        log_info "镜像构建成功: ${IMAGE_NAME}:latest"
    else
        log_error "镜像构建失败"
        exit 1
    fi
}

# 停止并删除旧容器
stop_container() {
    load_frontend_cfg
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_info "停止并删除旧容器: ${CONTAINER_NAME}"
        docker stop "${CONTAINER_NAME}" 2>/dev/null || true
        docker rm "${CONTAINER_NAME}" 2>/dev/null || true
        log_info "旧容器已删除"
    else
        log_info "未找到运行中的容器"
    fi
}

# 运行 Docker 容器
run_container() {
    load_frontend_cfg
    log_info "启动前端容器: ${CONTAINER_NAME}"
    
    # 检查镜像是否存在
    if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:latest$"; then
        log_warn "镜像不存在，开始构建..."
        build_image
    fi
    
    stop_container
    
    docker run -d \
        --name "${CONTAINER_NAME}" \
        -p "${HOST_PORT}:${CONTAINER_PORT}" \
        --restart unless-stopped \
        "${IMAGE_NAME}:latest"
    
    if [ $? -eq 0 ]; then
        log_info "容器启动成功"
        log_info "前端容器端口映射: localhost:${HOST_PORT} -> container:${CONTAINER_PORT}"
        log_info "查看容器日志: docker logs -f ${CONTAINER_NAME}"
    else
        log_error "容器启动失败"
        exit 1
    fi
}

# 停止容器
stop_only() {
    load_frontend_cfg
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_info "停止容器: ${CONTAINER_NAME}"
        docker stop "${CONTAINER_NAME}"
        log_info "容器已停止"
    else
        log_warn "容器未运行"
    fi
}

# 删除容器和镜像
delete_all() {
    load_frontend_cfg
    stop_container
    
    if docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:latest$"; then
        log_info "删除镜像: ${IMAGE_NAME}:latest"
        docker rmi "${IMAGE_NAME}:latest"
        log_info "镜像已删除"
    else
        log_warn "镜像不存在"
    fi
}

# 显示帮助信息
show_help() {
    echo "ROC-SYSTEM 前端 Docker 部署脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [选项]"
    echo ""
    echo "配置文件:"
    echo "  scripts/config/deploy.env (+ 可选 scripts/config/secrets.env)"
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
    load_frontend_cfg
    
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

