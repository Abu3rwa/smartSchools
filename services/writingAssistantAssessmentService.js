/**
 * Writing Assistant — teacher-triggered assessment (Phase 2).
 *
 * This is the only writing file that reaches the AI. No student route imports it,
 * and no student handler may call it; see tests/writingAssistantAiBoundary.test.js.
 */
import mongoose from 'mongoose';

import WritingAssignment from '../models/WritingAssignment.js';
import WritingProject from '../models/WritingProject.js';
import WritingDraft from '../models/WritingDraft.js';
import WritingAssessment from '../models/WritingAssessment.js';
import Student from '../models/Student.js';
import School from '../models/School.js';

import { NOTEBOOK_STATES, WRITING_STAGES } from '../constants/writingPresets.js';
import { connectAi } from '../utils/connectAi.js';
import logger from '../utils/logger.js';
import {
    buildComparisonPrompt,
    buildFeedbackPrompt,
    decideRecommendation,
    extractJsonObject,
    normalizeComparison,
    normalizeFeedback
} from './writingAssistantPrompts.js';
import {
    PUBLISHABLE_FROM,
    canMoveTo,
    configSnapshotFor,
    stageAfterAssessment,
    stageAfterPublish,
    statusAfterPublish
} from './writingAssistantLogic.js';
import { notifyFeedbackPublished } from './writingFeedbackEmailService.js';
import { assertCanSpend, chargeUsage, isCreditError } from './aiCreditService.js';

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });
// 422 keeps the actionable message visible: the error handler masks every 5xx detail.
const upstream = (message) => Object.assign(new Error(message), { statusCode: 422 });

const objectId = (value) => {
    if (!mongoose.isValidObjectId(String(value || ''))) return null;
    return String(value);
};

const sameId = (a, b) => String(a || '') === String(b || '');

const IN_FLIGHT = ['pending', 'running'];

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const textList = (value, maxItems, maxLength) => (Array.isArray(value) ? value : [])
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
const score = (value, maxScore) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(parsed, Number(maxScore) || 0);
};

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

const assertOwner = (assignment, userId, isAdmin) => {
    if (isAdmin || sameId(assignment?.assignedBy, userId)) return;
    throw forbidden('Only the teacher who created this writing task or a school admin can review it.');
};

const resolveLanguage = async ({ schoolId, requestedLanguage }) => {
    const explicit = String(requestedLanguage || '').trim().toLowerCase();
    if (explicit === 'ar' || explicit === 'en') return explicit;

    const school = await School.findOne({ _id: schoolId }).select('reportSettings.defaultLanguage').lean();
    const schoolLanguage = String(school?.reportSettings?.defaultLanguage || '').trim().toLowerCase();
    return schoolLanguage === 'arabic' ? 'ar' : 'en';
};

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

const loadDraftContext = async ({ schoolId, draftId }) => {
    const id = objectId(draftId);
    if (!id) throw notFound('Draft not found.');

    const draft = await WritingDraft.findOne({ school: schoolId, _id: id });
    if (!draft) throw notFound('Draft not found.');

    const [project, assignment, student] = await Promise.all([
        WritingProject.findOne({ school: schoolId, _id: draft.project }),
        WritingAssignment.findOne({ school: schoolId, _id: draft.assignment }).lean(),
        Student.findOne({ school: schoolId, _id: draft.student })
            .select('firstName lastName')
            .lean()
    ]);

    if (!project) throw notFound('Writing project not found.');
    if (!assignment) throw notFound('Writing task not found.');

    return {
        draft,
        project,
        assignment,
        studentName: `${student?.firstName || ''} ${student?.lastName || ''}`.trim(),
        goal: (assignment.goals || []).find((row) => sameId(row.student, draft.student))?.text || ''
    };
};

const snapshotFor = (draft, assignment) => (
    draft?.configSnapshot && Object.keys(draft.configSnapshot).length
        ? draft.configSnapshot
        : configSnapshotFor(assignment)
);

/* ------------------------------------------------------------------ */
/* Claim / retry                                                       */
/* ------------------------------------------------------------------ */

const isDuplicateKey = (error) => Number(error?.code) === 11000;

/**
 * One assessment per draft per kind may be in flight. A failed attempt is reused
 * so a retry never leaves two competing rows; a finished one is never overwritten.
 */
const claimAssessment = async ({ schoolId, project, draft, kind, previousDraft, userId, language = 'en' }) => {
    const inFlight = await WritingAssessment.findOne({
        school: schoolId,
        draft: draft._id,
        kind,
        aiStatus: { $in: IN_FLIGHT }
    }).select('_id').lean();
    if (inFlight) {
        throw conflict('This draft is already being assessed. Wait for that to finish.');
    }

    const failed = await WritingAssessment.findOne({
        school: schoolId,
        draft: draft._id,
        kind,
        aiStatus: 'failed'
    }).sort({ createdAt: -1 });

    if (failed) {
        const claimed = await WritingAssessment.findOneAndUpdate(
            { _id: failed._id, aiStatus: 'failed' },
            {
                $set: {
                    aiStatus: 'running',
                    aiError: '',
                    language,
                    requestedBy: userId,
                    ...(previousDraft?._id ? { previousDraft: previousDraft._id } : {})
                },
                $inc: { attempts: 1 }
            },
            { new: true }
        );
        if (!claimed) {
            throw conflict('This draft is already being assessed. Wait for that to finish.');
        }
        return claimed;
    }

    try {
        return await WritingAssessment.create({
            school: schoolId,
            project: project._id,
            assignment: draft.assignment,
            student: draft.student,
            draft: draft._id,
            previousDraft: previousDraft?._id,
            kind,
            language,
            aiStatus: 'running',
            attempts: 1,
            requestedBy: userId
        });
    } catch (error) {
        if (isDuplicateKey(error)) {
            throw conflict('This draft is already being assessed. Wait for that to finish.');
        }
        throw error;
    }
};

const failAssessment = async (assessment, error) => {
    const message = text(error?.message || 'The assessment could not be completed.', 500);
    assessment.aiStatus = 'failed';
    assessment.aiError = message;
    assessment.ranAt = new Date();
    await assessment.save();
    logger.warn('Writing assessment failed', {
        assessmentId: String(assessment._id),
        draft: String(assessment.draft),
        kind: assessment.kind,
        message
    });
};

/* ------------------------------------------------------------------ */
/* Project transitions                                                 */
/* ------------------------------------------------------------------ */

const markPublished = (assessment, userId) => {
    assessment.publish = {
        state: 'published',
        publishedBy: userId,
        publishedAt: new Date()
    };
};

/**
 * The AI moved the student only as far as "your work is ready to be read".
 * Everything past that is the teacher's publication decision.
 */
const applyAssessmentToProject = ({ project, assessment, autoPublish, userId }) => {
    project.latestAssessment = assessment._id;

    if (autoPublish) {
        const target = stageAfterPublish(assessment.kind, assessment.recommendation?.path);
        if (canMoveTo(project, target)) {
            markPublished(assessment, userId);
            project.stage = target;
            project.status = statusAfterPublish(assessment.recommendation?.path);
            return;
        }
        // A stage lock is the teacher's decision: leave it for them to publish.
    }

    if (project.stage === 'submitted' && canMoveTo(project, stageAfterAssessment())) {
        project.stage = stageAfterAssessment();
    }
};

const shouldAutoPublish = (assignment) => (
    assignment?.workflow?.teacherPublishesFeedback === false
);

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

/**
 * Writing feedback is the one thing that may run on OpenAI. Everything else in
 * the product still uses the default provider; flip WRITING_AI_PROVIDER back to
 * "gemini" to send this path home without a code change.
 */
const writingAiOptions = () => {
    const provider = String(process.env.WRITING_AI_PROVIDER || 'openai').toLowerCase();
    const modelName = process.env.WRITING_AI_MODEL;
    return modelName ? { provider, modelName } : { provider };
};

const chargeFor = ({ billing, context, reply, feature, outcome }) => chargeUsage({
    schoolId: billing.schoolId,
    userId: billing.userId,
    reply,
    feature,
    outcome,
    refs: {
        assignment: context.assignment?._id,
        project: context.project?._id,
        draft: context.draft?._id,
        student: context.draft?.student,
        assignmentTitle: context.assignment?.title,
        studentName: context.studentName,
        draftNumber: context.draft?.number
    }
});

const runFeedback = async ({ context, language, billing }) => {
    const { draft, assignment, studentName, goal } = context;
    const snapshot = snapshotFor(draft, assignment);
    const prompt = buildFeedbackPrompt({
        snapshot,
        draft,
        studentName,
        goal,
        aiConstraints: assignment.aiConstraints || '',
        language
    });

    const reply = await connectAi(prompt, writingAiOptions());
    const parsed = extractJsonObject(reply.text);
    const normalized = normalizeFeedback({ parsed, draft, snapshot });
    await chargeFor({
        billing,
        context,
        reply,
        feature: 'writing_feedback',
        outcome: normalized.ok ? 'done' : 'unusable'
    });
    if (!normalized.ok) throw upstream(normalized.error);

    const decision = decideRecommendation({
        normalized,
        assignment,
        draftNumber: draft.number
    });

    return {
        modelName: reply.modelName,
        fields: {
            sections: normalized.sections,
            overall: normalized.overall,
            scores: normalized.scores,
            totalScore: normalized.totalScore,
            recommendation: { path: decision.path, reason: decision.reason }
        },
        original: {
            sections: normalized.sections,
            overall: normalized.overall,
            scores: normalized.scores,
            totalScore: normalized.totalScore,
            recommendation: { path: decision.path, reason: decision.reason }
        }
    };
};

const runComparison = async ({ context, previousDraft, previousAssessment, language, billing }) => {
    const { draft, assignment, studentName, goal } = context;
    const snapshot = snapshotFor(draft, assignment);
    const prompt = buildComparisonPrompt({
        snapshot,
        previousDraft,
        currentDraft: draft,
        previousAssessment,
        studentName,
        goal,
        aiConstraints: assignment.aiConstraints || '',
        language
    });

    const reply = await connectAi(prompt, writingAiOptions());
    const parsed = extractJsonObject(reply.text);
    const normalized = normalizeComparison({
        parsed,
        previousDraft,
        currentDraft: draft,
        previousAssessment,
        snapshot
    });
    await chargeFor({
        billing,
        context,
        reply,
        feature: 'writing_comparison',
        outcome: normalized.ok ? 'done' : 'unusable'
    });
    if (!normalized.ok) throw upstream(normalized.error);

    const decision = decideRecommendation({
        normalized,
        assignment,
        draftNumber: draft.number
    });

    const fields = {
        comparison: {
            changedBySection: normalized.changedBySection,
            criteriaImproved: normalized.criteriaImproved,
            criteriaUnresolved: normalized.criteriaUnresolved,
            feedbackApplied: normalized.feedbackApplied,
            newIssues: normalized.newIssues,
            wordDelta: normalized.wordDelta,
            encouragement: normalized.encouragement
        },
        overall: normalized.overall,
        scores: normalized.scores,
        totalScore: normalized.scores.reduce((sum, row) => sum + (Number(row.score) || 0), 0),
        recommendation: { path: decision.path, reason: decision.reason }
    };

    return { modelName: reply.modelName, fields, original: fields };
};

/* ------------------------------------------------------------------ */
/* Summaries                                                           */
/* ------------------------------------------------------------------ */

const summarizeAssessment = (doc, extra = {}) => {
    const row = doc.toObject ? doc.toObject() : doc;
    delete row.aiOriginal;
    return {
        ...row,
        id: String(row._id),
        draftId: String(row.draft),
        previousDraftId: row.previousDraft ? String(row.previousDraft) : '',
        projectId: String(row.project),
        stage: extra.stage || '',
        status: extra.status || ''
    };
};

const projectSummary = (project) => ({
    id: String(project._id),
    stage: project.stage,
    status: project.status,
    draftCount: project.draftCount
});

/* ------------------------------------------------------------------ */
/* Assess one draft                                                    */
/* ------------------------------------------------------------------ */

export const assessDraft = async ({
    schoolId,
    draftId,
    userId,
    isAdmin = false,
    language = ''
}) => {
    const context = await loadDraftContext({ schoolId, draftId });
    const { draft, project, assignment } = context;
    assertOwner(assignment, userId, isAdmin);

    if (!sameId(project.latestDraft, draft._id)) {
        throw badRequest('Only the newest submitted draft can be assessed.');
    }

    await assertCanSpend({ schoolId, userId });
    const resolvedLanguage = await resolveLanguage({ schoolId, requestedLanguage: language });
    const assessment = await claimAssessment({
        schoolId,
        project,
        draft,
        kind: 'feedback',
        userId,
        language: resolvedLanguage
    });

    try {
        const result = await runFeedback({
            context,
            language: resolvedLanguage,
            billing: { schoolId, userId }
        });
        assessment.set({
            ...result.fields,
            aiStatus: 'done',
            aiError: '',
            ranAt: new Date(),
            modelUsed: result.modelName || '',
            aiOriginal: result.original
        });
        await assessment.save();
    } catch (error) {
        await failAssessment(assessment, error);
        throw upstream('The draft could not be assessed. Try again in a moment.');
    }

    const autosave = shouldAutoPublish(assignment);
    applyAssessmentToProject({ project, assessment, autoPublish: autosave, userId });
    await Promise.all([
        assessment.save(),
        project.save()
    ]);

    return {
        assessment: summarizeAssessment(assessment),
        project: projectSummary(project),
        autoPublished: assessment.publish?.state === 'published'
    };
};

/* ------------------------------------------------------------------ */
/* Compare two drafts                                                  */
/* ------------------------------------------------------------------ */

export const compareDrafts = async ({
    schoolId,
    draftId,
    userId,
    isAdmin = false,
    language = ''
}) => {
    const context = await loadDraftContext({ schoolId, draftId });
    const { draft, project, assignment } = context;
    assertOwner(assignment, userId, isAdmin);

    if (!sameId(project.latestDraft, draft._id)) {
        throw badRequest('Only the newest submitted draft can be compared.');
    }
    if (Number(draft.number) < 2) {
        throw badRequest('There is only one draft so far. A comparison needs two.');
    }

    const previousDraft = await WritingDraft.findOne({
        school: schoolId,
        project: project._id,
        number: Number(draft.number) - 1
    });
    if (!previousDraft) {
        throw notFound('The previous draft could not be found.');
    }

    const previousAssessment = await WritingAssessment.findOne({
        school: schoolId,
        draft: previousDraft._id,
        kind: 'feedback',
        aiStatus: 'done'
    }).sort({ createdAt: -1 }).lean();

    await assertCanSpend({ schoolId, userId });
    const resolvedLanguage = await resolveLanguage({ schoolId, requestedLanguage: language });
    const assessment = await claimAssessment({
        schoolId,
        project,
        draft,
        kind: 'comparison',
        previousDraft,
        userId,
        language: resolvedLanguage
    });

    try {
        const result = await runComparison({
            context,
            previousDraft,
            previousAssessment,
            language: resolvedLanguage,
            billing: { schoolId, userId }
        });
        assessment.set({
            ...result.fields,
            aiStatus: 'done',
            aiError: '',
            ranAt: new Date(),
            modelUsed: result.modelName || '',
            aiOriginal: result.original
        });
        await assessment.save();
    } catch (error) {
        await failAssessment(assessment, error);
        throw upstream('The drafts could not be compared. Try again in a moment.');
    }

    const autosave = shouldAutoPublish(assignment);
    applyAssessmentToProject({ project, assessment, autoPublish: autosave, userId });
    await Promise.all([
        assessment.save(),
        project.save()
    ]);

    return {
        assessment: summarizeAssessment(assessment),
        project: projectSummary(project),
        autoPublished: assessment.publish?.state === 'published'
    };
};

/* ------------------------------------------------------------------ */
/* Batch assess                                                        */
/* ------------------------------------------------------------------ */

export const assessPendingBatch = async ({
    schoolId,
    assignmentId,
    userId,
    isAdmin = false,
    classId = '',
    limit = 5,
    language = ''
}) => {
    const id = objectId(assignmentId);
    if (!id) throw notFound('Writing task not found.');

    const assignment = await WritingAssignment.findOne({ school: schoolId, _id: id }).lean();
    if (!assignment) throw notFound('Writing task not found.');
    assertOwner(assignment, userId, isAdmin);
    await assertCanSpend({ schoolId, userId });

    const cap = Math.min(Math.max(Number(limit) || 5, 1), 10);
    const filter = { school: schoolId, assignment: assignment._id, stage: 'submitted' };
    if (objectId(classId)) filter.class = classId;

    const waiting = await WritingProject.find(filter)
        .sort({ updatedAt: 1 })
        .limit(cap)
        .select('_id student latestDraft')
        .lean();

    const resolvedLanguage = await resolveLanguage({ schoolId, requestedLanguage: language });
    const outcomes = [];
    let creditStopped = false;

    // Sequential on purpose: one rate-limit budget and no malformed fan-out.
    for (const project of waiting) {
        if (!project.latestDraft) {
            outcomes.push({
                projectId: String(project._id),
                studentId: String(project.student),
                ok: false,
                error: 'No submitted draft was found.'
            });
            continue;
        }
        try {
            const result = await assessDraft({
                schoolId,
                draftId: project.latestDraft,
                userId,
                isAdmin,
                language: resolvedLanguage
            });
            outcomes.push({
                projectId: String(project._id),
                studentId: String(project.student),
                ok: true,
                assessmentId: result.assessment.id,
                recommendation: result.assessment.recommendation?.path || ''
            });
        } catch (error) {
            if (isCreditError(error)) {
                creditStopped = true;
                break;
            }
            outcomes.push({
                projectId: String(project._id),
                studentId: String(project.student),
                ok: false,
                error: text(error?.message || 'Assessment failed.', 300)
            });
        }
    }

    const remaining = await WritingProject.countDocuments({
        ...filter,
        stage: 'submitted'
    });

    return {
        attempted: outcomes.length,
        assessed: outcomes.filter((row) => row.ok).length,
        failed: outcomes.filter((row) => !row.ok).length,
        remaining,
        creditStopped,
        outcomes
    };
};

/* ------------------------------------------------------------------ */
/* Teacher edits                                                       */
/* ------------------------------------------------------------------ */

const applyEdits = ({ assessment, payload = {}, userId }) => {
    const changed = new Set();
    const mark = (path) => changed.add(path);

    if (!assessment.aiOriginal) {
        const plain = (row) => (typeof row?.toObject === 'function' ? row.toObject() : row);
        assessment.aiOriginal = {
            sections: (assessment.sections || []).map(plain),
            overall: plain(assessment.overall),
            scores: (assessment.scores || []).map(plain),
            totalScore: assessment.totalScore,
            comparison: plain(assessment.comparison),
            recommendation: plain(assessment.recommendation)
        };
    }

    if (Array.isArray(payload.sections)) {
        for (const incoming of payload.sections) {
            if (!incoming || !incoming.key) continue;
            const index = Number.isFinite(Number(incoming.index)) ? Number(incoming.index) : 0;
            const target = assessment.sections.find(
                (row) => row.key === incoming.key && Number(row.index) === index
            );
            if (!target) continue;
            const next = {
                strengths: incoming.strengths === undefined ? target.strengths : textList(incoming.strengths, 6, 260),
                improvements: incoming.improvements === undefined ? target.improvements : textList(incoming.improvements, 6, 260),
                evidence: incoming.evidence === undefined ? target.evidence : text(incoming.evidence, 300),
                why: incoming.why === undefined ? target.why : text(incoming.why, 400),
                nextStep: incoming.nextStep === undefined ? target.nextStep : text(incoming.nextStep, 400),
                score: incoming.score === undefined ? target.score : score(incoming.score, target.maxScore)
            };
            for (const [field, value] of Object.entries(next)) {
                const before = Array.isArray(target[field]) ? JSON.stringify(target[field]) : target[field];
                const after = Array.isArray(value) ? JSON.stringify(value) : value;
                if (before !== after) {
                    target[field] = value;
                    mark(`sections.${incoming.key}:${index}.${field}`);
                }
            }
        }
    }

    if (payload.overall && typeof payload.overall === 'object') {
        const limits = {
            summary: 1200,
            organisation: 600,
            centralIdea: 600,
            flow: 600,
            repetition: 600,
            requirements: 600
        };
        for (const [field, max] of Object.entries(limits)) {
            if (payload.overall[field] === undefined) continue;
            const value = text(payload.overall[field], max);
            if (value !== assessment.overall[field]) {
                assessment.overall[field] = value;
                mark(`overall.${field}`);
            }
        }
        if (payload.overall.nextPriorities !== undefined) {
            const value = textList(payload.overall.nextPriorities, 3, 260);
            if (JSON.stringify(value) !== JSON.stringify(assessment.overall.nextPriorities)) {
                assessment.overall.nextPriorities = value;
                mark('overall.nextPriorities');
            }
        }
    }

    if (Array.isArray(payload.scores)) {
        for (const incoming of payload.scores) {
            if (!incoming || !incoming.key) continue;
            const target = assessment.scores.find((row) => row.key === incoming.key);
            if (!target) continue;
            if (incoming.score !== undefined) {
                const value = score(incoming.score, target.maxScore);
                if (value !== target.score) {
                    target.score = value;
                    mark(`scores.${incoming.key}.score`);
                }
            }
            if (incoming.explanation !== undefined) {
                const value = text(incoming.explanation, 400);
                if (value !== target.explanation) {
                    target.explanation = value;
                    mark(`scores.${incoming.key}.explanation`);
                }
            }
        }
        assessment.totalScore = assessment.scores.reduce(
            (sum, row) => sum + (Number(row.score) || 0),
            0
        );
    }

    if (payload.recommendation && typeof payload.recommendation === 'object') {
        const path = payload.recommendation.path === 'notebook' ? 'notebook' : 'revise';
        if (path !== assessment.recommendation?.path) {
            assessment.recommendation.path = path;
            mark('recommendation.path');
        }
        if (payload.recommendation.reason !== undefined) {
            const reason = text(payload.recommendation.reason, 400);
            if (reason !== assessment.recommendation?.reason) {
                assessment.recommendation.reason = reason;
                mark('recommendation.reason');
            }
        }
    }

    if (assessment.kind === 'comparison' && payload.comparison && typeof payload.comparison === 'object') {
        const comparison = assessment.comparison || {};
        if (payload.comparison.encouragement !== undefined) {
            const value = text(payload.comparison.encouragement, 600);
            if (value !== comparison.encouragement) {
                comparison.encouragement = value;
                mark('comparison.encouragement');
            }
        }
        for (const field of ['criteriaImproved', 'criteriaUnresolved', 'newIssues']) {
            if (payload.comparison[field] === undefined) continue;
            const value = textList(payload.comparison[field], 8, 260);
            if (JSON.stringify(value) !== JSON.stringify(comparison[field] || [])) {
                comparison[field] = value;
                mark(`comparison.${field}`);
            }
        }
        if (Array.isArray(payload.comparison.changedBySection)) {
            for (const incoming of payload.comparison.changedBySection) {
                if (!incoming || !incoming.key) continue;
                const index = Number.isFinite(Number(incoming.index)) ? Number(incoming.index) : 0;
                const target = (comparison.changedBySection || []).find(
                    (row) => row.key === incoming.key && Number(row.index) === index
                );
                if (!target || incoming.summary === undefined) continue;
                const value = text(incoming.summary, 500);
                if (value !== target.summary) {
                    target.summary = value;
                    mark(`comparison.changedBySection.${incoming.key}:${index}.summary`);
                }
            }
        }
        if (Array.isArray(payload.comparison.feedbackApplied)) {
            for (const incoming of payload.comparison.feedbackApplied) {
                if (!incoming || !incoming.key) continue;
                const index = Number.isFinite(Number(incoming.index)) ? Number(incoming.index) : 0;
                const target = (comparison.feedbackApplied || []).find(
                    (row) => row.key === incoming.key && Number(row.index) === index
                );
                if (!target || incoming.applied === undefined) continue;
                const value = incoming.applied === true;
                if (value !== target.applied) {
                    target.applied = value;
                    mark(`comparison.feedbackApplied.${incoming.key}:${index}.applied`);
                }
            }
        }
        assessment.comparison = comparison;
    }

    if (changed.size || text(payload.note, 400)) {
        assessment.teacherEdits = {
            by: userId,
            at: new Date(),
            changedPaths: [...changed],
            note: text(payload.note, 400)
        };
    }
};

export const saveAssessmentEdits = async ({
    schoolId,
    assessmentId,
    userId,
    isAdmin = false,
    payload = {}
}) => {
    const id = objectId(assessmentId);
    if (!id) throw notFound('Assessment not found.');

    const assessment = await WritingAssessment.findOne({ school: schoolId, _id: id });
    if (!assessment) throw notFound('Assessment not found.');

    const [project, assignment] = await Promise.all([
        WritingProject.findOne({ school: schoolId, _id: assessment.project }),
        WritingAssignment.findOne({ school: schoolId, _id: assessment.assignment }).lean()
    ]);
    if (!project) throw notFound('Writing project not found.');
    assertOwner(assignment, userId, isAdmin);

    if (assessment.publish?.state === 'published') {
        throw conflict('This feedback is already published. Reassess the draft to make changes.');
    }
    if (assessment.aiStatus !== 'done') {
        throw badRequest('There is no finished assessment to edit yet.');
    }

    applyEdits({ assessment, payload, userId });
    await assessment.save();

    return {
        assessment: summarizeAssessment(assessment),
        project: projectSummary(project)
    };
};

/* ------------------------------------------------------------------ */
/* Publish                                                             */
/* ------------------------------------------------------------------ */

export const publishAssessment = async ({
    schoolId,
    assessmentId,
    userId,
    isAdmin = false,
    payload = {}
}) => {
    const id = objectId(assessmentId);
    if (!id) throw notFound('Assessment not found.');

    const assessment = await WritingAssessment.findOne({ school: schoolId, _id: id });
    if (!assessment) throw notFound('Assessment not found.');

    const [project, assignment] = await Promise.all([
        WritingProject.findOne({ school: schoolId, _id: assessment.project }),
        WritingAssignment.findOne({ school: schoolId, _id: assessment.assignment }).lean()
    ]);
    if (!project) throw notFound('Writing project not found.');
    assertOwner(assignment, userId, isAdmin);

    if (assessment.publish?.state === 'published') {
        return {
            assessment: summarizeAssessment(assessment),
            project: projectSummary(project),
            alreadyPublished: true
        };
    }
    if (assessment.aiStatus !== 'done') {
        throw badRequest('This assessment is not ready to publish.');
    }
    if (!sameId(assessment.draft, project.latestDraft)) {
        throw conflict('A newer draft has been submitted. This feedback can no longer be published.');
    }

    if (payload && Object.keys(payload).length) {
        applyEdits({ assessment, payload, userId });
    }

    const allowedFrom = PUBLISHABLE_FROM[assessment.kind] || [];
    const target = stageAfterPublish(assessment.kind, assessment.recommendation?.path);
    if (!allowedFrom.includes(project.stage)) {
        throw conflict('The student has already moved past this feedback. Assess the newest draft instead.');
    }
    if (!canMoveTo(project, target)) {
        throw conflict('This project is locked to a different stage. Remove the lock before publishing.');
    }

    project.stage = target;
    project.status = statusAfterPublish(assessment.recommendation?.path);
    markPublished(assessment, userId);
    project.latestAssessment = assessment._id;

    await Promise.all([
        assessment.save(),
        project.save()
    ]);

    // The family email is a courtesy, not part of the publish contract: it runs
    // detached and can never turn a successful publish into an error.
    void (async () => {
        try {
            const draft = await WritingDraft.findOne({ school: schoolId, _id: assessment.draft }).lean();
            await notifyFeedbackPublished({
                schoolId,
                project: project.toObject(),
                assignment,
                draft,
                assessment,
                notify: payload.notify
            });
        } catch (error) {
            logger.warn('writing_feedback_email_dispatch_failed', { error: error?.message });
        }
    })();

    return {
        assessment: summarizeAssessment(assessment),
        project: projectSummary(project),
        alreadyPublished: false
    };
};

/* ------------------------------------------------------------------ */
/* Stage override and notebook check                                   */
/* ------------------------------------------------------------------ */

const statusForStage = (stage) => {
    if (stage === 'completed') return 'completed';
    if (stage === 'ready_for_notebook' || stage === 'awaiting_notebook_check') return 'ready_for_final';
    return 'in_progress';
};

export const overrideStage = async ({
    schoolId,
    projectId,
    userId,
    isAdmin = false,
    payload = {}
}) => {
    const id = objectId(projectId);
    if (!id) throw notFound('Writing project not found.');

    const project = await WritingProject.findOne({ school: schoolId, _id: id });
    if (!project) throw notFound('Writing project not found.');

    const assignment = await WritingAssignment.findOne({
        school: schoolId,
        _id: project.assignment
    }).lean();
    assertOwner(assignment, userId, isAdmin);

    const unlock = payload.locked === false;
    if (unlock) {
        project.teacherOverride = {
            setBy: userId,
            at: new Date(),
            reason: text(payload.reason, 400)
        };
        await project.save();
        return { project: projectSummary(project) };
    }

    const stage = String(payload.stage || '').trim();
    if (!WRITING_STAGES.includes(stage)) {
        throw badRequest('That is not a stage of the writing workflow.');
    }
    if (stage === 'awaiting_notebook_check' || stage === 'completed') {
        throw badRequest('Use the notebook check to move a student through the final two stages.');
    }

    project.stage = stage;
    project.status = statusForStage(stage);
    project.teacherOverride = {
        setBy: userId,
        at: new Date(),
        reason: text(payload.reason, 400),
        stageLockedTo: stage
    };
    await project.save();

    return { project: projectSummary(project) };
};

const NOTEBOOK_STAGE = {
    not_requested: 'ready_for_notebook',
    requested: 'awaiting_notebook_check',
    checked: 'completed',
    revision_required: 'revising'
};

export const recordNotebookReview = async ({
    schoolId,
    projectId,
    userId,
    isAdmin = false,
    payload = {}
}) => {
    const id = objectId(projectId);
    if (!id) throw notFound('Writing project not found.');

    const project = await WritingProject.findOne({ school: schoolId, _id: id });
    if (!project) throw notFound('Writing project not found.');

    const assignment = await WritingAssignment.findOne({
        school: schoolId,
        _id: project.assignment
    }).lean();
    assertOwner(assignment, userId, isAdmin);

    const state = String(payload.state || '').trim();
    if (!NOTEBOOK_STATES.includes(state)) {
        throw badRequest('Choose a notebook result.');
    }

    const lockedTo = project.teacherOverride?.stageLockedTo;
    if (lockedTo && lockedTo !== NOTEBOOK_STAGE[state]) {
        throw conflict('This project is locked to a different stage. Remove the lock first.');
    }

    const totalPoints = (assignment.rubric || []).reduce(
        (sum, row) => sum + (Number(row.maxScore) || 0),
        0
    );
    const finalScore = payload.finalScore === undefined || payload.finalScore === ''
        ? undefined
        : score(payload.finalScore, totalPoints || 1000);

    project.set('notebook', {
        ...(project.notebook || {}),
        state,
        teacherNote: text(payload.note, 1000),
        checkedAt: state === 'checked' || state === 'revision_required' ? new Date() : project.notebook?.checkedAt,
        checkedBy: state === 'checked' || state === 'revision_required' ? userId : project.notebook?.checkedBy,
        finalScore
    });
    project.stage = NOTEBOOK_STAGE[state];
    project.status = state === 'checked'
        ? 'completed'
        : state === 'revision_required'
            ? 'needs_revision'
            : 'ready_for_final';
    await project.save();

    return {
        project: projectSummary(project),
        notebook: project.notebook?.state || 'not_requested'
    };
};
