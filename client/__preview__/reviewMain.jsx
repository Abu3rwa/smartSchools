/* TEMPORARY render harness for SpellingPronunciationReviewPage. Deleted after verification. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import i18n from '../src/i18n';
import authReducer from '../src/store/slices/authSlice';
import { getTheme } from '../src/theme';
import SpellingPronunciationReviewPage from '../src/pages/spelling/SpellingPronunciationReviewPage';
import { stub } from './reviewApiStub';
import '../src/index.css';

const query = new URLSearchParams(window.location.search);
const options = {
    lang: query.get('lang') || 'en',
    theme: query.get('theme') || 'dark',
    mode: query.get('mode') || 'full',
    role: query.get('role') || 'admin'
};

const buildStore = () => configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
        auth: {
            user: { _id: 'u1', firstName: 'Admin', lastName: 'A', role: options.role, roles: [options.role], school: 'sc1' },
            token: 'preview',
            isAuthenticated: true,
            loading: false,
            error: null
        }
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false })
});

let root;

const render = async () => {
    stub.mode = options.mode;
    stub.role = options.role;
    stub.calls = [];
    document.documentElement.setAttribute('lang', options.lang);
    document.documentElement.setAttribute('dir', options.lang === 'ar' ? 'rtl' : 'ltr');
    await i18n.changeLanguage(options.lang);
    await i18n.loadNamespaces(['spelling']);

    if (root) root.unmount();
    root = createRoot(document.getElementById('root'));
    root.render(
        <StrictMode>
            <Provider store={buildStore()}>
                <MemoryRouter initialEntries={['/portal/spelling/audio/review']}>
                    <ThemeProvider theme={getTheme(options.theme, options.lang === 'ar' ? 'rtl' : 'ltr')}>
                        <CssBaseline />
                        <div style={{ background: '#0f172a', minHeight: '100vh', padding: 16 }}>
                            <SpellingPronunciationReviewPage />
                        </div>
                    </ThemeProvider>
                </MemoryRouter>
            </Provider>
        </StrictMode>
    );
};

window.__preview = async (patch = {}) => {
    Object.assign(options, patch);
    await render();
    return { ...options };
};

window.__stub = (patch = {}) => {
    Object.assign(stub, patch);
    return { ...stub };
};

window.__calls = () => [...(stub.calls || [])];

render();
