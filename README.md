# Santa Clara PD Flock ALPR Transparency Site

Static website publishing the contents of California Public Records Act request
#26-235 to the Santa Clara (CA) Police Department, released 2026-08-05:

- ~14.9M Flock Safety network audit records (Jan 2022 - Feb 2026) showing
  searches by outside agencies against Santa Clara PD's ALPR camera network
- 6 City of Santa Clara purchase orders for Flock services ($367,700 total)
- The original (inactive) December 2020 Flock Group Inc. agreement
- A community-mapped camera location layer (OpenStreetMap via DeFlock, not part
  of the records release)

## Architecture

Fully static, no backend. Vite + React + TypeScript, HashRouter, relative base
path. Audit records ship as quarter-partitioned zstd Parquet (17 files, 163MB,
largest 17.4MB) queried in-browser by DuckDB-WASM over HTTP range requests;
dashboards read small pre-aggregated JSON files. All assets are bundled; the
only external requests at runtime are OpenStreetMap map tiles on the Cameras
page.

```
public/
  data/aggregates/   pre-computed rollups (monthly, agencies, heatmap, ...)
  data/parquet/      searches_YYYYqN.parquet + manifest.json
  data/invoices.json line items extracted from the purchase orders
  data/documents.json, data/cameras.json
  docs/              original PDFs + extracted text
  duckdb-ext/        locally mirrored DuckDB parquet extension
src/                 app code (pages, components, charts, lib)
scripts/             Node refresh scripts run by the GitHub Actions workflows
pipeline/            one-off Python build scripts for public/data/ (see below)
```

## Development

```
npm ci
npm run dev    # local dev server
npm run build  # tsc + vite build -> dist/
```

## Regenerating data

The `pipeline/` scripts (not required for the site to run) rebuild
`public/data/` from the raw records. The raw CPRA release is ~3.4GB of CSVs and
is not in this repo; `build_data.py` reads it from `$AUDIT_CSV_DIR`, its first
argument, or the repo's parent directory, in that order.

- `build_data.py` parses the 50 monthly audit CSVs (note: each record spans two
  physical lines) into Parquet + aggregate JSON, with verification. It writes a
  run summary to `pipeline/build_report.json`; the committed copy is from the
  2026-08-05 build.
- `extract_cameras.py` subsets the Santa Clara area from FlockHopper's
  `cameras-us.json.gz` (one-time historical snapshot, superseded by the
  automated refresh below).
- `fetch_cameras.mjs` re-fetches `data/cameras.json` live from OSM via
  Overpass; see below.

### Automated camera data refresh

`data/cameras.json` also refreshes itself, independent of the pipeline above.
`.github/workflows/refresh-cameras.yml` runs `scripts/fetch_cameras.mjs`
(zero-dependency Node script) daily at 09:17 UTC via `on: schedule`, and on demand via `workflow_dispatch`
from the Actions tab. It queries Overpass for ALPR-tagged nodes/ways in the
same bbox as `extract_cameras.py`, falling back across three Overpass mirrors,
and refuses to write a result with fewer than 100 cameras - a sanity floor
against a broken or empty fetch clobbering good data. If the fetch changes
`data/cameras.json`, the workflow commits it and triggers `deploy.yml` (a
bot push doesn't fire `on: push`, so it calls `gh workflow run deploy.yml`
directly).

### Transparency portal refresh

`data/access.json` holds a parse of Flock Safety's public transparency
portal page for Santa Clara PD (server-rendered HTML, no JSON API). The
portal sits behind Cloudflare bot management, so a plain fetch is often
blocked with a 403 "Just a moment..." challenge - there is no reliable way
to bypass this from CI.

- `scripts/fetch_access.mjs` (zero-dependency Node script) parses the page via
  its stable `data-tp-*` attributes, with no DOM library.
- Manual refresh: since the live fetch can't get past Cloudflare, save the
  rendered page from a real browser session (after the challenge clears) as
  an HTML file, then run
  `node scripts/fetch_access.mjs --input <saved.html> public/data/access.json`.
- `.github/workflows/refresh-access.yml` still attempts a live fetch daily
  at 09:47 UTC via `on: schedule`, and on demand via `workflow_dispatch`. If
  the fetch is blocked, `fetch_access.mjs` exits with code 78 and the
  workflow treats that as a clean no-op rather than a failure. If it does
  get through and the data changed, the workflow commits `data/access.json`
  and triggers `deploy.yml`, same as the camera refresh above.

## Deploying to GitHub Pages

1. Create a GitHub repository and push this directory as its root (`main`
   branch) - it is already initialized as one.
2. In repo Settings -> Pages, set Source to "GitHub Actions".
3. The included workflow (`.github/workflows/deploy.yml`) builds and deploys on
   every push to `main`.

Requires GitHub Pages' HTTP range request support (present) for the explorer.

## Provenance and licenses

Source code is MIT (see `LICENSE`). The published records and third-party data
under `public/` are not - see `NOTICE` for the per-directory terms.

- Audit records and documents: public records, republished as released
  (exact-duplicate rows preserved; see the site's About page for caveats).
- Camera locations: (c) OpenStreetMap contributors, ODbL 1.0, collected via
  DeFlock (https://deflock.me), extracted from
  https://github.com/FoggedLens/deflockhopper_maps (MIT).
- Map tiles: OpenStreetMap Foundation tile servers,
  https://www.openstreetmap.org/copyright
- This is an unofficial republication; not affiliated with the City of Santa
  Clara.
