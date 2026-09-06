#!/usr/bin/env python3
"""Build parquet + aggregate JSON from Flock Safety network audit CSV exports.

Input : *-Network-Audit.csv (one per month) from the raw CPRA release. Those
        files are ~3.4GB and are not in this repo; point AUDIT_CSV_DIR at the
        directory holding them, or pass it as the first argument. Defaults to
        the repo's parent directory, where the release was unpacked.
Output: public/data/parquet/*.parquet + manifest.json
        public/data/aggregates/*.json

Exact duplicates are removed. The release contains rows that are byte
identical across all six columns; they are a logging artifact concentrated in
two windows (Aug 2022-Jan 2023, where Sep-Dec 2022 sit at a clean 2.0x, and
Feb 2025, where the groups are exactly 5). Collapsing each identical group to a
single row is the only transformation applied, and both counts are published.

Idempotent: output directories are wiped and recreated on every run.
"""

import glob
import json
import os
import shutil
import sys
import time
from datetime import date

import duckdb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_DIR = os.path.abspath(
    sys.argv[1] if len(sys.argv) > 1
    else os.environ.get("AUDIT_CSV_DIR", os.path.dirname(ROOT))
)
PARQ_DIR = os.path.join(ROOT, "public", "data", "parquet")
AGG_DIR = os.path.join(ROOT, "public", "data", "aggregates")

# Flock timestamps: "01/31/2022, 11:26:24 PM UTC"
FMT = "%m/%d/%Y, %I:%M:%S %p UTC"
# Whitespace set for trim(): space, tab, CR, LF.
WS = "chr(32)||chr(9)||chr(13)||chr(10)"
MAX_BYTES = 95 * 1024 * 1024
TZ = "America/Los_Angeles"

report = {}

SELECT_COLS = ("org, networks_searched, timeframe_start, timeframe_end, "
               "search_time, search_type")


def log(msg):
    print("[%7.1fs] %s" % (time.time() - T0, msg), flush=True)


def sql_str(s):
    return "'" + s.replace("'", "''") + "'"


def iso(ts):
    return ts.isoformat() if ts is not None else None


T0 = time.time()


# ---------------------------------------------------------------- input files

files = sorted(glob.glob(os.path.join(CSV_DIR, "*-Network-Audit.csv")))
if not files:
    sys.exit("no *-Network-Audit.csv files found in %s" % CSV_DIR)
log("found %d csv files" % len(files))

# Physical-line sanity check: each logical record spans 2 lines (embedded
# newline inside the quoted Time Frame field) plus one header line per file.
phys = 0
for f in files:
    with open(f, "rb") as fh:
        while True:
            chunk = fh.read(1 << 23)
            if not chunk:
                break
            phys += chunk.count(b"\n")
log("physical lines: %d" % phys)
report["physical_lines"] = phys
report["expected_records"] = (phys - len(files)) // 2


# ------------------------------------------------------------------- load csv

con = duckdb.connect()
con.execute("INSTALL icu; LOAD icu;")
con.execute("SET temp_directory=%s" % sql_str(os.path.join(ROOT, "pipeline", ".duckdb_tmp")))
con.execute("SET preserve_insertion_order=false")

file_list = "[" + ", ".join(sql_str(f) for f in files) + "]"
log("reading csv ...")
con.execute(
    """
    CREATE TABLE raw AS SELECT * FROM read_csv(%s,
        header=false, skip=1, delim=',', quote='"', escape='"',
        columns={'org':'VARCHAR','networks_searched':'VARCHAR','timeframe':'VARCHAR',
                 'search_time_raw':'VARCHAR','search_type':'VARCHAR'})
    """
    % file_list
)
raw_rows = con.execute("SELECT count(*) FROM raw").fetchone()[0]
log("raw rows: %d" % raw_rows)
report["raw_rows"] = raw_rows

log("normalizing ...")
con.execute(
    """
    CREATE TABLE searches AS SELECT
        coalesce(nullif(trim(org, {ws}), ''), '(unknown)')                       AS org,
        try_cast(trim(networks_searched, {ws}) AS BIGINT)                        AS networks_searched,
        try_strptime(trim(split_part(timeframe, chr(10), 1), {ws}), '{fmt}')     AS timeframe_start,
        try_strptime(trim(split_part(timeframe, chr(10), 2), {ws}), '{fmt}')     AS timeframe_end,
        try_strptime(trim(search_time_raw, {ws}), '{fmt}')                       AS search_time,
        nullif(trim(search_type, {ws}), '')                                      AS search_type
    FROM raw
    """.format(ws=WS, fmt=FMT)
)
con.execute("DROP TABLE raw")

nulls = con.execute(
    """
    SELECT count(*) FILTER (WHERE search_time IS NULL),
           count(*) FILTER (WHERE timeframe_start IS NULL),
           count(*) FILTER (WHERE timeframe_end IS NULL),
           count(*) FILTER (WHERE networks_searched IS NULL),
           count(*) FILTER (WHERE search_type IS NULL),
           count(*) FILTER (WHERE org = '(unknown)')
    FROM searches
    """
).fetchone()
report["null_search_time"] = nulls[0]
report["null_timeframe_start"] = nulls[1]
report["null_timeframe_end"] = nulls[2]
report["null_networks_searched"] = nulls[3]
report["null_search_type"] = nulls[4]
report["unknown_org_rows"] = nulls[5]
log("null parses: search_time=%d tf_start=%d tf_end=%d networks=%d type=%d unknown_org=%d" % nulls)

parsed_all = raw_rows - nulls[0]
report["parsed_rows"] = parsed_all

# ------------------------------------------------------------------- dedupe
# Collapse rows that are identical across every published column. Search time
# has one-second resolution, so a genuine collision is possible in principle;
# it is not what this removes. The duplicates are systemic (a uniform ~2.0x
# across unrelated agencies for five straight months, and groups of exactly 5
# in Feb 2025), and deduplicating restores a continuous monthly series.
log("deduplicating ...")
con.execute(
    "CREATE TABLE searches_dedup AS SELECT DISTINCT %s FROM searches" % SELECT_COLS
)
con.execute("DROP TABLE searches")
con.execute("ALTER TABLE searches_dedup RENAME TO searches")

released_rows = raw_rows
distinct_rows = con.execute("SELECT count(*) FROM searches").fetchone()[0]
duplicate_rows = released_rows - distinct_rows
null_time_rows = con.execute(
    "SELECT count(*) FROM searches WHERE search_time IS NULL"
).fetchone()[0]
parsed = distinct_rows - null_time_rows
report["released_rows"] = released_rows
report["distinct_rows"] = distinct_rows
report["duplicate_rows"] = duplicate_rows
log("released=%d distinct=%d removed=%d (%.2f%%)"
    % (released_rows, distinct_rows, duplicate_rows,
       100.0 * duplicate_rows / released_rows))


# ------------------------------------------------------------- output folders


for d in (PARQ_DIR, AGG_DIR):
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d)


# --------------------------------------------------------------- parquet write

# (org, search_time) drives row-group pruning; the rest only break ties so that
# reruns are byte-identical (many rows share org+search_time).
ORDER_BY = "org, search_time, search_type, networks_searched, timeframe_start, timeframe_end"


def write_parquet(name, where):
    path = os.path.join(PARQ_DIR, name)
    con.execute(
        "COPY (SELECT %s FROM searches WHERE %s ORDER BY %s) TO %s "
        "(FORMAT PARQUET, COMPRESSION ZSTD)" % (SELECT_COLS, where, ORDER_BY, sql_str(path))
    )
    n, lo, hi = con.execute(
        "SELECT count(*), min(search_time), max(search_time) FROM read_parquet(%s)" % sql_str(path)
    ).fetchone()
    return {"name": name, "rows": n, "min": iso(lo), "max": iso(hi),
            "bytes": os.path.getsize(path)}


quarters = con.execute(
    """
    SELECT year(search_time) AS y, quarter(search_time) AS q, count(*) AS n
    FROM searches WHERE search_time IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2
    """
).fetchall()

manifest_files = []
split_quarters = []
for y, q, _n in quarters:
    m0 = (q - 1) * 3 + 1
    where = "search_time >= TIMESTAMP '%04d-%02d-01' AND search_time < TIMESTAMP '%04d-%02d-01'" % (
        y, m0, y + (1 if q == 4 else 0), 1 if q == 4 else m0 + 3)
    ent = write_parquet("searches_%dq%d.parquet" % (y, q), where)
    if ent["bytes"] > MAX_BYTES:
        # Too big for GitHub Pages: replace the quarterly file with monthly ones.
        split_quarters.append("%dq%d" % (y, q))
        os.remove(os.path.join(PARQ_DIR, ent["name"]))
        for m in range(m0, m0 + 3):
            mw = "search_time >= TIMESTAMP '%04d-%02d-01' AND search_time < TIMESTAMP '%04d-%02d-01'" % (
                y, m, y + (1 if m == 12 else 0), 1 if m == 12 else m + 1)
            if con.execute("SELECT count(*) FROM searches WHERE %s" % mw).fetchone()[0] == 0:
                continue
            manifest_files.append(write_parquet("searches_%04dm%02d.parquet" % (y, m), mw))
    else:
        manifest_files.append(ent)
    log("wrote %s" % ent["name"])

report["split_quarters"] = split_quarters

if null_time_rows:
    p = os.path.join(PARQ_DIR, "searches_unparsed.parquet")
    con.execute(
        "COPY (SELECT %s FROM searches WHERE search_time IS NULL) TO %s "
        "(FORMAT PARQUET, COMPRESSION ZSTD)" % (SELECT_COLS, sql_str(p))
    )
    log("wrote searches_unparsed.parquet (%d rows)" % null_time_rows)

manifest_files.sort(key=lambda e: e["min"])
manifest = {
    "total_rows": sum(e["rows"] for e in manifest_files),
    "columns": ["org", "networks_searched", "timeframe_start", "timeframe_end",
                "search_time", "search_type"],
    "files": manifest_files,
}
with open(os.path.join(PARQ_DIR, "manifest.json"), "w") as fh:
    json.dump(manifest, fh, indent=1)
    fh.write("\n")

report["parquet_total_bytes"] = sum(e["bytes"] for e in manifest_files)
report["oversize_files"] = [e["name"] for e in manifest_files if e["bytes"] > MAX_BYTES]


# ---------------------------------------------------------------- aggregates

def dump(name, obj):
    path = os.path.join(AGG_DIR, name)
    with open(path, "w") as fh:
        json.dump(obj, fh, separators=(",", ":"), ensure_ascii=True)
    return path


# Full month axis over the observed range, zeros included.
months = [r[0] for r in con.execute(
    """
    WITH b AS (SELECT date_trunc('month', min(search_time)) a,
                      date_trunc('month', max(search_time)) z
               FROM searches WHERE search_time IS NOT NULL)
    SELECT strftime(unnest(generate_series(a, z, INTERVAL 1 MONTH)), '%Y-%m') FROM b
    """
).fetchall()]
midx = {m: i for i, m in enumerate(months)}

per_month = dict(
    (m, (s, o)) for m, s, o in con.execute(
        """
        SELECT strftime(search_time, '%Y-%m') m, count(*), count(DISTINCT org)
        FROM searches WHERE search_time IS NOT NULL GROUP BY 1
        """
    ).fetchall()
)
dump("monthly.json", {
    "months": months,
    "searches": [per_month.get(m, (0, 0))[0] for m in months],
    "distinct_orgs": [per_month.get(m, (0, 0))[1] for m in months],
})

agency_rows = con.execute(
    """
    SELECT org, count(*) n, min(search_time)::DATE, max(search_time)::DATE,
           count(DISTINCT date_trunc('month', search_time))
    FROM searches WHERE search_time IS NOT NULL GROUP BY 1 ORDER BY n DESC, org
    """
).fetchall()
dump("agencies.json", {"agencies": [
    {"org": o, "searches": n, "first": str(f), "last": str(l), "months_active": ma}
    for o, n, f, l, ma in agency_rows]})

series = dict((o, [0] * len(months)) for o, _n, _f, _l, _ma in agency_rows)
for o, m, n in con.execute(
    """
    SELECT org, strftime(search_time, '%Y-%m'), count(*)
    FROM searches WHERE search_time IS NOT NULL GROUP BY 1, 2
    """
).fetchall():
    series[o][midx[m]] = n
dump("agency_monthly.json", {"months": months, "series": series})

types = con.execute(
    """
    SELECT coalesce(search_type, '(unknown)') t, count(*) n
    FROM searches WHERE search_time IS NOT NULL GROUP BY 1 ORDER BY n DESC
    """
).fetchall()
dump("search_types.json", {"types": [{"type": t, "count": n} for t, n in types]})

grid = [[0] * 24 for _ in range(7)]
for d, h, n in con.execute(
    """
    SELECT isodow(loc), hour(loc), count(*) FROM (
        SELECT timezone('{tz}', timezone('UTC', search_time)) loc
        FROM searches WHERE search_time IS NOT NULL
    ) GROUP BY 1, 2
    """.format(tz=TZ)
).fetchall():
    grid[d - 1][h] = n
dump("heatmap.json", {
    "tz": TZ,
    "note": "search_time converted from UTC to local",
    "grid": grid,
})

s = con.execute(
    """
    SELECT count(*), count(DISTINCT org), min(search_time), max(search_time),
           round(avg(networks_searched), 2)
    FROM searches WHERE search_time IS NOT NULL
    """
).fetchone()
per_year = [{"year": y, "searches": n} for y, n in con.execute(
    "SELECT year(search_time), count(*) FROM searches WHERE search_time IS NOT NULL "
    "GROUP BY 1 ORDER BY 1"
).fetchall()]

dump("summary.json", {
    "total_searches": s[0],
    "released_rows": released_rows,
    "distinct_orgs": s[1],
    "first_search": iso(s[2]),
    "last_search": iso(s[3]),
    "months": len(months),
    "avg_networks_searched": float(s[4]),
    "duplicate_rows": duplicate_rows,
    "top_orgs": [{"org": o, "searches": n} for o, n, _f, _l, _ma in agency_rows[:25]],
    "per_year": per_year,
    "generated": date.today().isoformat(),
})

report["total_searches"] = s[0]
report["distinct_orgs"] = s[1]
report["min_search_time"] = iso(s[2])
report["max_search_time"] = iso(s[3])
report["avg_networks_searched"] = float(s[4])
report["search_types"] = types
report["per_year"] = per_year


# -------------------------------------------------------------- verification

v = {}
v["manifest_total_eq_sum"] = manifest["total_rows"] == sum(e["rows"] for e in manifest_files)
v["manifest_total_eq_table"] = manifest["total_rows"] == parsed
monthly = json.load(open(os.path.join(AGG_DIR, "monthly.json")))
v["monthly_sum_eq_total"] = sum(monthly["searches"]) == s[0]
v["line_math_eq_raw"] = report["expected_records"] == raw_rows
v["dedupe_left_no_duplicates"] = con.execute(
    "SELECT count(*) = count(DISTINCT (%s)) FROM searches" % SELECT_COLS
).fetchone()[0]
v["released_minus_removed_eq_published"] = (
    released_rows - duplicate_rows == distinct_rows)
# Every published parquet row must be unique across the whole set, not just
# within its own file.
v["parquet_globally_unique"] = con.execute(
    "SELECT count(*) = count(DISTINCT (%s)) FROM read_parquet(%s)"
    % (SELECT_COLS, sql_str(os.path.join(PARQ_DIR, "searches_*.parquet")))
).fetchone()[0]

# Spot-check: parse the January 2022 file on its own.
jan = [f for f in files if os.path.basename(f).startswith("1_1_2022-")]
if jan:
    jan_rows = con.execute(
        """
        SELECT count(*) FROM read_csv(%s, header=false, skip=1, delim=',', quote='"', escape='"',
            columns={'a':'VARCHAR','b':'VARCHAR','c':'VARCHAR','d':'VARCHAR','e':'VARCHAR'})
        """ % sql_str(jan[0])
    ).fetchone()[0]
    v["jan2022_file_rows"] = jan_rows
    v["jan2022_month_rows"] = per_month.get("2022-01", (0, 0))[0]

for name in sorted(os.listdir(AGG_DIR)) + ["../parquet/manifest.json"]:
    p = os.path.join(AGG_DIR, name)
    with open(p) as fh:
        json.load(fh)
v["json_valid"] = True

report["verification"] = v
report["files"] = manifest_files

print("\n===== REPORT =====")
print(json.dumps(report, indent=2))
with open(os.path.join(ROOT, "pipeline", "build_report.json"), "w") as fh:
    json.dump(report, fh, indent=2)
log("done")
