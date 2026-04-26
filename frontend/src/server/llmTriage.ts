import type { ServerResponse } from 'node:http';
import type { Connect } from 'vite';

const ZAI_MODEL = 'glm-5.1';
const GROQ_MODEL = 'llama-3.1-8b-instant';
const OPENROUTER_MODEL_POOL = [
  'minimax/minimax-m2.5:free',
] as const;

const SYSTEM_PROMPT = `You are a strict medical triage intake assistant for CareMap India.
You do not diagnose, prescribe, or give treatment advice.
You only return valid JSON matching the user's requested schema.

When generating follow-up questions:
- Ask fresh questions based on the user's original complaint and speciality.
- If the user mentions multiple health issues, identify every issue and ask about the combination, not just the first one.
- Prioritize questions that connect or separate the issues when that matters, such as fever with rash, chest pain with breathlessness, injury with head impact, vomiting with dehydration, or cancer with treatment side effects.
- Keep questions and options short, concrete, and patient-friendly.
- Do not ask generic duration questions unless duration is actually useful for that complaint.
- Prefer practical triage details that help route the patient to the right facility.

Sensible follow-up examples:
- Multiple issues: for "fever, chest pain, and vomiting", ask about breathing/sweating, ability to keep fluids down, and fever level instead of treating only fever. For "fall with headache and leg pain", ask about head hit/loss of consciousness, body part injury, and ability to walk.
- Injury or fall: ask which body part is hurt; whether they can move or bear weight; swelling, deformity, bleeding, numbness, or head impact when relevant.
- Possible fracture: ask body part; visible deformity or swelling; numbness or weakness; ability to move.
- Cancer: ask whether this is a new lump, known cancer, treatment side effect, or follow-up; ask known type/stage; ask current concern such as pain, bleeding, weight loss, fever, or treatment side effects.
- Fever or infection: ask temperature range, associated symptoms, and danger signs such as breathing trouble, confusion, rash, persistent vomiting, or dehydration.
- Pregnancy: ask weeks/months pregnant; bleeding or pain; fetal movement if later pregnancy.
- Dental pain: ask tooth/gum/jaw area, face swelling, fever, or trouble opening mouth.
- Chest pain: ask pain type, breathlessness/sweating, and radiation to arm/jaw.
- Mental health: ask main concern, immediate safety risk, and sleep/appetite impact.`;

type TriagePayload = {
  type?: 'complaint' | 'location' | 'followups' | 'triage_result' | 'search_summary' | 'result_review';
  complaint?: string;
  healthIssues?: string[];
  answers?: string[];
  location?: string;
  hasLocation?: boolean;
  specialityName?: string;
  severity?: string;
  duration?: string;
  query?: string;
  result?: {
    name?: string;
    facilityType?: string;
    city?: string;
    state?: string;
    country?: string;
    specialties?: string[];
    procedures?: string[];
    capabilities?: string[];
    equipment?: string[];
    document?: string;
  };
};

type ProviderResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
};

type ProviderAttemptResult = {
  ok: boolean;
  status: number;
  providerLabel: string;
  data: ProviderResponse | null;
  content: string;
};

let reviewProviderCursor = 0;

const readJsonBody = (req: Connect.IncomingMessage) => new Promise<TriagePayload>((resolve, reject) => {
  let body = '';

  req.on('data', chunk => {
    body += chunk;
  });
  req.on('end', () => {
    try {
      resolve(body ? JSON.parse(body) as TriagePayload : {});
    } catch (error) {
      reject(error);
    }
  });
  req.on('error', reject);
});

const sendJson = (res: ServerResponse, statusCode: number, data: unknown) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
};

const isPostcodeOnly = (value?: string) => Boolean(value?.trim().match(/^\d{4,8}$/));

const postcodeOnlyMessage = "Please add your city or area name with the PIN code, for example 'Delhi 110001'. A city or area name alone is also fine.";

const hasEmergencyDangerSigns = (payload: TriagePayload) => {
  const text = `${payload.complaint || ''} ${(payload.answers || []).join(' ')}`.toLowerCase();

  return Boolean(
    (text.includes('chest pain') && /(breath|sweat|arm|jaw|pressure|radiat)/.test(text))
    || /(loss of consciousness|unconscious|stroke|seizure|severe bleeding|suicidal|suicide|anaphylaxis|severe allergic|cannot breathe|breathing trouble)/.test(text)
    || (/head/.test(text) && /(confusion|vomiting|unconscious|loss of consciousness)/.test(text))
    || (/pregnan/.test(text) && /(severe bleeding|heavy bleeding)/.test(text))
  );
};

const extractJsonObject = (text: string) => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const buildPrompt = (payload: TriagePayload) => {
  if (payload.type === 'complaint') {
    return `Classify this user input for a medical triage app in India.
Input: "${payload.complaint || ''}"

Return only JSON:
{
  "isValid": boolean,
  "normalizedComplaint": string,
  "healthIssues": string[],
  "specialityName": "Orthopaedics" | "Cardiology" | "General Medicine" | "Gastroenterology" | "Neurology" | "Ophthalmology" | "Obstetrics & Gynaecology" | "Paediatrics" | "Dermatology" | "Psychiatry" | "Dentistry" | "Oncology" | "Nephrology" | "Endocrinology",
  "showSymptoms": boolean,
  "location": string,
  "severity": "Routine" | "Urgent" | "Emergency" | "",
  "message": string
}

Rules:
- isValid is true for any real illness, symptom, injury, pregnancy concern, dental issue, mental health concern, healthcare checkup, preventive screening, medication question, vaccination question, test/report question, or small health-related request.
- Even mild healthcare help such as "I want a checkup", "routine blood test", "health screening", "vaccine help", "diet advice for diabetes", or "doctor for mild headache" is valid.
- Greetings, jokes, weather, random text, insults, or non-health requests are invalid.
- If the input includes multiple health issues, healthIssues must list every meaningful health issue separately, for example ["fever", "chest pain", "vomiting"].
- normalizedComplaint should keep all meaningful health details in natural language, not only the first issue.
- specialityName should be the best primary speciality for the whole combination. If there are dangerous symptoms such as chest pain, breathlessness, loss of consciousness, stroke signs, severe bleeding, or head injury, prioritize the speciality/facility path that best handles the urgent risk.
- location should contain an Indian city, town, area, or city/area plus PIN found in the input, corrected if needed. A bare PIN/postcode alone is not enough; if only a PIN is present, return an empty string for location.
- severity should be "Emergency", "Urgent", or "Routine" only when the user already made that urgency clear from the initial message. Otherwise return an empty string.
- message should be a short helpful retry message if invalid, otherwise an empty string.`;
  }

  if (payload.type === 'location') {
    return `Validate this location for a CareMap India facility search.
Location: "${payload.location || ''}"

Return only JSON:
{
  "isValid": boolean,
  "location": string,
  "message": string
}

Rules:
- Accept Indian cities, towns, districts, and areas by name. A place name alone is enough.
- Accept a place name with a postcode/PIN, for example "Delhi 110001" or "Ranchi 834001".
- Do not accept a postcode/PIN by itself, even if it looks valid. The user must include a city, town, district, or area name.
- Correct obvious spelling mistakes.
- Reject foreign locations, vague answers, and non-location text.
- location should be the corrected city/town/area, with postcode/PIN included only if the user provided it with a name.
- If the input is only a postcode/PIN, isValid must be false, location must be empty, and message should say: "Please add your city or area name with the PIN code, for example 'Delhi 110001'. A city or area name alone is also fine."
- For other invalid input, message should be short, helpful, and ask for an Indian city, area, or city plus PIN.`;
  }

  if (payload.type === 'triage_result') {
    return `Categorize the user's care urgency after triage intake.
Complaint: "${payload.complaint || ''}"
Speciality: "${payload.specialityName || 'General Medicine'}"
Follow-up answers: ${JSON.stringify(payload.answers || [])}

Return only JSON:
{
  "label": "ROUTINE" | "URGENT" | "EMERGENCY",
  "text": string
}

Rules:
- Use ROUTINE for checkups, prevention, mild stable symptoms, non-urgent chronic care, report review, vaccination help, medication questions without danger signs, and minor health concerns.
- Use URGENT for symptoms that should be evaluated soon but do not clearly require immediate emergency care, such as worsening pain, suspected fracture without severe danger signs, persistent fever, dehydration risk, severe dental swelling, pregnancy pain without severe bleeding, or concerning cancer symptoms.
- Use EMERGENCY only for immediate danger signs: chest pain with breathlessness/sweating/radiation, stroke signs, loss of consciousness, severe breathing trouble, severe bleeding, head injury with confusion/vomiting, seizure, suicidal intent, severe allergic reaction, or severe pregnancy bleeding.
- Do not over-classify everything as urgent. Basic healthcare checks should be ROUTINE.
- text should be one short action sentence for the user.`;
  }

  if (payload.type === 'search_summary') {
    return `Summarize this care-facility search context for a compact map search box.
Complaint: "${payload.complaint || ''}"
Speciality: "${payload.specialityName || 'General Medicine'}"
Urgency: "${payload.severity || 'Routine'}"
Location: "${payload.location || 'India'}"
Duration: "${payload.duration || 'Not specified'}"
Follow-up answers: ${JSON.stringify(payload.answers || [])}

Return only JSON:
{
  "summary": string
}

Rules:
- summary must be a single short sentence, ideally 8 to 18 words.
- Mention the complaint, speciality or urgency, and the location when useful.
- Do not mention "LLM", "prompt", or "follow-up answers".
- Do not add diagnosis, prescription, or treatment advice.
- Keep it natural and scannable for a search UI.`;
  }

  if (payload.type === 'result_review') {
    return `Review whether this clinic search result is actually relevant to the user's search query.
Search query: "${payload.query || ''}"
Result JSON: ${JSON.stringify(payload.result || {})}

Return only JSON:
{
  "verdict": "positive" | "mixed" | "negative",
  "score": number,
  "summary": string,
  "reasoning": string
}

Rules:
- score must be an integer from 0 to 100.
- positive means the result is clearly relevant and useful (even if partially supported) for the query.
- mixed means it is not so relevant, not supported, or uncertain.
- negative means it is clearly mismatched or unhelpful for the query.
- Compare the query against speciality, procedures, capabilities, and the summary text in the result.
- Penalize speciality mismatch heavily. Example: dentistry for knee surgery should be negative.
- summary must be one short sentence, ideally 8 to 16 words.
- reasoning must be 1 to 3 concise sentences explaining the score.
- try to give a positive score when the hint is clear.
- Do not mention "LLM", "AI", "vector search", "ranking algorithm", or JSON.`;
  }

  return `Generate adaptive follow-up questions for this triage case.
Complaint: "${payload.complaint || ''}"
Health issues: ${JSON.stringify(payload.healthIssues || [])}
Speciality: "${payload.specialityName || 'General Medicine'}"
Location already known: ${payload.hasLocation ? 'yes' : 'no'}
Severity already known: "${payload.severity || ''}"

Return only JSON:
{
  "questions": [
    {
      "id": string,
      "question": string,
      "options": string[]
    }
  ]
}

Rules:
- Your goal is to collect only the missing essentials needed for search: exact medical problem/treatment intent, location, and severity.
- The actual problem and the location are mandatory. They cannot be skipped.
- Severity is optional. If the user skips it, the app will use Medium.
- Do not ask about symptoms.
- Return 0 to 2 questions, not more.
- Each question must have 3 to 5 short options.
- Options must be concise, patient-friendly, and mutually distinct.
- If the complaint already clearly states the medical issue or treatment being sought, do not ask the user to restate it.
- If location is already known, do not ask location.
- If severity is already known, do not ask severity.
- If only one essential is missing, return exactly one question.
- If nothing important is missing, return an empty questions array.
- Ask about all listed health issues when there is more than one, but combine related issues into one question when possible.
- If Health issues is empty, infer all health issues from Complaint and only ask to clarify if the complaint is too vague.
- Ask only sensible questions for the complaint. Do not ask duration.
- Prefer a single severity question when clinically relevant.
- Do not ask for personal identity, phone number, payment, or insurance.

Good examples:
- Injury or fall: if the body part is already clear, only ask severity.
- Possible fracture: only ask severity if the body part is already clear.
- Fever or infection: only ask severity if the illness is already clearly described.
- Cancer: if the cancer or treatment intent is already clear, only ask severity.
- Pregnancy: if pregnancy is already clear, only ask severity.
- Dental pain: if the issue is already clear, only ask severity.
- Chest pain: if the issue is already clear, only ask severity.
- Mental health: if the issue is already clear, only ask severity.
- Multiple complaints: ask the one missing essential first, then severity only if needed.`;
};

const requestZai = async (apiKey: string, payload: TriagePayload) => {
  const response = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ZAI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildPrompt(payload),
        },
      ],
    }),
  });

  const data = await response.json() as ProviderResponse;

  return {
    ok: response.ok,
    status: response.status,
    providerLabel: `zai:${ZAI_MODEL}`,
    data,
    content: data.choices?.[0]?.message?.content || '',
  };
};

const requestGroq = async (apiKey: string, payload: TriagePayload) => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildPrompt(payload),
        },
      ],
    }),
  });

  const data = await response.json() as ProviderResponse;

  return {
    ok: response.ok,
    status: response.status,
    providerLabel: `groq:${GROQ_MODEL}`,
    data,
    content: data.choices?.[0]?.message?.content || '',
  };
};

const requestOpenRouter = async (
  apiKey: string,
  model: typeof OPENROUTER_MODEL_POOL[number],
  payload: TriagePayload,
): Promise<ProviderAttemptResult> => {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'CareMap India Frontend',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildPrompt(payload),
        },
      ],
    }),
  });

  const data = await response.json() as ProviderResponse;

  return {
    ok: response.ok,
    status: response.status,
    providerLabel: `openrouter:${model}`,
    data,
    content: data.choices?.[0]?.message?.content || '',
  };
};

const requestReviewWithRoundRobin = async (
  payload: TriagePayload,
  options: {
    openRouterApiKey?: string;
    groqApiKey?: string;
    zaiApiKey?: string;
  },
) => {
  const providerFns: Array<() => Promise<ProviderAttemptResult>> = [];

  if (options.openRouterApiKey) {
    OPENROUTER_MODEL_POOL.forEach(model => {
      providerFns.push(() => requestOpenRouter(options.openRouterApiKey as string, model, payload));
    });
  }

  if (options.groqApiKey) {
    providerFns.push(() => requestGroq(options.groqApiKey, payload));
  }

  if (options.zaiApiKey) {
    providerFns.push(() => requestZai(options.zaiApiKey, payload));
  }

  if (!providerFns.length) return null;

  const startingIndex = reviewProviderCursor % providerFns.length;
  reviewProviderCursor = (reviewProviderCursor + 1) % providerFns.length;

  for (let offset = 0; offset < providerFns.length; offset += 1) {
    const providerIndex = (startingIndex + offset) % providerFns.length;
    const attempt = await providerFns[providerIndex]();
    if (attempt.ok && attempt.content.trim()) {
      return {
        ...attempt,
      };
    }
  }

  return null;
};

export const createLlmTriageMiddleware = (
  zaiApiKey?: string,
  groqApiKey?: string,
  openRouterApiKey?: string,
): Connect.NextHandleFunction => async (req, res, next) => {
  if (req.url !== '/api/llm/triage' || req.method !== 'POST') {
    next();
    return;
  }

  if (!zaiApiKey && !groqApiKey && !openRouterApiKey) {
    sendJson(res, 503, { error: 'No LLM provider key is configured.' });
    return;
  }

  try {
    const payload = await readJsonBody(req);
    if (!payload.type) {
      sendJson(res, 400, { error: 'Missing triage request type.' });
      return;
    }

    if (payload.type === 'location' && isPostcodeOnly(payload.location)) {
      sendJson(res, 200, {
        isValid: false,
        location: '',
        message: postcodeOnlyMessage,
      });
      return;
    }

    const successfulResponse = payload.type === 'result_review'
      ? await requestReviewWithRoundRobin(payload, {
        openRouterApiKey,
        groqApiKey,
        zaiApiKey,
      })
      : (() => undefined)();

    const defaultProviderResponse = payload.type !== 'result_review'
      ? (payload.type === 'followups' && groqApiKey
        ? await requestGroq(groqApiKey, payload)
        : zaiApiKey
          ? await requestZai(zaiApiKey, payload)
          : groqApiKey
            ? await requestGroq(String(groqApiKey), payload)
            : null)
      : null;

    const fallbackResponse = payload.type !== 'result_review'
      && payload.type !== 'followups'
      && defaultProviderResponse
      && !defaultProviderResponse.ok
      && groqApiKey
      && zaiApiKey
      ? await requestGroq(groqApiKey, payload)
      : null;

    const resolvedResponse = payload.type === 'result_review'
      ? successfulResponse
      : defaultProviderResponse?.ok
        ? defaultProviderResponse
        : fallbackResponse?.ok
          ? fallbackResponse
          : null;

    if (!resolvedResponse) {
      const status = payload.type === 'result_review'
        ? 429
        : (fallbackResponse || defaultProviderResponse)?.status || 500;
      sendJson(res, status, { error: 'LLM request failed.' });
      return;
    }

    const content = resolvedResponse.data?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(content);

    if (!parsed) {
      sendJson(res, 502, { error: 'LLM returned invalid JSON.' });
      return;
    }

    if (payload.type === 'complaint' && isPostcodeOnly(String(parsed.location || ''))) {
      parsed.location = '';
    }

    if (payload.type === 'location' && isPostcodeOnly(String(parsed.location || ''))) {
      sendJson(res, 200, {
        isValid: false,
        location: '',
        message: postcodeOnlyMessage,
      });
      return;
    }

    if (payload.type === 'triage_result' && hasEmergencyDangerSigns(payload)) {
      parsed.label = 'EMERGENCY';
      parsed.text = 'This may need immediate emergency care. Call 112 or go to the nearest emergency department now.';
    }

    if (payload.type === 'result_review') {
      const normalizedVerdict = String(parsed.verdict || '').toLowerCase();
      parsed.verdict = normalizedVerdict === 'positive' || normalizedVerdict === 'negative' ? normalizedVerdict : 'mixed';
      const numericScore = Number(parsed.score);
      parsed.score = Number.isFinite(numericScore)
        ? Math.max(0, Math.min(100, Math.round(numericScore)))
        : parsed.verdict === 'positive'
          ? 80
          : parsed.verdict === 'negative'
            ? 20
            : 50;
      parsed.summary = String(parsed.summary || 'The result shows a moderate match to the search.');
      parsed.reasoning = String(parsed.reasoning || 'This result has limited supporting evidence for the search.');
    }

    sendJson(res, 200, parsed);
  } catch (error) {
    console.error('LLM triage middleware failed:', error);
    sendJson(res, 500, { error: 'LLM triage failed.' });
  }
};
