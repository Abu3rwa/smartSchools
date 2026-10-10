import { normalizeWord, parsePartOfSpeech, posKeyOf } from './vocabCsv.js';

// Entry syntax: "word (pos)" with optional "|form:base" and "|note:text".
const RAW_LISTS = {
    'S1-L1': ['debris (n.)', 'emphasis (n.)', 'encounter (n.)', 'generation (n.)', 'indicate (v.)', 'naturalist (n.)', 'sheer (adj.)', 'spectacular (adj.)'],
    'S1-L2': ['afford (v.)', 'loan (n.)', 'profit (n.)', 'prosper (v.)', 'risk (n.)', 'savings (n.)|plural:saving', 'scarce (adj.)', 'wages (n.)|plural:wage'],
    'S1-L3': ['access (v.)', 'advance (v.)', 'analysis (n.)', 'cite (v.)', 'counterpoint (n.)', 'data (n.)', 'drawback (n.)', 'reasoning (n.)'],
    'S1-L4': ['proposal (n.)', 'convention (n.)', 'representatives (n.)|plural:representative', 'debate (v./n.)', 'situation (n.)', 'resolve (v.)', 'union (n.)', 'committees (n.)|plural:committee'],
    'S1-L5': ['assure (v.)', 'detect (v.)', 'emerge (v.)', 'gratitude (n.)', 'guidance (n.)', 'outcome (n.)', 'previous (adj.)', 'pursuit (n.)'],
    'S1-L6': ['memorize (v.)', 'ambitious (adj.)', 'shudder (v.)', 'satisfaction (n.)'],
    'S1-L7': ['congratulate (v.)', 'compliment (v.)', 'blurt (v.)', 'contradict (v.)', 'misunderstanding (n.)', 'cultural (adj.)', 'critical (adj.)', 'appreciation (n.)'],
    'S2-L1': ['artificial (adj.)', 'collaborate (v.)', 'function (n.)', 'dedicated (adj.)|past:dedicate', 'flexible (adj.)', 'mimic (v.)', 'obstacle (n.)', 'technique (n.)'],
    'S2-L2': ['archaeologist (n.)', 'era (n.)', 'fragment (n.)', 'historian (n.)', 'intact (adj.)', 'preserved (v.)|past:preserve', 'reconstruct (v.)', 'remnants (n.)'],
    'S2-L3': ['outspoken (adj.)', 'defy (v.)', 'entitled (adj.)|past:entitle', 'seek (v.)|note:sought (past tense)', 'unequal (adj.)', 'reserved (adj.)|past:reserve', 'neutral (adj.)', 'anticipation (n.)'],
    'S2-L4': ['perplexed (adj.)|past:perplex', 'astounded (adj.)|past:astound', 'precise (adj.)', 'interpret (v.)', 'inquisitive (adj.)', 'suspicious (adj.)', 'reconsider (v.)', 'conceal (v.)'],
    'S2-L5': ['meaningful (adj.)', 'expression (n.)', 'plumes (n.)|plural:plume', 'barren (adj.)'],
    'S2-L6': ['evaluate (v.)', 'sphere (n.)', 'approximately (adv.)', 'diameter (n.)', 'astronomical (adj.)', 'criteria (n.)|plural:criterion', 'orbit (v.)', 'calculation (n.)']
};

const parseEntry = (entry) => {
    const [main, ...extras] = entry.split('|');
    const match = /^(.+?)\s*\(([^)]+)\)$/.exec(main.trim());
    const partOfSpeech = parsePartOfSpeech(match[2]);
    const word = { word: match[1].trim(), partOfSpeech, form: '', baseWord: '', notes: '' };
    for (const extra of extras) {
        const [key, value] = extra.split(/:(.+)/);
        if (key === 'note') word.notes = value;
        else { word.form = key; word.baseWord = value; }
    }
    return { ...word, normalizedWord: normalizeWord(word.word), posKey: posKeyOf(partOfSpeech) };
};

export const buildSeedData = () => {
    const lists = [];
    const words = [];
    for (const [listId, entries] of Object.entries(RAW_LISTS)) {
        const [, semester, listNumber] = /^S(\d)-L(\d+)$/.exec(listId);
        lists.push({
            listId,
            semester: Number(semester),
            listNumber: Number(listNumber),
            title: `Semester ${semester} - List ${listNumber}`,
            order: Number(listNumber)
        });
        for (const entry of entries) words.push({ listId, ...parseEntry(entry) });
    }
    return { lists, words };
};
