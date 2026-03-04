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
- 项目初始结构搭建
- 前端界面实现（从 Figma 导出）
- Docker 部署配置
- PostgreSQL 数据库配置
- Git 仓库初始化
- 统一 scripts/config 配置单与 scripts/lib/common.sh 公共工具库
- 前端 / 后端 / 数据库 三模块的本地与 Docker 部署脚本（deploy-frontend* / deploy-backend* / deploy-postgres*）
- 宿主机 Nginx 网关脚本与模板（deploy-gateway.sh + nginx-site.conf.template），统一管理域名与反向代理
- 初始 C++ 后端服务（Drogon），提供 /api/health 与 /api/db/ping，并可通过环境变量连接 PostgreSQL（libpqxx）

==========
[1.0.0] - 2024-12-26
==========

新增
----
- 用户认证系统（登录、注册、个人中心）
- 项目管理功能（创建、删除、查看）
- 项目详情页面（4个标签页：详情、地图、路径、性能监控）
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

==========
[未发布]
==========

计划中
-------
- C++ 后端业务实现与完整 RESTful API 接口
- 数据库表结构设计与迁移体系
- 协议桥接器实现（ROS、ROC、JSON）
- WebSocket 实时通信
- 用户权限管理
- 数据持久化
- 单元测试和集成测试

