# 第一阶段：构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

ARG ROC_VERSION=dev
ARG ROC_REVISION=unknown
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

# 浏览器门禁阶段仅由 release 构建脚本显式选择，不进入最终运行镜像。
FROM mcr.microsoft.com/playwright:v1.55.0-noble AS e2e

WORKDIR /app
ENV CI=1
ARG NPM_MIRROR=default
RUN corepack enable
RUN if [ "$NPM_MIRROR" = "npmmirror" ]; then npm config set registry https://registry.npmmirror.com; fi
COPY roc-frontend/package.json roc-frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY roc-frontend/ ./
RUN pnpm run test:e2e

# 第二阶段：运行阶段
FROM nginx:alpine

ARG ROC_VERSION=dev
ARG ROC_REVISION=unknown
LABEL org.opencontainers.image.title="ROC-SYSTEM frontend" \
      org.opencontainers.image.version="${ROC_VERSION}" \
      org.opencontainers.image.revision="${ROC_REVISION}"

ENV BACKEND_UPSTREAM=http://roc-backend:8080
ENV NGINX_ENVSUBST_FILTER=^BACKEND_UPSTREAM$

# 复制构建产物到 nginx 目录
COPY --from=builder /app/build /usr/share/nginx/html

# Nginx 官方镜像启动时仅替换 BACKEND_UPSTREAM，保留 $host/$uri 等 Nginx 变量。
COPY docker/frontend/nginx.conf /etc/nginx/templates/default.conf.template

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]

