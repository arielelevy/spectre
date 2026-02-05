
import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  FileText,
  User,
  ScanLine,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import HudCard from './HudCard';
import NavButton from './NavButton';
import SpectreLogo from './SpectreLogo';
import SigmaGraphView from './SigmaGraphView';

const riskData = [
  { time: '00:00', value: 20 },
  { time: '04:00', value: 15 },
  { time: '08:00', value: 45 },
  { time: '12:00', value: 92 },
  { time: '16:00', value: 60 },
  { time: '20:00', value: 30 },
  { time: '24:00', value: 25 },
];

const threatFeed: Threat[] = [
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

type GraphSnapshot = {
  data: GraphData | null;
  focus: string;
  mode: 'overview' | 'focus';
  dataset: 'repos' | 'repoUsers' | 'repoLinks' | 'userLinks';
  zoom: { k: number; x: number; y: number };
  pan: { x: number; y: number };
  zoomK: number;
  selectedEdge: GraphEdge | null;
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
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const graphViewSnapshotRef = useRef<GraphSnapshot | null>(null);
  const hoverNodeRef = useRef<GraphNode | null>(null);
  const hoverEdgeRef = useRef<GraphEdge | null>(null);
  const graphFocusRef = useRef<string>('');
  const graphZoomRef = useRef(1);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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
        console.error('[WebSocket] Failed to parse KPI data:', error);
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
        loadInitialGraph(graphDataset);
        setGraphFocus('');
        setGraphMode('overview');
        setSelectedEdge(null);
        setHoverNode(null);
        setHoverEdge(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [apiBaseUrl, graphDataset]);

  const updateGraphSnapshot = (override?: Partial<GraphSnapshot>) => {
    graphViewSnapshotRef.current = {
      data: graphData,
      focus: graphFocus,
      mode: graphMode,
      dataset: graphDataset,
      zoom: { k: 1, x: 0, y: 0 },
      pan: graphPan,
      zoomK: graphZoomRef.current,
      selectedEdge,
      ...override,
    };
  };

  const restoreGraphSnapshot = () => {
    const snapshot = graphViewSnapshotRef.current;
    if (!snapshot) return;
    setGraphData(snapshot.data);
    setGraphFocus(snapshot.focus);
    setGraphMode(snapshot.mode);
    setGraphDataset(snapshot.dataset);
    setSelectedEdge(snapshot.selectedEdge);
    setGraphZoom(snapshot.zoomK);
    setGraphPan(snapshot.pan);
  };

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
    updateGraphSnapshot();
    setGraphFocus(nodeId);
    setGraphLoading(true);
    setGraphError('');
    setGraphDataset(nodeType === 'REPO' ? 'repoUsers' : 'repos');
    resetZoom();
    try {
      const endpoint = `/graph/expand?node_id=${encodeURIComponent(nodeId)}&depth=1&max_nodes=30&max_edges=2600`;
      const response = await fetch(`${apiBaseUrl}${endpoint}`);
      if (!response.ok) {
        throw new Error(`Graph expand failed (${response.status})`);
      }
      const data = (await response.json()) as GraphData;
      setGraphData(data);
      setGraphMode('focus');
      setSelectedEdge(null);
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
      setSelectedEdge(null);
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

  const resetZoom = () => {
    setGraphZoom(1);
    setGraphPan({ x: 0, y: 0 });
  };

  const resetViewToSnapshot = () => {
    restoreGraphSnapshot();
  };

  useEffect(() => {
    graphZoomRef.current = graphZoom;
  }, [graphZoom]);

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
    if (!graphFocus) return;
    setGraphZoom(1);
  }, [graphFocus]);

  const handleGraphMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverPos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  useEffect(() => {
    loadInitialGraph();
    updateGraphSnapshot({ zoom: { k: 1, x: 0, y: 0 }, pan: { x: 0, y: 0 }, zoomK: 1 });
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
        
        {/* LEFT COLUMN: SYSTEM FEED */}
         <div className="col-span-12 lg:col-span-3 flex flex-col gap-6 overflow-hidden">
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

        {/* CENTER COLUMN: MAIN INTERFACE (CHARTS + GRAPH + CHAT) */}
         <div className="col-span-12 lg:col-span-6 flex flex-col gap-6 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          </div>

          <HudCard title="GRAPH_VIEW" className="h-[26rem] sm:h-[28rem] md:h-[24rem]">
            <div className="flex flex-col h-full gap-3">
              <div className="flex flex-col gap-2 text-[9px] font-mono text-slate-500">
                <div className="flex items-center justify-between gap-2">
                  <span>FOCUS: {graphFocus || (graphDataset === 'repoUsers' ? 'REPO_USERS' : graphDataset === 'repoLinks' ? 'REPO_LINKS' : graphDataset === 'userLinks' ? 'USER_LINKS' : 'TOP_NODES')}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={resetViewToSnapshot}
                      className="px-2 py-1 border border-white/5 text-slate-400 hover:text-slate-200"
                    >
                      BACK
                    </button>
                    <button
                      onClick={() => loadInitialGraph()}
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
                <div className="flex items-center justify-between gap-3 text-[8px] font-mono text-slate-600">
                  <span>NODES: {kpis.nodes_count.toLocaleString()}</span>
                  <span>EDGES: {kpis.edges_count.toLocaleString()}</span>
                  <span>EVENTS: {kpis.events_count.toLocaleString()}</span>
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
                className="flex-1 min-h-[18rem] bg-black/30 border border-white/5 rounded-sm relative overflow-hidden"
                onMouseMove={handleGraphMouseMove}
                onMouseLeave={() => {
                  setHoverNode(null);
                  setHoverEdge(null);
                }}
              >
                <SigmaGraphView
                  data={graphData}
                  loading={graphLoading}
                  error={graphError}
                  focusId={graphFocus}
                  selectedEdge={selectedEdge}
                  onNodeClick={(node) => handleFocusNode(node.id, node.type)}
                  onEdgeClick={(edge) => {
                    if (selectedEdge && selectedEdge.src === edge.src && selectedEdge.dst === edge.dst) {
                      restoreGraphSnapshot();
                      return;
                    }
                    updateGraphSnapshot({ selectedEdge: null });
                    setSelectedEdge(edge);
                  }}
                  onHoverNode={setHoverNode}
                  onHoverEdge={setHoverEdge}
                  onStageClick={() => {
                    setSelectedEdge(null);
                  }}
                  onZoomOutReset={() => {
                    loadInitialGraph();
                    setGraphFocus('');
                    setGraphMode('overview');
                  }}
                  onMouseMove={handleGraphMouseMove}
                  onMouseLeave={() => {
                    setHoverNode(null);
                    setHoverEdge(null);
                  }}
                />
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
                    {hoverEdge.attrs?.shared_users && (
                      <div className="text-slate-500">shared_users: {hoverEdge.attrs.shared_users}</div>
                    )}
                    {hoverEdge.attrs?.shared_repos && (
                      <div className="text-slate-500">shared_repos: {hoverEdge.attrs.shared_repos}</div>
                    )}
                    {hoverEdge.weight && (
                      <div className="text-slate-500">weight: {hoverEdge.weight}</div>
                    )}
                    {selectedEdge && selectedEdge.src === hoverEdge.src && selectedEdge.dst === hoverEdge.dst && (
                      <div className="text-[9px] text-amber-300 mt-1">click to reset view</div>
                    )}
                  </div>
                )}
              </div>
            </div>
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
            className="flex-1 relative overflow-hidden"
            onMouseMove={handleGraphMouseMove}
            onMouseLeave={() => {
              setHoverNode(null);
              setHoverEdge(null);
            }}
              >
              <SigmaGraphView
                data={graphData}
                loading={graphLoading}
                error={graphError}
                focusId={graphFocus}
                selectedEdge={selectedEdge}
                onNodeClick={(node) => handleFocusNode(node.id, node.type)}
                onEdgeClick={(edge) => {
                  if (selectedEdge && selectedEdge.src === edge.src && selectedEdge.dst === edge.dst) {
                    restoreGraphSnapshot();
                    return;
                  }
                  updateGraphSnapshot({ selectedEdge: null });
                  setSelectedEdge(edge);
                }}
                onHoverNode={setHoverNode}
                onHoverEdge={setHoverEdge}
                onStageClick={() => {
                  setSelectedEdge(null);
                }}
                onZoomOutReset={() => {
                  loadInitialGraph();
                  setGraphFocus('');
                  setGraphMode('overview');
                }}
                onMouseMove={handleGraphMouseMove}
                onMouseLeave={() => {
                  setHoverNode(null);
                  setHoverEdge(null);
                }}
              />
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
                {hoverEdge.attrs?.shared_users && (
                  <div className="text-slate-500">shared_users: {hoverEdge.attrs.shared_users}</div>
                )}
                {hoverEdge.attrs?.shared_repos && (
                  <div className="text-slate-500">shared_repos: {hoverEdge.attrs.shared_repos}</div>
                )}
                {hoverEdge.weight && (
                  <div className="text-slate-500">weight: {hoverEdge.weight}</div>
                )}
                {selectedEdge && selectedEdge.src === hoverEdge.src && selectedEdge.dst === hoverEdge.dst && (
                  <div className="text-[9px] text-amber-300 mt-1">click to reset view</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
