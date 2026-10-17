import { normalizeWordKey } from './wordAudio.js';

const csvCell = (value) => {
    const text = String(value ?? '').replace(/\r\n?|\n/g, ' ');
    const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
};

const maximumLength = (items, getValues) => items.reduce(
    (maximum, item) => Math.max(maximum, getValues(item).length),
    0
);

export const buildSpellingWordImportCsv = ({ words }) => {
    const headers = ['Grade', 'Week', 'Category', 'Word', 'Order', 'Definition'];
    const rows = (words || []).map((word) => [
        word.grade,
        word.week,
        word.category,
        word.word,
        word.order,
        word.definition || ''
    ]);
    return `\uFEFF${[headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n')}`;
};

export const buildSpellingWordAudioCsv = ({ words, audioEntries = [] }) => {
    const audioByWord = new Map(audioEntries.map((entry) => [normalizeWordKey(entry.word), entry]));
    const maxLongmanExamples = maximumLength(audioEntries, (entry) => entry.examples?.longman || []);
    const maxOxfordExamples = maximumLength(audioEntries, (entry) => entry.examples?.oxford || []);
    const maxWebsterExamples = maximumLength(audioEntries, (entry) => entry.examples?.webster || []);
    const headers = [
        'word',
        'Longman US',
        'Longman UK',
        'Oxford US',
        'Oxford UK',
        'Webster US',
        'status',
        'first week',
        'definition',
        ...Array.from({ length: maxLongmanExamples }, (_, index) => `Longman example ${index + 1}`),
        ...Array.from({ length: maxOxfordExamples }, (_, index) => `Oxford example ${index + 1}`),
        ...Array.from({ length: maxWebsterExamples }, (_, index) => `Webster example ${index + 1}`)
    ];

    const rows = (words || []).map((word) => {
        const audio = audioByWord.get(normalizeWordKey(word.word)) || {};
        const values = [
            word.word,
            audio.longmanUS || '',
            audio.longmanUK || '',
            audio.oxfordUS || '',
            audio.oxfordUK || '',
            audio.websterUS || '',
            '',
            word.week || '',
            audio.definition || word.definition || '',
            ...(audio.examples?.longman || []),
            ...Array(Math.max(0, maxLongmanExamples - (audio.examples?.longman || []).length)).fill(''),
            ...(audio.examples?.oxford || []),
            ...Array(Math.max(0, maxOxfordExamples - (audio.examples?.oxford || []).length)).fill(''),
            ...(audio.examples?.webster || []),
            ...Array(Math.max(0, maxWebsterExamples - (audio.examples?.webster || []).length)).fill('')
        ];
        return values.map(csvCell).join(',');
    });

    return `\uFEFF${[headers.map(csvCell).join(','), ...rows].join('\r\n')}`;
};

export const buildSpellingWordLibraryCsv = ({ words, audioEntries, dictionaryEntries }) => {
    const audioByWord = new Map(audioEntries.map((entry) => [normalizeWordKey(entry.word), entry]));
    const dictionaryByWord = new Map(dictionaryEntries.map((entry) => [normalizeWordKey(entry.word), entry]));
    const maxLongmanExamples = maximumLength(audioEntries, (entry) => entry.examples?.longman || []);
    const maxOxfordExamples = maximumLength(audioEntries, (entry) => entry.examples?.oxford || []);
    const maxWebsterExamples = maximumLength(audioEntries, (entry) => entry.examples?.webster || []);
    const maxDictionaryDefinitions = maximumLength(dictionaryEntries, (entry) => entry.definitions || []);
    const maxDictionaryExamples = maximumLength(
        dictionaryEntries,
        (entry) => (entry.definitions || []).map((definition) => definition.example || '')
    );
    const headers = [
        'Grade',
        'Week',
        'Category',
        'Word',
        'Order',
        'Definition',
        'Longman US',
        'Longman UK',
        'Oxford US',
        'Oxford UK',
        'Webster US',
        ...Array.from({ length: maxLongmanExamples }, (_, index) => `Longman example ${index + 1}`),
        ...Array.from({ length: maxOxfordExamples }, (_, index) => `Oxford example ${index + 1}`),
        ...Array.from({ length: maxWebsterExamples }, (_, index) => `Webster example ${index + 1}`),
        'Curriculum definition',
        'Phonetic transcription',
        'Dictionary audio',
        'Dictionary status',
        ...Array.from({ length: maxDictionaryDefinitions }, (_, index) => `Dictionary part of speech ${index + 1}`),
        ...Array.from({ length: maxDictionaryDefinitions }, (_, index) => `Dictionary definition ${index + 1}`),
        ...Array.from({ length: maxDictionaryExamples }, (_, index) => `Dictionary example ${index + 1}`)
    ];
    const rows = words.map((word) => {
        const audio = audioByWord.get(normalizeWordKey(word.word)) || {};
        const dictionary = dictionaryByWord.get(normalizeWordKey(word.word)) || {};
        const definitions = dictionary.definitions || [];
        const values = [
            word.grade,
            word.week,
            word.category,
            word.word,
            word.order,
            audio.definition || word.definition || '',
            audio.longmanUS,
            audio.longmanUK,
            audio.oxfordUS,
            audio.oxfordUK,
            audio.websterUS,
            ...(audio.examples?.longman || []),
            ...Array(Math.max(0, maxLongmanExamples - (audio.examples?.longman || []).length)).fill(''),
            ...(audio.examples?.oxford || []),
            ...Array(Math.max(0, maxOxfordExamples - (audio.examples?.oxford || []).length)).fill(''),
            ...(audio.examples?.webster || []),
            ...Array(Math.max(0, maxWebsterExamples - (audio.examples?.webster || []).length)).fill(''),
            word.definition,
            dictionary.phonetic,
            dictionary.audioUrl,
            dictionary.status,
            ...Array.from({ length: maxDictionaryDefinitions }, (_, index) => definitions[index]?.partOfSpeech || ''),
            ...Array.from({ length: maxDictionaryDefinitions }, (_, index) => definitions[index]?.definition || ''),
            ...Array.from({ length: maxDictionaryExamples }, (_, index) => definitions[index]?.example || '')
        ];
        return values.map(csvCell).join(',');
    });

    return `\uFEFF${[headers.map(csvCell).join(','), ...rows].join('\r\n')}`;
};
