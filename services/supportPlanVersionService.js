import mongoose from 'mongoose';
import SupportPlan from '../models/SupportPlan.js';
import SupportPlanVersion from '../models/SupportPlanVersion.js';
import SupportCheckIn from '../models/SupportCheckIn.js';
import SupportSurvey from '../models/SupportSurvey.js';
import SupportCase from '../models/SupportCase.js';
import { supportError } from './supportAccessService.js';
import { isSupportAdmin, loadSettings } from './supportSettingsService.js';
import { buildGoalFromTemplate, templateText } from './supportLibrary.js';
import { concernScores } from './supportSelectionService.js';
import { pickFocusConcerns } from './supportPlanBuilder.js';
import { buildAiFacts, collectEvidence } from './supportEvidenceService.js';
import { findPlanTask } from './supportPlanService.js';
import { notifyParentUpdate } from './supportNotifyService.js';
import { connectAi } from '../utils/connectAi.js';
import logger from '../utils/logger.js';

const DAY = 24 * 60 * 60 * 1000;
const AI_FEATURE = 'support_plan_draft';

/* ------------------------------- periods ---------------------------------- */

const academicYearStart = (academicYear) => {
    const parsed = Number.parseInt(String(academicYear || '').slice(0, 4), 10);
    return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
};

export const academicPeriodFor = (academicYear, date = new Date()) => {
    const month = date.getMonth() + 1;
    return { month, academicYear: String(academicYear || '').trim() };
};

const periodEnd = ({ academicYear, month }) => {
    const start = academicYearStart(academicYear);
    const calendarYear = month >= 8 ? start : start + 1;
    const end = new Date(calendarYear, month, 0, 23, 59, 59, 999);
    return end;
};

/* ------------------------------ plan document ------------------------------ */

const ensurePlanDoc = async ({ schoolId, caseDoc, period, user }) => {
    const studentId = caseDoc.student?._id || caseDoc.student;
    const existing = await SupportPlan.findOne({
        school: schoolId,
        case: caseDoc._id,
        academicYear: period.academicYear,
        month: period.month,
    });
    if (existing) return existing;

    try {
        return await SupportPlan.create({
            school: schoolId,
            case: caseDoc._id,
            cycle: caseDoc.originCycle || null,
            student: studentId,
            class: caseDoc.class?._id || caseDoc.class,
            academicYear: period.academicYear,
            month: period.month,
            status: 'draft',
            createdBy: user?._id || null,
            updatedBy: user?._id || null,
        });
    } catch (error) {
        if (error?.code === 11000) {
            const raced = await SupportPlan.findOne({
                school: schoolId,
                case: caseDoc._id,
                academicYear: period.academicYear,
                month: period.month,
            });
            if (raced) return raced;
        }
        throw error;
    }
};

/* ------------------------------ draft building ----------------------------- */

const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);

const concernAttribution = ({ surveys, concern }) => {
    const audienceRoles = new Set();
    const subjectTally = new Map();
    for (const survey of surveys) {
        if (survey.status !== 'submitted') continue;
        const matches = (survey.questions || []).some((question) => question.key === concern);
        if (!matches) continue;
        if (survey.audience === 'teacher') {
            audienceRoles.add('teacher');
            const subjectId = String(survey.subject?._id || survey.subject || '');
            if (subjectId) subjectTally.set(subjectId, (subjectTally.get(subjectId) || 0) + 1);
        } else if (survey.audience === 'parent') {
            audienceRoles.add('parent');
        } else if (survey.audience === 'student') {
            audienceRoles.add('student');
        }
    }
    const roles = [...audienceRoles];
    const sourceRole = roles.length > 1 ? 'mixed' : (roles[0] || '');
    const subjects = [...subjectTally.entries()].sort((a, b) => b[1] - a[1]);
    const subject = subjects[0]?.[0] || null;
    const subjectName = subject
        ? (surveys.find((row) => String(row.subject?._id || row.subject || '') === subject)?.subject?.name || '')
        : '';
    return { sourceRole, subject, subjectName };
};

const assigneeForSubject = ({ caseDoc, subjectId }) => {
    if (!subjectId) return null;
    const row = (caseDoc.participants || []).find((participant) => (
        participant.active !== false
        && String(participant.subject || '') === String(subjectId)
        && participant.role === 'teacher'
    ));
    return row?.user?._id || (mongoose.isValidObjectId(row?.user) ? row.user : null) || null;
};

const goalsWithTasks = ({ goals, caseDoc, dueDate }) => goals.map((goal) => ({
    ...goal,
    targetDate: dueDate,
    homeTasks: (goal.homeTasks || []).map((task) => ({
        ...task,
        dueDate,
        assignedTo: null,
    })),
    classTasks: (goal.classTasks || []).map((task) => ({
        ...task,
        dueDate,
        assignedTo: assigneeForSubject({ caseDoc, subjectId: goal.subject }),
    })),
}));

const headlineFor = (focusKeys) => {
    const english = focusKeys
        .map((key) => templateText(key, 'title')?.en)
        .filter(Boolean)
        .join(', ');
    const arabic = focusKeys
        .map((key) => templateText(key, 'title')?.ar)
        .filter(Boolean)
        .join('، ');
    return {
        headline: english ? `This month we focus on ${english.toLowerCase()}.` : 'This month we focus on one step at a time.',
        headlineAr: arabic ? `نركز هذا الشهر على ${arabic}.` : 'نركز هذا الشهر على خطوة واحدة في كل مرة.',
        summary: 'A short plan agreed with the people who see this student every day. Each goal has one small task at home and one in class, and we will review what changed next month.',
        summaryAr: 'خطة قصيرة نتفق عليها مع من يرى هذا الطالب كل يوم. لكل هدف مهمة صغيرة في المنزل ومهمة في الصف، وسنراجع ما تغير الشهر القادم.',
    };
};

const parseJsonReply = (text) => {
    const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
        return JSON.parse(raw);
    } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }
};

const aiPrompt = ({ facts, goals }) => `You write the wording of a school support plan. Staff read and edit every word before publishing, and families read the published version.

FACTS (the only material you may use):
${JSON.stringify(facts)}

GOALS ALREADY CHOSEN (keep the same ids and meaning):
${JSON.stringify(goals.map((goal) => ({ id: goal.id, title: goal.title, titleAr: goal.titleAr, concern: goal.concern })))}

WRITE
- headline: one short sentence for the staff, under 200 characters, in English and Arabic.
- summary: two or three short sentences describing the plan, under 1200 characters, in English and Arabic.
- per goal: a plain description of what the team will try and what success looks like, under 600 and 400 characters, in English and Arabic.

RULES
- Never invent a name, an email, a phone number, a diagnosis, a grade that is not in FACTS, or a family situation.
- Never mention any person by name.
- Plain, calm language a parent and a teacher can both understand. No jargon, no abbreviations, no scores in Arabic copy.
- Write Arabic as natural Modern Standard Arabic, not a translation of English word order.

REPLY FORMAT
Return exactly one JSON object shaped like:
{"headline":{"en":"...","ar":"..."},"summary":{"en":"...","ar":"..."},"goals":[{"id":"...","description":{"en":"...","ar":"..."},"successLook":{"en":"...","ar":"..."}}]}
No markdown, no extra fields.`;

const applyAiWording = ({ draft, reply }) => {
    const parsed = parseJsonReply(reply?.text);
    if (!parsed) return false;
    const headline = parsed.headline || {};
    const summary = parsed.summary || {};
    if (headline.en) draft.headline = cleanText(headline.en, 200);
    if (headline.ar) draft.headlineAr = cleanText(headline.ar, 200);
    if (summary.en) draft.summary = cleanText(summary.en, 1200);
    if (summary.ar) draft.summaryAr = cleanText(summary.ar, 1200);
    const byId = new Map((Array.isArray(parsed.goals) ? parsed.goals : []).map((row) => [String(row?.id || ''), row]));
    draft.goals = draft.goals.map((goal) => {
        const row = byId.get(goal.id);
        if (!row) return goal;
        const description = row.description || {};
        const success = row.successLook || {};
        return {
            ...goal,
            description: description.en ? cleanText(description.en, 600) : goal.description,
            descriptionAr: description.ar ? cleanText(description.ar, 600) : goal.descriptionAr,
            successLook: success.en ? cleanText(success.en, 400) : goal.successLook,
            successLookAr: success.ar ? cleanText(success.ar, 400) : goal.successLookAr,
        };
    });
    return true;
};

const draftFromSurveys = async ({ schoolId, caseDoc, period }) => {
    const surveys = await SupportSurvey.find({
        school: schoolId,
        case: caseDoc._id,
        status: 'submitted',
    })
        .populate('subject', 'name')
        .sort({ submittedAt: -1 })
        .lean();

    if (surveys.length === 0) {
        throw supportError(400, 'NO_SURVEYS', 'Wait for at least one survey before drafting the plan.');
    }

    const scores = concernScores({ surveys, reviewPeriod: period });
    const focusKeys = pickFocusConcerns(scores, 3);
    if (!focusKeys.length) {
        throw supportError(400, 'NO_SCORED_ANSWERS', 'No scored answers are available yet. Draft the plan after the surveys are submitted.');
    }
    const strengthKeys = scores
        .filter((row) => row.score >= 0.7 && !focusKeys.includes(row.key))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map((row) => row.key);

    const dueDate = periodEnd(period);
    const goals = focusKeys.map((key) => {
        const goal = buildGoalFromTemplate(key);
        if (!goal) return null;
        const row = scores.find((entry) => entry.key === key);
        const attribution = concernAttribution({ surveys, concern: key });
        return {
            ...goal,
            ...attribution,
            baseline: row
                ? `${Math.round(row.score * 100)}% of the scale across ${row.answers} answer(s) from ${row.respondents} respondent(s).`
                : '',
        };
    }).filter(Boolean);

    if (!goals.length) {
        throw supportError(400, 'NO_GOAL_TEMPLATE', 'The selected concerns do not have a plan template yet.');
    }

    return {
        surveys,
        goals: goalsWithTasks({ goals, caseDoc, dueDate }),
        focusKeys,
        strengthKeys,
    };
};

export const draftPlanVersion = async ({ schoolId, caseDoc, user, useAi = true }) => {
    const settings = await loadSettings(schoolId);
    if (!settings.enabled) {
        throw supportError(403, 'SUPPORT_DISABLED', 'Student support is not enabled for this school.');
    }
    if (caseDoc.status !== 'active') {
        throw supportError(409, 'CASE_CLOSED', 'Reopen the case before drafting a new plan.');
    }

    const period = academicPeriodFor(caseDoc.academicYear);
    const plan = await ensurePlanDoc({ schoolId, caseDoc, period, user });
    const built = await draftFromSurveys({ schoolId, caseDoc, period });
    const wording = headlineFor(built.focusKeys);

    const draft = {
        headline: wording.headline,
        headlineAr: wording.headlineAr,
        summary: wording.summary,
        summaryAr: wording.summaryAr,
        strengthKeys: built.strengthKeys,
        focusKeys: built.focusKeys,
        goals: built.goals,
        studentEvidenceIncluded: caseDoc.studentEvidenceInPlan === true,
        staffOnly: false,
    };

    const warnings = [];
    if (useAi !== false && settings.aiPlanDrafts && process.env.OPENAI_API_KEY) {
        try {
            const evidence = await collectEvidence({ schoolId, caseDoc, windowDays: 120 });
            const facts = buildAiFacts({
                caseDoc,
                evidence,
                reviewPeriod: period,
                goalTitles: draft.goals.map((goal) => goal.title),
            });
            const reply = await connectAi(aiPrompt({ facts, goals: draft.goals }), {
                usage: { feature: AI_FEATURE },
            });
            if (!applyAiWording({ draft, reply })) {
                warnings.push({ code: 'AI_WORDING_INVALID', message: 'The AI reply could not be read, so the plain template wording was kept.' });
            }
        } catch (error) {
            logger.warn('support_plan_ai_draft_failed', { error: error?.message });
            warnings.push({ code: 'AI_UNAVAILABLE', message: 'AI wording was unavailable, so the plain template wording was kept.' });
        }
    } else if (useAi !== false && !settings.aiPlanDrafts) {
        warnings.push({ code: 'AI_DISABLED', message: 'AI plan drafts are turned off in support settings.' });
    }

    const latest = await SupportPlanVersion.findOne({ school: schoolId, plan: plan._id })
        .sort({ version: -1 });
    const now = new Date();

    if (latest && ['draft', 'approved'].includes(latest.status)) {
        latest.set({
            ...draft,
            status: 'draft',
            revision: (latest.revision || 1) + 1,
            generatedBy: user?._id || null,
            generatedAt: now,
            sourceSurveyIds: built.surveys.map((survey) => survey._id),
        });
        latest.approvedBy = null;
        latest.approvedAt = null;
        await latest.save();
        if (plan.status !== 'published') {
            plan.status = 'draft';
            plan.updatedBy = user?._id || null;
            await plan.save();
        }
        return { version: latest, warnings };
    }

    const versionNumber = (latest?.version || 0) + 1;
    const version = await SupportPlanVersion.create({
        ...draft,
        school: schoolId,
        plan: plan._id,
        case: caseDoc._id,
        student: caseDoc.student?._id || caseDoc.student,
        version: versionNumber,
        revision: 1,
        status: 'draft',
        sourceSurveyIds: built.surveys.map((survey) => survey._id),
        generatedBy: user?._id || null,
        generatedAt: now,
        createdBy: user?._id || null,
    });
    if (plan.status !== 'published') {
        plan.status = 'draft';
        plan.updatedBy = user?._id || null;
        await plan.save();
    }
    return { version, warnings };
};

/* -------------------------------- editing --------------------------------- */

const sanitizeTask = (task = {}) => ({
    id: cleanText(task.id, 24),
    title: cleanText(task.title, 240),
    titleAr: cleanText(task.titleAr, 240),
    note: cleanText(task.note, 400),
    noteAr: cleanText(task.noteAr, 400),
    assignedTo: mongoose.isValidObjectId(task.assignedTo) ? task.assignedTo : null,
    dueDate: task.dueDate ? new Date(task.dueDate) : null,
});

const sanitizeGoal = (goal = {}) => ({
    id: cleanText(goal.id, 24),
    concern: cleanText(goal.concern, 30).toLowerCase(),
    domain: ['academic', 'character', 'general'].includes(goal.domain) ? goal.domain : 'general',
    subject: mongoose.isValidObjectId(goal.subject) ? goal.subject : null,
    subjectName: cleanText(goal.subjectName, 120),
    sourceRole: ['teacher', 'parent', 'student', 'staff', 'homeroom', 'counselor', 'mixed', '']
        .includes(goal.sourceRole) ? goal.sourceRole : '',
    title: cleanText(goal.title, 200),
    titleAr: cleanText(goal.titleAr, 200),
    description: cleanText(goal.description, 600),
    descriptionAr: cleanText(goal.descriptionAr, 600),
    successLook: cleanText(goal.successLook, 400),
    successLookAr: cleanText(goal.successLookAr, 400),
    baseline: cleanText(goal.baseline, 400),
    targetDate: goal.targetDate ? new Date(goal.targetDate) : null,
    responsibleRole: ['teacher', 'counselor', 'family', 'student', 'school', '']
        .includes(goal.responsibleRole) ? goal.responsibleRole : '',
    responsibleUser: mongoose.isValidObjectId(goal.responsibleUser) ? goal.responsibleUser : null,
    homeTasks: Array.isArray(goal.homeTasks) ? goal.homeTasks.map(sanitizeTask) : [],
    classTasks: Array.isArray(goal.classTasks) ? goal.classTasks.map(sanitizeTask) : [],
});

const validateGoals = (goals) => {
    if (!Array.isArray(goals) || goals.length === 0) {
        throw supportError(400, 'PLAN_EMPTY', 'Add at least one goal before saving.');
    }
    if (goals.length > 6) {
        throw supportError(400, 'PLAN_TOO_LONG', 'A plan holds at most six goals.');
    }
    const ids = new Set();
    for (const goal of goals) {
        if (!goal.id || !goal.title) {
            throw supportError(400, 'GOAL_INCOMPLETE', 'Every goal needs an id and a title.');
        }
        if (ids.has(goal.id)) {
            throw supportError(400, 'GOAL_DUPLICATE', 'Every goal needs its own id.');
        }
        ids.add(goal.id);
        const taskIds = [...goal.homeTasks, ...goal.classTasks].map((task) => task.id);
        if (taskIds.some((id) => !id)) {
            throw supportError(400, 'TASK_INCOMPLETE', 'Every task needs an id and a title.');
        }
        const seen = new Set();
        for (const task of [...goal.homeTasks, ...goal.classTasks]) {
            if (seen.has(task.id)) {
                throw supportError(400, 'TASK_DUPLICATE', 'Two tasks share the same id.');
            }
            seen.add(task.id);
            if (!task.title) {
                throw supportError(400, 'TASK_INCOMPLETE', 'Every task needs a title.');
            }
        }
    }
};

export const updateDraftVersion = async ({ schoolId, versionId, revision, patch = {} }) => {
    if (!mongoose.isValidObjectId(versionId)) {
        throw supportError(400, 'VERSION_INVALID', 'Choose a plan draft.');
    }
    const version = await SupportPlanVersion.findOne({ _id: versionId, school: schoolId });
    if (!version) throw supportError(404, 'VERSION_NOT_FOUND', 'That plan draft was not found.');
    if (version.status !== 'draft') {
        throw supportError(409, 'VERSION_NOT_DRAFT', 'Only a draft can be edited. Start a new version instead.');
    }
    if (Number(revision) !== Number(version.revision)) {
        throw supportError(409, 'REVISION_CONFLICT', 'Someone changed this draft. Reload it before saving.', {
            currentRevision: version.revision,
        });
    }

    if ('headline' in patch) version.headline = cleanText(patch.headline, 200);
    if ('headlineAr' in patch) version.headlineAr = cleanText(patch.headlineAr, 200);
    if ('summary' in patch) version.summary = cleanText(patch.summary, 1200);
    if ('summaryAr' in patch) version.summaryAr = cleanText(patch.summaryAr, 1200);
    if ('studentEvidenceIncluded' in patch) version.studentEvidenceIncluded = patch.studentEvidenceIncluded === true;
    if ('staffOnly' in patch) version.staffOnly = patch.staffOnly === true;
    if ('focusKeys' in patch) {
        version.focusKeys = Array.isArray(patch.focusKeys)
            ? patch.focusKeys.map((row) => cleanText(row, 30)).filter(Boolean).slice(0, 6)
            : [];
    }
    if ('strengthKeys' in patch) {
        version.strengthKeys = Array.isArray(patch.strengthKeys)
            ? patch.strengthKeys.map((row) => cleanText(row, 30)).filter(Boolean).slice(0, 6)
            : [];
    }
    if ('goals' in patch) {
        const goals = (Array.isArray(patch.goals) ? patch.goals : []).map(sanitizeGoal);
        validateGoals(goals);
        version.goals = goals;
    }

    version.revision = (version.revision || 1) + 1;
    await version.save();
    return version;
};

/* ------------------------------- approval --------------------------------- */

const isCaseOwner = (caseDoc, user) => {
    const userId = String(user?._id || '');
    const owner = String(caseDoc.owner?._id || caseDoc.owner || '');
    const homeroom = String(caseDoc.homeroomTeacher?._id || caseDoc.homeroomTeacher || '');
    return Boolean(userId) && (userId === owner || userId === homeroom);
};

const isAssignedCounselor = (caseDoc, user) => {
    const userId = String(user?._id || '');
    if (!userId) return false;
    const counselor = String(caseDoc.counselor?._id || caseDoc.counselor || '');
    if (userId === counselor) return true;
    return (caseDoc.participants || []).some((row) => (
        row.role === 'counselor' && String(row.user?._id || row.user || '') === userId
    ));
};

export const canApproveVersion = ({ caseDoc, user, settings }) => {
    if (isSupportAdmin(user)) return true;
    if (!user?._id) return false;
    if (settings?.approvalMode === 'admin_approve') return false;
    if (settings?.approvalMode === 'counselor_approve') {
        return isAssignedCounselor(caseDoc, user) || isCaseOwner(caseDoc, user);
    }
    return isCaseOwner(caseDoc, user);
};

export const approvePlanVersion = async ({ schoolId, caseDoc, versionId, user }) => {
    const settings = await loadSettings(schoolId);
    if (!mongoose.isValidObjectId(versionId)) {
        throw supportError(400, 'VERSION_INVALID', 'Choose a plan draft.');
    }
    const version = await SupportPlanVersion.findOne({ _id: versionId, school: schoolId });
    if (!version) throw supportError(404, 'VERSION_NOT_FOUND', 'That plan draft was not found.');
    if (version.status === 'published') return version;
    if (!['draft', 'approved'].includes(version.status)) {
        throw supportError(409, 'VERSION_NOT_APPROVABLE', 'This version can no longer be approved.');
    }
    if (!canApproveVersion({ caseDoc, user, settings })) {
        throw supportError(403, 'APPROVAL_FORBIDDEN', 'Your role cannot approve this plan.');
    }
    if (!version.goals?.length) {
        throw supportError(400, 'PLAN_EMPTY', 'Add at least one goal before approving.');
    }

    version.status = 'approved';
    version.approvedBy = user?._id || null;
    version.approvedAt = new Date();
    await version.save();

    const plan = await SupportPlan.findOne({ _id: version.plan, school: schoolId });
    if (plan && plan.status !== 'published') {
        plan.status = 'approved';
        plan.approvedBy = user?._id || null;
        plan.approvedAt = new Date();
        plan.updatedBy = user?._id || null;
        await plan.save();
    }
    return version;
};

/* ------------------------------- publishing -------------------------------- */

const familyMessage = ({ version, goals }) => {
    const goalLines = goals.map((goal) => `• ${goal.title} / ${goal.titleAr || goal.title}`).join('\n');
    const message = `${version.headline}\n\n${goalLines}\n\n${version.summary}`;
    return message.slice(0, 4000);
};

export const publishPlanVersion = async ({ schoolId, caseDoc, versionId, user }) => {
    const settings = await loadSettings(schoolId);
    if (!mongoose.isValidObjectId(versionId)) {
        throw supportError(400, 'VERSION_INVALID', 'Choose a plan draft.');
    }
    const version = await SupportPlanVersion.findOne({ _id: versionId, school: schoolId });
    if (!version) throw supportError(404, 'VERSION_NOT_FOUND', 'That plan draft was not found.');

    if (version.status === 'published') {
        return { version, alreadyPublished: true, notified: 0 };
    }
    const ownerRelease = settings.approvalMode === 'owner_release' && version.status === 'draft';
    if (version.status !== 'approved' && !ownerRelease) {
        throw supportError(409, 'VERSION_NOT_APPROVED', 'Approve the plan before publishing it.');
    }
    if (!canApproveVersion({ caseDoc, user, settings })) {
        throw supportError(403, 'PUBLISH_FORBIDDEN', 'Your role cannot publish this plan.');
    }
    if (!version.goals?.length) {
        throw supportError(400, 'PLAN_EMPTY', 'Add at least one goal before publishing.');
    }

    const plan = await SupportPlan.findOne({ _id: version.plan, school: schoolId });
    if (!plan) throw supportError(404, 'PLAN_NOT_FOUND', 'The plan document was not found.');
    const now = new Date();

    await SupportPlanVersion.updateMany(
        { school: schoolId, case: caseDoc._id, _id: { $ne: version._id }, status: 'published' },
        { $set: { status: 'superseded' } },
    );
    await SupportPlan.updateMany(
        {
            school: schoolId,
            student: version.student,
            _id: { $ne: plan._id },
            status: 'published',
        },
        { $set: { status: 'closed' } },
    );

    version.status = 'published';
    version.approvedBy = version.approvedBy || user?._id || null;
    version.approvedAt = version.approvedAt || now;
    version.publishedBy = user?._id || null;
    version.publishedAt = now;
    await version.save();

    plan.set({
        status: 'published',
        version: version.version,
        currentVersion: version.version,
        headline: version.headline,
        headlineAr: version.headlineAr || '',
        summary: version.summary,
        summaryAr: version.summaryAr || '',
        staffOnly: version.staffOnly === true,
        strengthKeys: version.strengthKeys,
        focusKeys: version.focusKeys,
        goals: version.goals,
        sourceSurveyIds: version.sourceSurveyIds,
        approvedBy: version.approvedBy,
        approvedAt: version.approvedAt,
        publishedBy: user?._id || null,
        publishedAt: now,
        updatedBy: user?._id || null,
    });
    await plan.save();

    await SupportCase.updateOne(
        { _id: caseDoc._id, school: schoolId },
        {
            $set: {
                currentPlan: plan._id,
                lastReviewAt: now,
                nextReviewAt: new Date(now.getTime() + Math.max(Number(caseDoc.cadenceDays) || 30, 7) * DAY),
                updatedBy: user?._id || null,
            },
        },
    );

    let notified = 0;
    if (settings.integrations?.parentUpdates && settings.notifications?.planPublished && !version.staffOnly) {
        const contacts = (caseDoc.familyContacts || [])
            .filter((row) => row.active !== false && row.email)
            .map((row) => String(row.email).trim().toLowerCase());
        try {
            notified = await notifyParentUpdate({
                schoolId,
                studentId: version.student,
                parentEmails: [...new Set(contacts)],
                type: 'support_plan_published',
                subject: `Support plan published / نُشرت خطة الدعم`,
                message: familyMessage({ version, goals: version.goals }),
                actorId: user?._id || null,
                metadata: { planId: String(plan._id), versionId: String(version._id) },
            });
        } catch (error) {
            logger.warn('support_plan_parent_update_failed', { error: error?.message });
        }
    }

    return { version, plan, alreadyPublished: false, notified };
};

/* ------------------------------ goal outcomes ------------------------------ */

export const setGoalOutcome = async ({ schoolId, versionId, goalId, outcome, note = '', user }) => {
    const allowed = ['met', 'partially_met', 'not_met', 'insufficient_evidence'];
    if (!allowed.includes(outcome)) {
        throw supportError(400, 'OUTCOME_INVALID', 'Choose met, partly met, not met, or not enough evidence.');
    }
    if (!mongoose.isValidObjectId(versionId)) {
        throw supportError(400, 'VERSION_INVALID', 'Choose a plan version.');
    }
    const version = await SupportPlanVersion.findOne({ _id: versionId, school: schoolId });
    if (!version) throw supportError(404, 'VERSION_NOT_FOUND', 'That plan version was not found.');
    if (version.status !== 'published') {
        throw supportError(409, 'VERSION_NOT_PUBLISHED', 'Review outcomes on a published plan.');
    }
    const goal = (version.goals || []).find((row) => row.id === goalId);
    if (!goal) throw supportError(404, 'GOAL_NOT_FOUND', 'That goal is not part of this plan.');
    goal.outcome = outcome;
    goal.outcomeNote = String(note || '').trim().slice(0, 800);
    goal.reviewedAt = new Date();
    await version.save();

    await SupportPlan.updateOne(
        { _id: version.plan, school: schoolId, 'goals.id': goalId },
        {
            $set: {
                'goals.$.outcome': outcome,
                'goals.$.outcomeNote': goal.outcomeNote,
                'goals.$.reviewedAt': goal.reviewedAt,
                updatedBy: user?._id || null,
            },
        },
    );
    return version;
};

/* ------------------------------- check-ins -------------------------------- */

const actorKeyFor = ({ actorKind, actorId, respondentId, studentId }) => {
    if (actorKind === 'parent') return `parent:${String(respondentId || '')}`;
    if (actorKind === 'student') return `student:${String(respondentId || studentId || '')}`;
    if (actorKind === 'staff') return `staff:${String(actorId || '')}`;
    return `teacher:${String(actorId || '')}`;
};

export const recordTaskCheckIn = async ({
    schoolId,
    caseDoc,
    taskId,
    scope,
    status,
    note = '',
    actorKind,
    actorId = null,
    respondentId = null,
}) => {
    if (!['done', 'didnt_fit', 'need_help'].includes(status)) {
        throw supportError(400, 'CHECKIN_STATUS', 'Choose done, did not fit, or need help.');
    }
    if (!['teacher', 'parent', 'staff', 'student'].includes(actorKind)) {
        throw supportError(400, 'CHECKIN_ACTOR', 'Choose who is answering.');
    }
    const plan = await SupportPlan.findOne({ _id: caseDoc.currentPlan, school: schoolId });
    if (!plan || plan.status !== 'published') {
        throw supportError(409, 'PLAN_NOT_LIVE', 'Check-ins open when a plan is published.');
    }
    const found = findPlanTask(plan, taskId);
    if (!found) throw supportError(404, 'TASK_NOT_FOUND', 'That task is not part of this plan.');
    if (found.scope !== scope) {
        throw supportError(400, 'TASK_SCOPE', 'That task belongs to the other side of the plan.');
    }

    const actorKey = actorKeyFor({
        actorKind,
        actorId,
        respondentId,
        studentId: caseDoc.student?._id || caseDoc.student,
    });
    if (actorKey.endsWith(':')) {
        throw supportError(400, 'CHECKIN_ACTOR', 'Who is answering could not be identified.');
    }

    return SupportCheckIn.findOneAndUpdate(
        { school: schoolId, plan: plan._id, taskId, scope, actorKey },
        {
            $set: {
                case: caseDoc._id,
                cycle: plan.cycle || null,
                student: plan.student,
                goalId: found.goal.id,
                status,
                note: String(note || '').trim().slice(0, 600),
                actorKind,
                actor: actorId,
                respondent: respondentId,
            },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    );
};

/* --------------------------------- reads ---------------------------------- */

export const listPlanVersions = async ({ schoolId, caseId }) => SupportPlanVersion.find({
    school: schoolId,
    case: caseId,
}).sort({ version: -1 }).lean();

export const latestPublishedVersion = async ({ schoolId, caseId }) => SupportPlanVersion.findOne({
    school: schoolId,
    case: caseId,
    status: 'published',
}).sort({ version: -1 });

export const latestDraftVersion = async ({ schoolId, caseId }) => SupportPlanVersion.findOne({
    school: schoolId,
    case: caseId,
    status: 'draft',
}).sort({ version: -1 });
