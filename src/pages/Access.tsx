// Access: Flock Safety's own public transparency portal for Santa Clara PD,
// captured as a snapshot. Everything here describes a rolling 30-day window,
// which is what makes it different from the four-year records release that
// drives the rest of the site.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Section } from '../components/Section';
import { Resolve } from '../components/DataState';
import { StatTile } from '../components/StatTile';
import { Combobox, type ComboOption } from '../components/Combobox';
import { SortableTh, compareBy, type SortDir } from '../components/SortableTh';
import { ChartFrame } from '../components/charts/ChartFrame';
import { RankedBars, type BarRow } from '../components/charts/RankedBars';
import { PATHS, assetUrl, useAccess, useJson } from '../lib/data';
import {
  compact,
  downloadText,
  longDate,
  num,
  orgToSlug,
  pct,
  toCsv,
  utcStamp,
} from '../lib/format';
import type {
  Access as AccessData,
  Agencies as AgenciesData,
  Agency,
} from '../types';
import '../styles/access.css';

const PAGE = 50;
/** Rows charted individually; everything below folds into one Other row. */
const TOP_OFFENSES = 15;

const INTRO =
  "Flock Safety publishes a transparency portal for each of its customers. This " +
  'page is a capture of the one for Santa Clara Police Department: the ' +
  "department's own camera count, its retention period, its usage figures, " +
  'the agencies it shares data with, and a log of recent searches with the ' +
  'reason each one was run.';

export function Access() {
  const state = useAccess();
  const agencies = useJson<AgenciesData>(PATHS.agencies);

  // The header stands while the snapshot loads; every section below reads it.
  if (!state.data) {
    return (
      <Section kicker="Flock transparency portal" title="Access" intro={INTRO}>
        <Resolve state={state} label="the transparency portal snapshot" height={320}>
          {() => null}
        </Resolve>
      </Section>
    );
  }

  return <AccessPage d={state.data} agencies={agencies.data?.agencies ?? null} />;
}

function AccessPage({ d, agencies }: { d: AccessData; agencies: Agency[] | null }) {
  const s = d.stats_30d;

  return (
    <>
      <Section kicker="Flock transparency portal" title="Access" intro={INTRO}>
        <div className="stack stack--lg">
          <div className="grid access-stats">
            <StatTile
              label="Cameras"
              value={num(d.total_cameras)}
              note="Reported by the department, count only"
            />
            <StatTile
              label="Retention"
              value={`${d.retention_days} days`}
              note="How long reads are kept before deletion"
            />
            <StatTile
              label="Searches"
              value={num(s.searches)}
              note="Last 30 days, every one listed below"
            />
            <StatTile
              label="Vehicles detected"
              value={compact(s.vehicles_detected)}
              note={`${num(s.vehicles_detected)} reads in the last 30 days`}
            />
            <StatTile
              label="Hotlist hits"
              value={num(s.hotlist_hits)}
              note="Last 30 days, before human verification"
            />
            <StatTile
              label="Organizations with access"
              value={num(d.access_org_count)}
              note="Named on the portal, listed below"
            />
          </div>

          <div className="callout">
            <strong>The portal in its own words.</strong> {d.overview}
          </div>

          <p className="note">
            Captured {longDate(d.source.fetched)}. The portal reported itself last
            updated {d.last_updated}. Figures on this page are Flock's, not
            computed from the records release, and they cover roughly the 30 days
            before capture. Nothing here comes from CPRA request 26-235.
          </p>
        </div>
      </Section>

      <Purposes d={d} />
      <Roster d={d} agencies={agencies} />
      <Detection d={d} />
      <Policies d={d} />
      <PortalProvenance d={d} />
    </>
  );
}

/* ------------------------------------------------------------------
   Search purposes: the only public statement of why searches happen
   ------------------------------------------------------------------ */

function Purposes({ d }: { d: AccessData }) {
  const summary = d.offense_type_summary;
  const total = useMemo(() => summary.reduce((a, r) => a + r.count, 0), [summary]);

  const bars = useMemo<BarRow[]>(() => {
    const head = summary.slice(0, TOP_OFFENSES);
    const tail = summary.slice(TOP_OFFENSES);
    const rows: BarRow[] = head.map((r) => ({
      key: r.offenseType,
      label: r.offenseType,
      value: r.count,
    }));
    if (tail.length) {
      rows.push({
        key: '__other',
        label: `Other (${tail.length} types)`,
        value: tail.reduce((a, r) => a + r.count, 0),
      });
    }
    return rows;
  }, [summary]);

  return (
    <Section
      id="purposes"
      sunk
      kicker="Rolling 30-day window"
      title="Search purposes"
      intro="The monthly network-audit CSVs released under the records request carry no reason field at all. This portal is the only public account of why searches reaching Santa Clara's cameras are run, and it covers 30 days rather than four years."
    >
      <div className="stack stack--lg">
        <ChartFrame
          title="Offense category selected by the searching officer"
          subtitle={`All ${num(total)} searches published in the portal's rolling audit, by the category the officer picked when running the query.`}
          actions={
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() =>
                downloadText(
                  'flock-portal-offense-types.csv',
                  toCsv(
                    ['offense_type', 'searches'],
                    summary.map((r) => [r.offenseType, r.count]),
                  ),
                )
              }
            >
              CSV
            </button>
          }
          table={
            <table className="data">
              <caption>
                All {summary.length} offense categories in the portal's 30-day
                search audit
              </caption>
              <thead>
                <tr>
                  <th scope="col">Offense category</th>
                  <th scope="col" className="n">
                    Searches
                  </th>
                  <th scope="col" className="n">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.offenseType}>
                    <th scope="row" style={{ fontWeight: 400 }}>
                      {r.offenseType}
                    </th>
                    <td className="n">{num(r.count)}</td>
                    <td className="n">{pct(r.count, total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          footnote={`Top ${TOP_OFFENSES} categories charted; the remaining ${summary.length - TOP_OFFENSES} are grouped as Other. Switch to the table view for every category. The category is the officer's own selection and is not verified by anyone outside the department.`}
        >
          <RankedBars rows={bars} total={total} unit="searches" />
        </ChartFrame>

        <AuditTable d={d} />
      </div>
    </Section>
  );
}

type AuditCol = 'date' | 'networks' | 'offense';

interface AuditRow {
  id: string;
  date: string;
  networks: number;
  offense: string;
}

const AUDIT_GETTERS: Record<AuditCol, (r: AuditRow) => string | number> = {
  date: (r) => r.date,
  networks: (r) => r.networks,
  offense: (r) => r.offense,
};

function AuditTable({ d }: { d: AccessData }) {
  const [offense, setOffense] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<AuditCol>('date');
  const [dir, setDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  const rows = useMemo<AuditRow[]>(
    () =>
      d.search_audit.rows.map((r) => ({
        id: r[0],
        date: r[1],
        networks: r[2],
        offense: r[3],
      })),
    [d.search_audit.rows],
  );

  const options = useMemo<ComboOption[]>(
    () =>
      d.offense_type_summary.map((r) => ({
        value: r.offenseType,
        meta: num(r.count),
      })),
    [d.offense_type_summary],
  );

  const filtered = useMemo(() => {
    const base = offense ? rows.filter((r) => r.offense === offense) : rows;
    return [...base].sort((a, b) => compareBy(a, b, AUDIT_GETTERS[sortKey], dir));
  }, [rows, offense, sortKey, dir]);

  const span = useMemo(() => {
    if (!rows.length) return null;
    const dates = rows.map((r) => r.date).sort();
    return { first: dates[0], last: dates[dates.length - 1] };
  }, [rows]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const clamped = Math.min(page, pages - 1);
  const slice = filtered.slice(clamped * PAGE, clamped * PAGE + PAGE);

  function onSort(col: AuditCol) {
    if (col === sortKey) setDir((v) => (v === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(col);
      setDir(col === 'offense' ? 'asc' : 'desc');
    }
    setPage(0);
  }

  function exportCsv() {
    downloadText(
      'flock-portal-search-audit.csv',
      toCsv(
        ['id', 'search_date_utc', 'networks_searched', 'offense_type'],
        filtered.map((r) => [r.id, r.date, r.networks, r.offense]),
      ),
    );
  }

  return (
    <div className="stack stack--sm">
      <div className="spread">
        <h3>Every search in the window</h3>
        <span className="note">
          {span
            ? `${longDate(span.first.slice(0, 10))} to ${longDate(span.last.slice(0, 10))}, UTC`
            : null}
        </span>
      </div>

      <div className="filters">
        <div style={{ flex: '1 1 22rem', minWidth: 0 }}>
          <Combobox
            label="Offense category"
            options={options}
            value={offense}
            onChange={(v) => {
              setOffense(v);
              setPage(0);
            }}
            allLabel="All offense categories"
            noun="offense category"
            placeholder="Type to search categories"
          />
        </div>
        <button type="button" className="btn btn--ghost" onClick={exportCsv}>
          Download these searches as CSV
        </button>
      </div>

      <p className="note" aria-live="polite">
        Showing {slice.length ? num(clamped * PAGE + 1) : 0} to{' '}
        {num(clamped * PAGE + slice.length)} of {num(filtered.length)} searches
        {offense ? ` categorized as "${offense}"` : ''}.
      </p>

      <div className="card card--flush">
        <div className="table-scroll">
          <table className="data">
            <caption className="visually-hidden">
              Searches published in the portal's rolling 30-day audit
            </caption>
            <thead>
              <tr>
                <SortableTh
                  col="date"
                  label="Search date (UTC)"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={onSort}
                />
                <SortableTh
                  col="networks"
                  label="Networks searched"
                  numeric
                  sortKey={sortKey}
                  dir={dir}
                  onSort={onSort}
                />
                <SortableTh
                  col="offense"
                  label="Offense category"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{utcStamp(r.date)}</td>
                  <td className="n">{num(r.networks)}</td>
                  <td>{r.offense}</td>
                </tr>
              ))}
              {!slice.length ? (
                <tr>
                  <td colSpan={3}>No search in the window used that category.</td>
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

      <p className="note">{d.search_audit.note}.</p>
    </div>
  );
}

/* ------------------------------------------------------------------
   The access roster, joined to the audit log on the exact name
   ------------------------------------------------------------------ */

interface RosterEntry {
  org: string;
  match: Agency | null;
}

function Roster({ d, agencies }: { d: AccessData; agencies: Agency[] | null }) {
  const [q, setQ] = useState('');

  const byOrg = useMemo(() => {
    const m = new Map<string, Agency>();
    for (const a of agencies ?? []) m.set(a.org.trim(), a);
    return m;
  }, [agencies]);

  // Exact match on the trimmed name only. Nothing is guessed.
  const entries = useMemo<RosterEntry[]>(
    () =>
      d.orgs_with_access.map((raw) => {
        const org = raw.trim();
        return { org, match: byOrg.get(org) ?? null };
      }),
    [d.orgs_with_access, byOrg],
  );

  const matched = useMemo(() => entries.filter((e) => e.match).length, [entries]);

  const matchedSearches = useMemo(
    () => entries.reduce((a, e) => a + (e.match?.searches ?? 0), 0),
    [entries],
  );

  const logTotal = useMemo(
    () => (agencies ?? []).reduce((a, r) => a + r.searches, 0),
    [agencies],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) => e.org.toLowerCase().includes(needle));
  }, [entries, q]);

  return (
    <Section
      id="who"
      title="Who can access Santa Clara PD's data"
      intro={`The portal names ${num(d.access_org_count)} organizations that Santa Clara Police Department shares its camera data with. The list below is that roster, cross-referenced against the 2022-2026 network audit log released under the records request.`}
    >
      <div className="stack">
        <div className="filters">
          <div className="field" style={{ flex: '1 1 20rem' }}>
            <label className="field__label" htmlFor="access-org-search">
              Find an organization
            </label>
            <input
              id="access-org-search"
              className="input"
              type="search"
              placeholder={`Search ${num(d.access_org_count)} names`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <p className="note" aria-live="polite">
          Showing {num(shown.length)} of {num(entries.length)} organizations
          {q ? ` matching "${q}"` : ''}.
        </p>

        <div className="card">
          <ul className="orglist">
            {shown.map((e) => (
              <li className="orglist__item" key={e.org}>
                {e.match ? (
                  <Link className="orglist__name" to={`/agencies/${orgToSlug(e.org)}`}>
                    {e.org}
                  </Link>
                ) : (
                  <span className="orglist__name orglist__name--plain">{e.org}</span>
                )}
                <span className="orglist__n">
                  {e.match ? num(e.match.searches) : 'no audit match'}
                </span>
              </li>
            ))}
          </ul>
          {!shown.length ? (
            <p className="note">No organization on the roster contains "{q}".</p>
          ) : null}
        </div>

        {agencies ? (
          <>
            <p className="note">
              <strong>{num(matched)}</strong> of {num(entries.length)} organizations
              with current access appear in the 2022-2026 audit logs, together
              accounting for {num(matchedSearches)} recorded searches
              {logTotal ? ` (${pct(matchedSearches, logTotal)} of the whole log)` : ''}
              . Names that do not match may reflect naming differences between the
              two sources, or organizations that hold access but never ran a search
              in scope. Matching is on the exact name with no fuzzy matching, so the
              portal's "San Diego County CA SO" does not join to the log's "San
              Diego County CA SD", and "Los Gatos CA" does not join to "Town of Los
              Gatos CA".
            </p>
            <p className="note">
              The number beside each name is that organization's all-time search
              count in the released audit log, which covers a different and much
              longer period than the 30-day figures above. Follow a name for its
              full record.
            </p>
          </>
        ) : (
          <p className="note">
            The audit-log cross-reference is unavailable because the agency dataset
            did not load. The roster above is still the portal's own list.
          </p>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------
   Hotlists and detection scope
   ------------------------------------------------------------------ */

function Detection({ d }: { d: AccessData }) {
  return (
    <Section
      id="detection"
      sunk
      title="Hotlists and what the cameras detect"
      intro="What the portal says the system watches for and what it says the system does not identify."
    >
      <div className="card" style={{ maxWidth: '52rem' }}>
        <dl className="dl">
          <dt>Hotlists</dt>
          <dd>
            <span className="row">
              {d.hotlists.map((h) => (
                <span className="badge" key={h}>
                  {h}
                </span>
              ))}
            </span>
          </dd>
          <dt>Detected</dt>
          <dd>
            <span className="row">
              {d.detected.map((h) => (
                <span className="badge" key={h}>
                  {h}
                </span>
              ))}
            </span>
          </dd>
          <dt>Not detected</dt>
          <dd>
            <span className="row">
              {d.not_detected.map((h) => (
                <span className="badge" key={h}>
                  {h}
                </span>
              ))}
            </span>
          </dd>
          <dt>Retention</dt>
          <dd>{d.retention_days} days</dd>
          <dt>Cameras</dt>
          <dd>{num(d.total_cameras)}</dd>
        </dl>
      </div>

      <p className="note" style={{ marginTop: '1rem' }}>
        These are the portal's own claims about the system, reproduced as
        published. Nothing in the records release confirms or contradicts them.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------
   Policies, quoted rather than summarized
   ------------------------------------------------------------------ */

const POLICY_ORDER: { key: keyof AccessData['policies']; label: string }[] = [
  { key: 'acceptable_use', label: 'Acceptable use' },
  { key: 'prohibited_uses', label: 'Prohibited uses' },
  { key: 'access_policy', label: 'Access policy' },
  { key: 'hotlist_policy', label: 'Hotlist policy' },
];

function Policies({ d }: { d: AccessData }) {
  return (
    <Section
      id="policies"
      title="Policies as published"
      intro="The four policy statements the portal publishes, quoted in full and unedited. They are the department's stated rules, not an independent finding about practice."
    >
      <div style={{ maxWidth: '58rem' }}>
        {POLICY_ORDER.map((p) => (
          <details className="disclose" key={p.key} open>
            <summary>{p.label}</summary>
            <div className="disclose__body">{d.policies[p.key]}</div>
          </details>
        ))}
      </div>

      <p className="note" style={{ marginTop: '1rem' }}>
        The access policy states that every search requires a valid reason. The
        offense categories above are the record of those reasons that the portal
        makes public; the reasons themselves, and who entered them, are not
        published.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------
   Where this snapshot came from
   ------------------------------------------------------------------ */

function PortalProvenance({ d }: { d: AccessData }) {
  return (
    <Section id="portal-source" sunk title="About this snapshot">
      <div className="explain">
        <div className="prose">
          <p>
            Flock Safety publishes this portal itself, at a public URL, for each
            agency that opts in. The page is server-rendered HTML with no JSON API
            behind it and sits behind Cloudflare bot protection, so the snapshot is
            taken with a real browser rather than a plain HTTP fetch. It refreshes
            on a best-effort daily schedule; when the capture fails, the previous
            snapshot stays published and the capture date below stops advancing.
          </p>
          <p>
            The wording, the figures and the policy text are Flock's and the
            department's. They are reproduced here for transparency and remain (c)
            their publisher. Everything else on this site comes from CPRA request
            26-235, which is a separate release covering a different period.
          </p>
        </div>
        <div className="stack">
          <dl className="dl">
            <dt>Source</dt>
            <dd>
              <a href={d.source.url} target="_blank" rel="noreferrer noopener">
                transparency.flocksafety.com/santa-clara-ca-pd
              </a>
            </dd>
            <dt>Captured</dt>
            <dd>{longDate(d.source.fetched)}</dd>
            <dt>Portal says updated</dt>
            <dd>{d.last_updated}</dd>
            <dt>Method</dt>
            <dd>{d.source.method}</dd>
            <dt>Transport</dt>
            <dd>{d.source.api}</dd>
            <dt>Local copy</dt>
            <dd className="mono">
              <a href={assetUrl(PATHS.access)} download>
                access.json
              </a>
            </dd>
          </dl>
          <div className="callout">
            <strong>Different data, different window.</strong> The figures here
            cover about 30 days. The audit log behind the{' '}
            <Link to="/agencies">Agencies</Link> and{' '}
            <Link to="/explorer">Explorer</Link> pages covers 2022 to 2026. Do not
            add them together.
          </div>
        </div>
      </div>
    </Section>
  );
}
