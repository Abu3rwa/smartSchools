/* TEMPORARY render harness for TeacherDashboardPage. Deleted after verification. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import i18n from '../src/i18n';
import authReducer from '../src/store/slices/authSlice';
import teacherReducer from '../src/store/slices/teacherSlice';
import substitutionsReducer from '../src/store/slices/substitutionsSlice';
import schoolFeaturesReducer from '../src/store/slices/schoolFeaturesSlice';
import classReducer from '../src/store/slices/classSlice';
import departmentReducer from '../src/store/slices/departmentSlice';
import uiReducer from '../src/store/slices/uiSlice';
import TeacherDashboardPage from '../src/pages/teacher/dashboard/TeacherDashboardPage/TeacherDashboardPage';
import ClassesPage from '../src/pages/classes/ClassesPage/ClassesPage';
import StudentsPage from '../src/pages/students/StudentsPage/StudentsPage';
import SubjectsPage from '../src/pages/subjects/SubjectsPage/SubjectsPage';
import studentReducer from '../src/store/slices/studentCoreSlice';
import subjectReducer from '../src/store/slices/subjectSlice';
import { stub } from './apiStub';
import '../src/index.css';
import '../src/components/layout/MainLayout.css';
import './harness.css';

/* Pin the wall clock to a school day so Today/Now/Week are reproducible. */
const RealDate = Date;
const REAL_START = RealDate.now();
const BASE = new RealDate(2026, 10, 8, 9, 20, 0, 0); // Sunday
let clockMinutes = 9 * 60 + 20;
const pinnedNow = () => {
    const d = new RealDate(BASE.getTime());
    d.setHours(Math.floor(clockMinutes / 60), clockMinutes % 60, 0, 0);
    return d.getTime() + (RealDate.now() - REAL_START);
};
class PreviewDate extends RealDate {
    constructor(...args) {
        if (args.length === 0) super(pinnedNow());
        else super(...args);
    }
    static now() { return pinnedNow(); }
}
window.Date = PreviewDate;

const reducer = combineReducers({
    auth: authReducer,
    teachers: teacherReducer,
    substitutions: substitutionsReducer,
    schoolFeatures: schoolFeaturesReducer,
    classes: classReducer,
    departments: departmentReducer,
    students: studentReducer,
    subjects: subjectReducer,
    ui: uiReducer
});

const options = { lang: 'en', theme: 'dark', mode: 'full', subs: 2, inbox: true, page: 'dashboard', role: 'teacher' };
let store;
let root;

const buildStore = () => configureStore({
    reducer,
    preloadedState: {
        auth: {
            user: { _id: 't1', firstName: 'Abdulhafeez', lastName: 'A', role: options.role, roles: [options.role], school: 'sc1' },
            token: 'preview',
            isAuthenticated: true,
            loading: false,
            error: null
        },
        schoolFeatures: {
            plan: 'pro',
            planName: 'Pro',
            subscriptionStatus: 'active',
            features: { inboxAssistant: options.inbox },
            featureMetadata: {},
            limits: null,
            usage: null,
            loading: false,
            fetched: true,
            error: null
        }
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false })
});

const applyDocument = () => {
    document.documentElement.setAttribute('data-theme', options.theme);
    document.documentElement.setAttribute('lang', options.lang);
    document.documentElement.setAttribute('dir', options.lang === 'ar' ? 'rtl' : 'ltr');
};

const PAGE_PATHS = {
    dashboard: '/portal/dashboard',
    classes: '/portal/classes',
    students: '/portal/students',
    subjects: '/portal/subjects'
};

const PAGES = {
    dashboard: <TeacherDashboardPage />,
    classes: <ClassesPage />,
    students: <StudentsPage />,
    subjects: <SubjectsPage />
};

const render = async () => {
    stub.mode = options.mode;
    stub.lang = options.lang;
    stub.subs = options.subs;
    stub.inbox = options.inbox;
    stub.role = options.role;
    stub.calls = [];
    applyDocument();
    await i18n.changeLanguage(options.lang);
    await i18n.loadNamespaces(['dashboard', 'common', 'classes', 'students', 'subjects']);

    if (root) root.unmount();
    store = buildStore();
    root = createRoot(document.getElementById('root'));
    root.render(
        <StrictMode>
            <Provider store={store}>
                <MemoryRouter initialEntries={[PAGE_PATHS[options.page] || PAGE_PATHS.dashboard]}>
                    <div className="main-layout admin-layout">
                        <div className="preview-side" aria-hidden="true" />
                        <div className="main-content">
                            <div className="preview-top" aria-hidden="true" />
                            <div className="page-content">
                                {PAGES[options.page] || <TeacherDashboardPage />}
                            </div>
                        </div>
                    </div>
                </MemoryRouter>
            </Provider>
        </StrictMode>
    );
};

window.__preview = async (patch = {}) => {
    Object.assign(options, patch);
    if (typeof patch.clock === 'number') clockMinutes = patch.clock;
    await render();
    return { ...options, clock: clockMinutes };
};

window.__stub = (patch = {}) => {
    Object.assign(stub, patch);
    return { ...stub };
};

window.__calls = () => [...(stub.calls || [])];

window.__audit = () => {
    const findings = [];
    const root = document.querySelector('.tdash');
    if (!root) return { total: 0, unique: [], note: 'no .tdash' };
    const vw = document.documentElement.clientWidth;
    const push = (kind, el, extra) => findings.push({ kind, el, ...extra });
    const name = (el) => (typeof el.className === 'string' && el.className) || el.tagName;

    root.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const label = name(el);
        const box = el.getBoundingClientRect();
        const scrollable = cs.overflowX === 'auto' || cs.overflowX === 'scroll';

        if (el.scrollWidth > el.clientWidth + 1 && !scrollable && el.clientWidth > 0) {
            // Decorative pseudo-elements are clipped on purpose; only real children count.
            const spill = [...el.children].some((child) => {
                const cb = child.getBoundingClientRect();
                return cb.width > 0 && (cb.right > box.right + 1 || cb.left < box.left - 1);
            });
            if (spill || cs.overflowX === 'visible') {
                push('overflow-x', label, { scroll: el.scrollWidth, client: el.clientWidth, pseudoOnly: !spill });
            }
        }

        if (box.width > 0 && (box.right > vw + 1 || box.left < -1)) {
            push('offscreen', label, { left: Math.round(box.left), right: Math.round(box.right), vw });
        }

        if (el.children.length === 0 && el.textContent.trim()) {
            if (el.scrollHeight > el.clientHeight + 1 && cs.overflowY === 'hidden') {
                push('clipped-text', label, { text: el.textContent.trim().slice(0, 40) });
            }
            if (/\{\{|\}\}|^dashboard:|^common:/.test(el.textContent)) {
                push('raw-key', label, { text: el.textContent.trim().slice(0, 60) });
            }
            const size = parseFloat(cs.fontSize);
            if (size < 11) push('tiny-text', label, { size, text: el.textContent.trim().slice(0, 30) });
        }
    });

    if (vw <= 400) {
        root.querySelectorAll('a, button').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0) return;
            if (r.height < 32 || r.width < 32) {
                push('small-target', name(el), { w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.trim().slice(0, 24) });
            }
        });
    }

    const unique = [...new Set(findings.map((f) => `${f.kind}|${f.el}`))];
    return { total: findings.length, unique, sample: findings.slice(0, 14) };
};

window.__hideText = (on) => {
    let tag = document.getElementById('preview-hide-text');
    if (on) {
        if (!tag) {
            tag = document.createElement('style');
            tag.id = 'preview-hide-text';
            document.head.appendChild(tag);
        }
        tag.textContent = '.tdash *{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important}';
    } else if (tag) {
        tag.remove();
    }
    return on;
};

window.__gradientText = () => {
    const out = [];
    document.querySelectorAll('.tdash *').forEach((el) => {
        if (el.children.length > 0) return;
        const text = el.textContent.trim();
        if (!text) return;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        let node = el;
        let gradient = false;
        while (node && node !== document.documentElement) {
            const ncs = getComputedStyle(node);
            if (ncs.backgroundImage && ncs.backgroundImage !== 'none') { gradient = true; break; }
            const c = parseRgb(ncs.backgroundColor);
            if (c && c[3] === 1) break;
            node = node.parentElement;
        }
        if (!gradient) return;
        const fg = parseRgb(cs.color);
        out.push({
            text,
            x: r.left,
            y: r.top,
            w: r.width,
            h: r.height,
            rgb: fg.slice(0, 3).map(Math.round),
            a: fg[3],
            size: parseFloat(cs.fontSize),
            bold: Number(cs.fontWeight) >= 700
        });
    });
    return out;
};

await render();
document.body.setAttribute('data-ready', 'true');

const parseRgb = (value) => {
    const s = String(value);
    const m = s.match(/[\d.]+/g);
    if (!m) return null;
    const scale = s.startsWith('color(') ? 255 : 1;
    return [Number(m[0]) * scale, Number(m[1]) * scale, Number(m[2]) * scale, m[3] === undefined ? 1 : Number(m[3])];
};
const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));
const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const bgOf = (el) => {
    let node = el;
    let stack = [];
    while (node && node !== document.documentElement) {
        const cs = getComputedStyle(node);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradient: sample pixels instead
        const c = parseRgb(cs.backgroundColor);
        if (c && c[3] > 0) {
            stack.push(c);
            if (c[3] === 1) break;
        }
        node = node.parentElement;
    }
    let base = [255, 255, 255];
    const rootBg = parseRgb(getComputedStyle(document.body).backgroundColor);
    if (rootBg && rootBg[3] === 1) base = rootBg.slice(0, 3);
    for (let i = stack.length - 1; i >= 0; i -= 1) base = over(stack[i], base);
    return base;
};

window.__contrast = () => {
    const out = [];
    document.querySelectorAll('.tdash *').forEach((el) => {
        if (el.children.length > 0) return;
        const text = el.textContent.trim();
        if (!text) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.15) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const fg = parseRgb(cs.color);
        if (!fg) return;
        const bg = bgOf(el);
        if (!bg) {
            out.push({ el: (typeof el.className === 'string' && el.className) || el.tagName, text: text.slice(0, 32), gradient: true, color: cs.color });
            return;
        }
        const c = over(fg, bg);
        const l1 = lum(c);
        const l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const size = parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const large = size >= 24 || (size >= 18.66 && bold);
        const need = large ? 3 : 4.5;
        if (ratio < need) {
            out.push({
                el: (typeof el.className === 'string' && el.className) || el.tagName,
                text: text.slice(0, 32),
                ratio: Number(ratio.toFixed(2)),
                need,
                size,
                color: cs.color
            });
        }
    });
    const seen = new Set();
    return out.filter((row) => {
        const key = `${row.el}|${row.color}|${row.ratio}|${row.gradient}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

window.__spec = () => {
    const rows = window.__gradientText();
    ['.td-next-label', '.td-next-count', '.td-classchip'].forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
            const cs = getComputedStyle(el);
            const fg = parseRgb(cs.color);
            const range = document.createRange();
            range.selectNodeContents(el);
            [...range.getClientRects()].forEach((r) => {
                if (r.width < 8 || r.height < 8) return;
                rows.push({
                    text: el.textContent.trim().slice(0, 30),
                    x: r.left, y: r.top, w: r.width, h: r.height,
                    rgb: fg.slice(0, 3).map(Math.round), a: fg[3],
                    size: parseFloat(cs.fontSize), bold: Number(cs.fontWeight) >= 700
                });
            });
        });
    });
    return JSON.stringify(rows);
};