import React from 'react';
import { motion } from 'motion/react';
import { PlusCircle, Activity, Shield, Clock } from 'lucide-react';
import { TriageStep, TriageState } from '../../types';
import { SYMPTOMS_LIST, SEVERITY_LIST, DURATION_LIST, MOCK_HOSPITALS } from '../../constants';
import { ResultCard } from './ResultCard';

interface TriageFlowProps {
  state: TriageState;
  setState: React.Dispatch<React.SetStateAction<TriageState>>;
  onReset: () => void;
}

export const TriageFlow: React.FC<TriageFlowProps> = ({ state, setState, onReset }) => {
  const { step, complaint, selectedSymptoms, severity, duration } = state;

  const setStep = (s: TriageStep) => setState(prev => ({ ...prev, step: s }));
  const setComplaint = (c: string) => setState(prev => ({ ...prev, complaint: c }));
  const setSeverity = (sv: string) => setState(prev => ({ ...prev, severity: sv }));
  const setDuration = (d: string) => setState(prev => ({ ...prev, duration: d }));

  const toggleSymptom = (symp: string) => {
    setState(prev => ({
      ...prev,
      selectedSymptoms: prev.selectedSymptoms.includes(symp)
        ? prev.selectedSymptoms.filter(s => s !== symp)
        : [...prev.selectedSymptoms, symp]
    }));
  };

  const getTriageClass = () => {
    if (severity === 'Emergency') return { label: 'EMERGENCY', color: 'bg-red-600', text: 'Call 112 immediately. Go to the nearest Emergency Room.' };
    if (severity === 'Severe') return { label: 'URGENT', color: 'bg-orange-600', text: 'Seek medical attention within 24 hours. A specialist should evaluate this.' };
    return { label: 'ROUTINE', color: 'bg-blue-600', text: 'Visit a primary care physician or general clinic as soon as possible.' };
  };

  const getHospital = () => {
    if (severity === 'Emergency' || severity === 'Severe') return MOCK_HOSPITALS[0];
    if (selectedSymptoms.includes(SYMPTOMS_LIST[2])) return MOCK_HOSPITALS[1];
    return MOCK_HOSPITALS[2];
  };

  const steps: TriageStep[] = ['COMPLAINT', 'SYMPTOMS', 'SEVERITY', 'DURATION', 'RESULT'];

  return (
    <motion.section 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -20 }}
      className="py-16 px-4 bg-surface min-h-[calc(100vh-80px)]"
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <button 
            onClick={() => {
              const idx = steps.indexOf(step);
              if (idx === 0) onReset();
              else setStep(steps[idx - 1]);
            }}
            className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-primary"
          >
             ← Back
          </button>
          <div className="flex gap-2">
            {steps.map((s, idx) => (
              <div key={s} className={`h-1.5 w-8 rounded-full ${steps.indexOf(step) >= idx ? 'bg-accent' : 'bg-slate-200'}`} />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl shadow-primary/5 border border-slate-100">
          {step === 'COMPLAINT' && (
            <div className="space-y-8">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 text-primary">
                  <PlusCircle size={32} />
                  <h3 className="text-3xl font-display font-bold">Welcome to CareMap India.</h3>
                </div>
                <p className="text-xl text-slate-700 font-medium leading-relaxed">
                  I'll help you find the right care, fast. What's your main concern today?
                </p>
              </div>
              <textarea 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-6 h-40 focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all text-lg placeholder:text-slate-400 font-sans"
                placeholder="e.g., I have been feeling dizzy and have a mild fever..."
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
              />
              <button 
                disabled={!complaint.trim()} 
                onClick={() => setStep('SYMPTOMS')}
                className="w-full btn-primary py-4 text-xl"
              >
                Check Symptoms →
              </button>
            </div>
          )}

          {step === 'SYMPTOMS' && (
            <div className="space-y-8">
              <div className="flex items-center gap-3 text-primary">
                <Activity size={32} />
                <h3 className="text-3xl font-display font-bold">Select symptoms</h3>
              </div>
              <p className="text-slate-500">Tick any of the following that apply to you. You can select multiple.</p>
              <div className="grid gap-3">
                {SYMPTOMS_LIST.map(symp => (
                  <button
                    key={symp}
                    onClick={() => toggleSymptom(symp)}
                    className={`text-left px-6 py-5 rounded-2xl border-2 transition-all flex justify-between items-center ${selectedSymptoms.includes(symp) ? 'bg-primary/5 border-primary text-primary font-bold active:scale-95' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'}`}
                  >
                    <span>{symp}</span>
                    {selectedSymptoms.includes(symp) && <div className="bg-primary text-white p-1 rounded-full"><PlusCircle size={16} /></div>}
                  </button>
                ))}
              </div>
              <button 
                disabled={selectedSymptoms.length === 0} 
                onClick={() => setStep('SEVERITY')}
                className="w-full btn-primary py-4 text-xl"
              >
                Continue →
              </button>
            </div>
          )}

          {step === 'SEVERITY' && (
            <div className="space-y-8">
              <div className="flex items-center gap-3 text-primary">
                <Shield size={32} />
                <h3 className="text-3xl font-display font-bold">How severe is it?</h3>
              </div>
              <p className="text-slate-500">Pick the level that best describes how you feel right now.</p>
              <div className="grid gap-3">
                {SEVERITY_LIST.map(sev => (
                  <button
                    key={sev.id}
                    onClick={() => {
                      setSeverity(sev.label);
                      setStep('DURATION');
                    }}
                    className={`text-left px-6 py-5 rounded-2xl border-2 transition-all group ${severity === sev.label ? 'bg-primary/5 border-primary text-primary' : 'bg-white border-slate-100'}`}
                  >
                    <p className="text-lg font-bold text-slate-800 group-hover:text-primary">{sev.label}</p>
                    <p className="text-sm text-slate-500">{sev.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'DURATION' && (
            <div className="space-y-8">
              <div className="flex items-center gap-3 text-primary">
                <Clock size={32} />
                <h3 className="text-3xl font-display font-bold">How long?</h3>
              </div>
              <p className="text-slate-500">Knowing the duration helps us determine the urgency of your visit.</p>
              <div className="grid gap-3">
                {DURATION_LIST.map(dur => (
                  <button
                    key={dur}
                    onClick={() => {
                      setDuration(dur);
                      setStep('RESULT');
                    }}
                    className={`text-left px-6 py-5 rounded-2xl border-2 transition-all font-bold text-lg ${duration === dur ? 'bg-primary/5 border-primary text-primary' : 'bg-white border-slate-100 text-slate-700 hover:border-slate-200'}`}
                  >
                    {dur}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'RESULT' && (
            <ResultCard 
              hospital={getHospital()}
              triageClass={getTriageClass()}
              duration={duration}
              selectedSymptoms={selectedSymptoms}
              onReset={onReset}
            />
          )}
        </div>
      </div>
    </motion.section>
  );
};
