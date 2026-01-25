
import React, { useState, useEffect, useRef } from 'react';
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

export default function SentinelInterface() {
  const [view, setView] = useState<View>('DASHBOARD');
  const [selectedThreat, setSelectedThreat] = useState<Threat | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: "Spectre AI online. Awaiting tactical commands." }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

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
                <span className="text-2xl font-bold text-white font-mono tracking-tighter">88.4</span>
              </div>
              <div className="w-full bg-slate-900 h-[2px] rounded-full overflow-hidden">
                <div className="bg-cyan-500 h-full w-[88%]" />
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">NODES</span>
                <span className="text-xl font-bold text-white font-mono">1,241</span>
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

          <HudCard title="NODE_MAP" className="h-40">
             <div className="h-full w-full flex items-center justify-center relative opacity-20">
                <Globe className="h-20 w-20 text-cyan-950" />
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-1 h-1 bg-red-950 rounded-full animate-ping" />
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
    </div>
  );
}
