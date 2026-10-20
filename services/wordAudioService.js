import WordAudio from '../models/WordAudio.js';
import SpellingAudioSettings from '../models/SpellingAudioSettings.js';
import SpellingWord from '../models/SpellingWord.js';
import { normalizeForGrading } from '../utils/spellingGrading.js';
import { DICTIONARIES, normalizeWordKey, parseWordAudioCsv, planWordAudioImport, validateAudioUrl } from '../utils/wordAudio.js';

const GRADES = ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'];
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function searchSchoolWordAudio({ schoolId, query }) {
    const search = normalizeForGrading(query);
    if (search.length < 2) throw badRequest('Enter at least 2 letters to search');
    const words = await SpellingWord.find({
        school: schoolId,
        normalizedWord: { $regex: escapeRegex(search) }
    }).select('word normalizedWord grade').sort({ normalizedWord: 1 }).limit(100).lean();
    const uniqueKeys = [...new Set(words.map((entry) => normalizeWordKey(entry.word)).filter(Boolean))];
    const audioDocs = uniqueKeys.length
        ? await WordAudio.find({ word: { $in: uniqueKeys } })
            .select('word longmanUS longmanUK oxfordUS oxfordUK websterUS googleUS googleUK examples.longman examples.oxford examples.webster examples.google')
            .lean()
        : [];
    const audioByWord = new Map(audioDocs.map((entry) => [entry.word, entry]));
    const result = [];
    const seen = new Set();
    for (const entry of words) {
        const key = normalizeWordKey(entry.word);
        if (seen.has(key)) continue;
        seen.add(key);
        const audio = audioByWord.get(key);
        const examples = DICTIONARIES.flatMap((dictionary) => (audio?.examples?.[dictionary] || [])
            .map((url) => ({ dictionary, url })));
        result.push({
            word: entry.word,
            grade: entry.grade,
            pronunciations: {
                longmanUS: audio?.longmanUS || '',
                longmanUK: audio?.longmanUK || '',
                oxfordUS: audio?.oxfordUS || '',
                oxfordUK: audio?.oxfordUK || '',
                websterUS: audio?.websterUS || '',
                googleUS: audio?.googleUS || '',
                googleUK: audio?.googleUK || ''
            },
            examples
        });
    }
    return result;
}

export async function replaceSchoolWordPronunciation({ schoolId, word, field, currentUrl, replacementUrl }) {
    const key = normalizeWordKey(word);
    const spellingWordKey = normalizeForGrading(word);
    if (!key || key.length > 200) throw badRequest('A valid spelling word is required');
    if (!['longmanUS', 'longmanUK', 'oxfordUS', 'oxfordUK', 'websterUS', 'googleUS', 'googleUK'].includes(field)) {
        throw badRequest('Unknown pronunciation audio field');
    }
    const current = String(currentUrl || '').trim();
    if (current.length > 500) throw badRequest('The current audio URL is invalid');
    const validatedReplacement = validateAudioUrl(replacementUrl);
    if (!validatedReplacement.ok) throw badRequest(validatedReplacement.reason || 'A valid HTTPS audio URL is required');
    if (!(await SpellingWord.exists({ school: schoolId, normalizedWord: spellingWordKey }))) {
        throw notFound('Spelling word not found in this school');
    }

    await WordAudio.updateOne(
        { word: key },
        { $setOnInsert: { word: key } },
        { upsert: true }
    );
    const currentValueFilter = current
        ? { [field]: current }
        : { $or: [{ [field]: { $exists: false } }, { [field]: '' }] };
    const update = validatedReplacement.empty
        ? { $unset: { [field]: 1 }, $set: { updatedAt: new Date() } }
        : { $set: { [field]: validatedReplacement.url, updatedAt: new Date() } };
    const updated = await WordAudio.findOneAndUpdate(
        { word: key, ...currentValueFilter },
        update,
        { new: true }
    ).select('word longmanUS longmanUK oxfordUS oxfordUK websterUS googleUS googleUK').lean();
    if (!updated) throw notFound('The pronunciation audio changed; refresh the search and try again');
    return {
        word: updated.word,
        pronunciations: {
            longmanUS: updated.longmanUS || '',
            longmanUK: updated.longmanUK || '',
            oxfordUS: updated.oxfordUS || '',
            oxfordUK: updated.oxfordUK || '',
            websterUS: updated.websterUS || '',
            googleUS: updated.googleUS || '',
            googleUK: updated.googleUK || ''
        }
    };
}

export async function removeSchoolWordAudioExample({ schoolId, word, dictionary, url }) {
    if (!DICTIONARIES.includes(dictionary)) throw badRequest('Unknown audio dictionary');
    const key = normalizeWordKey(word);
    const spellingWordKey = normalizeForGrading(word);
    const exactUrl = String(url || '').trim();
    if (!key || !exactUrl || exactUrl.length > 500) throw badRequest('A word and example audio URL are required');
    if (!(await SpellingWord.exists({ school: schoolId, normalizedWord: spellingWordKey }))) {
        throw notFound('Spelling word not found in this school');
    }
    const updated = await WordAudio.findOneAndUpdate(
        { word: key, [`examples.${dictionary}`]: exactUrl },
        { $pull: { [`examples.${dictionary}`]: exactUrl }, $set: { updatedAt: new Date() } },
        { new: true }
    ).select('word examples.longman examples.oxford examples.webster').lean();
    if (!updated) throw notFound('That example audio was not found; refresh the search and try again');
    return {
        word: updated.word,
        examples: DICTIONARIES.flatMap((source) => (updated.examples?.[source] || []).map((exampleUrl) => ({ dictionary: source, url: exampleUrl })))
    };
}

export async function replaceSchoolWordAudioExample({ schoolId, word, dictionary, url, replacementUrl }) {
    if (!DICTIONARIES.includes(dictionary)) throw badRequest('Unknown audio dictionary');
    const key = normalizeWordKey(word);
    const spellingWordKey = normalizeForGrading(word);
    const currentUrl = String(url || '').trim();
    const validatedReplacement = validateAudioUrl(replacementUrl);
    if (!key || !currentUrl || currentUrl.length > 500) throw badRequest('A word and current example audio URL are required');
    if (!validatedReplacement.ok || validatedReplacement.empty) {
        throw badRequest(validatedReplacement.reason || 'A replacement HTTPS audio URL is required');
    }
    if (!(await SpellingWord.exists({ school: schoolId, normalizedWord: spellingWordKey }))) {
        throw notFound('Spelling word not found in this school');
    }
    const updated = await WordAudio.findOneAndUpdate(
        {
            word: key,
            $and: [
                { [`examples.${dictionary}`]: currentUrl },
                { [`examples.${dictionary}`]: { $ne: validatedReplacement.url } }
            ]
        },
        { $set: { [`examples.${dictionary}.$`]: validatedReplacement.url, updatedAt: new Date() } },
        { new: true }
    ).select('word examples.longman examples.oxford examples.webster').lean();
    if (!updated) throw notFound('The example audio changed or the replacement is already listed; refresh the search and try again');
    return {
        word: updated.word,
        examples: DICTIONARIES.flatMap((source) => (updated.examples?.[source] || []).map((exampleUrl) => ({ dictionary: source, url: exampleUrl })))
    };
}

// Student-facing shape. Returns null when the word has no usable audio so callers add nothing.
export const buildAudioPayload = (doc) => {
    if (!doc) return null;
    const sections = {
        longman: { us: doc.longmanUS, uk: doc.longmanUK, examples: doc.examples?.longman },
        oxford: { us: doc.oxfordUS, uk: doc.oxfordUK, examples: doc.examples?.oxford },
        webster: { us: doc.websterUS, examples: doc.examples?.webster },
        google: { us: doc.googleUS, uk: doc.googleUK, examples: doc.examples?.google }
    };
    const dictionaries = {};
    for (const name of DICTIONARIES) {
        const section = {};
        if (sections[name].us) section.us = sections[name].us;
        if (sections[name].uk) section.uk = sections[name].uk;
        if (sections[name].examples?.length) section.examples = [...sections[name].examples];
        if (Object.keys(section).length > 0) dictionaries[name] = section;
    }
    const payload = {};
    if (Object.keys(dictionaries).length > 0) payload.dictionaries = dictionaries;
    if (doc.definition) payload.definition = doc.definition;
    return Object.keys(payload).length > 0 ? payload : null;
};

// Returns the same item object untouched unless the grade flag is on AND the word has audio.
export const decorateItemWithAudio = (item, enabled, doc) => {
    if (!item || !enabled) return item;
    const audio = buildAudioPayload(doc);
    return audio ? { ...item, audio } : item;
};

export async function isAudioEnabledForGrade(schoolId, grade) {
    if (!grade) return false;
    const setting = await SpellingAudioSettings.findOne({ school: schoolId, grade }).select('enabled').lean();
    return setting?.enabled === true;
}

// Fail-safe: any error returns the original result so students never lose their word.
export async function attachAudioToCurrentItem(result, schoolId) {
    try {
        if (!result?.item?.word || !(await isAudioEnabledForGrade(schoolId, result.item.grade))) return result;
        const doc = await WordAudio.findOne({ word: normalizeWordKey(result.item.word) }).lean();
        const item = decorateItemWithAudio(result.item, true, doc);
        return item === result.item ? result : { ...result, item };
    } catch {
        return result;
    }
}

export async function importWordAudio({ schoolId, content, dryRun = true }) {
    let rows;
    try {
        rows = parseWordAudioCsv(content);
    } catch (error) {
        throw badRequest(error.message);
    }
    const keys = [...new Set(rows.map((row) => normalizeWordKey(row.word)).filter(Boolean))];
    const existingDocs = keys.length > 0 ? await WordAudio.find({ word: { $in: keys } }).lean() : [];
    const existingByWord = new Map(existingDocs.map((doc) => [doc.word, doc]));
    const { operations, unchanged, report } = planWordAudioImport(rows, existingByWord);

    const appWords = await SpellingWord.find({ school: schoolId }).select('word').lean();
    const appKeys = new Set(appWords.map((item) => normalizeWordKey(item.word)));
    const importedKeys = new Set(keys);
    const wordsNotFoundInApp = keys.filter((key) => !appKeys.has(key));

    if (!dryRun && operations.length > 0) {
        await WordAudio.bulkWrite(operations.map((operation) => ({
            updateOne: {
                filter: { word: operation.word },
                update: { $set: { ...operation.set, updatedAt: new Date() }, $setOnInsert: { word: operation.word } },
                upsert: true
            }
        })), { ordered: false });
    }

    return {
        dryRun,
        rowsRead: report.rowsRead,
        rowsWithAudio: report.rowsWithAudio,
        wordsMatchedInApp: [...importedKeys].filter((key) => appKeys.has(key)).length,
        wordsNotFoundInApp: wordsNotFoundInApp.length,
        wordsNotFoundSample: wordsNotFoundInApp.slice(0, 50),
        urlsRejected: report.urlsRejected.length,
        urlsRejectedSample: report.urlsRejected.slice(0, 50),
        rowsSkipped: report.rowsSkipped,
        skippedSample: report.skipped.slice(0, 50),
        wordsToCreate: operations.filter((operation) => operation.isNew).length,
        wordsToUpdate: operations.filter((operation) => !operation.isNew).length,
        wordsUnchanged: unchanged
    };
}

export async function getAudioCoverage({ schoolId }) {
    const [words, audioDocs, settings] = await Promise.all([
        SpellingWord.find({ school: schoolId }).select('grade word').lean(),
        WordAudio.find({}).lean(),
        SpellingAudioSettings.find({ school: schoolId }).lean()
    ]);
    const audioByWord = new Map(audioDocs.map((doc) => [doc.word, doc]));
    const enabledByGrade = new Map(settings.map((setting) => [setting.grade, setting.enabled === true]));

    return GRADES.map((grade) => {
        const gradeWords = [...new Set(words.filter((item) => item.grade === grade).map((item) => normalizeWordKey(item.word)))];
        const counts = { longmanUS: 0, longmanUK: 0, oxfordUS: 0, oxfordUK: 0, websterUS: 0, googleUS: 0, googleUK: 0, withExamples: 0, withDefinition: 0 };
        const missing = [];
        for (const key of gradeWords) {
            const doc = audioByWord.get(key);
            for (const field of ['longmanUS', 'longmanUK', 'oxfordUS', 'oxfordUK', 'websterUS', 'googleUS', 'googleUK']) if (doc?.[field]) counts[field] += 1;
            if (DICTIONARIES.some((name) => doc?.examples?.[name]?.length)) counts.withExamples += 1;
            if (doc?.definition) counts.withDefinition += 1;
            if (!buildAudioPayload(doc)?.dictionaries) missing.push(key);
        }
        return {
            grade,
            enabled: enabledByGrade.get(grade) === true,
            totalWords: gradeWords.length,
            counts,
            wordsWithNoAudio: missing.sort()
        };
    });
}

export async function getAudioSettings({ schoolId }) {
    const settings = await SpellingAudioSettings.find({ school: schoolId }).select('grade enabled').lean();
    const byGrade = new Map(settings.map((setting) => [setting.grade, setting.enabled === true]));
    return GRADES.map((grade) => ({ grade, enabled: byGrade.get(grade) === true }));
}

export async function setAudioSetting({ schoolId, userId, grade, enabled }) {
    if (!GRADES.includes(grade)) throw badRequest('Invalid grade');
    if (typeof enabled !== 'boolean') throw badRequest('enabled must be true or false');
    await SpellingAudioSettings.findOneAndUpdate(
        { school: schoolId, grade },
        { $set: { enabled, updatedBy: userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { grade, enabled };
}
