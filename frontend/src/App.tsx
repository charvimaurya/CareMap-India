import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Navbar } from './components/layout/Navbar';

import { Hero } from './components/home/Hero';
import { TriageFlow } from './components/triage/TriageFlow';
import { TriageState } from './types';

type LocationStatus = 'detecting' | 'ready' | 'denied' | 'unavailable';

interface ReverseGeocodeResponse {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
  };
}

const getCityFromCoordinates = async (latitude: number, longitude: number) => {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Reverse geocoding failed with status ${response.status}`);
  }

  const data = await response.json() as ReverseGeocodeResponse;
  return data.address?.city
    || data.address?.town
    || data.address?.village
    || data.address?.municipality
    || data.address?.county
    || data.address?.state
    || null;
};

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
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const browserLocation = await getCityFromCoordinates(latitude, longitude);
          if (!browserLocation) {
            setLocationStatus('unavailable');
            return;
          }

          setState(prev => ({
            ...prev,
            location: prev.location || browserLocation,
          }));
          setLocationStatus('ready');
        } catch (error) {
          console.error("Failed to detect city:", error);
          setLocationStatus('unavailable');
        }
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

  const reset = () => setState(prev => ({ ...INITIAL_STATE, location: prev.location }));
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
