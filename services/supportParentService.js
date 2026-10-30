import mongoose from 'mongoose';
import SupportCheckIn from '../models/SupportCheckIn.js';
import SupportCycle from '../models/SupportCycle.js';
import SupportPlan from '../models/SupportPlan.js';
import SupportRespondent from '../models/SupportRespondent.js';
import SupportSurvey from '../models/SupportSurvey.js';
import {
    getParentLinkedStudentById,
    getParentLinkedStudents,
} from './parentDashboardService.js';
import { supportError } from './supportAccessService.js';
import { recordCheckIn } from './supportPlanService.js';
import { serializePlan, serializeSurvey, studentSummary } from './supportSerializers.js';

const linkedChild = async ({ schoolId, parentUser, childId, academicYear }) => (
    getParentLinkedStudentById({ schoolId, parentUser, academicYear, childId })
);

const parentRespondentFor = async ({ schoolId, studentId }) => SupportRespondent.findOne({
    school: schoolId,
    kind: 'parent',
    student: studentId,
});

export const parentSupportOverview = async ({ schoolId, parentUser, academicYear }) => {
    const children = await getParentLinkedStudents({ schoolId, parentUser, academicYear });
    if (children.length === 0) return { children: [] };

    const childIds = children.map((child) => child._id);
    const [plans, respondents, surveys] = await Promise.all([
        SupportPlan.find({
            school: schoolId,
            student: { $in: childIds },
            status: { $in: ['published', 'closed'] },
        }).sort({ publishedAt: -1 })
            .limit(12)
            .lean(),
        SupportRespondent.find({ school: schoolId, kind: 'parent', student: { $in: childIds } })
            .select('student name email codeHint lastAccessAt')
            .lean(),
        SupportSurvey.find({
            school: schoolId,
            student: { $in: childIds },
            audience: 'parent',
            status: { $in: ['sent', 'opened'] },
        })
            .populate('cycle', 'month academicYear status')
            .sort({ createdAt: -1 })
            .limit(12),
    ]);

    const checkIns = plans.length
        ? await SupportCheckIn.find({
            school: schoolId,
            plan: { $in: plans.map((plan) => plan._id) },
        }).lean()
        : [];

    return {
        children: children.map((child) => {
            const childPlans = plans.filter((plan) => String(plan.student) === String(child._id));
            const respondent = respondents.find((row) => String(row.student) === String(child._id));
            const survey = surveys.find((row) => String(row.student) === String(child._id));
            return {
                student: studentSummary(child),
                respondent: respondent
                    ? {
                        codeHint: respondent.codeHint,
                        hasEmail: Boolean(respondent.email),
                        lastAccessAt: respondent.lastAccessAt,
                    }
                    : null,
                plan: childPlans.length
                    ? serializePlan(
                        childPlans[0],
                        checkIns.filter((checkIn) => String(checkIn.plan) === String(childPlans[0]._id)),
                    )
                    : null,
                history: childPlans.slice(1, 4).map((plan) => {
                    const serialized = serializePlan(
                        plan,
                        checkIns.filter((checkIn) => String(checkIn.plan) === String(plan._id)),
                    );
                    return {
                        id: String(plan._id),
                        month: plan.month,
                        academicYear: plan.academicYear,
                        status: plan.status,
                        homeProgress: serialized.homeProgress,
                        classProgress: serialized.classProgress,
                    };
                }),
                survey: survey ? serializeSurvey(survey, { includeAnswers: true }) : null,
            };
        }),
    };
};

const planForParent = async ({ schoolId, parentUser, planId, academicYear }) => {
    if (!mongoose.isValidObjectId(planId)) {
        throw supportError(400, 'PLAN_INVALID', 'Choose a plan.');
    }
    const plan = await SupportPlan.findOne({ _id: planId, school: schoolId });
    if (!plan) throw supportError(404, 'PLAN_NOT_FOUND', 'That plan was not found.');
    const student = await linkedChild({
        schoolId,
        parentUser,
        childId: plan.student,
        academicYear: academicYear || plan.academicYear,
    });
    if (!student) throw supportError(403, 'PLAN_FORBIDDEN', 'This plan is not linked to your account.');
    return { plan, student };
};

export const parentCheckIn = async ({ schoolId, parentUser, planId, taskId, status, note, academicYear }) => {
    const { plan, student } = await planForParent({ schoolId, parentUser, planId, academicYear });
    const respondent = await parentRespondentFor({ schoolId, studentId: student._id });
    const checkIn = await recordCheckIn({
        plan,
        cycleId: plan.cycle,
        studentId: plan.student,
        taskId,
        status,
        note,
        scope: 'home',
        actorKind: 'parent',
        actorId: parentUser._id,
        respondentId: respondent?._id || null,
    });
    return checkIn;
};

const surveyForParent = async ({ schoolId, parentUser, surveyId }) => {
    if (!mongoose.isValidObjectId(surveyId)) {
        throw supportError(400, 'SURVEY_INVALID', 'Choose a survey.');
    }
    const survey = await SupportSurvey.findOne({
        _id: surveyId,
        school: schoolId,
        audience: 'parent',
    }).populate('cycle', 'month academicYear status');
    if (!survey) throw supportError(404, 'SURVEY_NOT_FOUND', 'That survey was not found.');
    const student = await linkedChild({
        schoolId,
        parentUser,
        childId: survey.student,
        academicYear: survey.cycle?.academicYear,
    });
    if (!student) throw supportError(403, 'SURVEY_FORBIDDEN', 'This survey is not linked to your account.');
    return survey;
};

export const parentSurveyAnswers = async ({ schoolId, parentUser, surveyId, answers }) => {
    const survey = await surveyForParent({ schoolId, parentUser, surveyId });
    const { saveAnswers } = await import('./supportSurveyService.js');
    return saveAnswers({ survey, incomingAnswers: answers });
};

export const parentSubmitSurvey = async ({ schoolId, parentUser, surveyId, answers }) => {
    const survey = await surveyForParent({ schoolId, parentUser, surveyId });
    const { submitAnswers } = await import('./supportSurveyService.js');
    return submitAnswers({ survey, incomingAnswers: answers });
};

export const parentPlanHistory = async ({ schoolId, parentUser, studentId, academicYear }) => {
    const student = await linkedChild({ schoolId, parentUser, childId: studentId, academicYear });
    if (!student) throw supportError(403, 'CHILD_FORBIDDEN', 'This child is not linked to your account.');
    const cycles = await SupportCycle.find({ school: schoolId, student: studentId })
        .sort({ academicYear: -1, createdAt: -1 })
        .limit(12)
        .lean();
    const plans = await SupportPlan.find({
        school: schoolId,
        student: studentId,
        status: { $in: ['published', 'closed'] },
    }).sort({ publishedAt: -1 }).lean();
    const checkIns = plans.length
        ? await SupportCheckIn.find({ school: schoolId, plan: { $in: plans.map((plan) => plan._id) } }).lean()
        : [];
    return {
        student: studentSummary(student),
        cycles: cycles.map((cycle) => ({
            id: String(cycle._id),
            month: cycle.month,
            academicYear: cycle.academicYear,
            status: cycle.status,
        })),
        plans: plans.map((plan) => serializePlan(
            plan,
            checkIns.filter((checkIn) => String(checkIn.plan) === String(plan._id)),
        )),
    };
};
