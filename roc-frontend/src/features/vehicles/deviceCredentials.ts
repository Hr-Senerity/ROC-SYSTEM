export function describeDeviceCredential(vehicleName?: string) {
  const name = vehicleName ? `“${vehicleName}”` : '该车辆';
  return `为${name}生成独立凭据。该 Device Token 已唯一映射此车辆；连接成功后平台会通过 hello.payload.vehicle_id 返回车辆 ID，heartbeat 与 telemetry 正文不得重复携带 vehicle_id 或 robot_id。凭据仅在生成后显示一次。`;
}
