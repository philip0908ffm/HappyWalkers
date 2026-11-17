import '../styles/pages-e.css';
import 'leaflet/dist/leaflet.css';
import type { LatLngBoundsExpression, LatLngTuple, Map as LeafletMap } from 'leaflet';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { RoutePoint } from '../api/types-e';
import { useConfig } from '../hooks/useMe';
import { formatKm } from '../lib/format';
import { Icon } from './Icon';

/** Länge einer Route ([lon, lat]) in km (Großkreis-Entfernung). */
export function routeLengthKm(route: RoutePoint[]): number {
  let km = 0;
  for (let i = 1; i < route.length; i++) km += haversine(route[i - 1], route[i]);
  return km;
}

function haversine([lon1, lat1]: RoutePoint, [lon2, lat2]: RoutePoint) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const toLatLng = (p: RoutePoint): LatLngTuple => [p[1], p[0]];

function ClickToAdd({ onAdd }: { onAdd: (p: RoutePoint) => void }) {
  useMapEvents({ click: (e) => onAdd([round(e.latlng.lng), round(e.latlng.lat)]) });
  return null;
}
const round = (n: number) => Math.round(n * 1e6) / 1e6;

function FitRoute({ route }: { route: RoutePoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (route.length >= 2) map.fitBounds(route.map(toLatLng) as LatLngBoundsExpression, { padding: [24, 24] });
    else if (route.length === 1) map.setView(toLatLng(route[0]), 15);
    // nur beim ersten Anzeigen ausrichten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function MapRef({ onMap }: { onMap: (m: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => onMap(map), [map, onMap]);
  return null;
}

/**
 * Karte zum Einzeichnen einer Route (Klicks setzen Punkte) oder zum Anzeigen (readOnly).
 * Ohne Maus bedienbar: Karte mit Pfeiltasten verschieben, dann „Punkt in der Kartenmitte setzen“.
 * Das Einzeichnen ist immer freiwillig – Formulare funktionieren auch ohne Karte.
 */
export function RouteDrawMap({
  route,
  onChange,
  readOnly,
  center,
  label,
}: {
  route: RoutePoint[];
  onChange?: (route: RoutePoint[]) => void;
  readOnly?: boolean;
  /** [lat, lon] Startansicht, z. B. Wohnort-PLZ */
  center?: LatLngTuple | null;
  /** zugänglicher Name der Karte */
  label: string;
}) {
  const { t } = useTranslation('activities');
  const { data: config } = useConfig();
  const [map, setMap] = useState<LeafletMap | null>(null);
  const km = routeLengthKm(route);
  const start: LatLngTuple = route.length ? toLatLng(route[0]) : (center ?? [51.16, 10.45]);
  const zoom = route.length || center ? 14 : 6;
  const add = (p: RoutePoint) => onChange?.([...route, p]);

  return (
    <div className="route-map">
      <div className="route-map__frame" role="region" aria-label={label}>
        <MapContainer center={start} zoom={zoom} className="map" scrollWheelZoom={false} keyboard>
          <TileLayer
            url={config?.mapTileUrl ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
            attribution={config?.mapAttribution ?? '&copy; OpenStreetMap'}
          />
          <MapRef onMap={setMap} />
          {readOnly ? <FitRoute route={route} /> : <ClickToAdd onAdd={add} />}
          {route.length >= 2 ? <Polyline positions={route.map(toLatLng)} pathOptions={{ color: '#0e5149', weight: 5 }} /> : null}
          {route.length >= 1 ? (
            <CircleMarker center={toLatLng(route[0])} radius={8} pathOptions={{ color: '#093b35', fillColor: '#ffffff', fillOpacity: 1, weight: 3 }} />
          ) : null}
          {route.length >= 2 ? (
            <CircleMarker
              center={toLatLng(route[route.length - 1])}
              radius={8}
              pathOptions={{ color: '#093b35', fillColor: '#0e5149', fillOpacity: 1, weight: 3 }}
            />
          ) : null}
          {!readOnly
            ? route.slice(1, -1).map((p, i) => (
                <CircleMarker key={i} center={toLatLng(p)} radius={4} pathOptions={{ color: '#093b35', fillOpacity: 1, weight: 2 }} />
              ))
            : null}
        </MapContainer>
        {!readOnly ? <span className="route-map__crosshair" aria-hidden="true" /> : null}
      </div>
      <p className="route-map__legend">{readOnly ? t('map.legendReadOnly') : t('map.legend')}</p>
      <p role="status" className="route-map__length">
        <Icon name="route" className="inline-icon" />{' '}
        {route.length < 2 ? t('map.noRoute') : t('map.length', { km: formatKm(km, 2), count: route.length })}
      </p>
      {!readOnly ? (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              if (!map) return;
              const c = map.getCenter();
              add([round(c.lng), round(c.lat)]);
            }}
          >
            <Icon name="plus" /> {t('map.addCenter')}
          </button>
          <button type="button" className="btn btn--secondary" disabled={route.length === 0} onClick={() => onChange?.(route.slice(0, -1))}>
            <Icon name="arrowLeft" /> {t('map.undo')}
          </button>
          <button type="button" className="btn btn--ghost" disabled={route.length === 0} onClick={() => onChange?.([])}>
            <Icon name="trash" /> {t('map.clear')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
