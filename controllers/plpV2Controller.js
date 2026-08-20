import { asyncHandler } from '../middleware/errorHandler.js';
import PlpCycle from '../models/PlpCycle.js';
import PlpStudentRecord from '../models/PlpStudentRecord.js';
import PlpGoal from '../models/PlpGoal.js';
import PlpTask from '../models/PlpTask.js';
import PlpInteraction from '../models/PlpInteraction.js';
import PlpSupervisorAssignment from '../models/PlpSupervisorAssignment.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';

const HOMEROOM_SUBJECT_MATCHERS = ['homeroom', 'home room', 'advisory', 'advisor', 'hmrm'];

const isHomeroomSubject = (subject) => {
    const name = String(subject?.name || '').toLowerCase();
    const code = String(subject?.code || '').toLowerCase();
    return HOMEROOM_SUBJECT_MATCHERS.some((term) => name.includes(term) || code.includes(term));
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

const getTeacherHomeroomClassIds = async (schoolId, teacherUserId, academicYear = null) => {
    const teacherProfile = await Teacher.findOne({ school: schoolId, user: teacherUserId, isActive: true })
        .select('_id')
        .lean();
    if (!teacherProfile) return [];

    const subjects = await Subject.find({ school: schoolId, isActive: true })
        .select('_id name code')
        .lean();
    const homeroomSubjectIds = subjects.filter(isHomeroomSubject).map((s) => s._id.toString());
    if (homeroomSubjectIds.length === 0) return [];

    const classQuery = {
        school: schoolId,
        isActive: true,
        $or: [
            { classTeacher: teacherProfile._id },
            {
                subjects: {
                    $elemMatch: {
                        teacher: teacherProfile._id,
                        subject: { $in: homeroomSubjectIds }
                    }
                }
            }
        ]
    };
    if (academicYear) classQuery.academicYear = academicYear;

    const classes = await Class.find(classQuery).select('_id').lean();
    return classes.map((row) => row._id.toString());
};

const assertRecordAccess = async (user, record) => {
    if (user.role === 'admin') return;

    if (user.role === 'teacher') {
        const normalizedClassId = String(record?.class?._id || record?.class || '');
        if (!normalizedClassId) {
            throw Object.assign(new Error('PLP class context is missing'), { statusCode: 400 });
        }
        const allowedClassIds = await getTeacherHomeroomClassIds(user.school, user._id, record.academicYear || null);
        if (!allowedClassIds.includes(normalizedClassId)) {
            throw Object.assign(new Error('PLP access is limited to your homeroom students'), { statusCode: 403 });
        }
        return;
    }

    if (user.role === 'department_principal') {
        const assignment = await PlpSupervisorAssignment.findOne({
            school: user.school,
            supervisor: user._id,
            teacher: record.teacher,
            active: true,
        }).lean();
        if (assignment) return;
    }

    if (user.role === 'student') {
        const studentProfile = await Student.findOne({
            school: user.school,
            user: user._id,
            _id: record.student,
            status: 'active',
        }).select('_id').lean();
        if (studentProfile) return;
    }

    throw Object.assign(new Error('Not authorized'), { statusCode: 403 });
};

const assertTeacherRecordWriteAccess = async (user, record) => {
    if (user.role !== 'teacher' && user.role !== 'admin') {
        throw Object.assign(new Error('Only teacher/admin can edit goals and tasks'), { statusCode: 403 });
    }

    if (user.role === 'admin') return;

    const normalizedClassId = String(record?.class?._id || record?.class || '');
    const allowedClassIds = await getTeacherHomeroomClassIds(user.school, user._id, record.academicYear || null);
    const inHomeroomScope = normalizedClassId ? allowedClassIds.includes(normalizedClassId) : false;
    if (!inHomeroomScope) {
        throw Object.assign(new Error('PLP write access is limited to your homeroom students'), { statusCode: 403 });
    }
};

const getStudentProfileFromUser = async (user) => {
    return Student.findOne({
        school: user.school,
        user: user._id,
        status: 'active',
    }).select('_id firstName lastName currentClass academicYear').lean();
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
        { _id: id, school: req.user.school, status: { $ne: 'closed' } },
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
            academicYear: cycle.academicYear,
            status: { $in: ['in_progress', 'submitted'] },
            createdAt: { $gte: cycle.startDate, $lte: cycle.endDate },
        },
        { status: 'locked' }
    );

    res.json({ success: true, data: cycle });
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
        targetDate: targetDate || null,
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
        'baselineNote', 'successCriteria', 'targetDate', 'status', 'aiSuggested'
    ];

    for (const key of allowedUpdates) {
        if (typeof req.body[key] !== 'undefined') {
            goal[key] = req.body[key];
        }
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

    const { title, instructions, dueDate, completionEvidenceLinks } = req.body;
    if (!title) {
        return res.status(400).json({ success: false, message: 'Task title is required' });
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
        notifiedAt: new Date(),
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

    const populated = await PlpTask.findById(task._id)
        .populate('student', 'firstName lastName studentId')
        .populate('assignedByTeacher', 'firstName lastName');

    res.status(201).json({ success: true, data: populated });
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

export const getMyStudentTasks = asyncHandler(async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can access this route' });
    }

    const studentProfile = await getStudentProfileFromUser(req.user);
    if (!studentProfile) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const tasks = await PlpTask.find({ school: req.user.school, student: studentProfile._id })
        .populate('plpGoal', 'title goalType status targetDate')
        .populate('assignedByTeacher', 'firstName lastName')
        .sort({ dueDate: 1, createdAt: -1 });

    res.json({ success: true, data: tasks });
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

    const populated = await PlpTask.findById(task._id)
        .populate('student', 'firstName lastName studentId')
        .populate('assignedByTeacher', 'firstName lastName')
        .populate('plpGoal', 'title goalType');

    res.json({ success: true, data: populated });
});
