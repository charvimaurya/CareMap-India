import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationPickerMapProps {
  selectedLat: number | null;
  selectedLon: number | null;
  onPick: (latitude: number, longitude: number) => void;
}

const INDIA_CENTER: [number, number] = [22.9734, 78.6569];
const INDIA_BOUNDS = L.latLngBounds(
  L.latLng(6.0, 67.0),
  L.latLng(37.5, 97.5),
);

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({
  selectedLat,
  selectedLon,
  onPick,
}) => {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapInstanceRef.current) return;

    const map = L.map(mapElementRef.current, {
      center: INDIA_CENTER,
      zoom: 5,
      zoomControl: false,
      maxBounds: INDIA_BOUNDS,
      maxBoundsViscosity: 1,
      preferCanvas: true,
      zoomSnap: 0.5,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 90,
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
    map.on('click', event => {
      onPick(event.latlng.lat, event.latlng.lng);
    });
    requestAnimationFrame(() => map.invalidateSize(false));
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, [onPick]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (selectedLat == null || selectedLon == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const nextLatLng = L.latLng(selectedLat, selectedLon);

    if (!markerRef.current) {
      markerRef.current = L.marker(nextLatLng).addTo(map);
    } else {
      markerRef.current.setLatLng(nextLatLng);
    }

    map.flyTo(nextLatLng, Math.max(map.getZoom(), 8), { duration: 0.45 });
  }, [selectedLat, selectedLon]);

  return <div ref={mapElementRef} className="h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" />;
};
