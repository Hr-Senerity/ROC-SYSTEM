import { describe, expect, it } from 'vitest';
import { parseBoolean, parseProjectMap } from './model';

describe('map DTO parsing', () => {
  it.each([[false, false], ['false', false], ['f', false], [true, true], ['true', true], ['t', true]])(
    'parses %p as %p',
    (input, expected) => expect(parseBoolean(input)).toBe(expected),
  );

  it('does not treat a false string as the default map', () => {
    expect(parseProjectMap({
      id: 'map-1', project_id: 'project-1', name: '仓库地图', image_url: null,
      is_active: 'false', created_at: '2026-09-15T00:00:00Z',
      coordinate_origin_x: '0', coordinate_origin_y: null, road_network: null,
    }).isDefault).toBe(false);
  });

  it('rejects unknown boolean encodings', () => {
    expect(() => parseBoolean('yes')).toThrow('布尔字段格式不正确');
  });
});
