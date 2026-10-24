import {
    OBJECTIVE_PRACTICE_QUESTION_TYPES,
    PRACTICE_MAX_OPTIONS,
    PRACTICE_MIN_OPTIONS,
    PRACTICE_MIN_PAIRS,
    PRACTICE_MIN_ORDER_ITEMS,
    PRACTICE_MAX_ORDER_ITEMS,
    PRACTICE_ORDER_SEPARATOR,
    PRACTICE_PAIR_SEPARATOR,
    PRACTICE_TERM_SEPARATOR,
    PRACTICE_VARIANT_SEPARATOR
} from '../../../../constants/practiceQuestionTypes.js';

const text = (value) => String(value ?? '').trim();

export const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const NUMERIC_MODES = ['exact', 'tolerance', 'relative', 'range'];

export const isObjectiveDraft = (questionType) =>
    OBJECTIVE_PRACTICE_QUESTION_TYPES.includes(questionType);

const emptyNumericRule = () => ({
    mode: 'exact',
    value: '',
    min: '',
    max: '',
    tolerance: '',
    unit: '',
    decimalPlaces: '',
    allowFractions: false,
    allowPercent: false
});

const toOptionRows = (options = []) =>
    OPTION_LABELS.map((label, index) => {
        const byLabel = options.find((option) => text(option?.label).toUpperCase() === label);
        const byIndex = options[index];
        return { label, text: text(byLabel?.text || byIndex?.text || '') };
    });

/** Rows are editable, so they carry their own label and only the filled ones reach the server. */
const filledRows = (rows = []) =>
    (Array.isArray(rows) ? rows : [])
        .map((row, index) => ({
            label: text(row?.label).toUpperCase() || OPTION_LABELS[index],
            text: text(row?.text)
        }))
        .filter((row) => row.text);

export const createInitialOptionRows = (options = []) => {
    const filled = toOptionRows(options).filter((row) => row.text);
    const count = Math.max(
        PRACTICE_MIN_OPTIONS,
        Math.min(PRACTICE_MAX_OPTIONS, filled.length || PRACTICE_MIN_OPTIONS + 2)
    );
    return OPTION_LABELS.slice(0, count).map((label, index) => ({
        label,
        text: filled[index]?.text || ''
    }));
};

/**
 * A CSV import stores its definition as the authored text column while the editor works with rows,
 * so every column grammar is read back here. The server re-parses the same column on save, so an
 * unusual string only affects what the teacher sees, never what is graded.
 */
const splitColumn = (value, separator) =>
    String(value ?? '')
        .split(separator)
        .map((entry) => entry.trim())
        .filter(Boolean);

const splitTerm = (chunk) => {
    const index = chunk.indexOf(PRACTICE_TERM_SEPARATOR);
    if (index === -1) return { head: chunk, body: '' };
    return {
        head: chunk.slice(0, index).trim(),
        body: chunk.slice(index + PRACTICE_TERM_SEPARATOR.length).trim()
    };
};

const NUMERIC_MODE_ALIASES = {
    exact: 'exact',
    tol: 'tolerance',
    tolerance: 'tolerance',
    rel: 'relative',
    relative: 'relative',
    range: 'range'
};

const readMatchingPairs = (column) =>
    splitColumn(column, PRACTICE_PAIR_SEPARATOR).map((chunk) => {
        const { head, body } = splitTerm(chunk);
        return { left: head, right: body };
    });

const readOrderingItems = (column) =>
    splitColumn(column, PRACTICE_ORDER_SEPARATOR).map((step) => ({ id: '', text: step }));

const readBlankRows = (column, questionText) => {
    const entries = splitColumn(column, PRACTICE_PAIR_SEPARATOR).map((chunk) => {
        const { head, body } = splitTerm(chunk);
        return { id: body ? head : '', acceptsText: body || head };
    });
    if (!entries.length) return [];
    const tokens = getBlankTokenIds(questionText);
    const named = entries.every((entry) => entry.id && tokens.includes(entry.id));
    if (named || tokens.length !== entries.length) return entries;
    // A positional column (answer per blank, in order) still belongs to the tokens on screen.
    return entries.map((entry, index) => ({ ...entry, id: tokens[index] }));
};

const readNumericRule = (column) => {
    const raw = text(column);
    if (!raw) return {};
    if (!raw.includes(PRACTICE_PAIR_SEPARATOR) && !raw.includes(PRACTICE_TERM_SEPARATOR)) {
        return { mode: 'exact', value: raw };
    }
    const segments = splitColumn(raw, PRACTICE_PAIR_SEPARATOR);
    const rule = {};
    segments.forEach((segment, index) => {
        const { head, body } = splitTerm(segment);
        if (index === 0) {
            const mode = NUMERIC_MODE_ALIASES[head.toLowerCase()] || 'exact';
            const parts = splitColumn(body || segment, PRACTICE_VARIANT_SEPARATOR);
            rule.mode = mode;
            if (mode === 'range') {
                rule.min = parts[0] || '';
                rule.max = parts[1] || '';
            } else {
                rule.value = parts[0] || '';
                rule.tolerance = parts[1] || '';
            }
            return;
        }
        const key = head.toLowerCase();
        if (key === 'unit') rule.unit = body;
        else if (key === 'decimal' || key === 'decimals') rule.decimalPlaces = body;
        else if (key === 'tolerance' || key === 'tol') rule.tolerance = body;
        else if (key === 'fractions') rule.allowFractions = body === 'on' || body === 'true';
        else if (key === 'percent') rule.allowPercent = body === 'on' || body === 'true';
        else if (key === 'mode') rule.mode = NUMERIC_MODE_ALIASES[body.toLowerCase()] || 'exact';
    });
    return rule;
};

const firstArray = (value) => (Array.isArray(value) && value.length ? value : null);

/**
 * A stored row keeps its key as one string while the editor needs the pieces it was built from,
 * so every objective type is expanded here and folded back on save.
 */
export const createObjectiveFields = (question = {}) => {
    const storedPairs = firstArray(question.matchingPairs);
    const storedItems = firstArray(question.orderingItems);
    const storedBlanks = firstArray(question.blanks);
    const storedRule = question.numericRule;

    return {
        optionRows: createInitialOptionRows(question.options),
        correctOptionIds: (Array.isArray(question.correctAnswer)
            ? question.correctAnswer
            : text(question.correctAnswer).split('|')
        ).map((entry) => text(entry).toUpperCase()).filter(Boolean),
        matchingPairs: (storedPairs || readMatchingPairs(question.matching_pairs)).map((pair) => ({
            left: text(pair?.left),
            right: text(pair?.right)
        })),
        orderingItems: (storedItems || readOrderingItems(question.ordering_items)).map((item) => ({
            id: text(item?.id),
            text: text(item?.text)
        })),
        blanks: (
            storedBlanks || readBlankRows(question.blank_answers, question.questionText)
        ).map((blank) => ({
            id: text(blank?.id),
            acceptsText: blank?.acceptsText !== undefined
                ? text(blank.acceptsText)
                : (Array.isArray(blank?.accepts) ? blank.accepts : [blank?.accepts])
                    .map(text)
                    .filter(Boolean)
                    .join(PRACTICE_VARIANT_SEPARATOR)
        })),
        numericRule: {
            ...emptyNumericRule(),
            ...(storedRule || readNumericRule(question.numeric_rule))
        }
    };
};

const emptyFields = () => ({
    options: [],
    matchingPairs: [],
    orderingItems: [],
    blanks: [],
    numericRule: null
});

/**
 * A brand new row starts with the minimum editable set already on screen, so the teacher sees what
 * the type asks for instead of an empty list.
 */
export const createBlankObjectiveFields = (questionType) => {
    const fresh = createObjectiveFields({});
    if (questionType === 'matching') {
        return { ...fresh, matchingPairs: Array.from({ length: PRACTICE_MIN_PAIRS }, () => ({ left: '', right: '' })) };
    }
    if (questionType === 'ordering') {
        return { ...fresh, orderingItems: Array.from({ length: PRACTICE_MIN_ORDER_ITEMS }, () => ({ id: '', text: '' })) };
    }
    return fresh;
};

/**
 * Only the authored definition is sent for the key-bearing types: the server derives the stored
 * key and the item ids from it, so an editor cannot leave a stale key behind.
 */
export const buildObjectivePayload = (questionType, draft = {}) => {
    if (questionType === 'multiple_select') {
        const options = filledRows(draft.optionRows);
        const used = new Set(options.map((option) => option.label));
        return {
            ...emptyFields(),
            options,
            correctAnswer: (draft.correctOptionIds || [])
                .filter((label) => used.has(text(label).toUpperCase()))
                .map((label) => text(label).toUpperCase())
                .join('|')
        };
    }

    if (questionType === 'matching') {
        return {
            ...emptyFields(),
            matchingPairs: (draft.matchingPairs || [])
                .map((pair) => ({ left: text(pair?.left), right: text(pair?.right) }))
                .filter((pair) => pair.left && pair.right)
        };
    }

    if (questionType === 'ordering') {
        return {
            ...emptyFields(),
            orderingItems: (draft.orderingItems || [])
                .map((item) => ({ id: text(item?.id), text: text(item?.text) }))
                .filter((item) => item.text)
        };
    }

    if (questionType === 'fill_in_blank') {
        return {
            ...emptyFields(),
            blanks: getBlankRows(draft, draft.questionText)
                .map((blank) => ({
                    id: text(blank?.id),
                    accepts: text(blank?.acceptsText)
                        .split(PRACTICE_VARIANT_SEPARATOR)
                        .map(text)
                        .filter(Boolean)
                }))
                .filter((blank) => blank.id && blank.accepts.length)
        };
    }

    if (questionType === 'numeric_response') {
        const rule = draft.numericRule || {};
        return {
            ...emptyFields(),
            numericRule: {
                ...emptyNumericRule(),
                mode: NUMERIC_MODES.includes(rule.mode) ? rule.mode : 'exact',
                value: text(rule.value),
                min: text(rule.min),
                max: text(rule.max),
                tolerance: rule.mode === 'range' ? '' : text(rule.tolerance),
                unit: text(rule.unit),
                decimalPlaces: text(rule.decimalPlaces),
                allowFractions: Boolean(rule.allowFractions),
                allowPercent: Boolean(rule.allowPercent)
            },
            // The rule is the answer, but the stored row still needs a readable key today.
            correctAnswer: rule.mode === 'range'
                ? `${text(rule.min)} to ${text(rule.max)}`
                : `${text(rule.value)}${text(rule.tolerance) ? ` ± ${text(rule.tolerance)}${rule.mode === 'relative' ? '%' : ''}` : ''}`
        };
    }

    return emptyFields();
};

/**
 * The question text owns the blanks: one row per {{token}} the teacher wrote, so a row can never
 * outlive the blank it belongs to.
 */
export const getBlankTokenIds = (questionText = '') => {
    const ids = [];
    const pattern = /\{\{\s*(?:blank:)?\s*([A-Za-z0-9_-]+)\s*\}\}/g;
    let match = pattern.exec(String(questionText ?? ''));
    while (match) {
        if (!ids.includes(match[1])) ids.push(match[1]);
        match = pattern.exec(String(questionText ?? ''));
    }
    return ids;
};

export const getBlankRows = (draft = {}, questionText = '') =>
    getBlankTokenIds(questionText).map((id) => ({
        id,
        acceptsText: (draft.blanks || []).find((blank) => text(blank?.id) === id)?.acceptsText || ''
    }));

/**
 * Returns a translation key plus params, or '' when the draft can be graded.
 */
export const getObjectiveDraftErrorKey = (questionType, draft = {}, questionText = '') => {
    if (questionType === 'multiple_select') {
        const filled = filledRows(draft.optionRows);
        if (filled.length < PRACTICE_MIN_OPTIONS) return 'objectiveOptionsFew';
        if (filled.length > PRACTICE_MAX_OPTIONS) return 'objectiveOptionsMany';
        if (new Set(filled.map((row) => row.text.toLowerCase())).size < filled.length) {
            return 'optionsDistinct';
        }
        const chosen = (draft.correctOptionIds || [])
            .filter((label) => filled.some((row) => row.label === text(label).toUpperCase()));
        if (chosen.length < PRACTICE_MIN_OPTIONS) return 'objectiveAnswersFew';
        return '';
    }

    if (questionType === 'matching') {
        const pairs = (draft.matchingPairs || [])
            .map((pair) => ({ left: text(pair?.left), right: text(pair?.right) }));
        if (pairs.some((pair) => !pair.left || !pair.right)) return 'pairsIncomplete';
        if (pairs.length < PRACTICE_MIN_PAIRS) return 'pairsFew';
        return '';
    }

    if (questionType === 'ordering') {
        const items = (draft.orderingItems || []).map((item) => text(item?.text)).filter(Boolean);
        if (items.length < PRACTICE_MIN_ORDER_ITEMS) return 'orderItemsFew';
        if (items.length > PRACTICE_MAX_ORDER_ITEMS) return 'orderItemsMany';
        if (new Set(items.map((item) => item.toLowerCase())).size < items.length) return 'orderItemsDistinct';
        return '';
    }

    if (questionType === 'fill_in_blank') {
        const tokens = getBlankTokenIds(questionText);
        if (!tokens.length) return 'blankTokensMissing';
        const answered = getBlankRows(draft, questionText).filter((blank) => text(blank.acceptsText));
        if (answered.length < tokens.length) return 'blankAnswersMissing';
        return '';
    }

    if (questionType === 'numeric_response') {
        const rule = draft.numericRule || {};
        if (rule.mode === 'range') {
            if (!text(rule.min) || !text(rule.max)) return 'numericRangeMissing';
            return '';
        }
        if (!text(rule.value)) return 'numericValueMissing';
        return '';
    }

    return '';
};
