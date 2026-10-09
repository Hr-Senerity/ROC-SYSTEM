import type { PointerEvent } from 'react';
import { worldToMap, type CoordinateMetadata } from '../../features/maps/coordinates';
import type { RoadNetwork } from '../../features/road-network/model';
import type { EditorSelection } from './types';

interface CurveControlLayerProps {
  network: RoadNetwork;
  selection: EditorSelection;
  coordinateMetadata: CoordinateMetadata;
  scale: number;
  onPointerDown: (
    event: PointerEvent<SVGCircleElement>, edgeId: string,
    control: 'control1' | 'control2',
  ) => void;
}

// Render after all edges and nodes: transparent edge hit areas and overlapping
// nodes must never intercept a selected curve's control handles.
export function CurveControlLayer({ network, selection, coordinateMetadata, scale, onPointerDown }: CurveControlLayerProps) {
  if (selection?.type !== 'edge') return null;
  const edge = network.edges.find((candidate) => candidate.id === selection.id);
  if (!edge || edge.geometry.type !== 'cubic_bezier') return null;
  const fromNode = network.nodes.find((node) => node.id === edge.from);
  const toNode = network.nodes.find((node) => node.id === edge.to);
  if (!fromNode || !toNode) return null;
  const from = worldToMap(fromNode, coordinateMetadata);
  const to = worldToMap(toNode, coordinateMetadata);
  const control1 = worldToMap(edge.geometry.control1, coordinateMetadata);
  const control2 = worldToMap(edge.geometry.control2, coordinateMetadata);
  if (!from || !to || !control1 || !control2) return null;

  return (
    <g aria-label="曲线控制柄">
      <path
        d={`M ${from.x} ${from.y} L ${control1.x} ${control1.y} M ${to.x} ${to.y} L ${control2.x} ${control2.y}`}
        stroke="#94a3b8" strokeWidth={1 / scale}
        strokeDasharray={`${4 / scale} ${3 / scale}`} fill="none" pointerEvents="none"
      />
      {([control1, control2] as const).map((point, index) => (
        <circle
          key={index}
          aria-label={`曲线控制点 ${index + 1}`}
          cx={point.x} cy={point.y} r={6 / scale}
          fill="white" stroke="#f59e0b" strokeWidth={2 / scale}
          className="cursor-move"
          onPointerDown={(event) => onPointerDown(event, edge.id, index === 0 ? 'control1' : 'control2')}
        />
      ))}
    </g>
  );
}
