import { Link } from 'react-router-dom';
import { Section } from '../components/Section';

export function NotFound() {
  return (
    <Section kicker="Page not found" title="There is nothing at this address">
      <div className="stack">
        <p className="lede">
          The link may be out of date, or the record may not exist in the released
          data.
        </p>
        <div className="pill-links">
          <Link className="btn" to="/">
            Go to the overview
          </Link>
          <Link className="btn btn--ghost" to="/agencies">
            Browse agencies
          </Link>
          <Link className="btn btn--ghost" to="/explorer">
            Open the explorer
          </Link>
        </div>
      </div>
    </Section>
  );
}
