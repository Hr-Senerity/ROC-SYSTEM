import {
  useCallback, useEffect, useMemo, useRef, useState,
  type KeyboardEvent, type PointerEvent, type WheelEvent,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import {
  fitScale, mapToWorld, screenToMap, type Point, type Size, type ViewTransform,
} from '../../features/maps/coordinates';
import { parseProjectMapResponse, type ProjectMap } from '../../features/maps/model';
import { useAuthenticatedMapImage } from '../../features/maps/useAuthenticatedMapImage';
import {
  canonicalRoadNetwork, emptyRoadNetwork, parseRevisionList, parseRevisionResponse,
  parseRoadNetwork, roadNetworkSignature, validateRoadNetwork, type RoadEdge,
  type RoadNetwork, type RoadNetworkRevision, type RoadNode,
} from '../../features/road-network/model';
import { apiRequest } from '../../shared/api/client';
import { isAbortError } from '../../shared/api/errors';
import type { EditorSelection as Selection, EditorTool as Tool } from './types';

interface DragState {
  pointerId: number;
  kind: 'pan' | 'node';
  start: Point;
  initialPan: Point;
  initialNetwork: RoadNetwork;
  nodeId?: string;
  changed: boolean;
}

const MAX_HISTORY = 100;

function cloneNetwork(network: RoadNetwork): RoadNetwork {
  return {
    ...network,
    nodes: network.nodes.map((node) => ({ ...node })),
    edges: network.edges.map((edge) => ({ ...edge })),
  };
}

function newId(prefix: 'node' | 'edge'): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12)
    ?? Math.random().toString(36).slice(2, 14);
  return `${prefix}-${random}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function useRoadNetworkEditorController() {
  const { projectId, mapId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [map, setMap] = useState<ProjectMap | null>(null);
  const [network, setNetwork] = useState<RoadNetwork>(() => emptyRoadNetwork('legacy-normalized'));
  const [savedSignature, setSavedSignature] = useState('');
  const [revisions, setRevisions] = useState<RoadNetworkRevision[]>([]);
  const [currentRevisionId, setCurrentRevisionId] = useState<string | null>(null);
  const [past, setPast] = useState<RoadNetwork[]>([]);
  const [future, setFuture] = useState<RoadNetwork[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [selection, setSelection] = useState<Selection>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingRevisionId, setLoadingRevisionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [naturalImage, setNaturalImage] = useState<Size>({ width: 1000, height: 1000 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const propertyStartRef = useRef<RoadNetwork | null>(null);
  const restoringHistoryRef = useRef(false);
  const mapImage = useAuthenticatedMapImage(projectId, mapId, token, Boolean(map?.imageUrl));

  const dirty = Boolean(savedSignature) && roadNetworkSignature(network) !== savedSignature;
  const validationErrors = useMemo(
    () => validateRoadNetwork(network, map?.coordinateMode ?? network.coordinate_mode),
    [map?.coordinateMode, network],
  );

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    if (!projectId || !mapId) return;
    setLoading(true);
    setError('');
    try {
      const mapPayload = await apiRequest(`/api/projects/${projectId}/maps/${mapId}`, { token, signal });
      const loadedMap = parseProjectMapResponse(mapPayload);
      const listPayload = await apiRequest(
        `/api/projects/${projectId}/maps/${mapId}/road-network/revisions`,
        { token, signal },
      );
      const list = parseRevisionList(listPayload);
      let initial = emptyRoadNetwork(loadedMap.coordinateMode);
      if (list.current) {
        const revisionPayload = await apiRequest(
          `/api/projects/${projectId}/maps/${mapId}/road-network/revisions/${list.current.id}`,
          { token, signal },
        );
        const revision = parseRevisionResponse(revisionPayload);
        initial = revision.network ?? initial;
        setCurrentRevisionId(revision.id);
      } else if (loadedMap.roadNetwork) {
        try {
          const legacy = parseRoadNetwork(loadedMap.roadNetwork);
          if (legacy.coordinate_mode === loadedMap.coordinateMode) initial = legacy;
        } catch {
          setNotice('旧地图路网无法按 v1 规则读取，已从空白草稿开始。');
        }
      }
      setMap(loadedMap);
      setRevisions(list.revisions);
      setNetwork(initial);
      setSavedSignature(roadNetworkSignature(initial));
      setPast([]);
      setFuture([]);
    } catch (requestError) {
      if (!isAbortError(requestError)) {
        setError(requestError instanceof Error ? requestError.message : '无法加载路网编辑器');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [mapId, projectId, token]);

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, [loadWorkspace]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    if (!mapImage.src || map?.imageWidth || map?.imageHeight) return;
    const image = new Image();
    image.onload = () => setNaturalImage({ width: image.naturalWidth || 1000, height: image.naturalHeight || 1000 });
    image.src = mapImage.src;
    return () => { image.onload = null; };
  }, [map?.imageHeight, map?.imageWidth, mapImage.src]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const guardHistoryNavigation = () => {
      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false;
        return;
      }
      if (!dirty || window.confirm('当前草稿尚未保存，确定离开编辑器吗？')) return;
      restoringHistoryRef.current = true;
      window.history.forward();
    };
    window.addEventListener('popstate', guardHistoryNavigation);
    return () => window.removeEventListener('popstate', guardHistoryNavigation);
  }, [dirty]);

  const imageSize = useMemo<Size>(() => ({
    width: map?.imageWidth && map.imageWidth > 0 ? map.imageWidth : naturalImage.width,
    height: map?.imageHeight && map.imageHeight > 0 ? map.imageHeight : naturalImage.height,
  }), [map, naturalImage]);
  const viewTransform = useMemo<ViewTransform>(
    () => ({ viewport, image: imageSize, padding: 32, zoom, pan }),
    [imageSize, pan, viewport, zoom],
  );
  const coordinateMetadata = useMemo(() => ({
    mode: map?.coordinateMode ?? network.coordinate_mode,
    image: imageSize,
    origin: { x: map?.coordinateOriginX ?? 0, y: map?.coordinateOriginY ?? 0 },
    originTheta: map?.originTheta ?? 0,
    resolution: map?.resolution ?? null,
  }), [imageSize, map, network.coordinate_mode]);
  const coordinateReady = coordinateMetadata.mode === 'legacy-normalized'
    || Boolean(coordinateMetadata.resolution && coordinateMetadata.resolution > 0);
  const scale = viewport.width > 0 && viewport.height > 0 ? fitScale(viewTransform) * zoom : 1;
  const transform = `translate(${viewport.width / 2 + pan.x} ${viewport.height / 2 + pan.y}) scale(${scale}) translate(${-imageSize.width / 2} ${-imageSize.height / 2})`;

  const commit = useCallback((next: RoadNetwork) => {
    setNetwork((current) => {
      if (roadNetworkSignature(current) === roadNetworkSignature(next)) return current;
      setPast((items) => [...items, cloneNetwork(current)].slice(-MAX_HISTORY));
      setFuture([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((items) => {
      if (items.length === 0) return items;
      const previous = items[items.length - 1];
      setNetwork((current) => {
        setFuture((entries) => [cloneNetwork(current), ...entries].slice(0, MAX_HISTORY));
        return cloneNetwork(previous);
      });
      return items.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((items) => {
      if (items.length === 0) return items;
      const next = items[0];
      setNetwork((current) => {
        setPast((entries) => [...entries, cloneNetwork(current)].slice(-MAX_HISTORY));
        return cloneNetwork(next);
      });
      return items.slice(1);
    });
  }, []);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.type === 'edge') {
      commit({ ...network, edges: network.edges.filter((edge) => edge.id !== selection.id) });
    } else {
      const incident = network.edges.filter((edge) => edge.from === selection.id || edge.to === selection.id).length;
      if (incident > 0 && !window.confirm(`该节点连接了 ${incident} 条边，删除节点将同时删除这些边。是否继续？`)) return;
      commit({
        ...network,
        nodes: network.nodes.filter((node) => node.id !== selection.id),
        edges: network.edges.filter((edge) => edge.from !== selection.id && edge.to !== selection.id),
      });
    }
    setSelection(null);
    setConnectFrom((value) => value === selection.id ? null : value);
  }, [commit, network, selection]);

  const deleteNodeById = (nodeId: string) => {
    const incident = network.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId).length;
    if (incident > 0 && !window.confirm(`该节点连接了 ${incident} 条边，删除节点将同时删除这些边。是否继续？`)) return;
    commit({
      ...network,
      nodes: network.nodes.filter((node) => node.id !== nodeId),
      edges: network.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    });
    setSelection(null);
    setConnectFrom((value) => value === nodeId ? null : value);
  };

  const localPoint = (event: PointerEvent<SVGSVGElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const worldPoint = (screen: Point): Point | null => {
    if (!coordinateReady) return null;
    const point = screenToMap(screen, viewTransform);
    return mapToWorld({
      x: clamp(point.x, 0, imageSize.width),
      y: clamp(point.y, 0, imageSize.height),
    }, coordinateMetadata);
  };

  const addNode = (screen: Point) => {
    const position = worldPoint(screen);
    if (!position) return;
    const id = newId('node');
    const node: RoadNode = { id, x: position.x, y: position.y, kind: 'waypoint', label: `节点 ${network.nodes.length + 1}` };
    commit({ ...network, nodes: [...network.nodes, node] });
    setSelection({ type: 'node', id });
  };

  const connectNode = (nodeId: string) => {
    if (!connectFrom) {
      setConnectFrom(nodeId);
      setSelection({ type: 'node', id: nodeId });
      return;
    }
    if (connectFrom === nodeId) {
      setConnectFrom(null);
      return;
    }
    const exists = network.edges.some((edge) => edge.direction === 'both'
      && ((edge.from === connectFrom && edge.to === nodeId) || (edge.from === nodeId && edge.to === connectFrom)));
    if (exists) {
      setNotice('这两个节点之间已存在双向连接。');
      setConnectFrom(null);
      return;
    }
    const edge: RoadEdge = { id: newId('edge'), from: connectFrom, to: nodeId, direction: 'both', max_speed_mps: null };
    commit({ ...network, edges: [...network.edges, edge] });
    setSelection({ type: 'edge', id: edge.id });
    setConnectFrom(null);
  };

  const handleNodePointerDown = (event: PointerEvent<SVGCircleElement>, node: RoadNode) => {
    event.stopPropagation();
    workspaceRef.current?.focus();
    if (tool === 'connect') { connectNode(node.id); return; }
    setSelection({ type: 'node', id: node.id });
    if (tool === 'delete') { deleteNodeById(node.id); return; }
    if (tool !== 'select' || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      kind: 'node',
      start: { x: event.clientX, y: event.clientY },
      initialPan: pan,
      initialNetwork: cloneNetwork(network),
      nodeId: node.id,
      changed: false,
    };
  };

  const handleEdgePointerDown = (event: PointerEvent<SVGLineElement>, edgeId: string) => {
    event.stopPropagation();
    workspaceRef.current?.focus();
    if (tool === 'delete') {
      commit({ ...network, edges: network.edges.filter((edge) => edge.id !== edgeId) });
      setSelection(null);
      return;
    }
    setSelection({ type: 'edge', id: edgeId });
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    workspaceRef.current?.focus();
    if (event.button !== 0 && event.button !== 1) return;
    if (tool === 'add-node' && event.button === 0) { addNode(localPoint(event)); return; }
    if (tool === 'select') setSelection(null);
    if (tool === 'connect') setConnectFrom(null);
    if (tool === 'pan' || event.button === 1 || tool === 'select') {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        kind: 'pan',
        start: { x: event.clientX, y: event.clientY },
        initialPan: pan,
        initialNetwork: cloneNetwork(network),
        changed: false,
      };
    }
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === 'pan') {
      setPan({ x: drag.initialPan.x + event.clientX - drag.start.x, y: drag.initialPan.y + event.clientY - drag.start.y });
      return;
    }
    const position = worldPoint(localPoint(event));
    if (!position || !drag.nodeId) return;
    drag.changed = true;
    setNetwork((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === drag.nodeId ? { ...node, x: position.x, y: position.y } : node),
    }));
  };

  const finishPointer = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === 'node' && drag.changed) {
      setPast((items) => [...items, drag.initialNetwork].slice(-MAX_HISTORY));
      setFuture([]);
    }
    dragRef.current = null;
  };

  const zoomAt = (screen: Point, nextZoom: number) => {
    if (viewport.width <= 0 || viewport.height <= 0) return;
    const anchor = screenToMap(screen, viewTransform);
    const bounded = clamp(nextZoom, 0.25, 8);
    const nextScale = fitScale({ ...viewTransform, zoom: bounded, pan: { x: 0, y: 0 } }) * bounded;
    setZoom(bounded);
    setPan({
      x: screen.x - viewport.width / 2 - nextScale * (anchor.x - imageSize.width / 2),
      y: screen.y - viewport.height / 2 - nextScale * (anchor.y - imageSize.height / 2),
    });
  };

  const saveRevision = async () => {
    if (!projectId || !mapId || saving) return;
    setShowValidation(true);
    setNotice('');
    setError('');
    if (validationErrors.length > 0) return;
    setSaving(true);
    try {
      const payload = await apiRequest(
        `/api/projects/${projectId}/maps/${mapId}/road-network/revisions`,
        { method: 'POST', token, body: JSON.stringify({ network: canonicalRoadNetwork(network) }) },
      );
      const revision = parseRevisionResponse(payload);
      const saved = revision.network ?? canonicalRoadNetwork(network);
      setNetwork(saved);
      setSavedSignature(roadNetworkSignature(saved));
      setPast([]);
      setFuture([]);
      setCurrentRevisionId(revision.id);
      setRevisions((items) => [{ ...revision, network: undefined }, ...items]);
      setNotice(`已保存为不可变版本 v${revision.version}。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '保存路网版本失败');
    } finally {
      setSaving(false);
    }
  };

  const loadRevision = async (revision: RoadNetworkRevision) => {
    if (!projectId || !mapId || loadingRevisionId) return;
    if (dirty && !window.confirm('当前草稿尚未保存，加载历史版本将丢弃这些修改。是否继续？')) return;
    setLoadingRevisionId(revision.id);
    setError('');
    try {
      const payload = await apiRequest(
        `/api/projects/${projectId}/maps/${mapId}/road-network/revisions/${revision.id}`,
        { token },
      );
      const loaded = parseRevisionResponse(payload);
      if (!loaded.network) throw new Error('路网版本缺少正文');
      setNetwork(loaded.network);
      setSavedSignature(roadNetworkSignature(loaded.network));
      setCurrentRevisionId(loaded.id);
      setPast([]);
      setFuture([]);
      setSelection(null);
      setConnectFrom(null);
      setNotice(`已加载 v${loaded.version}；继续修改并保存会创建新版本。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '加载路网版本失败');
    } finally {
      setLoadingRevisionId(null);
    }
  };

  const exitEditor = () => {
    if (dirty && !window.confirm('当前草稿尚未保存，确定离开编辑器吗？')) return;
    navigate(`/projects/${projectId}/maps/${mapId}/monitor`);
  };

  const beginPropertyEdit = () => { propertyStartRef.current = cloneNetwork(network); };
  const finishPropertyEdit = () => {
    const start = propertyStartRef.current;
    propertyStartRef.current = null;
    if (!start || roadNetworkSignature(start) === roadNetworkSignature(network)) return;
    setPast((items) => [...items, start].slice(-MAX_HISTORY));
    setFuture([]);
  };

  const selectedNode = selection?.type === 'node' ? network.nodes.find((node) => node.id === selection.id) ?? null : null;
  const selectedEdge = selection?.type === 'edge' ? network.edges.find((edge) => edge.id === selection.id) ?? null : null;
  const currentRevision = revisions.find((revision) => revision.id === currentRevisionId) ?? null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault(); redo(); return;
    }
    if (event.key === 'Escape') { setConnectFrom(null); setSelection(null); setTool('select'); }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selection) { event.preventDefault(); deleteSelection(); }
  };

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    zoomAt(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15),
    );
  };

  const changeTool = (nextTool: Tool) => { setTool(nextTool); setConnectFrom(null); };
  const zoomIn = () => zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, zoom * 1.2);
  const zoomOut = () => zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, zoom / 1.2);
  const fit = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const changeNodeLabel = (label: string) => selectedNode && setNetwork((current) => ({
    ...current,
    nodes: current.nodes.map((node) => node.id === selectedNode.id ? { ...node, label } : node),
  }));
  const changeEdgeDirection = (direction: RoadEdge['direction']) => selectedEdge && commit({
    ...network,
    edges: network.edges.map((edge) => edge.id === selectedEdge.id ? { ...edge, direction } : edge),
  });
  const changeEdgeSpeed = (maxSpeed: number | null) => selectedEdge && setNetwork((current) => ({
    ...current,
    edges: current.edges.map((edge) => edge.id === selectedEdge.id ? { ...edge, max_speed_mps: maxSpeed } : edge),
  }));

  return {
    projectId, mapId, token, map, network, revisions, currentRevisionId, currentRevision,
    loadingRevisionId, loading, saving, error, notice, dirty, past, future, tool,
    selection, connectFrom, validationErrors, showValidation, coordinateReady,
    viewportRef, workspaceRef, mapImage, imageSize, coordinateMetadata, transform, scale, zoom,
    selectedNode, selectedEdge,
    retry: loadWorkspace,
    undo, redo, exitEditor, saveRevision, loadRevision, deleteSelection,
    changeTool, zoomIn, zoomOut, fit,
    handlePointerDown, handlePointerMove, finishPointer, handleWheel,
    handleNodePointerDown, handleEdgePointerDown, handleKeyDown,
    beginPropertyEdit, finishPropertyEdit, changeNodeLabel, changeEdgeDirection, changeEdgeSpeed,
  };
}
