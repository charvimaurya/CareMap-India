import { SPECIALITY_MAP, DEFAULT_SPECIALITY } from '../constants';
import { SpecialityInfo } from '../types';

// --- Fuzzy Matching & Typo Tolerance ---

const MEDICAL_DICTIONARY: Record<string, string> = {
  // Injuries
  "fracture": "fracture", "fraaacture": "fracture", "freacture": "fracture", "fractre": "fracture", "break": "fracture", "broken": "fracture",
  "sprain": "sprain", "wound": "wound", "burn": "burn", "cut": "cut", "injury": "injury", "fall": "injury", "accident": "injury",
  // Conditions
  "fever": "fever", "feverrr": "fever", "fevr": "fever", "cold": "cold", "coldd": "cold", "cough": "cough", "flu": "flu",
  "headache": "headache", "headaache": "headache", "headche": "headache", "dizzy": "dizzy",
  "pneumonia": "pneumonia", "numoniya": "pneumonia", "pnumonia": "pneumonia",
  "diabetes": "diabetes", "daibetes": "diabetes", "sugar": "diabetes", "bp": "blood pressure", "blood pressure": "blood pressure",
  "asthma": "asthma", "cholesterol": "cholesterol", "kolesterol": "cholesterol",
  "arthritis": "arthritis", "artharitis": "arthritis",
  "diarrhea": "diarrhea", "dairhea": "diarrhea", "loose motion": "diarrhea", "vomit": "vomit", "vomiting": "vomit",
  "stomach": "stomach", "stomch": "stomach", "stomache": "stomach ache",
  "seizure": "seizure", "fits": "seizure", "unconscious": "unconscious",
  "heart": "heart", "cardiac": "heart", "chest pain": "heart",
  "pregnancy": "pregnancy", "delivery": "delivery", "gynae": "gynaecology",
  "child": "child", "pediatric": "paediatrics", "baby": "paediatrics",
  "kidney": "kidney", "dialysis": "dialysis", "stones": "stones",
  "cancer": "cancer", "tumour": "cancer",
  "dentistry": "dentistry", "tooth": "dentistry", "dental": "dentistry"
};

const CITY_DICTIONARY: Record<string, string> = {
  "mumbai": "Mumbai", "mumabi": "Mumbai", "bombay": "Mumbai",
  "delhi": "Delhi", "dlehi": "Delhi", "dilli": "Delhi",
  "bangalore": "Bangalore", "bengaluru": "Bangalore", "bangalroe": "Bangalore",
  "hyderabad": "Hyderabad", "hydrabad": "Hyderabad",
  "chennai": "Chennai", "chenai": "Chennai", "madras": "Chennai",
  "kolkata": "Kolkata", "kolkatta": "Kolkata", "calcutta": "Kolkata",
  "pune": "Pune", "poona": "Pune",
  "ahmedabad": "Ahmedabad", "amdavad": "Ahmedabad",
  "jaipur": "Jaipur", "lucknow": "Lucknow", "patna": "Patna", "ranchi": "Ranchi",
  "gurgaon": "Gurgaon", "gurugram": "Gurgaon", "noida": "Noida", "faridabad": "Faridabad"
};

// Simple Indian City list for validation
const INDIAN_CITIES = [
  "mumbai", "delhi", "bangalore", "hyderabad", "ahmedabad", "chennai", "kolkata", "surat", "pune", "jaipur", "lucknow", "kanpur", "nagpur", "indore", "thane", "bhopal", "visakhapatnam", "pimpri", "patna", "vadodara", "ghaziabad", "ludhiana", "agra", "nashik", "ranchi", "faridabad", "meerut", "rajkot", "kalyan", "vasai", "varanasi", "srinagar", "aurangabad", "dhanbad", "amritsar", "navi mumbai", "allahabad", "howrah", "gwalior", "jabalpur", "coimbatore", "vijayawada", "jodhpur", "madurai", "raipur", "kota", "guwahati", "chandigarh", "solapur", "hubballi", "bareilly", "moradabad", "mysore", "gurugram", "gurgaon", "noida", "jalandhar", "tiruchirappalli", "aligarh"
];

const FOREIGN_CITIES = [
  "london", "new york", "dubai", "frankfurt", "paris", "tokyo", "singapore", "sydney", "toronto", "pakistan", "nepal", "usa", "uk", "america"
];

function fuzzyMatch(input: string, dictionary: Record<string, string>): { match: string | null, confidence: 'high' | 'low' } {
  const normalized = input.toLowerCase().trim();
  
  // Exact match
  if (dictionary[normalized]) return { match: dictionary[normalized], confidence: 'high' };

  // Partial match
  for (const key in dictionary) {
    if (key.includes(normalized) && normalized.length > 3) return { match: dictionary[key], confidence: 'low' };
    if (normalized.includes(key) && key.length > 3) return { match: dictionary[key], confidence: 'low' };
  }

  return { match: null, confidence: 'low' };
}

export type ValidationResult = 
  | { type: 'VALID'; corrected?: string }
  | { type: 'CONFIRM'; suggestion: string }
  | { type: 'GREETING'; message: string }
  | { type: 'OFF_TOPIC'; message: string }
  | { type: 'HOW_WORKS'; message: string }
  | { type: 'UNCLEAR'; message: string };

export function classifyInput(text: string): ValidationResult {
  const input = text.toLowerCase().trim();
  
  if (input.length < 3) return { 
    type: 'UNCLEAR', 
    message: "I didn't quite catch that. Could you describe what health issue you are facing? For example: 'I have a fever' or 'I fell and hurt my arm'." 
  };

  // 1. Check for medical keywords with fuzzy matching
  const words = input.split(/\s+/);
  let highConfidenceCorrection: string | null = null;
  let lowConfidenceCorrection: string | null = null;

  for (const word of words) {
    const fz = fuzzyMatch(word, MEDICAL_DICTIONARY);
    if (fz.match) {
      if (fz.confidence === 'high') {
        highConfidenceCorrection = fz.match;
        break; // Found a high confidence match, proceed
      } else {
        lowConfidenceCorrection = fz.match;
      }
    }
  }

  if (highConfidenceCorrection) return { type: 'VALID', corrected: highConfidenceCorrection };
  if (lowConfidenceCorrection) return { type: 'CONFIRM', suggestion: lowConfidenceCorrection };

  // 2. Fallbacks
  const greetings = /\b(hi|hello|hey|namaste|hola|good morning|good evening|good afternoon|greetings)\b/;
  if (greetings.test(input)) return { 
    type: 'GREETING', 
    message: "Hello! To find you the right care, could you tell me what health concern is bothering you today?" 
  };

  if (input.includes('how does this work') || input.includes('what do you do') || input.includes('help me understand')) return {
    type: 'HOW_WORKS',
    message: "Just describe your symptoms or concern and I'll match you to the nearest verified facility. What's bothering you today?"
  };

  if (input.includes('weather') || input.includes('joke') || input.includes('who are you') || input.includes('who created you')) return {
    type: 'OFF_TOPIC',
    message: "I'm CareMap India — I help you find the right medical facility based on your symptoms. What health concern can I help you with today?"
  };

  return { 
    type: 'UNCLEAR', 
    message: "I didn't quite catch that. Could you describe what health issue you are facing? For example: 'I have a fever' or 'I fell and hurt my arm'." 
  };
}

export function parseMedicalIntent(text: string): SpecialityInfo {
  const input = text.toLowerCase();
  
  // Try fuzzy matching first for best results
  const fz = fuzzyMatch(input.split(/\s+/)[0], MEDICAL_DICTIONARY); // Check first word or common terms
  const target = fz.match || input;

  if (target.match(/fracture|broken bone|fall injury|hit|crack/)) return SPECIALITY_MAP["Orthopaedics"];
  if (target.match(/chest pain|heart|breathlessness|cardiac|palpitation/)) return SPECIALITY_MAP["Cardiology"];
  if (target.match(/fever|cold|cough|body ache|infection|flu|shiver/)) return SPECIALITY_MAP["General Medicine"];
  if (target.match(/stomach pain|vomiting|diarrhea|loose motion|acidity|gas/)) return SPECIALITY_MAP["Gastroenterology"];
  if (target.match(/headache|seizure|unconscious|faint|stroke|nerve/)) return SPECIALITY_MAP["Neurology"];
  if (target.match(/eye pain|vision loss|blind|blur|red eye/)) return SPECIALITY_MAP["Ophthalmology"];
  if (target.match(/pregnancy|delivery|gynae|periods|women's health/)) return SPECIALITY_MAP["Obstetrics & Gynaecology"];
  if (target.match(/child|infant|kid|pediatric|baby/)) return SPECIALITY_MAP["Paediatrics"];
  if (target.match(/skin rash|allergy|itch|pimple|dermat/)) return SPECIALITY_MAP["Dermatology"];
  if (target.match(/mental health|anxiety|depression|stress|panic/)) return SPECIALITY_MAP["Psychiatry"];
  if (target.match(/dental|tooth pain|gums|cavity/)) return SPECIALITY_MAP["Dentistry"];
  if (target.match(/cancer|tumour|oncology|chemo/)) return SPECIALITY_MAP["Oncology"];
  if (target.match(/kidney|dialysis|urine|nephro/)) return SPECIALITY_MAP["Nephrology"];
  if (target.match(/diabetes|thyroid|hormone|sugar|endocrine/)) return SPECIALITY_MAP["Endocrinology"];

  return DEFAULT_SPECIALITY;
}

export function validateLocation(text: string): { isValid: boolean, message?: string, correction?: string, isHighConfidence?: boolean } {
  const input = text.toLowerCase().trim();
  
  // 1. PIN Code check (6 digits, 1-8 start)
  const pinMatch = input.match(/^[1-8]\d{5}$/);
  if (pinMatch) return { isValid: true };
  if (input.match(/^\d+$/) && input.length !== 6) return { isValid: false, message: "PIN codes in India are exactly 6 digits. Could you re-check your entry?" };

  // 2. Check for foreign cities
  for (const city of FOREIGN_CITIES) {
    if (input.includes(city)) return { isValid: false, message: "I can only search for facilities within India. Could you share your city, district, or PIN code in India?" };
  }

  // 3. Check for recognized Indian cities / areas with fuzzy matching
  const cityFz = fuzzyMatch(input, CITY_DICTIONARY);
  if (cityFz.match) {
    return { 
      isValid: true, 
      correction: cityFz.match, 
      isHighConfidence: cityFz.confidence === 'high' 
    };
  }

  // 4. Check against larger city list
  for (const city of INDIAN_CITIES) {
    if (input.includes(city)) return { isValid: true };
  }

  // 5. Basic length/gibberish check
  if (input.length <= 2 || !/^[a-zA-Z\s]+$/.test(input) || ["hospital", "doctor", "yes", "idk", "no"].includes(input)) {
    return { isValid: false, message: "I'm having trouble identifying your location. Please enter a valid Indian city name or 6-digit PIN code." };
  }

  // Assume valid if it looks like a name but not in dictionary (could be a small town)
  return { isValid: true };
}

export function parseLocationIntent(text: string): string | null {
  const pinMatch = text.match(/\b[1-8]\d{5}\b/);
  if (pinMatch) return pinMatch[0];

  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    const fz = fuzzyMatch(word, CITY_DICTIONARY);
    if (fz.match && fz.confidence === 'high') return fz.match;
  }

  for (const city of INDIAN_CITIES) {
    if (text.toLowerCase().includes(city)) return city.charAt(0).toUpperCase() + city.slice(1);
  }

  return null;
}

export function shouldShowSymptomStep(text: string, specialityName: string): boolean {
  const input = text.toLowerCase();

  if (input.match(/fracture|broken bone|sprain|wound|burn|cut|injury|fall|accident/)) return false;
  if (input.match(/i have diabetes|i am diabetic|kidney stones|appendicitis|cancer|tumour/)) return false;
  if (input.match(/diagnosed with/)) return false;

  const skipSpecialities = [
    "Dentistry",
    "Ophthalmology",
    "Psychiatry",
    "Obstetrics & Gynaecology",
    "Oncology",
    "Dermatology"
  ];
  if (skipSpecialities.includes(specialityName)) return false;

  if (input.match(/something in my eye|something went into/)) return false;
  if (input.match(/depressed|depression|anxiety|panic attack/)) return false;

  return true;
}
