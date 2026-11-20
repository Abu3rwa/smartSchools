// One rule set for pack questions. Editor saves and CSV rows both go through
// validateGameItem, so a question accepted by one path is accepted by the
// other. Over-long text is rejected, never silently shortened.
// Types and answer encodings are the shared practice system's; grading reuses
// its deterministic objective graders. No AI ever grades a SkillPath answer.
import mongoose from 'mongoose';
import {
    resolvePracticeQuestionType,
    PRACTICE_MIN_ORDER_ITEMS,
    PRACTICE_MAX_ORDER_ITEMS,
    PRACTICE_PAIR_SEPARATOR,
    PRACTICE_TERM_SEPARATOR,
    PRACTICE_ORDER_SEPARATOR
} from '../constants/practiceQuestionTypes.js';
import {
    readMatchingDefinition,
    parseOrderingItems,
    encodeOrderingKey,
    parseNumericRule,
    parseOptionKeySet,
    definitionToColumns
} from './assessment/answerFormat.js';
import { normalizeGameAnswer, normalizeTrueFalse, shuffleGameItems } from './languageGameScoring.js';

export const ITEM_TYPES = [
    'multiple_choice',
    'true_false',
    'multiple_select',
    'matching',
    'ordering',
    'fill_in_blank',
    'numeric_response'
];
export const MAX_PACK_ITEMS = 2000;

export const ITEM_LIMITS = Object.freeze({
    externalId: 80,
    prompt: 1000,
    option: 500,
    optionId: 40,
    minOptions: 2,
    maxOptions: 6,
    acceptedAnswer: 300,
    maxAcceptedAnswers: 20,
    explanation: 1000,
    matchingTerm: 120,
    maxPairs: 6,
    orderingText: 200,
    correctAnswer: 2000
});

const BLANK = '___';

const trimmed = (value) => String(value ?? '').trim();

const parseOptions = (raw, add, tooLong) => {
    const options = [];
    const ids = new Set();
    for (const option of Array.isArray(raw?.options) ? raw.options : []) {
        const id = trimmed(option?.id);
        const label = trimmed(option?.text);
        if (!id || !label) continue;
        if (id.length > ITEM_LIMITS.optionId) add('options', `Option id ${id} is too long`);
        if (ids.has(id)) add('options', `Option id ${id} is used twice`);
        ids.add(id);
        tooLong('options', label, ITEM_LIMITS.option, `Option "${label.slice(0, 30)}"`);
        options.push({ id, text: label });
    }
    if (options.length < ITEM_LIMITS.minOptions) add('options', 'A multiple-choice question needs at least two options');
    if (options.length > ITEM_LIMITS.maxOptions) add('options', `A multiple-choice question can have at most ${ITEM_LIMITS.maxOptions} options`);
    const labels = new Set();
    for (const option of options) {
        const label = normalizeGameAnswer(option.text);
        if (labels.has(label)) add('options', `Option "${option.text}" is repeated`);
        labels.add(label);
    }
    return options;
};

const pairsToColumn = (pairs) => (Array.isArray(pairs) ? pairs : [])
    .map((pair) => (typeof pair === 'string' ? pair.trim() : `${trimmed(pair?.left)}${PRACTICE_TERM_SEPARATOR}${trimmed(pair?.right)}`))
    .filter(Boolean)
    .join(PRACTICE_PAIR_SEPARATOR);

// field names match the editor model; the CSV layer maps them to columns.
export const validateGameItem = (raw) => {
    const errors = [];
    const add = (field, message) => errors.push({ field, message });
    const tooLong = (field, value, max, label) => {
        if (value.length > max) add(field, `${label} is ${value.length} characters; the limit is ${max}`);
    };

    const externalId = trimmed(raw?.externalId);
    const type = resolvePracticeQuestionType(raw?.type);
    const prompt = trimmed(raw?.prompt);
    const skillId = trimmed(raw?.skillId);
    const explanation = trimmed(raw?.explanation);

    if (!externalId) add('externalId', 'Every question needs an id');
    tooLong('externalId', externalId, ITEM_LIMITS.externalId, 'The question id');
    if (!ITEM_TYPES.includes(type)) add('type', `type must be one of: ${ITEM_TYPES.join(', ')}`);
    if (!prompt) add('prompt', 'The question text is required');
    tooLong('prompt', prompt, ITEM_LIMITS.prompt, 'The question text');
    tooLong('explanation', explanation, ITEM_LIMITS.explanation, 'The explanation');
    if (!mongoose.isValidObjectId(skillId)) add('skillId', 'Choose a skill for this question');

    let options = [];
    let correctOptionId = '';
    let correctAnswer = '';
    let acceptedAnswers = [];
    let matchingPairs = [];
    let orderingItems = [];
    let numericRule = null;

    if (type === 'multiple_choice') {
        options = parseOptions(raw, add, tooLong);
        correctOptionId = trimmed(raw?.correctOptionId);
        if (!options.some((option) => option.id === correctOptionId)) {
            add('correctOptionId', 'Mark one of the options as correct');
        }
    } else if (type === 'multiple_select') {
        options = parseOptions(raw, add, tooLong);
        const rawKeys = Array.isArray(raw?.correctAnswer)
            ? raw.correctAnswer.map((key) => trimmed(key)).filter(Boolean).join(PRACTICE_PAIR_SEPARATOR)
            : trimmed(raw?.correctAnswer);
        const { keys, error } = parseOptionKeySet(rawKeys);
        if (error) {
            add('correctAnswer', 'Mark at least two options as correct, separated by |');
        } else {
            const byId = new Map(options.map((option) => [option.id.toUpperCase(), option.id]));
            const unknown = keys.filter((key) => !byId.has(key));
            if (unknown.length > 0) {
                add('correctAnswer', `Correct answer key ${unknown.join(', ')} is not one of the options`);
            } else {
                correctAnswer = keys.join(PRACTICE_PAIR_SEPARATOR);
            }
        }
    } else if (type === 'true_false') {
        const value = normalizeTrueFalse(raw?.correctAnswer);
        if (!value) add('correctAnswer', 'Mark the correct answer as true or false');
        else correctAnswer = value;
    } else if (type === 'matching') {
        const column = typeof raw?.matchingPairs === 'string' ? raw.matchingPairs.trim() : pairsToColumn(raw?.matchingPairs);
        const { pairs, error } = readMatchingDefinition(column);
        if (error) {
            add('matchingPairs', error);
        } else {
            if (pairs.length > ITEM_LIMITS.maxPairs) add('matchingPairs', `A matching question can have at most ${ITEM_LIMITS.maxPairs} pairs`);
            for (const pair of pairs) {
                tooLong('matchingPairs', pair.left, ITEM_LIMITS.matchingTerm, `Term "${pair.left.slice(0, 30)}"`);
                tooLong('matchingPairs', pair.right, ITEM_LIMITS.matchingTerm, `Match "${pair.right.slice(0, 30)}"`);
            }
            matchingPairs = pairs;
            correctAnswer = pairs.map((pair) => `${pair.left}${PRACTICE_TERM_SEPARATOR}${pair.right}`).join(PRACTICE_PAIR_SEPARATOR);
        }
    } else if (type === 'ordering') {
        const structured = Array.isArray(raw?.orderingItems) && raw.orderingItems.every((entry) => entry && typeof entry === 'object' && trimmed(entry.id));
        if (structured) {
            // Pool imports carry hashed ids already; keep them so the stored
            // answer key stays valid.
            const seen = new Set();
            for (const entry of raw.orderingItems) {
                const id = trimmed(entry.id);
                const text = trimmed(entry.text);
                if (!text) continue;
                if (id.length > ITEM_LIMITS.optionId) add('orderingItems', `Item id ${id} is too long`);
                if (seen.has(id)) add('orderingItems', `Item id ${id} is used twice`);
                seen.add(id);
                tooLong('orderingItems', text, ITEM_LIMITS.orderingText, `Item "${text.slice(0, 30)}"`);
                orderingItems.push({ id, text });
            }
            if (orderingItems.length < PRACTICE_MIN_ORDER_ITEMS) add('orderingItems', `An ordering question needs at least ${PRACTICE_MIN_ORDER_ITEMS} items`);
            if (orderingItems.length > PRACTICE_MAX_ORDER_ITEMS) add('orderingItems', `An ordering question can have at most ${PRACTICE_MAX_ORDER_ITEMS} items`);
            correctAnswer = encodeOrderingKey(orderingItems);
        } else {
            const column = Array.isArray(raw?.orderingItems)
                ? raw.orderingItems.map((entry) => trimmed(typeof entry === 'string' ? entry : entry?.text)).filter(Boolean).join(PRACTICE_ORDER_SEPARATOR)
                : trimmed(raw?.orderingItems || raw?.ordering_items);
            const { items, error } = parseOrderingItems(column, { salt: externalId });
            if (error) {
                add('orderingItems', error);
            } else {
                for (const item of items) tooLong('orderingItems', item.text, ITEM_LIMITS.orderingText, `Item "${item.text.slice(0, 30)}"`);
                orderingItems = items;
                correctAnswer = encodeOrderingKey(items);
            }
        }
    } else if (type === 'numeric_response') {
        const column = typeof raw?.numericRule === 'string'
            ? raw.numericRule.trim()
            : (definitionToColumns({ numericRule: raw?.numericRule }).numeric_rule || trimmed(raw?.numeric_rule));
        const { rule, error } = parseNumericRule(column);
        if (error) {
            add('numericRule', error);
        } else {
            numericRule = rule;
            correctAnswer = rule.mode === 'range'
                ? `${rule.min}-${rule.max}${rule.unit ? ` ${rule.unit}` : ''}`
                : `${rule.value}${rule.tolerance ? ` ±${rule.tolerance}${rule.mode === 'relative' ? '%' : ''}` : ''}${rule.unit ? ` ${rule.unit}` : ''}`;
        }
    } else if (type === 'fill_in_blank') {
        if (prompt.split(BLANK).length - 1 !== 1) {
            add('prompt', `Typed-answer questions must contain exactly one ${BLANK} blank`);
        }
        const seen = new Set();
        for (const entry of Array.isArray(raw?.acceptedAnswers) ? raw.acceptedAnswers : []) {
            const answer = trimmed(entry);
            if (!answer) continue;
            tooLong('acceptedAnswers', answer, ITEM_LIMITS.acceptedAnswer, `Answer "${answer.slice(0, 30)}"`);
            const normalized = normalizeGameAnswer(answer);
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            acceptedAnswers.push(answer);
        }
        if (acceptedAnswers.length === 0) add('acceptedAnswers', 'Add at least one accepted answer');
        if (acceptedAnswers.length > ITEM_LIMITS.maxAcceptedAnswers) {
            add('acceptedAnswers', `A question can have at most ${ITEM_LIMITS.maxAcceptedAnswers} accepted answers`);
        }
    }

    tooLong('correctAnswer', correctAnswer, ITEM_LIMITS.correctAnswer, 'The correct answer');
    const difficulty = Number(raw?.difficulty);
    if (![1, 2, 3].includes(difficulty)) add('difficulty', 'difficulty must be 1, 2 or 3');

    if (errors.length > 0) return { item: null, errors };
    return {
        item: {
            externalId,
            type,
            prompt,
            options: type === 'multiple_choice' || type === 'multiple_select' ? options : [],
            correctOptionId,
            correctAnswer,
            acceptedAnswers,
            matchingPairs,
            orderingItems,
            numericRule,
            explanation,
            skillId,
            difficulty
        },
        errors
    };
};

export const sanitizePackItems = (rawItems) => {
    const errors = [];
    const items = [];
    const seenIds = new Set();
    const list = Array.isArray(rawItems) ? rawItems : [];

    if (list.length > MAX_PACK_ITEMS) {
        errors.push({ index: -1, field: 'items', message: `A pack cannot hold more than ${MAX_PACK_ITEMS} questions` });
        return { items: [], errors };
    }

    list.forEach((raw, index) => {
        const result = validateGameItem(raw);
        if (result.errors.length > 0) {
            errors.push(...result.errors.map((error) => ({ index, ...error })));
            return;
        }
        if (seenIds.has(result.item.externalId)) {
            errors.push({ index, field: 'externalId', message: `Duplicate question id ${result.item.externalId}` });
            return;
        }
        seenIds.add(result.item.externalId);
        items.push(result.item);
    });

    return { items, errors };
};

// Deterministic per-session shuffle: stable across reads of the same session,
// different between sessions, so a resumed session never rearranges itself.
const seededRng = (seed) => {
    let hash = 2166136261;
    for (const character of String(seed)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    let state = hash >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// Published packs written before the canonical type names still carry
// `mcq`/`fill_blank`. Their stored documents are never rewritten, but every
// write that copies items into a typed schema (assignment, session, published
// revision) must normalize first or Mongoose rejects the legacy value.
export const canonicalizeGameItem = (item) => {
    const plain = typeof item?.toObject === 'function' ? item.toObject() : { ...item };
    plain.type = resolvePracticeQuestionType(plain.type);
    return plain;
};

export const canonicalizeGameItems = (items) => (
    Array.isArray(items) ? items.map(canonicalizeGameItem) : []
);

// The live student client still speaks the two legacy type names; new types
// travel under their canonical shared names.
const WIRE_LEGACY_TYPES = { multiple_choice: 'mcq', fill_in_blank: 'fill_blank' };

// What the student receives. Answer rules never leave the server before the
// answer is accepted; after that the client may reveal the result.
export const publicSessionItem = (item, seed = '') => {
    const type = resolvePracticeQuestionType(item.type);
    const view = {
        externalId: item.externalId,
        type: WIRE_LEGACY_TYPES[type] || type,
        prompt: item.prompt,
        skillId: String(item.skillId),
        difficulty: item.difficulty
    };
    if (type === 'multiple_choice' || type === 'multiple_select') {
        view.options = (item.options || []).map((option) => ({ id: option.id, text: option.text }));
    }
    if (type === 'matching') {
        const pairs = item.matchingPairs || [];
        const rng = seededRng(`${seed}:${item.externalId}:matching`);
        view.matchingLefts = pairs.map((pair) => pair.left);
        view.matchingRights = shuffleGameItems(pairs.map((pair) => pair.right), rng);
    }
    if (type === 'ordering') {
        const rng = seededRng(`${seed}:${item.externalId}:ordering`);
        view.orderingItems = shuffleGameItems(
            (item.orderingItems || []).map((entry) => ({ id: entry.id, text: entry.text })),
            rng
        );
    }
    return view;
};

export const revealForItem = (item) => {
    const type = resolvePracticeQuestionType(item.type);
    let expected = '';
    if (type === 'multiple_choice') expected = item.correctOptionId || '';
    else if (type === 'fill_in_blank') expected = item.acceptedAnswers?.[0] || '';
    else if (type === 'true_false') expected = item.correctAnswer || '';
    else if (type === 'multiple_select') {
        const keys = new Set(String(item.correctAnswer || '').split(PRACTICE_PAIR_SEPARATOR).map((key) => key.trim().toUpperCase()).filter(Boolean));
        expected = (item.options || [])
            .filter((option) => keys.has(String(option.id).toUpperCase()))
            .map((option) => option.text)
            .join('; ');
    } else if (type === 'matching') {
        expected = (item.matchingPairs || []).map((pair) => `${pair.left} = ${pair.right}`).join('; ');
    } else if (type === 'ordering') {
        expected = (item.orderingItems || []).map((entry) => entry.text).join(` ${PRACTICE_ORDER_SEPARATOR} `);
    } else if (type === 'numeric_response') {
        expected = item.correctAnswer || '';
    }
    return { expected, explanation: item.explanation || '' };
};