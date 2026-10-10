import dns from 'node:dns/promises';
import net from 'node:net';
import VocabWordSource from '../models/VocabWordSource.js';
import VocabWord from '../models/VocabWord.js';

const CHECK_TIMEOUT_MS = 5000;
const CONCURRENCY = 5;
export const AUDIO_CHECK_BATCH = 40;

const isPrivateV4 = (ip) => {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

// Blocks loopback, private, link-local and mapped addresses so the checker cannot be aimed at internal services.
export const isPrivateIp = (ip) => {
    if (net.isIPv4(ip)) return isPrivateV4(ip);
    const lower = String(ip).toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateV4(mapped[1]);
    return lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || /^fe[89ab]/.test(lower);
};

export const isPublicHttpUrl = async (value) => {
    let url;
    try { url = new URL(value); } catch { return false; }
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) return !isPrivateIp(host);
    try {
        const addresses = await dns.lookup(host, { all: true });
        return addresses.length > 0 && addresses.every((entry) => !isPrivateIp(entry.address));
    } catch {
        return false;
    }
};

const request = async (url, method, headers = {}) => fetch(url, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });

export const checkUrl = async (url) => {
    if (!(await isPublicHttpUrl(url))) return { ok: false, status: 0, error: 'Blocked or unreachable address' };
    try {
        let response = await request(url, 'HEAD');
        if ([403, 405, 501].includes(response.status)) response = await request(url, 'GET', { Range: 'bytes=0-0' });
        return { ok: response.status < 400, status: response.status, error: '' };
    } catch (error) {
        return { ok: false, status: 0, error: error?.name === 'TimeoutError' ? 'Timed out' : 'Could not connect' };
    }
};

const FIELDS = [['audioUsUrl', 'US audio'], ['audioUkUrl', 'UK audio'], ['exampleAudioUrl', 'Example audio']];

// Checks one slice of the audio URLs so a single request stays short; the client calls again with nextOffset.
export async function checkAudioUrls({ schoolId, listId = '', offset = 0, limit = AUDIO_CHECK_BATCH }) {
    const wordFilter = { school: schoolId };
    if (listId) wordFilter.listId = listId;
    const words = await VocabWord.find(wordFilter).select('word listId').lean();
    const wordsById = new Map(words.map((word) => [String(word._id), word]));
    const sources = await VocabWordSource.find({ school: schoolId, word: { $in: words.map((word) => word._id) } }).lean();
    const entries = [];
    for (const source of sources) {
        for (const [field, label] of FIELDS) {
            if (source[field]) entries.push({ url: source[field], word: wordsById.get(String(source.word))?.word || '', listId: wordsById.get(String(source.word))?.listId || '', source: source.source, kind: label });
        }
    }
    entries.sort((a, b) => a.url.localeCompare(b.url));
    const start = Math.max(0, Number(offset) || 0);
    const slice = entries.slice(start, start + limit);
    const broken = [];
    const cache = new Map();
    let cursor = 0;
    const worker = async () => {
        while (cursor < slice.length) {
            const entry = slice[cursor++];
            if (!cache.has(entry.url)) cache.set(entry.url, checkUrl(entry.url));
            const result = await cache.get(entry.url);
            if (!result.ok) broken.push({ ...entry, status: result.status, error: result.error });
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    const nextOffset = start + slice.length;
    return { total: entries.length, checked: slice.length, broken, nextOffset: nextOffset < entries.length ? nextOffset : null };
}
