
import React from 'react';
import { LucideIcon } from 'lucide-react';

interface NavButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: LucideIcon;
}

const NavButton: React.FC<NavButtonProps> = ({ active, label, onClick, icon: Icon }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 text-[11px] font-mono transition-colors duration-200 ${
      active ? 'text-cyan-200' : 'text-slate-500 hover:text-slate-200'
    }`}
  >
    <Icon className="h-4 w-4" />
    <span className="tracking-[0.2em] uppercase">{label}</span>
  </button>
);

export default NavButton;
