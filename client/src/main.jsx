import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './i18n'
import store from './store'
import App from './App.jsx'
import NetworkStatusBanner from './components/NetworkStatusBanner'
import './index.css'

// FE-017: Global unhandled error / rejection handlers
// Replace console.error with Sentry.captureException when error tracking is added
window.addEventListener('error', (event) => {
  console.error('[Unhandled Error]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
        <NetworkStatusBanner />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: 'var(--accent-emerald)',
                secondary: 'white',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: 'var(--accent-red)',
                secondary: 'white',
              },
            },
          }}
        />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)
