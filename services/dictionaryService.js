import DictionaryEntry from '../models/DictionaryEntry.js';

const UPSTREAM_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const UPSTREAM_TIMEOUT_MS = 30000;
const FAILED_RETRY_MS = 60 * 1000;
const normalizeWord = (word) => String(word || '').trim().toLowerCase();
const safeText = (value) => String(value || '').replace(/[<>]/g, '').trim();

const mapEntry = (word, entry, status = 'found') => ({
    word,
    audioUrl: String(entry?.phonetics?.find((item) => item.audio)?.audio || '').replace(/^\/\//, 'https://'),
    phonetic: safeText(entry?.phonetic || entry?.phonetics?.find((item) => item.text)?.text),
    definitions: (entry?.meanings || []).flatMap((meaning) => (meaning.definitions || []).slice(0, 2).map((definition) => ({
        partOfSpeech: safeText(meaning.partOfSpeech),
        definition: safeText(definition.definition),
        example: safeText(definition.example)
    }))).slice(0, 4),
    fetchedAt: new Date(),
    status
});

export async function getDictionaryEntry(word) {
    const normalizedWord = normalizeWord(word);
    if (!normalizedWord) return { word: '', status: 'not-found', audioUrl: '', phonetic: '', definitions: [] };
    const cached = await DictionaryEntry.findOne({ word: normalizedWord }).lean();
    if (cached && (cached.status !== 'fetch-failed' || Date.now() - new Date(cached.fetchedAt).getTime() < FAILED_RETRY_MS)) return cached;
    try {
        const response = await fetch(`${UPSTREAM_URL}${encodeURIComponent(normalizedWord)}`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
        if (response.status === 404) {
            const notFound = mapEntry(normalizedWord, null, 'not-found');
            await DictionaryEntry.findOneAndUpdate({ word: normalizedWord }, { $set: notFound }, { upsert: true, new: true, setDefaultsOnInsert: true });
            return notFound;
        }
        if (!response.ok) throw new Error(`Dictionary API returned ${response.status}`);
        const payload = await response.json();
        const found = mapEntry(normalizedWord, payload?.[0]);
        await DictionaryEntry.findOneAndUpdate({ word: normalizedWord }, { $set: found }, { upsert: true, new: true, setDefaultsOnInsert: true });
        return found;
    } catch {
        const failed = { word: normalizedWord, audioUrl: '', phonetic: '', definitions: [], fetchedAt: new Date(), status: 'fetch-failed' };
        await DictionaryEntry.findOneAndUpdate({ word: normalizedWord }, { $set: failed }, { upsert: true, new: true, setDefaultsOnInsert: true });
        return failed;
    }
}
