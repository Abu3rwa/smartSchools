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
