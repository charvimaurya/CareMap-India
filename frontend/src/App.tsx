import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Navbar } from './components/layout/Navbar';

import { Hero } from './components/home/Hero';
import { TriageFlow } from './components/triage/TriageFlow';
import { TriageState } from './types';

type LocationStatus = 'detecting' | 'ready' | 'denied' | 'unavailable';

const INITIAL_STATE: TriageState = {
  step: 'HOME',
  complaint: '',
  selectedSymptoms: [],
  severity: '',
  duration: '',
  location: '',
  userLat: null,
  userLon: null,
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
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('detecting');
  const hasRequestedLocation = useRef(false);

  useEffect(() => {
    if (hasRequestedLocation.current) return;
    hasRequestedLocation.current = true;

    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationStatus('ready');
      },
      (error) => {
        setLocationStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }, []);

  const reset = () => setState(prev => ({
    ...INITIAL_STATE,
    location: '',
    userLat: null,
    userLon: null,
  }));
  const startTriage = () => setState(prev => ({ ...prev, step: 'COMPLAINT' }));

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <Navbar onLogoClick={reset} location={state.location} locationStatus={locationStatus} />
      
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
              needsManualLocation={locationStatus !== 'ready' && !state.location}
            />
          )}
        </AnimatePresence>
      </main>

    </div>
  );
}
