# 第一阶段：构建阶段
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 构建参数 — 后端 API 地址
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# 复制 package.json 和 package-lock.json（如果存在）
COPY roc-frontend/package*.json ./

# 安装依赖（包括开发依赖，因为需要构建）
RUN npm install

# 复制源代码
COPY roc-frontend/ ./

# 构建应用
RUN npm run build

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

