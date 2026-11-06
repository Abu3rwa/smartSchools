import { connectAi } from '../utils/connectAi.js';
import logger from '../utils/logger.js';
import { MAX_SOURCE_CHARS, parseJsonObject } from './assignmentQuestionAiService.js';

/**
 * Drafts a title and student/parent-facing summary for an ungraded Lesson
 * Summary assignment. Nothing is saved here — the teacher reviews and edits
 * the draft before creating the assignment.
 */

const MAX_TITLE_CHARS = 200;
const MAX_INSTRUCTIONS_CHARS = 5000;

const draftError = (message, code, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const cleanText = (value) => String(value ?? '').trim();

const buildSummaryPrompt = ({ sourceText }) => {
    const shape = JSON.stringify({ title: 'A short lesson title', instructions: 'What the lesson covered, written for students and parents.' });

    return `You write a short teacher-authored title and a student/parent-facing summary of this lesson. This is informational only — it is never graded.

SOURCE MATERIAL (the only facts you may use)
"""
${sourceText}
"""

WHAT TO WRITE
- "title": a short, specific title for the lesson (under ${MAX_TITLE_CHARS} characters).
- "instructions": a clear summary of what the lesson covered and anything students or parents should know, in plain language (under ${MAX_INSTRUCTIONS_CHARS} characters).
- Write the summary in the teacher's voice, in the past tense: open with a line like "In this lesson we ..." or "Students learned ...", then list what was covered and practiced as bullet points starting with "- ", each on its own line. Use a short paragraph instead of bullets only when the lesson is too small to list.
- Write in the same language as the source material. If it mixes languages, use the one most of it is written in.

RULES
- Never invent facts, names, dates or numbers that are not in the source material.
- Do not mention marks, grades, scores or assessment — this summary is never graded.
- Do not add homework or tasks that the source does not state.

REPLY FORMAT
Return exactly one JSON object and nothing else, shaped like this:
${shape}

- Do not add fields that are not in the shape above.`;
};

const requestSummary = async ({ prompt, usage, modelName, maxRetries = 1 }) => {
    let currentPrompt = prompt;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const reply = await connectAi(currentPrompt, {
            ...(modelName ? { modelName } : {}),
            ...(usage ? { usage } : {})
        });
        const parsed = parseJsonObject(reply.text);
        if (parsed) return parsed;
        logger.warn('lesson_summary_draft_invalid_json', { attempt });
        if (attempt < maxRetries) {
            currentPrompt = `${prompt}

IMPORTANT: Your previous reply was not valid JSON. Return ONE valid JSON object and nothing else.`;
        }
    }
    throw draftError(
        'The AI did not return a usable summary. Try again with a clearer file.',
        'LESSON_SUMMARY_RESPONSE_INVALID',
        502
    );
};

export const draftLessonSummaryFromText = async ({ sourceText, usage, modelName }) => {
    const text = cleanText(sourceText);
    if (!text) {
        throw draftError(
            'There is no text to write a summary from. Upload a clearer PDF or photo and try again.',
            'LESSON_SUMMARY_SOURCE_EMPTY'
        );
    }

    const prompt = buildSummaryPrompt({ sourceText: text.slice(0, MAX_SOURCE_CHARS) });
    const parsed = await requestSummary({ prompt, usage, modelName });

    const title = cleanText(parsed.title).slice(0, MAX_TITLE_CHARS);
    const instructions = cleanText(parsed.instructions).slice(0, MAX_INSTRUCTIONS_CHARS);
    if (!title || !instructions) {
        throw draftError(
            'The AI did not return a usable summary. Try again with a clearer file.',
            'LESSON_SUMMARY_RESPONSE_INVALID',
            502
        );
    }

    return { title, instructions };
};