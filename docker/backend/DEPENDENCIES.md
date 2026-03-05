# ROC-SYSTEM Backend 依赖项清单

## Drogon 框架依赖

### 必需依赖
- **libjsoncpp-dev** / **libjsoncpp-dev** (runtime)
  - JSON C++ 库，版本 ≥ 1.7
  - 用途：JSON 序列化/反序列化

- **uuid-dev** / **uuid-dev** (runtime)
  - UUID 生成库
  - 用途：生成唯一标识符

- **zlib1g-dev** / **zlib1g** (runtime)
  - 压缩库
  - 用途：HTTP 压缩传输支持

### 推荐依赖
- **libssl-dev** / **libssl3** (runtime)
  - OpenSSL 开发库 / 运行时库
  - 用途：HTTPS 支持（否则仅支持 HTTP）

## libpqxx 依赖

- **libpq-dev** / **libpq5** (runtime)
  - PostgreSQL 客户端库（底层）
  - 用途：libpqxx 的底层依赖

- **libpqxx-dev** / **libpqxx-dev** (runtime)
  - PostgreSQL C++ 客户端库
  - 用途：后端与 PostgreSQL 数据库交互

## Drogon 数据库依赖

- **libsqlite3-dev** / **libsqlite3-0** (runtime)
  - SQLite3 开发库 / 运行时库
  - 用途：Drogon 框架要求（即使不使用 SQLite3，CMake 配置阶段也会查找）

- **libmariadb-dev** / **libmariadb3** (runtime)
  - MariaDB/MySQL 开发库 / 运行时库
  - 用途：Drogon 框架要求（即使不使用 MySQL/MariaDB，CMake 配置阶段也会查找）

## Drogon 包

- **libdrogon-dev** / **libdrogon-dev** (runtime)
  - Drogon Web 框架
  - 用途：HTTP 服务器框架

## 构建工具

- **build-essential**
  - GCC/G++ 编译器、make 等
  - 用途：编译 C++ 代码

- **cmake** (≥ 3.16)
  - 构建系统
  - 用途：CMake 配置和构建

- **pkg-config**
  - 包配置工具
  - 用途：查找库的编译标志

- **git**
  - 版本控制工具
  - 用途：克隆依赖（如需要从源码编译 Drogon）

## 系统依赖

- **ca-certificates**
  - CA 证书
  - 用途：HTTPS 连接验证

## 可选依赖（未包含）

以下依赖可根据需要添加：

- **libc-ares-dev** - 改善 DNS 性能
- **libbrotli-dev** - HTTP Brotli 压缩
- **libhiredis-dev** - Redis 支持
- **libyaml-cpp-dev** - YAML 配置文件支持
- **libgtest-dev** - 单元测试框架

## 检查命令

在 Ubuntu/Debian 系统上检查依赖是否已安装：

```bash
# 检查开发库
dpkg -l | grep -E "libjsoncpp-dev|uuid-dev|zlib1g-dev|libssl-dev|libpq-dev|libsqlite3-dev|libmariadb-dev|libpqxx-dev|libdrogon-dev"

# 检查运行时库
dpkg -l | grep -E "libjsoncpp|uuid|zlib1g|libssl3|libpq5|libsqlite3|libmariadb3|libpqxx|libdrogon"
```

## 安装命令

```bash
sudo apt-get update
sudo apt-get install -y \
    libjsoncpp-dev \
    uuid-dev \
    zlib1g-dev \
    libssl-dev \
    libpq-dev \
    libsqlite3-dev \
    libmariadb-dev \
    libpqxx-dev \
    libdrogon-dev \
    build-essential \
    cmake \
    pkg-config \
    git \
    ca-certificates
```
