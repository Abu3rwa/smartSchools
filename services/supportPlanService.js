import SupportCheckIn from '../models/SupportCheckIn.js';
import SupportCycle from '../models/SupportCycle.js';
import SupportPlan from '../models/SupportPlan.js';
import SupportSurvey from '../models/SupportSurvey.js';
import { buildPlanDraft } from './supportPlanBuilder.js';
import { supportError } from './supportAccessService.js';

export const buildDraftForCycle = async ({ schoolId, cycle, actorId }) => {
    const existing = await SupportPlan.findOne({ school: schoolId, cycle: cycle._id });
    if (existing?.status === 'published') {
        throw supportError(409, 'PLAN_PUBLISHED', 'A published plan cannot be replaced. Start next month for a new plan.');
    }

    const surveys = await SupportSurvey.find({
        school: schoolId,
        cycle: cycle._id,
        status: 'submitted',
    });
    const draft = buildPlanDraft(surveys);
    if (!draft) {
        throw supportError(400, 'NO_SURVEYS', 'Wait for at least one survey before creating the plan.');
    }

    const payload = {
        school: schoolId,
        cycle: cycle._id,
        student: cycle.student,
        class: cycle.class,
        academicYear: cycle.academicYear,
        month: cycle.month,
        status: 'draft',
        strengthKeys: draft.strengthKeys,
        focusKeys: draft.focusKeys,
        teacherCount: draft.teacherCount,
        parentCount: draft.parentCount,
        goals: draft.goals,
        sourceSurveyIds: surveys.map((survey) => survey._id),
        generatedBy: actorId,
        generatedAt: new Date(),
        updatedBy: actorId,
    };

    if (existing) {
        existing.set(payload);
        await existing.save();
        return existing;
    }

    return SupportPlan.create({ ...payload, createdBy: actorId });
};

export const approvePlan = async ({ schoolId, plan, actorId }) => {
    if (plan.status !== 'draft') {
        throw supportError(409, 'PLAN_NOT_DRAFT', 'Only a draft can be approved.');
    }
    if (!plan.goals?.length) {
        throw supportError(400, 'PLAN_EMPTY', 'Add at least one goal before approving.');
    }
    plan.status = 'approved';
    plan.approvedBy = actorId;
    plan.approvedAt = new Date();
    plan.updatedBy = actorId;
    await plan.save();
    return plan;
};

export const publishPlan = async ({ schoolId, plan, actorId }) => {
    if (!['approved', 'draft'].includes(plan.status)) {
        throw supportError(409, 'PLAN_NOT_PUBLISHABLE', 'This plan cannot be published.');
    }
    if (!plan.goals?.length) {
        throw supportError(400, 'PLAN_EMPTY', 'Add at least one goal before publishing.');
    }

    await SupportPlan.updateMany(
        {
            school: schoolId,
            student: plan.student,
            _id: { $ne: plan._id },
            status: 'published',
        },
        { $set: { status: 'closed' } },
    );
    await SupportCycle.updateMany(
        {
            school: schoolId,
            student: plan.student,
            _id: { $ne: plan.cycle },
            status: 'active',
        },
        { $set: { status: 'closed', closedAt: new Date() } },
    );

    plan.status = 'published';
    plan.publishedBy = actorId;
    plan.publishedAt = new Date();
    plan.updatedBy = actorId;
    await plan.save();

    await SupportCycle.updateOne(
        { _id: plan.cycle, school: schoolId },
        { $set: { status: 'active' } },
    );
    return plan;
};

export const findPlanTask = (plan, taskId) => {
    for (const goal of plan.goals || []) {
        const home = (goal.homeTasks || []).find((task) => task.id === taskId);
        if (home) return { goal, task: home, scope: 'home' };
        const classRoom = (goal.classTasks || []).find((task) => task.id === taskId);
        if (classRoom) return { goal, task: classRoom, scope: 'class' };
    }
    return null;
};

export const recordCheckIn = async ({
    plan,
    cycleId,
    studentId,
    taskId,
    status,
    note = '',
    scope,
    actorKind,
    actorId = null,
    respondentId = null,
}) => {
    if (!['done', 'didnt_fit', 'need_help'].includes(status)) {
        throw supportError(400, 'CHECKIN_STATUS', 'Choose done, did not fit, or need help.');
    }
    if (!['published', 'closed'].includes(plan.status)) {
        throw supportError(409, 'PLAN_NOT_LIVE', 'Check-ins open when the plan is published.');
    }
    const found = findPlanTask(plan, taskId);
    if (!found) throw supportError(404, 'TASK_NOT_FOUND', 'That task is not part of this plan.');
    if (found.scope !== scope) {
        throw supportError(400, 'TASK_SCOPE', 'That task belongs to the other side of the plan.');
    }

    const checkIn = await SupportCheckIn.findOneAndUpdate(
        {
            school: plan.school,
            plan: plan._id,
            taskId,
            scope,
        },
        {
            $set: {
                cycle: cycleId || plan.cycle,
                student: studentId || plan.student,
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
    return checkIn;
};

export const checkInsForPlan = async ({ schoolId, planId }) => SupportCheckIn.find({
    school: schoolId,
    plan: planId,
}).lean();

export const checkInsForPlans = async ({ schoolId, planIds = [] }) => {
    if (!planIds.length) return [];
    return SupportCheckIn.find({ school: schoolId, plan: { $in: planIds } }).lean();
};
