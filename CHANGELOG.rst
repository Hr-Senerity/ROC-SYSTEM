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
- 完整 C++ 后端（Drogon），24 个 REST API 端点 + WebSocket 实时通信
- JWT 认证体系（HMAC-SHA256），super_admin / regular 双角色权限分离
- SHA-256 + 随机盐密码哈希，密码修改 API
- 超级管理员 API：用户管理 CRUD、系统统计、用户车辆查询
- 项目 CRUD API + 项目地图接口（列表/上传/重命名/删除）
- 车辆管理 API（注册/状态更新/指标上报/删除），支持部分字段更新
- 地图坐标系（coordinate_origin_x/y）+ 路网数据（road_network JSONB）
- JSON 协议序列化器 + ROC 二进制协议序列化器
- 协议桥接器（ProtocolBridge）：消息队列、Robot 轮询指令（GET /api/protocol/pending/{id}）
- 协议 HTTP 端点：POST /api/protocol/status、/api/protocol/command、/api/protocol/roc
- WebSocket 实时推送（/ws/status）
- 取消 ROS 协议支持，专注 ROC + JSON

- 前端完整认证接入：登录/注册/修改密码调用真实 API
- 前端路由权限守卫：ProtectedRoute / SuperAdminRoute
- 超级管理员前端页面：用户列表（分页/搜索/筛选）、停用/启用/删除、详情、统计
- 项目页面接入真实 API，清除所有 mock 数据（新用户空白起始状态）
- 个人中心重写：数据展示、密码修改、通知设置
- HomePage 导航菜单"用户管理"入口（仅 super_admin 可见）

- 地图放大详情页（MapDetailPage），5 层架构：网格底图 → 用户地图 → 路网 → 路径高亮 → 车辆标记
- 地图响应式画布（ResizeObserver，400-1200px）+ 光标锚定缩放
- 地图标记缩放补偿（视觉大小恒定）+ 弹出窗口边界检测
- 地图上传功能：后端 multipart API + 前端 MapUploadModal（预览/命名）
- 路网数据从地图加载并动态渲染，支持 CSV 导出 (x,y,z,qx,qy,qz,qw)
- 车辆悬浮窗：位置/速度/IP/电量/CPU/内存/定位 + 边界安全定位
- WebSocket 实时车辆状态更新（5 秒自动重连）
- 移除"我的路径"侧边栏 → 路径高亮改为车辆点击触发
- Robot 数据模型扩展：position{x,y,theta}、velocity{linear,angular}、deliveryPath[]
- 共享类型文件 types/robot.ts

- 完整数据库 Schema：users / projects / maps / vehicles，含坐标原点和路网 JSONB 字段
- 默认超级管理员账户：admin / [REDACTED_DEFAULT_PASSWORD]

- Docker Compose 编排（postgres + backend + frontend），健康检查 + 网络隔离
- 前端 Dockerfile 支持 VITE_API_BASE_URL 构建参数（无默认值防缓存）
- 后端部署脚本新增 JWT_SECRET / JWT_EXPIRE_SECONDS 环境变量
- deploy-all-docker.sh / deploy-all.sh 编排脚本
- deploy.env.example 新增 JWT 配置 + 跨服务器分离部署场景文档
- shadcn/ui Button + Input 组件集成

修复
----
- MapDetailPage 底图：灰色网格底层 + 用户地图区域 + 路网上层 + 车辆顶层
- 地图卡片点击跳转 MapDetailPage
- VITE_API_BASE_URL 默认值导致浏览器请求 localhost:8080
- libpqxx v6 API 兼容（row[i].name()）
- Drogon v1 兼容（setCustomConfig → 环境变量）
- json/jsonResp 函数命名冲突
- init.sql 默认管理员密码哈希修正（password + salt）

==========
[1.0.0] - 2024-12-26
==========

新增
----
- 用户认证系统（登录、注册、个人中心）
- 项目管理功能（创建、删除、查看）
- 地图/路径管理 + 性能监控组件
- 协议文档页面 + 拖拽拼图验证组件
- Docker 部署支持 + PostgreSQL 初始化

技术栈
------
- React 18 + TypeScript + Vite 6.3.5
- Tailwind CSS v4 + Shadcn/ui + Docker 容器化
