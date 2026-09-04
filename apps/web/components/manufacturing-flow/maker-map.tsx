'use client';

import { MapPinIcon } from '@phosphor-icons/react';
import mapboxgl from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';

import { SHOPIFY_FALLBACK_ICON_URL } from '../../lib/shopify/store-branding';
import type { MarketplaceProvider } from './types';

function markerElement(maker: MarketplaceProvider, selected: boolean): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'maker-map-pin';
  element.dataset.providerId = maker.id;
  element.dataset.selected = selected ? 'true' : 'false';
  element.setAttribute('aria-label', `${selected ? 'Selected' : 'Select'} ${maker.name}`);
  const fallback = document.createElement('span');
  fallback.textContent = maker.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  element.append(fallback);
  if (maker.logoUrl) {
    const inner = document.createElement('img');
    inner.setAttribute('src', maker.logoUrl);
    inner.setAttribute('alt', '');
    inner.addEventListener('error', () => {
      if (inner.src !== SHOPIFY_FALLBACK_ICON_URL) {
        inner.src = SHOPIFY_FALLBACK_ICON_URL;
      }
    });
    element.append(inner);
  }
  return element;
}

export function MakerMap({
  providers,
  selectedId,
  onSelect,
  buyerLocation,
}: {
  readonly providers: readonly MarketplaceProvider[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly buyerLocation?: {
    readonly latitude: number;
    readonly longitude: number;
    readonly address: string;
  } | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const buyerMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const providersRef = useRef(providers);
  const onSelectRef = useRef(onSelect);
  const [mapFailed, setMapFailed] = useState(false);
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const selected = providers.find(({ id }) => id === selectedId);

  providersRef.current = providers;
  onSelectRef.current = onSelect;

  const syncMarkersRef = useRef<() => void>(() => undefined);
  syncMarkersRef.current = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = new Map<string, mapboxgl.Marker>();
    providersRef.current.forEach((maker) => {
      if (typeof maker.longitude !== 'number' || typeof maker.latitude !== 'number') return;
      let marker = markersRef.current.get(maker.id);
      if (!marker) {
        const element = markerElement(maker, maker.id === selectedId);
        element.addEventListener('click', () => onSelectRef.current(maker.id));
        marker = new mapboxgl.Marker({ element, anchor: 'bottom' })
          .setLngLat([maker.longitude, maker.latitude])
          .addTo(map);
      } else {
        marker.getElement().dataset.selected =
          marker.getElement().dataset.providerId === selectedId ? 'true' : 'false';
      }
      next.set(maker.id, marker);
    });
    markersRef.current.forEach((marker, id) => {
      if (!next.has(id)) marker.remove();
    });
    markersRef.current = next;
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
        window.setTimeout(() => map.resize(), 0);
        syncMarkersRef.current();
      });
      mapRef.current = map;
      syncMarkersRef.current();
    } catch {
      setMapFailed(true);
    }
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = new Map();
      buyerMarkerRef.current?.remove();
      buyerMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      mapRef.current?.resize();
      syncMarkersRef.current();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [providers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (
      buyerLocation &&
      typeof buyerLocation.longitude === 'number' &&
      typeof buyerLocation.latitude === 'number'
    ) {
      if (!buyerMarkerRef.current) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'maker-map-pin maker-map-buyer';
        element.dataset.providerId = '__buyer__';
        element.setAttribute('aria-label', 'Your buyer location');
        const inner = document.createElement('span');
        inner.textContent = 'You';
        element.append(inner);
        buyerMarkerRef.current = new mapboxgl.Marker({ element, anchor: 'bottom' })
          .setLngLat([buyerLocation.longitude, buyerLocation.latitude])
          .addTo(map);
      } else {
        buyerMarkerRef.current.setLngLat([buyerLocation.longitude, buyerLocation.latitude]);
      }
    } else if (buyerMarkerRef.current) {
      buyerMarkerRef.current.remove();
      buyerMarkerRef.current = null;
    }
  }, [buyerLocation]);

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
