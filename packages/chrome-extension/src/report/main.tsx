import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReportPage } from './ReportPage.js';
import './report.css';

const root = document.getElementById('root');
if (root === null) throw new Error('webspec report: #root element missing');

createRoot(root).render(
  <StrictMode>
    <ReportPage />
  </StrictMode>,
);
