// Published standard pools are the second authoring channel. Pool questions
// already carry structured answer definitions, so they are mapped into the
// same draft shape the CSV parser produces — preview, fingerprint,
// confirmations and commit then behave identically for both channels.
import { resolvePracticeQuestionType } from '../constants/practiceQuestionTypes.js';
import { validateGameItem } from './languageGameItems.js';
import { BLANK_TOKEN_PATTERN, findBlankTokens } from './assessment/answerFormat.js';

const DIFFICULTY = { easy: 1, medium: 2, hard: 3 };
const BLANK = '___';

export const mapPoolQuestion = (question, index) => {
    const rowNumber = index + 1;
    const fail = (column, message) => ({ item: null, errors: [{ row: rowNumber, column, message }] });
    const type = resolvePracticeQuestionType(question.questionType);

    if (type === 'short_answer') {
        return fail('type', 'Free-text answers are not supported in SkillPath. Rewrite this as a fill-in-the-blank question in the pool.');
    }

    let prompt = String(question.questionText || '').trim();
    const passage = String(question.passageText || '').trim();
    if (passage) prompt = `${passage}\n\n${prompt}`;

    let acceptedAnswers = [];
    if (type === 'fill_in_blank') {
        const tokens = findBlankTokens(question.questionText);
        if (tokens.length !== 1) {
            return fail('prompt', 'SkillPath fill-in-the-blank questions need exactly one blank written as {{b1}}.');
        }
        prompt = prompt.replace(new RegExp(BLANK_TOKEN_PATTERN.source, 'g'), BLANK);
        const blank = (question.blanks || []).find((entry) => String(entry.id) === tokens[0]) || question.blanks?.[0];
        acceptedAnswers = [...(blank?.accepts || []), ...(question.acceptableAnswers || [])];
    }

    const options = (question.options || []).map((option, position) => ({
        id: String(option.label || '').trim() || String(position + 1),
        text: String(option.text || '').trim()
    }));

    const result = validateGameItem({
        externalId: String(question._id),
        type,
        prompt,
        options,
        correctOptionId: type === 'multiple_choice' ? String(question.correctAnswer || '').trim() : '',
        correctAnswer: type === 'multiple_select' || type === 'true_false' ? question.correctAnswer : '',
        acceptedAnswers,
        matchingPairs: question.matchingPairs || [],
        orderingItems: question.orderingItems || [],
        numericRule: question.numericRule || String(question.correctAnswer || ''),
        explanation: String(question.explanation || '').trim(),
        skillId: '0'.repeat(24),
        difficulty: DIFFICULTY[question.difficulty] || 2
    });
    if (result.errors.length > 0) {
        return { item: null, errors: result.errors.map((error) => ({ row: rowNumber, column: error.field, message: error.message })) };
    }
    return {
        item: {
            ...result.item,
            rowNumber,
            skillKey: '',
            skillName: '',
            standardCodes: []
        },
        errors: []
    };
};

export const buildPoolDraft = (pool, questionIds = []) => {
    const wanted = questionIds.length > 0 ? new Set(questionIds.map(String)) : null;
    const selected = (pool.questions || []).filter((question) => !wanted || wanted.has(String(question._id)));
    const errors = [];
    const items = [];
    selected.forEach((question, index) => {
        const mapped = mapPoolQuestion(question, index);
        if (mapped.errors.length > 0) {
            errors.push(...mapped.errors);
            return;
        }
        items.push(mapped.item);
    });
    if (wanted && selected.length < wanted.size) {
        errors.push({ row: 0, column: 'questionIds', message: 'One of the selected questions is no longer in this pool. Refresh the pool and choose again.' });
    }
    return {
        type: '',
        target: 'single',
        packs: [{ packKey: '__single__', title: '', description: '', language: '', gradeLevels: [], firstRow: 1, items }],
        errors: errors.sort((a, b) => a.row - b.row),
        totalRows: selected.length,
        validRows: items.length,
        invalidRows: selected.length - items.length
    };
};