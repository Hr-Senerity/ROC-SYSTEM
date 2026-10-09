import type { PointerEvent } from 'react';
import { worldToMap, type CoordinateMetadata } from '../../features/maps/coordinates';
import type { RoadNetwork } from '../../features/road-network/model';
import type { EditorSelection } from './types';

interface EdgeLayerProps {
  network: RoadNetwork;
  selection: EditorSelection;
  coordinateMetadata: CoordinateMetadata;
  scale: number;
  onPointerDown: (event: PointerEvent<SVGElement>, edgeId: string) => void;
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
    const geometry = edge.geometry;
    const control1 = geometry.type === 'cubic_bezier' ? worldToMap(geometry.control1, coordinateMetadata) : null;
    const control2 = geometry.type === 'cubic_bezier' ? worldToMap(geometry.control2, coordinateMetadata) : null;
    const path = geometry.type === 'cubic_bezier' && control1 && control2
      ? `M ${from.x} ${from.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${to.x} ${to.y}`
      : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    return [
      <g key={edge.id} data-edge-id={edge.id}>
        <path
          d={path}
          stroke={selected ? '#f59e0b' : '#2563eb'}
          strokeWidth={(selected ? 5 : 3) / scale}
          strokeLinecap="round"
          fill="none"
          markerEnd={edge.direction === 'forward' ? 'url(#road-arrow)' : undefined}
        />
        <path
          d={path}
          stroke="transparent" strokeWidth={16 / scale} fill="none"
          className="cursor-pointer"
          onPointerDown={(event) => onPointerDown(event, edge.id)}
        />
      </g>,
    ];
  });
}
