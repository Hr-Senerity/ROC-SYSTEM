# ROC-SYSTEM Backend (C++ / Drogon / libpqxx)

FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

ARG ROC_VERSION=dev
ARG ROC_REVISION=unknown

ARG APT_MIRROR=default
RUN if [ "$APT_MIRROR" = "tsinghua" ]; then \
      sed -i 's|http://.*archive.ubuntu.com|http://mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/ubuntu.sources; \
      sed -i 's|http://.*security.ubuntu.com|http://mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/ubuntu.sources; \
    fi

# 第一步：安装基础构建工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    apt-utils \
    build-essential \
    cmake \
    pkg-config \
    git \
 && rm -rf /var/lib/apt/lists/*

# 第二步：在安装 Drogon 之前，先自动安装所有 Drogon 需要的依赖
# 这样可以避免 Drogon 的 CMake 配置时因为缺少依赖而失败
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Drogon 必需依赖
    libjsoncpp-dev \
    uuid-dev \
    zlib1g-dev \
    # Drogon 推荐依赖（CMake 配置时会查找）
    libssl-dev \
    libpq-dev \
    libsqlite3-dev \
    libmariadb-dev \
    libbrotli-dev \
    libc-ares-dev \
    libhiredis-dev \
    libyaml-cpp-dev \
 && rm -rf /var/lib/apt/lists/*

# 第三步：安装 Drogon 和 libpqxx（现在所有依赖都已就绪）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libdrogon-dev \
    libpqxx-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY roc-backend/ ./roc-backend/

WORKDIR /src/roc-backend
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
 && cmake --build build -j


FROM ubuntu:24.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive

ARG ROC_VERSION=dev
ARG ROC_REVISION=unknown
LABEL org.opencontainers.image.title="ROC-SYSTEM backend" \
      org.opencontainers.image.version="${ROC_VERSION}" \
      org.opencontainers.image.revision="${ROC_REVISION}"

ARG APT_MIRROR=default
RUN if [ "$APT_MIRROR" = "tsinghua" ]; then \
      sed -i 's|http://.*archive.ubuntu.com|http://mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/ubuntu.sources; \
      sed -i 's|http://.*security.ubuntu.com|http://mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/ubuntu.sources; \
    fi

# Runtime 阶段：安装所有运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    # Drogon 运行时依赖
    uuid-dev \
    zlib1g \
    libssl3 \
    libjsoncpp-dev \
    # 数据库运行时库
    libpq5 \
    libsqlite3-0 \
    libmariadb3 \
    libbrotli1 \
    libhiredis1.1.0 \
    # Drogon 和 libpqxx 运行时库
    libdrogon-dev \
    libpqxx-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /src/roc-backend/build/roc-backend-server /app/roc-backend-server

ENV BACKEND_LISTEN_HOST=0.0.0.0
ENV BACKEND_LISTEN_PORT=8080

EXPOSE 8080

CMD ["/app/roc-backend-server"]

