// Leaflet map of the community camera layer. Canvas renderer, no clustering:
// ~1k circle markers plus optional field-of-view wedges. Tiles are the one
// external request the site makes, and only on this route.

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { bearings, dirLabel, isFlock } from '../lib/cameras';
import type { Camera, LatLonBox } from '../types';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR =
  '(c) <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

const EARTH_M = 6371000;
/** Nominal wedge reach, grown at low zoom so orientation stays readable. */
const WEDGE_M = 60;
const WEDGE_SPREAD = 40;
const WEDGE_STEPS = 8;
/** Floor on the drawn wedge length in pixels, whatever the zoom. */
const WEDGE_MIN_PX = 18;

interface Props {
  cameras: Camera[];
  cityBbox: LatLonBox;
  center: { lat: number; lon: number };
  showWedges: boolean;
}

export function CameraMap({ cameras, cityBbox, center, showWedges }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const rectRef = useRef<L.Rectangle | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // One renderer for the life of the map: a new L.canvas() per redraw would
  // leave its <canvas> behind in the overlay pane.
  const rendererRef = useRef<L.Canvas | null>(null);
  const [radius, setRadius] = useState(WEDGE_M);
  const theme = useThemeKey();

  const { min_lat, max_lat, min_lon, max_lon } = cityBbox;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    const map = L.map(el, {
      center: [center.lat, center.lon],
      zoom: 13,
      minZoom: 8,
      maxZoom: 19,
      preferCanvas: true,
      // Scroll only takes over the page after the map is focused or clicked.
      scrollWheelZoom: false,
    });
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR }).addTo(map);

    rendererRef.current = L.canvas({ padding: 0.3 });

    rectRef.current = L.rectangle(
      [
        [min_lat, min_lon],
        [max_lat, max_lon],
      ],
      {
        color: '#7a817b',
        weight: 1.5,
        dashArray: '5 5',
        fill: false,
        interactive: false,
      },
    ).addTo(map);

    // Anchored on the west edge at the center latitude, so the label rides the
    // dashed line and stays on screen in the default view.
    L.tooltip({
      permanent: true,
      direction: 'right',
      className: 'map__bbox-label',
      interactive: false,
      offset: [3, 0],
    })
      .setLatLng([center.lat, min_lon])
      .setContent('approximate City of Santa Clara bounds')
      .addTo(map);

    const enable = () => map.scrollWheelZoom.enable();
    const disable = () => map.scrollWheelZoom.disable();
    map.on('focus', enable);
    map.on('blur', disable);

    const onZoom = () => setRadius(wedgeRadius(map));
    map.on('zoomend', onZoom);
    onZoom();

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      rectRef.current = null;
      layerRef.current = null;
      rendererRef.current = null;
    };
  }, [center.lat, center.lon, min_lat, max_lat, min_lon, max_lon]);

  useEffect(() => {
    const map = mapRef.current;
    const renderer = rendererRef.current;
    if (!map || !renderer) return;

    const cs = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) =>
      cs.getPropertyValue(name).trim() || fallback;
    const flockHue = read('--series-1', '#2a78d6');
    const otherHue = read('--series-2', '#eb6834');
    const ring = read('--surface', '#fafbfa');
    rectRef.current?.setStyle({ color: read('--ink-3', '#7a817b') });

    const layers: L.Layer[] = [];

    if (showWedges) {
      for (const c of cameras) {
        const hue = isFlock(c) ? flockHue : otherHue;
        for (const b of bearings(c)) {
          layers.push(
            L.polygon(wedge(c.lat, c.lon, b, radius), {
              renderer,
              color: hue,
              weight: 1,
              opacity: 0.7,
              fillColor: hue,
              fillOpacity: 0.38,
              interactive: false,
            }),
          );
        }
      }
    }

    // Markers last so they sit above every wedge.
    for (const c of cameras) {
      const marker = L.circleMarker([c.lat, c.lon], {
        renderer,
        radius: 4,
        color: ring,
        weight: 1,
        fillColor: isFlock(c) ? flockHue : otherHue,
        fillOpacity: 0.92,
      });
      marker.bindPopup(() => popupHtml(c), {
        maxWidth: 280,
        autoPanPadding: [24, 24],
      });
      layers.push(marker);
    }

    const group = L.layerGroup(layers).addTo(map);
    layerRef.current = group;
    return () => {
      group.remove();
      layerRef.current = null;
    };
  }, [cameras, showWedges, radius, theme]);

  return (
    <div
      className="map"
      ref={boxRef}
      role="application"
      aria-label="Map of community-mapped license plate reader cameras around Santa Clara"
    />
  );
}

/** Metres per pixel at the current center, used to keep wedges visible. */
function wedgeRadius(map: L.Map): number {
  const lat = (map.getCenter().lat * Math.PI) / 180;
  const mpp = (40075016.686 * Math.cos(lat)) / (256 * 2 ** map.getZoom());
  const want = Math.min(600, Math.max(WEDGE_M, mpp * WEDGE_MIN_PX));
  return Math.round(want / 20) * 20;
}

function dest(lat: number, lon: number, bearing: number, dist: number): [number, number] {
  const br = (bearing * Math.PI) / 180;
  const deg = 180 / Math.PI;
  const dLat = ((dist * Math.cos(br)) / EARTH_M) * deg;
  const dLon =
    ((dist * Math.sin(br)) / (EARTH_M * Math.cos((lat * Math.PI) / 180))) * deg;
  return [lat + dLat, lon + dLon];
}

function wedge(lat: number, lon: number, bearing: number, r: number): [number, number][] {
  const pts: [number, number][] = [[lat, lon]];
  const half = WEDGE_SPREAD / 2;
  for (let i = 0; i <= WEDGE_STEPS; i++) {
    pts.push(dest(lat, lon, bearing - half + (WEDGE_SPREAD * i) / WEDGE_STEPS, r));
  }
  return pts;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(k: string, v: string | null | undefined): string {
  return v ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : '';
}

function popupHtml(c: Camera): string {
  const url = `https://www.openstreetmap.org/${c.osm_type}/${c.osm_id}`;
  const body = [
    `<dt>Operator</dt><dd>${c.operator ? esc(c.operator) : 'operator not tagged'}</dd>`,
    row('Brand', c.brand ?? 'brand not tagged'),
    row('Model', c.model),
    row('Mount', c.mount),
    row('Zone', c.zone),
    row('Direction', dirLabel(c) || null),
    row('Start date', c.start_date),
    row('Last edited', c.osm_timestamp ? c.osm_timestamp.slice(0, 10) : null),
    row('From city center', `${c.km_from_city_center.toFixed(2)} km`),
  ].join('');
  return (
    `<div class="cam-pop"><dl class="cam-pop__dl">${body}</dl>` +
    `<a class="cam-pop__link" href="${url}" target="_blank" rel="noreferrer">` +
    `Open ${esc(c.osm_type)}/${c.osm_id} on OpenStreetMap</a>` +
    `<p class="cam-pop__note">Any field not listed is untagged in OpenStreetMap.</p></div>`
  );
}

/** Changes whenever the resolved theme changes, so map colors re-read tokens. */
function useThemeKey(): string {
  const [key, setKey] = useState(themeKey);

  useEffect(() => {
    const update = () => setKey(themeKey());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => {
      observer.disconnect();
      mq.removeEventListener('change', update);
    };
  }, []);

  return key;
}

function themeKey(): string {
  const set = document.documentElement.getAttribute('data-theme') ?? 'system';
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'd' : 'l';
  return `${set}-${dark}`;
}
