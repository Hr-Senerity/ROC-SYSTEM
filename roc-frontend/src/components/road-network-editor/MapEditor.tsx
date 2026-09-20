import type { PointerEvent, RefObject, WheelEvent } from 'react';
import type { CoordinateMetadata, Size } from '../../features/maps/coordinates';
import type { RoadNetwork, RoadNode } from '../../features/road-network/model';
import { EdgeLayer } from './EdgeLayer';
import { NodeLayer } from './NodeLayer';
import type { EditorSelection, EditorTool } from './types';

interface MapEditorProps {
  viewportRef: RefObject<HTMLDivElement>;
  mapName: string;
  mapImageSrc: string | null;
  mapImageError: string;
  network: RoadNetwork;
  selection: EditorSelection;
  connectFrom: string | null;
  tool: EditorTool;
  imageSize: Size;
  coordinateMetadata: CoordinateMetadata;
  transform: string;
  scale: number;
  zoom: number;
  onPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerFinish: (event: PointerEvent<SVGSVGElement>) => void;
  onWheel: (event: WheelEvent<SVGSVGElement>) => void;
  onNodePointerDown: (event: PointerEvent<SVGCircleElement>, node: RoadNode) => void;
  onEdgePointerDown: (event: PointerEvent<SVGLineElement>, edgeId: string) => void;
}

export function MapEditor(props: MapEditorProps) {
  const {
    viewportRef, mapName, mapImageSrc, mapImageError, network, selection,
    connectFrom, tool, imageSize, coordinateMetadata, transform, scale, zoom,
    onPointerDown, onPointerMove, onPointerFinish, onWheel,
    onNodePointerDown, onEdgePointerDown,
  } = props;
  const cursor = tool === 'pan'
    ? 'cursor-grab active:cursor-grabbing'
    : tool === 'add-node' ? 'cursor-crosshair' : 'cursor-default';
  const hint = tool === 'connect'
    ? (connectFrom ? '请选择终点；Esc 取消' : '请选择连边起点')
    : tool === 'add-node' ? '点击地图添加节点' : '中键或“平移”工具拖动画布';

  return (
    <section ref={viewportRef} className="relative min-h-[480px] min-w-0 overflow-hidden bg-slate-200 touch-none">
      <svg
        className={`absolute inset-0 size-full ${cursor}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerFinish}
        onPointerCancel={onPointerFinish}
        onWheel={onWheel}
        aria-label={`${mapName} 路网编辑画布`}
      >
        <defs>
          <marker id="road-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L8,4 L0,8 z" fill="#2563eb" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="#e2e8f0" />
        <g transform={transform}>
          <rect width={imageSize.width} height={imageSize.height} fill="white" stroke="#94a3b8" strokeWidth={1 / scale} />
          {mapImageSrc
            ? <image href={mapImageSrc} width={imageSize.width} height={imageSize.height} preserveAspectRatio="none" />
            : <text x={imageSize.width / 2} y={imageSize.height / 2} textAnchor="middle" fill="#64748b" fontSize={16 / scale}>{mapImageError || '正在加载地图…'}</text>}
          <EdgeLayer network={network} selection={selection} coordinateMetadata={coordinateMetadata} scale={scale} onPointerDown={onEdgePointerDown} />
          <NodeLayer network={network} selection={selection} connectFrom={connectFrom} coordinateMetadata={coordinateMetadata} scale={scale} onPointerDown={onNodePointerDown} />
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm">
        {hint} · {Math.round(zoom * 100)}%
      </div>
    </section>
  );
}
