# PostgreSQL Docker 镜像
# 用于 ROC-SYSTEM 数据库服务

FROM postgres:16-alpine

# 设置环境变量
ENV POSTGRES_DB=roc_db
ENV POSTGRES_USER=roc_user
# POSTGRES_PASSWORD 必须在运行容器时通过环境变量或 secret 注入，镜像不内置密码。
ENV PGDATA=/var/lib/postgresql/data/pgdata

# 复制初始化脚本
COPY postgres/init/init.sql /docker-entrypoint-initdb.d/

# 暴露端口
EXPOSE 5432

# 使用默认的 postgres 启动命令
# CMD 由基础镜像提供

