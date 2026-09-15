import { describe, expect, it } from 'vitest';
import { mapToScreen, mapToWorld, screenToMap, worldToMap, type CoordinateMetadata } from './coordinates';

const metric: CoordinateMetadata = {
  mode: 'metric', image: { width: 1000, height: 500 }, origin: { x: 10, y: 20 }, originTheta: 0, resolution: 0.05,
};

describe('map coordinates', () => {
  it('maps the metric reference points', () => {
    expect(worldToMap({ x: 10, y: 20 }, metric)).toEqual({ x: 0, y: 500 });
    expect(worldToMap({ x: 60, y: 45 }, metric)).toEqual({ x: 1000, y: 0 });
  });

  it('round trips rotated world coordinates', () => {
    const metadata = { ...metric, originTheta: Math.PI / 3 };
    const source = { x: 31.25, y: 17.75 };
    const mapped = worldToMap(source, metadata)!;
    const restored = mapToWorld(mapped, metadata)!;
    expect(restored.x).toBeCloseTo(source.x, 9);
    expect(restored.y).toBeCloseTo(source.y, 9);
  });

  it('round trips screen coordinates with rectangular view, zoom and pan', () => {
    const transform = {
      viewport: { width: 1360, height: 700 }, image: metric.image,
      padding: 24, zoom: 2.3, pan: { x: 137, y: -42 },
    };
    const source = { x: 775.2, y: 123.4 };
    const restored = screenToMap(mapToScreen(source, transform), transform);
    expect(restored.x).toBeCloseTo(source.x, 9);
    expect(restored.y).toBeCloseTo(source.y, 9);
  });
});
