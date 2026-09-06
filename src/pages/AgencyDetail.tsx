import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Section } from '../components/Section';
import { StatTile } from '../components/StatTile';
import { Resolve } from '../components/DataState';
import { ChartFrame } from '../components/charts/ChartFrame';
import { StripChart } from '../components/charts/StripChart';
import { PATHS, useAccess, useJson } from '../lib/data';
import {
  downloadText,
  longDate,
  monthLabel,
  num,
  orgToSlug,
  pct,
  slugToOrg,
  toCsv,
} from '../lib/format';
import type { Agencies, AgencyMonthly, Summary } from '../types';

export function AgencyDetail() {
  const { org: slug = '' } = useParams();
  const org = slugToOrg(slug);
  const agencies = useJson<Agencies>(PATHS.agencies);
  const monthly = useJson<AgencyMonthly>(PATHS.agencyMonthly);
  const summary = useJson<Summary>(PATHS.summary);

  return (
    <Section kicker="Network audit log / agency record">
      <p style={{ marginBottom: '0.9rem' }}>
        <Link to="/agencies">Back to all agencies</Link>
      </p>

      <Resolve state={agencies} label="the agency list" height={320}>
        {(list) => {
          const row = list.agencies.find((a) => a.org === org);
          if (!row) {
            return (
              <div className="state state--error" role="alert">
                <strong>No agency named "{org}"</strong>
                It is not in the released audit log. Check the name on the{' '}
                <Link to="/agencies">agencies list</Link>.
              </div>
            );
          }

          const share = summary.data
            ? pct(row.searches, summary.data.total_searches, 3)
            : null;

          return (
            <div className="stack stack--lg">
              <header className="stack stack--sm">
                <h1 style={{ fontSize: 'clamp(2rem, 1.4rem + 2.2vw, 3rem)' }}>
                  {row.org}
                </h1>
                <p className="lede">
                  Recorded running {num(row.searches)} searches whose scope
                  included Santa Clara Police Department's cameras, between{' '}
                  {longDate(row.first)} and {longDate(row.last)}.
                </p>
                <PortalAccessNote org={row.org} />
              </header>

              <div className="grid grid--4">
                <StatTile
                  label="Search events"
                  value={num(row.searches)}
                  note={share ? `${share} of all events in the log` : undefined}
                />
                <StatTile
                  label="First seen"
                  value={longDate(row.first)}
                  note="Earliest recorded search, UTC"
                />
                <StatTile
                  label="Last seen"
                  value={longDate(row.last)}
                  note="Most recent recorded search, UTC"
                />
                <StatTile
                  label="Months active"
                  value={num(row.months_active)}
                  note="Calendar months with at least one search"
                />
              </div>

              <Resolve state={monthly} label="the monthly series" height={240}>
                {(am) => <AgencyTrend org={row.org} data={am} />}
              </Resolve>

              <div className="row">
                <Link className="btn" to={`/explorer?org=${orgToSlug(row.org)}`}>
                  View this agency's events in the explorer
                </Link>
                <Link className="btn btn--ghost" to="/agencies">
                  All agencies
                </Link>
              </div>

              <p className="note">
                This page counts search events, not vehicles or plates. The
                released log does not say what was searched for or whether a
                search returned a result. The organization name is reproduced
                exactly as Flock recorded it.
              </p>
            </div>
          );
        }}
      </Resolve>
    </Section>
  );
}

/**
 * Renders only when Flock's transparency portal snapshot names this agency.
 * The snapshot is a separate dataset, so a missing or failed fetch simply
 * leaves the line out rather than breaking the page.
 */
function PortalAccessNote({ org }: { org: string }) {
  const access = useAccess();
  const snapshot = access.data;

  const listed = useMemo(
    () => !!snapshot?.orgs_with_access.some((o) => o.trim() === org),
    [snapshot, org],
  );

  if (!snapshot || !listed) return null;

  return (
    <p className="row">
      <span className="badge">Portal access</span>
      <span className="note">
        Listed on Flock's transparency portal as having access, as of{' '}
        {longDate(snapshot.source.fetched)}.{' '}
        <Link to="/access#who">See the full roster</Link>.
      </span>
    </p>
  );
}

function AgencyTrend({ org, data }: { org: string; data: AgencyMonthly }) {
  const series = data.series[org];

  const peak = useMemo(() => {
    if (!series) return null;
    const max = Math.max(...series);
    return { month: data.months[series.indexOf(max)], value: max };
  }, [series, data.months]);

  if (!series) {
    return (
      <p className="note">
        No month-by-month series was published for this agency.
      </p>
    );
  }

  return (
    <ChartFrame
      title="Monthly search activity"
      subtitle={`Search events per month for ${org}. Months with no activity read as zero.`}
      actions={
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() =>
            downloadText(
              `${org.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-monthly.csv`,
              toCsv(
                ['month', 'searches'],
                data.months.map((m, i) => [m, series[i]]),
              ),
            )
          }
        >
          CSV
        </button>
      }
      table={
        <table className="data">
          <caption>Search events per month for {org}</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col" className="n">
                Search events
              </th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m, i) => (
              <tr key={m}>
                <th scope="row" style={{ fontWeight: 400 }}>
                  {monthLabel(m)}
                </th>
                <td className="n">{num(series[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      footnote={
        peak
          ? `Busiest month: ${monthLabel(peak.month)} with ${num(peak.value)} events. The first and last months of the log are partial.`
          : undefined
      }
    >
      <StripChart months={data.months} values={series} unit="searches" height={210} />
    </ChartFrame>
  );
}
