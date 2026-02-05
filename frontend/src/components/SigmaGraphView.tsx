import React, { useEffect, useMemo, useRef } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';

type GraphNode = {
  id: string;
  type: string;
  attrs: Record<string, string>;
  updated_at: string;
};

type GraphEdge = {
  src: string;
  dst: string;
  type: string;
  weight: number;
  recency: string;
  attrs: Record<string, string>;
};

type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type SigmaGraphViewProps = {
  data: GraphData | null;
  loading: boolean;
  error: string;
  focusId: string;
  selectedEdge: GraphEdge | null;
  onNodeClick: (node: GraphNode) => void;
  onEdgeClick: (edge: GraphEdge) => void;
  onHoverNode: (node: GraphNode | null) => void;
  onHoverEdge: (edge: GraphEdge | null) => void;
  onStageClick: () => void;
  onZoomOutReset: () => void;
  onMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: () => void;
};

const NODE_LIMIT = 200;

const getNodeColor = (nodeType: string) => {
  const lower = nodeType.toLowerCase();
  return lower.includes('repo') ? '#38bdf8' : '#f97316';
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const positionFromId = (id: string) => {
  const hash = hashString(id);
  const angle = (hash % 360) * (Math.PI / 180);
  const radius = 5 + (hash % 50) * 0.4;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
};

export default function SigmaGraphView({
  data,
  loading,
  error,
  focusId,
  selectedEdge,
  onNodeClick,
  onEdgeClick,
  onHoverNode,
  onHoverEdge,
  onStageClick,
  onZoomOutReset,
  onMouseMove,
  onMouseLeave,
}: SigmaGraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onEdgeClickRef = useRef(onEdgeClick);
  const onHoverNodeRef = useRef(onHoverNode);
  const onHoverEdgeRef = useRef(onHoverEdge);
  const onStageClickRef = useRef(onStageClick);
  const onZoomOutResetRef = useRef(onZoomOutReset);
  const focusIdRef = useRef(focusId);
  const dragStateRef = useRef<{
    nodeId: string | null;
    isDragging: boolean;
    didDrag: boolean;
    lastDragAt: number;
  }>({ nodeId: null, isDragging: false, didDrag: false, lastDragAt: 0 });

  const graphNodes = useMemo(() => {
    if (!data?.nodes?.length) return [];
    return data.nodes.slice(0, NODE_LIMIT);
  }, [data]);

  const graphEdges = useMemo(() => {
    if (!data?.edges?.length) return [];
    const nodeIds = new Set(graphNodes.map((node) => node.id));
    return data.edges.filter((edge) => nodeIds.has(edge.src) && nodeIds.has(edge.dst));
  }, [data, graphNodes]);

  const nodeImportance = useMemo(() => {
    const importance = new Map<string, number>();
    graphEdges.forEach((edge) => {
      const weight = edge.weight || 1;
      importance.set(edge.src, (importance.get(edge.src) || 0) + weight);
      importance.set(edge.dst, (importance.get(edge.dst) || 0) + weight);
    });
    return importance;
  }, [graphEdges]);

  const maxImportance = useMemo(() => {
    let max = 0;
    nodeImportance.forEach((value) => {
      if (value > max) max = value;
    });
    return max || 1;
  }, [nodeImportance]);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onEdgeClickRef.current = onEdgeClick;
    onHoverNodeRef.current = onHoverNode;
    onHoverEdgeRef.current = onHoverEdge;
    onStageClickRef.current = onStageClick;
    onZoomOutResetRef.current = onZoomOutReset;
  }, [onNodeClick, onEdgeClick, onHoverNode, onHoverEdge, onStageClick, onZoomOutReset]);

  useEffect(() => {
    focusIdRef.current = focusId;
  }, [focusId]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!graphRef.current) {
      graphRef.current = new Graph();
    }
    if (!sigmaRef.current) {
      sigmaRef.current = new Sigma(graphRef.current, containerRef.current, {
        renderEdgeLabels: false,
        labelFont: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        labelSize: 12,
        labelWeight: '500',
        labelColor: { color: '#cbd5f5' },
        labelRenderedSizeThreshold: 0,
        labelDensity: 1,
        labelGridCellSize: 60,
        enableEdgeEvents: true,
        defaultEdgeColor: '#0e7490',
      });

      sigmaRef.current.on('clickNode', ({ node }) => {
        const dragState = dragStateRef.current;
        if (dragState.didDrag || performance.now() - dragState.lastDragAt < 200) {
          dragState.didDrag = false;
          return;
        }
        const graph = graphRef.current;
        if (!graph) return;
        const dataNode = graph.getNodeAttribute(node, 'data') as GraphNode | undefined;
        if (dataNode) onNodeClickRef.current(dataNode);
      });

      sigmaRef.current.on('clickEdge', ({ edge }) => {
        const graph = graphRef.current;
        if (!graph) return;
        const dataEdge = graph.getEdgeAttribute(edge, 'data') as GraphEdge | undefined;
        if (dataEdge) onEdgeClickRef.current(dataEdge);
      });

      sigmaRef.current.on('enterNode', ({ node }) => {
        const graph = graphRef.current;
        if (!graph) return;
        const dataNode = graph.getNodeAttribute(node, 'data') as GraphNode | undefined;
        onHoverNodeRef.current(dataNode || null);
      });

      sigmaRef.current.on('leaveNode', () => onHoverNodeRef.current(null));

      sigmaRef.current.on('enterEdge', ({ edge }) => {
        const graph = graphRef.current;
        if (!graph) return;
        const dataEdge = graph.getEdgeAttribute(edge, 'data') as GraphEdge | undefined;
        onHoverEdgeRef.current(dataEdge || null);
      });

      sigmaRef.current.on('leaveEdge', () => onHoverEdgeRef.current(null));

      sigmaRef.current.on('clickStage', () => {
        onStageClickRef.current();
      });

      sigmaRef.current.on('downNode', ({ node, event, preventSigmaDefault }) => {
        const sigma = sigmaRef.current;
        const graph = graphRef.current;
        if (!sigma || !graph) return;
        preventSigmaDefault();
        event.preventSigmaDefault();
        dragStateRef.current = { nodeId: node, isDragging: true, didDrag: false, lastDragAt: dragStateRef.current.lastDragAt };
      });

      sigmaRef.current.on('moveBody', ({ event }) => {
        const sigma = sigmaRef.current;
        const graph = graphRef.current;
        const dragState = dragStateRef.current;
        if (!sigma || !graph || !dragState.isDragging || !dragState.nodeId) return;
        event.preventSigmaDefault();
        const coords = sigma.viewportToGraph({ x: event.x, y: event.y });
        graph.setNodeAttribute(dragState.nodeId, 'x', coords.x);
        graph.setNodeAttribute(dragState.nodeId, 'y', coords.y);
        dragState.didDrag = true;
        sigma.refresh({ partialGraph: { nodes: [dragState.nodeId] }, schedule: true });
      });

      sigmaRef.current.on('upStage', () => {
        const dragState = dragStateRef.current;
        if (dragState.didDrag) {
          dragState.lastDragAt = performance.now();
        }
        dragStateRef.current = { nodeId: null, isDragging: false, didDrag: false, lastDragAt: dragState.lastDragAt };
      });

      sigmaRef.current.on('upNode', () => {
        const dragState = dragStateRef.current;
        if (dragState.didDrag) {
          dragState.lastDragAt = performance.now();
        }
        dragStateRef.current = { nodeId: null, isDragging: false, didDrag: false, lastDragAt: dragState.lastDragAt };
      });

      sigmaRef.current.on('leaveStage', () => {
        dragStateRef.current = { nodeId: null, isDragging: false, didDrag: false, lastDragAt: 0 };
      });

      // Zoom-out reset disabled; keep current view stable.
    }

    return () => {
      sigmaRef.current?.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;

    graph.clear();

    graphNodes.forEach((node) => {
      if (graph.hasNode(node.id)) return;
      const pos = positionFromId(node.id);
      const importance = nodeImportance.get(node.id) || 1;
      const normalized = Math.min(1, importance / maxImportance);
      const size = 4 + normalized * 8;
      graph.addNode(node.id, {
        x: pos.x,
        y: pos.y,
        size: node.id === focusId ? Math.max(10, size) : size,
        label: node.id,
        color: getNodeColor(node.type),
        data: node,
      });
    });

    graphEdges.forEach((edge, index) => {
      if (!graph.hasNode(edge.src) || !graph.hasNode(edge.dst)) return;
      if (graph.hasEdge(edge.src, edge.dst) || graph.hasEdge(edge.dst, edge.src)) return;
      graph.addEdgeWithKey(`${edge.src}-${edge.dst}-${index}`, edge.src, edge.dst, {
        size: 1,
        color: '#0e7490',
        data: edge,
      });
    });

    sigma.refresh();
  }, [graphNodes, graphEdges, focusId]);

  useEffect(() => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (!sigma || !graph) return;

    const selectedIds = selectedEdge ? new Set([selectedEdge.src, selectedEdge.dst]) : null;

    sigma.setSetting('nodeReducer', (node, attrs) => {
      if (selectedIds && !selectedIds.has(node)) {
        return { ...attrs, hidden: true };
      }
      if (focusId && node === focusId) {
        return { ...attrs, size: 12, zIndex: 2 };
      }
      return attrs;
    });

    sigma.setSetting('edgeReducer', (_edge, attrs) => {
      if (selectedEdge && attrs.data) {
        const dataEdge = attrs.data as GraphEdge;
        const isMatch =
          dataEdge.src === selectedEdge.src && dataEdge.dst === selectedEdge.dst;
        return isMatch ? { ...attrs, size: 2, color: '#fbbf24' } : { ...attrs, hidden: true };
      }
      return attrs;
    });

    sigma.refresh();
  }, [focusId, selectedEdge]);

  return (
    <div className="absolute inset-0" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      <div ref={containerRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-cyan-700">
          LOADING_GRAPH...
        </div>
      )}
      {!loading && error && (
        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-rose-400">
          {error}
        </div>
      )}
      {!loading && !error && (!data || data.nodes.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-slate-700">
          GRAPH SEEDING...
        </div>
      )}
    </div>
  );
}
