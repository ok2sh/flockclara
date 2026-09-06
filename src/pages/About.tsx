import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Section } from '../components/Section';
import { Resolve } from '../components/DataState';
import { PATHS, assetUrl, useJson } from '../lib/data';
import { bytes, longDate, num, pct } from '../lib/format';
import type { ParquetManifest, Summary } from '../types';

const TOC = [
  ['what', 'What this site is'],
  ['provenance', 'Provenance'],
  ['audits', 'What a network audit is'],
  ['method', 'How the data was processed'],
  ['caveats', 'Data notes and caveats'],
  ['downloads', 'Download the data'],
  ['limits', 'Limitations'],
  ['disclaimer', 'Disclaimer'],
] as const;

export function About() {
  const summary = useJson<Summary>(PATHS.summary);
  const manifest = useJson<ParquetManifest>(PATHS.manifest);

  return (
    <>
      <Section kicker="About this project" title="Method, provenance and caveats">
        <ul className="anchor-list">
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`}>{label}</a>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="what" title="What this site is">
        <div className="prose">
          <p>
            This is an unofficial, searchable republication of public records
            about the Santa Clara, California Police Department's use of Flock
            Safety automated license plate readers. It contains two things: the
            network audit log of searches that other agencies ran against camera
            networks including Santa Clara's, and the city's purchase records for
            the system.
          </p>
          <p>
            Nothing here is analysis on behalf of anyone. Every number on the site
            is computed from the released files, and the released files are
            available to download in full so the numbers can be checked.
          </p>
        </div>
      </Section>

      <Section id="provenance" title="Provenance" sunk>
        <div className="explain">
          <div className="prose">
            <p>
              The records were obtained through a request under the California
              Public Records Act, Government Code section 7920 and following,
              filed with the City of Santa Clara Police Department and tracked by
              the city as <strong>request 26-235</strong>. The department released
              the responsive records on {longDate('2026-08-05')}.
            </p>
            <p>
              The release consisted of 50 monthly CSV exports of the Flock network
              audit log, six City of Santa Clara purchase orders as PDFs, and one
              29-page Flock Group Inc. agreement marked inactive. All of them are
              published here unchanged, alongside the derived datasets described
              below.
            </p>
          </div>
          <div className="stack">
            <dl className="dl">
              <dt>Agency</dt>
              <dd>Santa Clara Police Department, Santa Clara, California</dd>
              <dt>Request</dt>
              <dd>CPRA 26-235</dd>
              <dt>Released</dt>
              <dd>{longDate('2026-08-05')}</dd>
              <dt>Audit rows</dt>
              <dd>
                {summary.data ? num(summary.data.total_searches) : '14,082,090'}{' '}
                published, from{' '}
                {summary.data && summary.data.released_rows
                  ? num(summary.data.released_rows)
                  : '14,895,298'}{' '}
                as released
              </dd>
              <dt>Documents</dt>
              <dd>
                7 PDFs, published at <Link to="/documents">Documents</Link>
              </dd>
            </dl>
            <div className="callout">
              <strong>Not an official source.</strong> For the authoritative
              records, request them from the City of Santa Clara directly.
            </div>
          </div>
        </div>
      </Section>

      <Section id="audits" title="What a Flock network audit is">
        <div className="prose">
          <p>
            Flock Safety sells fixed cameras that photograph every passing vehicle
            and record the license plate, a vehicle description, the time and the
            camera location. Agencies that buy cameras can share access with other
            agencies, which links their camera networks together. A single query
            run by one agency can therefore search across cameras owned by many
            others.
          </p>
          <p>
            A network audit is the log Flock keeps of those cross-agency queries.
            The export released here answers one question: which outside agencies
            ran searches whose scope included Santa Clara Police Department's
            cameras, and when. Each row is one such query.
          </p>
          <p>
            The released columns are the searching organization, the number of
            camera networks the query covered, the start and end of the time window
            of camera data it asked for, the moment the query ran, and the query
            type. There is no plate number, no stated reason, no result count and
            no named officer. Those fields either are not in the audit export or
            were not released.
          </p>
        </div>
      </Section>

      <Section id="method" title="How the data was processed" sunk>
        <div className="prose">
          <p>
            The 50 monthly CSV exports were concatenated and converted to Apache
            Parquet, partitioned by calendar quarter of the search timestamp and
            sorted inside each file by organization then search time. Column types
            are: organization and search type as text, networks searched as an
            integer, and the three timestamps as naive datetimes.
          </p>
          <p>
            <strong>
              Exact duplicates are the only rows removed. Nothing was added or
              corrected.
            </strong>{' '}
            Rows that were byte identical across all six columns have been
            collapsed to one, for the reasons set out in the caveat below; the
            as-released count is published alongside every total. Values that
            look wrong in the source still look wrong here, and the caveats
            below describe the ones worth knowing about.
          </p>
          <p>
            All timestamps in the release are UTC and are stored and displayed as
            UTC everywhere on this site, with one deliberate exception: the day of
            week by hour heatmap on the overview converts search times to Pacific
            time, because a chart about when people are at work is meaningless in
            UTC. That chart is labeled accordingly.
          </p>
          <p>
            The aggregate JSON files that drive the charts are computed from the
            Parquet files. The record explorer queries the Parquet files directly
            in your browser using DuckDB compiled to WebAssembly. Queries run
            locally and fetch only the byte ranges they need over HTTP range
            requests, so nothing you type is sent anywhere.
          </p>
          <p>
            Every file the site needs is served from the site itself, with two
            exceptions, both on the <Link to="/cameras">Cameras</Link> page. The
            map loads basemap tiles from tile.openstreetmap.org whenever that page
            is open. The refresh button queries the Overpass API for current
            OpenStreetMap records, at overpass.deflock.org or a public mirror, and
            only when you press it. No other page contacts any outside host, and
            the camera snapshot itself is a local file like everything else.
          </p>
        </div>
      </Section>

      <Section id="caveats" title="Data notes and caveats">
        <div className="stack">
          <p className="lede">
            Read these before quoting any figure from this site.
          </p>

          <div className="grid grid--2">
            <Caveat title="A December 2023 access change reshapes the data">
              Between 4 and 5 December 2023 the number of distinct agencies
              searching per day fell from 609 to 183 and never recovered. 3,347
              organizations appear in the log before 2024; only 375 appear after.
              Large out-of-state searchers stop on 4 December 2023, including
              Houston police (445,066 searches), Fort Worth, Dallas and the
              Illinois State Police. The timing matches guidance issued by the
              California Attorney General in October 2023 stating that SB 34 bars
              sharing ALPR data with out-of-state agencies. The change was not
              total: Las Vegas Metro (90,961 searches after 2024), MOCIC
              (10,296), Monroe Georgia police (1,322) and Hamilton County Ohio
              (493), among others,
              continue to appear after 2024. This site describes the pattern in the
              data and does not assert a cause.
            </Caveat>

            <Caveat title="Duplicate rows were removed, and where they came from">
              The release contains{' '}
              {summary.data ? num(summary.data.duplicate_rows) : '813,208'}{' '}
              rows that are byte identical to another row across all six columns,{' '}
              {summary.data && summary.data.released_rows
                ? pct(summary.data.duplicate_rows, summary.data.released_rows, 2)
                : '5.46%'}{' '}
              of the {summary.data && summary.data.released_rows
                ? num(summary.data.released_rows)
                : '14,895,298'}{' '}
              released. They are not spread evenly, and they are not an artifact
              of the 50 monthly exports overlapping: no row appears in more than
              one export file. They fall in two windows. From August 2022 to
              January 2023 the log runs at almost exactly twice its real volume,
              at a uniform rate across unrelated agencies, peaking at 2.20x in
              December 2022. In February 2025 every duplicate group is exactly
              five rows. Both look like logging faults rather than repeated
              searching, and removing them turns a series with an artificial hump
              into a continuous one. Each identical group is collapsed to a single
              row, so every total on this site is a count of distinct logged
              events. The as-released figure is published alongside it.
            </Caveat>

            <Caveat title="Networks searched is zero for all of 2022">
              The networks searched column is recorded as 0 for every 2022 row and
              for some early 2023 rows. The overall average of{' '}
              {summary.data ? summary.data.avg_networks_searched : '614.76'}{' '}
              networks per search is therefore pulled down by those rows. For a
              meaningful figure, filter to 2024 and later in the{' '}
              <Link to="/explorer">explorer</Link>.
            </Caveat>

            <Caveat title="Query types track platform versions, not behavior">
              The set of search type values changes as Flock changed its platform.
              apiV2 appears only between May 2022 and March 2023; apiV1 between
              March 2023 and December 2024; lookup, convoy and visual all begin on
              21 March 2023; freeform begins 22 May 2025; searchSummary begins 21
              January 2026. Only the plain search type spans the whole period. A
              type appearing or vanishing usually means a software change, not a
              change in how agencies work.
            </Caveat>

            <Caveat title="The first and last months are partial">
              Logging effectively begins on 31 January 2022. The whole of January
              2022 holds only 10 records, so the first point on every monthly chart
              is not a real month. The log ends on 23 February 2026, so the last
              point is a partial month too. Separately, the monthly source files
              were bucketed by Pacific local month while the timestamps are UTC, so
              a few hours of activity can fall on the other side of a month
              boundary.
            </Caveat>

            <Caveat title="Some organization names are placeholders">
              Names are reproduced exactly as Flock recorded them. That includes
              entries such as "do not use" and "DO NOT USE", "Decommissioned Org"
              (3,998 searches), "[Federal] FBI [Inactive]" (18,650 searches, ending
              14 July 2023) and "Flock RTCC". They were not filtered out, because
              removing rows would misstate the totals. Treat the distinct agency
              count as a count of names in the log, not of real, currently active
              agencies.
            </Caveat>

            <Caveat title="Some searched time windows are malformed">
              875 rows have a time-frame end earlier than their start, 11 have a
              start at the Unix epoch (1 January 1970) and 3 have an end past 2030.
              The median searched window is 2 days. These rows are left as
              released.
            </Caveat>

            <Caveat title="The camera map is not part of the release">
              The <Link to="/cameras">Cameras</Link> page plots 1,031 license
              plate readers around Santa Clara that OpenStreetMap volunteers
              mapped, largely through the DeFlock project. The city released no
              camera coordinates and no camera count, so nothing on that map came
              from request 26-235. Coverage is incomplete, no camera in it carries
              a Santa Clara Police Department operator tag, and a missing dot is
              not evidence that a street has no camera. That page can also query
              OpenStreetMap live, which will show different totals than the
              snapshot as volunteers add and remove cameras.
            </Caveat>

            <Caveat title="The released audit does not say why a search was run">
              The network-audit CSVs record the searching organization, the time,
              the number of networks in scope and the query type. They do not
              record the officer-entered reason for the search, the user who ran
              it, or the plate that was queried. Those fields exist in Flock's
              fuller search-audit exports; they were not part of this release. The
              one public source of search reasons for this department is Flock's
              own transparency portal, which publishes an offense category for
              each search over a rolling 30-day window. That snapshot is
              republished on the <Link to="/access">Access</Link> page. It covers a
              different and much shorter period than the release, carries no
              organization name, and cannot be joined to the audit log row by row.
            </Caveat>

            <Caveat title="What the counts do and do not mean">
              A row is a query, not a vehicle, a plate, a person or a hit. One
              agency running one query that covered 600 networks is one row. The
              log cannot tell you whether any search found anything, and it cannot
              tell you whether a search was justified.
            </Caveat>
          </div>
        </div>
      </Section>

      <Section id="downloads" title="Download the data" sunk>
        <div className="stack">
          <p className="prose">
            Everything the site runs on is a static file you can download. The
            Parquet files hold the complete audit log; the aggregate JSON files are
            what the charts read.
          </p>

          <div className="card card--flush">
            <Resolve state={manifest} label="the file manifest" height={200}>
              {(mf) => (
                <div className="table-scroll">
                  <table className="data">
                    <caption>
                      Parquet files, {num(mf.total_rows)} rows total. Columns:{' '}
                      {mf.columns.join(', ')}.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">File</th>
                        <th scope="col" className="n">
                          Rows
                        </th>
                        <th scope="col" className="n">
                          Size
                        </th>
                        <th scope="col">Covers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mf.files.map((f) => (
                        <tr key={f.name}>
                          <td className="mono">
                            <a href={assetUrl(`data/parquet/${f.name}`)} download>
                              {f.name}
                            </a>
                          </td>
                          <td className="n">{num(f.rows)}</td>
                          <td className="n">{bytes(f.bytes)}</td>
                          <td className="mono">
                            {f.min.slice(0, 10)} to {f.max.slice(0, 10)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>{mf.files.length} files</td>
                        <td className="n">{num(mf.total_rows)}</td>
                        <td className="n">
                          {bytes(mf.files.reduce((a, f) => a + f.bytes, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Resolve>
          </div>

          <div>
            <h3 style={{ marginBottom: '0.6rem' }}>Supporting files</h3>
            <ul className="anchor-list">
              <li>
                <a href={assetUrl(PATHS.manifest)} download>
                  parquet/manifest.json
                </a>
              </li>
              <li>
                <a href={assetUrl(PATHS.summary)} download>
                  summary.json
                </a>
              </li>
              <li>
                <a href={assetUrl(PATHS.monthly)} download>
                  monthly.json
                </a>
              </li>
              <li>
                <a href={assetUrl(PATHS.agencies)} download>
                  agencies.json
                </a>
              </li>
              <li>
                <a href={assetUrl(PATHS.agencyMonthly)} download>
                  agency_monthly.json
                </a>
              </li>
              <li>
                <a href={assetUrl(PATHS.searchTypes)} download>
                  search_types.json
                </a>
              </li>
              <li>
                <a href={assetUrl(PATHS.heatmap)} download>
                  heatmap.json
                </a>
              </li>
              <li>
                <a href={assetUrl(PATHS.invoices)} download>
                  invoices.json
                </a>
              </li>
              <li>
                <a href={assetUrl(PATHS.documents)} download>
                  documents.json
                </a>
              </li>
              <li>
                <a href={assetUrl(PATHS.cameras)} download>
                  cameras.json
                </a>
              </li>
            </ul>
          </div>

          <p className="note">
            Parquet opens in DuckDB, pandas, Polars, R and most data tools. The
            explorer on this site reads exactly these files.
          </p>

          <div>
            <h3 style={{ marginBottom: '0.6rem' }}>Data from outside the release</h3>
            <p className="prose" style={{ marginBottom: '0.6rem' }}>
              Two datasets on this site did not come from the city.{' '}
              <span className="mono">cameras.json</span> holds the community-mapped
              camera locations behind the <Link to="/cameras">Cameras</Link> page,
              extracted from the FlockHopper repository at its commit of{' '}
              {longDate('2026-07-23')}. FlockHopper is MIT licensed; the camera
              records themselves are (c) OpenStreetMap contributors under ODbL 1.0
              and were collected largely through the DeFlock project.
            </p>
            <ul className="anchor-list">
              <li>
                <a
                  href="https://github.com/FoggedLens/deflockhopper_maps"
                  target="_blank"
                  rel="noreferrer"
                >
                  github.com/FoggedLens/deflockhopper_maps
                </a>
              </li>
              <li>
                <a href="https://deflock.me" target="_blank" rel="noreferrer">
                  deflock.me
                </a>
              </li>
              <li>
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  openstreetmap.org/copyright
                </a>
              </li>
            </ul>

            <p className="prose" style={{ marginBlock: '1rem 0.6rem' }}>
              <span className="mono">access.json</span> is a capture of Flock
              Safety's own public transparency portal for Santa Clara Police
              Department, taken on {longDate('2026-08-05')} and published on the{' '}
              <Link to="/access">Access</Link> page. It reports the department's
              camera count, its 30-day retention period, usage figures for the
              previous 30 days, the 351 organizations it shares data with, and a
              rolling 30-day search audit naming an offense category for each
              search. The portal is server-rendered HTML behind Cloudflare bot
              protection with no JSON API, so it is captured with a browser and
              refreshed on a best-effort daily schedule; when a capture fails, the
              previous snapshot stays published and its capture date stops
              advancing. The wording, figures and policy text are (c) their
              publisher and are reproduced here for transparency.
            </p>
            <ul className="anchor-list">
              <li>
                <a
                  href="https://transparency.flocksafety.com/santa-clara-ca-pd"
                  target="_blank"
                  rel="noreferrer"
                >
                  transparency.flocksafety.com/santa-clara-ca-pd
                </a>
              </li>
              <li>
                <a href={assetUrl(PATHS.access)} download>
                  access.json
                </a>
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section id="limits" title="Limitations">
        <div className="prose">
          <p>
            The audit log describes searches by outside agencies against networks
            that include Santa Clara's cameras. It is not a log of Santa Clara
            Police Department's own searches, and it is not a log of camera reads.
            It says nothing about how many cameras the city operates, where they
            are, how long data is retained, or how many vehicles were photographed.
          </p>
          <p>
            The log also cannot distinguish a query that actually returned Santa
            Clara camera data from one that merely had Santa Clara in scope. A
            search covering 600 networks is recorded the same way whether or not a
            Santa Clara camera contributed anything.
          </p>
          <p>
            Counts on this site may differ slightly from figures published
            elsewhere, because exact duplicates are removed here and because
            different reports may set month boundaries in different time zones.
            Where a number matters, download the Parquet files and check it.
          </p>
        </div>
      </Section>

      <Section id="disclaimer" title="Disclaimer" sunk>
        <div className="prose">
          <p>
            This is an unofficial republication of public records by a member of
            the public. It is not affiliated with, endorsed by, or produced in
            cooperation with the City of Santa Clara, the Santa Clara Police
            Department, Flock Safety, Flock Group Inc., or Insight Public Sector.
          </p>
          <p>
            Organization names appear as recorded in the source data. Their
            presence in the log is a statement about a database entry, not an
            accusation about any agency or person. Nothing here is legal advice.
          </p>
        </div>
      </Section>
    </>
  );
}

function Caveat({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card">
      <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>{title}</h3>
      <p style={{ fontSize: '0.9rem', color: 'var(--ink-2)' }}>{children}</p>
    </div>
  );
}
