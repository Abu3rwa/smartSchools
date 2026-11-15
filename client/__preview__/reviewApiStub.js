/* TEMPORARY render harness stub for the spelling pronunciation review page. */

export const API_URL = '';

export const stub = {
    lang: 'en',
    role: 'admin',
    mode: 'full',
    delay: 60,
    calls: []
};

const WORDS = [
    { word: 'castle', category: 'verbs', order: 1 },
    { word: 'bridge', category: 'nouns', order: 2 },
    { word: 'stone', category: 'nouns', order: 3 },
    { word: 'whisper', category: 'verbs', order: 4 },
    { word: 'rhythm', category: 'nouns', order: 5 }
];

const clip = (word, accent, extra = {}) => ({
    url: `/api/spelling/pronunciation/${word}${accent}?v=2`,
    missing: false,
    removed: false,
    reviewed: false,
    reviewedAt: null,
    attempts: 0,
    flagged: false,
    flagReason: null,
    ...extra
});

const buildQueue = () => {
    const words = WORDS.map((entry, index) => ({
        ...entry,
        accents: {
            us: clip(entry.word, 'us', index === 0
                ? { reviewed: true, reviewedAt: new Date().toISOString() }
                : index === 3
                    ? { flagged: true, flagReason: 'unclear' }
                    : index === 4
                        ? { attempts: 3 }
                        : {}),
            uk: clip(entry.word, 'uk', index === 1
                ? { missing: true }
                : index === 2
                    ? { removed: true }
                    : index === 4
                        ? { attempts: 1 }
                        : {})
        }
    }));
    return {
        mode: 'queue',
        grade: 'G3',
        week: 5,
        allowedGrades: ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'],
        attemptLimit: 3,
        words,
        summary: {
            totalWords: words.length,
            reviewedWords: 1,
            pendingWords: words.length - 1,
            missingClips: 1,
            flaggedClips: 1,
            removedClips: 1
        }
    };
};

const ok = (data) => ({ data: { success: true, data } });

const fail = (message) => {
    const error = new Error(message);
    error.response = { status: 500, data: { success: false, message } };
    return error;
};

const route = (url) => {
    stub.calls.push(String(url));
    const path = String(url).split('?')[0];
    const query = String(url).includes('?') ? String(url).split('?')[1] : '';

    if (path === '/spelling/word-audio/review/queue') {
        if (stub.mode === 'error') throw fail('Failed to load the review queue');
        if (stub.mode === 'empty') {
            return ok({ mode: 'queue', grade: 'G3', week: 5, allowedGrades: ['G3'], attemptLimit: 3, words: [], summary: { totalWords: 0, reviewedWords: 0, pendingWords: 0, missingClips: 0, flaggedClips: 0, removedClips: 0 } });
        }
        if (!query.includes('grade=')) {
            return ok({
                mode: 'index',
                allowedGrades: ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'],
                weeks: [
                    { grade: 'G3', week: 4, totalWords: 12 },
                    { grade: 'G3', week: 5, totalWords: 5 },
                    { grade: 'G4', week: 1, totalWords: 9 }
                ]
            });
        }
        return ok(buildQueue());
    }

    if (path === '/spelling/word-audio/review') return ok({ word: 'castle', accent: 'us', reviewed: true, reviewedAt: new Date().toISOString() });
    if (path === '/spelling/word-audio/review/flag') return ok({ word: 'whisper', accent: 'us', flagged: true, flagReason: 'unclear' });
    if (path === '/spelling/word-audio/ai/pronunciation/regenerate') return ok({ available: true, word: 'castle', accent: 'us', costCents: 0.4 });
    if (path === '/spelling/word-audio/ai/generate') return ok({ available: true, generated: 3, failed: 0, remaining: 0, costCents: 1.2 });

    return ok({});
};

const withParams = (url, config) => {
    const params = config?.params;
    if (!params) return String(url);
    const search = new URLSearchParams(params).toString();
    if (!search) return String(url);
    return `${String(url)}${String(url).includes('?') ? '&' : '?'}${search}`;
};

const api = {
    get: (url, config) => new Promise((resolve, reject) => {
        if (stub.mode === 'loading') return;
        setTimeout(() => {
            try {
                resolve(route(withParams(url, config)));
            } catch (error) {
                reject(error);
            }
        }, stub.delay);
    }),
    post: (url, config) => new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                resolve(route(withParams(url, config)));
            } catch (error) {
                reject(error);
            }
        }, stub.delay);
    }),
    put: () => Promise.resolve(ok({})),
    patch: () => Promise.resolve(ok({})),
    delete: (url) => new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                resolve(route(url));
            } catch (error) {
                reject(error);
            }
        }, stub.delay);
    }),
    interceptors: {
        request: { use: () => 0, eject: () => { } },
        response: { use: () => 0, eject: () => { } }
    },
    defaults: { headers: { common: {} } }
};

export default api;
