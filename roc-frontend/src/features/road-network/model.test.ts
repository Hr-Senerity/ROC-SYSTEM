import { describe, expect, it } from 'vitest';
import { canonicalRoadNetwork, emptyRoadNetwork, validateRoadNetwork } from './model';

describe('road network model', () => {
  it('rejects dangling and self-loop edges', () => {
    const network = emptyRoadNetwork('metric');
    network.nodes.push({ id: 'a', x: 0, y: 0, kind: 'waypoint', label: 'A' });
    network.edges.push({ id: 'bad', from: 'a', to: 'a', direction: 'both', max_speed_mps: null, geometry: { type: 'line' } });
    expect(validateRoadNetwork(network, 'metric')).toContain('边 bad 不能形成自环');
  });

  it('treats reversed bidirectional edges as duplicates', () => {
    const network = emptyRoadNetwork('metric');
    network.nodes.push(
      { id: 'a', x: 0, y: 0, kind: 'waypoint', label: 'A' },
      { id: 'b', x: 1, y: 1, kind: 'waypoint', label: 'B' },
    );
    network.edges.push(
      { id: 'e1', from: 'a', to: 'b', direction: 'both', max_speed_mps: null, geometry: { type: 'line' } },
      { id: 'e2', from: 'b', to: 'a', direction: 'both', max_speed_mps: null, geometry: { type: 'line' } },
    );
    expect(validateRoadNetwork(network, 'metric')).toContain('边 e2 与已有连接重复');
  });

  it('accepts cubic control points and emits schema v2 editor data', () => {
    const network = emptyRoadNetwork('metric');
    network.nodes.push(
      { id: 'a', x: 0, y: 0, kind: 'waypoint', label: 'A' },
      { id: 'b', x: 2, y: 0, kind: 'waypoint', label: 'B' },
    );
    network.edges.push({
      id: 'curve', from: 'a', to: 'b', direction: 'forward', max_speed_mps: 1,
      geometry: { type: 'cubic_bezier', control1: { x: 0.5, y: 1 }, control2: { x: 1.5, y: 1 } },
    });
    expect(validateRoadNetwork(network, 'metric')).toEqual([]);
    expect(canonicalRoadNetwork(network).schema_version).toBe(2);
  });

  it('canonicalizes node and edge order', () => {
    const network = emptyRoadNetwork('legacy-normalized');
    network.nodes.push(
      { id: 'b', x: 2, y: 2, kind: 'waypoint', label: 'B' },
      { id: 'a', x: 1, y: 1, kind: 'waypoint', label: 'A' },
    );
    expect(canonicalRoadNetwork(network).nodes.map((node) => node.id)).toEqual(['a', 'b']);
  });
});
