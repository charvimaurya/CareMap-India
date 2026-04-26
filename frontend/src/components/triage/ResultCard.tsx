import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  Loader2,
  LocateFixed,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { ClinicResultReview, ClinicSearchResult } from '../../types';
import { ClinicSearchPromptDisplay } from '../../lib/clinicSearch';
import { ResultsMap } from './ResultsMap';

interface ResultCardProps {
  results: ClinicSearchResult[];
  resultReviews: Record<string, ClinicResultReview>;
  reviewedResultCount: number;
  searchPromptDisplay: ClinicSearchPromptDisplay;
  searchPromptSummary: string;
  searchError: string | null;
  onReset: () => void;
}

const formatDistance = (distanceKm: number | null) => {
  if (typeof distanceKm !== 'number') return 'Distance unavailable';
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`;
  return `${distanceKm.toFixed(1)} km away`;
};

const formatLocation = (result: ClinicSearchResult) => {
  return [result.city, result.state, result.country].filter(Boolean).join(', ') || 'Location unavailable';
};

const formatScore = (value: number) => value.toFixed(2);
const formatSpecialtyLabel = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/And/g, ' & ')
    .replace(/\s+/g, ' ')
    .trim();

const getReviewTone = (review?: ClinicResultReview) => {
  if (!review) {
    return {
      badge: 'border-slate-200 bg-slate-100 text-slate-500',
      card: 'border-slate-100 bg-slate-50',
      text: 'text-slate-600',
    };
  }

  if (review.verdict === 'positive') {
    return {
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      card: 'border-emerald-100 bg-emerald-50/70',
      text: 'text-emerald-800',
    };
  }

  if (review.verdict === 'negative') {
    return {
      badge: 'border-red-200 bg-red-50 text-red-700',
      card: 'border-red-100 bg-red-50/70',
      text: 'text-red-800',
    };
  }

  return {
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    card: 'border-amber-100 bg-amber-50/70',
    text: 'text-amber-800',
  };
};

export const ResultCard: React.FC<ResultCardProps> = ({
  results,
  resultReviews,
  reviewedResultCount,
  searchPromptDisplay,
  searchPromptSummary,
  searchError,
  onReset,
}) => {
  const [activeResultId, setActiveResultId] = useState<string | null>(results[0]?.id || null);
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Record<string, boolean>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    setActiveResultId(currentActiveId => {
      if (currentActiveId && results.some(result => result.id === currentActiveId)) return currentActiveId;
      return results[0]?.id || null;
    });
  }, [results]);

  useEffect(() => {
    if (!activeResultId) return;

    const node = cardRefs.current[activeResultId];
    if (!node) return;

    node.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [activeResultId]);

  useEffect(() => {
    setExpandedReasoningIds(current => Object.fromEntries(
      Object.entries(current).filter(([resultId]) => results.some(result => result.id === resultId)),
    ));
  }, [results]);

  return (
    <div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:h-[calc(100vh-7rem)]">
        <div className="xl:h-full">
          <ResultsMap
            activeResultId={activeResultId}
            onActiveChange={setActiveResultId}
            resultReviews={resultReviews}
            results={results}
            searchPromptDisplay={searchPromptDisplay}
            searchPromptSummary={searchPromptSummary}
          />
        </div>

        <div className="thin-scroll space-y-3 xl:h-full xl:overflow-y-auto xl:pr-2">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
            <div>
              <h4 className="text-xl font-semibold text-slate-800">Matching Facilities</h4>
              <p className="mt-0.5 text-xs text-slate-500">
                {results.length} result{results.length === 1 ? '' : 's'}
                {!!results.length && ` · review ${Math.min(reviewedResultCount, results.length)}/${results.length}`}
              </p>
            </div>
            <button onClick={onReset} className="btn-outline inline-flex items-center gap-2 text-xs py-2">
              <RotateCcw size={14} />
              New Search
            </button>
          </div>

          {searchError && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 text-red-600" />
                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-red-700">Search Backend Error</p>
                  <p className="text-sm leading-7 text-red-800">{searchError}</p>
                  <p className="text-sm leading-7 text-red-700">
                    The UI request reached the API, but the search service failed upstream. This is consistent with the Chroma permission error you saw in the shell output.
                  </p>
                </div>
              </div>
            </div>
          )}

          {results.map(result => {
            const isActive = result.id === activeResultId;
            const review = resultReviews[result.id];
            const reviewTone = getReviewTone(review);
            const isReasoningExpanded = Boolean(expandedReasoningIds[result.id]);

            return (
              <div
                key={result.id}
                ref={node => {
                  cardRefs.current[result.id] = node;
                }}
                onClick={() => setActiveResultId(result.id)}
                className={`cursor-pointer rounded-xl bg-white p-4 transition-all duration-150 ${
                  isActive
                    ? 'ring-1 ring-primary/30 shadow-[0_8px_24px_-12px_rgba(12,59,110,0.35)]'
                    : 'hover:shadow-[0_4px_14px_-8px_rgba(15,23,42,0.18)]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                        #{result.rank}
                      </span>
                      <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                        {result.facilityType}
                      </span>
                    </div>
                    <h5 className="text-base font-semibold text-slate-900 leading-tight">{result.name}</h5>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <LocateFixed size={12} />
                        {formatDistance(result.distanceKm)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} />
                        {formatLocation(result)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Score</p>
                    <p className="text-lg font-semibold text-primary leading-tight">{formatScore(result.totalScore)}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">S {formatScore(result.semanticScore)} · F {formatScore(result.fieldScore)}</p>
                  </div>
                </div>

                <div className="mt-3 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                  <div className="space-y-2">
                    <div className="rounded-lg bg-primary/[0.04] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/70">Specialties</p>
                      {result.specialties.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {result.specialties.slice(0, 6).map(specialty => (
                            <span
                              key={specialty}
                              className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-primary"
                            >
                              {formatSpecialtyLabel(specialty)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-slate-700">No specialty metadata provided</p>
                      )}
                    </div>

                    {result.phone && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/[0.06] px-2.5 py-1.5 font-medium text-primary">
                          <Phone size={13} />
                          {result.phone}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className={`rounded-lg p-3 ${reviewTone.card}`}>
                    <div className="mb-1.5 flex items-center gap-2 text-slate-800">
                      <ShieldCheck size={14} className="text-accent" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Reasoning</p>
                    </div>
                    {review ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${reviewTone.badge}`}>
                            {review.verdict}
                          </span>
                          <span className={`text-[11px] font-medium ${reviewTone.text}`}>
                            {review.score}/100 match
                          </span>
                        </div>
                        <p className={`mt-1.5 text-xs leading-5 ${reviewTone.text}`}>
                          {review.summary}
                        </p>
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            setExpandedReasoningIds(current => ({
                              ...current,
                              [result.id]: !current[result.id],
                            }));
                          }}
                          className={`mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${reviewTone.badge}`}
                        >
                          {isReasoningExpanded ? 'Hide' : 'Read more'}
                          <ChevronDown size={12} className={`transition-transform ${isReasoningExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isReasoningExpanded && (
                          <div className="mt-2 rounded-md bg-white/70 p-2.5">
                            <p className={`text-xs leading-5 ${reviewTone.text}`}>{review.reasoning}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="mt-1 rounded-md bg-white/70 p-2.5">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-white p-2 shadow-sm">
                            <Loader2 size={16} className="animate-spin text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-700">Reviewing this result</p>
                            <p className="text-xs text-slate-500">The AI is scoring its medical relevance now.</p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="h-2.5 w-3/4 animate-pulse rounded-full bg-slate-200" />
                          <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-slate-200" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={event => {
                      event.stopPropagation();
                      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(result.mapQuery)}`, '_blank');
                    }}
                    className="btn-primary inline-flex items-center gap-1.5 text-xs py-2"
                  >
                    <MapPin size={14} />
                    Open in Maps
                  </button>

                  {result.website && (
                    <button
                      onClick={event => {
                        event.stopPropagation();
                        window.open(result.website || '', '_blank', 'noopener,noreferrer');
                      }}
                      className="btn-outline inline-flex items-center gap-1.5 text-xs py-2"
                    >
                      <ArrowUpRight size={14} />
                      Website
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {!results.length && !searchError && (
            <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <p className="text-lg font-semibold text-slate-800">No facilities matched this search.</p>
              <p className="mt-2 text-sm text-slate-500">Try a broader complaint description or a larger city/area in the location step.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
