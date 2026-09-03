'use client';

import { MapPinIcon } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';

import type { MarketplaceProvider } from './types';

interface MapboxMapInstance {
  flyTo(options: { center: [number, number]; zoom: number; essential: boolean }): void;
  remove(): void;
}

interface MapboxMarkerInstance {
  setLngLat(coordinates: [number, number]): MapboxMarkerInstance;
  addTo(map: MapboxMapInstance): MapboxMarkerInstance;
  getElement(): HTMLElement;
  remove(): void;
}

interface MapboxRuntime {
  accessToken: string;
  Map: new (options: {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
    attributionControl: boolean;
  }) => MapboxMapInstance;
  Marker: new (options: { element: HTMLElement; anchor: string }) => MapboxMarkerInstance;
}

declare global {
  interface Window {
    mapboxgl?: MapboxRuntime;
  }
}

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
  const mapRef = useRef<MapboxMapInstance | null>(null);
  const markersRef = useRef<MapboxMarkerInstance[]>([]);
  const onSelectRef = useRef(onSelect);
  const syncMarkersRef = useRef<() => void>(() => undefined);
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const selected = providers.find(({ id }) => id === selectedId);

  onSelectRef.current = onSelect;
  syncMarkersRef.current = () => {
    if (!mapRef.current || !window.mapboxgl) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = providers.flatMap((maker) => {
      if (typeof maker.longitude !== 'number' || typeof maker.latitude !== 'number') return [];
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'maker-map-pin';
      element.dataset.providerId = maker.id;
      element.dataset.selected = maker.id === selectedId ? 'true' : 'false';
      element.setAttribute('aria-label', `Select ${maker.name}`);
      element.addEventListener('click', () => onSelectRef.current(maker.id));
      return [
        new window.mapboxgl!.Marker({ element, anchor: 'bottom' })
          .setLngLat([maker.longitude, maker.latitude])
          .addTo(mapRef.current!),
      ];
    });
  };

  useEffect(() => {
    if (!token || !rootRef.current) return undefined;
    let cancelled = false;
    let script = document.querySelector<HTMLScriptElement>('script[data-attune-mapbox]');
    let stylesheet = document.querySelector<HTMLLinkElement>('link[data-attune-mapbox]');
    if (!stylesheet) {
      stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.css';
      stylesheet.dataset.attuneMapbox = '';
      document.head.append(stylesheet);
    }
    const initialize = () => {
      if (cancelled || !rootRef.current || !window.mapboxgl || mapRef.current) return;
      window.mapboxgl.accessToken = token;
      const first = providers.find(
        (maker) => typeof maker.longitude === 'number' && typeof maker.latitude === 'number',
      );
      const map = new window.mapboxgl.Map({
        container: rootRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [first?.longitude ?? 78.9629, first?.latitude ?? 20.5937],
        zoom: first ? 8 : 4,
        attributionControl: false,
      });
      mapRef.current = map;
      syncMarkersRef.current();
    };
    if (window.mapboxgl) initialize();
    else {
      script = document.createElement('script');
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.js';
      script.async = true;
      script.dataset.attuneMapbox = '';
      script.addEventListener('load', initialize, { once: true });
      document.head.append(script);
    }
    return () => {
      cancelled = true;
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
      ) : null}
      <div className="maker-map-caption">
        <MapPinIcon size={16} />
        <span>{selected?.address || selected?.locationName || 'Select a maker'}</span>
      </div>
    </div>
  );
}
