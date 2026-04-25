import React from 'react';
import { Activity, Shield, Hospital } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 py-16 text-white px-4">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="col-span-1 md:col-span-2 space-y-6">
          <div className="flex items-center gap-2">
            <div className="bg-accent p-1.5 rounded-lg text-white">
              <Activity size={20} />
            </div>
            <span className="text-2xl font-display font-bold">CareMap <span className="text-accent">India</span></span>
          </div>
          <p className="text-slate-400 max-w-sm leading-relaxed">
            Serving the citizens of India by bridging the gap between medical needs and healthcare providers. Smart, trusted, and always free.
          </p>
        </div>
        <div className="space-y-6">
          <h5 className="font-bold text-lg">Platform</h5>
          <ul className="space-y-4 text-slate-400">
            <li><a href="#" className="hover:text-accent font-medium">Find a Hospital</a></li>
            <li><a href="#" className="hover:text-accent font-medium">Symptom Checker</a></li>
            <li><a href="#" className="hover:text-accent font-medium">Health Records</a></li>
          </ul>
        </div>
        <div className="space-y-6">
           <h5 className="font-bold text-lg">Support</h5>
           <ul className="space-y-4 text-slate-400">
            <li><a href="#" className="hover:text-accent font-medium">Help Center</a></li>
            <li><a href="#" className="hover:text-accent font-medium">Privacy Policy</a></li>
            <li><a href="#" className="hover:text-accent font-medium">Terms of Use</a></li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto pt-16 mt-16 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-slate-500">
        <p>© 2026 CareMap India. All rights reserved.</p>
        <div className="flex gap-8">
          <span className="flex items-center gap-2 font-bold"><Shield size={16} /> ISO 27001 Certified</span>
          <span className="flex items-center gap-2 font-bold"><Hospital size={16} /> Govt Linked Portal</span>
        </div>
      </div>
    </footer>
  );
};
