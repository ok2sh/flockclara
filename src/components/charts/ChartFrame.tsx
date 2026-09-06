import { useId, useState, type ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** Table-view twin. Every chart ships one so no value is color-only. */
  table?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
}

export function ChartFrame({ title, subtitle, table, actions, footnote, children }: Props) {
  const [showTable, setShowTable] = useState(false);
  const id = useId();

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <div className="chart__head">
        <figcaption>
          <div className="chart__title" id={`${id}-t`}>
            {title}
          </div>
          {subtitle ? <div className="chart__sub">{subtitle}</div> : null}
        </figcaption>
        <div className="row" style={{ gap: '0.5rem' }}>
          {actions}
          {table ? (
            <div className="seg" role="group" aria-label={`View ${title} as`}>
              <button
                type="button"
                aria-pressed={!showTable}
                onClick={() => setShowTable(false)}
              >
                Chart
              </button>
              <button
                type="button"
                aria-pressed={showTable}
                onClick={() => setShowTable(true)}
              >
                Table
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="chart__body">
        {showTable && table ? <div className="table-scroll">{table}</div> : children}
      </div>

      {footnote ? <div className="note">{footnote}</div> : null}
    </figure>
  );
}
