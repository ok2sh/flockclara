import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/DataState';
import { Home } from './pages/Home';

// The explorer pulls in DuckDB-WASM, so it loads only when visited.
const Explorer = lazy(() =>
  import('./pages/Explorer').then((m) => ({ default: m.Explorer })),
);
const Agencies = lazy(() =>
  import('./pages/Agencies').then((m) => ({ default: m.Agencies })),
);
const AgencyDetail = lazy(() =>
  import('./pages/AgencyDetail').then((m) => ({ default: m.AgencyDetail })),
);
// Cameras pulls in Leaflet, so it loads only when visited.
const Cameras = lazy(() =>
  import('./pages/Cameras').then((m) => ({ default: m.Cameras })),
);
const AccessPage = lazy(() =>
  import('./pages/Access').then((m) => ({ default: m.Access })),
);
const Spending = lazy(() =>
  import('./pages/Spending').then((m) => ({ default: m.Spending })),
);
const Documents = lazy(() =>
  import('./pages/Documents').then((m) => ({ default: m.Documents })),
);
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })));
const NotFound = lazy(() =>
  import('./pages/NotFound').then((m) => ({ default: m.NotFound })),
);

function Fallback() {
  return (
    <div className="wrap section">
      <Loading label="page" height={200} />
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route
            path="explorer"
            element={
              <Suspense fallback={<Fallback />}>
                <Explorer />
              </Suspense>
            }
          />
          <Route
            path="agencies"
            element={
              <Suspense fallback={<Fallback />}>
                <Agencies />
              </Suspense>
            }
          />
          <Route
            path="agencies/:org"
            element={
              <Suspense fallback={<Fallback />}>
                <AgencyDetail />
              </Suspense>
            }
          />
          <Route
            path="cameras"
            element={
              <Suspense fallback={<Fallback />}>
                <Cameras />
              </Suspense>
            }
          />
          <Route
            path="access"
            element={
              <Suspense fallback={<Fallback />}>
                <AccessPage />
              </Suspense>
            }
          />
          <Route
            path="spending"
            element={
              <Suspense fallback={<Fallback />}>
                <Spending />
              </Suspense>
            }
          />
          <Route
            path="documents"
            element={
              <Suspense fallback={<Fallback />}>
                <Documents />
              </Suspense>
            }
          />
          <Route
            path="about"
            element={
              <Suspense fallback={<Fallback />}>
                <About />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <Suspense fallback={<Fallback />}>
                <NotFound />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </HashRouter>
  );
}
