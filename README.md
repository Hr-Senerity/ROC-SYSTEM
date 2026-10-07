# ROC-SYSTEM

Robot Operation Control Platform — 机器人运营控制平台

**C++17 / Drogon REST + WebSocket 后端 · React 18 / TypeScript 前端 · PostgreSQL 数据层 · Docker Compose 部署**

当前发布候选为 **`v0.2.1-rc2`**，与独立 Vehicle 通信库采用相同完整版本号。兼容性仍以实际双方提交及五份机器合同 SHA-256 为准；本轮合同实现基线为 `a9c601d`，旧 `v0.2.1-rc1` 标签不包含该合同变更。版本准备不代表 GitHub Release 已发布，详情见 [CHANGELOG](CHANGELOG.rst)。

## 架构总览

```mermaid
graph TB
    subgraph Frontend["Frontend (React 18 + Vite)"]
        Workspace["Operations workspace"]
        BrowserWS["VehicleRealtimeProvider<br/>/ws/status"]
    end

    subgraph Gateway["Gateway (Nginx)"]
        NGX["Static serving + /api + /ws proxy"]
    end

    subgraph Backend["Backend (C++17 / Drogon)"]
        REST["Account REST controllers<br/>JWT authorization"]
        StatusWS["StatusWsController<br/>browser project subscriptions"]
        DeviceWS["DeviceWsController<br/>/ws/device"]
        Codec["DeviceProtocol v1<br/>JSON envelope validation"]
        StatusService["VehicleStatusService<br/>sequence + telemetry transaction"]
        DeployService["DeploymentService<br/>durable tasks + leases + events"]
        DBClient["PostgresClient<br/>libpqxx"]
    end

    subgraph Vehicle["Vehicle-side C++17 library (separate repository)"]
        Client["Device token · heartbeat · telemetry · task delivery · reconnect"]
    end

    subgraph Database["PostgreSQL 16"]
        Tables["users · registration_invites · projects · maps · vehicles<br/>resource revisions · deployment tasks/events"]
    end

    Workspace -->|"HTTP"| NGX
    BrowserWS -->|"WebSocket"| NGX
    Client -->|"WebSocket JSON"| NGX
    NGX --> REST
    NGX --> StatusWS
    NGX --> DeviceWS
    DeviceWS --> Codec --> StatusService --> DBClient --> Tables
    REST --> DBClient
    DeviceWS --> DeployService --> DBClient
    DeployService -->|"task.available"| DeviceWS
    StatusService -->|"committed vehicle event"| StatusWS --> BrowserWS
```

## 技术栈

| 层 | 技术 | 版本 | 用途 |
|---|---|---|---|
| 前端框架 | React + TypeScript | 18.3 / 5.9 | SPA 页面组件 |
| 构建工具 | Vite | 6.3.5 | 开发服务器 + 生产构建 |
| CSS | Tailwind CSS | v4 | 原子化样式 |
| UI 组件库 | shadcn/ui (Radix + Lucide) | — | 49 个可访问组件 |
| 图表 | Recharts | 2.15 | 性能监控图表 |
| 路由 | React Router DOM | v6 | 客户端路由 + 守卫 |
| 后端框架 | Drogon | v1 | 非阻塞 HTTP + WebSocket |
| 语言标准 | C++17 | — | 后端业务逻辑 |
| 数据库驱动 | libpqxx | v6 | PostgreSQL C++ 客户端 |
| JSON | jsoncpp | — | JSON 解析与序列化 |
| 加密 | OpenSSL | — | HMAC-SHA256 / SHA-256 |
| 数据库 | PostgreSQL | 16+ | 关系型数据库 |
| 容器化 | Docker + Compose | 3.9 | 三服务编排 |
| 网关 | Nginx | — | 静态服务 + 反向代理 |

## 项目结构

```
ROC-SYSTEM/
├── docker/
│   ├── backend/Dockerfile          # 多阶段 C++ 编译 (CMake + make)
│   ├── frontend/
│   │   ├── Dockerfile               # 多阶段 Node + Nginx 构建
│   │   └── nginx.conf               # SPA fallback + API/WS 代理
│   ├── postgres/Dockerfile          # PostgreSQL 运行镜像
│   └── compose/
│       ├── docker-compose.yml       # 开发/常规三服务编排
│       ├── docker-compose.release.yml # 运行机只加载已构建镜像
│       ├── .env.example             # 常规编排环境变量模板
│       └── release.env.example      # release 运行配置模板
├── postgres/
│   ├── init/init.sql                # 全新数据库完整 Schema
│   └── migrations/                  # 001–012 增量迁移
├── roc-backend/
│   ├── CMakeLists.txt               # C++17 · Drogon · libpqxx · OpenSSL · jsoncpp · yaml-cpp · zlib
│   ├── schemas/                     # OpenAPI 3.1 与三个 JSON Schema
│   ├── tests/                       # 协议、配置、图片、路网、邀请码及合同测试
│   └── src/
│       ├── main.cpp                 # 入口：配置加载 → 连接池 → 路由注册 → 启动
│       ├── config/
│       │   └── AppConfig.{h,cpp}    # HTTP/DB/JWT/设备/Origin 配置
│       ├── controllers/
│       │   ├── AuthController.{h,cpp}      # register · login · me · change-password · logout
│       │   ├── AdminController.{h,cpp}     # 用户、统计、角色与邀请码管理
│       │   ├── ProjectController.{h,cpp}   # 项目/地图 CRUD · 文件上传
│       │   ├── MapArtifactController.{h,cpp} # 不可变地图包与文件清单 API
│       │   ├── RoadNetworkController.{h,cpp} # 路网不可变版本 API
│       │   ├── VehicleController.{h,cpp}   # 车辆注册 · 状态更新 · 删除
│       │   ├── DeploymentController.{h,cpp} # 持久下发批次与设备任务 API
│       │   ├── StatusWsController.{h,cpp}  # 浏览器项目订阅 · 广播
│       │   └── DeviceWsController.{h,cpp}  # 设备鉴权 · 心跳 · 遥测
│       ├── middleware/
│       │   └── AuthMiddleware.{h,cpp}      # AuthFilter · SuperAdminFilter
│       ├── models/
│       │   └── User.h                      # 用户数据模型
│       ├── db/
│       │   ├── PostgresClient.{h,cpp}      # SQL 执行 (query/execute/insertReturning)
│       │   └── ConnectionPool.{h,cpp}      # 线程安全连接池 (4 连接)
│       ├── protocols/
│       │   ├── common/types.h              # RobotStatus 领域类型
│       │   └── DeviceProtocol.{h,cpp}       # JSON Device Protocol v1 编解码与校验
│       ├── services/
│       │   ├── DeploymentService.{h,cpp}    # 任务、租约、重试与事件流水
│       │   ├── RoadNetworkService.{h,cpp}   # road-network v1/v2 校验、规范化与采样
│       │   └── VehicleStatusService.{h,cpp} # sequence 与车辆快照原子持久化
│       └── utils/
│           ├── JwtHelper.{h,cpp}           # JWT 签发与验证 (HMAC-SHA256)
│           ├── PasswordHash.{h,cpp}        # 密码哈希 (SHA-256 + 随机盐)
│           ├── InvitationCode.{h,cpp}      # 密码学随机一次性邀请码
│           └── AuditLogger.h               # 审计日志工具
├── roc-frontend/
│   ├── e2e/road-network-editor.spec.ts     # 画布与键盘 Playwright 测试
│   ├── index.html
│   ├── package.json                        # React 18 · shadcn/ui · Recharts · Lucide
│   ├── vite.config.ts                      # API 代理 + Tailwind v4
│   └── src/
│       ├── main.tsx                        # React 入口
│       ├── App.tsx                         # AuthContext · Router · ProtectedRoute · SuperAdminRoute
│       ├── app/                            # 认证、布局和实时状态 Provider
│       ├── shared/
│       │   ├── api/                        # 统一 client/config/errors
│       │   ├── styles/                     # Tailwind 入口与设计变量
│       │   └── ui/                         # 公共页面状态和格式化组件
│       ├── features/                       # 项目、地图、车辆、路网、下发和邀请码模型
│       ├── types/
│       │   └── robot.ts                    # Robot · RobotPosition · RobotVelocity · PathNode
│       ├── guidelines/
│       │   └── Guidelines.md               # 前端开发指南
│       └── components/
│           ├── Home/Login/Register/Profile # 公开入口和账户页面
│           ├── Projects/Project*           # 项目、地图、车辆和设置页面
│           ├── MapDetailPage.tsx           # 统一 SVG 地图与实时车辆
│           ├── RoadNetworkEditorPage.tsx   # 路网编辑器装配页
│           ├── road-network-editor/        # 画布、图层、工具栏、面板及控制器
│           ├── *DeployDialog.tsx           # 地图/路网批量下发
│           ├── InvitationCodesPanel.tsx    # 超级管理员邀请码管理
│           ├── ProtocolsPage.tsx           # 页面文档指南
│           ├── SuperAdminPage.tsx          # 平台账户与统计
│           └── ui/                         # shadcn/ui 基础组件
├── scripts/
│   ├── deploy-all-docker.sh                # 一键 Docker Compose 编排
│   ├── deploy-all.sh                       # 一键本地部署编排
│   ├── build-release-bundle.sh             # 构建机生成可转移的镜像交付包
│   ├── deploy-backend-docker.sh            # 后端 Docker 构建部署
│   ├── deploy-backend.sh                   # 后端本地部署
│   ├── deploy-frontend-docker.sh           # 前端 Docker 构建部署
│   ├── deploy-frontend.sh                  # 前端本地部署
│   ├── deploy-release-runtime.sh           # 交付包内的运行机部署脚本
│   ├── deploy-postgres-docker.sh           # PostgreSQL Docker 部署
│   ├── deploy-postgres.sh                  # PostgreSQL 本地部署
│   ├── deploy-gateway.sh                   # Nginx 网关部署
│   ├── verify-deployment.sh                # HTTP/API/DB/WebSocket 部署验收
│   ├── simulator/
│   │   ├── virtual_vehicle.py              # JSON v1 虚拟车辆与制品交付客户端
│   │   ├── virtual-vehicle.env.example     # 单车非敏感运行配置样例
│   │   ├── requirements.txt                # 独立 Python venv 依赖
│   │   └── roc-virtual-vehicle@.service    # 多实例 systemd 服务模板
│   ├── lib/common.sh                       # Shell 公共函数库
│   ├── config/
│   │   ├── deploy.env.example              # 部署环境变量模板
│   │   └── secrets.env.example             # 密钥模板
│   └── templates/
│       └── nginx-site.conf.template        # Nginx 站点配置模板
├── .gitignore
├── CHANGELOG.rst                           # 变更日志 (Keep a Changelog)
└── README.md                               # 本文件
```

## 模块调用关系

### HTTP 请求生命周期

```
Browser → Nginx (static or proxy)
  → Drogon HttpAppFramework
    → CORS Preflight? → pass through
    → Route Match: /api/auth/* /api/admin/* /api/projects/* /api/vehicles/*
    → Middleware (optional):
        AuthFilter          → JWT Bearer token 校验 → 注入 user_id/username/role 到 request attributes
        SuperAdminFilter    → JWT + role == "super_admin" 校验
    → Controller Handler (lambda)
        → PostgresClient (new connection or pool)
            → libpqxx → PostgreSQL
        → Response (JSON)
    → Client
```

**路由注册模式**：所有路由函数在 `main.cpp` 中以独立函数调用注册（非 Drogon 注解方式），格式为 `roc::controller::registerXxxRoutes(cfg, connStr)`。

### WebSocket 实时推送链

```
Vehicle C++17 client
  → GET /ws/device + Authorization: Device <per-vehicle token>
    → DeviceWsController maps token to vehicle identity
      → DeviceProtocol validates JSON v1 envelope and sequence
        → VehicleStatusService atomically persists heartbeat/telemetry + sequence
          → StatusWsController broadcasts only the committed vehicle snapshot
            → authenticated /ws/status project subscribers
              → VehicleRealtimeProvider merges versioned events
```

### JSON Device Protocol v1

- 车辆只通过 `/ws/device` 上报，不再轮询任务或调用旧协议 HTTP 入口。
- 每条消息包含 `protocol_version`、UUID `message_id`、`type`、十进制字符串 `sequence`、RFC 3339 `timestamp` 和对象 `payload`。`sequence` 的机器合同为无前导零的正 INT64，即 `1..9223372036854775807`；使用字符串是为了避免 JavaScript 等环境丢失 64 位整数精度。
- 车辆身份只从 WebSocket 握手头 `Authorization: Device <token>` 映射；正文中的 `vehicle_id`/`robot_id` 会被拒绝。
- 当前上行类型为 `heartbeat` 和 `telemetry`。建议 30 秒心跳，45 秒无有效消息关闭连接；全局硬上限 64 KiB，heartbeat 最大 4 KiB，telemetry 最大 16 KiB。
- 最后设备 sequence 与遥测在同一数据库更新中提交；重复 sequence 返回幂等确认，不重复写入或广播。
- ROC 二进制、`/api/protocol/status`、`/api/protocol/command`、`/api/protocol/roc` 和 `/api/protocol/pending/{robot_id}` 已删除。
- 服务端通过此常连接发送 `task.available` 通知；耐久任务和大文件仍通过 HTTP(S) 接受和下载，不在 WebSocket 传输大文件。
- 下行 `hello`、`ack`、`error` 与 `task.available` 已有机器可读 Schema。服务端 envelope 为封闭结构，不允许新增顶层字段；各消息 payload 固定必填字段但允许向后兼容的可选扩展，客户端必须忽略不认识的 payload 字段。
- REST API 的 OpenAPI 3.1 合同位于 `roc-backend/schemas/openapi-v1.json`；设备通信、路网和下发任务的 JSON Schema 位于同目录的 `device-protocol-v1.schema.json`、`road-network-v1.schema.json`、`road-network-v2.schema.json` 与 `deployment-task-v1.schema.json`。路网 v1 保持只读兼容，新编辑和保存统一生成 v2。
### 前端路由守卫

```
App.tsx → AuthContext (JWT token / role / username → localStorage)
  ├── / · /login · /register · /guide              → 公开路由
  ├── /profile · /projects · /protocols · …         → ProtectedRoute (isLoggedIn)
  └── /admin/users                                    → SuperAdminRoute (isLoggedIn + role=="super_admin")
```

## 数据流

### 认证流

```
Register
  → POST /api/auth/register { username, email, password, invitation_code }
    → 事务锁定一次性邀请码 → 创建 regular 账户 → 标记邀请码已使用
Login
  → POST /api/auth/login { username, password }
    → 密码哈希: SHA-256(password + 16-byte random salt)
    → JWT 签发: HMAC-SHA256(header.payload, JWT_SECRET)
    → 返回 { token, user: { user_id, username, role } }
  → 前端: localStorage 存储 roc_token / roc_role / roc_username
  → 后续请求: Authorization: Bearer <token>
  → 后端 AuthFilter: 验证 → 注入 user_id/username/role 到 request attributes
```

### 实时状态流

```
Vehicle opens /ws/device with a per-vehicle Device token
  → server derives vehicle identity from the token hash
    → heartbeat / telemetry JSON v1 message
      → protocol, field, size and monotonic sequence validation
        → database atomically updates snapshot + telemetry_version + device_last_sequence
          → project-scoped /ws/status event after commit
            → frontend merges by version; REST polling remains browser fallback
```
### 路网编辑与版本流

```
地图资源 → /projects/{pid}/maps/{mid}/edit
  → 选择 / 平移 / 新增节点 / 直线或三次贝塞尔连边 / 拖动控制柄 / 删除
  → 设置确定性采样间距 + 前端结构校验 + 撤销/重做 + 未保存提示
  → POST road-network/revisions
    → 后端重新校验 schema、坐标模式、ID、引用、自环、重复边、曲线、限速与容量上限
    → 按 uniform-parameter-v1 生成每个通行方向的有序轨迹点
    → 节点/边按 ID 规范化排序，轨迹点固定 6 位精度 → SHA-256
    → road_network_revisions 追加不可变版本
  → 历史版本可读取为新草稿；再次保存始终产生新版本
  → 编辑 JSON 与轨迹 CSV 均由该不可变 revision 导出
```

监控页保持只读并读取地图的最新兼容快照；编辑器不会后台自动保存。只有已持久化版本才能在后续路网下发流程中作为资源引用。

v2 采样间距在采样前统一到 6 位小数：米制范围为 `0.000001..100`，旧归一化模式为 `0.000001..1`，规范化结果再次保存保持相同轨迹与 SHA-256。节点/边 ID 必须唯一，边端点必须存在且不得自环；双向边占用两个有向连接，不允许叠加同方向边，但两条相反的单向边可以共存。空路网可保存为草稿，坐标必须有限且与所属地图模式一致，不强制裁剪至图片范围。

### 路网版本下发流

```
已保存路网版本 → 编辑器“下发 vN”
  → 仅列出绑定当前地图的车辆，并显示在线状态、Device token 资格和已送达版本
  → 用户显式选择车辆 → 二次确认版本与目标数量
  → POST /api/projects/{pid}/deployments
    → 每辆车创建独立持久任务；离线车辆保持 queued（等待车辆上线）
  → 对话框每 3 秒使用批次 GET 接口读取权威状态
    → 展示已通知、已接单、下载中、交付处理中、已送达、失败、取消或过期
  → 可取消尚未进入最终交付阶段的任务；失败/取消/过期车辆可按原版本创建新批次重试
```

创建成功只代表“任务已创建”。road-network v2 artifact 同时含语义拓扑、`line`/`cubic_bezier` 曲线定义以及服务器持久化的确定性 `trajectories[].points`；双向边生成 forward/reverse 两条轨迹。只有车端经 Device token + 租约下载、校验并明确回报 `delivered`，界面才显示“已送达”；该状态不表示车辆已加载或应用路网。当前批次 ID 写入编辑页查询参数，浏览器刷新后可恢复逐车状态。存在未保存草稿时，下发入口禁用，避免草稿与不可变版本混淆。

### 地图制品上传与下发流

```
multipart/form-data 选择三种入口：
  ├── 普通 PNG/JPEG（旧版归一化坐标）
  ├── PNG/JPEG + 人工 resolution/origin/yaw（米制坐标）
  └── 成对 PGM+YAML（含 Cartographer 导出的标准 PGM+YAML，自动读取米制参数）
  → 后端校验图片签名或 P2/P5 PGM、YAML 路径/原点/阈值/有限数/像素上限
  → PGM 安全生成 PNG 浏览器预览，并保留原始 PGM、YAML 及各自 SHA-256
  → 所有文件先写临时文件再原子移动
  → 同一事务创建 maps、map_artifacts package v2 和 map_artifact_files
    → 图片包保存一个原始 PNG/JPEG 文件
    → PGM+YAML 包保存原始 PGM 与原始 YAML 两个文件；PNG 仅用于浏览器预览
    → 记录来源类型、地图格式、坐标模式、像素尺寸、resolution、origin、逐文件 MIME/字节数/SHA-256 与包摘要
  → 地图卡片“下发地图” → 选择项目车辆并二次确认
  → 复用持久部署批次、Device token、租约、manifest 和制品下载接口
  → manifest files[] 为每个文件提供独立 file_id / URL / MIME / 大小 / SHA-256
  → 车端逐文件校验并保存或交给受控本地适配器
  → 仅在车端回报 delivered 后更新 delivered_map_artifact_id
```

旧地图可通过制品接口将当前受保护原图幂等固化为单文件 package v2；同一包摘要重复调用保持幂等。PGM+YAML 的车端资源包是原始双文件，派生 PNG 只用于浏览器预览。地图删除会同时清理未被引用的路网版本、包/文件元数据、预览图和原始来源文件；一旦版本进入部署历史或被车辆确认为已送达，删除返回 409，以免破坏审计链。平台不声称车辆已加载或应用地图。

### 地图可视化 — 统一 SVG 坐标空间

```

容器尺寸 → ResizeObserver → 矩形 viewport
地图元数据 → worldToMap() → 图片像素坐标
fitScale + zoom + pan → 单一 SVG <g transform>
  ├── 鉴权加载的地图 <image>
  ├── road_network 直线/三次贝塞尔曲线 <path>
  └── 当前地图车辆标记与方向

交互:
  - 光标锚定缩放、pointer capture 平移、适应视图和专注模式
  - 桌面三栏显示车辆列表/地图/详情；窄屏使用车辆选择器和详情浮层
  - 选中状态保存 vehicle ID，详情持续从实时 store 派生
  - 导出规范编辑 JSON，或与设备 artifact 逐点一致的轨迹 CSV
```

## 数据库 Schema

```mermaid
graph TB
    subgraph Frontend["Frontend (React 18 + Vite)"]
        Workspace["Operations workspace"]
        BrowserWS["VehicleRealtimeProvider<br/>/ws/status"]
    end

    subgraph Gateway["Gateway (Nginx)"]
        NGX["Static serving + /api + /ws proxy"]
    end

    subgraph Backend["Backend (C++17 / Drogon)"]
        REST["Account REST controllers<br/>JWT authorization"]
        StatusWS["StatusWsController<br/>browser project subscriptions"]
        DeviceWS["DeviceWsController<br/>/ws/device"]
        Codec["DeviceProtocol v1<br/>JSON envelope validation"]
        StatusService["VehicleStatusService<br/>sequence + telemetry transaction"]
        DeployService["DeploymentService<br/>durable tasks + leases + events"]
        DBClient["PostgresClient<br/>libpqxx"]
    end

    subgraph Vehicle["Vehicle-side C++17 library (separate repository)"]
        Client["Device token · heartbeat · telemetry · task delivery · reconnect"]
    end

    subgraph Database["PostgreSQL 16"]
        Tables["users · registration_invites · projects · maps · vehicles<br/>resource revisions · deployment tasks/events"]
    end

    Workspace -->|"HTTP"| NGX
    BrowserWS -->|"WebSocket"| NGX
    Client -->|"WebSocket JSON"| NGX
    NGX --> REST
    NGX --> StatusWS
    NGX --> DeviceWS
    DeviceWS --> Codec --> StatusService --> DBClient --> Tables
    REST --> DBClient
    DeviceWS --> DeployService --> DBClient
    DeployService -->|"task.available"| DeviceWS
    StatusService -->|"committed vehicle event"| StatusWS --> BrowserWS
```

## API 端点

### 健康检查

| 端点 | Method | 认证 | 说明 |
|---|---|---|---|
| `/api/health` | GET | 公开 | 服务存活检查 |
| `/api/db/ping` | GET | 公开 | 数据库连接检查 |

### 认证 (Auth)

| 端点 | Method | 认证 | 说明 |
|---|---|---|---|
| `/api/auth/register` | POST | 邀请码 | 使用有效的一次性 5 位邀请码注册普通用户并返回 JWT |
| `/api/auth/login` | POST | 公开 | 用户登录，返回 JWT |
| `/api/auth/logout` | POST | 公开 | 登出 (客户端丢弃 token) |
| `/api/auth/me` | GET | Bearer | 获取当前用户信息 |
| `/api/auth/change-password` | POST | Bearer | 修改密码 |

### 管理 (Admin) — 需要 super_admin

| 端点 | Method | 认证 | 说明 |
|---|---|---|---|
| `/api/admin/users` | GET | super_admin | 用户列表 (分页/搜索/筛选) |
| `/api/admin/users/{id}` | GET | super_admin | 用户详情 |
| `/api/admin/users/{id}` | DELETE | super_admin | 删除用户 |
| `/api/admin/users/{id}/status` | PATCH | super_admin | 启用/停用用户 |
| `/api/admin/users/{id}/vehicles` | GET | super_admin | 用户的车辆列表 |
| `/api/admin/invitation-codes` | GET | super_admin | 按 `page`、`limit`、`status` 分页查看邀请码、总数及使用/撤销状态 |
| `/api/admin/invitation-codes` | POST | super_admin | 随机生成 5 位数字与大写字母一次性邀请码 |
| `/api/admin/invitation-codes/{id}` | DELETE | super_admin | 撤销尚未使用的邀请码 |
| `/api/admin/stats` | GET | super_admin | 系统统计数据 |

### 项目 (Projects)

| 端点 | Method | 认证 | 说明 |
|---|---|---|---|
| `/api/projects` | GET | Bearer | 用户项目列表 |
| `/api/projects` | POST | Bearer | 创建项目 |
| `/api/projects/{id}` | GET | Bearer | 项目详情 |
| `/api/projects/{id}` | PATCH | Bearer | 更新项目 |
| `/api/projects/{id}` | DELETE | Bearer | 无交付历史时解除车辆地图绑定并级联删除项目资源；有部署或车辆交付引用时返回 409 |
| `/api/projects/{id}/maps` | GET | Bearer | 已授权项目的地图列表 |
| `/api/projects/{pid}/maps/{mid}` | GET | Bearer | 读取单张地图及坐标元数据 |
| `/api/projects/{pid}/maps/{mid}/image` | GET | Bearer | 校验项目归属后读取地图图片；不提供匿名 `/static` 回退 |
| `/api/projects/{id}/maps/upload` | POST | Bearer | `multipart/form-data` 导入普通/人工标定 PNG/JPEG，或成对 PGM+YAML；Cartographer 先输出 PGM+YAML 后复用同一入口；自动创建不可变地图包 v2 |
| `/api/projects/{pid}/default-map` | PUT | Bearer | 原子设置项目默认地图 |
| `/api/projects/{pid}/maps/{mid}` | PATCH | Bearer | 更新地图信息 |
| `/api/projects/{pid}/maps/{mid}` | DELETE | Bearer | 删除无车辆绑定且无交付历史的地图，并清理未引用制品文件 |
| `/api/projects/{pid}/maps/{mid}/artifacts` | GET | Bearer | 列出不可变地图包版本、格式、坐标、文件数和当前版本 |
| `/api/projects/{pid}/maps/{mid}/artifacts` | POST | Bearer | 将旧地图当前原图幂等固化为单文件 package v2 |
| `/api/projects/{pid}/maps/{mid}/road-network/revisions` | GET | Bearer | 列出不可变路网版本及当前最新版本 |
| `/api/projects/{pid}/maps/{mid}/road-network/revisions` | POST | Bearer | 校验语义拓扑/曲线，生成确定性轨迹并创建不可变 road-network v2 |
| `/api/projects/{pid}/maps/{mid}/road-network/revisions/{rid}` | GET | Bearer | 读取指定版本元数据和规范化路网正文 |
| `/api/projects/{pid}/maps/{mid}/road-network/revisions/{rid}/export/editor.json` | GET | Bearer | 导出规范化语义拓扑、曲线和持久化采样 JSON |
| `/api/projects/{pid}/maps/{mid}/road-network/revisions/{rid}/export/trajectory.csv` | GET | Bearer | 导出与设备 artifact 逐点一致的确定性轨迹 CSV |

### 车辆 (Vehicles)

| 端点 | Method | 认证 | 说明 |
|---|---|---|---|
| `/api/vehicles?project_id={pid}` | GET | Bearer | 按已授权项目过滤车辆；无参数时返回当前主体可见车辆 |
| `/api/vehicles` | POST | Bearer | 注册车辆并校验项目/地图归属 |
| `/api/vehicles/{id}` | PATCH | Bearer | 更新车辆信息、状态/指标和项目地图绑定 |
| `/api/vehicles/{id}` | DELETE | Bearer | 删除车辆 |
| `/api/vehicles/{id}/device-token` | GET | Bearer | 查看设备凭据配置状态和尾号 |
| `/api/vehicles/{id}/device-token` | POST | Bearer | 生成或轮换单车凭据；明文仅返回一次 |
| `/api/vehicles/{id}/device-token` | DELETE | Bearer | 撤销单车凭据 |

### 设备通信 (JSON Device Protocol v1)

| 端点 | 协议 | 认证 | 说明 |
|---|---|---|---|
| `/ws/device` | WebSocket JSON | `Authorization: Device <token>` 握手头 | 单车心跳与完整遥测；身份由 token 映射，持久 sequence 去重，断线自动标记离线 |

设备上行消息使用统一 JSON envelope，当前接受 `heartbeat` 和 `telemetry`；单条最大 64 KiB。服务端 `hello` 返回车辆 ID、30 秒心跳建议、45 秒空闲超时、大小限制和已持久化的最后客户端 sequence。持久任务以服务端 `task.available` envelope 通知，车辆不轮询；旧 ROC、status、command 和 pending 接口均不再注册。

#### Python 虚拟车辆

`scripts/simulator/virtual_vehicle.py` 可用于 Demo 和接口联调。一个进程只模拟一辆已注册且已签发 Device token 的车辆：建立 `/ws/device`、根据服务端 `hello` 延续持久 sequence、周期发送心跳和运动遥测，并通过设备 HTTP 接口接受、校验和原子保存地图/路网制品。它不会轮询任务，也不会把 Device token、任务租约或授权头写入日志。

推荐在服务器使用独立 venv 和受限 systemd 用户运行。把 `virtual-vehicle.env.example` 复制到 `/etc/roc-virtual-vehicle/<实例>.env`，把明文 Device token 单独写入配置指定的 `0600/0640` 文件；状态和制品目录使用 `/var/lib/roc-virtual-vehicle/<实例>/`。当前同机 Demo 的 `ROC_SERVER_URL` 可设为 `http://127.0.0.1:3000`，生产切换到可信 HTTPS 域名后脚本会自动使用 WSS，并默认执行证书校验。

```bash
python3 -m venv /opt/roc-virtual-vehicle/.venv
/opt/roc-virtual-vehicle/.venv/bin/pip install -r scripts/simulator/requirements.txt

# 配置与 Device token 准备完毕后
systemctl enable --now roc-virtual-vehicle@vehicle-01
journalctl -u roc-virtual-vehicle@vehicle-01 -f
```

虚拟车完整下载 artifact 后会同时校验 manifest 字节数、MIME、响应 `X-Content-SHA256` 和本地 SHA-256。只有 `.part` 文件完成刷盘并原子改名后才回报 `delivered`；校验或磁盘写入失败只回报 `failed`。`delivered` 仍只表示文件已送达模拟车辆，不表示地图已加载或路网已执行。

### 持久设备任务 (Durable deployment tasks)

| 端点 | Method | 认证 | 说明 |
|---|---|---|---|
| `/api/projects/{project_id}/deployments` | POST | Bearer | 以不可变资源版本、目标车辆和幂等键创建逐车任务批次 |
| `/api/projects/{project_id}/deployments/{batch_id}` | GET | Bearer | 查询批次及逐车任务状态 |
| `/api/projects/{project_id}/deployments/{batch_id}/cancel` | POST | Bearer | 取消排队、已通知、已接受或下载中的任务 |
| `/api/device/tasks/{task_id}/accept` | POST | Device | 接受本车任务并取得 30 分钟租约；重复接受返回同一租约 |
| `/api/device/tasks/{task_id}/manifest` | GET | Device + `X-Task-Lease` | 获取资源版本、类型、包/采样元数据、大小、SHA-256 和下载地址 |
| `/api/device/tasks/{task_id}/artifact` | GET | Device + `X-Task-Lease` | 完整下载路网 JSON 或兼容单文件制品；不支持 Range |
| `/api/device/tasks/{task_id}/artifact/{file_id}` | GET | Device + `X-Task-Lease` | 下载 map package v2 中 manifest 指定的单个原始文件；逐文件返回 MIME、大小和 SHA-256 |
| `/api/device/tasks/{task_id}/status` | POST | Device + `X-Task-Lease` | 以唯一 `event_id` 幂等回报下载、交付、完成或失败状态 |

任务主状态流为 `queued → offered → accepted → downloading → delivering → delivered`，活动状态也可进入 `failed`。新租约只能从 `offered` 接受；首次成功接受后 `attempt=1`，每次租约超时重新投递并再次接受时加一，有效租约的重复 accept 只返回同一租约且不增加 attempt。`progress` 属于整个 task，不因重试清零，后续 attempt 只能从已持久化进度继续单调上报；旧租约在重新投递或签发新租约后不能读取制品或推进状态。

状态请求受条件 Schema 和同源后端校验约束：`delivered` 的 `progress` 必须为 100，`failed` 必须提供非空且不超过 64 字符的 `error_code`，未知字段会被拒绝。`event_id` 是持久幂等键：服务端通过迁移 `012_deployment_event_replay.sql` 保存规范化正文、SHA-256、原 attempt、原租约摘要和到期时间；只有“相同 event_id + 相同规范化正文 + 原租约”才返回 `replayed=true`。该精确重放可在任务已终态、租约已过期或后端重启后确认成功，但不会再次写事件、更新车辆交付指针或推进状态；相同 ID 改正文返回 `event_conflict`，改用其他租约返回 `invalid_lease`。UUID 大小写统一为小写，可选的空错误字段与省略字段视为同一规范化正文；迁移前缺少重放证据的历史事件返回 `event_conflict`，不会被猜测为成功。重放响应中的 `task` 是当前任务快照，不一定仍处于被重放事件的原状态或 attempt。

车辆重连时服务端补发 `offered` 任务；租约超时会按阶段与尝试次数重新投递或失败。车端必须在完整下载后核对字节数、MIME 和 SHA-256；地图包须逐文件校验，路网 v2 须保留平台点序且不得自行重采样替换。截断、类型、哈希或样本不匹配时必须回报 `failed`，不得回报 `delivered`。`delivered` 仅表示车端已校验并保存/交给本地适配器，不表示车辆已加载或应用地图。机器可读状态机契约位于 `roc-backend/schemas/deployment-task-v1.schema.json`。

### Vehicle 合同交接：固定版本

本轮不引入设备能力清单、动态协商、任务版本筛选或自动降级。独立 Vehicle 库严格实现本次 SYSTEM 合同：Device Protocol **v1**、map package **v2**、road-network **v2**，保留历史 road-network v1 的读取兼容。

| 范围 | Vehicle 必须遵循 |
| --- | --- |
| 身份 | HTTP/WS 使用 `Authorization: Device <token>`；Token 唯一映射车辆。车辆 ID 从 hello 获取，上行不重复声明身份。 |
| 消息 | sequence 为 `1..9223372036854775807` 的无前导零字符串，持久化递增；服务端 sequence 不是跨重启去重键。上行只发 heartbeat/telemetry，下行 envelope 封闭、payload 允许忽略新增字段。 |
| 地图 | 按 `files[]` 的 file ID URL 获取全部原始文件，逐文件核对 MIME/字节数/SHA-256；PGM+YAML 不以预览 PNG 替代。保存坐标模式、resolution 和 origin。 |
| 包摘要 | `roc-file-set-v1`：按 role 字典序排列 `role:文件sha256`，以 LF 连接且无末尾 LF，再计算 UTF-8 SHA-256；包大小为各文件字节数之和。 |
| 路网 | 校验 schema、ID 唯一、端点、自环和有向连接；v2 保留曲线和有序 samples，不自行重采样替换。坐标模式与单位必须保留。 |
| 点列 | 单轨迹最多 10,000 点、总计最多 200,000 点；index 从 0 连续，首尾对应方向端点，s 从 0 单调且最后 s 等于 length；全部数值有限。CSV 不要求车端解析。 |
| 任务 | 新 offered 接单才增加 attempt；同 task 重排，progress 跨 attempt 单调。delivered=100；failed 有非空 error_code；下载和新状态请求必须使用活动 lease。 |
| 恢复 | 发送前持久化 event_id、完整正文和原 lease；响应丢失或进程重启后先精确重放，不先 accept。已提交事件即使原 lease 过期仍可确认；未知终态遇到拒绝时进入 reconciliation，不创建替代事件或擅自重新交付。 |
| 错误 | 控制流只读 HTTP 状态和 `code`，不匹配 message 文案。未知协议/资源版本必须拒绝，不假装兼容或报 delivered。 |

SYSTEM Python 模拟器仅用于合同与故障验收，不替代 C++17 Vehicle 库。模拟器支持地图多文件、路网 v1/v2、原子状态文件及持久 outbox；状态目录 0700、状态/文件 0600。其 Outbox 含临时 lease，必须按凭据保护；终态确认后移除 lease。旧模拟器遗留的未确认交付不能凭状态名推定成功，需核对平台事实或使用新的测试任务。

交接以固定 Git commit、`contracts/` 中的 OpenAPI/Schema 和 `SHA256SUMS` 为准；运行实例先完成下述迁移与升级后，Vehicle 才使用这份新合同。Vehicle 适配不阻塞 SYSTEM 自身验收，双方真实 C++ 客户端联调另记结果。

设备任务成功响应不再引用通用 `JsonSuccess`：accept 固定返回 `ok`、`replayed`、`lease_token`、`lease_expires_at` 和 `task`，status 固定返回 `ok`、`replayed`、`project_id` 和 `task`。失败响应统一为 `{ "ok": false, "code": "...", "message": "..." }`，且一个错误码只属于一个 HTTP 状态：

| HTTP | 固定错误码 |
| --- | --- |
| 400 | `invalid_id`、`invalid_json`、`unknown_field`、`invalid_status_state`、`invalid_progress`、`invalid_error_code`、`invalid_error_message`、`error_code_required` |
| 401 | `authentication_failed`、`invalid_lease` |
| 404 | `task_not_found`、`artifact_not_found` |
| 409 | `invalid_state`、`lease_expired`、`lease_conflict`、`attempts_exhausted`、`event_conflict`、`invalid_transition`、`file_id_required` |
| 416 | `range_not_supported` |
| 500 | `internal_error` |

车端应根据 HTTP 状态和 `code` 决策，不应解析可能调整措辞的 `message`。accept、manifest、artifact、artifact file 与 status 的允许状态集合及专用响应 Schema 均由 `openapi-v1.json` 固定。

路网 v1/v2 Schema 的 `x-roc-semantic-rules` 同步冻结 JSON Schema 无法单独表达的跨字段规则：节点与边 ID 唯一、端点必须存在、禁止自环、每个有向连接只能由一条边占用；双向边同时占用两个方向，而两条方向相反的单向边允许共存。空路网可作为草稿保存，坐标要求为有限数且模式与地图一致，但平台不额外把坐标裁剪到画布范围。v2 的输入轨迹不具权威性，保存时由 SYSTEM 按排序后的拓扑和曲线重新生成；点索引从 0 连续、首尾对应有向端点、累计距离单调，`length` 等于末点距离。

### 浏览器实时通信 (WebSocket)

| 端点 | 协议 | 说明 |
|---|---|---|
| `/ws/status` | WebSocket JSON | 首帧发送 `{type:"authenticate",token:"<JWT>"}`，认证后以 `{type:"subscribe",project_id:"<UUID>"}` 订阅有权限的项目；断线自动重连并由 REST 轮询兜底 |

服务端连接后先发送 `hello`。浏览器须在 5 秒内完成账户 JWT 认证；认证后可发送 `subscribe`、`unsubscribe` 和 `ping`。订阅成功返回项目 `snapshot`，后续事件包括车辆事件、`deployment_created`、`deployment_updated`、`deployment_task_updated`、`pong` 和结构化 `error`。账户 JWT 与 Device token 不得互换。
## 部署架构

### Docker Compose 三服务拓扑

```
┌──────────────────────────────────────────────────────┐
│                   roc-net (bridge)                    │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  postgres    │  │   backend    │  │ frontend  │  │
│  │  :5432       │  │   :8080      │  │  :80      │  │
│  │  health:     │  │   depends_on:│  │ depends_on:│  │
│  │   pg_isready │  │   postgres   │  │  backend   │  │
│  └──────────────┘  │   (healthy)  │  │  (healthy) │  │
│                    │  health:     │  │ health:    │  │
│                    │   /api/db/   │  │  proxy     │  │
│                    │   ping       │  │  /api/health│ │
│                    └──────────────┘                  │
└──────────────────────────────────────────────────────┘
          Port Mapping (host → container):
          postgres:  ${POSTGRES_DOCKER_HOST_PORT:-5432} → 5432
          backend:   ${BACKEND_DOCKER_HOST_PORT:-8080}  → 8080
          frontend:  ${FRONTEND_DOCKER_HOST_PORT:-3000} → 80
```

**网络隔离**: 三服务通过 `roc-net` bridge 网络内部互通，仅映射配置中明确启用的主机端口。`backend` 等待 PostgreSQL 健康后启动，`frontend` 再等待后端 `/api/db/ping` 通过；`postgres` 初始化脚本创建 schema，但不会创建带固定密码的默认管理员。

### 分离部署

支持独立部署场景：前端/后端/数据库可分布在不同服务器。后端通过 `deploy.env` 读取 `DB_HOST` 等数据库连接参数；前端保持浏览器同源 `/api` 与 `/ws`，Nginx 在启动时用 `FRONTEND_BACKEND_UPSTREAM` 选择后端上游。后端容器将 `BACKEND_MAP_VOLUME` 持久挂载到 `/app/static`，避免重建容器丢失地图原图。部署脚本同时兼容 `docker compose` 与 `docker-compose`，并在返回前等待容器健康。

后端到 PostgreSQL 使用原生 TCP/TLS，而不是 HTTPS。当前 Demo 可使用 `DB_SSLMODE=disable`；生产环境应优先使用数据库域名并配置 `DB_SSLMODE=verify-full` 与 `DB_SSLROOTCERT=/run/secrets/roc-db/root.crt`。如数据库要求双向 TLS，再同时配置 `DB_SSLCERT` 与 `DB_SSLKEY`。独立后端 Docker 部署把宿主机 `DB_SSL_CERT_DIR` 只读挂载到 `/run/secrets/roc-db`；Compose 部署则从 `docker/compose/certs/postgres/` 读取，真实证书不会提交到 Git。

数据库定时备份、云快照和恢复编排由部署平台负责，不包含在本仓库的一键脚本中。交付时至少应把 PostgreSQL 数据卷和后端 `MAP_STORAGE_DIR`（原始地图制品）纳入同一恢复点，并定期在目标环境验证可恢复性。

## 快速开始

### 环境要求

- Node.js 20+
- PostgreSQL 16+
- Docker & Docker Compose
- C++ 编译器 (GCC/Clang) + CMake 3.16+

### 开发/构建机 Docker Compose 部署

```bash
cp docker/compose/.env.example docker/compose/.env
# 编辑 .env 修改密码等配置
bash scripts/deploy-all-docker.sh --up
bash scripts/verify-deployment.sh
```

这一路径包含 Docker 镜像构建，只能在开发机或具备足够 CPU、内存和 Docker namespace 权限的构建机执行。资源受限的运行主机不得执行 `deploy-all-docker.sh --up`、`docker compose --build` 或 `docker build`。

`verify-deployment.sh` 默认验证本机对外地址；分离网关或公网域名可通过 `VERIFY_BASE_URL=https://example.com` 指定。它会检查首页、后端健康、数据库连通与 WebSocket Upgrade。

数据库迁移 `009_registration_invites.sql` 完成后，已有 `super_admin` 可在“平台账户 → 注册邀请码”生成一次性邀请码。全新空数据库仍不会创建固定管理员、口令或固定邀请码；数据库运维人员应临时插入一个自选的 5 位大写字母数字 bootstrap 邀请码（必须同时包含数字和字母），完成首个账户注册后把该账户提升为 `super_admin`。后续邀请码全部由后台生成，不要在仓库或部署脚本中保存 bootstrap 邀请码或初始管理员密码。

`v0.2.1-rc1` 已于 2026-09-24 完成主服务器人工验收：有效邀请码首次注册成功，同一邀请码重复使用被拒绝，已撤销邀请码被拒绝，验收临时账户随后已清理。该结果验证串行业务行为；两个并发注册请求争用同一码时最多一个成功，仍必须由数据库/API 集成测试单独覆盖。

```sql
-- 仅限全新空数据库首次引导；把占位符替换为临时随机码，不要提交该值。
INSERT INTO registration_invites (code) VALUES ('<5位数字字母码>');
-- 注册完成后精确提升目标账户：
UPDATE users SET role = 'super_admin' WHERE username = '<operator>';
```

### 构建机到运行主机的 release 交付

生产或资源受限主机采用“构建机产出、运行机加载”的两阶段流程。交付单位是包含三个已构建 Docker 镜像的 release bundle，不直接复制动态链接的后端二进制，也不把源码或编译工具带到运行主机。

在 Linux x86_64 构建机的已审批 commit/tag 检出上执行；完整版本必须与前端 `package.json` 一致，去掉预发布后缀的基础版本必须与后端 CMake 项目版本一致：

```bash
bash scripts/build-release-bundle.sh v0.2.1-rc2
# 中国大陆构建机可按需使用：
# APT_MIRROR=tsinghua NPM_MIRROR=npmmirror bash scripts/build-release-bundle.sh v0.2.1-rc2
```

构建脚本会在 Docker builder 中运行后端 CTest、前端 typecheck/生产构建、lint/Vitest 和 Playwright 画布/键盘门禁，然后生成：

```text
release-output/roc-system-v0.2.1-rc2-amd64.bundle.tar
release-output/roc-system-v0.2.1-rc2-amd64.bundle.tar.sha256
```

交付包同时包含版本化的 `migrations/` SQL、README/CHANGELOG、`contracts/` OpenAPI/Schema 快照及其 `SHA256SUMS`；精确源码 commit 记录在 `RELEASE-MANIFEST.txt`。将两个文件传到运行主机；传输方式可使用 SSH/SCP、内网对象存储或人工上传。运行主机只需要 Docker、Docker Compose v2、`tar`、`gzip` 和 `sha256sum`：

```bash
sha256sum -c roc-system-v0.2.1-rc2-amd64.bundle.tar.sha256
mkdir -p roc-system-v0.2.1-rc2
tar -xf roc-system-v0.2.1-rc2-amd64.bundle.tar -C roc-system-v0.2.1-rc2
cd roc-system-v0.2.1-rc2
bash deploy.sh --prepare
# 编辑 release.env，填写 DB_PASSWORD、JWT_SECRET、Origin 和端口
# 已有数据库先按以下顺序迁移；--install 不自动迁移旧数据。
bash deploy.sh --install
```

`deploy.sh --install` 会校验运行主机 CPU 架构、内部镜像包和 manifest，执行 `docker load`，再以 `--no-build --pull never` 启动三个服务。release Compose 没有 `build:` 和源码挂载，因此不会在运行主机编译或访问镜像仓库。首次从旧 Compose 迁移时，如同名的 `roc-frontend`、`roc-backend`、`roc-postgres` 容器已存在，应先停止并移除这三个旧容器，但不要删除任何数据卷；后续 release 均使用固定项目名 `roc-system`，可直接滚动重建容器。

旧独立数据库脚本默认使用 `roc_postgres_data`，旧 Compose 默认使用 `roc_pgdata`。迁移前必须用 `docker volume ls` 和旧容器的 mount 信息确认实际卷名，再填写 `POSTGRES_DOCKER_VOLUME` 与 `BACKEND_MAP_VOLUME`。`REQUIRE_EXISTING_DATA_VOLUMES=true` 会在卷不存在时拒绝启动，防止误建空数据库；只有确认是全新安装时才改为 `false`。

#### 本轮升级与回滚

1. 记录当前容器镜像 ID、源码 commit、数据卷名和迁移版本；保留旧镜像和配置，不覆盖现有 DB/JWT/Device 凭据。先由云备份覆盖数据库与地图卷。
2. 已有部署暂停后端写入并保留 PostgreSQL；按编号执行尚未应用的迁移。`010_map_sources.sql` 增加原始地图来源，`011_resource_packages.sql` 增加地图包/文件清单，`012_deployment_event_replay.sql` 增加事件正文/摘要/attempt/原 lease 摘要和到期时间。迁移 012 可重复执行，不伪造历史事件的重放证据。
3. 执行迁移示例（沿用实际数据库容器/用户名/库名；不在命令中填写密码）：`docker exec -i roc-postgres psql -v ON_ERROR_STOP=1 -U roc_user -d roc_db < migrations/012_deployment_event_replay.sql`。首次安装则使用新版初始化；已有卷不会再次运行 init.sql。
4. 校验 `contracts/SHA256SUMS` 与 bundle 校验文件，再加载并启动新版镜像；检查 `/api/health`、`/api/db/ping`、登录、地图包下发与路网版本。
5. 应用回滚时切回已记录的旧镜像与旧配置，保留新增列/表，不执行破坏性逆迁移。已生成 v2 资源或新任务时，旧应用不一定能正确消费；先暂停相关任务并核对兼容性，必要时使用配套数据库与地图卷快照恢复，不能只恢复其中一项。

迁移前的状态事件缺少完整重放证据，重放返回 `event_conflict`；升级后不能推定旧 Outbox 已成功，需要人工核对任务与交付事实。后端轮换 JWT_SECRET 还可能使活动租约的重复 accept 无法重建，应在另一次维护窗口单独处理，不与本轮升级混用。

构建包本身不包含数据库口令、JWT 密钥或证书；根目录 `.dockerignore` 也会阻止本地环境文件、私钥、构建结果和测试报告进入 Docker 构建上下文。release 构建默认拒绝存在未提交变更的工作区，并把精确 Git commit 写入 manifest。`release.env` 只在运行主机创建，并应保持 `0600` 权限。数据库备份继续由云服务器快照/备份服务负责，至少覆盖配置的 PostgreSQL 数据卷和地图制品卷。

### 前端开发

```bash
cd roc-frontend
corepack enable
pnpm install --frozen-lockfile
pnpm run dev     # http://localhost:3000
```

### 后端开发

```bash
cd roc-backend && mkdir build && cd build
cmake .. && make
BACKEND_LISTEN_PORT=8080 DB_HOST=127.0.0.1 JWT_SECRET=my-secret \
  MAP_STORAGE_DIR=./static/maps ./roc-backend-server
```

## 验证与发布门禁

当前代码基线包含 8 个 CTest 后端测试、54 个 Vitest 前端单元/组件测试和 4 个 Playwright 端到端测试。组件测试覆盖登录提交与错误映射、注册表单校验、邀请码规范化/失败状态、邀请码服务端分页交互、地图中文文件名/30 MiB 边界，以及通用错误态重试；后端合同测试覆盖设备 sequence、status 条件、REST 专用响应、下行 WebSocket Schema 和固定错误矩阵。Release 模式同样启用测试断言。发布前至少执行：

```bash
# 后端（Linux 构建主机）
cmake -S roc-backend -B roc-backend/build
cmake --build roc-backend/build --parallel
ctest --test-dir roc-backend/build --output-on-failure

# 前端
cd roc-frontend
corepack pnpm install --frozen-lockfile
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm test
corepack pnpm run build
corepack pnpm run test:e2e
```

API 合同测试会校验 OpenAPI 与四份 JSON Schema，并确认 50 个 REST 操作的路由、认证和唯一 `operationId`。邀请码有效、重复、撤销及并发单次消费已完成人工验收；更大规模压力测试为可选项。T17 隔离 PostgreSQL/API/模拟器回归覆盖离线排队、多轮重连、重复 sequence、固定版本拒绝、数据库/后端重启、跨 attempt 进度、原事件重放、真实进程崩溃、磁盘写失败、截断/哈希错误/文件缺失、取消、越权和 Token 撤销。Python 模拟器另有 7 项恢复与资源合同测试；临时故障脚本按仓库约定不提交，测试入口和结果写入交付记录。Playwright 使用模拟业务接口，不替代真实设备链路回归。生产 TLS、30 分钟长稳及云备份恢复演练仍为后续项。

## 用户角色

| 功能 | regular | super_admin |
|---|---|---|
| 登录/注册/修改密码 | ✓ | ✓ |
| 项目管理/地图/车辆 | ✓ | ✓ |
| 地图上传/路网编辑 | ✓ | ✓ |
| 性能监控 | ✓ | ✓ |
| 协议文档查看 | ✓ | ✓ |
| 管理用户 (CRUD/启停) | ✗ | ✓ |
| 系统统计 | ✗ | ✓ |
