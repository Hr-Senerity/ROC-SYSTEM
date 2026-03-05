# ROC-SYSTEM Backend (C++ / Drogon / libpqxx)

FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    cmake \
    pkg-config \
    git \
    uuid-dev \
    zlib1g-dev \
    libssl-dev \
    libpq-dev \
    libsqlite3-dev \
    libmariadb-dev \
    libdrogon-dev \
    libpqxx-dev \
    libjsoncpp-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY roc-backend/ ./roc-backend/

WORKDIR /src/roc-backend
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
 && cmake --build build -j


FROM ubuntu:24.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    uuid-dev \
    zlib1g \
    libssl3 \
    libpq5 \
    libsqlite3-0 \
    libmariadb3 \
    libdrogon-dev \
    libpqxx-dev \
    libjsoncpp-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /src/roc-backend/build/roc-backend-server /app/roc-backend-server

ENV BACKEND_LISTEN_HOST=0.0.0.0
ENV BACKEND_LISTEN_PORT=8080

EXPOSE 8080

CMD ["/app/roc-backend-server"]

