import React, { useState } from 'react';
import { motion } from 'motion/react';
import { PlusCircle, Activity, Shield, MapPin, Search, Hospital as HospitalIcon, Loader2 } from 'lucide-react';
import { TriageStep, TriageState, Hospital, SpecialityInfo } from '../../types';
import { SPECIALITY_MAP } from '../../constants';
import { ResultCard } from './ResultCard';
import { analyzeComplaint, analyzeLocation, analyzeTriageResult, FollowUpQuestion, getFollowUpQuestions } from '../../lib/llm';

interface TriageFlowProps {
  state: TriageState;
  setState: React.Dispatch<React.SetStateAction<TriageState>>;
  onReset: () => void;
  needsManualLocation: boolean;
}

export const TriageFlow: React.FC<TriageFlowProps> = ({ state, setState, onReset, needsManualLocation }) => {
  const { step, complaint, selectedSymptoms, severity, duration, location, speciality, showSymptoms, fallbackCount, fallbackMessage, locationAttempts, confirmationData } = state;
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [tempLocation, setTempLocation] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [triageSummary, setTriageSummary] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCheckingLocation, setIsCheckingLocation] = useState(false);

  const setStep = (s: TriageStep) => setState(prev => ({ ...prev, step: s }));
  
  const handleComplaintSubmit = async () => {
    setIsAnalyzing(true);
    const llmAnalysis = await analyzeComplaint(complaint);

    if (!llmAnalysis) {
      handleFallback("I can't check that right now because the AI service is unavailable. Please try again in a moment.");
      setIsAnalyzing(false);
      return;
    }

    if (!llmAnalysis.isValid) {
      handleFallback(llmAnalysis.message || "Could you describe the health issue or symptom you are facing?");
      setIsAnalyzing(false);
      return;
    }

    if (!llmAnalysis.specialityName || !SPECIALITY_MAP[llmAnalysis.specialityName]) {
      handleFallback("I couldn't match that to a medical speciality. Please describe the health issue another way.");
      setIsAnalyzing(false);
      return;
    }

    await processValidComplaint({
      text: llmAnalysis.normalizedComplaint || complaint,
      speciality: SPECIALITY_MAP[llmAnalysis.specialityName],
      showSymptoms: llmAnalysis.showSymptoms,
      detectedLocation: llmAnalysis.location,
      healthIssues: llmAnalysis.healthIssues,
    });
    setIsAnalyzing(false);
  };

  const handleFallback = (message: string) => {
    setState(prev => ({
      ...prev,
      fallbackCount: fallbackCount + 1,
      fallbackMessage: message
    }));
  };

  const processValidComplaint = async ({
    text,
    speciality,
    showSymptoms,
    detectedLocation,
    healthIssues,
  }: {
    text: string;
    speciality: SpecialityInfo;
    showSymptoms?: boolean;
    detectedLocation?: string;
    healthIssues?: string[];
  }) => {
    const questionsAnalysis = await getFollowUpQuestions(text, speciality, healthIssues);
    const nextQuestions = questionsAnalysis?.questions
      ?.filter(question => question.question && question.options?.length)
      .map((question, index) => ({
        ...question,
        id: question.id || `question-${index + 1}`,
        options: question.options.filter(Boolean).slice(0, 5),
      }))
      .filter(question => question.options.length >= 2)
      .slice(0, 4);

    if (!nextQuestions?.length) {
      handleFallback("I couldn't prepare follow-up questions right now because the AI service is unavailable. Please try again.");
      return;
    }

    setState(prev => ({
      ...prev,
      complaint: text,
      speciality,
      location: detectedLocation || prev.location,
      showSymptoms: true,
      selectedSymptoms: [],
      severity: '',
      duration: '',
      fallbackMessage: null,
      confirmationData: null
    }));
    setFollowUpQuestions(nextQuestions);
    setCurrentQuestionIndex(0);

    if (!detectedLocation && needsManualLocation) {
      setStep('LOCATION_PROMPT');
    } else {
      setStep('SPECIALITY_INFO');
    }
  };

  const handleLocationSubmit = async () => {
    if (!tempLocation.trim()) return;

    if (/^\d{4,8}$/.test(tempLocation.trim())) {
      setLocationError("Please add your city or area name with the PIN code, for example 'Delhi 110001'. A city or area name alone is also fine.");
      setState(prev => ({ ...prev, locationAttempts: locationAttempts + 1 }));
      return;
    }

    setIsCheckingLocation(true);
    const llmLocation = await analyzeLocation(tempLocation);

    if (!llmLocation) {
      setLocationError("I can't check that location right now because the AI service is unavailable. Please try again in a moment.");
      setIsCheckingLocation(false);
      return;
    }

    if (!llmLocation.isValid || !llmLocation.location) {
      setLocationError(llmLocation.message || "Please enter a valid Indian city, area, or 6-digit PIN code.");
      setState(prev => ({ ...prev, locationAttempts: locationAttempts + 1 }));
      setIsCheckingLocation(false);
      return;
    }

    setState(prev => ({ 
      ...prev, 
      location: llmLocation.location!,
      locationAttempts: 0,
      confirmationData: null
    }));
    setLocationError(null);
    setStep('SPECIALITY_INFO');
    setIsCheckingLocation(false);
  };

  const handleConfirmation = (confirmed: boolean) => {
    if (!confirmationData) return;

    if (confirmed) {
      if (confirmationData.type === 'medical') {
        setState(prev => ({ ...prev, confirmationData: null }));
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
    setStep('SYMPTOMS');
  };

  const fetchHospitals = async (severityOverride?: string) => {
    setStep('LOADING');
    try {
      const response = await fetch('/api/hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          speciality, 
          location, 
          symptoms: selectedSymptoms, 
          severity: severityOverride || severity, 
          duration 
        })
      });
      if (!response.ok) {
        throw new Error(`Hospital search failed with status ${response.status}`);
      }
      const data = await response.json();
      setHospitals(Array.isArray(data.hospitals) ? data.hospitals : []);
      setStep('RESULT');
    } catch (error) {
      console.error("Failed to fetch hospitals:", error);
      setHospitals([]);
      setStep('RESULT');
    }
  };

  const currentQuestion = followUpQuestions[currentQuestionIndex];
  const currentAnswer = currentQuestion
    ? selectedSymptoms.find(answer => answer.startsWith(`${currentQuestion.question}: `))
    : null;

  const selectFollowUpAnswer = (answer: string) => {
    if (!currentQuestion) return;
    const formattedAnswer = `${currentQuestion.question}: ${answer}`;

    setState(prev => ({
      ...prev,
      selectedSymptoms: [
        ...prev.selectedSymptoms.filter(item => !item.startsWith(`${currentQuestion.question}: `)),
        formattedAnswer
      ]
    }));
  };

  const continueFollowUps = async () => {
    if (currentQuestionIndex < followUpQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      return;
    }

    const triageResult = await analyzeTriageResult(complaint, speciality, selectedSymptoms);
    if (!triageResult) {
      handleFallback("I couldn't categorize your care level right now because the AI service is unavailable. Please try again.");
      return;
    }

    const finalSeverity = triageResult.label === 'EMERGENCY'
      ? 'Emergency'
      : triageResult.label === 'URGENT'
        ? 'Urgent'
        : 'Routine';

    setTriageSummary(triageResult.text);
    setState(prev => ({
      ...prev,
      duration: 'LLM follow-up answers provided',
      severity: finalSeverity
    }));
    await fetchHospitals(finalSeverity);
  };

  const getTriageClass = () => {
    if (severity === 'Emergency') return { label: 'EMERGENCY', color: 'bg-red-600', text: triageSummary || 'Call 112 immediately. Go to the nearest Emergency Room.' };
    if (severity === 'Urgent' || severity === 'Severe') return { label: 'URGENT', color: 'bg-orange-600', text: triageSummary || 'Seek medical attention within 24 hours. A specialist should evaluate this.' };
    return { label: 'ROUTINE', color: 'bg-blue-600', text: triageSummary || 'Schedule a routine visit with a primary care physician or clinic.' };
  };

  const steps: TriageStep[] = ['COMPLAINT', 'LOCATION_PROMPT', 'SPECIALITY_INFO', 'SYMPTOMS', 'RESULT'];

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
              />

              <button 
                disabled={!complaint.trim() || isAnalyzing} 
                onClick={() => void handleComplaintSubmit()}
                className="w-full btn-primary py-4 text-xl"
              >
                {isAnalyzing ? 'Checking...' : 'Continue →'}
              </button>
            </div>
          )}

          {step === 'LOCATION_PROMPT' && (
            <div className="space-y-8 text-center py-4">
              <div className="mx-auto bg-primary/5 w-20 h-20 rounded-full flex items-center justify-center text-primary mb-2">
                <MapPin size={40} />
              </div>
              <div className="space-y-3">
                <h3 className="text-3xl font-display font-bold text-slate-900">Where are you located?</h3>
                <p className="text-slate-500 max-w-sm mx-auto">
                  I couldn't use your browser location. Enter your city or area name. You can add a PIN code too, but a PIN code alone is not enough.
                </p>
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
                  placeholder="e.g., Delhi or Delhi 110001"
                  value={tempLocation}
                  onChange={(e) => setTempLocation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleLocationSubmit();
                  }}
                />
              </div>
              <button 
                disabled={!tempLocation.trim() || isCheckingLocation} 
                onClick={() => void handleLocationSubmit()}
                className="w-full btn-primary py-4 text-xl"
              >
                {isCheckingLocation ? 'Checking Location...' : 'Set Location →'}
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
                <h3 className="text-3xl font-display font-bold">A few quick details</h3>
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-slate-500">
                  Question {currentQuestionIndex + 1} of {followUpQuestions.length}
                </p>
                <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/5 px-3 py-1 rounded-full">
                  AI tailored
                </span>
              </div>
              {currentQuestion ? (
                <>
                  <h4 className="text-2xl font-display font-bold text-slate-900">{currentQuestion.question}</h4>
                  <div className="grid gap-3">
                    {currentQuestion.options.map(option => {
                      const isSelected = currentAnswer === `${currentQuestion.question}: ${option}`;

                      return (
                        <button
                          key={option}
                          onClick={() => selectFollowUpAnswer(option)}
                          className={`text-left px-6 py-5 rounded-2xl border-2 transition-all font-bold ${isSelected ? 'bg-primary/5 border-primary text-primary' : 'bg-white border-slate-100 text-slate-700 hover:border-slate-200'}`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  <button 
                    disabled={!currentAnswer} 
                    onClick={() => void continueFollowUps()}
                    className="w-full btn-primary py-4 text-xl"
                  >
                    {currentQuestionIndex < followUpQuestions.length - 1 ? 'Continue →' : 'Search Facilities →'}
                  </button>
                </>
              ) : (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium border border-red-100">
                  I could not prepare follow-up questions. Please go back and try again.
                </div>
              )}
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
