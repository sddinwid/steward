import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StewardApp } from '@steward/ui';
import '@steward/ui/style.css';
createRoot(document.getElementById('root')!).render(<StrictMode><StewardApp role="master" /></StrictMode>);
