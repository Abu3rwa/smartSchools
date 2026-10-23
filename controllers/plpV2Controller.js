import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import { withTransaction } from '../utils/withTransaction.js';
import { buildPlpPaginationMetadata, getPlpPagination } from '../services/plpPaginationService.js';
import { toPlpHistoryItem, toStudentVisibleGoal, toStudentVisibleTask } from '../services/plpPrivacyService.js';
import PlpCycle from '../models/PlpCycle.js';
import PlpStudentRecord from '../models/PlpStudentRecord.js';
import PlpGoal from '../models/PlpGoal.js';
import PlpTask from '../models/PlpTask.js';
import PlpActivity from '../models/PlpActivity.js';
import PlpEvidence from '../models/PlpEvidence.js';
import PlpTraitConfig from '../models/PlpTraitConfig.js';
import PlpInteraction from '../models/PlpInteraction.js';
import PlpEmailConsent from '../models/PlpEmailConsent.js';
import PlpEmailDelivery from '../models/PlpEmailDelivery.js';
import Notification from '../models/Notification.js';
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js';
import Student from '../models/Student.js';
import Subject from '../models/Subject.js';
import { writePlpAudit } from '../services/plpAuditService.js';
import Standard from '../models/Standard.js';
import {
    buildCopiedGoal,
    buildCopiedTask,
    isCompatibleDestinationRecord,
    normalizeDestinationRecordIds,
} from '../services/plpGoalCopyService.js';
import logger from '../utils/logger.js';
import {
    assertRecordAccess,
    assertTeacherRecordWriteAccess,
    getStudentProfileFromUser,
    getTeacherHomeroomClassIds,
} from '../services/plpAccessService.js';
import { normalizeGoalMilestones, parseOptionalPlpDate } from '../services/plpGoalProgressService.js';
import {
    PLP_EMAIL_LANGUAGES,
    buildPlpEmailRecipientCandidates,
    buildPlpProgressEmail,
    describeEmailDeliveryError,
    getPlpEmailDeliveryAttempt,
    normalizePlpEmailLanguage,
} from '../services/plpProgressEmailService.js';
import { sendTransactionalEmail } from '../services/transactionalEmailService.js';
import plpAiService from '../services/plpAiService.js';
import {
    collectPracticeCandidates,
    resolvePracticeLinks,
} from '../services/plpPracticeLinkService.js';

const audit = (school, actor, action, targetType, targetId, meta) =>
    writePlpAudit({ school, actor, action, targetType, targetId, meta });

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plpContactEmailFields = [
    'studentEmail',
    'email',
    'parentInfo.fatherEmail',
    'parentInfo.motherEmail',
    'parentInfo.guardianEmail',
];

const resolveAuthenticatedPlpEmailContact = async (req, studentId) => {
    const email = String(req.user.email || '').trim().toLowerCase();
    const resolvedStudentId = studentId || (
        req.user.role === 'student'
            ? (await getStudentProfileFromUser(req.user))?._id
            : null
    );
    if (!email || !resolvedStudentId) {
        throw Object.assign(new Error('Student and authenticated account email are required'), { statusCode: 400 });
    }
    if (!mongoose.isValidObjectId(resolvedStudentId)) {
        throw Object.assign(new Error('Invalid student ID'), { statusCode: 400 });
    }
    const query = { _id: resolvedStudentId, school: req.user.school };
    if (req.user.role === 'student') {
        query.user = req.user._id;
        query.status = 'active';
    } else if (req.user.role === 'parent') {
        const escapedEmail = escapeRegex(email);
        query.$or = [
            { 'parentInfo.fatherEmail': new RegExp(`^${escapedEmail}$`, 'i') },
            { 'parentInfo.motherEmail': new RegExp(`^${escapedEmail}$`, 'i') },
            { 'parentInfo.guardianEmail': new RegExp(`^${escapedEmail}$`, 'i') },
        ];
    } else {
        throw Object.assign(new Error('Only students and linked parents can manage PLP email preferences'), { statusCode: 403 });
    }
    const student = await Student.findOne(query)
        .select('_id school user firstName lastName email studentEmail parentInfo')
        .lean();
    if (!student) {
        throw Object.assign(new Error('Student not found or not linked to this account'), { statusCode: 404 });
    }
    const matchingContact = plpContactEmailFields.some((field) => {
        const value = field.split('.').reduce((current, key) => current?.[key], student);
        return String(value || '').trim().toLowerCase() === email;
    });
    const linkedStudentAccount = req.user.role === 'student'
        && String(student.user) === String(req.user._id);
    if (!matchingContact && !linkedStudentAccount) {
        throw Object.assign(new Error('This account email is not a listed contact for the student'), { statusCode: 403 });
    }
    const recipientType = req.user.role === 'student'
        ? 'student'
        : (['father', 'mother', 'guardian'].find((type) =>
            String(student.parentInfo?.[`${type}Email`] || '').trim().toLowerCase() === email
        ) || 'guardian');
    return { student, email, recipientType };
};

const loadProgressEmailContext = async (req, recordId, { language = 'en' } = {}) => {
    if (!mongoose.isValidObjectId(recordId)) {
        throw Object.assign(new Error('PLP record not found'), { statusCode: 404 });
    }
    const record = await PlpStudentRecord.findOne({ _id: recordId, school: req.user.school })
        .populate('student', 'firstName lastName studentId email studentEmail parentInfo user')
        .populate('student.user', 'email')
        .populate('cycle', 'title')
        .populate('teacher', 'firstName lastName')
        .lean();
    if (!record) throw Object.assign(new Error('PLP record not found'), { statusCode: 404 });
    await assertTeacherRecordWriteAccess(req.user, record);
    const [goals, tasks, consents] = await Promise.all([
        PlpGoal.find({ school: req.user.school, plpRecord: record._id }).sort({ createdAt: 1 }).lean(),
        PlpTask.find({ school: req.user.school, plpRecord: record._id }).sort({ createdAt: 1 }).lean(),
        PlpEmailConsent.find({ school: req.user.school, student: record.student._id }).lean(),
    ]);
    const recipients = buildPlpEmailRecipientCandidates(record.student, consents);
    return {
        record,
        student: record.student,
        goals,
        tasks,
        recipients,
        email: buildPlpProgressEmail({
            student: record.student,
            record,
            goals,
            tasks,
            language,
            school: req.school,
            teacher: record.teacher,
            sentAt: new Date(),
        }),
    };
};

const buildTeacherReviewQueueRecordFilter = async (req, statuses = ['in_progress']) => {
    const academicYear = String(req.query.academicYear || '').trim();
    if (!academicYear || academicYear.length > 20) {
        throw Object.assign(new Error('A valid academicYear is required'), { statusCode: 400 });
    }
    const filter = { school: req.user.school, status: { $in: statuses }, academicYear };
    if (req.query.cycleId) {
        if (!mongoose.isValidObjectId(req.query.cycleId)) {
            throw Object.assign(new Error('Invalid cycleId'), { statusCode: 400 });
        }
        filter.cycle = req.query.cycleId;
    }
    if (req.user.role === 'teacher') {
        const classIds = await getTeacherHomeroomClassIds(req.user.school, req.user._id, academicYear);
        filter.class = { $in: classIds };
    } else if (req.user.role !== 'admin') {
        throw Object.assign(new Error('Only teachers and admins can view PLP review queues'), { statusCode: 403 });
    }
    return filter;
};

const notifyStudentForTask = async ({ schoolId, task, type, subject, message, actorId, eventKey }) => {
    const student = await Student.findOne({ school: schoolId, _id: task.student })
        .select('_id user email studentEmail')
        .lean();
    if (!student?.user) return { status: 'skipped', reason: 'Student portal account is not linked' };
    const recipientEmail = student?.email || student?.studentEmail || 'internal-notification@system.local';
    if (eventKey && await Notification.exists({
        school: schoolId,
        recipient: student.user,
        'metadata.eventKey': eventKey,
    })) return { status: 'queued' };
    await Notification.create({
        school: schoolId,
        recipient: student.user,
        recipientEmail,
        student: student._id,
        type,
        subject,
        message,
        channels: ['push'],
        metadata: { source: 'plp_task', taskId: task._id, plpRecordId: task.plpRecord, eventKey },
        createdBy: actorId,
    });
    return { status: 'queued' };
};

const queueTaskNotification = async ({ schoolId, task, type, subject, message, actorId, eventKey }) => {
    const stableEventKey = eventKey || task.notificationEventKey || `${task._id}:${type}:${Date.now()}`;
    task.notificationEventKey = stableEventKey;
    try {
        const result = await notifyStudentForTask({
            schoolId,
            task,
            type,
            subject,
            message,
            actorId,
            eventKey: stableEventKey,
        });
        task.notificationStatus = result.status;
        task.notificationError = result.reason || '';
        task.notifiedAt = result.status === 'queued' ? new Date() : null;
        await task.save();
        return result;
    } catch (error) {
        logger.error('PLP task notification could not be queued', {
            taskId: String(task._id),
            error: error.message,
        });
        task.notificationStatus = 'failed';
        task.notificationError = 'Notification could not be queued. Retry is available.';
        task.notifiedAt = null;
        await task.save();
        return { status: 'failed', reason: task.notificationError };
    }
};

const countWords = (text = '') => {
    return String(text)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .length;
};

const assertMaxWords = (label, text, maxWords) => {
    if (!text) return;
    const words = countWords(text);
    if (words > maxWords) {
        throw Object.assign(new Error(`${label} must be ${maxWords} words or fewer`), { statusCode: 400 });
    }
};

export const buildTaskDraftSuggestions = ({ goalType, linkedSubjectId, studentName, priorGoals = [], priorTasks = [] }) => {
    const subjectLabel = linkedSubjectId ? String(linkedSubjectId) : (goalType === 'academic' ? 'core academic work' : 'classroom character growth');
    const goalHistory = priorGoals
        .filter((goal) => goal && typeof goal.title === 'string' && goal.title.trim())
        .slice(0, 3)
        .map((goal) => goal.title.trim());
    const taskHistory = priorTasks
        .filter((task) => task && typeof task.title === 'string' && task.title.trim())
        .slice(0, 3)
        .map((task) => task.title.trim());

    const historicalKeywords = [...goalHistory, ...taskHistory]
        .join(' ')
        .toLowerCase();
    const academicFocus = /\b(multiplication|division|fractions|addition|subtraction|reading|writing|science|math|literacy|comprehension|problem solving|essay|research)\b/.exec(historicalKeywords);
    const focusPhrase = academicFocus ? academicFocus[0].trim() : null;

    const templates = goalType === 'academic'
        ? [
            {
                title: focusPhrase ? `Practice ${focusPhrase} with a short ${subjectLabel} challenge` : `Complete a ${subjectLabel} practice set`,
                reason: 'Builds on prior academic goals and reinforces current skill work.'
            },
            {
                title: focusPhrase ? `Explain one ${focusPhrase} strategy in writing` : `Explain one ${subjectLabel} strategy in writing`,
                reason: 'Uses prior task history to strengthen reflection and academic communication.'
            },
            {
                title: focusPhrase ? `Review and improve one previous ${focusPhrase} mistake` : `Review and improve one previous ${subjectLabel} mistake`,
                reason: 'Targets a common growth area from recent learning history.'
            },
        ]
        : [
            { title: `Practice a classroom leadership action`, reason: 'Supports ongoing character growth and confidence-building habits.' },
            { title: `Reflect on one respectful choice and its impact`, reason: 'Builds on prior reflection habits and social-emotional learning goals.' },
            { title: `Take initiative in a team or peer-support task`, reason: 'Encourages steady progress in collaboration and responsibility.' },
        ];

    const historyPicks = [];
    if (goalHistory.length > 0) {
        historyPicks.push({
            title: focusPhrase ? `Connect recent ${focusPhrase} goals to today's ${subjectLabel} work` : `Connect a recent goal to today's ${subjectLabel} work`,
            reason: `Builds on the student’s recent goal history: ${goalHistory.slice(0, 2).join(' • ')}`,
        });
    }
    if (taskHistory.length > 0) {
        historyPicks.push({
            title: `Finish a short follow-up on ${taskHistory[0]}`,
            reason: `Uses prior task history to strengthen progress and keep momentum going for ${studentName || 'the student'}.`,
        });
    }

    const suggestions = [...templates, ...historyPicks]
        .filter((item) => item && item.title)
        .slice(0, 4)
        .map((item) => ({
            title: String(item.title).trim(),
            instructions: String(item.reason || 'Suggested follow-up for the student.').trim(),
            reason: String(item.reason || 'Suggested based on current goal context.').trim(),
        }));

    if (suggestions.length >= 2) return suggestions;

    return [
        { title: 'Review one current goal and identify the next small step', instructions: 'Write a short plan for how the student will make progress this week.', reason: 'Used as a fallback because no prior goal data was available.' },
        { title: 'Check progress against the success criteria', instructions: 'List one success indicator and one action the student will take next.', reason: 'Supports accountability and measurable growth.' },
    ];
};

// ─── Cycles ────────────────────────────────────────────────────────────────────

export const getCycles = asyncHandler(async (req, res) => {
    const { academicYear } = req.query;
    const filter = { school: req.user.school };
    if (academicYear) filter.academicYear = academicYear;

    const cycles = await PlpCycle.find(filter).sort({ academicYear: 1, printOrder: 1, startDate: 1 });
    res.json({ success: true, data: cycles });
});

export const createCycle = asyncHandler(async (req, res) => {
    const { academicYear, cycleCode, title, startDate, endDate, requiredSections, printOrder, spotlightTraits, minEvidenceCount } = req.body;
    if (!academicYear || !cycleCode || !title || !startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'academicYear, cycleCode, title, startDate, and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        return res.status(400).json({ success: false, message: 'Invalid cycle date range' });
    }

    const cycle = await PlpCycle.create({
        school: req.user.school,
        academicYear,
        cycleCode: String(cycleCode).trim().toUpperCase(),
        title: String(title).trim(),
        startDate: start,
        endDate: end,
        spotlightTraits: Array.isArray(spotlightTraits) ? spotlightTraits : [],
        minEvidenceCount: Number.isFinite(Number(minEvidenceCount)) ? Number(minEvidenceCount) : 2,
        requiredSections: requiredSections || undefined,
        printOrder: Number(printOrder) || 0,
        createdBy: req.user._id,
    });

    res.status(201).json({ success: true, data: cycle });
});

export const updateCycle = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = { ...req.body, updatedBy: req.user._id };
    if (updates.spotlightTraits !== undefined) {
        updates.spotlightTraits = Array.isArray(updates.spotlightTraits) ? updates.spotlightTraits : [];
    }
    if (updates.minEvidenceCount !== undefined) {
        const parsedMinEvidence = Number(updates.minEvidenceCount);
        updates.minEvidenceCount = Number.isFinite(parsedMinEvidence) && parsedMinEvidence > 0 ? parsedMinEvidence : 2;
    }

    if (updates.startDate || updates.endDate) {
        const existing = await PlpCycle.findOne({ _id: id, school: req.user.school }).lean();
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Cycle not found' });
        }
        const start = new Date(updates.startDate || existing.startDate);
        const end = new Date(updates.endDate || existing.endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
            return res.status(400).json({ success: false, message: 'Invalid cycle date range' });
        }
    }

    const cycle = await PlpCycle.findOneAndUpdate(
        { _id: id, school: req.user.school },
        updates,
        { new: true, runValidators: true }
    );
    if (!cycle) {
        return res.status(404).json({ success: false, message: 'Cycle not found or already closed' });
    }

    res.json({ success: true, data: cycle });
});

export const publishCycle = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const cycle = await PlpCycle.findOneAndUpdate(
        { _id: id, school: req.user.school, status: 'draft' },
        { status: 'published', updatedBy: req.user._id },
        { new: true }
    );
    if (!cycle) {
        return res.status(404).json({ success: false, message: 'Cycle not found or not in draft status' });
    }
    res.json({ success: true, data: cycle });
});

export const closeCycle = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const cycle = await PlpCycle.findOneAndUpdate(
        { _id: id, school: req.user.school, status: 'published' },
        { status: 'closed', updatedBy: req.user._id },
        { new: true }
    );
    if (!cycle) {
        return res.status(404).json({ success: false, message: 'Cycle not found or not published' });
    }

    await PlpStudentRecord.updateMany(
        {
            school: req.user.school,
            cycle: cycle._id,
            status: { $in: ['in_progress', 'submitted'] },
        },
        { status: 'locked' }
    );

    res.json({ success: true, data: cycle });
});

export const deleteCycle = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const cycle = await PlpCycle.findOne({ _id: id, school: req.user.school });
    if (!cycle) {
        return res.status(404).json({ success: false, message: 'Cycle not found' });
    }
    if (cycle.status !== 'draft') {
        return res.status(400).json({ success: false, message: 'Only draft Rounds can be deleted' });
    }
    const hasRecords = await PlpStudentRecord.exists({ school: req.user.school, cycle: cycle._id });
    if (hasRecords) {
        return res.status(400).json({ success: false, message: 'This Round has student records and cannot be deleted' });
    }
    await cycle.deleteOne();
    await audit(req.user.school, req.user._id, 'cycle_deleted', 'PlpCycle', id, { cycleCode: cycle.cycleCode });
    res.json({ success: true, data: { _id: id } });
});

// ─── Goals ─────────────────────────────────────────────────────────────────────

export const getRecordGoals = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school }).select('_id school teacher class academicYear student status');
    if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
    }

    await assertRecordAccess(req.user, record);

    const goals = await PlpGoal.find({ school: req.user.school, plpRecord: id })
        .populate('linkedSubjectId', 'name code')
        .sort({ createdAt: -1 });

    res.json({ success: true, data: goals });
});

export const getGoalCopyDestinations = asyncHandler(async (req, res) => {
    const goal = await PlpGoal.findOne({ _id: req.params.goalId, school: req.user.school })
        .select('_id plpRecord')
        .lean();
    if (!goal) return res.status(404).json({ success: false, message: 'Goal not found' });

    const sourceRecord = await PlpStudentRecord.findOne({ _id: goal.plpRecord, school: req.user.school })
        .select('_id school teacher class academicYear cycle month status')
        .lean();
    if (!sourceRecord) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertTeacherRecordWriteAccess(req.user, sourceRecord);

    const samePeriod = sourceRecord.cycle
        ? { cycle: sourceRecord.cycle }
        : { cycle: null, month: sourceRecord.month };
    const students = await Student.find({
        school: req.user.school,
        status: 'active',
        _id: { $ne: sourceRecord.student },
        $or: [
            { currentClass: sourceRecord.class },
            { enrolledClasses: sourceRecord.class },
        ],
    })
        .select('_id firstName lastName studentId')
        .sort({ firstName: 1, lastName: 1 })
        .lean();
    const records = students.length
        ? await PlpStudentRecord.find({
            school: req.user.school,
            academicYear: sourceRecord.academicYear,
            teacher: sourceRecord.teacher,
            ...samePeriod,
            student: { $in: students.map((student) => student._id) },
        }).select('_id student status').lean()
        : [];
    const recordsByStudent = new Map(records.map((record) => [String(record.student), record]));

    res.json({
        success: true,
        data: students.map((student) => ({
            studentId: student._id,
            student,
            recordId: recordsByStudent.get(String(student._id))?._id || null,
            recordStatus: recordsByStudent.get(String(student._id))?.status || null,
        })),
    });
});

export const copyGoalToRecords = asyncHandler(async (req, res) => {
    const destinationStudentIds = normalizeDestinationRecordIds(req.body.destinationStudentIds);
    const copyOperationId = String(req.body.copyOperationId || '').trim();
    const copyDueDates = req.body.copyDueDates === true;

    if (!destinationStudentIds.length || destinationStudentIds.length > 100) {
        return res.status(400).json({ success: false, message: 'Choose between 1 and 100 destination students' });
    }
    if (!/^[A-Za-z0-9-]{8,100}$/.test(copyOperationId)) {
        return res.status(400).json({ success: false, message: 'A valid copy operation ID is required' });
    }
    if (!destinationStudentIds.every((id) => mongoose.isValidObjectId(id))) {
        return res.status(400).json({ success: false, message: 'One or more destination student IDs are invalid' });
    }

    const sourceGoal = await PlpGoal.findOne({ _id: req.params.goalId, school: req.user.school }).lean();
    if (!sourceGoal) return res.status(404).json({ success: false, message: 'Goal not found' });
    const sourceRecord = await PlpStudentRecord.findOne({ _id: sourceGoal.plpRecord, school: req.user.school })
        .select('_id school teacher class academicYear cycle month student status theme focusTrait')
        .lean();
    if (!sourceRecord) return res.status(404).json({ success: false, message: 'Source record not found' });
    await assertTeacherRecordWriteAccess(req.user, sourceRecord);

    const destinationStudents = await Student.find({
        school: req.user.school,
        status: 'active',
        _id: { $in: destinationStudentIds, $ne: sourceRecord.student },
        $or: [
            { currentClass: sourceRecord.class },
            { enrolledClasses: sourceRecord.class },
        ],
    }).select('_id firstName lastName studentId').lean();
    if (destinationStudents.length !== destinationStudentIds.length) {
        return res.status(400).json({ success: false, message: 'One or more destination students are not active in this class and academic year' });
    }

    if (sourceGoal.linkedSubjectId) {
        const subjectExists = await Subject.exists({
            _id: sourceGoal.linkedSubjectId,
            school: req.user.school,
            isActive: true,
        });
        if (!subjectExists) {
            return res.status(400).json({ success: false, message: 'The linked subject is no longer active in this school' });
        }
    }
    const [traitCount, standardCount] = await Promise.all([
        sourceGoal.linkedTraitCodes?.length
            ? PlpTraitConfig.countDocuments({
                school: req.user.school,
                code: { $in: sourceGoal.linkedTraitCodes },
                isActive: true,
            })
            : 0,
        sourceGoal.linkedStandardIds?.length
            ? Standard.countDocuments({
                school: req.user.school,
                _id: { $in: sourceGoal.linkedStandardIds },
            })
            : 0,
    ]);
    if (traitCount !== new Set(sourceGoal.linkedTraitCodes || []).size) {
        return res.status(400).json({ success: false, message: 'One or more linked traits are inactive or unavailable' });
    }
    if (standardCount !== new Set((sourceGoal.linkedStandardIds || []).map(String)).size) {
        return res.status(400).json({ success: false, message: 'One or more linked standards are unavailable in this school' });
    }

    const sourceTasks = await PlpTask.find({ school: req.user.school, plpGoal: sourceGoal._id })
        .sort({ createdAt: 1 })
        .lean();
    const outcomes = [];
    const samePeriod = sourceRecord.cycle
        ? { cycle: sourceRecord.cycle }
        : { cycle: null, month: sourceRecord.month };
    for (const destinationStudent of destinationStudents) {
        const result = await withTransaction(async (session) => {
            let destinationRecord = await PlpStudentRecord.findOne({
                school: req.user.school,
                academicYear: sourceRecord.academicYear,
                teacher: sourceRecord.teacher,
                ...samePeriod,
                student: destinationStudent._id,
            }).session(session).lean();

            if (!destinationRecord) {
                const [createdRecord] = await PlpStudentRecord.create([{
                    school: req.user.school,
                    academicYear: sourceRecord.academicYear,
                    cycle: sourceRecord.cycle || null,
                    month: sourceRecord.month,
                    theme: sourceRecord.theme || 'confidence',
                    focusTrait: sourceRecord.focusTrait || null,
                    teacher: sourceRecord.teacher,
                    class: sourceRecord.class,
                    student: destinationStudent._id,
                }], { session, ordered: true });
                destinationRecord = createdRecord.toObject();
            }
            await assertTeacherRecordWriteAccess(req.user, destinationRecord);
            if (!isCompatibleDestinationRecord(sourceRecord, destinationRecord)) {
                throw Object.assign(new Error('The destination student has a PLP record for a different class, year, or round'), { statusCode: 400 });
            }

            const existingGoal = await PlpGoal.findOne({
                school: req.user.school,
                plpRecord: destinationRecord._id,
                copyOperationId,
            }).session(session).select('_id').lean();
            if (existingGoal) {
                const existingTasks = await PlpTask.find({
                    school: req.user.school,
                    plpGoal: existingGoal._id,
                }).session(session).select('_id').lean();
                return {
                    goalId: existingGoal._id,
                    taskIds: existingTasks.map((task) => task._id),
                    alreadyCopied: true,
                };
            }

            const [copiedGoal] = await PlpGoal.create([
                buildCopiedGoal({
                    sourceGoal,
                    destinationRecordId: destinationRecord._id,
                    copyDueDates,
                    copyOperationId,
                    actorId: req.user._id,
                }),
            ], { session, ordered: true });
            const copiedTasks = sourceTasks.length
                ? await PlpTask.create(sourceTasks.map((task) => buildCopiedTask({
                    sourceTask: task,
                    destinationRecord,
                    goalId: copiedGoal._id,
                    actorId: req.user._id,
                    copyDueDates,
                })), { session, ordered: true })
                : [];
            const actorRole = req.user.role === 'admin' ? 'admin' : 'teacher';
            await PlpInteraction.create([{
                school: req.user.school,
                plpRecord: destinationRecord._id,
                plpGoal: copiedGoal._id,
                actorRole,
                actor: req.user._id,
                actionType: 'status_change',
                visibility: 'internal',
                payload: { to: 'active', copiedFromGoalId: sourceGoal._id },
            }], { session, ordered: true });
            await writePlpAudit({
                school: req.user.school,
                actor: req.user._id,
                action: 'goal_plan_copied',
                targetType: 'PlpGoal',
                targetId: copiedGoal._id,
                meta: {
                    sourceGoalId: sourceGoal._id,
                    sourceRecordId: sourceRecord._id,
                    destinationRecordId: destinationRecord._id,
                    destinationStudentId: destinationRecord.student,
                    copiedTaskIds: copiedTasks.map((task) => task._id),
                    copyDueDates,
                },
                session,
            });
            return {
                goalId: copiedGoal._id,
                taskIds: copiedTasks.map((task) => task._id),
                alreadyCopied: false,
                copiedTasks,
            };
        });

        const warnings = [];
        if (!result.alreadyCopied) {
            for (const task of result.copiedTasks) {
                const notificationResult = await queueTaskNotification({
                    schoolId: req.user.school,
                    task,
                    type: NOTIFICATION_TYPES.PLP_TASK_ASSIGNED,
                    subject: 'New PLP task assigned',
                    message: `A new task "${task.title}" has been assigned to you.`,
                    actorId: req.user._id,
                });
                if (notificationResult.status === 'failed') {
                    warnings.push({ taskId: task._id, message: notificationResult.reason });
                }
            }
        }
        outcomes.push({
            studentId: destinationStudent._id,
            goalId: result.goalId,
            taskIds: result.taskIds,
            alreadyCopied: result.alreadyCopied,
            notificationWarnings: warnings,
        });
    }

    res.status(201).json({ success: true, data: outcomes });
});

export const createGoal = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school }).select('_id school teacher class academicYear student status');
    if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
    }
    if (record.status === 'locked') {
        return res.status(400).json({ success: false, message: 'Record is locked' });
    }

    await assertTeacherRecordWriteAccess(req.user, record);

    const {
        goalType,
        title,
        description,
        linkedTraitCodes,
        linkedSubjectId,
        linkedStandardIds,
        baselineNote,
        successCriteria,
        targetDate,
        checkInDate,
        milestones,
        aiSuggested,
    } = req.body;

    if (!goalType || !title) {
        return res.status(400).json({ success: false, message: 'goalType and title are required' });
    }

    const goal = await PlpGoal.create({
        school: req.user.school,
        plpRecord: record._id,
        goalType,
        title: String(title).trim(),
        description: description || '',
        linkedTraitCodes: Array.isArray(linkedTraitCodes) ? linkedTraitCodes : [],
        linkedSubjectId: linkedSubjectId || null,
        linkedStandardIds: Array.isArray(linkedStandardIds) ? linkedStandardIds : [],
        baselineNote: baselineNote || '',
        successCriteria: successCriteria || '',
        targetDate: parseOptionalPlpDate(targetDate, 'Target date'),
        checkInDate: parseOptionalPlpDate(checkInDate, 'Check-in date'),
        milestones: normalizeGoalMilestones(milestones || []),
        aiSuggested: Boolean(aiSuggested),
        createdBy: req.user._id,
    });

    await PlpInteraction.create({
        school: req.user.school,
        plpRecord: record._id,
        plpGoal: goal._id,
        actorRole: 'teacher',
        actor: req.user._id,
        actionType: goal.aiSuggested ? 'ai_suggestion_applied' : 'status_change',
        visibility: 'internal',
        payload: {
            status: goal.status,
            goalType: goal.goalType,
            title: goal.title,
        },
    });

    const populated = await PlpGoal.findById(goal._id).populate('linkedSubjectId', 'name code');
    res.status(201).json({ success: true, data: populated });
});

export const updateGoal = asyncHandler(async (req, res) => {
    const { goalId } = req.params;
    const goal = await PlpGoal.findOne({ _id: goalId, school: req.user.school });
    if (!goal) {
        return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    const record = await PlpStudentRecord.findOne({ _id: goal.plpRecord, school: req.user.school }).select('_id school teacher class academicYear student status');
    if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
    }
    if (record.status === 'locked') {
        return res.status(400).json({ success: false, message: 'Record is locked' });
    }

    await assertTeacherRecordWriteAccess(req.user, record);

    const previousStatus = goal.status;
    const allowedUpdates = [
        'goalType', 'title', 'description', 'linkedTraitCodes', 'linkedSubjectId', 'linkedStandardIds',
        'baselineNote', 'successCriteria', 'teacherProgressNote', 'targetDate', 'checkInDate',
        'milestones', 'status', 'aiSuggested'
    ];

    for (const key of allowedUpdates) {
        if (typeof req.body[key] !== 'undefined') {
            goal[key] = req.body[key];
        }
    }
    if (typeof req.body.targetDate !== 'undefined') {
        goal.targetDate = parseOptionalPlpDate(req.body.targetDate, 'Target date');
    }
    if (typeof req.body.checkInDate !== 'undefined') {
        goal.checkInDate = parseOptionalPlpDate(req.body.checkInDate, 'Check-in date');
    }
    if (typeof req.body.milestones !== 'undefined') {
        goal.milestones = normalizeGoalMilestones(req.body.milestones);
    }
    goal.updatedBy = req.user._id;
    await goal.save();

    if (previousStatus !== goal.status) {
        await PlpInteraction.create({
            school: req.user.school,
            plpRecord: record._id,
            plpGoal: goal._id,
            actorRole: 'teacher',
            actor: req.user._id,
            actionType: 'status_change',
            visibility: 'internal',
            payload: { from: previousStatus, to: goal.status },
        });
    }

    const populated = await PlpGoal.findById(goal._id).populate('linkedSubjectId', 'name code');
    res.json({ success: true, data: populated });
});

const loadGoalWithRecord = async (req, goalId) => {
    if (!mongoose.isValidObjectId(goalId)) {
        throw Object.assign(new Error('Goal not found'), { statusCode: 404 });
    }
    const goal = await PlpGoal.findOne({ _id: goalId, school: req.user.school });
    if (!goal) {
        throw Object.assign(new Error('Goal not found'), { statusCode: 404 });
    }
    const record = await PlpStudentRecord.findOne({ _id: goal.plpRecord, school: req.user.school })
        .select('_id school teacher class academicYear student status');
    if (!record) {
        throw Object.assign(new Error('Record not found'), { statusCode: 404 });
    }
    await assertTeacherRecordWriteAccess(req.user, record);
    return { goal, record };
};

export const getPlpGoalPracticeCandidates = asyncHandler(async (req, res) => {
    const { goal, record } = await loadGoalWithRecord(req, req.params.goalId);
    const candidates = await collectPracticeCandidates({
        schoolId: req.user.school,
        studentId: record.student,
    });
    res.json({
        success: true,
        data: {
            goalId: String(goal._id),
            linked: goal.linkedPractice || [],
            candidates,
        },
    });
});

export const suggestPlpGoalPracticeLinks = asyncHandler(async (req, res) => {
    const { goal, record } = await loadGoalWithRecord(req, req.params.goalId);
    const candidates = await collectPracticeCandidates({
        schoolId: req.user.school,
        studentId: record.student,
    });
    const suggestion = await plpAiService.suggestPracticeLinks(goal, candidates);
    await audit(req.user.school, req.user._id, 'plp_goal_practice_links_suggested', 'PlpGoal', goal._id, {
        candidates: candidates.length,
        suggestions: suggestion.suggestions.length,
        unavailable: suggestion.unavailable,
    });
    res.json({ success: true, data: suggestion });
});

export const updatePlpGoalPracticeLinks = asyncHandler(async (req, res) => {
    const { goal, record } = await loadGoalWithRecord(req, req.params.goalId);
    if (record.status === 'locked') {
        return res.status(400).json({ success: false, message: 'Record is locked' });
    }
    if (!Array.isArray(req.body.links)) {
        return res.status(400).json({ success: false, message: 'links must be an array' });
    }

    const links = await resolvePracticeLinks({
        schoolId: req.user.school,
        studentId: record.student,
        submitted: req.body.links,
        actorId: req.user._id,
    });
    goal.linkedPractice = links;
    goal.updatedBy = req.user._id;
    await goal.save();

    await audit(req.user.school, req.user._id, 'plp_goal_practice_links_updated', 'PlpGoal', goal._id, {
        count: links.length,
        kinds: [...new Set(links.map((link) => link.kind))],
        aiSuggested: links.filter((link) => link.source === 'ai_suggested').length,
    });
    res.json({ success: true, data: links });
});

export const reviewGoalByTeacher = asyncHandler(async (req, res) => {
    const { outcome, reviewNote } = req.body;
    if (!['continue', 'revise', 'complete'].includes(outcome)) {
        return res.status(400).json({ success: false, message: 'Choose continue, revise, or complete' });
    }
    if (String(reviewNote || '').length > 2000) {
        return res.status(400).json({ success: false, message: 'Review note cannot exceed 2000 characters' });
    }
    const goal = await PlpGoal.findOne({ _id: req.params.goalId, school: req.user.school });
    if (!goal) return res.status(404).json({ success: false, message: 'Goal not found' });

    const record = await PlpStudentRecord.findOne({ _id: goal.plpRecord, school: req.user.school })
        .select('_id school teacher class academicYear student status');
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    if (record.status !== 'in_progress') {
        return res.status(400).json({ success: false, message: 'Only in-progress records can be reviewed' });
    }
    await assertTeacherRecordWriteAccess(req.user, record);

    const previousStatus = goal.status;
    goal.status = outcome === 'complete' ? 'completed' : 'active';
    goal.reviewOutcome = outcome;
    goal.reviewNote = String(reviewNote || '').trim();
    goal.lastReviewedAt = new Date();
    if (typeof req.body.checkInDate !== 'undefined') {
        goal.checkInDate = parseOptionalPlpDate(req.body.checkInDate, 'Check-in date');
    }
    goal.updatedBy = req.user._id;
    await goal.save();
    await PlpInteraction.create({
        school: req.user.school,
        plpRecord: record._id,
        plpGoal: goal._id,
        actorRole: req.user.role === 'admin' ? 'admin' : 'teacher',
        actor: req.user._id,
        actionType: 'status_change',
        visibility: 'student_visible',
        payload: { from: previousStatus, to: goal.status, reviewOutcome: outcome },
    });
    await audit(req.user.school, req.user._id, 'goal_reviewed', 'PlpGoal', goal._id, {
        plpRecordId: record._id,
        outcome,
    });
    const populated = await PlpGoal.findById(goal._id).populate('linkedSubjectId', 'name code');
    res.json({ success: true, data: populated });
});

export const getPlpEmailConsent = asyncHandler(async (req, res) => {
    const { student } = await resolveAuthenticatedPlpEmailContact(req, req.query.studentId);
    const recipientEmail = String(req.user.email).trim().toLowerCase();
    const consent = await PlpEmailConsent.findOne({
        school: req.user.school,
        student: student._id,
        recipientEmail,
    }).select('optedIn optedInAt revokedAt recipientType').lean();
    res.json({
        success: true,
        data: {
            studentId: student._id,
            recipientEmail,
            optedIn: Boolean(consent?.optedIn),
            optedInAt: consent?.optedInAt || null,
            recipientType: consent?.recipientType || null,
        },
    });
});

export const updatePlpEmailConsent = asyncHandler(async (req, res) => {
    if (typeof req.body.optedIn !== 'boolean') {
        return res.status(400).json({ success: false, message: 'optedIn must be true or false' });
    }
    const { student, email, recipientType } = await resolveAuthenticatedPlpEmailContact(req, req.body.studentId);
    const consent = await PlpEmailConsent.findOneAndUpdate(
        { school: req.user.school, student: student._id, recipientEmail: email },
        {
            $set: {
                recipientType,
                user: req.user._id,
                optedIn: req.body.optedIn,
                optedInAt: req.body.optedIn ? new Date() : null,
                revokedAt: req.body.optedIn ? null : new Date(),
            },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).select('optedIn optedInAt recipientType').lean();
    await audit(req.user.school, req.user._id, 'plp_email_consent_updated', 'Student', student._id, {
        optedIn: consent.optedIn,
        recipientType,
    });
    res.json({ success: true, data: consent });
});

export const getPlpProgressEmailPreview = asyncHandler(async (req, res) => {
    const language = normalizePlpEmailLanguage(req.query.language);
    const context = await loadProgressEmailContext(req, req.params.recordId, { language });
    res.json({
        success: true,
        data: {
            language,
            subject: context.email.subject,
            text: context.email.text,
            html: context.email.html,
            recipients: context.recipients,
            message: context.recipients.length
                ? ''
                : 'No student or family email contacts are available. Contacts who explicitly opted out are excluded.',
        },
    });
});

export const getPlpEmailDeliveries = asyncHandler(async (req, res) => {
    const { recordId } = req.params;
    if (!mongoose.isValidObjectId(recordId)) {
        return res.status(404).json({ success: false, message: 'PLP record not found' });
    }
    const record = await PlpStudentRecord.findOne({ _id: recordId, school: req.user.school })
        .select('_id school teacher class academicYear student')
        .lean();
    if (!record) {
        return res.status(404).json({ success: false, message: 'PLP record not found' });
    }
    await assertTeacherRecordWriteAccess(req.user, record);
    const deliveries = await PlpEmailDelivery.find({ school: req.user.school, plpRecord: recordId })
        .select('recipientEmail recipientType language attempt status error startedAt deliveredAt sentBy')
        .populate('sentBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
    res.json({
        success: true,
        data: deliveries.map((delivery) => ({
            id: String(delivery._id),
            recipientEmail: delivery.recipientEmail,
            recipientType: delivery.recipientType,
            language: delivery.language || 'en',
            attempt: delivery.attempt,
            status: delivery.status,
            error: delivery.error || '',
            sentAt: delivery.startedAt || delivery.createdAt,
            deliveredAt: delivery.deliveredAt || null,
            sentByName: `${delivery.sentBy?.firstName || ''} ${delivery.sentBy?.lastName || ''}`.trim() || null,
        })),
    });
});

export const getPlpGoalReviewQueue = asyncHandler(async (req, res) => {
    const filter = await buildTeacherReviewQueueRecordFilter(req);
    const records = await PlpStudentRecord.find(filter)
        .select('_id student class academicYear cycle')
        .populate('student', 'firstName lastName studentId')
        .populate('class', 'name grade section')
        .populate('cycle', 'title')
        .limit(5000)
        .lean();
    if (!records.length) return res.json({ success: true, data: [] });

    const now = new Date();
    const dueConditions = [
        {
            checkInDate: { $lte: now },
            $or: [
                { lastReviewedAt: null },
                { $expr: { $lt: ['$lastReviewedAt', '$checkInDate'] } },
            ],
        },
        {
            checkInDate: null,
            targetDate: { $lte: now },
            $or: [
                { lastReviewedAt: null },
                { $expr: { $lt: ['$lastReviewedAt', '$targetDate'] } },
            ],
        },
    ];
    const goals = await PlpGoal.find({
        school: req.user.school,
        plpRecord: { $in: records.map((record) => record._id) },
        status: 'active',
        $or: dueConditions,
    })
        .select('_id plpRecord title goalType checkInDate targetDate lastReviewedAt')
        .sort({ checkInDate: 1, targetDate: 1, createdAt: 1 })
        .limit(100)
        .lean();
    const recordsById = new Map(records.map((record) => [String(record._id), record]));
    res.json({
        success: true,
        data: goals.map((goal) => {
            const record = recordsById.get(String(goal.plpRecord));
            return {
                goalId: goal._id,
                title: goal.title,
                goalType: goal.goalType,
                checkInDate: goal.checkInDate || null,
                targetDate: goal.targetDate || null,
                lastReviewedAt: goal.lastReviewedAt || null,
                recordId: record._id,
                student: record.student,
                class: record.class,
                cycle: record.cycle,
            };
        }),
    });
});

export const getPlpTaskReviewQueue = asyncHandler(async (req, res) => {
    const filter = await buildTeacherReviewQueueRecordFilter(req, ['in_progress', 'submitted']);
    const records = await PlpStudentRecord.find(filter)
        .select('_id student class cycle')
        .populate('student', 'firstName lastName studentId')
        .populate('class', 'name grade section')
        .populate('cycle', 'title')
        .limit(5000)
        .lean();
    if (!records.length) return res.json({ success: true, data: [] });
    const tasks = await PlpTask.find({
        school: req.user.school,
        plpRecord: { $in: records.map((record) => record._id) },
        status: 'submitted_by_student',
    })
        .select('_id plpRecord plpGoal title studentCompletionNote studentComment updatedAt')
        .populate('plpGoal', 'title goalType')
        .sort({ updatedAt: 1 })
        .limit(100)
        .lean();
    const recordsById = new Map(records.map((record) => [String(record._id), record]));
    res.json({
        success: true,
        data: tasks.map((task) => {
            const record = recordsById.get(String(task.plpRecord));
            return {
                taskId: task._id,
                goalId: task.plpGoal?._id,
                goalTitle: task.plpGoal?.title || '',
                goalType: task.plpGoal?.goalType || '',
                title: task.title,
                studentCompletionNote: task.studentCompletionNote || '',
                studentComment: task.studentComment || '',
                submittedAt: task.updatedAt,
                recordId: record._id,
                student: record.student,
                class: record.class,
                cycle: record.cycle,
            };
        }),
    });
});

export const sendPlpProgressEmail = asyncHandler(async (req, res) => {
    const requestedEmails = req.body.recipientEmails;
    if (!Array.isArray(requestedEmails) || requestedEmails.length < 1 || requestedEmails.length > 10) {
        return res.status(400).json({ success: false, message: 'Select between 1 and 10 student or family contacts' });
    }
    if (typeof req.body.resend !== 'undefined' && typeof req.body.resend !== 'boolean') {
        return res.status(400).json({ success: false, message: 'resend must be true or false' });
    }
    if (typeof req.body.language !== 'undefined'
        && !PLP_EMAIL_LANGUAGES.includes(String(req.body.language).trim().toLowerCase())) {
        return res.status(400).json({ success: false, message: 'language must be en, ar or both' });
    }

    const language = normalizePlpEmailLanguage(req.body.language);
    const context = await loadProgressEmailContext(req, req.params.recordId, { language });
    const recipientsByEmail = new Map(context.recipients.map((recipient) => [recipient.email, recipient]));
    const emails = [...new Set(requestedEmails.map((email) => String(email || '').trim().toLowerCase()))];
    if (emails.length !== requestedEmails.length || emails.some((email) => !recipientsByEmail.has(email))) {
        return res.status(400).json({ success: false, message: 'Every selected address must be a current student or family contact who has not opted out' });
    }

    const results = [];
    for (const recipientEmail of emails) {
        const recipient = recipientsByEmail.get(recipientEmail);
        const previous = await PlpEmailDelivery.findOne({
            school: req.user.school,
            plpRecord: context.record._id,
            recipientEmail,
        }).sort({ attempt: -1 }).lean();
        const decision = getPlpEmailDeliveryAttempt(previous, { resend: req.body.resend === true });
        if (decision.blocked) {
            const message = decision.reason === 'duplicate_blocked'
                ? 'This update was already sent. Confirm resend to send another copy.'
                : 'A send attempt is already in progress.';
            results.push({ email: recipientEmail, status: decision.reason, message });
            continue;
        }
        const attempt = decision.attempt;
        if (previous?.status === 'sending') {
            await PlpEmailDelivery.updateOne({ _id: previous._id, status: 'sending' }, {
                $set: { status: 'failed', error: 'Previous send attempt timed out.' },
            });
        }

        let delivery;
        try {
            delivery = await PlpEmailDelivery.create({
                school: req.user.school,
                plpRecord: context.record._id,
                student: context.student._id,
                recipientEmail,
                recipientType: recipient.type,
                language,
                sentBy: req.user._id,
                attempt,
                status: 'sending',
            });
        } catch (error) {
            if (error.code === 11000) {
                results.push({ email: recipientEmail, status: 'sending', message: 'A send attempt is already in progress.' });
                continue;
            }
            throw error;
        }

        let transport;
        try {
            transport = await sendTransactionalEmail({
                to: recipientEmail,
                subject: context.email.subject,
                text: context.email.text,
                html: context.email.html,
                schoolId: req.user.school,
                preferredUserId: req.user._id,
            });
        } catch (error) {
            const reason = describeEmailDeliveryError(error);
            await PlpEmailDelivery.updateOne({ _id: delivery._id }, {
                $set: { status: 'failed', error: reason },
            });
            logger.error('PLP progress email delivery failed', {
                recordId: String(context.record._id),
                error: reason,
            });
            results.push({ email: recipientEmail, status: 'failed', message: 'Email delivery failed. Review the sender configuration and retry.' });
            continue;
        }
        await PlpEmailDelivery.updateOne({ _id: delivery._id }, {
            $set: {
                status: 'sent',
                messageId: transport.messageId || '',
                deliveredAt: new Date(),
                error: '',
            },
        });
        await audit(req.user.school, req.user._id, 'plp_progress_email_sent', 'PlpStudentRecord', context.record._id, {
            recipientType: recipient.type,
            language,
            attempt,
        });
        results.push({ email: recipientEmail, status: 'sent' });
    }
    const allSent = results.every((result) => result.status === 'sent');
    res.status(allSent ? 200 : 207).json({ success: allSent, data: results });
});

export const deleteGoal = asyncHandler(async (req, res) => {
    const { goalId } = req.params;
    const goal = await PlpGoal.findOne({ _id: goalId, school: req.user.school });
    if (!goal) {
        return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    const record = await PlpStudentRecord.findOne({ _id: goal.plpRecord, school: req.user.school }).select('_id school teacher class academicYear student status');
    if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
    }
    if (record.status !== 'in_progress') {
        return res.status(400).json({ success: false, message: 'Goals can only be deleted while the record is in progress' });
    }
    await assertTeacherRecordWriteAccess(req.user, record);

    const hasTasks = await PlpTask.exists({ school: req.user.school, plpGoal: goal._id });
    if (hasTasks) {
        return res.status(400).json({ success: false, message: 'This goal has tasks assigned to it and cannot be deleted' });
    }

    await PlpInteraction.deleteMany({ school: req.user.school, plpGoal: goal._id });
    await goal.deleteOne();
    await audit(req.user.school, req.user._id, 'goal_deleted', 'PlpGoal', goalId, { plpRecordId: record._id });
    res.json({ success: true, data: { _id: goalId } });
});

// ─── Tasks ─────────────────────────────────────────────────────────────────────

export const getGoalTasks = asyncHandler(async (req, res) => {
    const { goalId } = req.params;
    const goal = await PlpGoal.findOne({ _id: goalId, school: req.user.school }).select('_id plpRecord');
    if (!goal) {
        return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    const record = await PlpStudentRecord.findOne({ _id: goal.plpRecord, school: req.user.school }).select('_id school teacher class academicYear student');
    if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
    }
    await assertRecordAccess(req.user, record);

    const tasks = await PlpTask.find({ school: req.user.school, plpGoal: goalId })
        .populate('student', 'firstName lastName studentId')
        .populate('assignedByTeacher', 'firstName lastName')
        .sort({ createdAt: -1 });

    res.json({ success: true, data: tasks });
});

const getActivityRecord = async (activityId, schoolId) => {
    const activity = await PlpActivity.findOne({ _id: activityId, school: schoolId })
        .populate('traitId', 'name code themeCode')
        .populate('goal', 'title goalType status')
        .populate('createdBy', 'firstName lastName')
        .populate('task', 'title status')
        .lean();
    if (!activity) return null;
    const record = await PlpStudentRecord.findOne({ _id: activity.plpRecord, school: schoolId })
        .select('_id school teacher class academicYear student status')
        .lean();
    return { activity, record };
};

export const getRecordActivities = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school })
        .select('_id school teacher class academicYear student status recommendedActivities');
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertRecordAccess(req.user, record);

    const activities = await PlpActivity.find({ school: req.user.school, plpRecord: id })
        .populate('traitId', 'name code themeCode')
        .populate('goal', 'title goalType status')
        .populate('createdBy', 'firstName lastName')
        .populate('task', 'title status')
        .sort({ source: 1, createdAt: -1 })
        .lean();

    const positiveEvidence = await PlpEvidence.find({
        school: req.user.school,
        plpRecord: id,
        type: { $in: ['observation', 'positive_example', 'reflection'] },
        traitId: { $ne: null },
    }).populate('traitId', 'name code themeCode').sort({ createdAt: -1 }).lean();
    const evidenceByTrait = positiveEvidence.reduce((groups, item) => {
        const key = String(item.traitId?._id || '');
        if (!key) return groups;
        if (!groups[key]) groups[key] = { trait: item.traitId, evidence: [] };
        groups[key].evidence.push(item);
        return groups;
    }, {});
    const existingSuggestionTitles = new Set(activities.filter((item) => item.source === 'suggested_from_observations').map((item) => item.title));
    const observationSuggestions = Object.values(evidenceByTrait).map(({ trait, evidence }) => ({
        source: 'suggested_from_observations',
        title: `Practice ${trait.name} through a focused classroom action`,
        instructions: `Choose one small action that demonstrates ${trait.name}, then reflect on what happened.`,
        traitId: trait,
        rationale: `Suggested from ${evidence.length} observation${evidence.length === 1 ? '' : 's'} linked to ${trait.name}: ${String(evidence[0].note || '').slice(0, 180)}`,
        status: 'suggested',
        isVirtual: true,
    })).filter((item) => !existingSuggestionTitles.has(item.title));
    const legacySuggestions = (record.recommendedActivities || [])
        .filter((title) => !existingSuggestionTitles.has(title))
        .map((title) => ({ source: 'suggested_from_observations', title, instructions: '', traitId: null, rationale: 'Legacy recommendation retained for compatibility.', status: 'suggested', isVirtual: true }));

    res.json({ success: true, data: [...activities, ...observationSuggestions, ...legacySuggestions] });
});

export const createActivity = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    if (record.status === 'locked') return res.status(400).json({ success: false, message: 'Record is locked' });
    await assertTeacherRecordWriteAccess(req.user, record);
    const { title, instructions, traitId, goal, dueDate } = req.body;
    if (!String(title || '').trim()) return res.status(400).json({ success: false, message: 'Activity title is required' });
    if (traitId) {
        const trait = await PlpTraitConfig.findOne({ _id: traitId, school: req.user.school, isActive: true }).select('_id').lean();
        if (!trait) return res.status(400).json({ success: false, message: 'Selected trait is invalid' });
    }
    if (goal) {
        const validGoal = await PlpGoal.exists({ _id: goal, school: req.user.school, plpRecord: id });
        if (!validGoal) return res.status(400).json({ success: false, message: 'Selected goal does not belong to this record' });
    }
    const activity = await PlpActivity.create({ school: req.user.school, plpRecord: id, source: 'added_by_teacher', title: String(title).trim(), instructions: instructions || '', traitId: traitId || null, goal: goal || null, dueDate: dueDate || null, createdBy: req.user._id });
    res.status(201).json({ success: true, data: activity });
});

export const updateActivity = asyncHandler(async (req, res) => {
    const result = await getActivityRecord(req.params.activityId, req.user.school);
    if (!result) return res.status(404).json({ success: false, message: 'Activity not found' });
    const { activity, record } = result;
    if (record.status === 'locked') return res.status(400).json({ success: false, message: 'Record is locked' });
    await assertTeacherRecordWriteAccess(req.user, record);
    if (activity.source !== 'added_by_teacher') return res.status(400).json({ success: false, message: 'Suggested activities cannot be edited' });
    const allowed = ['title', 'instructions', 'traitId', 'goal', 'dueDate', 'task', 'taskStatus'];
    const updates = Object.fromEntries(allowed.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
    if (updates.traitId) {
        const trait = await PlpTraitConfig.findOne({ _id: updates.traitId, school: req.user.school, isActive: true }).select('_id').lean();
        if (!trait) return res.status(400).json({ success: false, message: 'Selected trait is invalid' });
    }
    if (updates.goal) {
        const validGoal = await PlpGoal.exists({ _id: updates.goal, school: req.user.school, plpRecord: record._id });
        if (!validGoal) return res.status(400).json({ success: false, message: 'Selected goal does not belong to this record' });
    }
    Object.assign(activity, updates, { updatedBy: req.user._id });
    await PlpActivity.findByIdAndUpdate(activity._id, updates, { runValidators: true });
    const populated = await getActivityRecord(activity._id, req.user.school);
    res.json({ success: true, data: populated.activity });
});

export const deleteActivity = asyncHandler(async (req, res) => {
    const result = await getActivityRecord(req.params.activityId, req.user.school);
    if (!result) return res.status(404).json({ success: false, message: 'Activity not found' });
    if (result.record.status === 'locked') return res.status(400).json({ success: false, message: 'Record is locked' });
    await assertTeacherRecordWriteAccess(req.user, result.record);
    if (result.activity.source !== 'added_by_teacher') return res.status(400).json({ success: false, message: 'Suggested activities cannot be deleted' });
    await PlpActivity.deleteOne({ _id: req.params.activityId, school: req.user.school });
    res.json({ success: true, data: { _id: req.params.activityId } });
});

export const createTask = asyncHandler(async (req, res) => {
    const { goalId } = req.params;
    const goal = await PlpGoal.findOne({ _id: goalId, school: req.user.school });
    if (!goal) {
        return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    const record = await PlpStudentRecord.findOne({ _id: goal.plpRecord, school: req.user.school }).select('_id school teacher class academicYear student status');
    if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
    }
    if (record.status === 'locked') {
        return res.status(400).json({ success: false, message: 'Record is locked' });
    }
    await assertTeacherRecordWriteAccess(req.user, record);

    const { title, instructions, dueDate, completionEvidenceLinks, aiDraft } = req.body;
    if (!title && aiDraft !== true) {
        return res.status(400).json({ success: false, message: 'Task title is required' });
    }

    if (aiDraft === true) {
        const studentNameDoc = await Student.findById(record.student).select('firstName lastName').lean();
        const studentRecordIds = await PlpStudentRecord.find({
            school: req.user.school,
            student: record.student,
            _id: { $ne: record._id },
        }).select('_id').lean();

        const priorGoals = await PlpGoal.find({
            school: req.user.school,
            plpRecord: { $in: studentRecordIds.map((item) => item._id) },
            goalType: goal.goalType,
            status: { $in: ['active', 'completed', 'carried_forward'] },
        }).sort({ createdAt: -1 }).limit(5).lean();
        const priorTasks = await PlpTask.find({
            school: req.user.school,
            student: record.student,
            status: { $in: ['completed', 'reviewed', 'needs_revision', 'submitted_by_student'] },
        }).sort({ createdAt: -1 }).limit(5).lean();

        const suggestions = buildTaskDraftSuggestions({
            goalType: goal.goalType,
            linkedSubjectId: goal.linkedSubjectId ? String(goal.linkedSubjectId) : null,
            studentName: studentNameDoc ? `${studentNameDoc.firstName || ''} ${studentNameDoc.lastName || ''}`.trim() : 'the student',
            priorGoals,
            priorTasks,
        });

        return res.json({ success: true, data: { suggestions } });
    }

    const task = await PlpTask.create({
        school: req.user.school,
        plpGoal: goal._id,
        plpRecord: record._id,
        student: record.student,
        assignedByTeacher: req.user._id,
        title: String(title).trim(),
        instructions: instructions || '',
        dueDate: dueDate || null,
        completionEvidenceLinks: Array.isArray(completionEvidenceLinks) ? completionEvidenceLinks : [],
        notificationStatus: 'pending',
        createdBy: req.user._id,
    });

    await PlpInteraction.create({
        school: req.user.school,
        plpRecord: record._id,
        plpGoal: goal._id,
        plpTask: task._id,
        actorRole: 'teacher',
        actor: req.user._id,
        actionType: 'status_change',
        visibility: 'student_visible',
        payload: { from: null, to: task.status, title: task.title },
    });

    const notification = await queueTaskNotification({
        schoolId: req.user.school,
        task,
        type: NOTIFICATION_TYPES.PLP_TASK_ASSIGNED,
        subject: 'New PLP task assigned',
        message: `A new task "${task.title}" has been assigned to you.`,
        actorId: req.user._id,
    });

    const populated = await PlpTask.findById(task._id)
        .populate('student', 'firstName lastName studentId')
        .populate('assignedByTeacher', 'firstName lastName');

    res.status(201).json({
        success: true,
        data: populated,
        notificationWarning: notification.status === 'failed' ? notification.reason : null,
    });
});

export const updateTask = asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const task = await PlpTask.findOne({ _id: taskId, school: req.user.school });
    if (!task) {
        return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const record = await PlpStudentRecord.findOne({ _id: task.plpRecord, school: req.user.school }).select('_id school teacher class academicYear student status');
    if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
    }
    if (record.status === 'locked') {
        return res.status(400).json({ success: false, message: 'Record is locked' });
    }
    await assertTeacherRecordWriteAccess(req.user, record);

    const previousStatus = task.status;
    const allowedUpdates = [
        'title', 'instructions', 'dueDate', 'status', 'teacherFeedback',
        'teacherFollowUpAction', 'completionEvidenceLinks'
    ];
    for (const key of allowedUpdates) {
        if (typeof req.body[key] !== 'undefined') {
            task[key] = req.body[key];
        }
    }
    task.updatedBy = req.user._id;
    if (task.status === 'completed' && !task.completedAt) {
        task.completedAt = new Date();
    }
    await task.save();

    if (previousStatus !== task.status) {
        await PlpInteraction.create({
            school: req.user.school,
            plpRecord: task.plpRecord,
            plpGoal: task.plpGoal,
            plpTask: task._id,
            actorRole: 'teacher',
            actor: req.user._id,
            actionType: 'status_change',
            visibility: 'student_visible',
            payload: { from: previousStatus, to: task.status },
        });
    }

    if (req.body.teacherFeedback) {
        await PlpInteraction.create({
            school: req.user.school,
            plpRecord: task.plpRecord,
            plpGoal: task.plpGoal,
            plpTask: task._id,
            actorRole: 'teacher',
            actor: req.user._id,
            actionType: 'feedback',
            visibility: 'student_visible',
            payload: { feedback: String(req.body.teacherFeedback) },
        });
    }

    const populated = await PlpTask.findById(task._id)
        .populate('student', 'firstName lastName studentId')
        .populate('assignedByTeacher', 'firstName lastName');

    res.json({ success: true, data: populated });
});

export const retryTaskNotification = asyncHandler(async (req, res) => {
    const task = await PlpTask.findOne({ _id: req.params.taskId, school: req.user.school });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    if (task.notificationStatus !== 'failed') {
        return res.status(409).json({ success: false, message: 'Only failed task notifications can be retried' });
    }

    const record = await PlpStudentRecord.findOne({ _id: task.plpRecord, school: req.user.school })
        .select('_id school teacher class academicYear student status');
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertTeacherRecordWriteAccess(req.user, record);

    const isAssignment = task.status === 'assigned';
    const result = await queueTaskNotification({
        schoolId: req.user.school,
        task,
        type: isAssignment ? NOTIFICATION_TYPES.PLP_TASK_ASSIGNED : NOTIFICATION_TYPES.PLP_TASK_REVIEWED,
        subject: isAssignment ? 'New PLP task assigned' : 'Your PLP task was reviewed',
        message: isAssignment
            ? `A new task "${task.title}" has been assigned to you.`
            : `Your task "${task.title}" was marked as ${task.status.replace('_', ' ')}.`,
        actorId: req.user._id,
        eventKey: task.notificationEventKey,
    });
    if (result.status === 'failed') {
        return res.status(502).json({ success: false, message: result.reason });
    }
    res.json({ success: true, data: { taskId: task._id, notificationStatus: result.status } });
});

export const deleteTask = asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const task = await PlpTask.findOne({ _id: taskId, school: req.user.school });
    if (!task) {
        return res.status(404).json({ success: false, message: 'Task not found' });
    }
    if (task.status !== 'assigned') {
        return res.status(400).json({ success: false, message: 'Only tasks that have not been started by the student can be deleted' });
    }

    const record = await PlpStudentRecord.findOne({ _id: task.plpRecord, school: req.user.school }).select('_id school teacher class academicYear student status');
    if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
    }
    if (record.status === 'locked') {
        return res.status(400).json({ success: false, message: 'Record is locked' });
    }
    await assertTeacherRecordWriteAccess(req.user, record);

    await PlpInteraction.deleteMany({ school: req.user.school, plpTask: task._id });
    await task.deleteOne();
    await audit(req.user.school, req.user._id, 'task_deleted', 'PlpTask', taskId, { plpRecordId: record._id });
    res.json({ success: true, data: { _id: taskId } });
});

const buildMyStudentRecordData = async ({ schoolId, studentProfile, record }) => {
    const [evidence, goals, tasks] = await Promise.all([
        PlpEvidence.find({
            school: schoolId,
            plpRecord: record._id,
            type: { $in: ['observation', 'positive_example', 'reflection'] },
            reviewStatus: { $in: ['confirmed', null] },
        }).populate('traitId', 'name code themeCode').sort({ createdAt: -1 }).lean(),
        PlpGoal.find({ school: schoolId, plpRecord: record._id }).sort({ createdAt: -1 }).lean(),
        PlpTask.find({ school: schoolId, student: studentProfile._id, plpRecord: record._id })
            .populate('assignedByTeacher', 'firstName lastName')
            .sort({ dueDate: 1, createdAt: -1 })
            .lean(),
    ]);
    return {
        record,
        evidence,
        goals: goals.map(toStudentVisibleGoal),
        tasks: tasks.map(toStudentVisibleTask),
    };
};

export const getMyStudentRecord = asyncHandler(async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can access this route' });
    }

    const studentProfile = await getStudentProfileFromUser(req.user);
    if (!studentProfile) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const record = await PlpStudentRecord.findOne({ school: req.user.school, student: studentProfile._id })
        .populate('teacher', 'firstName lastName')
        .populate('focusTrait', 'name code themeCode')
        .populate('cycle', 'title cycleCode startDate endDate status')
        .populate('class', 'name grade')
        .sort({ createdAt: -1 })
        .lean();

    if (!record) {
        return res.json({ success: true, data: null });
    }

    const data = await buildMyStudentRecordData({ schoolId: req.user.school, studentProfile, record });
    res.json({ success: true, data });
});

export const getMyStudentRecordHistory = asyncHandler(async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can access this route' });
    }
    const studentProfile = await getStudentProfileFromUser(req.user);
    if (!studentProfile) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const { page, limit, skip } = getPlpPagination(req.query);
    const visibleCycleIds = await PlpCycle.find({
        school: req.user.school,
        status: { $in: ['published', 'closed'] },
    }).distinct('_id');
    const filter = {
        school: req.user.school,
        student: studentProfile._id,
        $or: [
            { cycle: null },
            { cycle: { $in: visibleCycleIds } },
        ],
    };
    const [pageRecords, total] = await Promise.all([
        PlpStudentRecord.find(filter)
            .populate('cycle', 'title cycleCode status')
            .sort({ academicYear: -1, updatedAt: -1, _id: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        PlpStudentRecord.countDocuments(filter),
    ]);

    res.json({
        success: true,
        data: pageRecords.map(toPlpHistoryItem),
        pagination: buildPlpPaginationMetadata({ page, limit, total }),
    });
});

export const getMyStudentRecordById = asyncHandler(async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can access this route' });
    }
    if (!mongoose.isValidObjectId(req.params.recordId)) {
        return res.status(404).json({ success: false, message: 'PLP record not found' });
    }
    const studentProfile = await getStudentProfileFromUser(req.user);
    if (!studentProfile) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const record = await PlpStudentRecord.findOne({
        _id: req.params.recordId,
        school: req.user.school,
        student: studentProfile._id,
    })
        .populate('teacher', 'firstName lastName')
        .populate('focusTrait', 'name code themeCode')
        .populate('cycle', 'title cycleCode startDate endDate status')
        .populate('class', 'name grade')
        .lean();
    if (!record || (record.cycle && !['published', 'closed'].includes(record.cycle.status))) {
        return res.status(404).json({ success: false, message: 'PLP record not found' });
    }
    const data = await buildMyStudentRecordData({ schoolId: req.user.school, studentProfile, record });
    res.json({ success: true, data });
});

export const getMyStudentTasks = asyncHandler(async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can access this route' });
    }

    const studentProfile = await getStudentProfileFromUser(req.user);
    if (!studentProfile) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const tasks = await PlpTask.find({ school: req.user.school, student: studentProfile._id })
        .populate('plpGoal', 'title goalType status targetDate checkInDate')
        .populate('assignedByTeacher', 'firstName lastName')
        .sort({ dueDate: 1, createdAt: -1 })
        .lean();

    res.json({ success: true, data: tasks.map(toStudentVisibleTask) });
});

export const submitTaskByStudent = asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const { studentCompletionNote, studentComment, completionEvidenceLinks } = req.body;

    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can submit task completion' });
    }

    assertMaxWords('Student completion note', studentCompletionNote, 100);
    assertMaxWords('Student comment', studentComment, 100);

    const studentProfile = await getStudentProfileFromUser(req.user);
    if (!studentProfile) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const task = await PlpTask.findOne({ _id: taskId, school: req.user.school, student: studentProfile._id });
    if (!task) {
        return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const previousStatus = task.status;
    task.studentCompletionNote = String(studentCompletionNote || '').trim();
    task.studentComment = String(studentComment || '').trim();
    task.completionEvidenceLinks = Array.isArray(completionEvidenceLinks) ? completionEvidenceLinks : task.completionEvidenceLinks;
    task.status = 'submitted_by_student';
    task.updatedBy = req.user._id;
    await task.save();

    await PlpInteraction.create({
        school: req.user.school,
        plpRecord: task.plpRecord,
        plpGoal: task.plpGoal,
        plpTask: task._id,
        actorRole: 'student',
        actor: req.user._id,
        actionType: 'comment',
        visibility: 'student_visible',
        payload: {
            from: previousStatus,
            to: task.status,
            completionNote: task.studentCompletionNote,
            comment: task.studentComment,
        },
    });

    const populated = await PlpTask.findById(task._id)
        .populate('plpGoal', 'title goalType')
        .populate('assignedByTeacher', 'firstName lastName');

    res.json({ success: true, data: populated });
});

export const reviewTaskByTeacher = asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const { status, teacherFeedback, teacherFollowUpAction } = req.body;

    const task = await PlpTask.findOne({ _id: taskId, school: req.user.school });
    if (!task) {
        return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const record = await PlpStudentRecord.findOne({ _id: task.plpRecord, school: req.user.school }).select('_id school teacher class academicYear student status');
    if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
    }
    if (record.status === 'locked') {
        return res.status(400).json({ success: false, message: 'Record is locked' });
    }
    await assertTeacherRecordWriteAccess(req.user, record);

    const allowedStatuses = ['reviewed', 'completed', 'needs_revision', 'in_progress'];
    if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid review status' });
    }

    const previousStatus = task.status;
    if (status) task.status = status;
    if (typeof teacherFeedback !== 'undefined') task.teacherFeedback = String(teacherFeedback || '').trim();
    if (typeof teacherFollowUpAction !== 'undefined') task.teacherFollowUpAction = String(teacherFollowUpAction || '').trim();
    if (task.status === 'completed' && !task.completedAt) task.completedAt = new Date();
    task.updatedBy = req.user._id;
    await task.save();

    await PlpInteraction.create({
        school: req.user.school,
        plpRecord: task.plpRecord,
        plpGoal: task.plpGoal,
        plpTask: task._id,
        actorRole: 'teacher',
        actor: req.user._id,
        actionType: 'status_change',
        visibility: 'student_visible',
        payload: { from: previousStatus, to: task.status },
    });

    if (task.teacherFeedback) {
        await PlpInteraction.create({
            school: req.user.school,
            plpRecord: task.plpRecord,
            plpGoal: task.plpGoal,
            plpTask: task._id,
            actorRole: 'teacher',
            actor: req.user._id,
            actionType: 'feedback',
            visibility: 'student_visible',
            payload: { feedback: task.teacherFeedback, followUp: task.teacherFollowUpAction || '' },
        });
    }

    if (previousStatus !== task.status) {
        await queueTaskNotification({
            schoolId: req.user.school,
            task,
            type: NOTIFICATION_TYPES.PLP_TASK_REVIEWED,
            subject: 'Your PLP task was reviewed',
            message: `Your task "${task.title}" was marked as ${task.status.replace('_', ' ')}.`,
            actorId: req.user._id,
            eventKey: `review:${task._id}:${task.updatedAt?.getTime() || Date.now()}`,
        });
    }

    const populated = await PlpTask.findById(task._id)
        .populate('student', 'firstName lastName studentId')
        .populate('assignedByTeacher', 'firstName lastName')
        .populate('plpGoal', 'title goalType');

    res.json({
        success: true,
        data: populated,
        notificationWarning: task.notificationStatus === 'failed'
            ? task.notificationError
            : null,
    });
});
