import { describe, expect, it } from 'vitest';
import { parseVehicle } from './model';

const base = { id: 'v1', name: '搬运车 1', ip: '10.0.0.8', status: 'online' };

describe('parseVehicle', () => {
  it('normalizes numeric strings and snake_case fields', () => {
    const vehicle = parseVehicle({
      ...base,
      project_id: 'p1',
      map_id: 'm1',
      cpu: '42.5',
      localization_confidence: '91',
      position_x: '12',
      position_y: 4,
      position_theta: '1.57',
      telemetry_version: '7',
      device_enabled: true,
      device_token_hint: 'a1b2c3d4',
      delivered_road_revision_id: 'r1',
    });
    expect(vehicle.projectId).toBe('p1');
    expect(vehicle.cpu).toBe(42.5);
    expect(vehicle.localizationConfidence).toBe(91);
    expect(vehicle.position).toEqual({ x: 12, y: 4, theta: 1.57 });
    expect(vehicle.deviceEnabled).toBe(true);
    expect(vehicle.deviceTokenHint).toBe('a1b2c3d4');
    expect(vehicle.deliveredRoadRevisionId).toBe('r1');
  });

  it('does not invent a position when a coordinate is missing', () => {
    expect(parseVehicle({ ...base, position_x: null, position_y: 2 }).position).toBeNull();
    expect(parseVehicle(base).deviceEnabled).toBe(false);
  });
});
