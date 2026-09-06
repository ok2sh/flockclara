import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Section } from '../components/Section';
import { Resolve } from '../components/DataState';
import { SortableTh, compareBy, type SortDir } from '../components/SortableTh';
import { PATHS, useJson } from '../lib/data';
import { longDate, num, orgToSlug, pct, toCsv, downloadText } from '../lib/format';
import type { Agencies as AgenciesData, Agency } from '../types';

type Col = 'org' | 'searches' | 'first' | 'last' | 'months_active';

const PAGE = 100;

export function Agencies() {
  const state = useJson<AgenciesData>(PATHS.agencies);

  return (
    <Section
      kicker="Network audit log"
      title="Agencies"
      intro="Every organization recorded as running a search whose scope included Santa Clara Police Department's cameras. Names appear exactly as Flock recorded them, including placeholders and inactive entries."
    >
      <Resolve state={state} label="the agency list" height={400}>
        {(d) => <AgencyTable rows={d.agencies} />}
      </Resolve>
    </Section>
  );
}

function AgencyTable({ rows }: { rows: Agency[] }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<Col>('searches');
  const [dir, setDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  const total = useMemo(() => rows.reduce((a, r) => a + r.searches, 0), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle ? rows.filter((r) => r.org.toLowerCase().includes(needle)) : rows;
    const get = (r: Agency) => r[sortKey];
    return [...base].sort((a, b) => compareBy(a, b, get, dir));
  }, [rows, q, sortKey, dir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const clamped = Math.min(page, pages - 1);
  const slice = filtered.slice(clamped * PAGE, clamped * PAGE + PAGE);

  function onSort(col: Col) {
    if (col === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(col);
      setDir(col === 'org' ? 'asc' : 'desc');
    }
    setPage(0);
  }

  function exportCsv() {
    downloadText(
      'santa-clara-alpr-agencies.csv',
      toCsv(
        ['org', 'searches', 'first_seen', 'last_seen', 'months_active'],
        filtered.map((r) => [r.org, r.searches, r.first, r.last, r.months_active]),
      ),
    );
  }

  return (
    <div className="stack">
      <div className="filters">
        <div className="field" style={{ flex: '1 1 20rem' }}>
          <label className="field__label" htmlFor="agency-search">
            Find an agency
          </label>
          <input
            id="agency-search"
            className="input"
            type="search"
            placeholder="Search 3,469 names"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <button type="button" className="btn btn--ghost" onClick={exportCsv}>
          Download this list as CSV
        </button>
      </div>

      <p className="note" aria-live="polite">
        Showing {slice.length ? num(clamped * PAGE + 1) : 0} to{' '}
        {num(clamped * PAGE + slice.length)} of {num(filtered.length)} agencies
        {q ? ` matching "${q}"` : ''}.
      </p>

      <div className="card card--flush">
        <div className="table-scroll">
          <table className="data">
            <caption className="visually-hidden">
              Agencies searching networks that include Santa Clara Police
              Department cameras
            </caption>
            <thead>
              <tr>
                <SortableTh col="org" label="Agency" sortKey={sortKey} dir={dir} onSort={onSort} />
                <SortableTh
                  col="searches"
                  label="Search events"
                  numeric
                  sortKey={sortKey}
                  dir={dir}
                  onSort={onSort}
                />
                <th scope="col" className="n">
                  Share
                </th>
                <SortableTh
                  col="first"
                  label="First seen"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={onSort}
                />
                <SortableTh
                  col="last"
                  label="Last seen"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={onSort}
                />
                <SortableTh
                  col="months_active"
                  label="Months active"
                  numeric
                  sortKey={sortKey}
                  dir={dir}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr
                  key={r.org}
                  className="row-link"
                  onClick={() => navigate(`/agencies/${orgToSlug(r.org)}`)}
                >
                  <td>
                    <Link
                      to={`/agencies/${orgToSlug(r.org)}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.org}
                    </Link>
                  </td>
                  <td className="n">{num(r.searches)}</td>
                  <td className="n">{pct(r.searches, total, 2)}</td>
                  <td className="n mono">{r.first}</td>
                  <td className="n mono">{r.last}</td>
                  <td className="n">{r.months_active}</td>
                </tr>
              ))}
              {!slice.length ? (
                <tr>
                  <td colSpan={6}>No agency name contains "{q}".</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="note">
          Page {clamped + 1} of {num(pages)}
        </span>
        <div className="row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={clamped === 0}
            onClick={() => setPage(clamped - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={clamped >= pages - 1}
            onClick={() => setPage(clamped + 1)}
          >
            Next
          </button>
        </div>
      </div>

      <p className="note">
        First and last seen are the dates of that agency's earliest and latest
        recorded search, in UTC. Months active counts calendar months holding at
        least one search, not consecutive months. Earliest date in the whole log
        is {longDate('2022-01-31')}.
      </p>
    </div>
  );
}
