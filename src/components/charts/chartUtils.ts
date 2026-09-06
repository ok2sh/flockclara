// Shared scale, tick and geometry helpers for the inline-SVG charts.

export interface Box {
  w: number;
  h: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function plot(box: Box) {
  return {
    x0: box.left,
    y0: box.top,
    x1: box.w - box.right,
    y1: box.h - box.bottom,
    pw: box.w - box.left - box.right,
    ph: box.h - box.top - box.bottom,
  };
}

/** Round tick values at or above max, in 1 / 2 / 2.5 / 5 steps. */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(10)));
  if (out[out.length - 1] < max) out.push(Number((out[out.length - 1] + step).toFixed(10)));
  return out;
}

/** Straight-segment path through points. Marks stay honest: no smoothing. */
export function linePath(pts: [number, number][]): string {
  if (!pts.length) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
}

export function areaPath(pts: [number, number][], baseY: number): string {
  if (!pts.length) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  return (
    `M${first[0].toFixed(2)} ${baseY.toFixed(2)} ` +
    pts.map((p) => `L${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ') +
    ` L${last[0].toFixed(2)} ${baseY.toFixed(2)} Z`
  );
}

/**
 * Year gutters: the site-wide structural device on every time axis.
 * Returns one entry per calendar year present in the "YYYY-MM" list.
 */
export interface YearBand {
  year: string;
  startIndex: number;
  endIndex: number;
}

export function yearBands(months: string[]): YearBand[] {
  const out: YearBand[] = [];
  months.forEach((m, i) => {
    const y = m.slice(0, 4);
    const last = out[out.length - 1];
    if (last && last.year === y) last.endIndex = i;
    else out.push({ year: y, startIndex: i, endIndex: i });
  });
  return out;
}

/** Bar-cap radius that never exceeds half the bar's own length. */
export function capRadius(length: number, max = 4): number {
  return Math.max(0, Math.min(max, length / 2));
}

/**
 * Rounded on the data end, square at the baseline.
 * dir 'up' = column growing up, 'right' = bar growing right.
 */
export function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  dir: 'up' | 'right',
): string {
  if (w <= 0 || h <= 0) return '';
  if (dir === 'up') {
    const r = capRadius(h);
    return (
      `M${x} ${y + h} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} ` +
      `L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${y + h} Z`
    );
  }
  const r = capRadius(w);
  return (
    `M${x} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} ` +
    `L${x + w} ${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} L${x} ${y + h} Z`
  );
}

/** Index of the sequential ramp step for a 0..1 value. */
const SEQ_STEPS = [100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700];

export function seqVar(t: number): string {
  const i = Math.min(SEQ_STEPS.length - 1, Math.max(0, Math.round(t * (SEQ_STEPS.length - 1))));
  return `var(--seq-${SEQ_STEPS[i]})`;
}

/** Ink that clears contrast against a sequential fill of intensity t. */
export function seqInk(t: number): string {
  return t > 0.55 ? '#ffffff' : 'var(--ink)';
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
