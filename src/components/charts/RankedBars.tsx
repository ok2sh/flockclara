import { Link } from 'react-router-dom';
import { num, pct } from '../../lib/format';

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Optional in-site route for the row. */
  to?: string;
  /** Optional second line under the label. */
  meta?: string;
}

interface Props {
  rows: BarRow[];
  /** Denominator for the share shown beside each value. */
  total?: number;
  unit?: string;
  /** Rank numbers only when the ordering itself is the information. */
  showRank?: boolean;
}

/**
 * Horizontal bars, one hue for every row: bar length already encodes the
 * magnitude, so hue carries nothing and stays constant. Values are labeled
 * at the tip, which is also the relief for the sub-3:1 fill contrast.
 */
export function RankedBars({ rows, total, unit = 'searches', showRank }: Props) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ol className="bars" aria-label={`Ranked by ${unit}`}>
      {rows.map((r, i) => {
        const w = (r.value / max) * 100;
        const label = r.to ? <Link to={r.to}>{r.label}</Link> : r.label;
        return (
          <li className="bars__row" key={r.key}>
            <div className="bars__label">
              {showRank ? (
                <span className="bars__rank" aria-hidden="true">
                  {i + 1}
                </span>
              ) : null}
              <span className="bars__name">
                {label}
                {r.meta ? <span className="bars__meta">{r.meta}</span> : null}
              </span>
            </div>
            <div className="bars__track">
              <div className="bars__fill" style={{ width: `${w}%` }} />
            </div>
            <div className="bars__val num">
              {num(r.value)}
              {total ? <span className="bars__share">{pct(r.value, total)}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
