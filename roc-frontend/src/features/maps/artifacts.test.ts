import { describe, expect, it } from 'vitest';
import { parseMapArtifactList } from './artifacts';

describe('map artifact model', () => {
  it('parses numeric database values and current artifact', () => {
    const artifact = {
      id: 'a1', map_id: 'm1', version: '2', content_type: 'image/png', byte_size: '1234',
      sha256: 'a'.repeat(64), image_width: '640', image_height: 480, created_at: '2026-09-19',
    };
    const parsed = parseMapArtifactList({ artifacts: [artifact], current_artifact: artifact });
    expect(parsed.current?.version).toBe(2);
    expect(parsed.current?.imageWidth).toBe(640);
  });

  it('accepts an empty artifact list', () => {
    expect(parseMapArtifactList({ artifacts: [], current_artifact: null }).current).toBeNull();
  });
});
