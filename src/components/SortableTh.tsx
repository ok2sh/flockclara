export type SortDir = 'asc' | 'desc';

interface Props<K extends string> {
  col: K;
  label: string;
  sortKey: K;
  dir: SortDir;
  onSort: (k: K) => void;
  numeric?: boolean;
  width?: string;
}

/** Header cell that toggles sort and reports state to assistive tech. */
export function SortableTh<K extends string>({
  col,
  label,
  sortKey,
  dir,
  onSort,
  numeric,
  width,
}: Props<K>) {
  const active = sortKey === col;
  return (
    <th
      scope="col"
      className={numeric ? 'n' : undefined}
      style={width ? { width } : undefined}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="sort-btn" onClick={() => onSort(col)}>
        {label}
        <span className="sort-btn__dir" aria-hidden="true">
          {active ? (
            <svg width="8" height="6" viewBox="0 0 8 6" fill="currentColor">
              {dir === 'asc' ? <path d="M4 0 8 6H0z" /> : <path d="M4 6 0 0h8z" />}
            </svg>
          ) : null}
        </span>
      </button>
    </th>
  );
}

/** Standard compare used by every sortable table on the site. */
export function compareBy<T>(
  a: T,
  b: T,
  get: (r: T) => string | number | null,
  dir: SortDir,
): number {
  const av = get(a);
  const bv = get(b);
  const an = av === null || av === undefined;
  const bn = bv === null || bv === undefined;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  let c: number;
  if (typeof av === 'number' && typeof bv === 'number') c = av - bv;
  else c = String(av).localeCompare(String(bv), 'en', { numeric: true });
  return dir === 'asc' ? c : -c;
}
