import { useMemo, useState } from 'react';
import { useMeasure } from '../../lib/useMeasure';
import { compact, monthLabel, num } from '../../lib/format';
import { areaPath, linePath, niceTicks, plot, yearBands } from './chartUtils';

export interface StripAnnotation {
  /** "YYYY-MM" */
  month: string;
  label: string;
}

interface Props {
  months: string[];
  values: number[];
  /** Singular noun for the tooltip, e.g. "searches". */
  unit: string;
  height?: number;
  color?: string;
  annotations?: StripAnnotation[];
  /** Hero runs wider and taller with a heavier year rule. */
  variant?: 'card' | 'hero';
  titleId?: string;
}

/**
 * Monthly trace with the site's year-gutter device: a hairline at every
 * January and the year set at the baseline, so the span reads at a glance.
 */
export function StripChart({
  months,
  values,
  unit,
  height = 240,
  color = 'var(--series-1)',
  annotations = [],
  variant = 'card',
  titleId,
}: Props) {
  const { ref, width } = useMeasure<HTMLDivElement>(760);
  const [hover, setHover] = useState<number | null>(null);

  const hero = variant === 'hero';
  // Annotated charts need headroom so the label clears the plot area.
  const topPad = annotations.length ? 26 : hero ? 26 : 14;
  const box = {
    w: Math.max(320, width),
    h: height,
    top: topPad,
    right: hero ? 8 : 12,
    bottom: 28,
    left: hero ? 52 : 48,
  };
  const p = plot(box);
  const n = months.length;

  const { pts, ticks, bands, max } = useMemo(() => {
    const mx = Math.max(1, ...values);
    const tk = niceTicks(mx, hero ? 4 : 3);
    const top = tk[tk.length - 1];
    const xs = (i: number) => p.x0 + (n <= 1 ? 0 : (i / (n - 1)) * p.pw);
    const ys = (v: number) => p.y1 - (v / top) * p.ph;
    return {
      pts: values.map((v, i) => [xs(i), ys(v)] as [number, number]),
      ticks: tk.map((t) => ({ v: t, y: ys(t) })),
      bands: yearBands(months),
      max: top,
    };
  }, [months, values, n, p.x0, p.pw, p.y1, p.ph, hero]);

  if (!n) return null;

  const xAt = (i: number) => p.x0 + (n <= 1 ? 0 : (i / (n - 1)) * p.pw);
  const active = hover !== null ? hover : null;
  const lastIdx = n - 1;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * box.w;
    const i = Math.round(((mx - p.x0) / p.pw) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  function onKey(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover((h) => {
        const base = h === null ? (e.key === 'ArrowRight' ? -1 : n) : h;
        return Math.min(n - 1, Math.max(0, base + (e.key === 'ArrowRight' ? 1 : -1)));
      });
    } else if (e.key === 'Home') {
      setHover(0);
    } else if (e.key === 'End') {
      setHover(n - 1);
    } else if (e.key === 'Escape') {
      setHover(null);
    }
  }

  const tipLeft = active !== null ? (xAt(active) / box.w) * 100 : 0;
  const tipFlip = tipLeft > 62;

  return (
    <div className="chart__body" ref={ref}>
      <svg
        viewBox={`0 0 ${box.w} ${box.h}`}
        width="100%"
        height={box.h}
        role="img"
        aria-labelledby={titleId}
        tabIndex={0}
        style={{ display: 'block', touchAction: 'pan-y' }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        <title>
          {unit} per month, {monthLabel(months[0])} to {monthLabel(months[n - 1])}
        </title>

        {/* value gridlines - solid hairlines, one step off the surface */}
        {ticks.map((t) => (
          <g key={t.v}>
            <line
              x1={p.x0}
              x2={p.x1}
              y1={t.y}
              y2={t.y}
              stroke="var(--rule)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={p.x0 - 8}
              y={t.y + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--ink-3)"
              fontFamily="var(--font-mono)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {compact(t.v)}
            </text>
          </g>
        ))}

        {/* year gutters */}
        {bands.map((b, i) => {
          const x = xAt(b.startIndex);
          const mid = (xAt(b.startIndex) + xAt(b.endIndex)) / 2;
          return (
            <g key={b.year}>
              {i > 0 ? (
                <line
                  x1={x}
                  x2={x}
                  y1={p.y0}
                  y2={p.y1}
                  stroke="var(--rule-strong)"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
              ) : null}
              <text
                x={mid}
                y={p.y1 + 18}
                textAnchor="middle"
                fontSize={hero ? 12 : 11}
                fontWeight={600}
                letterSpacing="0.1em"
                fill="var(--ink-3)"
                fontFamily="var(--font-mono)"
              >
                {b.year}
              </text>
            </g>
          );
        })}

        <line
          x1={p.x0}
          x2={p.x1}
          y1={p.y1}
          y2={p.y1}
          stroke="var(--axis)"
          strokeWidth={1}
          shapeRendering="crispEdges"
        />

        {/* annotations sit behind the trace */}
        {annotations.map((a) => {
          const i = months.indexOf(a.month);
          if (i < 0) return null;
          const x = xAt(i);
          const flip = x > box.w * 0.55;
          return (
            <g key={a.month}>
              <line
                x1={x}
                x2={x}
                y1={p.y0}
                y2={p.y1}
                stroke="var(--ink-3)"
                strokeWidth={1}
                strokeOpacity={0.65}
                shapeRendering="crispEdges"
              />
              <text
                x={flip ? x - 7 : x + 7}
                y={p.y0 - 9}
                textAnchor={flip ? 'end' : 'start'}
                fontSize={11}
                fill="var(--ink-2)"
                fontFamily="var(--font-mono)"
              >
                {a.label}
              </text>
            </g>
          );
        })}

        <path className="area" d={areaPath(pts, p.y1)} fill={color} fillOpacity={0.1} />
        <path
          className="trace"
          pathLength={1}
          d={linePath(pts)}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* endpoint marker plus the one direct label */}
        <circle
          cx={pts[lastIdx][0]}
          cy={pts[lastIdx][1]}
          r={4}
          fill={color}
          stroke="var(--surface)"
          strokeWidth={2}
        />

        {active !== null ? (
          <g>
            <line
              x1={xAt(active)}
              x2={xAt(active)}
              y1={p.y0}
              y2={p.y1}
              stroke="var(--ink-3)"
              strokeWidth={1}
            />
            <circle
              cx={pts[active][0]}
              cy={pts[active][1]}
              r={4.5}
              fill={color}
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </g>
        ) : null}
      </svg>

      {active !== null ? (
        <div
          className="tip"
          style={{
            left: `${tipLeft}%`,
            top: 0,
            transform: tipFlip ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
          }}
        >
          <div className="tip__k">{monthLabel(months[active])}</div>
          <div className="tip__v">
            {num(values[active])} {unit}
          </div>
        </div>
      ) : null}

      <p className="visually-hidden">
        Highest month: {monthLabel(months[values.indexOf(Math.max(...values))])} with{' '}
        {num(Math.max(...values))} {unit}. Axis maximum {num(max)}.
      </p>
    </div>
  );
}
