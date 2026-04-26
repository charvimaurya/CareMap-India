import React from 'react';
import { Stethoscope, ShieldCheck, MapPin } from 'lucide-react';
import { Hospital } from '../../types';

interface ResultCardProps {
  hospitals: Hospital[];
  triageClass: {
    label: string;
    color: string;
    text: string;
  };
  duration: string;
  selectedSymptoms: string[];
  onReset: () => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ 
  hospitals, 
  triageClass, 
  duration, 
  selectedSymptoms, 
  onReset 
}) => {
  return (
    <div className="space-y-10">
      <div className={`p-8 rounded-3xl text-white ${triageClass.color} shadow-xl relative overflow-hidden`}>
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Stethoscope size={100} />
        </div>
        <div className="relative z-10 space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">Triage Result</span>
          <h3 className="text-5xl font-display font-bold leading-none">{triageClass.label}</h3>
          <p className="text-lg opacity-90 font-medium pt-2">{triageClass.text}</p>
        </div>
      </div>

      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h4 className="text-2xl font-bold text-slate-800">Best Matching Facilities</h4>
          <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">{hospitals.length} Found</span>
        </div>

        {hospitals.map((hospital, idx) => (
          <div key={idx} className={`grid md:grid-cols-2 gap-8 items-start p-8 rounded-3xl border-2 transition-all ${idx === 0 ? 'border-accent/20 bg-accent/[0.02]' : 'border-slate-100 bg-white'}`}>
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h5 className="text-xl font-bold text-primary">{hospital.name}</h5>
                  <p className="text-slate-500 text-sm">{hospital.type} • {hospital.distance}</p>
                </div>
                <div className="flex items-center gap-1 bg-accent/10 py-1 px-2 rounded-full text-accent font-bold text-[10px] uppercase">
                  <ShieldCheck size={12} /> {hospital.trust}
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">Facility Analysis</p>
                <p className="text-sm text-slate-600 leading-relaxed italic">"{hospital.why}"</p>
              </div>
              <div className="space-y-3">
                 <p className="text-sm font-bold text-slate-800 underline decoration-accent underline-offset-4 decoration-2">What to do now:</p>
                 <ul className="text-sm text-slate-600 space-y-2 list-disc pl-4">
                   <li>Carry your ID (Aadhar/Voter Card).</li>
                   <li>Describe your duration of {duration} at the desk.</li>
                   <li>Keep a record of your current symptoms: {selectedSymptoms.join(', ')}.</li>
                 </ul>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
                 <iframe
                  src={`https://maps.google.com/maps?q=${hospital.mapQuery}&output=embed`}
                  width="100%" 
                  height="220" 
                  style={{border: 0}}
                  loading="lazy">
                </iframe>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${hospital.mapQuery}`, '_blank')}
                  className="flex-1 btn-primary text-sm flex items-center justify-center gap-2 py-3"
                >
                  <MapPin size={16} /> Open in Maps
                </button>
              </div>
            </div>
          </div>
        ))}
        
        <div className="pt-8 flex justify-center">
          <button onClick={onReset} className="btn-outline text-sm px-12">New Search</button>
        </div>
      </div>
    </div>
  );
};
