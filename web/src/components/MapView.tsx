import 'leaflet/dist/leaflet.css';
import type { Tempo } from '@gehmeinsam/shared';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { useConfig } from '../hooks/useMe';

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  title: string;
  /** Zusatzzeile im Hinweisfenster, z. B. Datum */
  subtitle?: string;
  href?: string;
  tempo?: Tempo;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function pinIcon(p: MapPoint, count: number) {
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<span class="map-pin ${p.tempo ? `map-pin--${p.tempo}` : ''}">${count > 1 ? `<span class="map-pin__count" aria-hidden="true">${count}</span>` : ''}<span class="visually-hidden">${esc(p.title)}</span></span>`,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    popupAnchor: [0, -38],
  });
}

function FitToPoints({ points, center }: { points: MapPoint[]; center?: { lat: number; lon: number } | null }) {
  const map = useMap();
  const key = points.map((p) => p.id).join(',') + (center ? `${center.lat},${center.lon}` : '');
  useEffect(() => {
    if (points.length > 0) {
      const b = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
      if (center) b.extend([center.lat, center.lon]);
      map.fitBounds(b, { padding: [40, 40], maxZoom: 13 });
    } else if (center) {
      map.setView([center.lat, center.lon], 11);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/**
 * Karte (Leaflet) – immer nur eine ERGÄNZUNG zur Liste: Alle Einträge sind auch als Liste da.
 * - Kacheln und Quellenangabe aus /config (MAP_TILE_URL), Quellenangabe bleibt sichtbar.
 * - Kein Zoomen mit dem Mausrad (verhindert „Festhängen“ beim Blättern der Seite).
 * - Markierungen sind per Tab-Taste erreichbar und mit Enter zu öffnen.
 * - Gezeigt wird nur der UNGEFÄHRE Ort (Gruppen-/PLZ-Mittelpunkt), nie ein Treffpunkt.
 */
export function MapView({
  points,
  center,
  label,
  className,
}: {
  points: MapPoint[];
  center?: { lat: number; lon: number } | null;
  label: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { data: cfg } = useConfig();

  // Termine am selben Ort zusammenfassen (sonst liegen Markierungen übereinander)
  const grouped = useMemo(() => {
    const m = new Map<string, MapPoint[]>();
    for (const p of points) {
      const k = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.values()];
  }, [points]);

  const start: [number, number] = center ? [center.lat, center.lon] : points[0] ? [points[0].lat, points[0].lon] : [51.16, 10.45];

  if (!cfg) return <div className={`map ${className ?? ''}`} aria-hidden="true" />;

  return (
    <div className="map-wrap" role="region" aria-label={label}>
      <MapContainer
        className={`map ${className ?? ''}`}
        center={start}
        zoom={center || points.length ? 11 : 6}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl
      >
        <TileLayer url={cfg.mapTileUrl} attribution={cfg.mapAttribution} />
        <ZoomControl position="topleft" zoomInTitle={t('map.zoomIn')} zoomOutTitle={t('map.zoomOut')} />
        <FitToPoints points={points} center={center} />
        {grouped.map((list) => {
          const first = list[0];
          return (
            <Marker
              key={first.id}
              position={[first.lat, first.lon]}
              icon={pinIcon(list.length > 1 ? { ...first, title: t('map.entries', { count: list.length }) } : first, list.length)}
              title={list.length > 1 ? t('map.entries', { count: list.length }) : first.title}
              keyboard
            >
              <Popup>
                <ul className="map-popup">
                  {list.map((p) => (
                    <li key={p.id}>
                      {p.href ? <Link to={p.href}>{p.title}</Link> : <strong>{p.title}</strong>}
                      {p.subtitle ? <span className="map-popup__sub">{p.subtitle}</span> : null}
                    </li>
                  ))}
                </ul>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      <p className="map-note">{t('map.approxNote')}</p>
    </div>
  );
}
