import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './popup.css';

const root = document.getElementById('root');
if (root === null) throw new Error('webspec popup: #root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
