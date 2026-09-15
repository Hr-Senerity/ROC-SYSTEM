# 第一阶段：构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# npm 镜像源 (default / npmmirror)
ARG NPM_MIRROR=default
RUN if [ "$NPM_MIRROR" = "npmmirror" ]; then npm config set registry https://registry.npmmirror.com; fi

RUN corepack enable
COPY roc-frontend/package.json roc-frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY roc-frontend/ ./

# 构建应用
RUN pnpm run build

# 第二阶段：运行阶段
FROM nginx:alpine

# 复制构建产物到 nginx 目录
COPY --from=builder /app/build /usr/share/nginx/html

# 复制 nginx 配置文件
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]

