import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './components/Sketcher.css';
import { registerOfflineRuntime } from './platform/offline';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

void registerOfflineRuntime();
