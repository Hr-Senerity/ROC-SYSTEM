import { CircleDot, Focus, Hand, Link2, MousePointer2, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import type { ReactNode } from 'react';
import type { EditorTool } from './types';

interface ToolbarProps {
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function Toolbar({ tool, onToolChange, onZoomIn, onZoomOut, onFit }: ToolbarProps) {
  return (
    <aside aria-label="路网编辑工具" className="flex border-b border-slate-200 bg-white p-2 lg:flex-col lg:border-b-0 lg:border-r">
      <ToolButton active={tool === 'select'} icon={<MousePointer2 />} label="选择" onClick={() => onToolChange('select')} />
      <ToolButton active={tool === 'pan'} icon={<Hand />} label="平移" onClick={() => onToolChange('pan')} />
      <ToolButton active={tool === 'add-node'} icon={<CircleDot />} label="节点" onClick={() => onToolChange('add-node')} />
      <ToolButton active={tool === 'connect'} icon={<Link2 />} label="连边" onClick={() => onToolChange('connect')} />
      <ToolButton active={tool === 'delete'} icon={<Trash2 />} label="删除" onClick={() => onToolChange('delete')} />
      <div className="mx-1 my-2 border-l lg:border-l-0 lg:border-t" />
      <ToolButton icon={<ZoomIn />} label="放大" onClick={onZoomIn} />
      <ToolButton icon={<ZoomOut />} label="缩小" onClick={onZoomOut} />
      <ToolButton icon={<Focus />} label="适应" onClick={onFit} />
    </aside>
  );
}

function ToolButton({ active = false, icon, label, onClick }: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`flex min-w-14 flex-col items-center gap-1 rounded-md px-2 py-2 text-[11px] ${active ? 'bg-blue-50 font-medium text-blue-700 ring-1 ring-blue-200' : 'text-slate-600 hover:bg-slate-50'}`}
    >
      <span className="[&_svg]:size-4">{icon}</span>{label}
    </button>
  );
}
