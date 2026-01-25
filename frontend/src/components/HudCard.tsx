
import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface HudCardProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
  alert?: boolean;
}

const HudCard: React.FC<HudCardProps> = ({ children, title, className = "", alert = false }) => (
  <section
    className={`relative bg-[#060b16]/80 border ${
      alert ? 'border-rose-500/40 shadow-[0_12px_40px_rgba(244,63,94,0.15)]' : 'border-white/5'
    } ${className} overflow-hidden transition-all duration-300`}
  >
    
    {title && (
      <div className="bg-black/20 border-b border-white/5 px-4 py-2 flex justify-between items-center select-none">
        <h3 className={`text-[10px] font-mono font-semibold tracking-[0.25em] uppercase ${alert ? 'text-rose-300' : 'text-slate-500'}`}>
          {title}
        </h3>
        {alert && <AlertTriangle className="h-3 w-3 text-rose-300" />}
      </div>
    )}
    
    <div className="p-4 h-full relative z-10 flex flex-col">
      {children}
    </div>
    
    {/* Background Grid Decoration - Subtle */}
    <div
      className="absolute inset-0 opacity-[0.015] pointer-events-none"
      style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 0)', backgroundSize: '30px 30px' }}
    ></div>
  </section>
);

export default HudCard;
