import { Trash2 } from 'lucide-react';
import type { RoadEdge, RoadNode } from '../../features/road-network/model';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface PropertiesPanelProps {
  selectedNode: RoadNode | null;
  selectedEdge: RoadEdge | null;
  onBeginEdit: () => void;
  onFinishEdit: () => void;
  onNodeLabelChange: (label: string) => void;
  onEdgeDirectionChange: (direction: RoadEdge['direction']) => void;
  onEdgeSpeedChange: (speed: number | null) => void;
  onDelete: () => void;
}

export function PropertiesPanel(props: PropertiesPanelProps) {
  const {
    selectedNode, selectedEdge, onBeginEdit, onFinishEdit,
    onNodeLabelChange, onEdgeDirectionChange, onEdgeSpeedChange, onDelete,
  } = props;
  return (
    <div className="border-b border-slate-200 p-4">
      <h2 className="font-semibold text-slate-950">属性</h2>
      {!selectedNode && !selectedEdge && <p className="mt-3 text-sm text-slate-500">选择一个节点或边以编辑属性。</p>}
      {selectedNode && (
        <div className="mt-4 space-y-4">
          <Field label="节点 ID"><Input value={selectedNode.id} disabled /></Field>
          <Field label="标签">
            <Input value={selectedNode.label} maxLength={128} onFocus={onBeginEdit} onBlur={onFinishEdit} onChange={(event) => onNodeLabelChange(event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="X"><Input value={selectedNode.x.toFixed(3)} disabled /></Field>
            <Field label="Y"><Input value={selectedNode.y.toFixed(3)} disabled /></Field>
          </div>
          <Button variant="outline" className="w-full text-red-700" onClick={onDelete}><Trash2 />删除节点</Button>
        </div>
      )}
      {selectedEdge && (
        <div className="mt-4 space-y-4">
          <Field label="边 ID"><Input value={selectedEdge.id} disabled /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="起点"><Input value={selectedEdge.from} disabled /></Field>
            <Field label="终点"><Input value={selectedEdge.to} disabled /></Field>
          </div>
          <Field label="方向">
            <select
              value={selectedEdge.direction}
              onChange={(event) => onEdgeDirectionChange(event.target.value as RoadEdge['direction'])}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="both">双向</option><option value="forward">起点 → 终点</option>
            </select>
          </Field>
          <Field label="最大速度（m/s，可留空）">
            <Input
              type="number" min="0.01" max="100" step="0.1"
              value={selectedEdge.max_speed_mps ?? ''}
              onFocus={onBeginEdit} onBlur={onFinishEdit}
              onChange={(event) => onEdgeSpeedChange(event.target.value === '' ? null : Number(event.target.value))}
            />
          </Field>
          <Button variant="outline" className="w-full text-red-700" onClick={onDelete}><Trash2 />删除边</Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>{children}</label>;
}
