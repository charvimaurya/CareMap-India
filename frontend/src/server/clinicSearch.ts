import type { ServerResponse } from 'node:http';
import type { Connect } from 'vite';

type ClinicSearchPayload = {
  query?: string;
  location?: string;
  userLat?: number | null;
  userLon?: number | null;
};

type RemoteClinicResult = {
  id?: string;
  rank?: number;
  document?: string;
  vector_distance?: number;
  semantic_score?: number;
  field_score?: number;
  total_score?: number;
  distance_km?: number;
  enrichment?: {
    website?: string;
    opening_hours?: string;
  };
  metadata?: Record<string, unknown>;
};

type RemoteClinicSearchResponse = {
  query?: string;
  count?: number;
  filters?: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
    facility_type?: string | null;
    user_lat?: number | null;
    user_lon?: number | null;
    enrich?: boolean;
    enrich_top_k?: number;
    max_distance_km?: number | null;
  };
  retrieval_info?: {
    mode?: string;
    candidate_count?: number;
    prefilter_candidate_count?: number;
    vector_candidate_count?: number;
    max_distance_km?: number;
  };
  results?: RemoteClinicResult[];
};

const SEARCH_API_URL = 'http://127.0.0.1:5001/search';
const SEARCH_API_FALLBACK_URL = 'http://127.0.0.1:5001/rag-search';

const readJsonBody = (req: Connect.IncomingMessage) => new Promise<ClinicSearchPayload>((resolve, reject) => {
  let body = '';

  req.on('data', chunk => {
    body += chunk;
  });
  req.on('end', () => {
    try {
      resolve(body ? JSON.parse(body) as ClinicSearchPayload : {});
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

const parseMaybeJson = (text: string) => {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const parseJsonList = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const toTitleCase = (value: string) => value
  .replace(/[_-]+/g, ' ')
  .trim()
  .replace(/\b\w/g, letter => letter.toUpperCase());

const stringifyLocation = (parts: Array<string | null | undefined>) => parts
  .map(part => part?.trim())
  .filter(Boolean)
  .join(', ');

const extractCityFilter = (location?: string) => {
  if (!location) return null;

  const normalized = location
    .replace(/\b\d{6}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || null;
};

const toNumberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

const normalizeClinicResult = (result: RemoteClinicResult, index: number) => {
  const metadata = (result.metadata || {}) as Record<string, unknown>;
  const names = parseJsonList(metadata.name_json);
  const websites = parseJsonList(metadata.websites_json);
  const phoneNumbers = parseJsonList(metadata.phone_numbers_json);
  const city = typeof metadata.address_city === 'string' ? metadata.address_city : '';
  const state = typeof metadata.address_stateOrRegion === 'string' ? metadata.address_stateOrRegion : '';
  const country = typeof metadata.address_country === 'string' ? metadata.address_country : '';
  const name = typeof metadata.name === 'string'
    ? metadata.name
    : names[0] || `Facility ${index + 1}`;
  const latitude = toNumberOrNull(metadata.latitude);
  const longitude = toNumberOrNull(metadata.longitude);
  const facilityType = typeof metadata.facilityTypeId === 'string'
    ? toTitleCase(metadata.facilityTypeId)
    : typeof metadata.operatorTypeId === 'string'
      ? toTitleCase(metadata.operatorTypeId)
      : 'Clinic';

  return {
    id: result.id || `result-${index + 1}`,
    rank: typeof result.rank === 'number' ? result.rank : index + 1,
    name,
    document: typeof result.document === 'string' ? result.document : '',
    facilityType,
    city,
    state,
    country,
    latitude,
    longitude,
    distanceKm: toNumberOrNull(result.distance_km),
    phone: typeof metadata.officialPhone === 'string' ? metadata.officialPhone : phoneNumbers[0] || null,
    email: typeof metadata.email === 'string' ? metadata.email : null,
    website: result.enrichment?.website || websites[0] || null,
    openingHours: result.enrichment?.opening_hours || null,
    specialties: parseJsonList(metadata.specialties_json),
    procedures: parseJsonList(metadata.procedure_json),
    equipment: parseJsonList(metadata.equipment_json),
    capabilities: parseJsonList(metadata.capability_json),
    totalScore: typeof result.total_score === 'number' ? result.total_score : 0,
    semanticScore: typeof result.semantic_score === 'number' ? result.semantic_score : 0,
    fieldScore: typeof result.field_score === 'number' ? result.field_score : 0,
    vectorDistance: typeof result.vector_distance === 'number' ? result.vector_distance : 0,
    mapQuery: [name, stringifyLocation([city, state, country])].filter(Boolean).join(', '),
    metadata,
  };
};

export const createClinicSearchMiddleware = (authToken?: string): Connect.NextHandleFunction => async (req, res, next) => {
  if (req.url !== '/api/hospitals' || req.method !== 'POST') {
    next();
    return;
  }

  if (!authToken) {
    sendJson(res, 503, { error: 'AUTH_TOKEN is not configured.' });
    return;
  }

  try {
    const payload = await readJsonBody(req);

    if (!payload.query?.trim()) {
      sendJson(res, 400, { error: 'Missing search query.' });
      return;
    }

    const city = extractCityFilter(payload.location);
    const hasCoordinates = typeof payload.userLat === 'number'
      && Number.isFinite(payload.userLat)
      && typeof payload.userLon === 'number'
      && Number.isFinite(payload.userLon);
    const requestBody = {
      query: payload.query,
      n_results: 25,
      ...(hasCoordinates
        ? { user_lat: payload.userLat, user_lon: payload.userLon }
        : city
          ? { city }
          : {}),
    };

    const trySearch = async (url: string) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      const rawText = await response.text();

      return {
        ok: response.ok,
        status: response.status,
        url,
        rawText,
        parsed: parseMaybeJson(rawText),
      };
    };

    const primaryAttempt = await trySearch(SEARCH_API_URL);
    const fallbackAttempt = primaryAttempt.ok ? null : await trySearch(SEARCH_API_FALLBACK_URL);
    const successfulAttempt = primaryAttempt.ok ? primaryAttempt : fallbackAttempt?.ok ? fallbackAttempt : null;

    if (!successfulAttempt) {
      const primaryError = primaryAttempt.parsed && 'error' in primaryAttempt.parsed
        ? String(primaryAttempt.parsed.error)
        : primaryAttempt.rawText || `HTTP ${primaryAttempt.status}`;
      const fallbackError = fallbackAttempt
        ? (fallbackAttempt.parsed && 'error' in fallbackAttempt.parsed
          ? String(fallbackAttempt.parsed.error)
          : fallbackAttempt.rawText || `HTTP ${fallbackAttempt.status}`)
        : null;

      sendJson(res, 502, {
        error: 'Clinic search upstream failed.',
        details: {
          tried: [
            { url: primaryAttempt.url, status: primaryAttempt.status, message: primaryError },
            ...(fallbackAttempt ? [{ url: fallbackAttempt.url, status: fallbackAttempt.status, message: fallbackError }] : []),
          ],
        },
      });
      return;
    }

    const searchData = successfulAttempt.parsed as RemoteClinicSearchResponse | null;
    if (!searchData) {
      sendJson(res, 502, {
        error: 'Clinic search returned non-JSON output.',
        details: {
          url: successfulAttempt.url,
          status: successfulAttempt.status,
          body: successfulAttempt.rawText,
        },
      });
      return;
    }

    const normalizedResults = Array.isArray(searchData.results)
      ? searchData.results.map(normalizeClinicResult)
      : [];

    sendJson(res, 200, {
      query: searchData.query || payload.query,
      count: typeof searchData.count === 'number' ? searchData.count : normalizedResults.length,
      filters: {
        city: searchData.filters?.city || city,
        state: searchData.filters?.state || null,
        country: searchData.filters?.country || 'India',
        facility_type: searchData.filters?.facility_type || null,
        user_lat: searchData.filters?.user_lat || null,
        user_lon: searchData.filters?.user_lon || null,
        enrich: Boolean(searchData.filters?.enrich),
        enrich_top_k: searchData.filters?.enrich_top_k || 0,
        max_distance_km: searchData.filters?.max_distance_km || null,
      },
      retrievalInfo: {
        mode: searchData.retrieval_info?.mode || 'vector_only',
        candidateCount: searchData.retrieval_info?.candidate_count ?? null,
        prefilterCandidateCount: searchData.retrieval_info?.prefilter_candidate_count ?? null,
        vectorCandidateCount: searchData.retrieval_info?.vector_candidate_count ?? null,
        maxDistanceKm: searchData.retrieval_info?.max_distance_km ?? null,
      },
      results: normalizedResults,
    });
  } catch (error) {
    console.error('Clinic search middleware failed:', error);
    sendJson(res, 500, { error: 'Clinic search failed.' });
  }
};
