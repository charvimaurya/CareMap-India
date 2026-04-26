import { SpecialityInfo } from '../types';

type ClinicSearchPromptInput = {
  complaint: string;
  speciality: SpecialityInfo | null;
  severity: string;
  duration: string;
  location: string;
  selectedSymptoms: string[];
};

export type ClinicSearchPromptDisplay = {
  qa: Array<{
    answer: string;
    question: string;
  }>;
  summary: Array<{
    label: string;
    value: string;
  }>;
};

const parseFollowUpAnswers = (selectedSymptoms: string[]) => selectedSymptoms.map(entry => {
  const [question, ...answerParts] = entry.split(': ');
  return {
    question,
    answer: answerParts.join(': ') || 'Not answered',
  };
});

export const buildClinicSearchPrompt = ({
  complaint,
  speciality,
  severity,
  duration,
  location,
  selectedSymptoms,
}: ClinicSearchPromptInput) => {
  const followUpSummary = selectedSymptoms.length
    ? selectedSymptoms.join('; ')
    : 'No follow-up answers were selected.';

  return [
    `Find the best ${speciality?.name || 'medical'} care facilities for this patient.`,
    `Primary complaint: ${complaint}.`,
    `Triage urgency: ${severity || speciality?.urgencyDefault || 'Routine'}.`,
    `Symptom duration: ${duration || 'Not specified'}.`,
    `Patient location: ${location || 'India'}.`,
    `LLM follow-up answers: ${followUpSummary}.`,
    `Prioritize facilities that match the speciality, have capability for this urgency level, and are relevant for the reported symptoms.`,
  ].join(' ');
};

export const buildClinicSearchPromptDisplay = ({
  complaint,
  speciality,
  severity,
  duration,
  location,
  selectedSymptoms,
}: ClinicSearchPromptInput): ClinicSearchPromptDisplay => ({
  summary: [
    { label: 'Complaint', value: complaint || 'Not provided' },
    { label: 'Specialty', value: speciality?.name || 'General Medicine' },
    { label: 'Urgency', value: severity || speciality?.urgencyDefault || 'Routine' },
    { label: 'Location', value: location || 'India' },
    { label: 'Duration', value: duration || 'Not specified' },
  ],
  qa: parseFollowUpAnswers(selectedSymptoms),
});
