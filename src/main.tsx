import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/global.css';
import App from './App.tsx';
import { BackupProvider } from './components/BackupProvider.tsx';
import { requestPersistentStorage } from './db/persist.ts';

// Spec §4: ask the browser to keep our data. Failure is fine — ignore it.
void requestPersistentStorage();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <BackupProvider>
      <App />
    </BackupProvider>
  </StrictMode>,
);
