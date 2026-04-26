import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Navbar } from './components/layout/Navbar';

import { Hero } from './components/home/Hero';
import { TriageFlow } from './components/triage/TriageFlow';
import { TriageState } from './types';

const INITIAL_STATE: TriageState = {
  step: 'HOME',
  complaint: '',
  selectedSymptoms: [],
  severity: '',
  duration: '',
  location: '',
  speciality: null,
  showSymptoms: true,
  fallbackCount: 0,
  fallbackMessage: null,
  isLocked: false,
  locationAttempts: 0,
  confirmationData: null,
};

export default function App() {
  const [state, setState] = useState<TriageState>(INITIAL_STATE);

  const reset = () => setState(INITIAL_STATE);
  const startTriage = () => setState(prev => ({ ...prev, step: 'COMPLAINT' }));

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <Navbar onLogoClick={reset} location={state.location} />
      
      <main className="flex-1">
        <AnimatePresence mode="wait">
          {state.step === 'HOME' ? (
            <Hero key="hero" onStart={startTriage} />
          ) : (
            <TriageFlow 
              key="triage"
              state={state} 
              setState={setState} 
              onReset={reset} 
            />
          )}
        </AnimatePresence>
      </main>

    </div>
  );
}
