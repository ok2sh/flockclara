import type { ReactNode } from 'react';

interface Props {
  /** Names the source record set, e.g. "Network audit log". */
  kicker?: string;
  title?: string;
  intro?: ReactNode;
  sunk?: boolean;
  id?: string;
  children: ReactNode;
}

export function Section({ kicker, title, intro, sunk, id, children }: Props) {
  return (
    <section className={sunk ? 'section section--sunk' : 'section'} id={id}>
      <div className="wrap">
        {kicker || title || intro ? (
          <header className="section__head">
            {kicker ? <span className="kicker">{kicker}</span> : null}
            {title ? <h2>{title}</h2> : null}
            {intro ? <p>{intro}</p> : null}
          </header>
        ) : null}
        {children}
      </div>
    </section>
  );
}
