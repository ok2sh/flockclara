// Live refresh of the camera layer straight from OpenStreetMap, via Overpass.
// Only ever runs when the visitor clicks the refresh button. The result is
// held in memory: reloading the page returns to the baked snapshot.

import type { Camera, LatLonBox } from '../types';

/** Tried in order; the first one that answers wins. */
export const ENDPOINTS = [
  'https://overpass.deflock.org/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const TIMEOUT_MS = 35000;

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  timestamp?: string;
  tags?: Record<string, string>;
}

export interface LiveResult {
  cameras: Camera[];
  endpoint: string;
  fetchedAt: Date;
}

export function buildQuery(bbox: LatLonBox): string {
  const b = `${bbox.min_lat},${bbox.min_lon},${bbox.max_lat},${bbox.max_lon}`;
  const filter = '["man_made"="surveillance"]["surveillance:type"="ALPR"]';
  return (
    '[out:json][timeout:30];' +
    `(node${filter}(${b});way${filter}(${b}););` +
    'out meta center;'
  );
}

/**
 * POSTs the query as form-encoded data, which keeps it a CORS simple request.
 * Falls through the endpoint list on any network error, timeout or non-200.
 */
export async function fetchLive(
  bbox: LatLonBox,
  center: { lat: number; lon: number },
  cityBbox: LatLonBox,
): Promise<LiveResult> {
  const query = buildQuery(bbox);
  const failures: string[] = [];

  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { elements?: OverpassElement[] };
      const cameras = toCameras(json.elements ?? [], center, cityBbox);
      if (!cameras.length) throw new Error('no cameras returned');
      return { cameras, endpoint, fetchedAt: new Date() };
    } catch (err) {
      failures.push(`${host(endpoint)}: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(failures.join('; '));
}

export function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const CARDINALS: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

/** Accepts "180", "45;225", "NE" or a mix. Unparseable parts are dropped. */
export function parseDirections(raw: string | undefined): number[] {
  if (!raw) return [];
  const out: number[] = [];
  for (const part of raw.split(/[;,]/)) {
    const s = part.trim();
    if (!s) continue;
    const n = Number(s);
    if (s !== '' && Number.isFinite(n)) {
      out.push(((n % 360) + 360) % 360);
      continue;
    }
    const c = CARDINALS[s.toUpperCase()];
    if (c !== undefined) out.push(c);
  }
  return out;
}

export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toCameras(
  elements: OverpassElement[],
  center: { lat: number; lon: number },
  cityBbox: LatLonBox,
): Camera[] {
  const out: Camera[] = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;

    const tags = el.tags ?? {};
    const dirs = parseDirections(tags.direction ?? tags['camera:direction']);

    out.push({
      osm_id: el.id,
      osm_type: el.type,
      lat,
      lon,
      operator: tags.operator ?? null,
      brand: tags.brand ?? tags.manufacturer ?? null,
      model: tags.model ?? null,
      direction: dirs.length ? dirs[0] : null,
      directions: dirs.length > 1 ? dirs : null,
      zone: tags['surveillance:zone'] ?? null,
      mount: tags['camera:mount'] ?? null,
      ref: tags.ref ?? null,
      start_date: tags.start_date ?? null,
      osm_timestamp: el.timestamp ?? null,
      km_from_city_center:
        Math.round(haversineKm(center.lat, center.lon, lat, lon) * 100) / 100,
      in_city_bbox:
        lat >= cityBbox.min_lat &&
        lat <= cityBbox.max_lat &&
        lon >= cityBbox.min_lon &&
        lon <= cityBbox.max_lon,
    });
  }

  // Same ordering the published file uses: nearest to the city center first.
  out.sort((a, b) => a.km_from_city_center - b.km_from_city_center);
  return out;
}
