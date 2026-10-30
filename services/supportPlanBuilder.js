import {
    CONCERN_KEYS,
    buildGoalFromTemplate,
    roundOneQuestions,
} from './supportLibrary.js';

/** One answer as a 0–1 score, so a scale and a choice can be compared. */
export const answerRatio = (answer, question) => {
    if (!answer || !question) return null;
    if (question.kind === 'scale') {
        const max = Number(question.scaleMax) || 4;
        const value = Number(answer.scaleValue);
        if (!Number.isFinite(value) || value < 1) return null;
        return Math.min(1, Math.max(0, (value - 1) / (max - 1 || 1)));
    }
    if (question.kind === 'choice') {
        const options = Array.isArray(question.options) ? question.options : [];
        const index = Number.isInteger(answer.choiceIndex)
            ? answer.choiceIndex
            : options.indexOf(answer.choiceValue);
        if (index < 0 || options.length < 2) return null;
        return Math.min(1, index / (options.length - 1));
    }
    return null;
};

const answerFor = (survey, questionId) => (
    (survey.answers || []).find((answer) => answer.questionId === questionId) || null
);

/**
 * Average every scored answer by its concern. Text answers become comments for
 * the homeroom teacher, never part of a score.
 */
export const analyzeSurveys = (surveys = []) => {
    const sums = new Map();
    const comments = [];
    let teacherCount = 0;
    let parentCount = 0;

    for (const survey of surveys) {
        if (!survey || survey.status !== 'submitted') continue;
        if (survey.audience === 'parent') parentCount += 1;
        else teacherCount += 1;

        for (const question of survey.questions || []) {
            const answer = answerFor(survey, question.id);
            if (!answer) continue;
            if (question.kind === 'text') {
                const text = String(answer.textValue || '').trim();
                if (text) {
                    comments.push({
                        questionId: question.id,
                        audience: survey.audience,
                        text: text.slice(0, 600),
                    });
                }
                continue;
            }
            const ratio = answerRatio(answer, question);
            if (ratio === null) continue;
            const key = question.key;
            if (!CONCERN_KEYS.includes(key)) continue;
            const entry = sums.get(key) || { key, total: 0, count: 0, domain: question.domain };
            entry.total += ratio;
            entry.count += 1;
            sums.set(key, entry);
        }
    }

    const scores = [...sums.values()]
        .map((entry) => ({
            key: entry.key,
            domain: entry.domain,
            score: Number((entry.total / entry.count).toFixed(3)),
            answers: entry.count,
        }))
        .sort((a, b) => a.score - b.score);

    return { scores, comments, teacherCount, parentCount };
};

/**
 * The plan focuses on the two or three lowest areas, but always keeps one
 * academic and one character goal when the data covers both.
 */
export const pickFocusConcerns = (scores = [], max = 3) => {
    const ranked = scores.map((entry) => entry.key);
    if (ranked.length === 0) return [];
    const picked = [];
    for (const key of ranked) {
        if (picked.length >= max) break;
        picked.push(key);
    }
    if (picked.length >= 2) {
        const domains = picked.map((key) => scores.find((entry) => entry.key === key)?.domain);
        const hasAcademic = domains.includes('academic');
        const hasCharacter = domains.includes('character');
        if (!hasAcademic || !hasCharacter) {
            const missing = hasAcademic ? 'character' : 'academic';
            const candidate = scores.find(
                (entry) => entry.domain === missing && !picked.includes(entry.key),
            );
            if (candidate) {
                picked[picked.length - 1] = candidate.key;
            }
        }
    }
    return picked;
};

export const buildPlanDraft = (surveys = []) => {
    const analysis = analyzeSurveys(surveys);
    if (analysis.teacherCount + analysis.parentCount === 0) {
        return null;
    }

    const focusKeys = pickFocusConcerns(analysis.scores, 3);
    const goals = focusKeys
        .map((key) => buildGoalFromTemplate(key))
        .filter(Boolean);

    const strengthKeys = analysis.scores
        .filter((entry) => entry.score >= 0.7 && !focusKeys.includes(entry.key))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map((entry) => entry.key);

    return {
        focusKeys,
        strengthKeys,
        goals,
        teacherCount: analysis.teacherCount,
        parentCount: analysis.parentCount,
        scores: analysis.scores,
        comments: analysis.comments,
    };
};

export const missingRequiredQuestions = (survey) => {
    const answered = new Set(
        (survey.answers || [])
            .filter((answer) => (
                answer.scaleValue != null
                || Number.isInteger(answer.choiceIndex)
                || String(answer.choiceValue || '').trim() !== ''
                || String(answer.textValue || '').trim() !== ''
            ))
            .map((answer) => answer.questionId),
    );
    return (survey.questions || [])
        .filter((question) => question.required && !answered.has(question.id))
        .map((question) => question.id);
};

export const normalizeAnswer = (incoming = {}, question) => {
    const answer = {
        questionId: question.id,
        scaleValue: null,
        choiceIndex: null,
        choiceValue: '',
        textValue: '',
        answeredAt: new Date(),
    };
    if (question.kind === 'scale') {
        const value = Number(incoming.scaleValue);
        if (Number.isFinite(value) && value >= 1 && value <= (question.scaleMax || 4)) {
            answer.scaleValue = Math.round(value);
        }
        return answer;
    }
    if (question.kind === 'choice') {
        const index = Number(incoming.choiceIndex);
        const options = question.options || [];
        if (Number.isInteger(index) && index >= 0 && index < options.length) {
            answer.choiceIndex = index;
            answer.choiceValue = options[index];
        }
        return answer;
    }
    answer.textValue = String(incoming.textValue || '').trim().slice(0, 1000);
    return answer;
};

export const defaultQuestionsFor = (audience) => roundOneQuestions(audience);
