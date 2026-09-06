import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Section } from '../components/Section';
import { Combobox } from '../components/Combobox';
import { Loading, LoadError } from '../components/DataState';
import { PATHS, useJson } from '../lib/data';
import { bytes, downloadText, num, toCsv, typeLabel } from '../lib/format';
import {
  createView,
  isDbReady,
  overlappingFiles,
  registerFiles,
  runQuery,
  withConnection,
} from '../lib/duckdb';
import type { QueryResult, Row } from '../lib/duckdb';
import type { Agencies, Agency, ParquetManifest } from '../types';

const TYPES = [
  'search',
  'lookup',
  'apiV2',
  'apiV1',
  'convoy',
  'visual',
  'freeform',
  'multiGeo',
  'searchSummary',
];

const PAGE_SIZE = 100;
const CSV_CAP = 100_000;
const ADVANCED_CAP = 1_000;

const ROW_COLUMNS =
  'org, search_time, search_type, networks_searched, timeframe_start, timeframe_end';

const INTRO =
  'The full audit log of 14.9 million search events is published as 17 Parquet files, ' +
  'one per quarter. Your browser runs the query itself and downloads only the byte ranges ' +
  'it needs, so nothing you enter here is uploaded anywhere. The first query takes a few ' +
  'seconds while the query engine starts up.';

interface Filters {
  org: string | null;
  from: string;
  to: string;
  type: string;
}

interface Corpus {
  min: string;
  max: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

function minusMonths(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - n);
  return isoDay(d);
}

function clampDay(day: string, c: Corpus): string {
  if (!DATE_RE.test(day)) return c.max;
  return day < c.min ? c.min : day > c.max ? c.max : day;
}

function defaultFilters(c: Corpus): Filters {
  return { org: null, from: clampDay(minusMonths(c.max, 3), c), to: c.max, type: '' };
}

/** Prefill from the hash query string. The agencies page links here with ?org=. */
function filtersFromParams(
  params: URLSearchParams,
  c: Corpus,
  agencies: Agency[] | null,
): Filters {
  const next = defaultFilters(c);
  const org = params.get('org') ?? params.get('agency');
  if (org) {
    next.org = org;
    // Widen to the agency's own span so the linked-to agency is never empty.
    const match = agencies?.find((a) => a.org === org);
    next.from = clampDay(match?.first ?? c.min, c);
    next.to = clampDay(match?.last ?? c.max, c);
  }
  const from = params.get('from');
  if (from && DATE_RE.test(from)) next.from = clampDay(from, c);
  const to = params.get('to');
  if (to && DATE_RE.test(to)) next.to = clampDay(to, c);
  const type = params.get('type');
  if (type && TYPES.includes(type)) next.type = type;
  return next;
}

function rangeProblem(f: Filters): string | null {
  if (!DATE_RE.test(f.from) || !DATE_RE.test(f.to)) {
    return 'Enter a start date and an end date.';
  }
  if (f.from > f.to) return 'The start date must be on or before the end date.';
  return null;
}

/** Fixed SQL fragments only. Every visitor-supplied value travels as a bind param. */
function buildWhere(f: Filters): { where: string; params: unknown[] } {
  const parts = [
    "search_time >= strptime(?, '%Y-%m-%d')",
    "search_time < strptime(?, '%Y-%m-%d')",
  ];
  const params: unknown[] = [f.from, addDays(f.to, 1)];
  if (f.org) {
    parts.push('org = ?');
    params.push(f.org);
  }
  if (f.type) {
    parts.push('search_type = ?');
    params.push(f.type);
  }
  return { where: parts.join(' AND '), params };
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return null;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number') return num(v);
  if (typeof v === 'bigint') return num(Number(v));
  return String(v);
}

export function Explorer() {
  const manifest = useJson<ParquetManifest>(PATHS.manifest);
  const agencies = useJson<Agencies>(PATHS.agencies);
  const pending = manifest.loading || agencies.loading;

  return (
    <Section kicker="Network audit log" title="Record explorer" intro={INTRO}>
      {pending ? (
        <Loading label="the record index" height={220} />
      ) : manifest.error || !manifest.data || manifest.data.files.length === 0 ? (
        <LoadError
          label="The record index"
          error={manifest.error ?? new Error('The Parquet manifest listed no files')}
        />
      ) : (
        <ExplorerBody manifest={manifest.data} agencies={agencies.data?.agencies ?? null} />
      )}
    </Section>
  );
}

function ExplorerBody({
  manifest,
  agencies,
}: {
  manifest: ParquetManifest;
  agencies: Agency[] | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const spec = searchParams.toString();

  const corpus = useMemo<Corpus>(() => {
    let min = manifest.files[0].min;
    let max = manifest.files[0].max;
    for (const f of manifest.files) {
      if (f.min < min) min = f.min;
      if (f.max > max) max = f.max;
    }
    return { min: min.slice(0, 10), max: max.slice(0, 10) };
  }, [manifest.files]);

  const [mode, setMode] = useState<'guided' | 'advanced'>('guided');
  const [draft, setDraft] = useState<Filters>(() =>
    filtersFromParams(new URLSearchParams(spec), corpus, agencies),
  );

  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [avg, setAvg] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const appliedRef = useRef<Filters | null>(null);
  const tokenRef = useRef(0);

  const draftProblem = rangeProblem(draft);
  const draftFiles = useMemo(
    () => (draftProblem ? [] : overlappingFiles(manifest.files, draft.from, draft.to)),
    [manifest.files, draft.from, draft.to, draftProblem],
  );
  const draftBytes = draftFiles.reduce((s, f) => s + f.bytes, 0);

  const run = useCallback(
    async (f: Filters, pageIndex: number, known: { total: number; avg: number | null } | null) => {
      const problem = rangeProblem(f);
      if (problem) {
        setError(problem);
        return;
      }
      const token = ++tokenRef.current;
      setBusy(true);
      setError(null);
      if (!isDbReady()) setBooting(true);
      try {
        const names = overlappingFiles(manifest.files, f.from, f.to).map((x) => x.name);
        await registerFiles(names);
        const out = await withConnection(async (conn) => {
          await createView(conn, names);
          const { where, params } = buildWhere(f);
          let summary = known;
          if (!summary) {
            const agg = await runQuery(
              conn,
              `SELECT COUNT(*) AS events, ROUND(AVG(networks_searched), 1) AS avg_networks
               FROM searches WHERE ${where}`,
              params,
            );
            const first = agg.rows[0] ?? {};
            summary = {
              total: toNumber(first.events) ?? 0,
              avg: toNumber(first.avg_networks),
            };
          }
          const pageRows = await runQuery(
            conn,
            `SELECT ${ROW_COLUMNS} FROM searches WHERE ${where}
             ORDER BY search_time DESC LIMIT ${PAGE_SIZE} OFFSET ${pageIndex * PAGE_SIZE}`,
            params,
          );
          return { ...summary, rows: pageRows.rows };
        });
        if (token !== tokenRef.current) return;
        appliedRef.current = f;
        setPage(pageIndex);
        setTotal(out.total);
        setAvg(out.avg);
        setRows(out.rows);
      } catch (e) {
        if (token !== tokenRef.current) return;
        setError(messageOf(e));
      } finally {
        if (token === tokenRef.current) {
          setBusy(false);
          setBooting(false);
        }
      }
    },
    [manifest.files],
  );

  // Runs on mount and again whenever the link that brought us here changes.
  useEffect(() => {
    const next = filtersFromParams(new URLSearchParams(spec), corpus, agencies);
    setDraft(next);
    void run(next, 0, null);
  }, [spec, corpus, agencies, run]);

  function onReset() {
    if (spec) {
      setSearchParams({}, { replace: true });
      return;
    }
    const next = defaultFilters(corpus);
    setDraft(next);
    void run(next, 0, null);
  }

  async function onDownload() {
    const f = appliedRef.current;
    if (!f) return;
    setCsvBusy(true);
    setError(null);
    try {
      const names = overlappingFiles(manifest.files, f.from, f.to).map((x) => x.name);
      await registerFiles(names);
      const { where, params } = buildWhere(f);
      const out = await withConnection(async (conn) => {
        await createView(conn, names);
        return runQuery(
          conn,
          `SELECT ${ROW_COLUMNS} FROM searches WHERE ${where}
           ORDER BY search_time LIMIT ${CSV_CAP}`,
          params,
        );
      });
      const body = out.rows.map((r) => out.columns.map((c) => r[c]));
      downloadText(`search-events-${f.from}-to-${f.to}.csv`, toCsv(out.columns, body));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setCsvBusy(false);
    }
  }

  const applied = appliedRef.current;
  const pages = total === null ? 0 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const status = booting
    ? 'Starting the query engine...'
    : busy
      ? 'Running query...'
      : error
        ? 'Query failed.'
        : total === null
          ? 'No results yet.'
          : `${num(total)} matching events. Average networks searched per event: ` +
            `${avg === null ? '-' : avg.toFixed(1)}. Page ${num(page + 1)} of ${num(pages)}.`;

  return (
    <div className="stack">
      <div className="spread">
        <div className="seg" role="group" aria-label="Query mode">
          <button
            type="button"
            aria-pressed={mode === 'guided'}
            onClick={() => setMode('guided')}
          >
            Guided
          </button>
          <button
            type="button"
            aria-pressed={mode === 'advanced'}
            onClick={() => setMode('advanced')}
          >
            SQL
          </button>
        </div>
        <span className="note">
          Scanning {num(draftFiles.length)} of {num(manifest.files.length)} quarterly files for
          this date range, {bytes(draftBytes)} on the server. Your browser downloads only the
          byte ranges the query reads, which is usually a small fraction of that.
        </span>
      </div>

      <div className="filters">
        {mode === 'guided' ? (
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <Combobox
              label="Agency"
              options={
                agencies
                  ? agencies.map((a) => ({ value: a.org, meta: num(a.searches) }))
                  : []
              }
              value={draft.org}
              onChange={(v) => setDraft((d) => ({ ...d, org: v }))}
              allLabel="All agencies"
            />
          </div>
        ) : null}

        <DateField
          label="Date from"
          value={draft.from}
          min={corpus.min}
          max={corpus.max}
          onChange={(v) => setDraft((d) => ({ ...d, from: v }))}
        />
        <DateField
          label="Date to"
          value={draft.to}
          min={corpus.min}
          max={corpus.max}
          onChange={(v) => setDraft((d) => ({ ...d, to: v }))}
        />

        {mode === 'guided' ? (
          <TypeField
            value={draft.type}
            onChange={(v) => setDraft((d) => ({ ...d, type: v }))}
          />
        ) : null}

        {mode === 'guided' ? (
          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={busy || draftProblem !== null}
              onClick={() => void run(draft, 0, null)}
            >
              Run query
            </button>
            <button type="button" className="btn btn--ghost" onClick={onReset} disabled={busy}>
              Reset
            </button>
          </div>
        ) : null}
      </div>

      {draftProblem ? (
        <p className="note" role="alert" style={{ color: 'var(--status-critical-ink)' }}>
          {draftProblem}
        </p>
      ) : null}

      {mode === 'guided' ? (
        <div className="stack stack--sm">
          <p className="note" role="status" aria-live="polite">
            {status}
          </p>

          {error ? (
            <div className="state state--error" role="alert">
              <strong>The query did not run</strong>
              {error}
            </div>
          ) : null}

          {rows === null && busy ? (
            <Loading label={booting ? 'the query engine' : 'results'} height={200} />
          ) : null}

          {rows !== null ? (
            <div className={busy ? 'stack stack--sm is-stale' : 'stack stack--sm'}>
              <div className="card card--flush">
                <div className="table-scroll">
                  <table className="data">
                    <caption>
                      Search events matching the current filter, newest first.
                      {applied?.org ? ` Agency: ${applied.org}.` : ' All agencies.'}
                      {applied ? ` ${applied.from} to ${applied.to}.` : ''}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Agency</th>
                        <th scope="col">Search time (UTC)</th>
                        <th scope="col">Type</th>
                        <th scope="col" className="n">
                          Networks
                        </th>
                        <th scope="col">Timeframe start</th>
                        <th scope="col">Timeframe end</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={6}>No events match this filter.</td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={i}>
                            <td>{cellText(r.org)}</td>
                            <td className="mono">{cellText(r.search_time)}</td>
                            <td>{typeLabel(String(r.search_type ?? ''))}</td>
                            <td className="n">{cellText(r.networks_searched)}</td>
                            <td className="mono">{cellText(r.timeframe_start)}</td>
                            <td className="mono">{cellText(r.timeframe_end)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="spread">
                <nav className="row" aria-label="Result pages">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={busy || page === 0}
                    onClick={() =>
                      applied && total !== null && void run(applied, page - 1, { total, avg })
                    }
                  >
                    Previous
                  </button>
                  <span className="note">
                    Page {num(page + 1)} of {num(pages)}, {num(total ?? 0)} events
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={busy || page + 1 >= pages}
                    onClick={() =>
                      applied && total !== null && void run(applied, page + 1, { total, avg })
                    }
                  >
                    Next
                  </button>
                </nav>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={csvBusy || busy || !applied}
                  onClick={() => void onDownload()}
                >
                  {csvBusy ? 'Preparing CSV...' : 'Download results as CSV'}
                </button>
              </div>

              {total !== null && total > CSV_CAP ? (
                <p className="note">
                  The download is capped at the first {num(CSV_CAP)} rows by search time.
                  Narrow the date range or pick one agency for a complete extract.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <AdvancedMode
          fileNames={draftFiles.map((f) => f.name)}
          fileCount={draftFiles.length}
          totalFiles={manifest.files.length}
          from={draft.from}
          to={draft.to}
          blocked={draftProblem}
        />
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="field" style={{ flex: '0 1 160px' }}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function TypeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="field" style={{ flex: '0 1 180px' }}>
      <label className="field__label" htmlFor={id}>
        Search type
      </label>
      <select
        id={id}
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All types</option>
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {typeLabel(t)}
          </option>
        ))}
      </select>
    </div>
  );
}

const SCHEMA: { col: string; type: string; meaning: string }[] = [
  { col: 'org', type: 'VARCHAR', meaning: 'The searching agency, as recorded in the log.' },
  {
    col: 'networks_searched',
    type: 'BIGINT',
    meaning: 'How many camera networks that one query covered.',
  },
  {
    col: 'timeframe_start',
    type: 'TIMESTAMP',
    meaning: 'Start of the window of camera data the query asked for.',
  },
  {
    col: 'timeframe_end',
    type: 'TIMESTAMP',
    meaning: 'End of the window of camera data the query asked for.',
  },
  { col: 'search_time', type: 'TIMESTAMP', meaning: 'When the query was run, UTC.' },
  { col: 'search_type', type: 'VARCHAR', meaning: 'The Flock query type, such as search or apiV2.' },
];

const EXAMPLES: { label: string; sql: string }[] = [
  {
    label: 'Top 20 agencies by events',
    sql: 'SELECT org, count(*) AS events\nFROM searches\nGROUP BY org\nORDER BY events DESC\nLIMIT 20',
  },
  {
    label: 'Events per month',
    sql: "SELECT strftime(search_time, '%Y-%m') AS month, count(*) AS events\nFROM searches\nGROUP BY month\nORDER BY month",
  },
  {
    label: 'Longest timeframe windows',
    sql: "SELECT org, search_time, timeframe_start, timeframe_end,\n       datediff('day', timeframe_start, timeframe_end) AS window_days\nFROM searches\nORDER BY window_days DESC\nLIMIT 25",
  },
];

// Whole-word write and DDL keywords. Blunt on purpose: this box is read only,
// so a false positive on something like the replace() function is acceptable.
const DENY =
  /\b(attach|copy|create|delete|drop|insert|update|alter|install|load|pragma|export|set|call|replace)\b/i;

function checkSql(input: string): { sql: string; error: string | null } {
  const sql = input.trim().replace(/;+\s*$/, '').trim();
  if (!sql) return { sql, error: 'Enter a SELECT query.' };
  if (sql.includes(';')) {
    return { sql, error: 'Only one statement can run at a time. Remove the extra semicolon.' };
  }
  const hit = DENY.exec(sql);
  if (hit) {
    return {
      sql,
      error: `This box is read only, so "${hit[1]}" is not allowed. Use a single SELECT statement.`,
    };
  }
  return { sql, error: null };
}

function AdvancedMode({
  fileNames,
  fileCount,
  totalFiles,
  from,
  to,
  blocked,
}: {
  fileNames: string[];
  fileCount: number;
  totalFiles: number;
  from: string;
  to: string;
  blocked: string | null;
}) {
  const id = useId();
  const [sql, setSql] = useState(EXAMPLES[0].sql);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const namesKey = fileNames.join(',');

  const execute = useCallback(
    async (limit: number): Promise<QueryResult | null> => {
      const checked = checkSql(sql);
      if (checked.error) {
        setError(checked.error);
        return null;
      }
      if (blocked) {
        setError(blocked);
        return null;
      }
      const names = namesKey ? namesKey.split(',') : [];
      setError(null);
      if (!isDbReady()) setBooting(true);
      try {
        await registerFiles(names);
        return await withConnection(async (conn) => {
          await createView(conn, names);
          return runQuery(conn, `SELECT * FROM (\n${checked.sql}\n) AS q LIMIT ${limit}`);
        });
      } catch (e) {
        setError(messageOf(e));
        return null;
      } finally {
        setBooting(false);
      }
    },
    [sql, blocked, namesKey],
  );

  async function onRun() {
    setBusy(true);
    const out = await execute(ADVANCED_CAP);
    if (out) setResult(out);
    setBusy(false);
  }

  async function onDownload() {
    setCsvBusy(true);
    const out = await execute(CSV_CAP);
    if (out) {
      const body = out.rows.map((r) => out.columns.map((c) => r[c]));
      downloadText('sql-result.csv', toCsv(out.columns, body));
    }
    setCsvBusy(false);
  }

  return (
    <div className="stack">
      <div className="grid grid--2">
        <div className="stack stack--sm">
          <div className="field">
            <label className="field__label" htmlFor={id}>
              Read-only SQL
            </label>
            <textarea
              id={id}
              className="textarea"
              rows={10}
              spellCheck={false}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
            />
          </div>
          <p className="note">
            Queries run against the view <span className="mono">searches</span>, which covers
            the {num(fileCount)} of {num(totalFiles)} quarterly files that overlap {from} to{' '}
            {to}. Change the dates above to widen or narrow that view. Only SELECT statements
            are accepted, one at a time, and at most {num(ADVANCED_CAP)} rows are displayed.
          </p>
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => void onRun()}>
              {busy ? 'Running...' : 'Run SQL'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={csvBusy || busy}
              onClick={() => void onDownload()}
            >
              {csvBusy ? 'Preparing CSV...' : 'Download results as CSV'}
            </button>
          </div>
          <div className="row">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setSql(ex.sql)}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>Columns in searches</h3>
          <dl className="dl">
            {SCHEMA.map((s) => (
              <div key={s.col} style={{ display: 'contents' }}>
                <dt>{s.col}</dt>
                <dd>
                  <span className="mono" style={{ color: 'var(--ink-3)' }}>
                    {s.type}
                  </span>{' '}
                  {s.meaning}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <p className="note" role="status" aria-live="polite">
        {booting
          ? 'Starting the query engine...'
          : busy
            ? 'Running query...'
            : error
              ? 'Query failed.'
              : result
                ? `${num(result.rows.length)} rows returned (display capped at ${num(ADVANCED_CAP)}).`
                : 'No results yet.'}
      </p>

      {error ? (
        <div className="state state--error" role="alert">
          <strong>The query did not run</strong>
          {error}
        </div>
      ) : null}

      {result ? (
        <div className={busy ? 'card card--flush is-stale' : 'card card--flush'}>
          <div className="table-scroll">
            <table className="data" aria-label="SQL query result">
              <caption>
                Result of the last SQL run, capped at {num(ADVANCED_CAP)} rows.
              </caption>
              <thead>
                <tr>
                  {result.columns.map((c) => (
                    <th scope="col" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, result.columns.length)}>
                      The query returned no rows.
                    </td>
                  </tr>
                ) : (
                  result.rows.map((r, i) => (
                    <tr key={i}>
                      {result.columns.map((c) => (
                        <td key={c} className={typeof r[c] === 'number' ? 'n' : undefined}>
                          {cellText(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
