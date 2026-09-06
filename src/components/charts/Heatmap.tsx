import { useRef, useState } from 'react';
import { DAY_NAMES, hourLabel, num, pct } from '../../lib/format';
import { seqVar } from './chartUtils';

interface Props {
  /** grid[0] = Monday .. grid[6] = Sunday, 24 local hours each. */
  grid: number[][];
  tz: string;
}

interface Cell {
  d: number;
  h: number;
}

/** Day-of-week by hour, sequential single hue. Legend and table twin included. */
export function Heatmap({ grid, tz }: Props) {
  const [cell, setCell] = useState<Cell | null>(null);
  // Roving tabindex: 168 cells must not become 168 tab stops.
  const [rove, setRove] = useState<Cell>({ d: 0, h: 0 });
  const gridRef = useRef<HTMLDivElement | null>(null);

  const flat = grid.flat();
  const max = Math.max(1, ...flat);
  const total = flat.reduce((a, b) => a + b, 0);

  function move(d: number, h: number) {
    const nd = Math.min(6, Math.max(0, d));
    const nh = Math.min(23, Math.max(0, h));
    setRove({ d: nd, h: nh });
    setCell({ d: nd, h: nh });
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-cell="${nd}-${nh}"]`,
    );
    el?.focus();
  }

  function onKey(e: React.KeyboardEvent, d: number, h: number) {
    const map: Record<string, [number, number]> = {
      ArrowRight: [d, h + 1],
      ArrowLeft: [d, h - 1],
      ArrowDown: [d + 1, h],
      ArrowUp: [d - 1, h],
      Home: [d, 0],
      End: [d, 23],
    };
    const next = map[e.key];
    if (!next) return;
    e.preventDefault();
    move(next[0], next[1]);
  }

  const legendStops = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="chart__body">
      <div
        className="heat"
        ref={gridRef}
        role="group"
        aria-label="Searches by day of week and hour. Use the arrow keys to move between cells."
      >
        <div className="heat__corner" />
        {Array.from({ length: 24 }, (_, h) => (
          <div className="heat__hour" key={`h${h}`} aria-hidden="true">
            {h % 3 === 0 ? hourLabel(h) : ''}
          </div>
        ))}

        {grid.map((row, d) => (
          <div className="heat__line" key={d}>
            <div className="heat__day" aria-hidden="true">
              {DAY_NAMES[d].slice(0, 3)}
            </div>
            {row.map((v, h) => {
              const on = cell?.d === d && cell?.h === h;
              return (
                <button
                  type="button"
                  key={h}
                  data-cell={`${d}-${h}`}
                  tabIndex={rove.d === d && rove.h === h ? 0 : -1}
                  className={on ? 'heat__cell is-on' : 'heat__cell'}
                  style={{ background: seqVar(v / max) }}
                  onMouseEnter={() => setCell({ d, h })}
                  onMouseLeave={() => setCell(null)}
                  onFocus={() => {
                    setCell({ d, h });
                    setRove({ d, h });
                  }}
                  onBlur={() => setCell(null)}
                  onKeyDown={(e) => onKey(e, d, h)}
                  aria-label={`${DAY_NAMES[d]} ${hourLabel(h)}, ${num(v)} searches`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="heat__foot">
        <div className="heat__legend" aria-hidden="true">
          <span>Fewer</span>
          {legendStops.map((s) => (
            <span key={s} className="heat__key" style={{ background: seqVar(s) }} />
          ))}
          <span>More ({num(max)} peak)</span>
        </div>
        <div className="heat__read" aria-live="polite">
          {cell ? (
            <>
              <span className="tip__k">
                {DAY_NAMES[cell.d]} {hourLabel(cell.h)}{' '}
                {tz.split('/')[1]?.replace('_', ' ')}
              </span>{' '}
              <span className="tip__v">{num(grid[cell.d][cell.h])}</span>{' '}
              <span className="note" style={{ display: 'inline' }}>
                searches ({pct(grid[cell.d][cell.h], total, 2)} of all)
              </span>
            </>
          ) : (
            <span className="note">
              Hover a cell, or tab into the grid and use the arrow keys, for exact
              counts.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** WCAG-clean twin: every cell value as a table. */
export function HeatmapTable({ grid }: { grid: number[][] }) {
  return (
    <table className="data">
      <caption>Searches by local day of week and hour</caption>
      <thead>
        <tr>
          <th scope="col">Day</th>
          {Array.from({ length: 24 }, (_, h) => (
            <th scope="col" className="n" key={h}>
              {hourLabel(h)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.map((row, d) => (
          <tr key={d}>
            <th scope="row">{DAY_NAMES[d]}</th>
            {row.map((v, h) => (
              <td className="n" key={h}>
                {num(v)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
