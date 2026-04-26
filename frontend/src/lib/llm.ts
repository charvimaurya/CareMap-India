import { ClinicResultReview, ClinicSearchResult, SpecialityInfo } from '../types';

export type ComplaintAnalysis = {
  isValid: boolean;
  normalizedComplaint?: string;
  healthIssues?: string[];
  specialityName?: string;
  showSymptoms?: boolean;
  location?: string;
  severity?: 'Routine' | 'Urgent' | 'Emergency' | '';
  message?: string;
};

export type LocationAnalysis = {
  isValid: boolean;
  location?: string;
  message?: string;
};

export type FollowUpQuestion = {
  id: string;
  question: string;
  options: string[];
};

export type FollowUpQuestionAnalysis = {
  questions: FollowUpQuestion[];
};

export type TriageResultAnalysis = {
  label: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  text: string;
};

export type SearchSummaryAnalysis = {
  summary: string;
};

export type SearchResultReviewAnalysis = ClinicResultReview;

const delay = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

async function postLlm<T>(payload: Record<string, unknown>): Promise<T | null> {
  const maxAttempts = 3;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch('/api/llm/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return await response.json() as T;
      }

      if (response.status !== 429 || attempt === maxAttempts - 1) {
        return null;
      }

      await delay(1200 * (attempt + 1));
    }

    return null;
  } catch (error) {
    console.error('LLM request failed:', error);
    return null;
  }
}

export const analyzeComplaint = (complaint: string) => postLlm<ComplaintAnalysis>({
  type: 'complaint',
  complaint,
});

export const analyzeLocation = (location: string) => postLlm<LocationAnalysis>({
  type: 'location',
  location,
});

export const getFollowUpQuestions = (
  complaint: string,
  speciality: SpecialityInfo | null,
  healthIssues: string[] = [],
  options?: {
    hasLocation?: boolean;
    severity?: string;
  },
) => postLlm<FollowUpQuestionAnalysis>({
  type: 'followups',
  complaint,
  specialityName: speciality?.name,
  healthIssues,
  hasLocation: options?.hasLocation,
  severity: options?.severity,
});

export const analyzeTriageResult = (
  complaint: string,
  speciality: SpecialityInfo | null,
  answers: string[]
) => postLlm<TriageResultAnalysis>({
  type: 'triage_result',
  complaint,
  specialityName: speciality?.name,
  answers,
});

export const getSearchPromptSummary = (
  complaint: string,
  speciality: SpecialityInfo | null,
  severity: string,
  location: string,
  duration: string,
  answers: string[]
) => postLlm<SearchSummaryAnalysis>({
  type: 'search_summary',
  complaint,
  specialityName: speciality?.name,
  severity,
  location,
  duration,
  answers,
});

export const reviewSearchResult = (
  query: string,
  result: ClinicSearchResult,
) => postLlm<SearchResultReviewAnalysis>({
  type: 'result_review',
  query,
  result: {
    name: result.name,
    facilityType: result.facilityType,
    city: result.city,
    state: result.state,
    country: result.country,
    specialties: result.specialties,
    procedures: result.procedures,
    capabilities: result.capabilities,
    equipment: result.equipment,
    document: result.document,
  },
});
