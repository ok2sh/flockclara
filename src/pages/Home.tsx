import { Link } from 'react-router-dom';
import { Section } from '../components/Section';
import { StatTile } from '../components/StatTile';
import { Resolve } from '../components/DataState';
import { ChartFrame } from '../components/charts/ChartFrame';
import { StripChart } from '../components/charts/StripChart';
import { RankedBars } from '../components/charts/RankedBars';
import { Heatmap, HeatmapTable } from '../components/charts/Heatmap';
import { PATHS, useJson } from '../lib/data';
import {
  DAY_NAMES,
  compact,
  hourLabel,
  longDate,
  money,
  monthLabel,
  num,
  orgToSlug,
  pct,
  typeLabel,
} from '../lib/format';
import type {
  Heatmap as HeatmapData,
  Invoices,
  Monthly,
  SearchTypes,
  Summary,
} from '../types';

/** The Dec 2023 break is visible in the data, so the chart names it. */
const CUTOFF: { month: string; label: string }[] = [
  { month: '2023-12', label: 'Dec 2023 access change' },
];

export function Home() {
  const summary = useJson<Summary>(PATHS.summary);
  const monthly = useJson<Monthly>(PATHS.monthly);
  const types = useJson<SearchTypes>(PATHS.searchTypes);
  const heat = useJson<HeatmapData>(PATHS.heatmap);
  const invoices = useJson<Invoices>(PATHS.invoices);

  const poTotal = invoices.data
    ? invoices.data.purchase_orders.reduce((a, p) => a + (p.computed_total ?? 0), 0)
    : null;
  const poCount = invoices.data?.purchase_orders.length ?? null;

  return (
    <>
      <div className="hero">
        <div className="wrap hero__head">
          <span className="kicker">Network audit log / CPRA 26-235</span>
          <h1>Who searched Santa Clara's license plate cameras</h1>
          <p className="lede">
            Between January 2022 and February 2026, outside law enforcement
            agencies ran{' '}
            <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {summary.data ? num(summary.data.total_searches) : '14.1 million'}
            </strong>{' '}
            searches whose scope included Santa Clara Police Department's Flock
            Safety cameras. This site publishes that audit log, and the city's
            purchase records for the system, with exact duplicate rows removed
            and nothing else changed.
          </p>
        </div>

        <div className="wrap hero__chart">
          <Resolve state={monthly} label="the monthly totals" height={280}>
            {(m) => (
              <>
                <StripChart
                  months={m.months}
                  values={m.searches}
                  unit="searches"
                  variant="hero"
                  height={300}
                  annotations={CUTOFF}
                />
                <div className="hero__meta">
                  <span>Searches per month</span>
                  <span>
                    {monthLabel(m.months[0])} to{' '}
                    {monthLabel(m.months[m.months.length - 1])}
                  </span>
                </div>
              </>
            )}
          </Resolve>
        </div>
      </div>

      <Section>
        <Resolve state={summary} label="the summary figures" height={140}>
          {(s) => (
            <div className="grid grid--4">
              <StatTile
                label="Search events"
                value={compact(s.total_searches)}
                note={`${num(s.total_searches)} distinct rows${
                  s.released_rows ? ` of ${num(s.released_rows)} released` : ''
                }`}
              />
              <StatTile
                label="Agencies that searched"
                value={num(s.distinct_orgs)}
                note="Distinct organization names in the log"
              />
              <StatTile
                label="Log covers"
                value={`${s.months} months`}
                note={`${longDate(s.first_search)} to ${longDate(s.last_search)}`}
              />
              <StatTile
                label="City purchase orders"
                value={poTotal === null ? '-' : money(poTotal)}
                note={
                  poCount === null
                    ? 'Loading procurement records'
                    : `${poCount} orders, all via Insight Public Sector`
                }
              />
            </div>
          )}
        </Resolve>
      </Section>

      <Section
        kicker="How to read this"
        title="What one search event means"
        sunk
        id="explainer"
      >
        <div className="explain">
          <div className="prose">
            <p>
              Flock Safety cameras photograph passing vehicles and record the
              license plate, the time and the location. Agencies that own cameras
              can link their networks together, so a query run by one agency can
              reach across other agencies' cameras as well.
            </p>
            <p>
              <strong>
                Every row in this log is one query, run by an outside agency,
                whose scope included Santa Clara Police Department's cameras.
              </strong>{' '}
              The log records the agency that ran it, how many camera networks the
              query covered, the window of camera footage it asked for, the moment
              it ran, and the query type.
            </p>
            <p>
              It does not record which plate was searched, why, whether anything
              matched, or which individual cameras answered. Those fields were not
              part of the release, so this site cannot show them.
            </p>
          </div>

          <div className="stack">
            <div className="callout">
              <strong>Provenance.</strong> Released by the Santa Clara Police
              Department on {longDate('2026-08-05')} in response to California
              Public Records Act request 26-235. Figures here are computed
              directly from the released files. Exact duplicate rows are
              removed; nothing else was added, removed or corrected.
            </div>
            {summary.data ? (
              <dl className="dl">
                <dt>Duplicates</dt>
                <dd>
                  {num(summary.data.duplicate_rows)} byte-identical rows
                  removed
                  {summary.data.released_rows
                    ? ` (${pct(summary.data.duplicate_rows, summary.data.released_rows)} of ${num(summary.data.released_rows)} released)`
                    : ''}
                  , from two logging faults: August 2022 to January 2023, and
                  February 2025
                </dd>
                <dt>Networks</dt>
                <dd>
                  {summary.data.avg_networks_searched} average networks per search.
                  This average is held down by 2022 and early 2023, where the field
                  was logged as 0.
                </dd>
                <dt>Timestamps</dt>
                <dd>Recorded in UTC. The heatmap below converts to Pacific time.</dd>
              </dl>
            ) : null}
            <p className="note">
              Coverage note: logging effectively begins on{' '}
              {longDate('2022-01-31')} (January 2022 holds only 10 records) and the
              final month ends on {longDate('2026-02-23')}, so the first and last
              points of every monthly chart are partial.
            </p>
          </div>
        </div>
      </Section>

      <Section
        kicker="Network audit log"
        title="The agencies that searched most"
        intro="Ranked by the number of search events recorded against networks that include Santa Clara's cameras."
      >
        <div className="stack">
          <Resolve state={summary} label="the agency ranking" height={380}>
            {(s) => (
              <ChartFrame
                title="Top 15 agencies by search events"
                subtitle={`Out of ${num(s.distinct_orgs)} agencies in the log. Share is of all ${num(s.total_searches)} events.`}
                table={<TopOrgsTable rows={s.top_orgs.slice(0, 15)} total={s.total_searches} />}
                footnote={
                  <>
                    The largest single searcher is NCRIC, the Northern California
                    Regional Intelligence Center, a federally funded fusion center
                    that runs queries on behalf of member agencies. Names appear
                    exactly as recorded by Flock, including placeholder entries
                    such as "Decommissioned Org".
                  </>
                }
              >
                <RankedBars
                  showRank
                  total={s.total_searches}
                  rows={s.top_orgs.slice(0, 15).map((o) => ({
                    key: o.org,
                    label: o.org,
                    value: o.searches,
                    to: `/agencies/${orgToSlug(o.org)}`,
                  }))}
                />
              </ChartFrame>
            )}
          </Resolve>
          <div className="row">
            <Link className="btn btn--ghost" to="/agencies">
              See all agencies
            </Link>
            <Link className="btn btn--ghost" to="/explorer">
              Query the raw events
            </Link>
          </div>
        </div>
      </Section>

      <Section kicker="Network audit log" title="Reach and query types">
        <div className="grid grid--2">
          <Resolve state={monthly} label="the monthly agency counts" height={260}>
            {(m) => (
              <ChartFrame
                title="Distinct agencies searching each month"
                subtitle="How many different organizations ran at least one qualifying search that month."
                table={<MonthlyTable months={m.months} values={m.distinct_orgs} head="Agencies" />}
                footnote="The step down after December 2023 tracks California Attorney General guidance issued in October 2023 under SB 34, which advised that ALPR data may not be shared with out-of-state agencies. Agencies including Houston, Dallas and Fort Worth police and the Illinois State Police stop appearing on 4 December 2023. The change was not absolute: Las Vegas Metro, MOCIC and several others continue to appear after 2024."
              >
                <StripChart
                  months={m.months}
                  values={m.distinct_orgs}
                  unit="agencies"
                  height={220}
                  annotations={CUTOFF}
                />
              </ChartFrame>
            )}
          </Resolve>

          <Resolve state={types} label="the query types" height={260}>
            {(t) => {
              const total = t.types.reduce((a, x) => a + x.count, 0);
              return t.types.length > 1 ? (
                <ChartFrame
                  title="Search events by query type"
                  subtitle="The kind of query Flock recorded for each event."
                  table={<TypesTable rows={t.types} total={total} />}
                  footnote="Query types reflect Flock platform versions as much as user behavior. apiV2 appears only between May 2022 and March 2023 and apiV1 between March 2023 and December 2024; lookup, convoy and visual all begin on 21 March 2023; freeform begins in May 2025 and searchSummary in January 2026. Only the plain search type spans the whole period."
                >
                  <RankedBars
                    unit="events"
                    total={total}
                    rows={t.types.map((x) => ({
                      key: x.type,
                      label: typeLabel(x.type),
                      value: x.count,
                      meta: x.type,
                    }))}
                  />
                </ChartFrame>
              ) : (
                <p className="note">
                  All {num(total)} events share a single query type,{' '}
                  {typeLabel(t.types[0]?.type ?? '')}.
                </p>
              );
            }}
          </Resolve>
        </div>
      </Section>

      <Section kicker="Network audit log" title="When the searches happen">
        <Resolve state={heat} label="the hourly pattern" height={300}>
          {(h) => {
            const peak = peakCell(h.grid);
            const dayTotals = h.grid.map((r) => r.reduce((a, b) => a + b, 0));
            const topDay = dayTotals.indexOf(Math.max(...dayTotals));
            const hourTotals = Array.from({ length: 24 }, (_, x) =>
              h.grid.reduce((a, r) => a + r[x], 0),
            );
            const topHour = hourTotals.indexOf(Math.max(...hourTotals));
            return (
              <ChartFrame
                title="Search events by day of week and hour"
                subtitle={
                  <>
                    Local time in {h.tz.replace('_', ' ')}. {h.note}. Darker means
                    more searches in that hour across the whole log.
                  </>
                }
                table={<HeatmapTable grid={h.grid} />}
                footnote={`Busiest single cell: ${DAY_NAMES[peak.d]} at ${hourLabel(peak.h)} Pacific, ${num(peak.v)} events. Across the whole log ${DAY_NAMES[topDay]} is the busiest weekday and ${hourLabel(topHour)} the busiest hour. Activity concentrates in the working week and daylight hours. The single busiest date in the log is ${longDate('2025-07-30')}, with 25,972 events, about 1.6 times the median 2025 day. Switch to the table view for every value.`}
              >
                <Heatmap grid={h.grid} tz={h.tz} />
              </ChartFrame>
            );
          }}
        </Resolve>
      </Section>

      <Section sunk>
        <div className="explain">
          <div className="stack stack--sm">
            <span className="kicker">Keep reading</span>
            <h2 style={{ fontSize: '1.6rem' }}>Go to the records</h2>
            <p className="note">
              Every figure on this page can be checked against the released files.
            </p>
          </div>
          <div className="pill-links">
            <Link className="btn" to="/explorer">
              Query the 14.1 million events
            </Link>
            <Link className="btn btn--ghost" to="/spending">
              See what the city paid
            </Link>
            <Link className="btn btn--ghost" to="/about">
              Method and caveats
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}

function peakCell(grid: number[][]) {
  let best = { d: 0, h: 0, v: -1 };
  grid.forEach((row, d) =>
    row.forEach((v, h) => {
      if (v > best.v) best = { d, h, v };
    }),
  );
  return best;
}

function TopOrgsTable({
  rows,
  total,
}: {
  rows: { org: string; searches: number }[];
  total: number;
}) {
  return (
    <table className="data">
      <caption>Top 15 agencies by search events</caption>
      <thead>
        <tr>
          <th scope="col" className="n">
            Rank
          </th>
          <th scope="col">Agency</th>
          <th scope="col" className="n">
            Search events
          </th>
          <th scope="col" className="n">
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.org}>
            <td className="n">{i + 1}</td>
            <td>
              <Link to={`/agencies/${orgToSlug(r.org)}`}>{r.org}</Link>
            </td>
            <td className="n">{num(r.searches)}</td>
            <td className="n">{pct(r.searches, total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MonthlyTable({
  months,
  values,
  head,
}: {
  months: string[];
  values: number[];
  head: string;
}) {
  return (
    <table className="data">
      <caption>{head} per month</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col" className="n">
            {head}
          </th>
        </tr>
      </thead>
      <tbody>
        {months.map((m, i) => (
          <tr key={m}>
            <th scope="row" style={{ fontWeight: 400 }}>
              {monthLabel(m)}
            </th>
            <td className="n">{num(values[i])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TypesTable({
  rows,
  total,
}: {
  rows: { type: string; count: number }[];
  total: number;
}) {
  return (
    <table className="data">
      <caption>Search events by query type</caption>
      <thead>
        <tr>
          <th scope="col">Type</th>
          <th scope="col">Recorded value</th>
          <th scope="col" className="n">
            Events
          </th>
          <th scope="col" className="n">
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.type}>
            <td>{typeLabel(r.type)}</td>
            <td className="mono">{r.type}</td>
            <td className="n">{num(r.count)}</td>
            <td className="n">{pct(r.count, total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
