# ROC-SYSTEM

机器人运营控制平台 (Robot Operation Control Platform)

## 项目简介

ROC-SYSTEM 是一个现代化的机器人运营控制平台，提供完整的用户管理、项目管理、地图可视化和实时性能监控功能。支持 JSON 和 ROC 二进制通信协议，可灵活对接各类机器人系统。

## 核心功能

- **用户认证系统** — JWT 登录/注册，角色权限分离（super_admin / regular），密码修改
- **超级管理员面板** — 用户管理（查看/停用/删除/统计）
- **项目管理** — 创建、删除、查看项目详情
- **地图管理** — 上传自定义地图图片、地图 CRUD、坐标系自定义
- **地图可视化** — 响应式画布、光标锚定缩放、路网叠加、车辆实时位置标记
- **路网编辑器** — 路网数据持久化到数据库，支持导出为 (x,y,z,qx,qy,qz,qw) 格式
- **实时监控** — WebSocket 实时推送车辆状态（位置/速度/电量/CPU/内存）
- **车辆悬浮窗** — 点击车辆显示完整信息（IP/位置/速度/电量/CPU/内存/定位），边界安全检测
- **配送路径高亮** — 选中车辆时高亮配送路径（含方向箭头和节点）
- **协议支持** — JSON、ROC 二进制协议，ProtocolBridge 消息路由，Robot 可轮询指令队列

## 项目结构

```
ROC-SYSTEM/
├── docker/
│   ├── backend/Dockerfile
│   ├── frontend/Dockerfile + nginx.conf
│   ├── postgres/Dockerfile
│   └── compose/docker-compose.yml + .env.example
├── postgres/init/init.sql             # 数据库 Schema + 默认管理员
├── roc-backend/                       # C++17 / Drogon 后端
│   └── src/
│       ├── config/                    # 环境变量 (HTTP/DB/JWT)
│       ├── controllers/               # Auth/Admin/Project/Vehicle/StatusWs
│       ├── db/                        # PostgreSQL 客户端 (libpqxx)
│       ├── middleware/                # AuthFilter / SuperAdminFilter
│       ├── models/                    # User 模型
│       ├── protocols/                 # JSON + ROC 序列化器 + ProtocolBridge
│       └── utils/                     # JWT (HMAC-SHA256) + 密码哈希 (SHA-256)
├── roc-frontend/                      # React 18 + TypeScript + Vite
│   └── src/
│       ├── components/                # 15 个页面组件
│       │   ├── ui/                    # 49 shadcn/ui 组件
│       │   ├── HomePage / LoginPage / RegisterPage
│       │   ├── ProfilePage / ProjectsPage / ProjectDetailPage
│       │   ├── MapDetailPage / VehiclePopup / MapUploadModal
│       │   ├── PerformanceMonitor / SuperAdminPage / ProtocolsPage
│       │   └── PuzzleVerification
│       └── types/robot.ts             # Robot 共享类型定义
└── scripts/                           # 11 个部署脚本 + 公共库 + 配置模板
```

## 快速开始

### 环境要求

- Node.js 18+
- PostgreSQL 16+
- Docker & Docker Compose
- C++ 编译器 (GCC/Clang) + CMake 3.16+

### Docker Compose 一键部署

```bash
cp docker/compose/.env.example docker/compose/.env
# 编辑 .env 修改密码等配置
bash scripts/deploy-all-docker.sh --up
```

默认管理员: `admin` / `[REDACTED_DEFAULT_PASSWORD]`

### 前端开发

```bash
cd roc-frontend && npm install && npm run dev     # http://localhost:3000
```

### 后端开发

```bash
cd roc-backend && mkdir build && cd build
cmake .. && make
BACKEND_LISTEN_PORT=8080 DB_HOST=127.0.0.1 JWT_SECRET=my-secret ./roc-backend-server
```

## 技术栈

### 前端
- React 18 + TypeScript + Vite 6.3.5
- Tailwind CSS v4 + shadcn/ui
- React Router + WebSocket 客户端

### 后端
- C++17 / Drogon HTTP 框架
- PostgreSQL / libpqxx
- OpenSSL (JWT HMAC-SHA256 + SHA-256 密码哈希)
- JSON + ROC 二进制协议 + ProtocolBridge 消息路由
- WebSocket (Drogon WebSocketController)

### 部署
- Docker + Docker Compose + Nginx 网关

## API 端点

| 分类 | 端点 | 方法 | 认证 |
|---|---|---|---|
| 健康 | `/api/health` `/api/db/ping` | GET | 公开 |
| 认证 | `/api/auth/register\|login\|logout` | POST | 公开 |
| 认证 | `/api/auth/me` | GET | Bearer |
| 认证 | `/api/auth/change-password` | POST | Bearer |
| 管理员 | `/api/admin/users` | GET | super_admin |
| 管理员 | `/api/admin/users/{id}` | GET/DELETE | super_admin |
| 管理员 | `/api/admin/users/{id}/status` | PATCH | super_admin |
| 管理员 | `/api/admin/users/{id}/vehicles` | GET | super_admin |
| 管理员 | `/api/admin/stats` | GET | super_admin |
| 项目 | `/api/projects` | GET/POST | Bearer |
| 项目 | `/api/projects/{id}` | GET/PATCH/DELETE | Bearer |
| 项目 | `/api/projects/{id}/maps` | GET | 公开 |
| 项目 | `/api/projects/{id}/maps/upload` | POST | Bearer |
| 项目 | `/api/projects/{pid}/maps/{mid}` | PATCH/DELETE | Bearer |
| 车辆 | `/api/vehicles` | GET/POST | Bearer |
| 车辆 | `/api/vehicles/{id}` | PATCH/DELETE | Bearer |
| 协议 | `/api/protocol/status\|command\|roc` | POST | 公开 |
| 协议 | `/api/protocol/pending/{robot_id}` | GET | 公开 |
| 实时 | `/ws/status` | WebSocket | — |

## 部署架构

- **单机部署**: `docker compose up -d` 一键启动
- **分离部署**: 前端/后端/数据库在不同服务器
- **混合部署**: 任意组合 local/docker 模式

详见 `scripts/config/deploy.env.example`。

## 用户角色

| 功能 | regular | super_admin |
|---|---|---|
| 登录/注册/修改密码 | ✓ | ✓ |
| 项目管理/地图/车辆 | ✓ | ✓ |
| 地图上传/路网编辑 | ✓ | ✓ |
| 性能监控 | ✓ | ✓ |
| 管理用户 | ✗ | ✓ |
| 系统统计 | ✗ | ✓ |
