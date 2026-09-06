// Shared helpers for the community camera layer.

import type { Camera } from '../types';

/** Sentinel used by the filter comboboxes for a missing tag. */
export const UNTAGGED = '(untagged)';

/**
 * The brand string that drives the two map colors, the legend and the stat
 * tile. Matched exactly, so the one camera tagged plain "Flock" counts as
 * other rather than quietly inflating the Flock Safety figure.
 */
export const FLOCK = 'Flock Safety';

export function isFlock(c: Camera): boolean {
  return c.brand === FLOCK;
}

const POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

export function compass(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  return POINTS[Math.round(norm / 22.5) % 16];
}

/** Every bearing a camera is tagged with: direction plus any directions[]. */
export function bearings(c: Camera): number[] {
  const out: number[] = [];
  if (c.direction !== null && Number.isFinite(c.direction)) out.push(c.direction);
  for (const d of c.directions ?? []) {
    if (Number.isFinite(d) && !out.includes(d)) out.push(d);
  }
  return out;
}

/** "160 SSE" or "20 NNE, 200 SSW". Empty string when no direction is tagged. */
export function dirLabel(c: Camera): string {
  return bearings(c)
    .map((d) => `${Math.round(d)} ${compass(d)}`)
    .join(', ');
}

/** Sort key for the direction column: unsorted cameras fall to the end. */
export function dirValue(c: Camera): number | null {
  const b = bearings(c);
  return b.length ? b[0] : null;
}
