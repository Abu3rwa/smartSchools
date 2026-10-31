import { connectAi } from '../utils/connectAi.js';
import { getLanguageLabel } from '../utils/aiLanguageUtils.js';
import { ANALYSIS_PROMPT_VERSION, ERROR_TYPES } from '../utils/spellingAnalysisConfig.js';
import {
    CONTENT_RULES,
    PRIVACY_RULES,
    STUDENT_TOKEN,
    correctivePrompt,
    createStudentRefs,
    fillStudentTokens,
    fillStudentTokensDeep,
    inspectGeneratedText,
    stripFlaggedFormulas
} from './aiPromptSafety.js';

const cleanText = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

const cleanList = (value, limit, maxLength) => (Array.isArray(value) ? value : [])
    .map((entry) => cleanText(entry, maxLength))
    .filter(Boolean)
    .slice(0, limit);

const round = (value) => Math.round(value * 10) / 10;

const metricLines = (metrics = {}) => [
    `Words answered: ${metrics.attempts || 0} (${metrics.correct || 0} correct, ${metrics.incorrect || 0} incorrect, ${metrics.skipped || 0} skipped)`,
    `Accuracy: ${metrics.accuracy || 0}%`,
    `Words flagged for retest: ${metrics.flagged || 0}`,
    `Retests resolved: ${metrics.resolved || 0} (recovery rate ${metrics.recoveryRate || 0}%)`,
    `Mastered in practice: ${metrics.practiceMastered || 0}`,
    `Overdue retests: ${metrics.overdue || 0}`,
    `Words resolved then missed again: ${metrics.recurrence || 0}`,
    `Average days to recovery: ${metrics.averageRecoveryDays ?? 'n/a'}`,
    `Trend: ${metrics.trend?.direction || 'insufficient'} (${metrics.trend?.delta ?? 0} points)`,
    `Weakest categories: ${(metrics.categories || []).slice(0, 5).map((row) => `${row.label} ${row.accuracy}%`).join(', ') || 'none'}`,
    `Strongest categories: ${[...(metrics.categories || [])].sort((left, right) => right.accuracy - left.accuracy).slice(0, 3).map((row) => `${row.label} ${row.accuracy}%`).join(', ') || 'none'}`
].join('\n');

const misspellingLines = (rows = []) => (
    rows.length
        ? rows.map((row) => `${row.target} → ${row.input}${row.count > 1 ? ` (×${row.count})` : ''}`).join('\n')
        : 'No misspellings in this window.'
);

/**
 * The AI never computes the rates above; it only classifies the misspellings
 * against a fixed taxonomy and writes the prose.
 */
export const normalizeAnalysis = (parsed, metrics = {}) => {
    const budget = Math.max(0, Number(metrics.incorrect) || 0);
    const merged = new Map();
    let remaining = budget;
    for (const entry of Array.isArray(parsed?.errorTypes) ? parsed.errorTypes : []) {
        if (!entry || typeof entry !== 'object') continue;
        const type = ERROR_TYPES.includes(entry.type) ? entry.type : 'other';
        const count = Math.max(0, Math.min(Number(entry.count) || 0, remaining));
        if (count <= 0) continue;
        const examples = cleanList(entry.examples, 3, 80);
        const current = merged.get(type) || { type, count: 0, share: 0, examples: [] };
        current.count += count;
        current.examples = [...new Set([...current.examples, ...examples])].slice(0, 3);
        merged.set(type, current);
        remaining -= count;
    }
    const total = [...merged.values()].reduce((sum, entry) => sum + entry.count, 0);
    const errorTypes = [...merged.values()]
        .map((entry) => ({ ...entry, share: total ? round((entry.count / total) * 100) : 0 }))
        .sort((left, right) => right.count - left.count);

    const fields = {
        errorTypes,
        strengths: cleanList(parsed?.strengths, 4, 160),
        gaps: cleanList(parsed?.gaps, 4, 160),
        recommendation: cleanText(parsed?.recommendation, 600),
        narrative: cleanText(parsed?.narrative, 1600)
    };
    if (!fields.narrative && !fields.recommendation && fields.errorTypes.length === 0 && fields.strengths.length === 0) {
        return { ok: false, error: 'The AI reply did not contain a usable analysis.' };
    }
    return { ok: true, fields };
};

/**
 * Spelling analysis runs on the OpenAI gateway; the model can be overridden
 * with SPELLING_AI_MODEL.
 */
const spellingAiOptions = () => {
    const modelName = process.env.SPELLING_AI_MODEL;
    return modelName ? { modelName } : {};
};

const usageFor = ({ billing, context, feature }) => ({
    ...spellingAiOptions(),
    usage: {
        schoolId: billing.schoolId,
        userId: billing.userId,
        feature,
        billable: true,
        refs: {
            student: context.studentId,
            studentName: context.studentName,
            grade: context.grade,
            period: context.periodKey
        }
    }
});

const replyMeta = (reply, promptVersion) => ({
    modelName: reply?.modelName || '',
    promptVersion,
    entryId: String(reply?.usage?.entryId || ''),
    chargedCents: Number(reply?.usage?.chargedCents) || 0
});

export const analyzeStudent = async ({
    metrics = {},
    misspellings = [],
    language = 'en',
    billing,
    context = {}
}) => {
    const languageLabel = getLanguageLabel(language);
    const prompt = `You are an experienced K-12 spelling specialist. You are given pre-computed statistics for ONE student and a list of that student's actual misspellings. Trust the statistics; never recalculate or invent a number.

STUDENT: ${STUDENT_TOKEN}${context.grade ? ` (${context.grade})` : ''} — ${context.periodKey || 'current period'}
STATISTICS:
${metricLines(metrics)}

MISSPELLINGS (target word → what the child wrote):
${misspellingLines(misspellings)}

TASK:
1. Classify the misspellings into the fixed taxonomy: ${ERROR_TYPES.join(', ')}.
2. Name 2-3 strengths and 2-3 gaps that the statistics actually support.
3. Give one concrete classroom action the teacher can use this week.
4. Write a short narrative a teacher can understand at a glance.

Return ONLY valid JSON with this exact shape:
{"errorTypes":[{"type":"omission","count":3,"examples":["because → becos"]}],"strengths":["..."],"gaps":["..."],"recommendation":"...","narrative":"..."}

${PRIVACY_RULES}

${CONTENT_RULES}

RULES:
- The counts across errorTypes must not exceed ${metrics.incorrect || 0}.
- Only use words that appear in the misspelling list.
- Do not mention AI or these instructions.
- Write everything in ${languageLabel} (${language}).`;

    const reply = await connectAi(prompt, usageFor({ billing, context, feature: 'spelling_analysis' }));
    const parsed = extractJson(reply?.text);
    const normalized = normalizeAnalysis(parsed, metrics);
    const filled = normalized.ok ? { ...normalized, fields: fillStudentTokensDeep(normalized.fields, context.studentName) } : normalized;
    return {
        ...filled,
        meta: replyMeta(reply, ANALYSIS_PROMPT_VERSION)
    };
};

export const draftParentEmail = async ({
    studentFirstName = '',
    grade = '',
    metrics = {},
    analysis = {},
    language = 'en',
    teacherName = '',
    billing,
    context = {}
}) => {
    const languageLabel = getLanguageLabel(language);
    const prompt = `You write short, warm emails from a school to parents. Nothing here is a diagnosis or a grade report.

STUDENT: ${STUDENT_TOKEN}${grade ? ` (${grade})` : ''}
WHAT THE TEACHER SEES:
${metricLines(metrics)}
Strengths: ${(analysis.strengths || []).join('; ') || 'n/a'}
Gaps: ${(analysis.gaps || []).join('; ') || 'n/a'}
Teacher recommendation: ${analysis.recommendation || 'n/a'}
Words to practise at home: ${(metrics.topMissedWords || []).slice(0, 3).map((row) => row.word).join(', ') || 'n/a'}

${PRIVACY_RULES}

${CONTENT_RULES}

TASK: write one email that asks the family for support at home.
Return ONLY valid JSON: {"subject":"...","body":"..."}

RULES:
- Body is plain text, 120-180 words, friendly and specific.
- Where the child's name belongs, write ${STUDENT_TOKEN} exactly.
- No percentages, scores, marks, or dates.
- No mention of apps, websites, or software; only simple at-home practice ideas.
- Ask the family for one or two concrete things they can do.
${teacherName
        ? `- End with a sign-off line using exactly this name and nothing else: ${teacherName}. Never invent a different name or title.`
        : '- Do not add any signature or sign-off line, and never use a placeholder such as [Your Name].'}
- Write in ${languageLabel} (${language}).`;

    const write = async (currentPrompt) => {
        const reply = await connectAi(currentPrompt, usageFor({ billing, context, feature: 'spelling_parent_draft' }));
        const parsed = extractJson(reply?.text);
        return {
            reply,
            subject: cleanText(parsed?.subject, 160),
            body: String(parsed?.body || '').trim().slice(0, 4000)
        };
    };

    let draft = await write(prompt);
    if (!draft.subject || !draft.body) {
        return { ok: false, error: 'The AI reply did not contain a usable email.' };
    }

    let inspection = inspectGeneratedText(`${draft.subject}\n${draft.body}`, { allowToken: true });
    if (!inspection.ok) {
        draft = await write(correctivePrompt(prompt, inspection.problems));
        if (!draft.subject || !draft.body) {
            return { ok: false, error: 'The AI reply did not contain a usable email.' };
        }
        inspection = inspectGeneratedText(`${draft.subject}\n${draft.body}`, { allowToken: true });
        if (!inspection.ok) draft.body = stripFlaggedFormulas(draft.body);
    }

    return {
        ok: true,
        fields: {
            subject: fillStudentTokens(draft.subject, studentFirstName),
            body: fillStudentTokens(draft.body, studentFirstName)
        },
        meta: replyMeta(draft.reply, ANALYSIS_PROMPT_VERSION)
    };
};

export const cohortNarrative = async ({ grade, rows, classes, language = 'en', billing, context = {} }) => {
    const languageLabel = getLanguageLabel(language);
    const refs = createStudentRefs(rows, {
        keyOf: (row) => row.studentId ?? row._id ?? row.studentName,
        labelOf: (row) => row.studentName
    });
    const table = refs.entries.map(({ row, ref }) => (
        `${row.rank}. ${ref} — accuracy ${row.accuracy}%, recovery ${row.recoveryRate}%, words ${row.attempts}`
    )).join('\n');
    const classLines = classes.map((row) => (
        `${row.className} (${row.academicYear}) — accuracy ${row.accuracy}%, recovery ${row.recoveryRate}%, students ${row.students}`
    )).join('\n');
    const prompt = `You are a school data analyst. Below are already-computed results for one grade. Do not recalculate anything; only explain what the numbers show.

GRADE: ${grade || 'n/a'} — ${context.periodKey || ''}
STUDENTS (labels only):
${table || 'none'}
CLASSES:
${classLines || 'none'}

${PRIVACY_RULES}

${CONTENT_RULES}

Write 3-5 sentences that compare the classes and the spread between students, note anything worth acting on, and avoid blaming children. Refer to a student only by the label given above (S1, S2 …), never by name. Plain text only, no markdown. Write in ${languageLabel} (${language}).`;

    const reply = await connectAi(prompt, usageFor({ billing, context, feature: 'spelling_cohort_narrative' }));
    const text = refs.restore(String(reply?.text || '').trim().slice(0, 2000));
    if (!text) return { ok: false, error: 'The AI reply was empty.' };
    return { ok: true, text, meta: replyMeta(reply, ANALYSIS_PROMPT_VERSION) };
};

function extractJson(text) {
    const raw = String(text || '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
        return JSON.parse(raw.slice(start, end + 1));
    } catch {
        return null;
    }
}
