import { asyncHandler } from '../middleware/errorHandler.js';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SupportPlan from '../models/SupportPlan.js';
import SupportRespondent from '../models/SupportRespondent.js';
import SupportSurvey from '../models/SupportSurvey.js';
import {
    addExternalTeacher,
    assertClassManager,
    createCyclesForClass,
    cycleDetail,
    listClassesForUser,
    listCyclesForClass,
    loadClass,
    loadCycle,
    studentHistory,
} from '../services/supportCycleService.js';
import {
    approvePlan,
    buildDraftForCycle,
    checkInsForPlan,
    publishPlan,
    recordCheckIn,
} from '../services/supportPlanService.js';
import { rotateRespondentCode } from '../services/supportAccessService.js';
import { sendSurveyInvitations } from '../services/supportEmailService.js';
import { serializePlan, serializeRespondent } from '../services/supportSerializers.js';
import { supportError } from '../services/supportAccessService.js';

const schoolOf = (req) => req.schoolId;

export const getClasses = asyncHandler(async (req, res) => {
    const { classes, academicYear } = await listClassesForUser({
        schoolId: schoolOf(req),
        user: req.user,
        academicYear: req.academicYear,
        fallbackAcademicYear: req.schoolAcademicYear,
    });
    res.json({ success: true, data: { classes, academicYear } });
});

export const getClassCycles = asyncHandler(async (req, res) => {
    const { classId, month } = req.query;
    if (!classId) throw supportError(400, 'CLASS_REQUIRED', 'Choose a class.');
    const classDoc = await loadClass({
        schoolId: schoolOf(req),
        academicYear: req.academicYear,
        classId,
    });
    await assertClassManager({ schoolId: schoolOf(req), user: req.user, classDoc });
    const data = await listCyclesForClass({
        schoolId: schoolOf(req),
        academicYear: req.academicYear,
        classId,
        month,
    });
    res.json({ success: true, data });
});

export const createCycles = asyncHandler(async (req, res) => {
    const { classId, month, studentIds } = req.body;
    if (!classId) throw supportError(400, 'CLASS_REQUIRED', 'Choose a class.');
    const data = await createCyclesForClass({
        schoolId: schoolOf(req),
        academicYear: req.academicYear,
        user: req.user,
        classId,
        month,
        studentIds: Array.isArray(studentIds) ? studentIds : null,
        actorId: req.user._id,
    });
    res.status(201).json({ success: true, data });
});

export const getCycle = asyncHandler(async (req, res) => {
    const cycle = await loadCycle({ schoolId: schoolOf(req), cycleId: req.params.cycleId, user: req.user });
    const data = await cycleDetail({ schoolId: schoolOf(req), cycle });
    res.json({ success: true, data });
});

export const addExternal = asyncHandler(async (req, res) => {
    const cycle = await loadCycle({ schoolId: schoolOf(req), cycleId: req.params.cycleId, user: req.user });
    const data = await addExternalTeacher({
        schoolId: schoolOf(req),
        cycle,
        name: req.body.name,
        email: req.body.email,
        subjectId: req.body.subjectId,
        actorId: req.user._id,
    });
    res.status(201).json({ success: true, data });
});

const loadCycleSurveyRespondent = async ({ schoolId, cycleId, respondentId }) => {
    if (!mongoose.isValidObjectId(respondentId)) {
        throw supportError(400, 'RESPONDENT_INVALID', 'Choose a respondent.');
    }
    const survey = await SupportSurvey.findOne({
        school: schoolId,
        cycle: cycleId,
        respondent: respondentId,
    }).select('_id');
    if (!survey) throw supportError(404, 'RESPONDENT_NOT_FOUND', 'That respondent is not part of this cycle.');
    const respondent = await SupportRespondent.findById(respondentId).select('+codeHash');
    if (!respondent) throw supportError(404, 'RESPONDENT_NOT_FOUND', 'That respondent was not found.');
    return respondent;
};

export const rotateCode = asyncHandler(async (req, res) => {
    const cycle = await loadCycle({ schoolId: schoolOf(req), cycleId: req.params.cycleId, user: req.user });
    const respondent = await loadCycleSurveyRespondent({
        schoolId: schoolOf(req),
        cycleId: cycle._id,
        respondentId: req.params.respondentId,
    });
    const code = await rotateRespondentCode(respondent);
    respondent.codeDeliveredAt = null;
    await respondent.save();
    res.json({
        success: true,
        data: { respondent: serializeRespondent(respondent), code },
    });
});

export const sendInvites = asyncHandler(async (req, res) => {
    const cycle = await loadCycle({ schoolId: schoolOf(req), cycleId: req.params.cycleId, user: req.user });
    const student = await Student.findById(cycle.student).select('firstName lastName').lean();
    const respondentIds = Array.isArray(req.body.respondentIds) ? req.body.respondentIds : [];
    const query = { school: schoolOf(req), cycle: cycle._id };
    if (respondentIds.length > 0) query.respondent = { $in: respondentIds };

    const surveys = await SupportSurvey.find(query)
        .populate('subject', 'name')
        .populate({
            path: 'respondent',
            select: '+codeHash kind name email codeDeliveredAt teacher',
            populate: { path: 'teacher', select: 'firstName lastName email' },
        });

    const results = await sendSurveyInvitations({
        schoolId: schoolOf(req),
        cycle,
        surveys,
        student: student || {},
        senderUserId: cycle.homeroomTeacher?._id || req.user._id,
    });
    const sent = results.filter((row) => row.status === 'sent').length;
    res.json({
        success: true,
        message: sent > 0 ? 'Invitations sent.' : 'No invitation could be sent.',
        data: { results, sent },
    });
});

const loadPlanForCycle = async ({ schoolId, cycleId }) => {
    const plan = await SupportPlan.findOne({ school: schoolId, cycle: cycleId });
    if (!plan) throw supportError(404, 'PLAN_NOT_FOUND', 'Create the draft plan first.');
    return plan;
};

const planResponse = async (plan) => {
    const checkIns = await checkInsForPlan({ schoolId: plan.school, planId: plan._id });
    return serializePlan(plan, checkIns);
};

export const generateDraft = asyncHandler(async (req, res) => {
    const cycle = await loadCycle({ schoolId: schoolOf(req), cycleId: req.params.cycleId, user: req.user });
    const plan = await buildDraftForCycle({
        schoolId: schoolOf(req),
        cycle,
        actorId: req.user._id,
    });
    res.status(201).json({ success: true, data: await planResponse(plan) });
});

export const approve = asyncHandler(async (req, res) => {
    const cycle = await loadCycle({ schoolId: schoolOf(req), cycleId: req.params.cycleId, user: req.user });
    const plan = await loadPlanForCycle({ schoolId: schoolOf(req), cycleId: cycle._id });
    const approved = await approvePlan({ schoolId: schoolOf(req), plan, actorId: req.user._id });
    res.json({ success: true, data: await planResponse(approved) });
});

export const publish = asyncHandler(async (req, res) => {
    const cycle = await loadCycle({ schoolId: schoolOf(req), cycleId: req.params.cycleId, user: req.user });
    const plan = await loadPlanForCycle({ schoolId: schoolOf(req), cycleId: cycle._id });
    const published = await publishPlan({ schoolId: schoolOf(req), plan, actorId: req.user._id });
    res.json({ success: true, data: await planResponse(published) });
});

export const checkIn = asyncHandler(async (req, res) => {
    const cycle = await loadCycle({ schoolId: schoolOf(req), cycleId: req.params.cycleId, user: req.user });
    const plan = await loadPlanForCycle({ schoolId: schoolOf(req), cycleId: cycle._id });
    const { taskId, status, note } = req.body;
    const checkInDoc = await recordCheckIn({
        plan,
        cycleId: cycle._id,
        studentId: cycle.student,
        taskId,
        status,
        note,
        scope: 'class',
        actorKind: req.user.role === 'admin' ? 'staff' : 'teacher',
        actorId: req.user._id,
    });
    res.json({
        success: true,
        data: {
            taskId: checkInDoc.taskId,
            scope: checkInDoc.scope,
            status: checkInDoc.status,
            note: checkInDoc.note,
            updatedAt: checkInDoc.updatedAt,
        },
    });
});

export const history = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.studentId)) {
        throw supportError(400, 'STUDENT_INVALID', 'Choose a student.');
    }
    const student = await Student.findOne({
        _id: req.params.studentId,
        school: schoolOf(req),
        academicYear: req.academicYear,
    }).populate('currentClass', 'name grade section');
    if (!student) throw supportError(404, 'STUDENT_NOT_FOUND', 'That student was not found.');
    if (!['admin', 'super_admin'].includes(req.user.role) && student.currentClass) {
        const { classes } = await listClassesForUser({
            schoolId: schoolOf(req),
            user: req.user,
            academicYear: req.academicYear,
        });
        if (!classes.some((row) => row.id === String(student.currentClass._id))) {
            throw supportError(403, 'STUDENT_FORBIDDEN', 'This student is not in your classes.');
        }
    }
    const cycles = await studentHistory({ schoolId: schoolOf(req), studentId: student._id });
    res.json({ success: true, data: { cycles } });
});
