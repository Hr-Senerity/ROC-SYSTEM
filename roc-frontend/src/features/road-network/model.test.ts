import { describe, expect, it } from 'vitest';
import { canonicalRoadNetwork, emptyRoadNetwork, validateRoadNetwork } from './model';

describe('road network model', () => {
  it('rejects dangling and self-loop edges', () => {
    const network = emptyRoadNetwork('metric');
    network.nodes.push({ id: 'a', x: 0, y: 0, kind: 'waypoint', label: 'A' });
    network.edges.push({ id: 'bad', from: 'a', to: 'a', direction: 'both', max_speed_mps: null });
    expect(validateRoadNetwork(network, 'metric')).toContain('边 bad 不能形成自环');
  });

  it('treats reversed bidirectional edges as duplicates', () => {
    const network = emptyRoadNetwork('metric');
    network.nodes.push(
      { id: 'a', x: 0, y: 0, kind: 'waypoint', label: 'A' },
      { id: 'b', x: 1, y: 1, kind: 'waypoint', label: 'B' },
    );
    network.edges.push(
      { id: 'e1', from: 'a', to: 'b', direction: 'both', max_speed_mps: null },
      { id: 'e2', from: 'b', to: 'a', direction: 'both', max_speed_mps: null },
    );
    expect(validateRoadNetwork(network, 'metric')).toContain('边 e2 与已有连接重复');
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
