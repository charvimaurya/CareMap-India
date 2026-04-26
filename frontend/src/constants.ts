import { SpecialityInfo } from './types';

export const SPECIALITY_MAP: Record<string, SpecialityInfo> = {
  "Orthopaedics": {
    name: "Orthopaedics",
    explanation: "These specialists handle everything related to bones, joints, and muscles.",
    facilities: "District hospitals and private orthopaedic clinics usually handle this.",
    urgencyDefault: "Urgent",
    urgencyReason: "Suspected fractures or joint injuries need stabilization to prevent long-term damage."
  },
  "Cardiology": {
    name: "Cardiology",
    explanation: "Heart and blood vessel specialists who deal with cardiovascular health.",
    facilities: "Emergency rooms and hospitals with dedicated cardiac units.",
    urgencyDefault: "Emergency",
    urgencyReason: "Chest pain or breathlessness can be life-threatening and needs immediate ICU evaluation."
  },
  "General Medicine": {
    name: "General Medicine",
    explanation: "Broad medical care for common illnesses like fever, infections, and general aches.",
    facilities: "Primary health centres, private clinics, and outpatient departments.",
    urgencyDefault: "Routine",
    urgencyReason: "Common symptoms are usually managed with basic medication and observation."
  },
  "Gastroenterology": {
    name: "Gastroenterology",
    explanation: "Specialists for the stomach, intestines, and digestive health.",
    facilities: "Multi-speciality hospitals and specialized digestive clinics.",
    urgencyDefault: "Urgent",
    urgencyReason: "Severe stomach pain or persistent vomiting can lead to dehydration or serious blockages."
  },
  "Neurology": {
    name: "Neurology",
    explanation: "Specialists for the brain, spine, and nervous system.",
    facilities: "Major hospitals with CT/MRI facilities and neuro-specialists.",
    urgencyDefault: "Emergency",
    urgencyReason: "Loss of consciousness or seizures require immediate brain activity monitoring."
  },
  "Ophthalmology": {
    name: "Ophthalmology",
    explanation: "Specialists dedicated to eye health and vision care.",
    facilities: "Dedicated eye clinics or hospital ophthalmology departments.",
    urgencyDefault: "Urgent",
    urgencyReason: "Sudden vision changes or severe eye pain need quick checks to avoid permanent loss."
  },
  "Obstetrics & Gynaecology": {
    name: "Obstetrics & Gynaecology",
    explanation: "Specialists for women's reproductive health and pregnancy.",
    facilities: "Maternity homes, government hospitals, and women's health clinics.",
    urgencyDefault: "Urgent",
    urgencyReason: "Pregnancy-related symptoms need specialized monitoring for both mother and child."
  },
  "Paediatrics": {
    name: "Paediatrics",
    explanation: "Doctors who specialize in the health and growth of children.",
    facilities: "Children's hospitals and paediatric clinics.",
    urgencyDefault: "Urgent",
    urgencyReason: "Children can develop complications faster than adults and need paediatric-specific doses."
  },
  "Dermatology": {
    name: "Dermatology",
    explanation: "Skin, hair, and nail specialists.",
    facilities: "Skin clinics and hospital dermatology units.",
    urgencyDefault: "Routine",
    urgencyReason: "Most skin issues are not life-threatening but can be uncomfortable without proper care."
  },
  "Psychiatry": {
    name: "Psychiatry",
    explanation: "Specialists for mental well-being and emotional health.",
    facilities: "Mental health centers and specific hospital departments.",
    urgencyDefault: "Routine",
    urgencyReason: "Mental health concerns benefit from structured therapy and counselling sessions."
  },
  "Dentistry": {
    name: "Dentistry",
    explanation: "Specialists for teeth, gums, and oral health.",
    facilities: "Dental clinics and hospital dental wings.",
    urgencyDefault: "Routine",
    urgencyReason: "Tooth pain is usually localized but needs professional evaluation for tooth decay."
  },
  "Oncology": {
    name: "Oncology",
    explanation: "Specialists for the diagnosis and treatment of cancer.",
    facilities: "Cancer care hospitals and specialized oncology wings.",
    urgencyDefault: "Routine",
    urgencyReason: "Oncology care involves long-term planning and specialized test results."
  },
  "Nephrology": {
    name: "Nephrology",
    explanation: "Specialists for kidney health and related functions.",
    facilities: "Dialysis centers and hospitals with nephrology units.",
    urgencyDefault: "Urgent",
    urgencyReason: "Kidney issues can affect the entire body's balance and may need regular monitoring."
  },
  "Endocrinology": {
    name: "Endocrinology",
    explanation: "Specialists for hormones, thyroid, and diabetes.",
    facilities: "Hospitals with endocrine clinics or specialized private practice.",
    urgencyDefault: "Routine",
    urgencyReason: "Hormone imbalances are typically chronic and managed with long-term plans."
  }
};

export const DEFAULT_SPECIALITY: SpecialityInfo = {
  name: "General Medicine",
  explanation: "Standard medical care for general health issues.",
  facilities: "Primary health centres and outpatient departments.",
  urgencyDefault: "Routine",
  urgencyReason: "General symptoms usually benefit from a first-level GP evaluation."
};
