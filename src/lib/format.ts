// Number, date and text formatting used across the site.

const nf = new Intl.NumberFormat('en-US');

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  return nf.format(n);
}

/** Compact form for stat tiles and axis ticks: 1,284 / 12.9K / 4.2M. */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const a = Math.abs(n);
  if (a >= 1e9) return trim(n / 1e9) + 'B';
  if (a >= 1e6) return trim(n / 1e6) + 'M';
  if (a >= 10_000) return trim(n / 1e3) + 'K';
  return nf.format(n);
}

function trim(v: number): string {
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(1);
  return s.replace(/\.0$/, '');
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function pct(part: number, whole: number, digits = 1): string {
  if (!whole) return '-';
  return ((part / whole) * 100).toFixed(digits) + '%';
}

/** "2026-02-23" or an ISO timestamp -> "Feb 23, 2026". Never shifts the day. */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "2026-02" -> "Feb 2026". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

/** Naive UTC timestamp from the audit log, shown as recorded. */
export function utcStamp(iso: string | null | undefined): string {
  if (!iso) return '-';
  return iso.replace('T', ' ').replace(/\.\d+$/, '').slice(0, 19);
}

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(1) + ' GB';
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}

const HOUR_LABELS = [
  '12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a',
  '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p',
];

export function hourLabel(h: number): string {
  return HOUR_LABELS[h] ?? String(h);
}

export const DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/** Human wording for the raw search_type values in the audit log. */
const TYPE_WORDS: Record<string, string> = {
  search: 'Plate search',
  lookup: 'Plate lookup',
  apiV2: 'API query (v2)',
  apiV1: 'API query (v1)',
  convoy: 'Convoy analysis',
  visual: 'Visual search',
  freeform: 'Free-form search',
  multiGeo: 'Multi-area search',
  searchSummary: 'Search summary',
};

export function typeLabel(t: string): string {
  return TYPE_WORDS[t] ?? t;
}

/** Slug used in /agencies/:org so names with slashes survive the hash route. */
export function orgToSlug(org: string): string {
  return encodeURIComponent(org);
}

export function slugToOrg(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const out = [headers.map(csvCell).join(',')];
  for (const r of rows) out.push(r.map(csvCell).join(','));
  return out.join('\r\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv'): void {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
