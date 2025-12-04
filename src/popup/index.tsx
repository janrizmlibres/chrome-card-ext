import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../styles/globals.css';

console.log('[index.tsx] Script loaded');

const root = document.getElementById('root');
console.log('[index.tsx] Root element:', root);

if (root) {
  console.log('[index.tsx] Creating React root...');
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log('[index.tsx] React root created and rendered');
} else {
  console.error('[index.tsx] Root element not found!');
}
