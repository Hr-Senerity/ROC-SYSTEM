import { describe, expect, it } from 'vitest';

import { describeDeviceCredential } from './deviceCredentials';

describe('describeDeviceCredential', () => {
  it('说明 Token 唯一映射车辆且上报正文不重复携带车辆身份', () => {
    const description = describeDeviceCredential('巡检车 A');

    expect(description).toContain('“巡检车 A”');
    expect(description).toContain('hello.payload.vehicle_id');
    expect(description).toContain('不得重复携带 vehicle_id 或 robot_id');
    expect(description).not.toContain('必须同时使用车辆 ID');
  });
});
