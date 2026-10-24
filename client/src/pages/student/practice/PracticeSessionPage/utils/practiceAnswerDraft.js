import { getMatchingColumns, readMatchingSelections } from '../../../../../utils/mapPracticeMatching';
import { getBlankIds, getOrderingItems, readBlankAnswers, readOrderingOrder } from '../../../../../utils/mapPracticeObjectiveAnswers';

// Standards uses the same key-bearing types as MAP practice: each one submits a structured
// payload (labels, pairs, ids, blanks, a number) instead of a single option label.
export const OBJECTIVE_ANSWER_TYPES = [
    'multiple_select',
    'matching',
    'ordering',
    'fill_in_blank',
    'numeric_response'
];

export const isObjectiveAnswerType = (questionType) => OBJECTIVE_ANSWER_TYPES.includes(questionType);

/**
 * Partial credit is authored behaviour for matching and blanks, so one answer is enough to submit.
 * An ordering answer is only gradeable once every item is placed, so the button waits for the full set.
 */
export const isAnswerReady = (question, value) => {
    if (!question) return false;
    switch (question.questionType) {
        case 'multiple_select':
            return (Array.isArray(value) ? value : String(value ?? '').split('|'))
                .map((entry) => String(entry ?? '').trim())
                .filter(Boolean).length > 0;
        case 'matching':
            return readMatchingSelections(value).size > 0 && getMatchingColumns(question).terms.length > 0;
        case 'ordering': {
            const items = getOrderingItems(question).length;
            return items > 0 && readOrderingOrder(value).length === items;
        }
        case 'fill_in_blank':
            return readBlankAnswers(value).size > 0 && getBlankIds(question).length > 0;
        case 'numeric_response':
            return String(value ?? '').trim().length > 0;
        default:
            return false;
    }
};
