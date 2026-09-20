import type { PointerEvent } from 'react';
import { worldToMap, type CoordinateMetadata } from '../../features/maps/coordinates';
import type { RoadNetwork, RoadNode } from '../../features/road-network/model';
import type { EditorSelection } from './types';

interface NodeLayerProps {
  network: RoadNetwork;
  selection: EditorSelection;
  connectFrom: string | null;
  coordinateMetadata: CoordinateMetadata;
  scale: number;
  onPointerDown: (event: PointerEvent<SVGCircleElement>, node: RoadNode) => void;
}

export function NodeLayer({ network, selection, connectFrom, coordinateMetadata, scale, onPointerDown }: NodeLayerProps) {
  return network.nodes.flatMap((node) => {
    const point = worldToMap(node, coordinateMetadata);
    if (!point) return [];
    const selected = selection?.type === 'node' && selection.id === node.id;
    const connecting = connectFrom === node.id;
    return [
      <g key={node.id} data-node-id={node.id}>
        <circle
          cx={point.x} cy={point.y}
          r={(selected || connecting ? 10 : 7) / scale}
          fill={connecting ? '#8b5cf6' : selected ? '#f59e0b' : '#ffffff'}
          stroke={connecting ? '#6d28d9' : selected ? '#d97706' : '#1d4ed8'}
          strokeWidth={3 / scale}
          className="cursor-pointer"
          onPointerDown={(event) => onPointerDown(event, node)}
        />
        <text
          x={point.x + 11 / scale} y={point.y - 9 / scale}
          fontSize={12 / scale} fill="#0f172a" paintOrder="stroke"
          stroke="white" strokeWidth={3 / scale}
          className="pointer-events-none select-none"
        >
          {node.label || node.id}
        </text>
      </g>,
    ];
  });
}
