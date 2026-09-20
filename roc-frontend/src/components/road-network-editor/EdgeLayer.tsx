import type { PointerEvent } from 'react';
import { worldToMap, type CoordinateMetadata } from '../../features/maps/coordinates';
import type { RoadNetwork } from '../../features/road-network/model';
import type { EditorSelection } from './types';

interface EdgeLayerProps {
  network: RoadNetwork;
  selection: EditorSelection;
  coordinateMetadata: CoordinateMetadata;
  scale: number;
  onPointerDown: (event: PointerEvent<SVGLineElement>, edgeId: string) => void;
}

export function EdgeLayer({ network, selection, coordinateMetadata, scale, onPointerDown }: EdgeLayerProps) {
  return network.edges.flatMap((edge) => {
    const fromNode = network.nodes.find((node) => node.id === edge.from);
    const toNode = network.nodes.find((node) => node.id === edge.to);
    if (!fromNode || !toNode) return [];
    const from = worldToMap(fromNode, coordinateMetadata);
    const to = worldToMap(toNode, coordinateMetadata);
    if (!from || !to) return [];
    const selected = selection?.type === 'edge' && selection.id === edge.id;
    return [
      <g key={edge.id} data-edge-id={edge.id}>
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={selected ? '#f59e0b' : '#2563eb'}
          strokeWidth={(selected ? 5 : 3) / scale}
          strokeLinecap="round"
          markerEnd={edge.direction === 'forward' ? 'url(#road-arrow)' : undefined}
        />
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="transparent" strokeWidth={16 / scale}
          className="cursor-pointer"
          onPointerDown={(event) => onPointerDown(event, edge.id)}
        />
      </g>,
    ];
  });
}
