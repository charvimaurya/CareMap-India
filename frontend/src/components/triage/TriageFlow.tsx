import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { PlusCircle, Activity, Shield, Clock, MapPin, Search, Hospital as HospitalIcon, Loader2 } from 'lucide-react';
import { TriageStep, TriageState, Hospital } from '../../types';
import { SYMPTOMS_LIST, SEVERITY_LIST, DURATION_LIST } from '../../constants';
import { ResultCard } from './ResultCard';
import { parseMedicalIntent, parseLocationIntent, shouldShowSymptomStep, classifyInput, validateLocation } from '../../lib/parser';

interface TriageFlowProps {
  state: TriageState;
  setState: React.Dispatch<React.SetStateAction<TriageState>>;
  onReset: () => void;
}

export const TriageFlow: React.FC<TriageFlowProps> = ({ state, setState, onReset }) => {
  const { step, complaint, selectedSymptoms, severity, duration, location, speciality, showSymptoms, fallbackCount, fallbackMessage, isLocked, locationAttempts, confirmationData } = state;
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [tempLocation, setTempLocation] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);

  const setStep = (s: TriageStep) => setState(prev => ({ ...prev, step: s }));
  
  const handleComplaintSubmit = () => {
    const classification = classifyInput(complaint);

    if (classification.type === 'CONFIRM') {
      setState(prev => ({
        ...prev,
        confirmationData: {
          type: 'medical',
          original: complaint,
          suggestion: classification.suggestion
        }
      }));
      return;
    }

    if (classification.type === 'VALID') {
      processValidComplaint(classification.corrected || complaint);
    } else {
      handleFallback(classification.message);
    }
  };

  const handleFallback = (message: string) => {
    const newCount = fallbackCount + 1;
    if (newCount >= 3) {
      setState(prev => ({
        ...prev,
        fallbackCount: newCount,
        fallbackMessage: "It seems like you might not have a medical concern right now. CareMap India is here whenever you need help finding a doctor or hospital. Feel free to come back anytime.",
        isLocked: true
      }));
    } else {
      setState(prev => ({
        ...prev,
        fallbackCount: newCount,
        fallbackMessage: message
      }));
    }
  };

  const processValidComplaint = (text: string) => {
    const detectedSpeciality = parseMedicalIntent(text);
    const detectedLocation = parseLocationIntent(text);
    const symptomsRequired = shouldShowSymptomStep(text, detectedSpeciality.name);
    
    let validatedLoc = '';
    if (detectedLocation) {
      const v = validateLocation(detectedLocation);
      if (v.isValid) {
        validatedLoc = v.correction || detectedLocation;
      }
    }

    setState(prev => ({
      ...prev,
      complaint: text,
      speciality: detectedSpeciality,
      location: validatedLoc || prev.location,
      showSymptoms: symptomsRequired,
      fallbackMessage: null,
      confirmationData: null
    }));

    if (!validatedLoc && !location) {
      setStep('LOCATION_PROMPT');
    } else {
      setStep('SPECIALITY_INFO');
    }
  };

  const handleLocationSubmit = () => {
    if (!tempLocation.trim()) return;

    const v = validateLocation(tempLocation);
    
    if (!v.isValid) {
      const newAttempts = locationAttempts + 1;
      setLocationError(v.message || "Invalid location.");
      setState(prev => ({ ...prev, locationAttempts: newAttempts }));
      return;
    }

    if (v.correction && !v.isHighConfidence) {
      setState(prev => ({
        ...prev,
        confirmationData: {
          type: 'location',
          original: tempLocation,
          suggestion: v.correction!
        }
      }));
      return;
    }

    const finalLocation = v.correction || tempLocation;
    setState(prev => ({ 
      ...prev, 
      location: finalLocation,
      locationAttempts: 0,
      confirmationData: null
    }));
    setLocationError(null);
    setStep('SPECIALITY_INFO');
  };

  const handleConfirmation = (confirmed: boolean) => {
    if (!confirmationData) return;

    if (confirmed) {
      if (confirmationData.type === 'medical') {
        processValidComplaint(confirmationData.suggestion);
      } else {
        setState(prev => ({ 
          ...prev, 
          location: confirmationData.suggestion,
          confirmationData: null,
          locationAttempts: 0
        }));
        setStep('SPECIALITY_INFO');
      }
    } else {
      setState(prev => ({ ...prev, confirmationData: null }));
    }
  };

  const handleSpecialityContinue = () => {
    if (showSymptoms) {
      setStep('SYMPTOMS');
    } else {
      setStep('SEVERITY');
    }
  };

  const fetchHospitals = async () => {
    setStep('LOADING');
    try {
      const response = await fetch('/api/hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          speciality, 
          location, 
          symptoms: selectedSymptoms, 
          severity, 
          duration 
        })
      });
      const data = await response.json();
      setHospitals(data.hospitals);
      setStep('RESULT');
    } catch (error) {
      console.error("Failed to fetch hospitals:", error);
      // Fallback to error state or just stay in loading/result with empty
      setStep('RESULT');
    }
  };

  useEffect(() => {
    if (step === 'RESULT' && hospitals.length === 0) {
      // Small safeguard
    }
  }, [step]);

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

  const steps: TriageStep[] = ['COMPLAINT', 'LOCATION_PROMPT', 'SPECIALITY_INFO', 'SYMPTOMS', 'SEVERITY', 'DURATION', 'RESULT'];

  return (
    <motion.section 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -20 }}
      className="py-16 px-4 bg-surface min-h-[calc(100vh-80px)]"
    >
      <div className="max-w-2xl mx-auto">
        {step !== 'LOADING' && (
          <div className="mb-8 flex items-center justify-between">
            <button 
              onClick={() => {
                const idx = steps.indexOf(step);
                if (idx <= 0) onReset();
                else {
                  // Skip location prompt if going back and it was auto-detected
                  let prevStep = steps[idx - 1];
                  if (prevStep === 'LOCATION_PROMPT' && location) prevStep = 'COMPLAINT';
                  // Skip symptoms if going back from severity and it was skipped
                  if (prevStep === 'SYMPTOMS' && !showSymptoms) prevStep = 'SPECIALITY_INFO';
                  setStep(prevStep);
                }
              }}
              className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-primary"
            >
               ← Back
            </button>
            <div className="flex gap-2">
              {steps.map((s, idx) => (
                <div key={s} className={`h-1.5 w-6 rounded-full ${steps.indexOf(step) >= idx ? 'bg-accent' : 'bg-slate-200'}`} />
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl shadow-primary/5 border border-slate-100">
          {step === 'COMPLAINT' && (
            <div className="space-y-8">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 text-primary">
                  <PlusCircle size={32} />
                  <h3 className="text-3xl font-display font-bold">How can we help today?</h3>
                </div>
                <p className="text-xl text-slate-700 font-medium leading-relaxed">
                  I'll help you find the right care, fast. What's your main concern?
                </p>
              </div>

              {confirmationData && confirmationData.type === 'medical' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-primary/5 border border-primary/20 p-6 rounded-2xl space-y-4"
                >
                  <p className="text-primary font-bold">It sounds like you might mean "{confirmationData.suggestion}" — is that right?</p>
                  <div className="flex gap-3">
                    <button onClick={() => handleConfirmation(true)} className="flex-1 bg-primary text-white py-2 rounded-xl font-bold">Yes</button>
                    <button onClick={() => handleConfirmation(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 py-2 rounded-xl font-bold">No</button>
                  </div>
                </motion.div>
              )}

              {fallbackMessage && !confirmationData && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-accent/5 border border-accent/20 p-4 rounded-2xl"
                >
                  <p className="text-accent font-medium leading-relaxed">
                    {fallbackMessage}
                  </p>
                </motion.div>
              )}

              <textarea 
                className={`w-full bg-slate-50 border rounded-2xl p-6 h-40 focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all text-lg placeholder:text-slate-400 font-sans ${fallbackMessage ? 'border-accent/40' : 'border-slate-200'}`}
                placeholder="e.g., I have been feeling dizzy and have a mild fever. I'm in Ranchi."
                value={complaint}
                onChange={(e) => setState(prev => ({ ...prev, complaint: e.target.value }))}
                disabled={isLocked}
              />

              {isLocked ? (
                <button 
                  onClick={onReset}
                  className="w-full btn-outline py-4 text-xl"
                >
                  Start Over
                </button>
              ) : (
                <button 
                  disabled={!complaint.trim()} 
                  onClick={handleComplaintSubmit}
                  className="w-full btn-primary py-4 text-xl"
                >
                  Continue →
                </button>
              )}
            </div>
          )}

          {step === 'LOCATION_PROMPT' && (
            <div className="space-y-8 text-center py-4">
              <div className="mx-auto bg-primary/5 w-20 h-20 rounded-full flex items-center justify-center text-primary mb-2">
                <MapPin size={40} />
              </div>
              <div className="space-y-3">
                <h3 className="text-3xl font-display font-bold text-slate-900">Where are you located?</h3>
                <p className="text-slate-500 max-w-sm mx-auto">We need your area or city to find the best facilities closest to you.</p>
              </div>
              {locationError && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium border border-red-100">
                  {locationError}
                </div>
              )}

              {confirmationData && confirmationData.type === 'location' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-primary/5 border border-primary/20 p-6 rounded-2xl space-y-4"
                >
                  <p className="text-primary font-bold">Did you mean "{confirmationData.suggestion}"?</p>
                  <div className="flex gap-3">
                    <button onClick={() => handleConfirmation(true)} className="flex-1 bg-primary text-white py-2 rounded-xl font-bold">Yes</button>
                    <button onClick={() => handleConfirmation(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 py-2 rounded-xl font-bold">No</button>
                  </div>
                </motion.div>
              )}

              <div className="relative group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={24} />
                <input 
                  type="text"
                  autoFocus
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-6 pl-16 pr-6 focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all text-xl placeholder:text-slate-300"
                  placeholder="City name, Area, or PIN code"
                  value={tempLocation}
                  onChange={(e) => setTempLocation(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLocationSubmit()}
                />
              </div>
              <button 
                disabled={!tempLocation.trim()} 
                onClick={handleLocationSubmit}
                className="w-full btn-primary py-4 text-xl"
              >
                Set Location →
              </button>
            </div>
          )}

          {step === 'SPECIALITY_INFO' && speciality && (
            <div className="space-y-8">
              <div className="flex flex-col gap-6">
                <div className="space-y-2">
                  <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/5 px-3 py-1 rounded-full">Analysis complete</span>
                  <h3 className="text-3xl font-display font-bold text-slate-900">This sounds like it may need <span className="text-primary">{speciality.name}</span> care.</h3>
                </div>
                
                <div className="grid gap-6">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex gap-4">
                    <div className="text-primary mt-1"><Activity size={24} /></div>
                    <div>
                      <p className="font-bold text-slate-800">What this means</p>
                      <p className="text-slate-600 leading-relaxed">{speciality.explanation}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex gap-4">
                    <div className="text-primary mt-1"><HospitalIcon size={24} /></div>
                    <div>
                      <p className="font-bold text-slate-800">Typical facilities</p>
                      <p className="text-slate-600 leading-relaxed">{speciality.facilities}</p>
                    </div>
                  </div>
                  <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10 flex gap-4">
                    <div className="text-primary mt-1"><Shield size={24} /></div>
                    <div>
                      <p className="font-bold text-slate-800 underline decoration-primary/20 underline-offset-4 tracking-tight">Initial Urgency: {speciality.urgencyDefault}</p>
                      <p className="text-slate-600 text-sm italic">{speciality.urgencyReason}</p>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-slate-500 text-center font-medium italic">"Let me ask a few more details to find the best facility near you."</p>
              <button 
                onClick={handleSpecialityContinue}
                className="w-full btn-primary py-4 text-xl"
              >
                Continue to Details →
              </button>
            </div>
          )}

          {step === 'SYMPTOMS' && (
            <div className="space-y-8">
              <div className="flex items-center gap-3 text-primary">
                <Activity size={32} />
                <h3 className="text-3xl font-display font-bold">Any additional symptoms?</h3>
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
                      setState(prev => ({ ...prev, severity: sev.label }));
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
                      setState(prev => ({ ...prev, duration: dur }));
                      // We don't call setStep('RESULT') directly, we call fetchHospitals
                    }}
                    onMouseUp={() => {
                       // We trigger fetch in useEffect or here
                       setState(prev => ({ ...prev, duration: dur }));
                    }}
                    className={`text-left px-6 py-5 rounded-2xl border-2 transition-all font-bold text-lg ${duration === dur ? 'bg-primary/5 border-primary text-primary' : 'bg-white border-slate-100 text-slate-700 hover:border-slate-200'}`}
                  >
                    {dur}
                  </button>
                ))}
              </div>
              <button 
                disabled={!state.duration} 
                onClick={fetchHospitals}
                className="w-full btn-primary py-4 text-xl mt-4"
              >
                Search Facilities →
              </button>
            </div>
          )}

          {step === 'LOADING' && (
            <div className="flex flex-col items-center justify-center py-20 space-y-6">
              <Loader2 className="text-primary animate-spin" size={64} />
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-slate-800">Finding the best care...</h3>
                <p className="text-slate-500">Matching your symptoms with {location} facilities.</p>
              </div>
            </div>
          )}

          {step === 'RESULT' && (
            <ResultCard 
              hospitals={hospitals}
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
