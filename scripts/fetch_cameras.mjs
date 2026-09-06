#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

// Fetch Santa Clara area ALPR cameras live from OpenStreetMap via Overpass API.
//
// Replaces the frozen extract_cameras.py snapshot with a live pull, on the
// same schema/bbox/haversine as extract_cameras.py so downstream code (the
// Cameras page) doesn't need to change.
//
// Direction-tag parsing (cardinals, NB/EB/SB/WB, spelled-out, numeric ranges,
// multi-direction lists) is ported from the DeFlock/FlockHopper deflock-data
// lib.mjs (MIT licensed).
//
// Usage: node fetch_cameras.mjs [output-path]   (default: website/public/data/cameras.json)
// Exit nonzero on total fetch failure or fewer than MIN_CAMERAS results, so a
// broken run never clobbers a good cameras.json.

// Greater Santa Clara area (Santa Clara County plus fringe) - matches extract_cameras.py
const BBOX = { min_lat: 36.89, max_lat: 37.49, min_lon: -122.21, max_lon: -121.2 };
// Approximate City of Santa Clara bounding box
const CITY_BBOX = { min_lat: 37.32, max_lat: 37.42, min_lon: -122.005, max_lon: -121.925 };
const CITY_CENTER = { lat: 37.3541, lon: -121.9552 };

const MIN_CAMERAS = 100;

const OVERPASS_ENDPOINTS = [
  'https://overpass.deflock.org/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const USER_AGENT = 'santa-clara-alpr-transparency/1.0 (github actions; contact via repo issues)';

// Client-side safety net so a hung connection doesn't stall CI forever; the
// query itself asks the server for [timeout:60].
const REQUEST_TIMEOUT_MS = 90_000;
const RETRY_SLEEP_MS = 10_000;
const RETRY_STATUSES = new Set([429, 504]);

function bboxClause() {
  return `${BBOX.min_lat},${BBOX.min_lon},${BBOX.max_lat},${BBOX.max_lon}`;
}

function buildQuery() {
  const b = bboxClause();
  return (
    '[out:json][timeout:60]; ' +
    `(node["man_made"="surveillance"]["surveillance:type"="ALPR"](${b}); ` +
    `way["man_made"="surveillance"]["surveillance:type"="ALPR"](${b});); ` +
    'out meta center;'
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Overpass reports a server-side failure (query timeout, out of memory, rate
// limit) as HTTP 200 with a top-level `remark` and absent/partial elements.
const OVERPASS_ERROR_REMARK = /timed out|runtime error|out of memory|too many requests/i;

/** POST the query to one endpoint, with one retry on 429/504 after a 10s sleep. */
async function fetchOnce(endpoint, query) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (RETRY_STATUSES.has(res.status) && attempt === 1) {
          console.error(`${endpoint}: HTTP ${res.status}, retrying in 10s`);
          await sleep(RETRY_SLEEP_MS);
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`non-JSON response: ${text.slice(0, 300).replace(/\s+/g, ' ')}`);
      }

      if (typeof data.remark === 'string' && OVERPASS_ERROR_REMARK.test(data.remark)) {
        throw new Error(`Overpass remark: ${data.remark}`);
      }
      if (!Array.isArray(data.elements)) {
        throw new Error('response missing elements[]');
      }

      return data;
    } catch (err) {
      const isAbort = err && err.name === 'AbortError';
      const msg = isAbort ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : err.message;
      if (isAbort && attempt === 1) {
        // Treat a client-side timeout like a retryable server timeout.
        console.error(`${endpoint}: ${msg}, retrying in 10s`);
        await sleep(RETRY_SLEEP_MS);
        continue;
      }
      throw new Error(msg);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('unreachable');
}

/** Try each endpoint in order; return { data, endpoint } from the first success. */
async function queryOverpass(query) {
  const errors = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = await fetchOnce(endpoint, query);
      return { data, endpoint };
    } catch (err) {
      errors.push(`${endpoint}: ${err.message}`);
      console.error(`Overpass endpoint failed - ${endpoint}: ${err.message}`);
    }
  }
  throw new Error(`all Overpass endpoints failed: ${errors.join('; ')}`);
}

// --- direction-tag parsing -------------------------------------------------
// Ported faithfully from deflock-data's data/cameras/lib.mjs (MIT licensed):
// 16-point cardinals, spelled-out cardinals, NB/EB/SB/WB bound directions,
// numeric ranges ("338-23"), and semicolon/comma-separated multi-direction lists.

const CARDINALS = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

const SPELLED_CARDINALS = {
  NORTH: 0, NORTHEAST: 45, EAST: 90, SOUTHEAST: 135,
  SOUTH: 180, SOUTHWEST: 225, WEST: 270, NORTHWEST: 315,
};

const BOUND_DIRECTIONS = { NB: 0, EB: 90, SB: 180, WB: 270 };

function normalizeDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

/** Resolve a simple token (cardinal, spelled-out, bound, or numeric) to raw degrees. */
function resolveSimple(token) {
  const upper = token.trim().toUpperCase();
  if (!upper) return null;
  if (upper in CARDINALS) return CARDINALS[upper];
  if (upper in SPELLED_CARDINALS) return SPELLED_CARDINALS[upper];
  if (upper in BOUND_DIRECTIONS) return BOUND_DIRECTIONS[upper];
  const num = Number(upper); // Number() rejects "338-23" unlike parseFloat
  return isNaN(num) ? null : num;
}

/** Midpoint bearing of a clockwise sector from startDeg to endDeg (raw, not pre-normalized). */
function rangeMidpoint(startDeg, endDeg) {
  const rawArc = endDeg - startDeg;
  const arc = ((rawArc % 360) + 360) % 360;
  if (arc === 0 && rawArc !== 0) return normalizeDegrees(startDeg + 180);
  if (arc === 0) return normalizeDegrees(startDeg);
  return normalizeDegrees(startDeg + arc / 2);
}

/** Parse a single direction token: cardinal, numeric, bound, spelled-out, or range ("338-23"). */
function parseSingleToken(token) {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const simple = resolveSimple(trimmed);
  if (simple !== null) return normalizeDegrees(simple);

  // Range notation: "338-23", "WSW-ESE" - find dash that isn't a leading negative
  const dashIdx = trimmed.indexOf('-', 1);
  if (dashIdx > 0) {
    const left = resolveSimple(trimmed.slice(0, dashIdx));
    const right = resolveSimple(trimmed.slice(dashIdx + 1));
    if (left !== null && right !== null) {
      return rangeMidpoint(left, right);
    }
  }

  return null;
}

/** Parse a direction tag into all resolved bearings (handles semicolons and commas). */
function parseDirections(value) {
  if (!value) return [];
  const tokens = value.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
  const results = [];
  for (const token of tokens) {
    const deg = parseSingleToken(token);
    if (deg !== null) results.push(deg);
  }
  return results;
}

// --- geometry --------------------------------------------------------------

/** Haversine distance in km - matches extract_cameras.py's km() exactly (R=6371.0). */
function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371.0;
  const rad = Math.PI / 180;
  const p1 = lat1 * rad;
  const p2 = lat2 * rad;
  const dp = (lat2 - lat1) * rad;
  const dl = (lon2 - lon1) * rad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function inBbox(lat, lon, box) {
  return lat >= box.min_lat && lat <= box.max_lat && lon >= box.min_lon && lon <= box.max_lon;
}

// --- transform ---------------------------------------------------------

/** Transform raw Overpass elements to the cameras.json camera schema, deduped by osm_type/osm_id. */
function toCameras(elements) {
  const byKey = new Map();

  for (const el of elements) {
    const tags = el.tags ?? {};
    if (tags['man_made'] !== 'surveillance') continue;
    if (tags['surveillance:type'] !== 'ALPR') continue;

    // Nodes carry lat/lon directly; ways carry a center object (query uses
    // "out meta center;" so no child-node lookup/recursion is needed).
    const lat = el.type === 'way' ? el.center?.lat : el.lat;
    const lon = el.type === 'way' ? el.center?.lon : el.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;

    if (!inBbox(lat, lon, BBOX)) continue;

    const directionTag = tags['direction'] || tags['camera:direction'];
    const directions = parseDirections(directionTag);
    const direction = directions.length > 0 ? directions[0] : null;

    const km = haversineKm(lat, lon, CITY_CENTER.lat, CITY_CENTER.lon);

    const camera = {
      osm_id: el.id,
      osm_type: el.type,
      lat,
      lon,
      operator: tags['operator'] || null,
      brand: tags['brand'] || tags['manufacturer'] || null,
      model: tags['model'] || null,
      direction,
      directions: directions.length > 1 ? directions : null,
      zone: tags['surveillance:zone'] || null,
      mount: tags['camera:mount'] || null,
      ref: tags['ref'] || null,
      start_date: tags['start_date'] || null,
      osm_timestamp: el.timestamp || null,
      km_from_city_center: Math.round(km * 100) / 100,
      in_city_bbox: inBbox(lat, lon, CITY_BBOX),
    };

    byKey.set(`${el.type}/${el.id}`, camera);
  }

  const out = [...byKey.values()];
  out.sort((a, b) => a.km_from_city_center - b.km_from_city_center);
  return out;
}

// --- ascii-safe compact JSON (matches Python's json.dump(..., ensure_ascii=True, separators=(",", ":"))) ---

function toAsciiJson(value) {
  const json = JSON.stringify(value);
  let out = '';
  for (const ch of json) {
    const code = ch.codePointAt(0);
    if (code < 0x20 || code > 0x7e) {
      if (code > 0xffff) {
        // Encode as a UTF-16 surrogate pair, each half its own \u escape.
        const c = code - 0x10000;
        const hi = 0xd800 + (c >> 10);
        const lo = 0xdc00 + (c & 0x3ff);
        out += '\\u' + hi.toString(16).padStart(4, '0') + '\\u' + lo.toString(16).padStart(4, '0');
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\t') {
        out += '\\t';
      } else if (ch === '\r') {
        out += '\\r';
      } else {
        out += '\\u' + code.toString(16).padStart(4, '0');
      }
    } else {
      out += ch;
    }
  }
  return out;
}

// --- main --------------------------------------------------------------

async function main() {
  const outPath = process.argv[2] || 'website/public/data/cameras.json';

  const query = buildQuery();
  console.log('Querying Overpass for ALPR cameras in bbox', bboxClause());

  let data, endpoint;
  try {
    ({ data, endpoint } = await queryOverpass(query));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const cameras = toCameras(data.elements);
  console.log(`Fetched ${data.elements.length} elements from ${endpoint}, ${cameras.length} cameras after filter/dedupe`);

  if (cameras.length < MIN_CAMERAS) {
    console.error(`Sanity floor failed: ${cameras.length} cameras < ${MIN_CAMERAS} minimum. Not writing ${outPath}.`);
    process.exit(1);
  }

  const doc = {
    source: {
      name: 'OpenStreetMap via Overpass API (DeFlock project tagging)',
      repo: 'https://github.com/flockhopper3/deflock-data',
      commit: endpoint,
      commit_date: new Date().toISOString().slice(0, 10),
      license: 'Repo: MIT. Camera data: (c) OpenStreetMap contributors, ODbL 1.0, collected via the DeFlock project.',
      us_total: null,
    },
    bbox: BBOX,
    city_bbox: CITY_BBOX,
    city_center: CITY_CENTER,
    count: cameras.length,
    cameras,
  };

  writeFileSync(outPath, toAsciiJson(doc));

  const inCity = cameras.filter((c) => c.in_city_bbox).length;
  console.log(`Wrote ${outPath}: ${cameras.length} cameras (${inCity} in city bbox), endpoint=${endpoint}`);
}

main();
