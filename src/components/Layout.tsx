import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { PATHS, useJson } from '../lib/data';
import { longDate } from '../lib/format';
import type { Summary } from '../types';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/explorer', label: 'Explorer' },
  { to: '/agencies', label: 'Agencies' },
  { to: '/cameras', label: 'Cameras' },
  { to: '/access', label: 'Access' },
  { to: '/spending', label: 'Spending' },
  { to: '/documents', label: 'Documents' },
  { to: '/about', label: 'About' },
];

export function Layout() {
  const { pathname, hash } = useLocation();
  const summary = useJson<Summary>(PATHS.summary);

  useEffect(() => {
    // Route change goes to the top; an in-page anchor goes to its section.
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ block: 'start' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="nav">
        <nav className="wrap nav__inner" aria-label="Primary">
          <NavLink to="/" className="brandmark">
            <span className="brandmark__name">Santa Clara ALPR Records</span>
            <span className="brandmark__id">CPRA 26-235 / released 2026-08-05</span>
          </NavLink>
          <ul className="nav__links">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end} className="nav__link">
                  {n.label}
                </NavLink>
              </li>
            ))}
            <li>
              <ThemeToggle />
            </li>
          </ul>
        </nav>
      </header>

      <main id="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="wrap footer__grid">
          <div>
            <h4>Provenance</h4>
            <p>
              Records released by the City of Santa Clara Police Department in
              response to California Public Records Act request 26-235 on{' '}
              {longDate('2026-08-05')}. Republished here without alteration to the
              underlying values.
            </p>
          </div>
          <div>
            <h4>Data updated</h4>
            <p>
              {summary.data
                ? longDate(summary.data.generated)
                : summary.error
                  ? 'Not available'
                  : 'Loading'}
            </p>
            <p style={{ marginTop: '0.35rem' }}>
              Audit log covers{' '}
              {summary.data
                ? `${longDate(summary.data.first_search)} to ${longDate(summary.data.last_search)}`
                : '-'}
              .
            </p>
          </div>
          <div>
            <h4>Elsewhere on this site</h4>
            <ul>
              <li>
                <NavLink to="/about">Methodology and limitations</NavLink>
              </li>
              <li>
                <NavLink to="/about#downloads">Download the full dataset</NavLink>
              </li>
              <li>
                <NavLink to="/documents">Original released documents</NavLink>
              </li>
            </ul>
          </div>
          <div>
            <h4>Status</h4>
            <p>
              An unofficial republication of public records by a member of the
              public. Not affiliated with the City of Santa Clara, its police
              department, or Flock Safety.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
