import { ArrowLeft, Loader2, Redo2, Save, Undo2 } from 'lucide-react';
import { MapEditor } from './road-network-editor/MapEditor';
import { PropertiesPanel } from './road-network-editor/PropertiesPanel';
import { Toolbar } from './road-network-editor/Toolbar';
import { useRoadNetworkEditorController } from './road-network-editor/useRoadNetworkEditorController';
import { ValidationPanel } from './road-network-editor/ValidationPanel';
import { VersionPanel } from './road-network-editor/VersionPanel';
import { RoadNetworkDeployDialog } from './RoadNetworkDeployDialog';
import { Button } from './ui/button';

export function RoadNetworkEditorPage() {
  const editor = useRoadNetworkEditorController();

  if (editor.loading) {
    return <main className="grid min-h-screen place-items-center bg-slate-100 text-slate-600">正在加载路网编辑器…</main>;
  }
  if (!editor.map) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
        <div className="rounded-lg border bg-white p-6 text-center">
          <p className="text-red-700">{editor.error || '地图不存在'}</p>
          <Button className="mt-4" onClick={() => void editor.retry()}>重试</Button>
        </div>
      </main>
    );
  }

  const map = editor.map;
  return (
    <div
      ref={editor.workspaceRef}
      tabIndex={-1}
      aria-label="路网编辑工作区"
      onKeyDown={editor.handleKeyDown}
      className="flex min-h-screen flex-col bg-slate-100 outline-none"
    >
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={editor.exitEditor} aria-label="退出路网编辑器"><ArrowLeft /></Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-semibold text-slate-950">{map.name} · 路网编辑器</h1>
              {editor.dirty
                ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">未保存</span>
                : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">已保存</span>}
            </div>
            <p className="text-xs text-slate-500">
              {map.coordinateMode === 'metric' ? '米制坐标' : '旧版归一化坐标'} · {editor.network.nodes.length} 节点 · {editor.network.edges.length} 边
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={editor.past.length === 0} onClick={editor.undo}><Undo2 />撤销</Button>
          <Button variant="outline" size="sm" disabled={editor.future.length === 0} onClick={editor.redo}><Redo2 />重做</Button>
          {editor.currentRevision && editor.projectId && editor.mapId && (
            <RoadNetworkDeployDialog
              projectId={editor.projectId}
              mapId={editor.mapId}
              token={editor.token}
              revision={editor.currentRevision}
              dirty={editor.dirty}
            />
          )}
          <Button
            size="sm"
            disabled={!editor.dirty || editor.saving || !editor.coordinateReady}
            onClick={() => void editor.saveRevision()}
          >
            {editor.saving ? <Loader2 className="animate-spin" /> : <Save />}保存新版本
          </Button>
        </div>
      </header>

      {(editor.error || editor.notice || !editor.coordinateReady) && (
        <div className={`shrink-0 border-b px-4 py-2 text-sm ${editor.error || !editor.coordinateReady ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
          {editor.error || (!editor.coordinateReady ? '该米制地图缺少有效 resolution，无法进行坐标编辑。' : editor.notice)}
        </div>
      )}

      <main className="grid min-h-0 flex-1 lg:grid-cols-[72px_minmax(0,1fr)_320px]">
        <Toolbar
          tool={editor.tool}
          onToolChange={editor.changeTool}
          onZoomIn={editor.zoomIn}
          onZoomOut={editor.zoomOut}
          onFit={editor.fit}
        />

        <MapEditor
          viewportRef={editor.viewportRef}
          mapName={map.name}
          mapImageSrc={editor.mapImage.src}
          mapImageError={editor.mapImage.error}
          network={editor.network}
          selection={editor.selection}
          connectFrom={editor.connectFrom}
          tool={editor.tool}
          imageSize={editor.imageSize}
          coordinateMetadata={editor.coordinateMetadata}
          transform={editor.transform}
          scale={editor.scale}
          zoom={editor.zoom}
          onPointerDown={editor.handlePointerDown}
          onPointerMove={editor.handlePointerMove}
          onPointerFinish={editor.finishPointer}
          onWheel={editor.handleWheel}
          onNodePointerDown={editor.handleNodePointerDown}
          onEdgePointerDown={editor.handleEdgePointerDown}
        />

        <aside className="min-h-0 overflow-y-auto border-t border-slate-200 bg-white lg:border-l lg:border-t-0">
          <PropertiesPanel
            selectedNode={editor.selectedNode}
            selectedEdge={editor.selectedEdge}
            onBeginEdit={editor.beginPropertyEdit}
            onFinishEdit={editor.finishPropertyEdit}
            onNodeLabelChange={editor.changeNodeLabel}
            onEdgeDirectionChange={editor.changeEdgeDirection}
            onEdgeSpeedChange={editor.changeEdgeSpeed}
            onDelete={editor.deleteSelection}
          />
          <ValidationPanel errors={editor.validationErrors} expanded={editor.showValidation} />
          <VersionPanel
            revisions={editor.revisions}
            currentRevisionId={editor.currentRevisionId}
            loadingRevisionId={editor.loadingRevisionId}
            onLoad={(revision) => void editor.loadRevision(revision)}
          />
        </aside>
      </main>
    </div>
  );
}
