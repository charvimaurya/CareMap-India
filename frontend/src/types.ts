export interface SpecialityInfo {
  name: string;
  explanation: string;
  facilities: string;
  urgencyDefault: "Routine" | "Urgent" | "Emergency";
  urgencyReason: string;
}

export interface Hospital {
  name: string;
  type: string;
  why: string;
  trust: "HIGH" | "MEDIUM" | "LOW";
  distance: string;
  location: string;
  mapQuery: string;
  pin: string;
}

export type TriageStep = 
  | 'HOME' 
  | 'COMPLAINT' 
  | 'LOCATION_PROMPT' 
  | 'SPECIALITY_INFO' 
  | 'SYMPTOMS' 
  | 'SEVERITY' 
  | 'DURATION' 
  | 'LOADING'
  | 'RESULT';

export interface TriageState {
  step: TriageStep;
  complaint: string;
  selectedSymptoms: string[];
  severity: string;
  duration: string;
  location: string;
  speciality: SpecialityInfo | null;
  showSymptoms: boolean;
  fallbackCount: number;
  fallbackMessage: string | null;
  isLocked: boolean;
  locationAttempts: number;
  confirmationData: {
    type: 'medical' | 'location';
    original: string;
    suggestion: string;
  } | null;
}
