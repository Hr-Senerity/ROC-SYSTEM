# ROC Platform - 机器人运营控制平台

<div align="center">
  <h3>Welcome Robot Operation Control</h3>
  <p>一站式机器人运营控制解决方案</p>
</div>

## 📋 项目简介

ROC Platform 是一个现代化的机器人运营控制平台，提供完整的项目管理、地图管理、路径规划和性能监控功能。支持多种通信协议（ROS、ROC、JSON），可灵活对接各类机器人系统。

## ✨ 核心功能

- **数据统计** - 实时数据分析，全面掌握机器人运行状态
- **自动化配置** - 智能配置系统，快速部署机器人任务
- **项目管理** - 高效的项目管理工具，轻松管理多个项目
- **多平台部署** - 支持多平台部署，灵活适配不同环境

## 🚀 快速开始

### 在 Cursor 中使用

1. **下载项目文件**
   - 在 Figma Make 界面中，点击右上角的导出按钮
   - 选择 "Download as ZIP" 下载整个项目

2. **解压并打开**

   ```bash
   # 解压下载的文件
   unzip roc-platform.zip
   cd roc-platform
   ```

3. **在 Cursor 中打开**
   - 打开 Cursor 编辑器
   - File → Open Folder
   - 选择解压后的项目文件夹

4. **安装依赖**

   ```bash
   npm install
   # 或
   yarn install
   # 或
   pnpm install
   ```

5. **创建必要的配置文件**

   创建 `package.json`：

   ```json
   {
     "name": "roc-platform",
     "version": "1.0.0",
     "private": true,
     "type": "module",
     "scripts": {
       "dev": "vite",
       "build": "tsc && vite build",
       "preview": "vite preview"
     },
     "dependencies": {
       "react": "^18.3.1",
       "react-dom": "^18.3.1",
       "react-router-dom": "^6.22.0",
       "lucide-react": "^0.344.0",
       "react-hook-form": "^7.55.0"
     },
     "devDependencies": {
       "@types/react": "^18.3.1",
       "@types/react-dom": "^18.3.0",
       "@vitejs/plugin-react": "^4.2.1",
       "typescript": "^5.3.3",
       "vite": "^5.1.0",
       "tailwindcss": "^4.0.0",
       "autoprefixer": "^10.4.17",
       "postcss": "^8.4.35"
     }
   }
   ```

   创建 `vite.config.ts`：

   ```typescript
   import { defineConfig } from "vite";
   import react from "@vitejs/plugin-react";
   import path from "path";

   export default defineConfig({
     plugins: [react()],
     resolve: {
       alias: {
         "@": path.resolve(__dirname, "./"),
       },
     },
   });
   ```

   创建 `tsconfig.json`：

   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "useDefineForClassFields": true,
       "lib": ["ES2020", "DOM", "DOM.Iterable"],
       "module": "ESNext",
       "skipLibCheck": true,
       "moduleResolution": "bundler",
       "allowImportingTsExtensions": true,
       "resolveJsonModule": true,
       "isolatedModules": true,
       "noEmit": true,
       "jsx": "react-jsx",
       "strict": true,
       "noUnusedLocals": true,
       "noUnusedParameters": true,
       "noFallthroughCasesInSwitch": true,
       "baseUrl": ".",
       "paths": {
         "@/*": ["./*"]
       }
     },
     "include": ["**/*.ts", "**/*.tsx"],
     "references": [{ "path": "./tsconfig.node.json" }]
   }
   ```

   创建 `tsconfig.node.json`：

   ```json
   {
     "compilerOptions": {
       "composite": true,
       "skipLibCheck": true,
       "module": "ESNext",
       "moduleResolution": "bundler",
       "allowSyntheticDefaultImports": true
     },
     "include": ["vite.config.ts"]
   }
   ```

   创建 `index.html`：

   ```html
   <!doctype html>
   <html lang="zh-CN">
     <head>
       <meta charset="UTF-8" />
       <link rel="icon" type="image/svg+xml" href="/vite.svg" />
       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
       <title>ROC Platform - 机器人运营控制平台</title>
     </head>
     <body>
       <div id="root"></div>
       <script type="module" src="/main.tsx"></script>
     </body>
   </html>
   ```

   创建 `main.tsx`：

   ```typescript
   import React from 'react'
   import ReactDOM from 'react-dom/client'
   import App from './App'
   import './styles/globals.css'

   ReactDOM.createRoot(document.getElementById('root')!).render(
     <React.StrictMode>
       <App />
     </React.StrictMode>,
   )
   ```

6. **启动开发服务器**

   ```bash
   npm run dev
   ```

7. **打开浏览器**
   访问 `http://localhost:5173`

### 直接使用（无需配置）

如果您想快速预览，可以：

1. **在 Figma Make 中直接运行**
   - 当前界面就是实时预览
   - 所有功能都可以直接测试

2. **导出为静态网站**
   - 点击导出按钮
   - 选择 "Export as Static Site"
   - 可以直接部署到任何静态托管服务（Vercel、Netlify 等）

## 📁 项目结构

```
roc-platform/
├── App.tsx                    # 主应用组件，路由配置
├── main.tsx                   # 应用入口文件
├── index.html                 # HTML 模板
├── components/
│   ├── HomePage.tsx           # 官网首页
│   ├── LoginPage.tsx          # 登录页面
│   ├── RegisterPage.tsx       # 注册页面（含拼图验证）
│   ├── ProfilePage.tsx        # 个人中心
│   ├── ProjectsPage.tsx       # 项目列表页
│   ├── ProjectDetailPage.tsx  # 项目详情页
│   ├── ProtocolsPage.tsx      # 协议说明页
│   ├── PerformanceMonitor.tsx # 性能监控组件
│   ├── PuzzleVerification.tsx # 拼图验证组件
│   ├── figma/
│   │   └── ImageWithFallback.tsx
│   └── ui/                    # Shadcn UI 组件库
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       └── ... (40+ 组件)
├── styles/
│   └── globals.css            # 全局样式和 Tailwind 配置
├── package.json               # 依赖配置
├── tsconfig.json              # TypeScript 配置
├── vite.config.ts             # Vite 配置
├── VERSION.md                 # 版本说明
└── README.md                  # 项目文档（本文件）
```

## 🔧 技术栈

- **React 18+** - UI 框架
- **TypeScript** - 类型安全
- **React Router v6** - 路由管理
- **Tailwind CSS v4** - 样式框架
- **Vite** - 构建工具
- **Lucide React** - 图标库
- **Shadcn/ui** - UI 组件库

## 🎨 设计系统

- 使用 Tailwind CSS 原子化类名
- 自定义设计令牌（在 globals.css 中定义）
- 响应式断点：sm, md, lg, xl, 2xl
- 主题色：蓝紫渐变（Blue #2563eb → Purple #9333ea）

## 📱 功能模块

### 1. 用户认证

- 登录/注册
- 拖拽拼图验证
- 登录状态管理

### 2. 项目管理

- 项目创建、删除
- 项目卡片展示
- 项目详情查看

### 3. 地图管理

- 地图列表展示
- 正在使用地图标识（蓝色描边）
- 地图状态管理

### 4. 路径管理

- 路径可视化（网格底图 + 彩色节点）
- 路径创建、编辑
- 路径状态显示

### 5. 性能监控

- 机器人状态监控
- CPU、内存、电量显示
- 定位置信度指标
- 实时日志查看

### 6. 协议文档

- ROS 协议说明
- ROC 协议说明
- JSON 协议说明

## 🌐 路由说明

| 路径           | 页面     | 说明         |
| -------------- | -------- | ------------ |
| `/`            | 首页     | 官网介绍页   |
| `/login`       | 登录     | 用户登录     |
| `/register`    | 注册     | 用户注册     |
| `/profile`     | 个人中心 | 用户信息     |
| `/projects`    | 工作平台 | 项目列表     |
| `/project/:id` | 项目详情 | 项目管理界面 |
| `/protocols`   | 协议说明 | 协议文档     |

## 💡 使用技巧

### 在 Cursor 中开发

1. **使用 Cursor 的 AI 功能**
   - Cmd+K / Ctrl+K：AI 代码编辑
   - Cmd+L / Ctrl+L：AI 聊天

2. **推荐的 VS Code 扩展**
   - Tailwind CSS IntelliSense
   - ESLint
   - Prettier
   - TypeScript Vue Plugin (Volar)

3. **热重载开发**
   - Vite 提供极快的热模块替换（HMR）
   - 修改代码后自动刷新浏览器

### 自定义配置

1. **修改主题色**
   编辑 `/styles/globals.css` 中的 CSS 变量

2. **添加新页面**
   - 在 `/components/` 创建新组件
   - 在 `App.tsx` 添加路由

3. **添加新功能**
   - 使用现有的 UI 组件库
   - 保持代码风格一致

## 📦 部署

### Vercel 部署

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel
```

### Netlify 部署

```bash
# 构建
npm run build

# 上传 dist 文件夹到 Netlify
```

## 📄 许可证

本项目代码仅供学习和参考使用。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系方式

如有问题，请通过 Issue 联系我们。

---

**Version 1.0.0** | 构建于 Figma Make | Powered by React + TypeScript + Tailwind CSS