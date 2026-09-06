// Runtime fetch of the published datasets. Everything resolves against
// document.baseURI so the site works under any deploy path.

import { useEffect, useState } from 'react';
import type { Access } from '../types';

export function assetUrl(rel: string): string {
  return new URL(rel, document.baseURI).href;
}

const cache = new Map<string, Promise<unknown>>();

export function loadJson<T>(rel: string): Promise<T> {
  let p = cache.get(rel) as Promise<T> | undefined;
  if (!p) {
    p = fetch(assetUrl(rel), { cache: 'force-cache' }).then(async (r) => {
      if (!r.ok) throw new Error(`${rel} returned HTTP ${r.status}`);
      return (await r.json()) as T;
    });
    cache.set(rel, p as Promise<unknown>);
    p.catch(() => cache.delete(rel));
  }
  return p;
}

export interface Async<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export function useJson<T>(rel: string): Async<T> {
  const [state, setState] = useState<Async<T>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let live = true;
    setState({ data: null, error: null, loading: true });
    loadJson<T>(rel).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error: Error) => live && setState({ data: null, error, loading: false }),
    );
    return () => {
      live = false;
    };
  }, [rel]);

  return state;
}

/** Fetch plain text, used for the extracted document text views. */
export function useText(rel: string | null): Async<string> {
  const [state, setState] = useState<Async<string>>({
    data: null,
    error: null,
    loading: rel !== null,
  });

  useEffect(() => {
    if (!rel) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let live = true;
    setState({ data: null, error: null, loading: true });
    fetch(assetUrl(rel))
      .then(async (r) => {
        if (!r.ok) throw new Error(`${rel} returned HTTP ${r.status}`);
        return r.text();
      })
      .then(
        (data) => live && setState({ data, error: null, loading: false }),
        (error: Error) => live && setState({ data: null, error, loading: false }),
      );
    return () => {
      live = false;
    };
  }, [rel]);

  return state;
}

export const PATHS = {
  summary: 'data/aggregates/summary.json',
  monthly: 'data/aggregates/monthly.json',
  agencies: 'data/aggregates/agencies.json',
  agencyMonthly: 'data/aggregates/agency_monthly.json',
  searchTypes: 'data/aggregates/search_types.json',
  heatmap: 'data/aggregates/heatmap.json',
  cameras: 'data/cameras.json',
  invoices: 'data/invoices.json',
  documents: 'data/documents.json',
  access: 'data/access.json',
  manifest: 'data/parquet/manifest.json',
} as const;

/**
 * Transparency-portal snapshot. Read by the Access page and by the agency
 * detail badge, so the type binding lives here rather than in both callers.
 */
export function useAccess(): Async<Access> {
  return useJson<Access>(PATHS.access);
}
