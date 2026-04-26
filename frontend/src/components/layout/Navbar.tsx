import React from 'react';
import { Activity, Menu, MapPin } from 'lucide-react';

interface NavbarProps {
  onLogoClick: () => void;
  location?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onLogoClick, location }) => {
  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={onLogoClick}>
            <div className="bg-primary p-2 rounded-lg">
              <Activity className="text-white" size={24} />
            </div>
            <div>
              <span className="text-2xl font-display font-bold text-primary">CareMap</span>
              <span className="text-2xl font-display font-bold text-accent">India</span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
            <MapPin size={16} className="text-accent" />
            <span className="text-sm font-medium text-slate-600">Location: {location || "Detecting..."}</span>
          </div>

          <button className="md:hidden text-primary">
            <Menu size={24} />
          </button>
        </div>
        {location && (
          <div className="lg:hidden py-2 border-t border-slate-50 flex items-center gap-2 justify-center">
            <MapPin size={14} className="text-accent" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Viewing results for: {location}</span>
          </div>
        )}
      </div>
    </nav>
  );
};
