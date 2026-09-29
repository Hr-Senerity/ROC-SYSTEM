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

  it('parses PGM+YAML source metadata while keeping old rows compatible', () => {
    const imported = parseProjectMap({
      id: 'map-2', project_id: 'project-1', name: 'ROS 地图', image_url: '/image',
      is_active: false, created_at: '2026-09-29T00:00:00Z', coordinate_mode: 'metric',
      source_type: 'pgm-yaml', source_metadata: '{"mode":"trinary"}',
    });
    expect(imported.sourceType).toBe('pgm-yaml');
    expect(imported.sourceMetadata.mode).toBe('trinary');

    const legacy = parseProjectMap({
      id: 'map-3', project_id: 'project-1', name: '旧地图', image_url: null,
      is_active: false, created_at: '2026-09-29T00:00:00Z',
    });
    expect(legacy.sourceType).toBe('image');
    expect(legacy.sourceMetadata).toEqual({});
  });
});
