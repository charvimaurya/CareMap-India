import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { Hero } from './components/home/Hero';
import { TriageFlow } from './components/triage/TriageFlow';
import { TriageState } from './types';

const INITIAL_STATE: TriageState = {
  step: 'HOME',
  complaint: '',
  selectedSymptoms: [],
  severity: '',
  duration: '',
};

export default function App() {
  const [state, setState] = useState<TriageState>(INITIAL_STATE);

  const reset = () => setState(INITIAL_STATE);
  const startTriage = () => setState(prev => ({ ...prev, step: 'COMPLAINT' }));

  return (
    <div className="min-h-screen font-sans">
      <Navbar onLogoClick={reset} />

      <main className="w-full">
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

      <Footer />
    </div>
  );
}
