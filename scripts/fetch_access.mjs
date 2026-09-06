#!/usr/bin/env node
import { writeFileSync, readFileSync } from 'node:fs';

// Parse Flock Safety's public transparency portal page for Santa Clara CA PD
// into structured JSON. The page is server-rendered HTML with no JSON API
// and no embedded data blob, protected by Cloudflare bot management (a plain
// fetch gets HTTP 403 with a "Just a moment..." challenge interstitial).
// Two modes:
//   - default: live GET of the portal URL (works only when not challenged)
//   - --input <file>: parse a saved HTML capture (e.g. from a real browser
//     session) instead of fetching - the manual-refresh path
//
// Parsing is HTML-regex keyed on the page's stable data-tp-* attributes
// (data-tp-entry-type on each metric/content block, data-tp-full-value on
// each access-list cell). No DOM library, zero npm deps.
//
// Usage: node fetch_access.mjs [--input <html-file>] [output-path]
// Exit codes: 0 ok, 1 hard failure (network error, missing required
// sections), 78 no-op (blocked by Cloudflare on a live fetch - distinct from
// a real error so CI can treat it as a skip, not a failure).

const PORTAL_URL = 'https://transparency.flocksafety.com/santa-clara-ca-pd';
const USER_AGENT = 'santa-clara-alpr-transparency/1.0 (github actions; contact via repo issues)';
const NOOP_EXIT_CODE = 78;

function parseArgs(argv) {
  let input = null;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') {
      input = argv[++i];
    } else {
      rest.push(argv[i]);
    }
  }
  return { input, output: rest[0] || 'website/public/data/access.json' };
}

// --- HTML entity decoding (small set actually used on this page) -----------

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function intFromText(text) {
  if (!text) return null;
  const digits = text.replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

function splitList(text) {
  if (!text) return [];
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

// --- section extraction -----------------------------------------------------

// Matches every metric/text content block: an optional data-tp-entry-type,
// a label (first <p> in the tpEntryHeader), and a plain-text value (the div
// after the optional colored-marker div). Blocks whose value contains nested
// markup (the access table, the CSV downloader) don't match this pattern and
// are parsed separately below.
const BLOCK_RE =
  /<div(?:\s+data-tp-entry-type="([a-zA-Z0-9]+)")?\s+data-tp-presentation="(?:metric|text)"[^>]*><div style="display:flex;flex-direction:column;gap:16px"><div class="tpEntryHeader"><p[^>]*>([^<]*)<\/p>(?:<p[^>]*>[^<]*<\/p>)?<\/div><div style="display:flex;flex-direction:row;gap:8px;align-items:flex-start">(?:<div aria-hidden="true"[^>]*><\/div>)?<div[^>]*>([^<]*)<\/div>/g;

function extractBlocks(html) {
  const byType = {};
  const byLabel = {};
  let m;
  while ((m = BLOCK_RE.exec(html))) {
    const [, entryType, labelRaw, valueRaw] = m;
    const label = decodeEntities(labelRaw).trim();
    const value = decodeEntities(valueRaw).trim();
    if (entryType) byType[entryType] = value;
    byLabel[label] = value;
  }
  return { byType, byLabel };
}

function extractOverview(html) {
  const m = /<div class="tpOverview" id="overview"[^>]*><h3>Overview<\/h3><p>([^<]*)<\/p>/.exec(html);
  return m ? decodeEntities(m[1]).trim() : '';
}

function extractLastUpdated(html) {
  const m = /<p>Last updated: <span title="[^"]*">([^<]*)<\/span><\/p>/.exec(html);
  return m ? decodeEntities(m[1]).trim() : '';
}

// The "Sharing Network Data With" access list renders as a two-column table
// (data-tp-access-layout="two-column"): each visual row holds up to two org
// cells. Org identity lives entirely in data-tp-full-value, so grab every
// occurrence between the orgsWithAccess block and the next entry-type block
// (searchAuditCsv), in document order.
function extractOrgs(html) {
  const startIdx = html.indexOf('data-tp-entry-type="orgsWithAccess"');
  if (startIdx === -1) return [];
  let endIdx = html.indexOf('data-tp-entry-type="searchAuditCsv"', startIdx);
  if (endIdx === -1) endIdx = html.length;
  const section = html.slice(startIdx, endIdx);
  const re = /data-tp-full-value="([^"]*)"/g;
  const orgs = [];
  let m;
  while ((m = re.exec(section))) orgs.push(decodeEntities(m[1]));
  return orgs;
}

// The Public Search Audit CSV is embedded as a data: URI in an <a href>.
// It's URL-encoded (not HTML-entity-encoded), so decode with
// decodeURIComponent and parse as ordinary quoted CSV.
function extractSearchAuditCsvText(html) {
  const startIdx = html.indexOf('data-tp-entry-type="searchAuditCsv"');
  if (startIdx === -1) return null;
  const m = /href="(data:text\/csv;charset=utf-8,[^"]*)"/.exec(html.slice(startIdx));
  if (!m) return null;
  const prefix = 'data:text/csv;charset=utf-8,';
  if (!m[1].startsWith(prefix)) return null;
  try {
    return decodeURIComponent(m[1].slice(prefix.length));
  } catch {
    return null;
  }
}

// Minimal RFC4180-style CSV parser: quoted fields, "" escapes a literal
// quote, comma delimiter. Needed because offenseType values can themselves
// contain a comma (e.g. multi-select offenses), so naive split(',') breaks.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // skip
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const AUDIT_COLUMNS = ['id', 'searchDate', 'networkCount', 'offenseType'];

function extractSearchAudit(html) {
  const csvText = extractSearchAuditCsvText(html);
  if (!csvText) return null;
  const table = parseCsv(csvText);
  if (table.length === 0) return null;
  const dataRows = table
    .slice(1)
    .filter((r) => !(r.length === 1 && r[0] === ''))
    .map((r) => [r[0], r[1], intFromText(r[2]) ?? 0, r[3]]);
  return { columns: AUDIT_COLUMNS, rows: dataRows };
}

function summarizeOffenseTypes(rows) {
  const counts = new Map();
  for (const r of rows) {
    const offenseType = r[3];
    counts.set(offenseType, (counts.get(offenseType) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([offenseType, count]) => ({ offenseType, count }))
    .sort((a, b) => b.count - a.count || a.offenseType.localeCompare(b.offenseType));
}

// --- assemble full document -------------------------------------------------

function parsePortalHtml(html, method) {
  const { byType, byLabel } = extractBlocks(html);

  const retention_days = intFromText(byType.dataRetentionInDays);
  const total_cameras = intFromText(byType.numberOfOwnedCameras);
  const orgs_with_access = extractOrgs(html);
  const search_audit = extractSearchAudit(html);

  const missing = [];
  if (retention_days === null) missing.push('retention_days');
  if (total_cameras === null) missing.push('total_cameras');
  if (orgs_with_access.length === 0) missing.push('access list');
  if (!search_audit || search_audit.rows.length === 0) missing.push('search audit');
  if (missing.length > 0) {
    console.error(`missing required section(s): ${missing.join(', ')} - refusing to write output`);
    return null;
  }

  return {
    source: {
      url: PORTAL_URL,
      api: 'server-rendered HTML (no JSON API); Cloudflare bot-protected',
      fetched: new Date().toISOString().slice(0, 10),
      method,
    },
    last_updated: extractLastUpdated(html),
    overview: extractOverview(html),
    retention_days,
    total_cameras,
    stats_30d: {
      vehicles_detected: intFromText(byType.plateReadsInLast30Days),
      searches: intFromText(byType.searchesInLast30Days),
      hotlist_hits: intFromText(byType.plateHitsInLast30Days),
    },
    hotlists: splitList(byType.hotlistSources),
    detected: splitList(byLabel["What's Detected"]),
    not_detected: splitList(byLabel["What's Not Detected"]),
    policies: {
      acceptable_use: byLabel['Acceptable Use Policy'] || '',
      prohibited_uses: byLabel['Prohibited Uses'] || '',
      access_policy: byLabel['Access Policy'] || '',
      hotlist_policy: byLabel['Hotlist Policy'] || '',
    },
    access_org_count: orgs_with_access.length,
    orgs_with_access,
    search_audit: {
      columns: search_audit.columns,
      rows: search_audit.rows,
      note: "Rolling ~30-day public search audit published by the portal; offenseType is the searching officer's selected offense category",
    },
    offense_type_summary: summarizeOffenseTypes(search_audit.rows),
  };
}

// --- ascii-safe compact JSON (matches Python's json.dump(..., ensure_ascii=True, separators=(",", ":"))) ---

function toAsciiJson(value) {
  const json = JSON.stringify(value);
  let out = '';
  for (const ch of json) {
    const code = ch.codePointAt(0);
    if (code < 0x20 || code > 0x7e) {
      if (code > 0xffff) {
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

// --- Cloudflare challenge detection ----------------------------------------

function looksLikeChallenge(res, bodyText) {
  return res.status === 403 || !!res.headers.get('cf-mitigated') || /Just a moment/i.test(bodyText);
}

// --- main --------------------------------------------------------------

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));

  let html;
  let method;

  if (input) {
    try {
      html = readFileSync(input, 'utf8');
    } catch (err) {
      console.error(`failed to read ${input}: ${err.message}`);
      process.exit(1);
    }
    method = 'browser capture';
  } else {
    let res;
    try {
      res = await fetch(PORTAL_URL, { headers: { 'User-Agent': USER_AGENT } });
    } catch (err) {
      console.error(`network error fetching ${PORTAL_URL}: ${err.message}`);
      process.exit(1);
    }

    let text;
    try {
      text = await res.text();
    } catch (err) {
      console.error(`failed to read response body: ${err.message}`);
      process.exit(1);
    }

    if (looksLikeChallenge(res, text)) {
      console.log('blocked by bot protection, skipping refresh');
      process.exit(NOOP_EXIT_CODE);
    }
    if (!res.ok) {
      console.error(`unexpected HTTP ${res.status} from ${PORTAL_URL}`);
      process.exit(1);
    }

    html = text;
    method = 'live fetch';
  }

  const doc = parsePortalHtml(html, method);
  if (!doc) {
    process.exit(1);
  }

  writeFileSync(output, toAsciiJson(doc));
  console.log(
    `Wrote ${output}: ${doc.access_org_count} orgs, ${doc.search_audit.rows.length} audit rows, ` +
      `${doc.offense_type_summary.length} offense types`
  );
}

main();
