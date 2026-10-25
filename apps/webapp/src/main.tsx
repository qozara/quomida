import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { registerPwaServiceWorker } from './hooks/usePwaUpdate.js';
import App from './App.js';
import './index.css';

registerPwaServiceWorker(registerSW);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
