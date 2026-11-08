import { connectAi } from '../utils/connectAi.js';
import {
    validateGoogleFormQuestions,
    MAX_MODEL_ANSWER_CHARS,
    MAX_RUBRIC_CHARS
} from './googleFormsAssignmentService.js';
import logger from '../utils/logger.js';

/**
 * Drafts quiz questions from lesson material for the Google Form builder.
 * Nothing is saved here: the teacher reviews and edits the drafts in the app
 * before anything is created.
 */

export const DRAFT_QUESTION_TYPES = ['multiple_choice', 'true_false', 'short_answer'];
export const DEFAULT_DRAFT_TYPES = ['multiple_choice', 'true_false'];
export const MIN_DRAFT_QUESTIONS = 1;
export const MAX_DRAFT_QUESTIONS = 30;
export const MAX_SOURCE_CHARS = 30000;

const TYPE_LABELS = {
    multiple_choice: 'multiple choice',
    true_false: 'true or false',
    short_answer: 'short answer'
};

const draftError = (message, code, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const cleanText = (value) => String(value ?? '').trim();

export const clampDraftCount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 5;
    return Math.min(MAX_DRAFT_QUESTIONS, Math.max(MIN_DRAFT_QUESTIONS, Math.round(parsed)));
};

/** Unknown or duplicated types fall away; an empty list falls back to multiple choice and true/false. */
export const normalizeDraftTypes = (value) => {
    const list = Array.isArray(value) ? value : [];
    const seen = new Set();
    for (const entry of list) {
        const type = cleanText(entry).toLowerCase();
        if (DRAFT_QUESTION_TYPES.includes(type)) seen.add(type);
    }
    return seen.size > 0 ? Array.from(seen) : [...DEFAULT_DRAFT_TYPES];
};

/** The lesson text a draft is grounded in. Only fields a teacher wrote are used. */
export const buildLessonSourceText = (lessons = []) => {
    const blocks = [];
    for (const lesson of lessons || []) {
        if (!lesson) continue;
        const parts = [];
        const push = (label, value) => {
            const text = cleanText(value);
            if (text) parts.push(`${label}: ${text}`);
        };

        push('Topic', lesson.topic);
        push('Summary', lesson.summary);
        push('Description', lesson.description);
        push('Previous knowledge', lesson.previousKnowledge);
        push('Teaching objectives', lesson.teachingObjectives);

        const objectives = (lesson.objectives || [])
            .map((objective) => cleanText(objective?.text))
            .filter(Boolean);
        if (objectives.length > 0) parts.push(`Objectives:\n- ${objectives.join('\n- ')}`);

        push('Vocabulary', lesson.vocabulary);
        push('Activities', lesson.activities);
        push('Assessment methods', lesson.assessmentMethods);
        push('Resources', lesson.resources);

        const stages = (lesson.stages || [])
            .map((stage) => {
                const name = cleanText(stage?.name);
                const procedure = cleanText(stage?.procedure);
                const materials = cleanText(stage?.materials);
                if (!procedure && !materials) return '';
                const head = name ? `${name}: ` : '';
                return `- ${head}${[procedure, materials && `Materials: ${materials}`].filter(Boolean).join(' ')}`;
            })
            .filter(Boolean);
        if (stages.length > 0) parts.push(`Lesson stages:\n${stages.join('\n')}`);

        push('Material', lesson.extractedMaterialText);
        push('Additional context', lesson.contextText);

        if (parts.length > 0) {
            blocks.push(`LESSON: ${cleanText(lesson.title) || 'Untitled'}\n${parts.join('\n')}`);
        }
    }
    return blocks.join('\n\n').slice(0, MAX_SOURCE_CHARS);
};

export const buildDraftPrompt = ({ sourceText, count, types }) => {
    const typeList = types.map((type) => `- ${TYPE_LABELS[type]}`).join('\n');
    const shape = JSON.stringify({
        questions: [
            { type: 'multiple_choice', title: 'A question', options: ['A', 'B', 'C'], correctAnswer: 'B', points: 1 },
            { type: 'true_false', title: 'A statement', options: ['True', 'False'], correctAnswer: 'True', points: 1 },
            { type: 'short_answer', title: 'A question', modelAnswer: 'The expected answer', rubric: 'What earns full credit and how to award partial credit', points: 1 }
        ]
    });

    return `You write quiz questions for a school teacher. The teacher reads and edits every question before it is used, so accuracy matters more than quantity.

SOURCE MATERIAL (the only facts you may use)
"""
${sourceText}
"""

WHAT TO WRITE
- Exactly ${count} questions.
- Use only these question types:
${typeList}
- Spread the questions across the types above.
- Write in the same language as the source material. If it mixes languages, use the one most of it is written in.

RULES
- Never invent facts, names, dates or numbers that are not in the source material.
- Do not ask about anything the source does not state.
- Do not copy a whole source sentence as the question; rephrase it.
- Multiple choice: three or four options, exactly one correct, and the wrong options must be clearly wrong to someone who read the source.
- True or false: the statement must be clearly true or false from the source material alone.
- Short answer: ask for one short, specific answer that appears in the source; never ask for an opinion. Include a "modelAnswer" with the expected answer, grounded in the source; the teacher reviews it and answers are graded by meaning, not exact wording. Also include a "rubric": the key concepts a full-credit answer must cover and how to award partial credit when only some are present, grounded in the source. Keep it short and practical for the teacher to edit.
- Do not repeat a question you already wrote.

REPLY FORMAT
Return exactly one JSON object and nothing else, shaped like this:
${shape}

- "correctAnswer" is copied exactly from "options".
- "points" is a whole number from 1 to 5.
- "modelAnswer" is required for short-answer questions.
- "rubric" is required for short-answer questions: full-credit concepts plus partial-credit rules, at most 2000 characters.
- Do not add fields that are not in the shape above.`;
};

export const parseJsonObject = (text) => {
    const trimmed = String(text || '').trim();
    const attempts = [trimmed, trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1], trimmed.match(/\{[\s\S]*\}/)?.[0]];
    for (const candidate of attempts) {
        if (!candidate) continue;
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            if (Array.isArray(parsed)) return { questions: parsed };
        } catch {
            // try the next candidate
        }
    }
    return null;
};

const requestDrafts = async ({ prompt, usage, modelName, maxRetries = 1 }) => {
    let currentPrompt = prompt;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const reply = await connectAi(currentPrompt, {
            ...(modelName ? { modelName } : {}),
            ...(usage ? { usage } : {})
        });
        const parsed = parseJsonObject(reply.text);
        if (parsed) return parsed;
        logger.warn('assignment_question_drafts_invalid_json', { attempt });
        if (attempt < maxRetries) {
            currentPrompt = `${prompt}

IMPORTANT: Your previous reply was not valid JSON. Return ONE valid JSON object and nothing else.`;
        }
    }
    throw draftError(
        'The AI did not return usable questions. Try again, or fewer questions at a time.',
        'DRAFT_RESPONSE_INVALID',
        502
    );
};

const normalizeTrueFalse = (value) => {
    const text = cleanText(value).toLowerCase();
    if (['true', 't', 'yes', 'correct'].includes(text)) return 'True';
    if (['false', 'f', 'no', 'incorrect'].includes(text)) return 'False';
    return '';
};

const normalizePoints = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(5, Math.max(1, Math.round(parsed)));
};

/**
 * Turns whatever the model returned into questions the existing Google Form
 * builder accepts. Anything malformed is dropped rather than guessed at.
 */
export const normalizeDraftQuestions = (parsed, { count, types }) => {
    const rawList = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const allowedTypes = new Set(types);
    const seen = new Set();
    const questions = [];

    for (const raw of rawList) {
        if (questions.length >= count) break;
        if (!raw || typeof raw !== 'object') continue;

        const type = cleanText(raw.type).toLowerCase();
        if (!allowedTypes.has(type)) continue;

        const title = cleanText(raw.title || raw.question || raw.prompt);
        if (!title || title.length > 1000) continue;

        const key = title.toLowerCase().replace(/\s+/g, ' ');
        if (seen.has(key)) continue;

        if (type === 'short_answer') {
            const modelAnswer = cleanText(raw.modelAnswer ?? raw.correctAnswer ?? raw.answer)
                .slice(0, MAX_MODEL_ANSWER_CHARS);
            const rubric = cleanText(raw.rubric).slice(0, MAX_RUBRIC_CHARS);
            seen.add(key);
            questions.push({
                type,
                title,
                options: [],
                correctAnswer: '',
                points: normalizePoints(raw.points),
                modelAnswer,
                rubric
            });
            continue;
        }

        if (type === 'true_false') {
            const correctAnswer = normalizeTrueFalse(raw.correctAnswer ?? raw.answer);
            if (!correctAnswer) continue;
            seen.add(key);
            questions.push({
                type,
                title,
                options: ['True', 'False'],
                correctAnswer,
                points: normalizePoints(raw.points)
            });
            continue;
        }

        const options = (Array.isArray(raw.options) ? raw.options : [])
            .map((option) => cleanText(typeof option === 'object' ? option?.text : option))
            .filter(Boolean);
        const uniqueOptions = Array.from(new Set(options));
        if (uniqueOptions.length < 2 || uniqueOptions.length > 20) continue;

        const answerText = cleanText(raw.correctAnswer ?? raw.answer);
        let correctAnswer = uniqueOptions.find((option) => option === answerText);
        if (!correctAnswer) {
            const answerIndex = Number(raw.correctIndex);
            if (Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < uniqueOptions.length) {
                correctAnswer = uniqueOptions[answerIndex];
            }
        }
        if (!correctAnswer) continue;

        seen.add(key);
        questions.push({
            type,
            title,
            options: uniqueOptions,
            correctAnswer,
            points: normalizePoints(raw.points)
        });
    }

    if (questions.length === 0) {
        throw draftError(
            'The AI did not return questions that fit these types. Try again with different types or a longer source.',
            'DRAFT_QUESTIONS_INVALID',
            502
        );
    }

    try {
        return validateGoogleFormQuestions(questions, { requireRubric: false });
    } catch (error) {
        throw draftError(
            `The drafted questions could not be used: ${error.message}`,
            'DRAFT_QUESTIONS_INVALID',
            502
        );
    }
};

export const draftQuestionsFromText = async ({
    sourceText,
    count,
    types,
    usage,
    modelName
}) => {
    const text = cleanText(sourceText);
    if (!text) {
        throw draftError(
            'There is no text to write questions from. Add content to the source and try again.',
            'DRAFT_SOURCE_EMPTY'
        );
    }

    const normalizedTypes = normalizeDraftTypes(types);
    const requestedCount = clampDraftCount(count);
    const prompt = buildDraftPrompt({
        sourceText: text.slice(0, MAX_SOURCE_CHARS),
        count: requestedCount,
        types: normalizedTypes
    });

    const parsed = await requestDrafts({ prompt, usage, modelName });
    const questions = normalizeDraftQuestions(parsed, {
        count: requestedCount,
        types: normalizedTypes
    });

    return {
        questions,
        requestedCount,
        types: normalizedTypes,
        truncatedSource: text.length > MAX_SOURCE_CHARS
    };
};

export const draftQuestionsFromLessonPlans = async ({
    lessons,
    count,
    types,
    usage,
    modelName
}) => {
    const sourceText = buildLessonSourceText(lessons);
    if (!sourceText) {
        throw draftError(
            'The selected lesson plans have no content yet. Add objectives, stages or material to a lesson, or upload a file instead.',
            'DRAFT_SOURCE_EMPTY'
        );
    }
    return draftQuestionsFromText({ sourceText, count, types, usage, modelName });
};
