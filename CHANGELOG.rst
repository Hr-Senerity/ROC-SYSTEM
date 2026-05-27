=========
变更日志
=========

本文档记录项目的所有重要变更。

格式基于 `Keep a Changelog <https://keepachangelog.com/zh-CN/1.0.0/>`_，
并且本项目遵循 `语义化版本 <https://semver.org/lang/zh-CN/>`_。

==========
[未发布]
==========

新增
----
- 完整 C++ 后端服务（Drogon），20 个 REST API 端点 + WebSocket 实时通信
- JWT 认证体系（HMAC-SHA256），super_admin / regular 双角色权限分离
- SHA-256 + 随机盐密码哈希
- 超级管理员 API：用户管理 CRUD、系统统计、用户车辆查询
- 项目 CRUD API（创建/列表/详情/更新/删除）+ 项目地图接口
- 车辆管理 API（注册/状态更新/指标上报/删除），支持部分字段更新
- JSON 协议序列化器（RobotStatus / ControlCommand）
- ROC 二进制协议序列化器（4 字节 magic + 2 字节 type + 4 字节 len + payload）
- 协议桥接器（ProtocolBridge），自动检测协议类型并分发回调
- 协议 HTTP 端点：POST /api/protocol/status、/api/protocol/command、/api/protocol/roc
- WebSocket 实时推送（/ws/status），协议桥接器状态更新自动广播

- 前端完整认证接入：登录/注册调用真实 API，token + role 持久化 localStorage
- 前端路由权限守卫：ProtectedRoute（需登录）、SuperAdminRoute（需 super_admin）
- 超级管理员前端页面：用户列表（分页/搜索/筛选）、停用/启用/删除、详情面板、系统统计卡片
- 项目页面接入真实 API（列表/创建/删除）
- 个人中心接入 GET /api/auth/me 加载真实用户数据
- HomePage 导航菜单新增"用户管理"入口（仅 super_admin 可见）

- 地图放大详情页（MapDetailPage），5 层架构：灰色网格底图 → 用户地图区域 → 路网线条 + 交叉节点 → 配送路径高亮（金色箭头 + 节点圆点）→ 在线车辆标记（含方向箭头和标签）
- 车辆悬浮信息窗（VehiclePopup）：状态 / IP / 位置(x,y,θ) / 速度(v,ω) / 电量 / CPU / 内存 / 定位置信度 / 配送路径节点数
- 地图交互：缩放（滚轮 + 按钮）、平移（拖拽）、重置、全屏模式
- 地图 WebSocket 实时更新：车辆位置/状态通过 WebSocket 实时推送，5 秒自动重连
- 配送路径高亮：点击车辆时在地图上以金色带箭头渲染 deliveryPath
- 移除"我的路径"侧边栏菜单，路径显示改为车辆点击触发
- Robot 数据模型扩展：新增 position{x,y,theta}、velocity{linear,angular}、deliveryPath[]
- 共享类型文件 types/robot.ts，PerformanceMonitor 和 MapDetailPage 统一引用

- 完整数据库 Schema：users / user_sessions / projects / maps / vehicles 表，含索引和约束
- 默认超级管理员账户：admin / [REDACTED_DEFAULT_PASSWORD]
- PostgreSQL 初始化脚本含完整 DDL 和种子数据

- Docker Compose 整体编排文件（postgres + backend + frontend），含健康检查和网络隔离
- 前端 Dockerfile 支持 VITE_API_BASE_URL 构建参数
- 后端部署脚本新增 JWT_SECRET / JWT_EXPIRE_SECONDS 环境变量
- deploy-all-docker.sh：基于 docker-compose 的整体部署（up/down/build/logs/status）
- deploy-all.sh：混合模式编排（local/docker），按 PostgreSQL → Backend → Frontend 顺序
- deploy.env.example 新增 JWT 配置和跨服务器分离部署场景 A/B/C 文档
- shadcn/ui Button + Input 组件集成（LoginPage、ProjectsPage）

修复
----
- MapDetailPage 底图修正：灰色网格作为底层，用户地图区域叠加，路网在上层，车辆标记最顶层
- 地图卡片点击改为跳转 MapDetailPage（/project/:projectId/map/:mapId）

==========
[1.0.0] - 2024-12-26
==========

新增
----
- 用户认证系统（登录、注册、个人中心）
- 项目管理功能（创建、删除、查看）
- 项目详情页面（4 个标签页：详情、地图、路径、性能监控）
- 地图管理功能
- 路径管理功能
- 性能监控组件
- 协议文档页面（ROS、ROC、JSON）
- 拖拽拼图验证组件
- Docker 部署支持
- PostgreSQL 数据库初始化脚本

技术栈
------
- React 18 + TypeScript
- Vite 6.3.5
- Tailwind CSS v4
- Shadcn/ui 组件库
- Docker 容器化部署
