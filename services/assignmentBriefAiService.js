import { connectAi } from '../utils/connectAi.js';
import logger from '../utils/logger.js';
import { MAX_SOURCE_CHARS, parseJsonObject } from './assignmentQuestionAiService.js';

/**
 * Drafts the teacher-facing brief of an assignment — title, short summary and
 * student instructions — from one ephemeral PDF/photo. Nothing is saved here:
 * the teacher edits the draft in the drawer before creating the assignment.
 */

export const MAX_BRIEF_TITLE_CHARS = 200;
export const MAX_BRIEF_SUMMARY_CHARS = 500;
export const MAX_BRIEF_INSTRUCTIONS_CHARS = 5000;
export const MIN_BRIEF_SOURCE_CHARS = 20;
export const BRIEF_SOURCE_USAGES = ['form', 'attachment'];

const draftError = (message, code, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const cleanText = (value) => String(value ?? '').trim();

/** Accepts an array, a JSON array string or a comma-separated string. */
export const normalizeBriefSourceUsage = (value) => {
    let list = value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        try {
            const parsed = JSON.parse(trimmed);
            list = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            list = trimmed.split(',');
        }
    }
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    for (const entry of list) {
        const usage = cleanText(entry).toLowerCase();
        if (BRIEF_SOURCE_USAGES.includes(usage)) seen.add(usage);
    }
    return Array.from(seen);
};

export const buildBriefPrompt = ({
    sourceText,
    assignmentTypeKey,
    assignmentTypeName,
    sourceUsage = [],
    formContext = [],
    isGraded = true
}) => {
    const usage = new Set(sourceUsage);
    const isLessonSummary = assignmentTypeKey === 'lesson_summary';
    const graded = !isLessonSummary && isGraded !== false;
    const shape = JSON.stringify({
        title: 'A short assignment title',
        summary: 'One to three sentences about what this assignment is.',
        instructions: 'What students should do, step by step.'
    });

    const instructionRules = [];
    if (isLessonSummary) {
        instructionRules.push(
            '- Write "instructions" as the lesson recap itself, in the teacher\'s voice and the past tense: open with "In this lesson we ..." or "Students learned ...", then list what was covered and practiced as bullet points starting with "- ", each on its own line.',
            '- Do not mention marks, grades, scores, assessment or homework. This assignment is informational only.'
        );
    } else {
        instructionRules.push(
            '- Write "instructions" directly to the student: short numbered or bulleted steps that say what to do and in what order.'
        );
        if (usage.has('form')) {
            instructionRules.push(
                '- Students will complete a Google Form quiz created from this assignment. Tell them to open and submit the form. Do not invent a link, question count or question text.'
            );
            if (formContext.length > 0) {
                instructionRules.push(
                    `- The form's existing question titles are listed below. Use them only to describe what the form covers; do not restate or rewrite them.\n${formContext.map((title) => `  - ${title}`).join('\n')}`
                );
            }
        }
        if (usage.has('attachment')) {
            instructionRules.push(
                '- The source file will be attached to the assignment. Tell students to open the attached file and explain precisely how to use it (which parts to read, what to answer, what to hand in). Call it "the attached file", never a filename.'
            );
        }
        if (!usage.has('form') && !usage.has('attachment')) {
            instructionRules.push(
                '- No file, form or link will be attached. Do not refer to an attachment, form or link.'
            );
        }
    }
    if (!graded) {
        instructionRules.push('- This assignment is not graded. Do not mention marks, grades or scores.');
    }

    return `You write the details of a class assignment for a school teacher. The teacher reads and edits every field before using it.

ASSIGNMENT TYPE
- ${cleanText(assignmentTypeName) || 'Assignment'}${graded ? '' : ' (not graded)'}

SOURCE MATERIAL (the only facts you may use)
"""
${sourceText}
"""

WHAT TO WRITE
- "title": a short, specific title for the assignment (under ${MAX_BRIEF_TITLE_CHARS} characters).
- "summary": a one-to-three sentence overview of what the assignment is about and what students will do, written for students and parents (under ${MAX_BRIEF_SUMMARY_CHARS} characters). Do not repeat the instructions.
- "instructions": what students should do (under ${MAX_BRIEF_INSTRUCTIONS_CHARS} characters).
${instructionRules.join('\n')}
- Write in the same language as the source material. If it mixes languages, use the one most of it is written in.

RULES
- Never invent facts, names, dates, deadlines, links, question text, marks or grading criteria that are not in the source material or the form context.
- Do not copy a long passage word for word.
- If the source only supports part of the assignment, write only that part; never fill gaps with assumptions.

REPLY FORMAT
Return exactly one JSON object and nothing else, shaped like this:
${shape}

- Do not add fields that are not in the shape above.`;
};

const requestBrief = async ({ prompt, usage, modelName, maxRetries = 1 }) => {
    let currentPrompt = prompt;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const reply = await connectAi(currentPrompt, {
            ...(modelName ? { modelName } : {}),
            ...(usage ? { usage } : {})
        });
        const parsed = parseJsonObject(reply.text);
        if (parsed) return parsed;
        logger.warn('assignment_brief_draft_invalid_json', { attempt });
        if (attempt < maxRetries) {
            currentPrompt = `${prompt}

IMPORTANT: Your previous reply was not valid JSON. Return ONE valid JSON object and nothing else.`;
        }
    }
    throw draftError(
        'The AI did not return a usable draft. Try again with a clearer file.',
        'DRAFT_BRIEF_RESPONSE_INVALID',
        502
    );
};

export const draftAssignmentBriefFromText = async ({
    sourceText,
    assignmentTypeKey,
    assignmentTypeName,
    sourceUsage = [],
    formContext = [],
    isGraded = true,
    usage,
    modelName
}) => {
    const text = cleanText(sourceText);
    if (text.length < MIN_BRIEF_SOURCE_CHARS) {
        throw draftError(
            'The file has too little text to draft from. Add more material, or write the assignment yourself.',
            'DRAFT_BRIEF_SOURCE_TOO_SHORT'
        );
    }

    const safeFormContext = (Array.isArray(formContext) ? formContext : [])
        .map((title) => cleanText(title).slice(0, 300))
        .filter(Boolean)
        .slice(0, 30);
    const prompt = buildBriefPrompt({
        sourceText: text.slice(0, MAX_SOURCE_CHARS),
        assignmentTypeKey,
        assignmentTypeName,
        sourceUsage: normalizeBriefSourceUsage(sourceUsage),
        formContext: safeFormContext,
        isGraded
    });
    const parsed = await requestBrief({ prompt, usage, modelName });

    const title = cleanText(parsed.title).slice(0, MAX_BRIEF_TITLE_CHARS);
    const summary = cleanText(parsed.summary).slice(0, MAX_BRIEF_SUMMARY_CHARS);
    const instructions = cleanText(parsed.instructions).slice(0, MAX_BRIEF_INSTRUCTIONS_CHARS);
    if (!title || !summary || !instructions) {
        throw draftError(
            'The AI did not return a complete draft. Try again with a clearer file.',
            'DRAFT_BRIEF_RESPONSE_INVALID',
            502
        );
    }

    return { title, summary, instructions };
};
