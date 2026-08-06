import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { brandingCss } from '@re-send/shared';
import { router } from './router';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { ConnectionBanner } from './realtime/ConnectionBanner';
import './index.css';

// Brand colour values live only in branding.ts; inject them as :root custom
// properties at startup.
const brandStyle = document.createElement('style');
brandStyle.textContent = brandingCss();
document.head.appendChild(brandStyle);

const queryClient = new QueryClient();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <ConnectionBanner />
        <RouterProvider router={router} />
      </RealtimeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
