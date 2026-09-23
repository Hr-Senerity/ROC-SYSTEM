import { useState } from 'react';
import {
  ArrowLeft, Braces, KeyRound, PackageCheck, Radio, ShieldAlert, Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type GuideSection = 'device' | 'tasks' | 'realtime';

const credentialEndpoints = [
  { method: 'GET', path: '/api/vehicles/{vehicle_id}/device-token', purpose: '查看是否已配置、是否启用及凭据尾号' },
  { method: 'POST', path: '/api/vehicles/{vehicle_id}/device-token', purpose: '首次签发或轮换单车凭据；明文仅在本次响应出现' },
  { method: 'DELETE', path: '/api/vehicles/{vehicle_id}/device-token', purpose: '立即撤销凭据、断开现有设备会话并阻止新连接' },
] as const;

const taskEndpoints = [
  { method: 'POST', path: '/api/device/tasks/{task_id}/accept', purpose: '接受任务并取得 30 分钟租约；重复接受返回同一租约' },
  { method: 'GET', path: '/api/device/tasks/{task_id}/manifest', purpose: '读取资源类型、版本、大小、SHA-256 和制品地址' },
  { method: 'GET', path: '/api/device/tasks/{task_id}/artifact', purpose: '完整下载道路 JSON 或原始地图图片；携带 Range 返回 416' },
  { method: 'POST', path: '/api/device/tasks/{task_id}/status', purpose: '幂等回报下载、交付、完成或失败状态' },
] as const;

const accountTaskEndpoints = [
  { method: 'POST', path: '/api/projects/{project_id}/maps/upload', purpose: 'multipart 上传 name + PNG/JPEG image，并自动创建不可变地图 v1 制品' },
  { method: 'GET', path: '/api/projects/{project_id}/maps/{map_id}/artifacts', purpose: '列出地图制品版本、MIME、大小、尺寸和 SHA-256' },
  { method: 'POST', path: '/api/projects/{project_id}/maps/{map_id}/artifacts', purpose: '把旧地图当前原图幂等固化为不可变制品版本' },
  { method: 'POST', path: '/api/projects/{project_id}/deployments', purpose: '账户按不可变资源版本和车辆列表创建批次' },
  { method: 'GET', path: '/api/projects/{project_id}/deployments/{batch_id}', purpose: '读取批次与逐车任务状态' },
  { method: 'POST', path: '/api/projects/{project_id}/deployments/{batch_id}/cancel', purpose: '取消尚未进入最终交付阶段的任务' },
] as const;

const invitationEndpoints = [
  { method: 'POST', path: '/api/auth/register', purpose: '提交 username、email、password 与一次性 invitation_code；成功后邀请码立即失效' },
  { method: 'GET', path: '/api/admin/invitation-codes', purpose: '超级管理员查看最近邀请码及可用、已使用、已撤销状态' },
  { method: 'POST', path: '/api/admin/invitation-codes', purpose: '超级管理员随机生成 5 位数字与大写字母邀请码' },
  { method: 'DELETE', path: '/api/admin/invitation-codes/{id}', purpose: '超级管理员撤销尚未使用的邀请码' },
] as const;

const envelopeFields = [
  ['protocol_version', 'integer', '固定为 1', '协议主版本；不支持的版本会被拒绝'],
  ['message_id', 'UUID string', '必填', '本条消息的幂等标识'],
  ['type', 'string', '必填', '当前设备上行支持 heartbeat / telemetry'],
  ['sequence', 'decimal string', '必填且大于 0', '设备持久递增序列；服务端跨重连拒绝重复写入'],
  ['timestamp', 'RFC 3339 string', '必填', '设备产生消息的 UTC 时间'],
  ['payload', 'object', '必填', '类型对应的数据；不得携带 vehicle_id 或 robot_id'],
] as const;

const heartbeatExample = `{
  "protocol_version": 1,
  "message_id": "123e4567-e89b-42d3-a456-426614174000",
  "type": "heartbeat",
  "sequence": "41",
  "timestamp": "2026-09-16T12:00:00Z",
  "payload": {
    "library_version": "0.1.0"
  }
}`;

const telemetryExample = `{
  "protocol_version": 1,
  "message_id": "123e4567-e89b-42d3-a456-426614174001",
  "type": "telemetry",
  "sequence": "42",
  "timestamp": "2026-09-16T12:00:01Z",
  "payload": {
    "online": true,
    "cpu_usage": 32.4,
    "memory_usage": 48.1,
    "battery_level": 85,
    "localization_confidence": 96.5,
    "position": { "x": 1.5, "y": 2.3, "theta": 0.5 },
    "velocity": { "linear": 0.4, "angular": 0.1 }
  }
}`;

const helloExample = `{
  "protocol_version": 1,
  "message_id": "<SERVER_MESSAGE_UUID>",
  "type": "hello",
  "sequence": "<SERVER_SEQUENCE>",
  "timestamp": "<SERVER_UTC_TIME>",
  "payload": {
    "vehicle_id": "<TOKEN_MAPPED_VEHICLE_UUID>",
    "heartbeat_interval_seconds": 30,
    "idle_timeout_seconds": 45,
    "max_message_bytes": 65536,
    "max_heartbeat_bytes": 4096,
    "max_telemetry_bytes": 16384,
    "last_client_sequence": "40"
  }
}`;

const ackExample = `{
  "protocol_version": 1,
  "message_id": "<SERVER_MESSAGE_UUID>",
  "type": "ack",
  "sequence": "<SERVER_SEQUENCE>",
  "timestamp": "<SERVER_UTC_TIME>",
  "payload": {
    "ack_message_id": "123e4567-e89b-42d3-a456-426614174001",
    "ack_sequence": "42",
    "accepted_type": "telemetry",
    "duplicate": false
  }
}`;

const taskAvailableExample = `{
  "protocol_version": 1,
  "message_id": "<SERVER_MESSAGE_UUID>",
  "type": "task.available",
  "sequence": "<SERVER_SEQUENCE>",
  "timestamp": "<SERVER_UTC_TIME>",
  "payload": {
    "task_id": "<TASK_UUID>",
    "batch_id": "<BATCH_UUID>",
    "project_id": "<PROJECT_UUID>",
    "resource_type": "road_network",
    "resource_revision_id": "<REVISION_UUID>",
    "attempt": 0,
    "max_attempts": 3
  }
}`;

const taskStatusExample = `{
  "event_id": "<NEW_UUID_FOR_EACH_STATE_REPORT>",
  "state": "downloading",
  "progress": 25,
  "error_code": "",
  "error_message": ""
}`;

const browserWebsocketFlow = `// 1. 服务端连接成功后发送
{ "type": "hello", "authentication": "first_message", "protocol_version": 1 }

// 2. 浏览器在 5 秒内发送账户 JWT（不是 Device token）
{ "type": "authenticate", "token": "<ACCOUNT_JWT>" }

// 3. 认证后订阅有权限的项目
{ "type": "subscribe", "project_id": "<PROJECT_UUID>" }

// 4. 保活；服务端响应 { "type": "pong" }
{ "type": "ping" }`;

function MethodBadge({ method }: { method: string }) {
  const tone = method === 'GET'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : method === 'DELETE'
      ? 'bg-rose-50 text-rose-700 ring-rose-200'
      : 'bg-blue-50 text-blue-700 ring-blue-200';
  return <span className={`inline-flex w-fit rounded-md px-2 py-1 text-[11px] font-bold ring-1 ring-inset ${tone}`}>{method}</span>;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 max-w-full overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100 sm:text-sm">
      <code>{children}</code>
    </pre>
  );
}

function SectionTitle({ children, description }: { children: string; description?: string }) {
  return (
    <div>
      <h3 className="font-semibold text-slate-950">{children}</h3>
      {description && <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}
    </div>
  );
}

export function ProtocolsPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<GuideSection>('device');

  return (
    <div className={embedded ? 'text-slate-950' : 'min-h-screen overflow-x-hidden bg-slate-50 text-slate-950'}>
      {!embedded && (
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
              返回首页
            </button>
            <div className="flex shrink-0 items-center gap-2" aria-label="ROC Platform">
              <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600">
                <Zap className="size-5 text-white" aria-hidden="true" />
              </span>
              <span className="font-semibold">ROC Platform</span>
            </div>
          </div>
        </header>
      )}

      <div className={embedded ? 'space-y-6' : 'mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8'}>
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-blue-700">JSON Device Protocol · v1</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">文档指南</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            设备通过独立 WebSocket 常连接上报心跳与遥测并接收任务通知，再通过 HTTP(S) 接受任务、下载制品和回报状态；浏览器使用账户 JWT 按项目订阅数据库提交后的车辆与任务状态。ROC 二进制和任务轮询接口不再提供。
          </p>
        </div>

        <section className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
          <div className="flex gap-3">
            <KeyRound className="mt-0.5 size-5 shrink-0 text-indigo-700" aria-hidden="true" />
            <div><h2 className="font-semibold text-indigo-950">账户注册与邀请码</h2><p className="mt-1 text-sm leading-6 text-indigo-950/75">注册仅创建普通用户，并必须消费一个由超级管理员生成的一次性邀请码。</p></div>
          </div>
          <div className="mt-4 divide-y divide-indigo-200/70 border-t border-indigo-200/70">
            {invitationEndpoints.map((endpoint) => (
              <div key={`${endpoint.method}-${endpoint.path}`} className="grid gap-2 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                <MethodBadge method={endpoint.method} />
                <div className="min-w-0"><code className="break-all text-sm">{endpoint.path}</code><p className="mt-1 text-sm text-indigo-950/70">{endpoint.purpose}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="access-flow-heading" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['01', '注册车辆', '在项目车辆页创建车辆，由平台保存车辆与项目归属。'],
            ['02', '签发凭据', '生成单车 Device token 并立即保存；平台只保留摘要和尾号。'],
            ['03', '建立常连接', 'C++17 车端库携带 Device token 连接 /ws/device，并自动心跳和重连。'],
            ['04', '接收与交付', 'WebSocket 接收 task.available，再用 HTTP(S) 接受、下载、校验和回报。'],
          ].map(([step, title, description]) => (
            <div key={step} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-bold text-blue-700">{step}</span>
              <h2 id={step === '01' ? 'access-flow-heading' : undefined} className="mt-2 font-semibold">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
            </div>
          ))}
        </section>

        <div className="grid min-w-0 gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
          <nav aria-label="接入类型" className="self-start rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:sticky md:top-6">
            <div className="grid grid-cols-3 gap-2 md:grid-cols-1">
              {([
                ['device', Braces, '设备 JSON 通道'],
                ['tasks', PackageCheck, '持久设备任务'],
                ['realtime', Radio, '浏览器实时订阅'],
              ] as const).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={activeSection === id}
                  onClick={() => setActiveSection(id)}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors md:justify-start ${activeSection === id ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <Icon className="size-5" aria-hidden="true" /><span>{label}</span>
                </button>
              ))}
            </div>
          </nav>

          <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="flex items-start gap-4 border-b border-slate-200 pb-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
                {activeSection === 'device' ? <Braces className="size-6" /> : activeSection === 'tasks' ? <PackageCheck className="size-6" /> : <Radio className="size-6" />}
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">
                  {activeSection === 'device' ? '设备 JSON 常连接' : activeSection === 'tasks' ? '持久设备任务' : '浏览器项目订阅'}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {activeSection === 'device'
                    ? '车辆身份来自握手阶段的单车凭据，消息正文不能声明或覆盖车辆 ID。'
                    : activeSection === 'tasks'
                      ? 'WebSocket 只通知任务可用；接受、清单、制品与状态均通过带租约的 HTTP(S) 完成。'
                      : '面向登录工作台，按项目接收已经持久化的车辆快照和增量事件。'}
                </p>
              </div>
            </div>

            {activeSection === 'device' && (
              <div className="mt-6 space-y-9">
                <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
                  <div className="flex gap-3">
                    <KeyRound className="mt-0.5 size-5 shrink-0 text-blue-700" aria-hidden="true" />
                    <div>
                      <h3 className="font-semibold text-blue-950">单车凭据管理</h3>
                      <p className="mt-1 text-sm leading-6 text-blue-950/75">
                        凭据管理接口使用 <code>Authorization: Bearer &lt;ACCOUNT_JWT&gt;</code>，仅车辆所有者或超级管理员可操作。
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 divide-y divide-blue-200/70 border-t border-blue-200/70">
                    {credentialEndpoints.map((endpoint) => (
                      <div key={`${endpoint.method}-${endpoint.path}`} className="grid gap-2 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                        <MethodBadge method={endpoint.method} />
                        <div className="min-w-0"><code className="break-all text-sm">{endpoint.path}</code><p className="mt-1 text-sm text-blue-950/70">{endpoint.purpose}</p></div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionTitle description="Demo 使用 ws://公网IP:端口/ws/device；正式部署切换为同源 wss://。Authorization 仅在 WebSocket 升级请求中发送。">连接与鉴权</SectionTitle>
                  <div className="mt-3 rounded-xl border border-slate-200 p-4 text-sm leading-6">
                    <p><code>GET /ws/device</code></p>
                    <p className="mt-2 text-slate-600">请求头：<code>Authorization: Device &lt;DEVICE_TOKEN&gt;</code></p>
                    <p className="mt-2 text-slate-600">服务端从 token 摘要映射车辆；同一车辆的新连接会替换旧连接。</p>
                  </div>
                  <CodeBlock>{helloExample}</CodeBlock>
                </section>

                <section>
                  <SectionTitle description="全局硬上限为 64 KiB；heartbeat 最大 4 KiB，telemetry 最大 16 KiB。sequence 使用十进制字符串避免跨语言 64 位整数精度问题。">统一消息外壳</SectionTitle>
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[44rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">字段</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">要求</th><th className="px-4 py-3">说明</th></tr></thead>
                      <tbody className="divide-y divide-slate-200">
                        {envelopeFields.map(([field, type, required, description]) => <tr key={field}><td className="px-4 py-3 font-mono text-xs text-slate-950">{field}</td><td className="px-4 py-3 text-slate-600">{type}</td><td className="px-4 py-3 text-slate-600">{required}</td><td className="px-4 py-3 text-slate-600">{description}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <SectionTitle description="建议每 30 秒发送；45 秒没有有效设备消息时服务端关闭连接。车端库应使用带抖动的指数退避自动重连。">心跳</SectionTitle>
                  <CodeBlock>{heartbeatExample}</CodeBlock>
                </section>

                <section>
                  <SectionTitle description="遥测是完整快照。百分比字段为 0–100，位置和速度字段必须是有限数值。">遥测</SectionTitle>
                  <CodeBlock>{telemetryExample}</CodeBlock>
                  <p className="mt-3 text-sm leading-6 text-slate-600">服务端在同一次数据库更新中写入遥测、递增浏览器版本并保存最后设备 sequence，提交成功后才向项目订阅者广播。</p>
                </section>

                <section>
                  <SectionTitle description="重复 sequence 返回 duplicate=true，不再次写入遥测；格式、版本和状态错误返回 type=error。">确认与幂等</SectionTitle>
                  <CodeBlock>{ackExample}</CodeBlock>
                </section>

                <aside className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                  <strong>任务通知已启用：</strong>保持本连接即可接收 <code>task.available</code>；服务端在车辆重连时补发仍处于 offered 的任务，不提供任务轮询接口。
                </aside>
              </div>
            )}

            {activeSection === 'tasks' && (
              <div className="mt-6 space-y-9">
                <section>
                  <SectionTitle description="平台先持久化批次和逐车任务，再向在线车辆发送通知；通知丢失时由重连补发保证发现任务。">通知与重连</SectionTitle>
                  <CodeBlock>{taskAvailableExample}</CodeBlock>
                </section>

                <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
                  <SectionTitle description="账户接口使用 Bearer ACCOUNT_JWT 并校验项目权限；地图上传使用 multipart/form-data 的 name 与 image 字段，部署 idempotency_key 在项目和创建者范围内去重。">账户端资源与批次接口</SectionTitle>
                  <div className="mt-4 divide-y divide-blue-200/70 border-t border-blue-200/70">
                    {accountTaskEndpoints.map((endpoint) => (
                      <div key={`${endpoint.method}-${endpoint.path}`} className="grid gap-2 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                        <MethodBadge method={endpoint.method} />
                        <div className="min-w-0"><code className="break-all text-sm">{endpoint.path}</code><p className="mt-1 text-sm text-blue-950/70">{endpoint.purpose}</p></div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionTitle description="所有接口同时要求 Authorization: Device <DEVICE_TOKEN>。accept 之外还须发送 X-Task-Lease；租约只绑定当前车辆、任务和尝试次数。">车端任务接口</SectionTitle>
                  <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 px-4">
                    {taskEndpoints.map((endpoint) => (
                      <div key={`${endpoint.method}-${endpoint.path}`} className="grid gap-2 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                        <MethodBadge method={endpoint.method} />
                        <div className="min-w-0"><code className="break-all text-sm">{endpoint.path}</code><p className="mt-1 text-sm text-slate-600">{endpoint.purpose}</p></div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionTitle description="允许的主路径为 accepted → downloading → delivering → delivered；失败可从活动状态进入 failed。progress 只能递增，delivered 必须为 100。">状态与幂等</SectionTitle>
                  <CodeBlock>{taskStatusExample}</CodeBlock>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                    <li><code>event_id</code> 全局唯一；同一事件重试返回当前任务，不重复写事件。</li>
                    <li>租约为 30 分钟；接受/下载阶段超时且未超过三次可重新投递，交付中超时进入失败。</li>
                    <li>道路制品返回 JSON；地图制品返回平台上传的原始图片。响应头 <code>X-Content-SHA256</code> 与 manifest 一致。</li>
                    <li>制品只支持完整下载，携带 <code>Range</code> 会返回 416；车端必须校验字节数、MIME 和 SHA-256，截断或哈希不匹配时回报 <code>failed</code>。</li>
                    <li>平台“已送达”只表示车端已校验并保存/交给本地适配器，不表示地图已被车辆加载或应用。</li>
                  </ul>
                </section>
              </div>
            )}

            {activeSection === 'realtime' && (
              <div className="mt-6 space-y-9">
                <section>
                  <SectionTitle description="连接地址与当前站点同源：Demo 的 HTTP 对应 ws://，正式 HTTPS 对应 wss://。">连接入口</SectionTitle>
                  <div className="mt-3 rounded-xl border border-slate-200 p-4"><code className="text-sm">GET /ws/status</code></div>
                  <CodeBlock>{browserWebsocketFlow}</CodeBlock>
                </section>
                <section>
                  <SectionTitle description="订阅成功立即返回 snapshot，之后仅推送该项目的增量事件。">服务端消息</SectionTitle>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[
                      ['snapshot', 'project_id + vehicles，项目当前车辆快照'],
                      ['vehicle_created', 'project_id + vehicle，新建车辆'],
                      ['vehicle_updated', 'project_id + vehicle，状态、连接或配置更新'],
                      ['vehicle_deleted', 'project_id + vehicle_id，车辆删除'],
                      ['deployment_created', 'project_id + deployment，新建持久下发批次'],
                      ['deployment_updated', 'project_id + deployment，批次取消或状态变化'],
                      ['deployment_task_updated', 'project_id + task，单车任务状态变化'],
                      ['error', 'code + message，鉴权、权限或格式错误'],
                      ['pong', '对浏览器 ping 的保活响应'],
                    ].map(([type, description]) => <div key={type} className="rounded-lg bg-slate-50 p-4"><code className="text-sm font-semibold text-blue-700">{type}</code><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div>)}
                  </div>
                </section>
                <section>
                  <SectionTitle>权限与连接约束</SectionTitle>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                    <li>首条浏览器消息必须是 <code>authenticate</code>；5 秒内未认证会断开连接。</li>
                    <li>普通用户只能订阅自己拥有的项目；超级管理员可以订阅任意项目。</li>
                    <li>账户停用或项目权限被撤销后，推送前会再次校验并移除订阅。</li>
                    <li>单条浏览器消息最大 16 KiB；建议每 15 秒发送 <code>ping</code> 并实现指数退避重连。</li>
                  </ul>
                </section>
              </div>
            )}

            <aside className="mt-8 flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <Braces className="mt-0.5 size-5 shrink-0 text-blue-700" aria-hidden="true" />
              <p><strong className="text-slate-950">机器可读合同：</strong> REST API 见 <code>roc-backend/schemas/openapi-v1.json</code>；设备通信、路网与下发任务分别见同目录下的三份 v1 JSON Schema。</p>
            </aside>

            <aside className="mt-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p><strong>Demo 边界：</strong>公网 HTTP/WS 只用于测试账号和测试数据。正式部署必须启用 HTTPS/WSS、Origin 白名单并轮换 JWT 密钥、测试密码和 Device token。</p>
            </aside>
          </article>
        </div>
      </div>
    </div>
  );
}
