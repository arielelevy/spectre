
import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import {
  LayoutDashboard,
  FileText,
  User,
  Send,
  FileCode,
  Globe,
  ScanLine,
  ChevronRight,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import HudCard from './HudCard';
import NavButton from './NavButton';
import SpectreLogo from './SpectreLogo';

const riskData = [
  { time: '00:00', value: 20 },
  { time: '04:00', value: 15 },
  { time: '08:00', value: 45 },
  { time: '12:00', value: 92 },
  { time: '16:00', value: 60 },
  { time: '20:00', value: 30 },
  { time: '24:00', value: 25 },
];

const threatFeed = [
  { id: 'T-802', type: 'INJECTION', asset: 'login_module.ts', risk: 'CRITICAL', time: 'T-00:05:00', details: 'Detected a potential SQL injection signature in user input parsing.' },
  { id: 'T-801', type: 'ANOMALY', asset: 'payment_gateway.c', risk: 'HIGH', time: 'T-01:12:30', details: 'Unusual outbound packet frequency from sensitive financial module.' },
  { id: 'T-800', type: 'ACCESS', asset: 'admin_routes.js', risk: 'MED', time: 'T-02:45:00', details: 'Multiple failed authentication attempts from an unknown subnet.' },
];

type View = 'DASHBOARD' | 'INTEL';

type Threat = {
  id: string;
  type: string;
  asset: string;
  risk: 'CRITICAL' | 'HIGH' | 'MED';
  time: string;
  details: string;
};

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

type GraphLayoutNode = GraphNode & {
  x: number;
  y: number;
  isCenter: boolean;
};

export default function SentinelInterface() {
  const [view, setView] = useState<View>('DASHBOARD');
  const [selectedThreat, setSelectedThreat] = useState<Threat | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: "Spectre AI online. Awaiting tactical commands." }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [kpis, setKpis] = useState({
    nodes_count: 0,
    edges_count: 0,
    events_count: 0,
    risk_level: 'NOMINAL',
    risk_score: 0,
  });
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLayout, setGraphLayout] = useState<{ nodes: GraphLayoutNode[]; edges: GraphEdge[]; size: number } | null>(null);
  const [graphFocus, setGraphFocus] = useState<string>('');
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState('');
  const [graphZoom, setGraphZoom] = useState(1);
  const [graphFullscreen, setGraphFullscreen] = useState(false);
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 });
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [hoverEdge, setHoverEdge] = useState<GraphEdge | null>(null);
  const [graphMode, setGraphMode] = useState<'overview' | 'focus'>('overview');
  const [graphDataset, setGraphDataset] = useState<'repos' | 'repoUsers' | 'repoLinks' | 'userLinks'>('repos');
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const graphFullscreenRef = useRef<HTMLDivElement | null>(null);
  const graphSvgRef = useRef<SVGSVGElement | null>(null);
  const graphFullscreenSvgRef = useRef<SVGSVGElement | null>(null);
  const graphZoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const graphZoomTransformRef = useRef(d3.zoomIdentity);
  const zoomRafRef = useRef<number | null>(null);
  const zoomPendingTransformRef = useRef<d3.ZoomTransform | null>(null);
  const graphSimulationRef = useRef<d3.Simulation<GraphLayoutNode, undefined> | null>(null);
  const graphRuntimeRef = useRef<{ nodes: GraphLayoutNode[]; edges: GraphEdge[] } | null>(null);
  const hoverNodeRef = useRef<GraphNode | null>(null);
  const hoverEdgeRef = useRef<GraphEdge | null>(null);
  const graphFocusRef = useRef<string>('');
  const graphZoomRef = useRef(1);
  const graphRenderRafRef = useRef<number | null>(null);
  const graphRenderPendingRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  const defaultGraphSeed = 'api';

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    const wsBase = apiBaseUrl.replace(/^http/, 'ws');
    const socket = new WebSocket(`${wsBase}/ws/kpis`);

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setKpis(data);
      } catch (error) {
        return;
      }
    };

    return () => {
      socket.close();
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    if (graphFullscreen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [graphFullscreen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        resetZoom();
        setGraphFocus('');
        setGraphData(null);
        setHoverNode(null);
        setHoverEdge(null);
        setGraphMode('overview');
        loadInitialGraph();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [apiBaseUrl]);

  const handleGraphWheel = () => {};

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);

    await new Promise(resolve => setTimeout(resolve, 600));
    setChatHistory(prev => [
      ...prev,
      {
        role: 'assistant',
        content: 'Signal received. Correlating telemetry and evidence graph now.',
      },
    ]);
    setIsTyping(false);
  };

  const handleFocusNode = async (nodeId: string, nodeType: string) => {
    setGraphFocus(nodeId);
    setGraphLoading(true);
    setGraphError('');
    setGraphDataset(nodeType === 'REPO' ? 'repoUsers' : 'repos');
    resetZoom();
    try {
      const endpoint = nodeType === 'REPO'
        ? `/graph/expand?node_id=${encodeURIComponent(nodeId)}&depth=2&max_nodes=800&max_edges=2000`
        : `/graph/expand?node_id=${encodeURIComponent(nodeId)}&depth=2&max_nodes=800&max_edges=2000`;
      const response = await fetch(`${apiBaseUrl}${endpoint}`);
      if (!response.ok) {
        throw new Error(`Graph expand failed (${response.status})`);
      }
      const data = (await response.json()) as GraphData;
      setGraphData(data);
      setGraphMode('focus');
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : 'Graph load failed');
    } finally {
      setGraphLoading(false);
    }
  };

  const loadInitialGraph = async (
    dataset: 'repos' | 'repoUsers' | 'repoLinks' | 'userLinks' = graphDataset,
    preserveFocusId?: string
  ) => {
    setGraphLoading(true);
    setGraphError('');
    setGraphDataset(dataset);
    resetZoom();
    try {
      const endpoint = dataset === 'repos'
        ? '/graph/top?repo_limit=14&user_limit=14&edge_limit=800'
        : dataset === 'repoUsers'
        ? '/graph/repo-users?repo_limit=20&user_limit=60&edge_limit=1500'
        : dataset === 'repoLinks'
        ? '/graph/repos?min_shared_users=2&limit=300'
        : '/graph/people?min_shared_repos=2&limit=300';
      const response = await fetch(`${apiBaseUrl}${endpoint}`);
      if (!response.ok) {
        throw new Error(`Graph failed (${response.status})`);
      }
      const data = (await response.json()) as GraphData;
      setGraphData(data);
      const hasFocus = preserveFocusId && data.nodes.some((node) => node.id === preserveFocusId);
      if (hasFocus) {
        setGraphFocus(preserveFocusId || '');
        setGraphMode('focus');
      } else {
        if (preserveFocusId) {
          const expandResponse = await fetch(
            `${apiBaseUrl}/graph/expand?node_id=${encodeURIComponent(preserveFocusId)}&depth=2&max_nodes=800&max_edges=2000`
          );
          if (expandResponse.ok) {
            const expandData = (await expandResponse.json()) as GraphData;
            if (expandData.nodes.length) {
              setGraphData(expandData);
              setGraphFocus(preserveFocusId);
              setGraphMode('focus');
              return;
            }
          }
        }
        setGraphFocus('');
        setGraphMode('overview');
      }
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : 'Graph load failed');
    } finally {
      setGraphLoading(false);
    }
  };

  const zoomIn = () => {
    const svg = graphSvgRef.current;
    const zoom = graphZoomBehaviorRef.current;
    if (svg && zoom) {
      d3.select(svg).call(zoom.scaleBy, 1.2);
    }
  };
  const zoomOut = () => {
    const svg = graphSvgRef.current;
    const zoom = graphZoomBehaviorRef.current;
    if (svg && zoom) {
      d3.select(svg).call(zoom.scaleBy, 1 / 1.2);
    }
  };
  const resetZoom = () => {
    const svg = graphSvgRef.current;
    const zoom = graphZoomBehaviorRef.current;
    if (svg && zoom) {
      d3.select(svg).call(zoom.transform, d3.zoomIdentity);
    }
  };

  useEffect(() => {
    graphZoomRef.current = graphZoom;
  }, [graphZoom]);

  const scheduleGraphRender = () => {
    if (graphRenderRafRef.current !== null) return;
    graphRenderPendingRef.current = true;
    graphRenderRafRef.current = window.requestAnimationFrame(() => {
      graphRenderRafRef.current = null;
      if (!graphRenderPendingRef.current) return;
      graphRenderPendingRef.current = false;
      renderGraphWithD3(
        graphSvgRef.current,
        graphContainerRef.current,
        graphRuntimeRef.current,
        graphFocusRef.current,
        hoverNodeRef.current,
        hoverEdgeRef.current
      );
      if (graphFullscreen) {
        renderGraphWithD3(
          graphFullscreenSvgRef.current,
          graphFullscreenRef.current,
          graphRuntimeRef.current,
          graphFocusRef.current,
          hoverNodeRef.current,
          hoverEdgeRef.current
        );
      }
    });
  };

  useEffect(() => {
    hoverNodeRef.current = hoverNode;
  }, [hoverNode]);

  useEffect(() => {
    hoverEdgeRef.current = hoverEdge;
  }, [hoverEdge]);

  useEffect(() => {
    graphFocusRef.current = graphFocus;
  }, [graphFocus]);

  useEffect(() => {
    if (!graphLayout || !graphFocus) return;
    const focusNode = graphLayout.nodes.find((node) => node.id === graphFocus);
    const zoom = graphZoomBehaviorRef.current;
    const svg = graphSvgRef.current;
    const fullscreenSvg = graphFullscreenSvgRef.current;
    if (!focusNode || !zoom || !svg) return;

    const currentK = graphZoomTransformRef.current.k || 1;
    const transform = d3.zoomIdentity
      .translate(-focusNode.x * currentK, -focusNode.y * currentK)
      .scale(currentK);

    d3.select(svg).transition().duration(350).call(zoom.transform, transform);
    if (graphFullscreen && fullscreenSvg) {
      d3.select(fullscreenSvg).transition().duration(350).call(zoom.transform, transform);
    }
  }, [graphLayout, graphFocus, graphFullscreen]);

  useEffect(() => () => {
    if (graphRenderRafRef.current !== null) {
      window.cancelAnimationFrame(graphRenderRafRef.current);
      graphRenderRafRef.current = null;
    }
  }, []);

  const getVisibleEdges = (edges: GraphEdge[]) => {
    const sortedEdges = [...edges].sort((a, b) => (b.weight || 1) - (a.weight || 1));
    const edgeLimit = graphZoom < 1.1 ? 200 : graphZoom < 1.6 ? 500 : sortedEdges.length;
    return sortedEdges.slice(0, edgeLimit);
  };

  const getVisibleNodeIds = (edges: GraphEdge[], focusId: string) => {
    if (!focusId) return null;

    const zoom = graphZoomRef.current;
    const maxDepth = zoom >= 1.6 ? 1 : zoom >= 1.2 ? 2 : 3;
    const adjacency = new Map<string, string[]>();

    edges.forEach((edge) => {
      if (!adjacency.has(edge.src)) adjacency.set(edge.src, []);
      if (!adjacency.has(edge.dst)) adjacency.set(edge.dst, []);
      adjacency.get(edge.src)!.push(edge.dst);
      adjacency.get(edge.dst)!.push(edge.src);
    });

    const visibleNodeIds = new Set<string>([focusId]);
    let frontier = [focusId];
    let depth = 0;

    while (frontier.length && depth < maxDepth) {
      const next: string[] = [];
      frontier.forEach((nodeId) => {
        const neighbors = adjacency.get(nodeId) || [];
        neighbors.forEach((neighbor) => {
          if (!visibleNodeIds.has(neighbor)) {
            visibleNodeIds.add(neighbor);
            next.push(neighbor);
          }
        });
      });
      frontier = next;
      depth += 1;
    }

    return visibleNodeIds;
  };

  const renderGraphWithD3 = (
    svg: SVGSVGElement | null,
    container: HTMLDivElement | null,
    layout: { nodes: GraphLayoutNode[]; edges: GraphEdge[] } | null,
    focusId: string,
    hoveredNode: GraphNode | null,
    hoveredEdge: GraphEdge | null
  ) => {
    if (!svg || !container || !layout) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const width = rect.width;
    const height = rect.height;
    const viewSize = 360;
    const scale = Math.min(width, height) / viewSize;

    const selection = d3.select(svg);
    selection.attr('viewBox', `0 0 ${width} ${height}`).attr('class', 'w-full h-full');

    const defs = selection.select('defs');
    if (defs.empty()) {
        selection
          .append('defs')
          .append('radialGradient')
          .attr('id', 'nodeGlow')
          .attr('cx', '50%')
          .attr('cy', '50%')
          .attr('r', '50%')
          .call((gradient) => {
            gradient.append('stop').attr('offset', '0%').attr('stop-color', '#22d3ee').attr('stop-opacity', 0.6);
            gradient.append('stop').attr('offset', '100%').attr('stop-color', '#0ea5e9').attr('stop-opacity', 0);
          });
    }

    let root = selection.select<SVGGElement>('g.graph-root');
    if (root.empty()) {
      root = selection.append('g').attr('class', 'graph-root');
    }

    const viewTransform = graphZoomTransformRef.current;
    root.attr(
      'transform',
      `translate(${width / 2} ${height / 2}) scale(${scale}) translate(${viewTransform.x} ${viewTransform.y}) scale(${viewTransform.k})`
    );

    const weights = layout.edges.map((edge) => edge.weight || 1);
    const minWeight = Math.min(...weights, 1);
    const maxWeight = Math.max(...weights, 1);
    const normalizeWeight = (value: number) => {
      if (maxWeight === minWeight) return 0.6;
      return 0.2 + ((value - minWeight) / (maxWeight - minWeight)) * 0.8;
    };

    const visibleEdges = getVisibleEdges(layout.edges);
    const visibleNodeIds = getVisibleNodeIds(layout.edges, focusId);
    const nodeMap = new Map(layout.nodes.map((node) => [node.id, node]));
    const nodes = visibleNodeIds
      ? layout.nodes.filter((node) => visibleNodeIds.has(node.id))
      : graphZoomRef.current < 1.1
      ? layout.nodes.filter((node) => visibleEdges.some((edge) => edge.src === node.id || edge.dst === node.id))
      : layout.nodes;

    const nodeImportance = new Map<string, number>();
    visibleEdges.forEach((edge) => {
      nodeImportance.set(edge.src, (nodeImportance.get(edge.src) || 0) + (edge.weight || 1));
      nodeImportance.set(edge.dst, (nodeImportance.get(edge.dst) || 0) + (edge.weight || 1));
    });

    const limitedNodes = nodes
      .slice()
      .sort((a, b) => (nodeImportance.get(b.id) || 0) - (nodeImportance.get(a.id) || 0))
      .slice(0, 50);

    const limitedNodeIds = new Set(limitedNodes.map((node) => node.id));
    if (focusId && !limitedNodeIds.has(focusId)) {
      const focusNode = nodes.find((node) => node.id === focusId);
      if (focusNode) {
        limitedNodes.pop();
        limitedNodes.unshift(focusNode);
        limitedNodeIds.add(focusId);
      }
    }

    const visibleEdgesLimited = visibleEdges.filter(
      (edge) => limitedNodeIds.has(edge.src) && limitedNodeIds.has(edge.dst)
    );

    const edgeSelection = root
      .selectAll<SVGLineElement, GraphEdge>('line.edge')
      .data(visibleEdgesLimited, (edge) => `${edge.src}-${edge.dst}`);

    edgeSelection.exit().remove();

    const edgeEnter = edgeSelection
      .enter()
      .append('line')
      .attr('class', 'edge')
      .style('pointer-events', 'stroke');
    edgeEnter.merge(edgeSelection as d3.Selection<SVGLineElement, GraphEdge, SVGGElement, unknown>)
      .attr('x1', (edge) => nodeMap.get(edge.src)?.x || 0)
      .attr('y1', (edge) => nodeMap.get(edge.src)?.y || 0)
      .attr('x2', (edge) => nodeMap.get(edge.dst)?.x || 0)
      .attr('y2', (edge) => nodeMap.get(edge.dst)?.y || 0)
      .attr('stroke', (edge) => {
        const intensity = normalizeWeight(edge.weight || 1);
        const isHovered = hoveredEdge && hoveredEdge.src === edge.src && hoveredEdge.dst === edge.dst;
        return isHovered
          ? `rgba(16,185,129,${Math.min(1, intensity + 0.3)})`
          : `rgba(14,116,144,${intensity.toFixed(2)})`;
      })
      .attr('stroke-width', (edge) => {
        const intensity = normalizeWeight(edge.weight || 1);
        const isHovered = hoveredEdge && hoveredEdge.src === edge.src && hoveredEdge.dst === edge.dst;
        return (0.35 + intensity * 0.75) * (isHovered ? 1.4 : 1);
      })
      .on('mouseenter', (event, edge) => {
        event.stopPropagation();
        setHoverEdge(edge);
        setHoverNode(null);
      })
      .on('mouseleave', () => setHoverEdge(null));

    const nodeSelection = root
      .selectAll<SVGGElement, GraphLayoutNode>('g.node')
      .data(limitedNodes, (node) => node.id);

    nodeSelection.exit().remove();

    const nodeEnter = nodeSelection.enter().append('g').attr('class', 'node');
    nodeEnter.append('circle');
    nodeEnter.append('circle').attr('class', 'glow');
    nodeEnter.append('text');

    const nodeMerge = nodeEnter.merge(
      nodeSelection as d3.Selection<SVGGElement, GraphLayoutNode, SVGGElement, unknown>
    );

    const dragBehavior = d3
      .drag<SVGGElement, GraphLayoutNode>()
      .touchable(() => false)
      .on('start', (event) => {
        event.sourceEvent?.stopPropagation();
        graphSimulationRef.current?.alphaTarget(0.05).restart();
      })
      .on('drag', function (event, node) {
        const delta = 1 / Math.max(0.001, scale * graphZoomTransformRef.current.k);
        node.fx = node.x + event.dx * delta;
        node.fy = node.y + event.dy * delta;
        d3.select(this).attr('transform', `translate(${node.x} ${node.y})`);
        root
          .selectAll<SVGLineElement, GraphEdge>('line.edge')
          .attr('x1', (edge) => nodeMap.get(edge.src)?.x || 0)
          .attr('y1', (edge) => nodeMap.get(edge.src)?.y || 0)
          .attr('x2', (edge) => nodeMap.get(edge.dst)?.x || 0)
          .attr('y2', (edge) => nodeMap.get(edge.dst)?.y || 0);
      })
      .on('end', () => {
        graphSimulationRef.current?.alphaTarget(0);
      });

    nodeMerge
      .attr('transform', (node) => `translate(${node.x} ${node.y})`)
      .on('click', (event, node) => {
        event.stopPropagation();
        handleFocusNode(node.id, node.type);
      })
      .on('mouseenter', (event, node) => {
        event.stopPropagation();
        setHoverNode(node);
        setHoverEdge(null);
      })
      .on('mouseleave', () => setHoverNode(null))
      .call(dragBehavior)
      .each(function (node) {
        const group = d3.select(this);
        const isHovered = hoveredNode && hoveredNode.id === node.id;
        const radius = node.isCenter ? 16 : 10;

        group.select('circle')
          .attr('r', isHovered ? radius + 2 : radius)
          .attr('fill', node.isCenter ? '#22d3ee' : '#0ea5e9')
          .attr('opacity', node.isCenter ? 0.9 : 0.6);

        group.select('circle.glow')
          .attr('r', node.isCenter ? 28 : 0)
          .attr('fill', 'url(#nodeGlow)')
          .attr('opacity', node.isCenter ? 1 : 0);

        const label = node.id.length > 18 ? `${node.id.slice(0, 18)}…` : node.id;
        group.select('text')
          .attr('y', node.isCenter ? 26 : 20)
          .attr('text-anchor', 'middle')
          .attr('font-size', 8)
          .attr('fill', 'rgba(226,232,240,0.7)')
          .text(label);
      });

  };

  const buildGraphLayout = (data: GraphData | null, focusId: string) => {
    if (!data || data.nodes.length === 0) return { nodes: [], edges: [], size: 360 };
    const size = 360;
    const centerNode = data.nodes.find((node) => node.id === focusId) || data.nodes[0];
    const nodes = data.nodes.map((node) => ({
      ...node,
      x: Number.isFinite((node as GraphLayoutNode).x) ? (node as GraphLayoutNode).x : (Math.random() - 0.5) * 120,
      y: Number.isFinite((node as GraphLayoutNode).y) ? (node as GraphLayoutNode).y : (Math.random() - 0.5) * 120,
      isCenter: node.id === centerNode.id,
    }));
    return { nodes, edges: data.edges, size };
  };

  useEffect(() => {
    if (!graphData) {
      setGraphLayout(null);
      return;
    }
    const layout = buildGraphLayout(graphData, graphFocus);
    if (!layout.nodes.length) {
      setGraphLayout({ nodes: [], edges: [], size: 360 });
      return;
    }

    const nodes = layout.nodes.map((node) => ({ ...node }));
    const nodeIdSet = new Set(layout.nodes.map((node) => node.id));
    const links = layout.edges
      .filter((edge) => nodeIdSet.has(edge.src) && nodeIdSet.has(edge.dst))
      .map((edge) => ({ ...edge, source: edge.src, target: edge.dst }));

    const simulation = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force(
        'link',
        d3
          .forceLink(links)
          .id((node) => (node as GraphLayoutNode).id)
          .distance((link) => {
            const weight = (link as GraphEdge).weight || 1;
            return Math.max(40, 120 - weight * 8);
          })
          .strength(0.5)
      )
      .force('charge', d3.forceManyBody().strength(graphMode === 'focus' ? -100 : -70))
      .force('center', d3.forceCenter(0, 0))
      .force(
        'collide',
        d3.forceCollide().radius((node) => ((node as GraphLayoutNode).isCenter ? 24 : 14))
      )
      .alpha(0.3)
      .alphaDecay(0.15)
      .velocityDecay(0.6)
      .stop();

    graphSimulationRef.current?.stop();
    graphSimulationRef.current = simulation as d3.Simulation<GraphLayoutNode, undefined>;
    graphRuntimeRef.current = { nodes: nodes as GraphLayoutNode[], edges: layout.edges };

    for (let i = 0; i < 80; i += 1) {
      simulation.tick();
    }

    scheduleGraphRender();

    setGraphLayout({ nodes, edges: layout.edges, size: layout.size });
    return () => simulation.stop();
  }, [graphData, graphFocus, graphMode, graphFullscreen]);

  useEffect(() => {
    const svg = graphSvgRef.current;
    const container = graphContainerRef.current;
    const fullscreenSvg = graphFullscreenSvgRef.current;
    const fullscreenContainer = graphFullscreenRef.current;
    if (!svg || !container) return;

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .touchable(() => false)
      .filter((event) => event.type !== 'wheel')
      .scaleExtent([0.6, 3])
      .on('zoom', (event) => {
        graphZoomTransformRef.current = event.transform;
        zoomPendingTransformRef.current = event.transform;
        if (zoomRafRef.current !== null) return;
        zoomRafRef.current = window.requestAnimationFrame(() => {
          const transform = zoomPendingTransformRef.current;
          zoomRafRef.current = null;
          if (!transform) return;
          setGraphZoom(transform.k);
          setGraphPan({ x: transform.x, y: transform.y });
          scheduleGraphRender();
        });
      });

    const handleZoomWheel = (event: WheelEvent) => {
      event.preventDefault();
      const target = event.currentTarget as SVGSVGElement;
      const center = d3.pointer(event, target) as [number, number];
      const zoomIntensity = 0.002;
      const scale = Math.exp(-event.deltaY * zoomIntensity);
      d3.select(target).call(zoomBehavior.scaleBy, scale, center);
    };

    graphZoomBehaviorRef.current = zoomBehavior;
    d3.select(svg).call(zoomBehavior).on('dblclick.zoom', null);
    svg.addEventListener('wheel', handleZoomWheel, { passive: false });
    if (fullscreenSvg && fullscreenContainer) {
      d3.select(fullscreenSvg).call(zoomBehavior).on('dblclick.zoom', null);
      fullscreenSvg.addEventListener('wheel', handleZoomWheel, { passive: false });
    }
    return () => {
      d3.select(svg).on('.zoom', null);
      svg.removeEventListener('wheel', handleZoomWheel);
      if (zoomRafRef.current !== null) {
        window.cancelAnimationFrame(zoomRafRef.current);
        zoomRafRef.current = null;
      }
      if (fullscreenSvg) {
        d3.select(fullscreenSvg).on('.zoom', null);
        fullscreenSvg.removeEventListener('wheel', handleZoomWheel);
      }
    };
  }, [graphLayout]);

  useEffect(() => {
    if (!graphLayout || graphLoading) return;
    scheduleGraphRender();
  }, [graphLayout, graphFocus, graphLoading, graphFullscreen, hoverNode, hoverEdge]);

  const renderGraphCanvas = () => {
    if (graphLoading) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-cyan-700">
          LOADING_GRAPH...
        </div>
      );
    }

    if (!graphData) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-[9px] font-mono text-slate-700 gap-2">
          <Globe className="h-10 w-10 text-cyan-900/60" />
          <span>GRAPH SEEDING...</span>
        </div>
      );
    }

    if (!graphLayout) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-cyan-700">
          LAYOUTING_GRAPH...
        </div>
      );
    }
    return (
      <svg ref={graphSvgRef} className="absolute inset-0 w-full h-full" />
    );
  };

  const handleGraphPointerDown = () => {};
  const handleGraphPointerMove = () => {};
  const handleGraphPointerUp = () => {};

  const handleGraphMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverPos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  useEffect(() => {
    loadInitialGraph();
  }, [apiBaseUrl]);

  return (
    <div className="flex flex-col h-screen bg-[#010409] text-slate-400 font-sans selection:bg-cyan-500/30 overflow-hidden relative">
      
      {/* MINIMALIST HEADER */}
      <header className="h-16 border-b border-white/5 bg-black/20 backdrop-blur-xl flex items-center justify-between pl-4 pr-8 z-50">
        <div className="flex items-end gap-0.5 pb-2 transition-all duration-500">
          <SpectreLogo size={30} alert={selectedThreat?.risk === 'CRITICAL'} />
          <h1 className="text-[11px] font-bold text-white tracking-[0.5em] font-mono leading-none mb-[4px]">SPECTRE</h1>
        </div>

        <nav className="flex h-full items-center gap-1">
          <NavButton active={view === 'DASHBOARD'} label="CORE" onClick={() => setView('DASHBOARD')} icon={LayoutDashboard} />
          <NavButton active={view === 'INTEL'} label="INTEL" onClick={() => setView('INTEL')} icon={FileText} />
        </nav>

        <div className="flex items-center gap-4">
          <div className="text-[10px] text-slate-600 font-mono tracking-widest hidden md:block uppercase">
            STATUS: <span className="text-emerald-500/80">NOMINAL</span>
          </div>
          <div className="w-8 h-8 rounded-sm border border-white/5 flex items-center justify-center hover:bg-white/5 transition-colors cursor-pointer group">
            <User className="h-4 w-4 text-slate-500 group-hover:text-white transition-colors" />
          </div>
        </div>
      </header>


      {/* REORGANIZED MAIN CONTENT */}
       <main className="flex-1 p-6 grid grid-cols-12 gap-6 relative z-10 overflow-hidden">
        
        {/* LEFT COLUMN: SYSTEM STATUS & FEED */}
         <div className="col-span-12 lg:col-span-3 flex flex-col gap-6 overflow-hidden">
          <HudCard title="CORE_TELEMETRY">
            <div className="space-y-4 py-2">
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">RISK_LVL</span>
                <span className="text-2xl font-bold text-white font-mono tracking-tighter">{kpis.risk_score}</span>
              </div>
              <div className="w-full bg-slate-900 h-[2px] rounded-full overflow-hidden">
                <div
                  className="bg-cyan-500 h-full"
                  style={{ width: `${Math.min(100, kpis.risk_score)}%` }}
                />
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">NODES</span>
                <span className="text-xl font-bold text-white font-mono">{kpis.nodes_count.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">EDGES</span>
                <span className="text-xl font-bold text-white font-mono">{kpis.edges_count.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">EVENTS</span>
                <span className="text-xl font-bold text-white font-mono">{kpis.events_count.toLocaleString()}</span>
              </div>
            </div>
          </HudCard>

          <HudCard title="THREAT_VECTOR" className="flex-1">
            <div className="space-y-1 overflow-y-auto h-full pr-1 custom-scrollbar">
              {threatFeed.map((threat) => (
                <div 
                  key={threat.id}
                  onClick={() => setSelectedThreat(threat)}
                  className={`p-3 rounded-sm cursor-pointer transition-all border border-transparent ${
                    selectedThreat?.id === threat.id ? 'bg-cyan-950/20 border-cyan-800/20' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex justify-between items-center text-[9px] font-mono mb-1">
                    <span className="text-cyan-600 font-bold tracking-widest">{threat.id}</span>
                    <span className={threat.risk === 'CRITICAL' ? 'text-red-500/80' : 'text-slate-600'}>{threat.risk}</span>
                  </div>
                  <div className="text-[10px] text-slate-200 font-semibold tracking-wide">{threat.type}</div>
                </div>
              ))}
            </div>
          </HudCard>
        </div>

        {/* CENTER COLUMN: MAIN INTERFACE (CHAT HERO) */}
         <div className="col-span-12 lg:col-span-6 flex flex-col gap-6 overflow-hidden">
          {/* MINIMALIST RISK CHART AT TOP OF CENTER */}
          <HudCard className="h-32">
             <div className="absolute top-2 left-4 text-[8px] font-mono text-slate-600 tracking-[0.4em] uppercase">PULSE_MONITOR</div>
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={riskData}>
                  <defs>
                    <linearGradient id="centerPulse" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.05}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={1} fill="url(#centerPulse)" animationDuration={2000} strokeOpacity={0.3} />
                </AreaChart>
             </ResponsiveContainer>
          </HudCard>

          {/* CENTERED CHAT ASSISTANT */}
          <HudCard title="COMMAND_CENTER" className="flex-1 flex flex-col shadow-2xl">
             <div className="flex-1 overflow-y-auto mb-4 space-y-6 pr-2 custom-scrollbar flex flex-col pt-4">
               {chatHistory.map((msg, i) => (
                 <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[80%] px-4 py-3 rounded-sm font-mono text-[11px] leading-relaxed transition-all ${
                     msg.role === 'user' 
                      ? 'bg-cyan-500/5 border border-cyan-500/10 text-cyan-100 shadow-[0_0_15px_rgba(6,182,212,0.02)]' 
                      : 'text-slate-400'
                   }`}>
                     {msg.role === 'assistant' && <span className="text-cyan-800 mr-2 font-bold">»</span>}
                     {msg.content}
                   </div>
                 </div>
               ))}
               {isTyping && (
                 <div className="flex justify-start">
                   <div className="text-[8px] font-mono text-cyan-900 animate-pulse uppercase tracking-[0.5em] ml-4">
                     PROCESSING_COMMAND...
                   </div>
                 </div>
               )}
               <div ref={chatEndRef} />
             </div>
             
              <div className="mt-auto pt-4 border-t border-white/5">
                <div className="relative overflow-hidden">
                  <textarea
                    rows={1}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Ask Spectre..." 
                    className="w-full min-h-11 bg-slate-900/90 px-4 py-2.5 pl-3 text-[11px] text-white font-mono border-0 border-l-4 border-cyan-500/60 focus:border-cyan-400/80 focus:outline-none caret-white placeholder:text-cyan-100/50 resize-none leading-relaxed"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end gap-4 text-[10px] font-mono text-slate-500">
                <span className="text-white">ctrl+t</span>
                <span>variants</span>
                <span className="text-white">tab</span>
                <span>agents</span>
                <span className="text-white">ctrl+p</span>
                <span>commands</span>
              </div>
          </HudCard>
        </div>

        {/* RIGHT COLUMN: ANALYTICS */}
         <div className="col-span-12 lg:col-span-3 flex flex-col gap-6 overflow-hidden">
          <HudCard title="ASSET_ANALYSIS" className="flex-1">
            {selectedThreat ? (
              <div className="space-y-6 h-full flex flex-col">
                <div className="pb-4 border-b border-white/5">
                   <div className="text-xs font-bold text-white mb-1">{selectedThreat.asset}</div>
                   <div className="text-[8px] text-slate-600 font-mono uppercase tracking-widest">VALIDATED_HASH</div>
                </div>

                <div className="flex-1 space-y-4">
                   <div className="text-[10px] text-slate-500 leading-relaxed italic border-l border-cyan-500/20 pl-3">
                     "{selectedThreat.details}"
                   </div>
                   
                   <div className="bg-black/60 p-3 rounded-sm font-mono text-[9px] text-slate-600 border border-white/5 overflow-hidden">
                     <div className="text-emerald-950 mb-1">// SYSTEM_DUMP</div>
                     0xFF12: CALL check_integrity<br/>
                     0xFF16: MOV eax, [ptr]<br/>
                     0xFF20: <span className="text-red-950 font-bold">INTERRUPT_VECTOR</span>
                   </div>
                </div>

                <div className="pt-4 flex flex-col gap-2 mt-auto">
                  <button className="w-full py-2.5 bg-white text-black font-bold text-[9px] uppercase tracking-[0.4em] hover:bg-cyan-500 transition-all active:scale-95">
                    ISOLATE
                  </button>
                  <button className="w-full py-2.5 border border-white/5 text-slate-600 font-bold text-[9px] uppercase tracking-[0.4em] hover:text-white hover:border-white transition-all active:scale-95">
                    IGNORE
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-900 opacity-20">
                <ScanLine className="h-10 w-10 mb-4 animate-pulse" />
                <span className="text-[8px] font-mono tracking-[0.5em]">AWAITING_INPUT</span>
              </div>
            )}
          </HudCard>

          <HudCard title="GRAPH_VIEW" className="h-[22rem]">
            <div className="flex flex-col h-full gap-3">
              <div className="flex flex-col gap-2 text-[9px] font-mono text-slate-500">
                <div className="flex items-center justify-between gap-2">
                  <span>FOCUS: {graphFocus || (graphDataset === 'repoUsers' ? 'REPO_USERS' : graphDataset === 'repoLinks' ? 'REPO_LINKS' : graphDataset === 'userLinks' ? 'USER_LINKS' : 'TOP_NODES')}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadInitialGraph}
                      className="px-2 py-1 border border-white/5 text-slate-400 hover:text-slate-200"
                    >
                      RESET
                    </button>
                    <button
                      onClick={() => setGraphFullscreen(true)}
                      className="px-2 py-1 border border-white/5 text-slate-400 hover:text-slate-200"
                    >
                      FULL
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[8px] font-mono">
                  <button
                    onClick={() => loadInitialGraph('repos', graphFocus)}
                    className={`px-2 py-1 border ${
                      graphDataset === 'repos'
                        ? 'border-cyan-500/60 text-cyan-200'
                        : 'border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    REPOS
                  </button>
                  <button
                    onClick={() => loadInitialGraph('repoUsers', graphFocus)}
                    className={`px-2 py-1 border ${
                      graphDataset === 'repoUsers'
                        ? 'border-emerald-500/60 text-emerald-200'
                        : 'border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    REPO_USERS
                  </button>
                  <button
                    onClick={() => loadInitialGraph('repoLinks', graphFocus)}
                    className={`px-2 py-1 border ${
                      graphDataset === 'repoLinks'
                        ? 'border-indigo-500/60 text-indigo-200'
                        : 'border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    REPO_LINKS
                  </button>
                  <button
                    onClick={() => loadInitialGraph('userLinks', graphFocus)}
                    className={`px-2 py-1 border ${
                      graphDataset === 'userLinks'
                        ? 'border-amber-500/60 text-amber-200'
                        : 'border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    USER_LINKS
                  </button>
                </div>
              </div>

              {graphError && (
                <div className="text-[9px] font-mono text-rose-400">{graphError}</div>
              )}

              <div
                ref={graphContainerRef}
                className="flex-1 bg-black/30 border border-white/5 rounded-sm relative overflow-hidden"
                onWheel={handleGraphWheel}
                onPointerDown={handleGraphPointerDown}
                onPointerMove={handleGraphPointerMove}
                onPointerUp={handleGraphPointerUp}
                onMouseMove={handleGraphMouseMove}
                onMouseLeave={() => {
                  setHoverNode(null);
                  setHoverEdge(null);
                }}
              >
                {renderGraphCanvas()}
                {hoverNode && (
                  <div
                    className="absolute pointer-events-none bg-black/80 border border-cyan-500/20 text-[9px] font-mono text-slate-200 px-3 py-2"
                    style={{ left: hoverPos.x + 12, top: hoverPos.y + 12 }}
                  >
                    <div className="text-cyan-300">{hoverNode.id}</div>
                    <div className="text-slate-400">{hoverNode.type}</div>
                    {hoverNode.attrs?.owner && hoverNode.attrs?.name && (
                      <div className="text-slate-500">
                        {hoverNode.attrs.owner}/{hoverNode.attrs.name}
                      </div>
                    )}
                  </div>
                )}
                {hoverEdge && (
                  <div
                    className="absolute pointer-events-none bg-black/80 border border-emerald-500/20 text-[9px] font-mono text-slate-200 px-3 py-2"
                    style={{ left: hoverPos.x + 12, top: hoverPos.y + 12 }}
                  >
                    <div className="text-emerald-300">{hoverEdge.type}</div>
                    <div className="text-slate-400">{hoverEdge.src} → {hoverEdge.dst}</div>
                    {hoverEdge.recency && (
                      <div className="text-slate-500">{hoverEdge.recency}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </HudCard>
        </div>

      </main>

      {/* MINIMALIST FOOTER */}
      <footer className="border-t border-white/5 bg-black/20 flex flex-col gap-2 px-8 py-4 z-50 text-[9px] font-mono text-slate-700 md:flex-row md:items-center md:justify-between">
         <div className="flex gap-6">
            <span className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-emerald-900"></span> CORE_ACTIVE</span>
            <span>LATENCY: 0.04ms</span>
         </div>
         <div className="tracking-[0.35em] opacity-40 uppercase">
            Spectre v4.0 // Overwatch
         </div>
      </footer>

      {graphFullscreen && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 text-[10px] font-mono text-slate-400">
            <div className="flex items-center gap-4">
              <span>GRAPH_VIEW FULLSCREEN</span>
              <span className="text-slate-500">FOCUS: {graphFocus || (graphDataset === 'repoUsers' ? 'REPO_USERS' : graphDataset === 'repoLinks' ? 'REPO_LINKS' : graphDataset === 'userLinks' ? 'USER_LINKS' : 'TOP_NODES')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadInitialGraph('repos', graphFocus)}
                className={`px-2 py-1 border ${
                  graphDataset === 'repos'
                    ? 'border-cyan-500/60 text-cyan-200'
                    : 'border-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                REPOS
              </button>
              <button
                onClick={() => loadInitialGraph('repoUsers', graphFocus)}
                className={`px-2 py-1 border ${
                  graphDataset === 'repoUsers'
                    ? 'border-emerald-500/60 text-emerald-200'
                    : 'border-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                REPO_USERS
              </button>
              <button
                onClick={() => loadInitialGraph('repoLinks', graphFocus)}
                className={`px-2 py-1 border ${
                  graphDataset === 'repoLinks'
                    ? 'border-indigo-500/60 text-indigo-200'
                    : 'border-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                REPO_LINKS
              </button>
              <button
                onClick={() => loadInitialGraph('userLinks', graphFocus)}
                className={`px-2 py-1 border ${
                  graphDataset === 'userLinks'
                    ? 'border-amber-500/60 text-amber-200'
                    : 'border-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                USER_LINKS
              </button>
              <button
                onClick={() => setGraphFullscreen(false)}
                className="px-3 py-1 border border-white/5 text-slate-400 hover:text-slate-200"
              >
                EXIT
              </button>
            </div>
          </div>
          <div
            ref={graphFullscreenRef}
            className="flex-1 relative overflow-hidden"
            onWheel={handleGraphWheel}
            onPointerDown={handleGraphPointerDown}
            onPointerMove={handleGraphPointerMove}
            onPointerUp={handleGraphPointerUp}
            onMouseMove={handleGraphMouseMove}
            onMouseLeave={() => {
              setHoverNode(null);
              setHoverEdge(null);
            }}
          >
            <svg ref={graphFullscreenSvgRef} className="absolute inset-0 w-full h-full" />
            {graphLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-cyan-700">
                LOADING_GRAPH...
              </div>
            )}
            {!graphLoading && !graphData && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] font-mono text-slate-700 gap-2">
                <Globe className="h-12 w-12 text-cyan-900/60" />
                <span>GRAPH SEEDING...</span>
              </div>
            )}
            {!graphLoading && graphData && !graphLayout && (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-cyan-700">
                LAYOUTING_GRAPH...
              </div>
            )}
            {hoverNode && (
              <div
                className="absolute pointer-events-none bg-black/80 border border-cyan-500/20 text-[10px] font-mono text-slate-200 px-3 py-2"
                style={{ left: hoverPos.x + 16, top: hoverPos.y + 16 }}
              >
                <div className="text-cyan-300">{hoverNode.id}</div>
                <div className="text-slate-400">{hoverNode.type}</div>
                {hoverNode.attrs?.owner && hoverNode.attrs?.name && (
                  <div className="text-slate-500">
                    {hoverNode.attrs.owner}/{hoverNode.attrs.name}
                  </div>
                )}
              </div>
            )}
            {hoverEdge && (
              <div
                className="absolute pointer-events-none bg-black/80 border border-emerald-500/20 text-[10px] font-mono text-slate-200 px-3 py-2"
                style={{ left: hoverPos.x + 16, top: hoverPos.y + 16 }}
              >
                <div className="text-emerald-300">{hoverEdge.type}</div>
                <div className="text-slate-400">{hoverEdge.src} → {hoverEdge.dst}</div>
                {hoverEdge.recency && (
                  <div className="text-slate-500">{hoverEdge.recency}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
