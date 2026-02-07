import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import store from './store'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
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
              iconTheme: {
                primary: 'var(--accent-emerald)',
                secondary: 'white',
              },
            },
            error: {
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
