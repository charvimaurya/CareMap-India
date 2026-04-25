import { Hospital } from './types';

export const SYMPTOMS_LIST = [
  "High fever (above 101°F / 38.5°C)",
  "Severe body ache or joint pain",
  "Cough, cold, or sore throat",
  "Vomiting or diarrhea",
  "Severe headache or skin rash"
];

export const SEVERITY_LIST = [
  { id: 'mild', label: "Mild", desc: "I can manage daily activities" },
  { id: 'moderate', label: "Moderate", desc: "It's affecting my routine" },
  { id: 'severe', label: "Severe", desc: "I need help moving or functioning" },
  { id: 'emergency', label: "Emergency", desc: "I need immediate help" }
];

export const DURATION_LIST = [
  "Just started (under 2 hours)",
  "2–12 hours",
  "1–3 days",
  "Over a week"
];

export const MOCK_HOSPITALS: Hospital[] = [
  {
    name: "Sadar District Hospital, Ranchi",
    type: "Government District Hospital",
    why: "Equipped with 24/7 emergency care and specialized pediatric/fever clinics. Best for acute symptoms needing immediate triage.",
    trust: "HIGH",
    distance: "4.2 km away",
    location: "Main Road, Ranchi",
    mapQuery: "Sadar+Hospital+Ranchi",
    pin: "834001"
  },
  {
    name: "Apollo Pharmacy-Integrated Clinic",
    type: "Primary Care / Private Clinic",
    why: "Ideal for mild symptoms, cough, and cold. Fast service for routine consultations and vaccinations.",
    trust: "MEDIUM",
    distance: "1.8 km away",
    location: "Kutchery Road, Ranchi",
    mapQuery: "Apollo+Clinic+Ranchi",
    pin: "834001"
  },
  {
    name: "Medica Superspecialty Hospital",
    type: "Private Multispecialty",
    why: "Advanced diagnostics (CT, MRI) available for severe body aches or complicated skin rashes.",
    trust: "HIGH",
    distance: "6.5 km away",
    location: "Bariatu Rd, Ranchi",
    mapQuery: "Medica+Hospital+Ranchi",
    pin: "834009"
  }
];
