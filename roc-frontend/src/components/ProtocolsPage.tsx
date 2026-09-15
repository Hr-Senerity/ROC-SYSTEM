import { useState } from 'react';
import {
  ArrowLeft, Braces, Code2, KeyRound, Radio, ShieldAlert, Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type ProtocolType = 'json' | 'roc' | 'realtime';

const deviceEndpoints = [
  { method: 'POST', path: '/api/protocol/status', purpose: '上报 JSON 遥测快照；写入数据库后触发项目实时事件' },
  { method: 'POST', path: '/api/protocol/command', purpose: '向指定车辆的内存队列写入 JSON 控制指令' },
  { method: 'GET', path: '/api/protocol/pending/{robot_id}', purpose: '读取并清空该车辆当前的待执行指令' },
] as const;

const credentialEndpoints = [
  { method: 'GET', path: '/api/vehicles/{vehicle_id}/device-token', purpose: '查看是否已配置、是否启用及凭据尾号' },
  { method: 'POST', path: '/api/vehicles/{vehicle_id}/device-token', purpose: '首次签发或轮换凭据；明文仅在本次响应中出现' },
  { method: 'DELETE', path: '/api/vehicles/{vehicle_id}/device-token', purpose: '立即撤销该车辆的设备凭据' },
] as const;

const statusFields = [
  ['robot_id', 'string · UUID', '必填', '平台车辆 ID，必须与 Device token 对应'],
  ['online', 'boolean', '遥测至少一项', '在线状态；最终映射为 online / offline'],
  ['cpu_usage', 'number', '遥测至少一项', 'CPU 使用率，0–100'],
  ['memory_usage', 'number', '遥测至少一项', '内存使用率，0–100'],
  ['battery_level', 'integer', '遥测至少一项', '电量，0–100'],
  ['localization_confidence', 'number', '遥测至少一项', '定位置信度，0–100'],
  ['position', 'object', '遥测至少一项', '{ x, y, theta }，各值须为有限数值'],
  ['velocity', 'object', '遥测至少一项', '{ linear, angular }，各值须为有限数值'],
] as const;

const jsonExample = `{
  "robot_id": "8e2cb75e-27f3-4772-a9c1-b5d4b750ac75",
  "online": true,
  "cpu_usage": 32.4,
  "memory_usage": 48.1,
  "battery_level": 85,
  "localization_confidence": 96.5,
  "position": { "x": 1.5, "y": 2.3, "theta": 0.5 },
  "velocity": { "linear": 0.4, "angular": 0.1 }
}`;

const curlExample = `curl -X POST "https://<HOST>/api/protocol/status" \\
  -H "Authorization: Device <DEVICE_TOKEN>" \\
  -H "Content-Type: application/json" \\
  --data '${jsonExample}'`;

const commandExample = `{
  "robot_id": "8e2cb75e-27f3-4772-a9c1-b5d4b750ac75",
  "command_type": "move",
  "linear_x": 0.4,
  "linear_y": 0,
  "linear_z": 0,
  "angular_x": 0,
  "angular_y": 0,
  "angular_z": 0.1,
  "task_params": "{\\"task_id\\":\\"demo-001\\"}"
}`;

const rocFrame = `偏移   长度      类型       内容
0      4 byte    uint32     Magic = 0x524F4320 ("ROC ")
4      2 byte    uint16     Type = 0x0001 (STATUS_REPORT)
6      4 byte    uint32     Payload 字节长度 N
10     N byte    bytes      状态负载`;

const rocPayload = `顺序   类型                 字段
1      uint16 + UTF-8      robot_id 字节长度 + UUID
2      uint8               online (0 / 1)
3      float64             cpu_usage
4      float64             memory_usage
5      int32               battery_level
6      float64             localization_confidence
7      float64             position_x
8      float64             position_y
9      float64             position_theta
10     float64             velocity_linear
11     float64             velocity_angular`;

const websocketFlow = `// 1. 服务端连接成功后发送
{ "type": "hello", "authentication": "first_message", "protocol_version": 1 }

// 2. 客户端必须在 5 秒内发送 JWT（不是 Device token）
{ "type": "authenticate", "token": "<ACCOUNT_JWT>" }

// 3. 收到 authenticated 后订阅有权限的项目
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
  const [activeProtocol, setActiveProtocol] = useState<ProtocolType>('json');

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
          <p className="text-sm font-semibold text-blue-700">设备与应用接入参考 · v1</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">文档指南</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            本页以当前后端实现为准。设备使用单车凭据上报数据，网页或业务客户端使用账户 JWT 订阅项目实时状态。
          </p>
        </div>

        <section aria-labelledby="access-flow-heading" className="grid gap-3 sm:grid-cols-3">
          {[
            ['01', '注册车辆', '在项目的车辆管理页创建车辆，记录车辆 UUID。'],
            ['02', '签发凭据', '生成单车 Device token 并立即安全保存，明文不会再次展示。'],
            ['03', '接入与订阅', '设备携带凭据上报；登录客户端以 JWT 订阅所属项目。'],
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
                ['json', Braces, 'JSON HTTP'],
                ['roc', Code2, 'ROC 二进制'],
                ['realtime', Radio, '实时订阅'],
              ] as const).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={activeProtocol === id}
                  onClick={() => setActiveProtocol(id)}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors md:justify-start ${activeProtocol === id ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <Icon className="size-5" aria-hidden="true" /><span>{label}</span>
                </button>
              ))}
            </div>
          </nav>

          <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="flex items-start gap-4 border-b border-slate-200 pb-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
                {activeProtocol === 'json' && <Braces className="size-6" />}
                {activeProtocol === 'roc' && <Code2 className="size-6" />}
                {activeProtocol === 'realtime' && <Radio className="size-6" />}
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">
                  {activeProtocol === 'json' && 'JSON HTTP 接口'}
                  {activeProtocol === 'roc' && 'ROC 二进制状态帧'}
                  {activeProtocol === 'realtime' && 'WebSocket 实时订阅'}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {activeProtocol === 'json' && '状态上报、控制消息和设备指令轮询。'}
                  {activeProtocol === 'roc' && '适用于以紧凑二进制格式上报完整车辆状态。'}
                  {activeProtocol === 'realtime' && '面向登录客户端，按项目接收已持久化的车辆事件。'}
                </p>
              </div>
            </div>

            {activeProtocol === 'json' && (
              <div className="mt-6 space-y-9">
                <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
                  <div className="flex gap-3">
                    <KeyRound className="mt-0.5 size-5 shrink-0 text-blue-700" aria-hidden="true" />
                    <div>
                      <h3 className="font-semibold text-blue-950">先获取单车凭据</h3>
                      <p className="mt-1 text-sm leading-6 text-blue-950/75">
                        以下凭据管理接口使用 <code>Authorization: Bearer &lt;ACCOUNT_JWT&gt;</code>，且仅车辆所有者或超级管理员可操作。
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
                  <SectionTitle description="三个入口均要求 Authorization: Device &lt;DEVICE_TOKEN&gt;，token 与 robot_id 必须属于同一辆车。">设备接口</SectionTitle>
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                    <div className="divide-y divide-slate-200">
                      {deviceEndpoints.map((endpoint) => (
                        <div key={endpoint.path} className="grid gap-2 p-4 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                          <MethodBadge method={endpoint.method} />
                          <div className="min-w-0">
                            <code className="break-all text-sm text-slate-950">{endpoint.path}</code>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{endpoint.purpose}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section>
                  <SectionTitle description="当前接口按完整快照写入；未提供的遥测字段会使用默认值，因此设备端应发送完整字段集合。">状态请求字段</SectionTitle>
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[42rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">字段</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">要求</th><th className="px-4 py-3">说明</th></tr></thead>
                      <tbody className="divide-y divide-slate-200">
                        {statusFields.map(([field, type, required, description]) => <tr key={field}><td className="px-4 py-3 font-mono text-xs text-slate-950">{field}</td><td className="px-4 py-3 text-slate-600">{type}</td><td className="px-4 py-3 text-slate-600">{required}</td><td className="px-4 py-3 text-slate-600">{description}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                  <CodeBlock>{jsonExample}</CodeBlock>
                </section>

                <section>
                  <SectionTitle description="HOST 为部署域名或地址。生产环境必须使用 HTTPS。">状态上报示例</SectionTitle>
                  <CodeBlock>{curlExample}</CodeBlock>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-lg bg-emerald-50 p-3 text-emerald-900"><strong>200</strong><p className="mt-1">状态已持久化并接受</p></div>
                    <div className="rounded-lg bg-amber-50 p-3 text-amber-950"><strong>400</strong><p className="mt-1">JSON、字段或数值不合法</p></div>
                    <div className="rounded-lg bg-rose-50 p-3 text-rose-900"><strong>401</strong><p className="mt-1">凭据无效或车辆不匹配</p></div>
                  </div>
                </section>

                <section>
                  <SectionTitle description="command_type 必填；运动分量缺省为 0，task_params 是 JSON 字符串而不是嵌套对象。">控制指令示例</SectionTitle>
                  <CodeBlock>{commandExample}</CodeBlock>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    车辆随后调用 <code>GET /api/protocol/pending/&lt;robot_id&gt;</code> 获取 <code>{'{ "ok": true, "robot_id": "...", "commands": [...] }'}</code>。读取会清空当前队列，需由设备自行确认执行与重试策略；服务重启也不会保留此内存队列。
                  </p>
                </section>
              </div>
            )}

            {activeProtocol === 'roc' && (
              <div className="mt-6 space-y-9">
                <section>
                  <SectionTitle description="所有整数和浮点数均按网络字节序（大端）编码；头部固定为 10 字节。">状态帧头</SectionTitle>
                  <CodeBlock>{rocFrame}</CodeBlock>
                </section>
                <section>
                  <SectionTitle description="float64 为 IEEE 754 双精度；robot_id 必须是与凭据匹配的车辆 UUID。">状态负载顺序</SectionTitle>
                  <CodeBlock>{rocPayload}</CodeBlock>
                </section>
                <section>
                  <SectionTitle>HTTP 传输</SectionTitle>
                  <div className="mt-3 rounded-xl border border-slate-200 p-4 text-sm leading-6">
                    <div className="flex flex-wrap items-center gap-3"><MethodBadge method="POST" /><code className="break-all">/api/protocol/roc</code></div>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-600">
                      <li>请求头：<code>Authorization: Device &lt;DEVICE_TOKEN&gt;</code></li>
                      <li>内容类型：<code>application/octet-stream</code></li>
                      <li>成功返回 200；帧结构或消息类型错误返回 400；凭据不匹配返回 401。</li>
                    </ul>
                  </div>
                </section>
                <aside className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <strong>当前实现范围：</strong><code>/api/protocol/roc</code> 只接受消息类型 <code>0x0001 STATUS_REPORT</code>。虽然序列化器预留了控制帧与心跳类型，但当前 HTTP 接口尚未开放这两类二进制消息。
                </aside>
              </div>
            )}

            {activeProtocol === 'realtime' && (
              <div className="mt-6 space-y-9">
                <section>
                  <SectionTitle description="连接地址与当前站点同源：HTTPS 对应 wss://，HTTP 对应 ws://。">连接入口</SectionTitle>
                  <div className="mt-3 rounded-xl border border-slate-200 p-4"><code className="text-sm">GET /ws/status</code></div>
                  <CodeBlock>{websocketFlow}</CodeBlock>
                </section>
                <section>
                  <SectionTitle description="订阅成功立即返回 snapshot，之后仅推送该项目的增量事件。">服务端消息</SectionTitle>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[
                      ['snapshot', 'project_id + vehicles，项目当前车辆快照'],
                      ['vehicle_created', 'project_id + vehicle，新建车辆'],
                      ['vehicle_updated', 'project_id + vehicle，状态或配置更新'],
                      ['vehicle_deleted', 'project_id + vehicle_id，车辆删除'],
                      ['error', 'code + message，鉴权、权限或格式错误'],
                      ['pong', '对客户端 ping 的保活响应'],
                    ].map(([type, description]) => <div key={type} className="rounded-lg bg-slate-50 p-4"><code className="text-sm font-semibold text-blue-700">{type}</code><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div>)}
                  </div>
                </section>
                <section>
                  <SectionTitle>权限与连接约束</SectionTitle>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                    <li>首条客户端消息必须是 <code>authenticate</code>；5 秒内未认证会断开连接。</li>
                    <li>普通用户只能订阅自己拥有的项目；超级管理员可以订阅任意项目。</li>
                    <li>账户停用或项目权限被撤销后，推送前会再次校验并移除订阅。</li>
                    <li>单条客户端消息最大 16 KiB；建议每 15 秒发送一次 <code>ping</code> 并实现指数退避重连。</li>
                  </ul>
                </section>
              </div>
            )}

            <aside className="mt-8 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p><strong>安全边界：</strong>账户 JWT 与 Device token 用途不同，不得互换。平台只保存设备凭据摘要；生产环境须使用 TLS，并限制允许的 WebSocket Origin，设备接口不应以明文直接暴露到公网。</p>
            </aside>
          </article>
        </div>
      </div>
    </div>
  );
}
