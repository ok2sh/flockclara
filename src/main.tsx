import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/overpass/400.css';
import '@fontsource/overpass/500.css';
import '@fontsource/overpass/600.css';
import '@fontsource/overpass/700.css';
import '@fontsource/overpass-mono/400.css';
import '@fontsource/overpass-mono/600.css';

import './styles/tokens.css';
import './styles/base.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
