# ROC 二进制协议

本文描述 `RocSerializer` 当前实现的线格式及 HTTP 接入边界。字段顺序、大小和消息类型以代码为准；多字节整数和 IEEE 754 `float64` 均使用网络字节序（大端）。

## 帧结构

ROC 帧由固定 10 字节头和定长顺序的 Payload 组成：

```text
+--------+--------+------------+---------+
| Magic  | Type   | Length     | Payload |
| 4 byte | 2 byte | 4 byte     | N byte  |
+--------+--------+------------+---------+
```

| 偏移 | 大小 | 类型 | 说明 |
| --- | --- | --- | --- |
| 0 | 4 byte | `uint32` | Magic：`0x524F4320`，ASCII 为 `ROC ` |
| 4 | 2 byte | `uint16` | 消息类型 |
| 6 | 4 byte | `uint32` | Payload 字节长度 N |
| 10 | N byte | bytes | 类型对应的 Payload |

## 消息类型

| 值 | 名称 | 序列化器 | 当前 HTTP 接入 |
| --- | --- | --- | --- |
| `0x0001` | `STATUS_REPORT` | 支持编码与解码 | `POST /api/protocol/roc` 支持 |
| `0x0002` | `CONTROL_CMD` | 支持编码与解码 | 尚未开放；HTTP 控制入口当前使用 JSON |
| `0x0003` | `HEARTBEAT` | 仅保留枚举值 | 尚未实现 Payload，也未开放 HTTP 接入 |

枚举或序列化器中存在某种类型，不表示网络入口已经支持该类型。当前 `/api/protocol/roc` 会拒绝非 `STATUS_REPORT` 帧并返回 HTTP 400。

## 基础类型编码

| 类型 | 编码 |
| --- | --- |
| `string` | `[uint16 字节长度][UTF-8 字节]` |
| `bool` | `uint8`，0 为 false，非 0 为 true |
| `uint16` / `uint32` / `int32` | 大端整数 |
| `float64` | IEEE 754 双精度，大端字节序 |

Payload 使用固定字段顺序，不包含 field ID，不是 TLV 格式。

解码器要求单次 HTTP 请求体恰好包含一帧：头部声明的 Payload 长度必须与剩余字节数完全一致，不接受短帧、拼接帧或尾随字节。每个 `string` 最长 65,535 字节；解码每个长度前缀和定长字段前都会先检查剩余字节数。

## STATUS_REPORT Payload

| 顺序 | 字段 | 类型 | 约束 |
| --- | --- | --- | --- |
| 1 | `robot_id` | `string` | 已注册车辆 UUID，必须与 Device token 对应 |
| 2 | `online` | `bool` | 在线状态 |
| 3 | `cpu_usage` | `float64` | 0–100 |
| 4 | `memory_usage` | `float64` | 0–100 |
| 5 | `battery_level` | `int32` | 0–100 |
| 6 | `localization_confidence` | `float64` | 0–100 |
| 7 | `position_x` | `float64` | 有限数值 |
| 8 | `position_y` | `float64` | 有限数值 |
| 9 | `position_theta` | `float64` | 有限数值 |
| 10 | `velocity_linear` | `float64` | 有限数值 |
| 11 | `velocity_angular` | `float64` | 有限数值 |

接收时间由服务端生成，不在帧中传输。状态通过验证后写入车辆快照，递增 `telemetry_version`，再向车辆所属项目的已认证 WebSocket 订阅者广播。

### Golden frame

以下向量用于锁定编码兼容性。示例字段为 `robot_id="r"`、`online=true`，随后数值依次为 `1.0`、`2.0`、`3`、`4.0`、`5.0`、`6.0`、`7.0`、`8.0`、`9.0`：

```text
524f432000010000004800017201
3ff0000000000000400000000000000000000003
401000000000000040140000000000004018000000000000
401c00000000000040200000000000004022000000000000
```

换行仅用于阅读，发送时应连接为连续 82 字节。该向量由 C++ 单元测试逐字节比较；Python HTTP 回归脚本独立编码真实车辆 UUID，以验证跨语言互操作。

## CONTROL_CMD Payload

`RocSerializer` 已实现下列编码与解码顺序，但当前没有接收 ROC 控制帧的 HTTP 入口：

1. `robot_id`：`string`
2. `command_type`：`string`
3. `linear_x`、`linear_y`、`linear_z`：三个 `float64`
4. `angular_x`、`angular_y`、`angular_z`：三个 `float64`
5. `task_params`：`string`，内容由业务约定为 JSON 字符串

当前控制流程使用 `POST /api/protocol/command` 提交 JSON，再由车辆调用 `GET /api/protocol/pending/{robot_id}` 读取并清空内存队列。该队列不跨后端重启保留。

## HTTP 状态上报

```text
POST /api/protocol/roc
Authorization: Device <DEVICE_TOKEN>
Content-Type: application/octet-stream
Body: 完整 ROC STATUS_REPORT 帧
```

| HTTP 状态 | 含义 |
| --- | --- |
| 200 | 状态通过验证、已持久化并接受 |
| 400 | 帧头、长度、类型、Payload 或遥测数值无效 |
| 401 | Device token 无效、已撤销，或与 `robot_id` 不匹配 |

每辆车的 Device token 由平台车辆页签发，平台只保存 SHA-256 摘要与尾号。生产环境必须使用 TLS；旧共享 `DEVICE_TOKEN` 仅在显式设置 `DEVICE_ALLOW_SHARED_TOKEN=true` 时启用。

## 实现位置

- `../RocSerializer.h`：Magic、头部大小和消息类型
- `../RocSerializer.cpp`：字节编码、帧打包及 Payload 顺序
- `roc_bridge.cpp`：HTTP 解析、设备授权和响应语义
- `../../services/VehicleStatusService.cpp`：遥测验证、持久化与版本递增
- `../../../tests/RocSerializerTests.cpp`：golden frame、往返编码和逐字节截断边界测试
