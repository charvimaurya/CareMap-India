import { SpecialityInfo } from '../types';

export type ComplaintAnalysis = {
  isValid: boolean;
  normalizedComplaint?: string;
  healthIssues?: string[];
  specialityName?: string;
  showSymptoms?: boolean;
  location?: string;
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

async function postLlm<T>(payload: Record<string, unknown>): Promise<T | null> {
  try {
    const response = await fetch('/api/llm/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return null;
    return await response.json() as T;
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
  healthIssues: string[] = []
) => postLlm<FollowUpQuestionAnalysis>({
  type: 'followups',
  complaint,
  specialityName: speciality?.name,
  healthIssues,
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
