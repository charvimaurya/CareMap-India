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

export type TriageStep = 'HOME' | 'COMPLAINT' | 'SYMPTOMS' | 'SEVERITY' | 'DURATION' | 'RESULT';

export interface TriageState {
  step: TriageStep;
  complaint: string;
  selectedSymptoms: string[];
  severity: string;
  duration: string;
}
