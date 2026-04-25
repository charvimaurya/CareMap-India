import React from 'react';
import { Activity, PhoneCall, Menu } from 'lucide-react';

interface NavbarProps {
  onLogoClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onLogoClick }) => {
  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between h-20 items-center">
        <div className="flex items-center gap-2 cursor-pointer" onClick={onLogoClick}>
          <div className="bg-primary p-2 rounded-lg">
            <Activity className="text-white" size={24} />
          </div>
          <div>
            <span className="text-2xl font-display font-bold text-primary">CareMap</span>
            <span className="text-2xl font-display font-bold text-accent">India</span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#" className="nav-link">Find Care</a>
          <a href="#" className="nav-link">Emergency Help</a>
          <a href="#" className="nav-link">Medical Resources</a>
          <button className="bg-emergency text-white px-5 py-2 rounded-lg font-bold flex items-center gap-2 text-sm shadow-lg hover:bg-red-700 transition-all uppercase">
            <PhoneCall size={16} /> 112 Emergency
          </button>
        </div>
        <button className="md:hidden text-primary">
          <Menu size={24} />
        </button>
      </div>
    </nav>
  );
};
