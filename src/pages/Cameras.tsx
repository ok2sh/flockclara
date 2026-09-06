// Cameras: the community-mapped OpenStreetMap camera layer around Santa
// Clara. Not part of the records release, and labeled that way throughout.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Section } from '../components/Section';
import { Resolve } from '../components/DataState';
import { StatTile } from '../components/StatTile';
import { Combobox, type ComboOption } from '../components/Combobox';
import { SortableTh, compareBy, type SortDir } from '../components/SortableTh';
import { CameraMap } from '../components/CameraMap';
import { PATHS, assetUrl, useJson } from '../lib/data';
import { UNTAGGED, dirLabel, dirValue, isFlock } from '../lib/cameras';
import { fetchLive, host, type LiveResult } from '../lib/overpass';
import { downloadText, longDate, num, pct, toCsv } from '../lib/format';
import type { Camera, Cameras as CamerasData } from '../types';
import '../styles/cameras.css';

const PAGE = 100;

type Col = 'km' | 'operator' | 'brand' | 'direction' | 'mount' | 'zone' | 'edited';

const GETTERS: Record<Col, (c: Camera) => string | number | null> = {
  km: (c) => c.km_from_city_center,
  operator: (c) => c.operator,
  brand: (c) => c.brand,
  direction: (c) => dirValue(c),
  mount: (c) => c.mount,
  zone: (c) => c.zone,
  edited: (c) => c.osm_timestamp,
};

export function Cameras() {
  const state = useJson<CamerasData>(PATHS.cameras);

  return (
    <>
      <Section
        kicker="Community map / not from the records release"
        title="Cameras"
        intro="Volunteers map automated license plate readers they find on the street into OpenStreetMap. This page plots the cameras that volunteers have recorded around Santa Clara. It is a separate dataset from the records the city released, and it says nothing about which cameras Santa Clara Police Department operates."
      >
        <Resolve state={state} label="the camera map" height={520}>
          {(d) => <CamerasContent data={d} />}
        </Resolve>
      </Section>

      <Section id="layer" title="What this layer is, and is not" sunk>
        <div className="grid grid--2">
          <div className="prose">
            <p>
              The dots come from OpenStreetMap, collected largely through the{' '}
              <a href="https://deflock.me" target="_blank" rel="noreferrer">
                DeFlock
              </a>{' '}
              project, and were extracted from the{' '}
              <a
                href="https://github.com/FoggedLens/deflockhopper_maps"
                target="_blank"
                rel="noreferrer"
              >
                FlockHopper repository
              </a>{' '}
              at its commit of {longDate('2026-07-23')}. None of it is part of the
              CPRA 26-235 release.
            </p>
            <p>
              <strong>Coverage is incomplete and volunteer-maintained.</strong> A
              camera is on this map because somebody walked or drove past it and
              added it. An empty street is not evidence that no camera is there,
              and a dot is only as current as the last person to edit it.
            </p>
          </div>
          <div className="prose">
            <p>
              <strong>
                No camera in this dataset carries a Santa Clara Police Department
                operator tag.
              </strong>{' '}
              Most have no operator tag at all, and the ones that do are mostly
              tagged to other cities' departments. Nothing here identifies which
              cameras the city of Santa Clara owns or reads from.
            </p>
            <p>
              The released records contain no camera coordinates and no camera
              count. The nearest thing to a count is procurement: the city's
              purchase order of {longDate('2025-02-25')} covers 17 Falcon cameras.
              See <Link to="/spending">Spending</Link>.
            </p>
            <p>
              Refreshing live queries the Overpass API at overpass.deflock.org
              from your browser, falling back to public mirrors if it does not
              answer. The snapshot above is what loads by default, and a reload
              returns to it.
            </p>
          </div>
        </div>
      </Section>

      <Section id="camera-attribution" title="Attribution">
        <div className="stack">
          <dl className="dl">
            <dt>Extract</dt>
            <dd>
              <a
                href="https://github.com/FoggedLens/deflockhopper_maps"
                target="_blank"
                rel="noreferrer"
              >
                FlockHopper (FoggedLens/deflockhopper_maps)
              </a>
              , MIT licensed
              {state.data?.source?.commit ? (
                <>
                  , commit{' '}
                  <span className="mono">{state.data.source.commit.slice(0, 10)}</span>{' '}
                  of {longDate(state.data.source.commit_date)}
                </>
              ) : null}
            </dd>
            <dt>Collection</dt>
            <dd>
              <a href="https://deflock.me" target="_blank" rel="noreferrer">
                DeFlock
              </a>
              , the crowd-mapping project behind most of these records
            </dd>
            <dt>Camera data</dt>
            <dd>(c) OpenStreetMap contributors, ODbL 1.0</dd>
            <dt>Basemap tiles</dt>
            <dd>
              (c){' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                OpenStreetMap
              </a>{' '}
              contributors
            </dd>
            <dt>Live refresh</dt>
            <dd>
              Overpass API, queried from your browser only when you press
              refresh: overpass.deflock.org, then public mirrors
            </dd>
            {Number.isFinite(state.data?.source?.us_total) ? (
              <>
                <dt>US total</dt>
                <dd>
                  {num(state.data?.source?.us_total)} cameras mapped nationwide
                  in the same extract
                </dd>
              </>
            ) : null}
          </dl>
          <p className="note">
            This site is not affiliated with DeFlock, FlockHopper, the
            OpenStreetMap Foundation or Flock Safety.
          </p>
        </div>
      </Section>
    </>
  );
}

function CamerasContent({ data }: { data: CamerasData }) {
  const [live, setLive] = useState<LiveResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const all = live ? live.cameras : data.cameras;

  const [operator, setOperator] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [cityOnly, setCityOnly] = useState(false);
  const [wedges, setWedges] = useState(true);
  const [sortKey, setSortKey] = useState<Col>('km');
  const [dir, setDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);

  const operatorOptions = useMemo(() => tally(all, (c) => c.operator), [all]);
  const brandOptions = useMemo(() => tally(all, (c) => c.brand), [all]);

  const filtered = useMemo(
    () =>
      all.filter((c) => {
        if (cityOnly && !c.in_city_bbox) return false;
        if (operator && (c.operator ?? UNTAGGED) !== operator) return false;
        if (brand && (c.brand ?? UNTAGGED) !== brand) return false;
        return true;
      }),
    [all, cityOnly, operator, brand],
  );

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareBy(a, b, GETTERS[sortKey], dir)),
    [filtered, sortKey, dir],
  );

  const inCity = useMemo(() => all.filter((c) => c.in_city_bbox).length, [all]);
  const flockTagged = useMemo(() => all.filter(isFlock).length, [all]);
  const visibleFlock = useMemo(() => filtered.filter(isFlock).length, [filtered]);
  const maxKm = useMemo(
    () => Math.max(...all.map((c) => c.km_from_city_center)),
    [all],
  );

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const clamped = Math.min(page, pages - 1);
  const slice = sorted.slice(clamped * PAGE, clamped * PAGE + PAGE);
  const filtersOn = Boolean(operator || brand || cityOnly);

  function onSort(col: Col) {
    if (col === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(col);
      setDir('asc');
    }
    setPage(0);
  }

  function reset() {
    setOperator(null);
    setBrand(null);
    setCityOnly(false);
    setPage(0);
  }

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      setLive(await fetchLive(data.bbox, data.city_center, data.city_bbox));
      setPage(0);
    } catch (err) {
      setRefreshError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  function showSnapshot() {
    setLive(null);
    setRefreshError(null);
    setPage(0);
  }

  function exportCsv() {
    downloadText(
      'santa-clara-area-osm-cameras.csv',
      toCsv(
        [
          'osm_type',
          'osm_id',
          'lat',
          'lon',
          'km_from_city_center',
          'in_city_bbox',
          'operator',
          'brand',
          'direction',
          'mount',
          'zone',
          'osm_timestamp',
        ],
        sorted.map((c) => [
          c.osm_type,
          c.osm_id,
          c.lat,
          c.lon,
          c.km_from_city_center,
          c.in_city_bbox,
          c.operator,
          c.brand,
          dirLabel(c),
          c.mount,
          c.zone,
          c.osm_timestamp,
        ]),
      ),
    );
  }

  return (
    <div className="stack stack--lg">
      <div className="grid grid--4">
        <StatTile
          label="Mapped in this area"
          value={num(all.length)}
          note={`Within ${Math.round(maxKm)} km of the city center`}
        />
        <StatTile
          label="Within city bounds"
          value={num(inCity)}
          note="Approximate City of Santa Clara bounding box"
        />
        <StatTile
          label="Tagged Flock Safety"
          value={num(flockTagged)}
          note={`${pct(flockTagged, all.length)} of mapped cameras`}
        />
        {live ? (
          <StatTile
            label="Live from OpenStreetMap"
            value={clockTime(live.fetchedAt)}
            note={`Fetched from ${host(live.endpoint)}`}
          />
        ) : (
          <StatTile
            label="Data as of"
            value={longDate(data.source?.commit_date)}
            note="FlockHopper extract of OpenStreetMap"
          />
        )}
      </div>

      <div className="spread">
        <div className="row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? 'Querying OpenStreetMap...' : 'Refresh live from OpenStreetMap'}
          </button>
          {live ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={showSnapshot}>
              Back to the snapshot
            </button>
          ) : null}
        </div>
        <p
          className={refreshError ? 'note note--error' : 'note'}
          role="status"
          aria-live="polite"
        >
          {refreshing
            ? 'Querying the Overpass API for current OpenStreetMap records.'
            : refreshError
              ? `Live refresh failed, still showing the snapshot. ${refreshError}.`
              : live
                ? `Live: ${num(all.length)} cameras from ${host(live.endpoint)} at ${clockTime(live.fetchedAt)}. Reload to return to the snapshot.`
                : `Showing the snapshot of ${longDate(data.source?.commit_date)}. Refresh to query OpenStreetMap for current records.`}
        </p>
      </div>

      <div className="stack">
        <div className="filters">
          <div style={{ flex: '1 1 18rem', minWidth: 0 }}>
            <Combobox
              label="Operator"
              options={operatorOptions}
              value={operator}
              onChange={(v) => {
                setOperator(v);
                setPage(0);
              }}
              allLabel="All operators"
              noun="operator"
              placeholder="All operators"
            />
          </div>
          <div style={{ flex: '1 1 12rem', minWidth: 0 }}>
            <Combobox
              label="Brand"
              options={brandOptions}
              value={brand}
              onChange={(v) => {
                setBrand(v);
                setPage(0);
              }}
              allLabel="All brands"
              noun="brand"
              placeholder="All brands"
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={cityOnly}
              onChange={(e) => {
                setCityOnly(e.target.checked);
                setPage(0);
              }}
            />
            City area only
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={wedges}
              onChange={(e) => setWedges(e.target.checked)}
            />
            Show direction wedges
          </label>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!filtersOn}
            onClick={reset}
          >
            Clear filters
          </button>
        </div>

        <div className="spread">
          <p className="note" aria-live="polite">
            Showing {num(filtered.length)} of {num(all.length)} mapped cameras
            {operator ? `, operator ${operator}` : ''}
            {brand ? `, brand ${brand}` : ''}
            {cityOnly ? ', city area only' : ''}. {num(visibleFlock)} of them are
            tagged Flock Safety.
          </p>
          <div className="chart__legend">
            <span>
              <span className="swatch" style={{ background: 'var(--series-1)' }} />
              Flock Safety
            </span>
            <span>
              <span className="swatch" style={{ background: 'var(--series-2)' }} />
              Other or untagged brand
            </span>
            <span>
              <WedgeGlyph />
              Direction the camera faces
            </span>
          </div>
        </div>

        <CameraMap
          cameras={filtered}
          cityBbox={data.city_bbox}
          center={data.city_center}
          showWedges={wedges}
        />

        <p className="note">
          Map tiles load from openstreetmap.org; every other file on this site is
          served from this site. Click a dot for its OpenStreetMap tags, and click
          the map before scrolling to zoom with the wheel. Wedges show the
          direction a camera is tagged as facing, not its actual range.
        </p>
      </div>

      <div className="stack stack--sm">
        <div className="spread">
          <h3>Every mapped camera</h3>
          <button type="button" className="btn btn--ghost btn--sm" onClick={exportCsv}>
            Download this list as CSV
          </button>
        </div>

        <div className="card card--flush">
          <div className="table-scroll">
            <table className="data">
              <caption className="visually-hidden">
                Community-mapped license plate reader cameras around Santa Clara
              </caption>
              <thead>
                <tr>
                  <SortableTh
                    col="km"
                    label="Distance (km)"
                    numeric
                    sortKey={sortKey}
                    dir={dir}
                    onSort={onSort}
                  />
                  <SortableTh
                    col="operator"
                    label="Operator"
                    sortKey={sortKey}
                    dir={dir}
                    onSort={onSort}
                  />
                  <SortableTh
                    col="brand"
                    label="Brand"
                    sortKey={sortKey}
                    dir={dir}
                    onSort={onSort}
                  />
                  <SortableTh
                    col="direction"
                    label="Direction"
                    sortKey={sortKey}
                    dir={dir}
                    onSort={onSort}
                  />
                  <SortableTh
                    col="mount"
                    label="Mount"
                    sortKey={sortKey}
                    dir={dir}
                    onSort={onSort}
                  />
                  <SortableTh
                    col="zone"
                    label="Zone"
                    sortKey={sortKey}
                    dir={dir}
                    onSort={onSort}
                  />
                  <SortableTh
                    col="edited"
                    label="Last edited"
                    sortKey={sortKey}
                    dir={dir}
                    onSort={onSort}
                  />
                  <th scope="col">OpenStreetMap</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((c) => (
                  <tr key={`${c.osm_type}-${c.osm_id}`}>
                    <td className="n">{c.km_from_city_center.toFixed(2)}</td>
                    <td>{c.operator ?? 'not tagged'}</td>
                    <td>{c.brand ?? 'not tagged'}</td>
                    <td className="mono">{dirLabel(c) || '-'}</td>
                    <td>{c.mount ?? '-'}</td>
                    <td>{c.zone ?? '-'}</td>
                    <td className="mono">
                      {c.osm_timestamp ? c.osm_timestamp.slice(0, 10) : '-'}
                    </td>
                    <td className="mono">
                      <a
                        href={`https://www.openstreetmap.org/${c.osm_type}/${c.osm_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c.osm_type}/{c.osm_id}
                      </a>
                    </td>
                  </tr>
                ))}
                {!slice.length ? (
                  <tr>
                    <td colSpan={8}>No mapped camera matches these filters.</td>
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
          Distance is a straight line from the city center at{' '}
          {data.city_center.lat}, {data.city_center.lon}. Last edited is empty for
          every row: this extract does not carry OpenStreetMap edit timestamps.
          The same is true of camera model, reference number and start date, so
          those columns are not shown. Download the source file at{' '}
          <a href={assetUrl(PATHS.cameras)} download>
            cameras.json
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function clockTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Legend mark for the wedge: the cone as drawn, dot at the camera. */
function WedgeGlyph() {
  return (
    <svg className="wedge-glyph" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <path
        d="M7 12.5 L2.4 2.6 A11 11 0 0 1 11.6 2.6 Z"
        fill="var(--series-1)"
        fillOpacity="0.38"
        stroke="var(--series-1)"
        strokeOpacity="0.7"
        strokeWidth="1"
      />
      <circle cx="7" cy="12.5" r="1.9" fill="var(--series-1)" />
    </svg>
  );
}

/** Distinct values with counts, most common first, nulls as "(untagged)". */
function tally(rows: Camera[], get: (c: Camera) => string | null): ComboOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = get(r) ?? UNTAGGED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, n]) => ({ value, meta: num(n) }));
}
