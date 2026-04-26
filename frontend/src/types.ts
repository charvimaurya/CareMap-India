export interface SpecialityInfo {
  name: string;
  explanation: string;
  facilities: string;
  urgencyDefault: "Routine" | "Urgent" | "Emergency";
  urgencyReason: string;
}

export interface ClinicMetadata {
  name?: string;
  officialPhone?: string;
  email?: string;
  address_city?: string;
  address_stateOrRegion?: string;
  address_country?: string;
  latitude?: number;
  longitude?: number;
  facilityTypeId?: string;
  operatorTypeId?: string;
  yearEstablished?: number;
  numberDoctors?: number;
  capacity?: number;
  name_json?: string;
  specialties_json?: string;
  procedure_json?: string;
  equipment_json?: string;
  capability_json?: string;
  phone_numbers_json?: string;
  websites_json?: string;
  [key: string]: unknown;
}

export interface ClinicSearchResult {
  id: string;
  rank: number;
  name: string;
  document: string;
  facilityType: string;
  city: string;
  state: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  openingHours: string | null;
  specialties: string[];
  procedures: string[];
  equipment: string[];
  capabilities: string[];
  totalScore: number;
  semanticScore: number;
  fieldScore: number;
  vectorDistance: number;
  mapQuery: string;
  metadata: ClinicMetadata;
}

export interface ClinicResultReview {
  verdict: 'positive' | 'mixed' | 'negative';
  score: number;
  summary: string;
  reasoning: string;
}

export interface ClinicSearchResponse {
  query: string;
  count: number;
  filters: {
    city: string | null;
    state: string | null;
    country: string | null;
    facility_type: string | null;
    user_lat: number | null;
    user_lon: number | null;
    enrich: boolean;
    enrich_top_k: number;
    max_distance_km: number | null;
  };
  retrievalInfo: {
    mode: string;
    candidateCount: number | null;
    prefilterCandidateCount: number | null;
    vectorCandidateCount: number | null;
    maxDistanceKm: number | null;
  };
  results: ClinicSearchResult[];
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
  userLat: number | null;
  userLon: number | null;
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
