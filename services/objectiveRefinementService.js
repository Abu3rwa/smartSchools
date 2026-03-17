import { createHttpError } from './curriculum/curriculumErrors.js';
import { connectAi } from '../utils/connectAi.js';
import { logAIUsage } from '../utils/aiUsageTracker.js';

const MAX_OBJECTIVES = 30;
const MAX_OBJECTIVE_LENGTH = 300;
const MAX_REFINED_LENGTH = 200;

const normalizeWhitespace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeObjectives = (objectives = []) => {
    if (!Array.isArray(objectives)) return [];
    return objectives
        .map((item) => normalizeWhitespace(item))
        .filter(Boolean)
        .slice(0, MAX_OBJECTIVES)
        .map((item) => item.slice(0, MAX_OBJECTIVE_LENGTH));
};

const buildPrompt = ({ objectives, context = {} }) => {
    const subject = normalizeWhitespace(context.subject || '');
    const grade = normalizeWhitespace(context.grade || '');
    const weekTitle = normalizeWhitespace(context.weekTitle || '');

    const contextLines = [
        subject ? `Subject: ${subject}` : null,
        grade ? `Grade: ${grade}` : null,
        weekTitle ? `Week title: ${weekTitle}` : null,
    ].filter(Boolean);

    const objectiveLines = objectives.map((objective, index) => `${index + 1}. ${objective}`).join('\n');

    return [
        'You are refining weekly learning objectives for teachers.',
        'Rewrite each objective into clear, measurable, student-centered language.',
        'Do not change the pedagogical intent or topic.',
        'Remove weak preambles and fragments like "By the end of this lesson" and "Students will be able to".',
        'Remove numbering prefixes and trailing punctuation noise.',
        `Keep each objective under ${MAX_REFINED_LENGTH} characters.`,
        'Return JSON only with this exact shape:',
        '{"refinedObjectives":["..."]}',
        'Do not include markdown or explanations.',
        '',
        ...(contextLines.length ? ['Context:', ...contextLines, ''] : []),
        'Objectives:',
        objectiveLines,
    ].join('\n');
};

const parseRefinedObjectives = (rawText = '') => {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return [];

    const normalizedBlock = trimmed.startsWith('```')
        ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
        : trimmed;

    let parsed;
    try {
        parsed = JSON.parse(normalizedBlock);
    } catch {
        throw createHttpError(502, 'AI returned an invalid objective refinement payload');
    }

    const list = Array.isArray(parsed?.refinedObjectives)
        ? parsed.refinedObjectives
        : [];

    const cleaned = normalizeObjectives(list).map((item) => item.slice(0, MAX_REFINED_LENGTH));
    if (cleaned.length === 0) {
        throw createHttpError(502, 'AI did not return usable refined objectives');
    }

    return cleaned;
};

export const createObjectiveRefinementService = () => ({
    async refineObjectives({ req }) {
        const objectives = normalizeObjectives(req.body?.objectives || []);
        if (objectives.length === 0) {
            throw createHttpError(400, 'At least one objective is required');
        }

        const prompt = buildPrompt({ objectives, context: req.body?.context || {} });
        const aiResult = await connectAi(prompt, {
            modelName: process.env.CURRICULUM_OBJECTIVE_REFINEMENT_MODEL || process.env.GEMINI_MODEL,
        });

        await logAIUsage({
            model: aiResult?.modelName || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
            feature: 'objective_refinement',
            schoolId: req.schoolId,
            userId: req.user?._id,
            entityType: 'curriculum_map',
            metadata: {
                objectiveCount: objectives.length,
                source: 'curriculum_editor',
            },
            response: aiResult,
        });

        const refinedObjectives = parseRefinedObjectives(aiResult?.text || '');
        return {
            refinedObjectives,
            model: aiResult?.modelName || null,
        };
    },
});

export const objectiveRefinementService = createObjectiveRefinementService();
