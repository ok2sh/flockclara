import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}

/** Label / value / note. Proportional figures: never tabular at display size. */
export function StatTile({ label, value, note }: Props) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {note ? <span className="stat__note">{note}</span> : null}
    </div>
  );
}
