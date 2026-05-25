import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from './store/AppContext';
import App from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
