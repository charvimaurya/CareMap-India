import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, MapPinned, Search } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ClinicResultReview, ClinicSearchResult } from '../../types';
import { ClinicSearchPromptDisplay } from '../../lib/clinicSearch';

const DEFAULT_MAP_CENTER: [number, number] = [22.9734, 78.6569];
const DEFAULT_MAP_ZOOM = 5;
const DESERT_GRID_RESOLUTION = 16;
const DESERT_MAX_COUNT = 4;
const DESERT_MIN_RADIUS_KM = 1.2;
const DIRECTION_LABELS = ['East', 'North-East', 'North', 'North-West', 'West', 'South-West', 'South', 'South-East'];

interface ResultsMapProps {
  activeResultId: string | null;
  onActiveChange: (resultId: string) => void;
  resultReviews: Record<string, ClinicResultReview>;
  results: ClinicSearchResult[];
  searchPromptDisplay: ClinicSearchPromptDisplay;
  searchPromptSummary: string;
}

const getReviewClassName = (review?: ClinicResultReview) => {
  if (!review) return 'is-pending';
  if (review.verdict === 'positive') return 'is-positive';
  if (review.verdict === 'negative') return 'is-negative';
  return 'is-mixed';
};

const createMarkerMarkup = (rank: number, isActive: boolean, review?: ClinicResultReview) => [
  `<div class="search-map-pin ${getReviewClassName(review)}${isActive ? ' is-active' : ''}">`,
  `<span class="search-map-pin__label">${rank}</span>`,
  '</div>',
].join('');

type DensityDesert = {
  center: [number, number];
  radiusMeters: number;
  label: string;
};

const toLocalKm = ([latitude, longitude]: [number, number], [originLat, originLng]: [number, number]) => {
  const latKm = (latitude - originLat) * 110.574;
  const lngKm = (longitude - originLng) * (111.32 * Math.cos((originLat * Math.PI) / 180));

  return [lngKm, latKm] as [number, number];
};

const fromLocalKm = ([xKm, yKm]: [number, number], [originLat, originLng]: [number, number]) => {
  const latitude = originLat + (yKm / 110.574);
  const longitude = originLng + (xKm / (111.32 * Math.cos((originLat * Math.PI) / 180)));

  return [latitude, longitude] as [number, number];
};

const buildDensityDeserts = (points: [number, number][]): DensityDesert[] => {
  if (points.length < 5) return [];

  const centroid = points.reduce<[number, number]>(
    (accumulator, point) => [accumulator[0] + point[0], accumulator[1] + point[1]],
    [0, 0],
  ).map(value => value / points.length) as [number, number];

  const localPoints = points.map(point => toLocalKm(point, centroid));

  const xs = localPoints.map(([x]) => x);
  const ys = localPoints.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const span = Math.max(spanX, spanY);

  // Results too clustered to identify meaningful gaps
  if (span < 3) return [];

  // Median nearest-neighbor distance — local "expected spacing"
  const nearestNeighborDistances = localPoints.map((point, index) => {
    let nearest = Infinity;
    localPoints.forEach((other, otherIndex) => {
      if (index === otherIndex) return;
      const distance = Math.hypot(point[0] - other[0], point[1] - other[1]);
      if (distance < nearest) nearest = distance;
    });
    return nearest;
  });

  const sortedNN = [...nearestNeighborDistances].sort((a, b) => a - b);
  const medianNN = sortedNN[Math.floor(sortedNN.length / 2)] || 1;
  // A point at >2.2x the median spacing is genuinely isolated
  const desertThreshold = Math.max(medianNN * 2.2, 1.5);

  // Sample candidate centers on a grid covering the result region (with margin)
  const margin = span * 0.12;
  const gridStepX = (spanX + 2 * margin) / DESERT_GRID_RESOLUTION;
  const gridStepY = (spanY + 2 * margin) / DESERT_GRID_RESOLUTION;
  const maxConsideredRadius = Math.hypot(spanX, spanY) * 0.6;

  type Candidate = { x: number; y: number; nearestDistance: number };
  const candidates: Candidate[] = [];

  for (let i = 0; i <= DESERT_GRID_RESOLUTION; i += 1) {
    for (let j = 0; j <= DESERT_GRID_RESOLUTION; j += 1) {
      const x = minX - margin + i * gridStepX;
      const y = minY - margin + j * gridStepY;

      // Stay within a reasonable region around the centroid
      if (Math.hypot(x, y) > maxConsideredRadius) continue;

      let nearestDistance = Infinity;
      for (const [px, py] of localPoints) {
        const distance = Math.hypot(x - px, y - py);
        if (distance < nearestDistance) nearestDistance = distance;
      }

      if (nearestDistance >= desertThreshold) {
        candidates.push({ x, y, nearestDistance });
      }
    }
  }

  if (!candidates.length) return [];

  // Greedy: pick the most-isolated candidate, mark its catchment, repeat
  candidates.sort((a, b) => b.nearestDistance - a.nearestDistance);

  const deserts: DensityDesert[] = [];
  const claimedRegions: { x: number; y: number; radius: number }[] = [];

  for (const candidate of candidates) {
    if (deserts.length >= DESERT_MAX_COUNT) break;

    // Skip if already covered by a previously-selected desert
    const overlapsExisting = claimedRegions.some(region =>
      Math.hypot(candidate.x - region.x, candidate.y - region.y) < region.radius * 0.85,
    );
    if (overlapsExisting) continue;

    // Radius scales with how empty this gap actually is, capped relative to span
    const radiusKm = Math.max(
      Math.min(candidate.nearestDistance * 0.7, span * 0.28),
      DESERT_MIN_RADIUS_KM,
    );

    claimedRegions.push({ x: candidate.x, y: candidate.y, radius: radiusKm });

    const angle = Math.atan2(candidate.y, candidate.x);
    const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
    const sectorIndex = Math.floor((normalizedAngle / (Math.PI * 2)) * 8) % 8;
    const center = fromLocalKm([candidate.x, candidate.y], centroid);

    deserts.push({
      center,
      radiusMeters: radiusKm * 1000,
      label: `Low-density area · ${DIRECTION_LABELS[sectorIndex]} (≈${radiusKm.toFixed(1)} km gap)`,
    });
  }

  return deserts;
};

export const ResultsMap: React.FC<ResultsMapProps> = ({
  activeResultId,
  onActiveChange,
  resultReviews,
  results,
  searchPromptDisplay,
  searchPromptSummary,
}) => {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const renderedResultsRef = useRef('');
  const [mapError, setMapError] = useState<string | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  useEffect(() => {
    if (!mapElementRef.current || mapInstanceRef.current) return;

    try {
      const map = L.map(mapElementRef.current, {
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        preferCanvas: true,
        zoomControl: false,
        zoomSnap: 0.5,
        wheelDebounceTime: 40,
        wheelPxPerZoomLevel: 90,
        fadeAnimation: true,
        markerZoomAnimation: true,
        zoomAnimation: true,
        inertia: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        detectRetina: false,
        keepBuffer: 2,
        updateWhenIdle: false,
        updateWhenZooming: false,
      }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      requestAnimationFrame(() => map.invalidateSize(false));
      mapInstanceRef.current = map;

      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => map.invalidateSize(false));
      });
      resizeObserver.observe(mapElementRef.current);
      (map as L.Map & { _resizeObserver?: ResizeObserver })._resizeObserver = resizeObserver;
    } catch (error) {
      console.error(error);
      setMapError('The map could not be loaded.');
    }

    return () => {
      const map = mapInstanceRef.current as (L.Map & { _resizeObserver?: ResizeObserver }) | null;
      map?._resizeObserver?.disconnect();
      map?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!map) return;

    const pointsWithIds = results
      .filter(result => typeof result.latitude === 'number' && typeof result.longitude === 'number')
      .map(result => ({
        id: result.id,
        rank: result.rank,
        name: result.name,
        review: resultReviews[result.id],
        point: [result.latitude as number, result.longitude as number] as [number, number],
      }));

    const densityDeserts = buildDensityDeserts(pointsWithIds.map(result => result.point));

    map.eachLayer(layer => {
      const maybeTileLayer = layer as L.TileLayer & { _url?: string };
      if (!maybeTileLayer._url) {
        map.removeLayer(layer);
      }
    });

    pointsWithIds.forEach(result => {
      const marker = L.marker(result.point, {
        icon: L.divIcon({
          className: '',
          html: createMarkerMarkup(result.rank, result.id === activeResultId, result.review),
          iconSize: [38, 38],
          iconAnchor: [19, 38],
        }),
      });

      marker.on('click', () => onActiveChange(result.id));
      marker.bindTooltip(result.name, { direction: 'top' });
      map.addLayer(marker);
    });

    densityDeserts.forEach(desert => {
      const desertCircle = L.circle(desert.center, {
        color: '#dc2626',
        dashArray: '6 5',
        fillColor: '#ef4444',
        fillOpacity: 0.12,
        radius: desert.radiusMeters,
        weight: 1.5,
      });
      desertCircle.bindTooltip(desert.label, { sticky: true });
      map.addLayer(desertCircle);
    });

    const currentSignature = `${results.map(result => result.id).join('|')}::${activeResultId || ''}`;
    const activeResult = pointsWithIds.find(result => result.id === activeResultId) || pointsWithIds[0];

    if (!pointsWithIds.length) {
      map.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, { animate: false });
      renderedResultsRef.current = currentSignature;
      return;
    }

    if (renderedResultsRef.current.split('::')[0] !== currentSignature.split('::')[0]) {
      map.fitBounds(L.latLngBounds(pointsWithIds.map(result => result.point)), {
        padding: [50, 50],
        maxZoom: 13,
      });
    } else if (activeResult) {
      const currentZoom = map.getZoom() > 0 ? map.getZoom() : DEFAULT_MAP_ZOOM;
      map.flyTo(activeResult.point, Math.max(currentZoom, 13), { duration: 0.55 });
    }

    renderedResultsRef.current = currentSignature;
  }, [activeResultId, onActiveChange, resultReviews, results]);

  const hasMappableResults = results.some(result => typeof result.latitude === 'number' && typeof result.longitude === 'number');

  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500]">
        <div className="pointer-events-auto rounded-lg border border-slate-200/70 bg-white/95 p-2.5 shadow-md backdrop-blur">
          <div className="flex items-start gap-2.5">
            <div className="rounded-md bg-primary/10 p-1.5 text-primary">
              <Search size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Search Prompt</p>
                <button
                  type="button"
                  onClick={() => setIsPromptExpanded(current => !current)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 transition hover:bg-slate-200"
                >
                  {isPromptExpanded ? 'Hide' : 'Show'}
                  <ChevronDown size={12} className={`transition-transform ${isPromptExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>

              <div className="mt-1.5 space-y-1.5 text-xs text-slate-700">
                <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
                  <p className="text-xs font-medium leading-5 text-slate-700">{searchPromptSummary}</p>
                </div>

                {isPromptExpanded && (
                  <div className="space-y-1.5">
                    <div className="rounded-md bg-white px-2.5 py-1.5 ring-1 ring-slate-200">
                      {searchPromptDisplay.summary.map((item, index) => (
                        <div key={item.label} className={`flex gap-2 leading-5 ${index > 0 ? 'mt-1' : ''}`}>
                          <span className="min-w-20 font-semibold text-slate-500">{item.label}:</span>
                          <span className="flex-1">{item.value}</span>
                        </div>
                      ))}
                    </div>

                    {searchPromptDisplay.qa.length > 0 && (
                      <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
                        {searchPromptDisplay.qa.map((item, index) => (
                          <div key={`${item.question}-${index}`} className={index === 0 ? 'space-y-1' : 'mt-2 space-y-1 border-t border-slate-200 pt-2'}>
                            <p className="leading-5"><span className="font-semibold text-slate-500">Q:</span> {item.question}</p>
                            <p className="leading-5"><span className="font-semibold text-slate-500">A:</span> {item.answer}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {searchPromptDisplay.qa.length > 0 && !isPromptExpanded && (
                  <p className="text-xs font-medium text-slate-500">
                    {searchPromptDisplay.qa.length} follow-up question{searchPromptDisplay.qa.length === 1 ? '' : 's'} hidden
                  </p>
                )}

                {searchPromptDisplay.qa.length === 0 && !isPromptExpanded && (
                  <p className="text-xs font-medium text-slate-500">Tap show for full search context</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div ref={mapElementRef} className="search-results-map h-[460px] w-full bg-slate-200 xl:h-full" />

      {!hasMappableResults && (
        <div className="absolute inset-x-6 bottom-6 z-[500] rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-lg">
          <div className="flex items-start gap-3 text-amber-700">
            <MapPinned size={18} className="mt-0.5" />
            <p className="text-sm leading-6">
              The API returned results, but some or all of them do not include coordinates, so only the right-side list is available for those entries.
            </p>
          </div>
        </div>
      )}

      {mapError && (
        <div className="absolute inset-0 z-[600] flex items-center justify-center bg-slate-950/50 p-6">
          <div className="rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3 text-slate-700">
              <AlertCircle size={18} className="mt-0.5 text-red-500" />
              <p className="text-sm leading-6">{mapError}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
