import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPage } from './SettingsPage.js';
import './settings.css';

const root = document.getElementById('root');
if (root === null) throw new Error('webspec settings: #root element missing');

createRoot(root).render(
  <StrictMode>
    <SettingsPage />
  </StrictMode>,
);
