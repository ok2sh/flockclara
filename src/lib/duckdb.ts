// Browser-local query engine. DuckDB-WASM runs in a worker on the visitor's
// machine and reads the published Parquet files over HTTP range requests, so
// only the byte ranges a query actually touches are downloaded. The wasm and
// worker come from the installed package, never a CDN.

import * as duckdb from '@duckdb/duckdb-wasm';
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

import type { ParquetFile } from '../types';
import { utcStamp } from './format';

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
};

/** Parquet file names are taken from the manifest, but still checked before
 *  they are ever placed in SQL text. */
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;
let ready = false;
const registered = new Map<string, Promise<void>>();

/** True once the engine has finished booting, so callers can decide whether to
 *  show the one-off "starting up" message. */
export function isDbReady(): boolean {
  return ready;
}

async function boot(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(BUNDLES);
  // The shipped workers are classic IIFE scripts (they open with
  // `"use strict";var duckdb=(()=>{`), so no { type: 'module' } here.
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  await db.open({
    // castBigIntToDouble keeps COUNT(*) and BIGINT columns as plain JS numbers.
    query: { castBigIntToDouble: true },
    // These two together make DuckDB size each file with a HEAD + "Range: bytes=0-"
    // probe and then read it with 206 range requests. Leaving full reads allowed
    // makes DuckDB probe with "GET Range: bytes=0-0" instead, which several static
    // servers (Vite's dev server among them) answer with the entire file, after
    // which DuckDB abandons ranges and downloads all 163 MB. The cost is that a
    // host which cannot serve ranges at all now fails the query outright rather
    // than quietly pulling every file in full.
    filesystem: {
      reliableHeadRequests: true,
      allowFullHTTPReads: false,
      forceFullHTTPReads: false,
    },
  });
  ready = true;
  return db;
}

/** Singleton engine. Concurrent callers share one boot. */
export function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = boot().catch((err: unknown) => {
      dbPromise = null;
      registered.clear();
      throw err;
    });
  }
  return dbPromise;
}

/** DuckDB 1.4 does not statically link the parquet reader; it autoinstalls it
 *  from extensions.duckdb.org on first use. Point both the explicit-install and
 *  the autoload repositories at the copy published with this site, then load it
 *  up front so nothing can reach out to the network later. */
async function loadParquetExtension(conn: duckdb.AsyncDuckDBConnection): Promise<void> {
  const repo = new URL('duckdb-ext', document.baseURI).href;
  await conn.query(`SET custom_extension_repository = '${repo}'`);
  await conn.query(`SET autoinstall_extension_repository = '${repo}'`);
  await conn.query('INSTALL parquet');
  await conn.query('LOAD parquet');
}

/** Singleton connection. Views registered on it persist across queries. */
export function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connPromise) {
    connPromise = getDb()
      .then(async (db) => {
        const conn = await db.connect();
        await loadParquetExtension(conn);
        return conn;
      })
      .catch((err: unknown) => {
        connPromise = null;
        throw err;
      });
  }
  return connPromise;
}

/** Point DuckDB at each Parquet file by URL. Registering rather than fetching
 *  is what makes the engine issue range requests. Each name is registered at
 *  most once per session, even if two runs overlap. */
export async function registerFiles(names: string[]): Promise<void> {
  await Promise.all(
    names.map((name) => {
      if (!SAFE_NAME.test(name)) throw new Error(`Unexpected data file name: ${name}`);
      let p = registered.get(name);
      if (!p) {
        const url = new URL('data/parquet/' + name, document.baseURI).href;
        p = getDb().then((db) =>
          db.registerFileURL(name, url, duckdb.DuckDBDataProtocol.HTTP, false),
        );
        p.catch(() => registered.delete(name));
        registered.set(name, p);
      }
      return p;
    }),
  );
}

/** Expose exactly the passed files as the view `searches`. */
export async function createView(
  conn: duckdb.AsyncDuckDBConnection,
  names: string[],
): Promise<void> {
  if (names.length === 0) {
    throw new Error('The selected date range does not cover any data file.');
  }
  for (const name of names) {
    if (!SAFE_NAME.test(name)) throw new Error(`Unexpected data file name: ${name}`);
  }
  const list = names.map((n) => `'${n}'`).join(', ');
  await conn.query(`CREATE OR REPLACE VIEW searches AS SELECT * FROM read_parquet([${list}])`);
}

export type Row = Record<string, unknown>;

export interface QueryResult {
  columns: string[];
  rows: Row[];
}

type ArrowTable = Awaited<ReturnType<duckdb.AsyncDuckDBConnection['query']>>;

type Kind = 'stamp' | 'scalar';

function kindOf(typeName: string): Kind {
  // DataType.toString() is a literal template, so it survives minification.
  return typeName.startsWith('Timestamp') || typeName.startsWith('Date') ? 'stamp' : 'scalar';
}

/** apache-arrow 17 hands back timestamps as epoch milliseconds; dates come back
 *  as Date objects. Normalise both to "YYYY-MM-DD HH:MM:SS". */
function toStamp(v: unknown): string | null {
  let ms: number;
  if (v instanceof Date) ms = v.getTime();
  else if (typeof v === 'bigint') ms = Number(v);
  else if (typeof v === 'number') ms = v;
  else if (typeof v === 'string') return utcStamp(v);
  else return null;
  if (!Number.isFinite(ms)) return null;
  return utcStamp(new Date(ms).toISOString());
}

function cast(v: unknown, kind: Kind): unknown {
  if (v === null || v === undefined) return null;
  if (kind === 'stamp') return toStamp(v);
  if (typeof v === 'bigint') return Number(v);
  return v;
}

function shape(table: ArrowTable): QueryResult {
  const fields = table.schema.fields;
  const columns = fields.map((f) => f.name);
  const kinds = fields.map((f) => kindOf(String(f.type)));
  const rows: Row[] = [];
  for (const raw of table.toArray()) {
    const src = raw as unknown as Row;
    const row: Row = {};
    for (let i = 0; i < columns.length; i++) row[columns[i]] = cast(src[columns[i]], kinds[i]);
    rows.push(row);
  }
  return { columns, rows };
}

/** Run SQL and return plain JS row objects. Values supplied by the visitor must
 *  always travel as `params`, never inside `sql`. */
export async function runQuery(
  conn: duckdb.AsyncDuckDBConnection,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult> {
  if (params.length === 0) return shape(await conn.query(sql));
  const stmt = await conn.prepare(sql);
  try {
    return shape(await stmt.query(...params));
  } finally {
    await stmt.close();
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Serialise work on the shared connection so a view swap can never land
 *  between the two queries of another run. */
export function withConnection<T>(
  fn: (conn: duckdb.AsyncDuckDBConnection) => Promise<T>,
): Promise<T> {
  const next = queue.then(async () => fn(await getConnection()));
  queue = next.catch(() => undefined);
  return next;
}

function lowBound(s: string): string {
  return s.length <= 10 ? s + 'T00:00:00' : s;
}

function highBound(s: string): string {
  return s.length <= 10 ? s + 'T23:59:59' : s;
}

/** Files whose [min, max] intersects the requested range. Manifest timestamps
 *  are fixed-width ISO, so string comparison is chronological. */
export function overlappingFiles(
  files: ParquetFile[],
  startISO: string,
  endISO: string,
): ParquetFile[] {
  const start = lowBound(startISO);
  const end = highBound(endISO);
  return files.filter((f) => f.min <= end && f.max >= start);
}
