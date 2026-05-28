import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, FileCode, Code, Braces } from 'lucide-react';

type ProtocolType = 'roc' | 'json';

export function ProtocolsPage() {
  const navigate = useNavigate();
  const [activeProtocol, setActiveProtocol] = useState<ProtocolType>('roc');

  const protocols = {
    },
    roc: {
      title: 'ROC 协议',
      icon: Code,
      description: 'ROC平台通用控制协议',
      content: `
# ROC 通用协议说明

ROC协议是专为机器人运营控制设计的轻量级、高效的通信协议。

## 协议特点

- **轻量级**：最小化数据传输开销
- **高效性**：优化的消息格式，降低延迟
- **通用性**：支持各类机器人系统
- **可扩展**：灵活的协议扩展机制

## 消息格式

ROC协议使用二进制格式传输，消息结构如下：

\`\`\`
+--------+--------+------------+--------+
| Header | Type   | Length     | Data   |
| 4字节  | 2字节  | 4字节      | N字节  |
+--------+--------+------------+--------+
\`\`\`

### 消息头（Header）
- 魔术字：0x524F4320 ("ROC ")
- 用于协议识别和版本控制

### 消息类型（Type）
- 0x0001: 控制指令
- 0x0002: 状态查询
- 0x0003: 配置更新
- 0x0004: 数据上报
- 0x0005: 心跳包

### 数据长度（Length）
- 32位无符号整数
- 表示Data字段的字节长度

## 控制指令

### 移动控制
\`\`\`
类型: 0x0001
数据格式:
{
  "command": "move",
  "linear": {
    "x": 0.5,  // m/s
    "y": 0.0,
    "z": 0.0
  },
  "angular": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.2   // rad/s
  }
}
\`\`\`

### 任务执行
\`\`\`
类型: 0x0001
数据格式:
{
  "command": "task",
  "task_id": "task_001",
  "action": "start",
  "params": {
    "waypoints": [[0, 0], [1, 1], [2, 0]]
  }
}
\`\`\`

## 状态上报

\`\`\`
类型: 0x0004
数据格式:
{
  "robot_id": "robot_001",
  "timestamp": 1640000000,
  "battery": 85,
  "position": {
    "x": 1.5,
    "y": 2.3,
    "theta": 0.5
  },
  "status": "idle" | "running" | "error"
}
\`\`\`

## 心跳机制

- 频率：1Hz
- 超时时间：5秒
- 超时后自动重连

## 安全机制

1. CRC校验确保数据完整性
2. 消息序列号防止重放攻击
3. 超时重传机制
4. 消息加密（可选）
      `,
    },
    json: {
      title: 'JSON 协议',
      icon: Braces,
      description: 'JSON 数据交换格式',
      content: `
# JSON 协议说明

ROC平台支持标准的JSON格式进行数据交换，适用于HTTP API和WebSocket通信。

## 基础格式

所有JSON消息遵循统一的基础结构：

\`\`\`json
{
  "version": "1.0",
  "timestamp": 1640000000000,
  "type": "request" | "response" | "event",
  "data": { ... }
}
\`\`\`

## API端点

### 1. 机器人控制

**端点**: \`POST /api/v1/robot/control\`

请求示例：
\`\`\`json
{
  "version": "1.0",
  "timestamp": 1640000000000,
  "type": "request",
  "data": {
    "robot_id": "robot_001",
    "command": "move",
    "velocity": {
      "linear_x": 0.5,
      "angular_z": 0.2
    }
  }
}
\`\`\`

响应示例：
\`\`\`json
{
  "version": "1.0",
  "timestamp": 1640000000100,
  "type": "response",
  "data": {
    "success": true,
    "message": "Command executed successfully",
    "command_id": "cmd_12345"
  }
}
\`\`\`

### 2. 状态查询

**端点**: \`GET /api/v1/robot/status/:robot_id\`

响应示例：
\`\`\`json
{
  "version": "1.0",
  "timestamp": 1640000000000,
  "type": "response",
  "data": {
    "robot_id": "robot_001",
    "status": {
      "online": true,
      "battery": 85,
      "position": {
        "x": 1.5,
        "y": 2.3,
        "orientation": 0.5
      },
      "velocity": {
        "linear": 0.5,
        "angular": 0.2
      },
      "task": {
        "id": "task_001",
        "status": "running",
        "progress": 65
      }
    }
  }
}
\`\`\`

### 3. 地图数据

**端点**: \`GET /api/v1/map/:map_id\`

响应示例：
\`\`\`json
{
  "version": "1.0",
  "timestamp": 1640000000000,
  "type": "response",
  "data": {
    "map_id": "map_001",
    "name": "仓库地图",
    "resolution": 0.05,
    "width": 384,
    "height": 384,
    "origin": {
      "x": 0.0,
      "y": 0.0,
      "orientation": 0.0
    },
    "data_url": "/api/v1/map/map_001/data"
  }
}
\`\`\`

### 4. 任务管理

**创建任务**: \`POST /api/v1/task/create\`

请求示例：
\`\`\`json
{
  "version": "1.0",
  "timestamp": 1640000000000,
  "type": "request",
  "data": {
    "robot_id": "robot_001",
    "task_type": "delivery",
    "priority": "high",
    "waypoints": [
      {"x": 0, "y": 0},
      {"x": 5, "y": 5},
      {"x": 10, "y": 0}
    ],
    "params": {
      "speed": 0.5,
      "timeout": 300
    }
  }
}
\`\`\`

## WebSocket 事件

### 连接
\`\`\`
ws://api.roc-platform.com/ws/v1/robot/:robot_id
\`\`\`

### 实时事件

位置更新：
\`\`\`json
{
  "version": "1.0",
  "timestamp": 1640000000000,
  "type": "event",
  "event_type": "position_update",
  "data": {
    "robot_id": "robot_001",
    "position": {
      "x": 1.5,
      "y": 2.3,
      "orientation": 0.5
    }
  }
}
\`\`\`

告警事件：
\`\`\`json
{
  "version": "1.0",
  "timestamp": 1640000000000,
  "type": "event",
  "event_type": "alert",
  "data": {
    "robot_id": "robot_001",
    "level": "warning",
    "message": "Battery level low",
    "value": 15
  }
}
\`\`\`

## 错误处理

错误响应格式：
\`\`\`json
{
  "version": "1.0",
  "timestamp": 1640000000000,
  "type": "response",
  "data": {
    "success": false,
    "error": {
      "code": "INVALID_PARAM",
      "message": "Invalid parameter: robot_id is required",
      "details": {}
    }
  }
}
\`\`\`

常见错误码：
- \`INVALID_PARAM\`: 参数错误
- \`NOT_FOUND\`: 资源不存在
- \`UNAUTHORIZED\`: 未授权
- \`TIMEOUT\`: 请求超时
- \`INTERNAL_ERROR\`: 服务器内部错误
      `,
    },
  };

  const currentProtocol = protocols[activeProtocol];
  const ProtocolIcon = currentProtocol.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* 顶部导航栏 */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                返回首页
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl text-slate-900">ROC平台</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页头 */}
        <div className="mb-8">
          <h1 className="text-3xl text-slate-900 mb-2">协议开放说明</h1>
          <p className="text-slate-600">ROC平台支持多种通信协议，灵活对接各类机器人系统</p>
        </div>

        <div className="flex gap-6">
          {/* 左侧协议列表 */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm p-4 sticky top-24">
              <nav className="space-y-2">
                <button
                  onClick={() => setActiveProtocol('ros')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeProtocol === 'ros'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <FileCode className="w-5 h-5" />
                  <span>ROS 协议</span>
                </button>

                <button
                  onClick={() => setActiveProtocol('roc')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeProtocol === 'roc'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Code className="w-5 h-5" />
                  <span>ROC 协议</span>
                </button>

                <button
                  onClick={() => setActiveProtocol('json')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeProtocol === 'json'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Braces className="w-5 h-5" />
                  <span>JSON 协议</span>
                </button>
              </nav>
            </div>
          </div>

          {/* 右侧协议内容 */}
          <div className="flex-1">
            <div className="bg-white rounded-xl shadow-sm p-8">
              {/* 协议标题 */}
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
                  <ProtocolIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl text-slate-900 mb-1">{currentProtocol.title}</h2>
                  <p className="text-slate-600">{currentProtocol.description}</p>
                </div>
              </div>

              {/* 协议内容 */}
              <div className="prose prose-slate max-w-none">
                <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
                  {currentProtocol.content}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
