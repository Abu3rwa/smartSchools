/**
 * One 60-70 word summary per subject the teacher actually taught in the last
 * two weeks, for the newsletter auto-reply. Subjects with no lesson plans in
 * the window are skipped — nothing is ever invented for them.
 */
import LessonPlan from '../../models/LessonPlan.js';
import { connectAi } from '../../utils/connectAi.js';
import { markUsageOutcome } from '../aiCreditService.js';
import { extractJsonObject } from '../writingAssistantPrompts.js';
import { buildLessonSourceText } from '../assignmentQuestionAiService.js';
import { getTeacherSubjectIds } from '../../helpers/teacherScoping.js';
import logger from '../../utils/logger.js';

const WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SUMMARY_CHARS = 1000;

const NEWSLETTER_AI = {
    provider: 'openai',
    ...(process.env.INBOX_AI_MODEL ? { modelName: process.env.INBOX_AI_MODEL } : {})
};

const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const wordCountOf = (text) => (text ? text.split(/\s+/).length : 0);

const buildSummariesPrompt = (subjects) => {
    const shape = JSON.stringify({
        summaries: [{ subjectId: 'id from the list', summary: 'Over the past two weeks, we covered ...' }]
    });
    const blocks = subjects.map(({ subjectId, subjectName, sourceText }) => [
        `<<<SUBJECT id=${subjectId} name="${subjectName}">>>`,
        sourceText,
        '<<<END SUBJECT>>>'
    ].join('\n')).join('\n\n');

    return `You write short newsletter sections for a school teacher. For each subject below, write a 60-70 word summary in English of what the class covered over the last two weeks, based only on that subject's lesson material.

RULES
- Start every summary with "Over the past two weeks, we covered".
- Use only facts from that subject's lesson material. Never invent topics, names, dates or numbers.
- Never mention students by name, marks, grades or behaviour.
- Plain text only: no markdown, no headings, no bullet points.
- One summary per subject id, using only the ids given.

Return exactly one JSON object and nothing else, shaped like this:
${shape}

${blocks}`;
};

/**
 * teacherId is the Teacher document id (for subject scoping); userId is the
 * User id LessonPlan rows and AI billing are keyed by.
 */
export const buildSubjectSummaries = async ({ teacherId, userId, schoolId, now = new Date() }) => {
    const subjectIds = await getTeacherSubjectIds(teacherId);
    if (!subjectIds.length) return [];

    const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const plans = await LessonPlan.find({
        school: schoolId,
        teacher: userId,
        subject: { $in: subjectIds },
        date: { $gte: windowStart, $lte: now }
    })
        .sort({ date: 1 })
        .populate('subject', 'name')
        .lean();
    if (!plans.length) return [];

    const bySubject = new Map();
    for (const plan of plans) {
        const id = String(plan.subject?._id || plan.subject);
        if (!id || id === 'undefined') continue;
        if (!bySubject.has(id)) {
            bySubject.set(id, { subjectName: plan.subject?.name || '', plans: [] });
        }
        bySubject.get(id).plans.push(plan);
    }

    const subjects = [...bySubject.entries()]
        .map(([subjectId, { subjectName, plans: subjectPlans }]) => ({
            subjectId,
            subjectName: cleanText(subjectName),
            sourceText: buildLessonSourceText(subjectPlans)
        }))
        .filter((subject) => subject.sourceText);
    if (!subjects.length) return [];

    const prompt = buildSummariesPrompt(subjects);
    let parsed = null;
    let usageEntryId = null;
    for (let attempt = 0; attempt <= 1; attempt += 1) {
        const reply = await connectAi(attempt === 0 ? prompt : `${prompt}

IMPORTANT: Your previous reply was not valid JSON. Return ONE valid JSON object and nothing else.`, {
            ...NEWSLETTER_AI,
            usage: {
                schoolId,
                userId,
                feature: 'inbox_newsletter_summary',
                billable: true
            }
        });
        usageEntryId = reply.usage?.entryId || usageEntryId;
        parsed = extractJsonObject(reply.text);
        if (parsed) break;
        logger.warn('inbox_newsletter_summary_invalid_json', { attempt, userId: String(userId) });
    }

    const entries = Array.isArray(parsed?.summaries) ? parsed.summaries : null;
    if (!entries) {
        await markUsageOutcome({ entryId: usageEntryId, outcome: 'unusable' });
        throw Object.assign(new Error('The AI did not return usable summaries.'), { statusCode: 502 });
    }

    const known = new Map(subjects.map((subject) => [subject.subjectId, subject.subjectName]));
    const summaries = [];
    const seen = new Set();
    for (const entry of entries) {
        const subjectId = String(entry?.subjectId ?? '');
        if (!known.has(subjectId) || seen.has(subjectId)) continue;
        const summary = cleanText(entry?.summary).slice(0, MAX_SUMMARY_CHARS);
        if (!summary) continue;
        seen.add(subjectId);
        summaries.push({
            subjectId,
            subjectName: known.get(subjectId),
            summary,
            wordCount: wordCountOf(summary)
        });
    }

    if (!summaries.length) {
        await markUsageOutcome({ entryId: usageEntryId, outcome: 'unusable' });
        throw Object.assign(new Error('The AI did not return usable summaries.'), { statusCode: 502 });
    }

    return summaries;
};

export default { buildSubjectSummaries };