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
