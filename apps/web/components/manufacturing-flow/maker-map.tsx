'use client';

import { MapPinIcon } from '@phosphor-icons/react';
import mapboxgl from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';

import type { MarketplaceProvider } from './types';

export function MakerMap({
  providers,
  selectedId,
  onSelect,
}: {
  readonly providers: readonly MarketplaceProvider[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const providersRef = useRef(providers);
  const onSelectRef = useRef(onSelect);
  const syncMarkersRef = useRef<() => void>(() => undefined);
  const [mapFailed, setMapFailed] = useState(false);
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const selected = providers.find(({ id }) => id === selectedId);

  providersRef.current = providers;
  onSelectRef.current = onSelect;
  syncMarkersRef.current = () => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = providersRef.current.flatMap((maker) => {
      if (typeof maker.longitude !== 'number' || typeof maker.latitude !== 'number') return [];
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'maker-map-pin';
      element.dataset.providerId = maker.id;
      element.dataset.selected = maker.id === selectedId ? 'true' : 'false';
      element.setAttribute('aria-label', `Select ${maker.name}`);
      const fallback = document.createElement('span');
      fallback.textContent = maker.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');
      element.append(fallback);
      if (maker.logoUrl) {
        const logo = document.createElement('img');
        logo.src = maker.logoUrl;
        logo.alt = '';
        logo.addEventListener('error', () => logo.remove(), { once: true });
        element.append(logo);
      }
      element.addEventListener('click', () => onSelectRef.current(maker.id));
      return [
        new mapboxgl.Marker({ element, anchor: 'bottom' })
          .setLngLat([maker.longitude, maker.latitude])
          .addTo(map),
      ];
    });
  };

  useEffect(() => {
    if (!token || !rootRef.current) return undefined;
    setMapFailed(false);
    try {
      mapboxgl.accessToken = token;
      const first = providersRef.current.find(
        (maker) => typeof maker.longitude === 'number' && typeof maker.latitude === 'number',
      );
      const map = new mapboxgl.Map({
        container: rootRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [first?.longitude ?? 78.9629, first?.latitude ?? 20.5937],
        zoom: first ? 8 : 4,
        attributionControl: false,
      });
      map.on('error', () => setMapFailed(true));
      map.on('load', () => {
        setMapFailed(false);
        syncMarkersRef.current();
      });
      mapRef.current = map;
      syncMarkersRef.current();
    } catch {
      setMapFailed(true);
    }
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => syncMarkersRef.current(), [providers]);

  useEffect(() => {
    markersRef.current.forEach((marker) => {
      marker.getElement().dataset.selected =
        marker.getElement().dataset.providerId === selectedId ? 'true' : 'false';
    });
    if (
      mapRef.current &&
      typeof selected?.longitude === 'number' &&
      typeof selected.latitude === 'number'
    ) {
      mapRef.current.flyTo({
        center: [selected.longitude, selected.latitude],
        zoom: 10,
        essential: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
    }
  }, [selected, selectedId]);

  return (
    <div className="maker-map" aria-label="Maker locations">
      <div ref={rootRef} className="maker-mapbox" />
      {!token ? (
        <div className="maker-map-fallback">
          <MapPinIcon size={24} />
          <strong>Map unavailable in this environment</strong>
          <span>Add the public Mapbox token to load geographic tiles and maker coordinates.</span>
        </div>
      ) : mapFailed ? (
        <div className="maker-map-fallback">
          <MapPinIcon size={24} />
          <strong>Map tiles could not load</strong>
          <span>The maker list remains available. Check the Mapbox token URL restrictions.</span>
        </div>
      ) : null}
      <div className="maker-map-caption">
        <MapPinIcon size={16} />
        <span>{selected?.address || selected?.locationName || 'Select a maker'}</span>
      </div>
    </div>
  );
}
