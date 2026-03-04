# ROC-SYSTEM

机器人运营控制平台 (Robot Operation Control Platform)

## 📋 项目简介

ROC-SYSTEM 是一个现代化的机器人运营控制平台，提供完整的项目管理、地图管理、路径规划和性能监控功能。支持多种通信协议（ROS、ROC、JSON），可灵活对接各类机器人系统。

## ✨ 核心功能

- **用户认证系统** - 登录、注册、个人中心管理
- **项目管理** - 创建、删除、查看项目详情
- **地图管理** - 地图列表展示、激活状态管理
- **路径管理** - 路径可视化、路径创建和编辑
- **性能监控** - 机器人状态监控、CPU/内存/电量显示、定位置信度指标
- **协议支持** - ROS、ROC、JSON 多种通信协议

## 🏗️ 项目结构

```
ROC-SYSTEM/
├── docker/                  # Docker 部署文件
│   ├── backend/             # 后端 Docker 部署
│   ├── compose/             # 整体部署配置
│   ├── frontend/            # 前端 Docker 部署
│   └── postgres/            # PostgreSQL Docker 部署
├── postgres/                # PostgreSQL 数据库相关
│   └── init/                # 初始化脚本
├── roc-backend/             # C++ 后端代码
│   ├── config/              # 配置文件
│   ├── src/                 # 源代码
│   │   ├── controllers/     # 控制器
│   │   ├── middleware/      # 中间件
│   │   ├── models/          # 数据模型
│   │   ├── protocols/       # 协议层
│   │   ├── routes/          # 路由
│   │   ├── services/        # 业务逻辑
│   │   └── utils/           # 工具函数
│   └── tests/               # 测试
├── roc-frontend/            # React 前端代码
│   ├── src/
│   │   ├── components/      # React 组件
│   │   └── ...
│   └── ...
├── scripts/                 # 部署脚本与配置
│   ├── config/              # 部署配置单（deploy.env / secrets.env）
│   ├── lib/                 # 公共脚本库（common.sh）
│   ├── templates/           # Nginx 等模板文件
│   ├── deploy-frontend.sh               # 前端本地部署
│   ├── deploy-frontend-docker.sh        # 前端 Docker 部署
│   ├── deploy-backend.sh                # 后端本地部署（占位，待完善）
│   ├── deploy-backend-docker.sh         # 后端 Docker 部署
│   ├── deploy-postgres.sh               # PostgreSQL 本地部署
│   ├── deploy-postgres-docker.sh        # PostgreSQL Docker 部署
│   ├── deploy-gateway.sh                # 宿主机 Nginx 网关部署
│   ├── deploy-all.sh                    # 预留：整体本地部署
│   └── deploy-all-docker.sh             # 预留：整体 Docker 部署
└── README.md                # 本文件
```

## 🚀 快速开始

### 环境要求

- Node.js 18+
- PostgreSQL 16+
- Docker (可选)
- C++ 编译器 (GCC/Clang)

### 前端开发

```bash
cd roc-frontend
npm install
npm run dev
```

前端服务将在 http://localhost:3000 启动

### 后端开发

```bash
cd roc-backend
# 使用 CMake 构建
mkdir build && cd build
cmake ..
make
```

### 数据库部署

#### 使用 Docker

```bash
# 部署 PostgreSQL
bash scripts/deploy-postgres-docker.sh --all
```

#### 本地部署

```bash
# 安装并启动 PostgreSQL
bash scripts/deploy-postgres.sh --install
bash scripts/deploy-postgres.sh --start
bash scripts/deploy-postgres.sh --create
```

### Docker 部署

#### 前端 Docker 部署

```bash
bash scripts/deploy-frontend-docker.sh --all
```

#### 整体部署

```bash
# 使用 Docker Compose 部署所有服务
cd docker/compose
docker-compose up -d
```

## 🔧 技术栈

### 前端
- React 18+
- TypeScript
- Vite
- Tailwind CSS v4
- React Router
- Shadcn/ui

### 后端
- C++ / Drogon（HTTP 框架）
- PostgreSQL / libpqxx
- 初始后端 API：`/api/health`、`/api/db/ping`（用于服务与数据库连通性检查）
- 协议支持：ROS、ROC、JSON（协议层规划中）

### 部署
- Docker
- Nginx
- Docker Compose

## 📝 开发规范

- 提交信息使用清晰的描述
- 代码遵循项目代码风格
- 新功能需要添加测试

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

本项目为私有项目，仅供授权用户使用。

## 📞 联系方式

如有问题，请通过 GitHub Issues 联系。

