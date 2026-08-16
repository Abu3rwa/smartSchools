import PlpMonthConfig from '../models/PlpMonthConfig.js';
import PlpStudentRecord from '../models/PlpStudentRecord.js';
import PlpEvidence from '../models/PlpEvidence.js';
import PlpSupervisorAssignment from '../models/PlpSupervisorAssignment.js';
import PlpAuditLog from '../models/PlpAuditLog.js';
import Student from '../models/Student.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const THEME_TRAITS = {
    confidence: {
        core: 'Confidence',
        s1: 'Humility',
        s2: 'Purpose',
        s3: 'Courage',
    },
    hope: {
        core: 'Hope',
        s1: 'Persistence',
        s2: 'Compassion',
        s3: 'Service',
    },
    wisdom: {
        core: 'Wisdom',
        s1: 'Curiosity',
        s2: 'Connection',
        s3: 'Discernment',
    },
};

const ACTIVITY_TEMPLATES = {
    confidence: {
        emerging: [
            'Journal: write three things that make you unique.',
            'Pair-share: discuss a personal strength with a classmate.',
            'Create a personal crest with symbols representing your values.',
        ],
        developing: [
            'Lead a small group discussion on a topic of your choice.',
            'Present one idea to the class without notes.',
            'Interview a role model about their confidence journey.',
        ],
        strong: [
            'Mentor a classmate in an area where you excel.',
            'Design a short lesson on self-identity for younger students.',
            'Reflect in writing: how has your confidence shaped your decisions this month?',
        ],
    },
    hope: {
        emerging: [
            'Write about a challenge you overcame and what you learned.',
            'Identify one person in your community you can support.',
            'Track one positive thing per day for a week.',
        ],
        developing: [
            'Lead a class gratitude circle.',
            'Plan and carry out a small act of service.',
            'Read and discuss a story of someone who turned hardship into strength.',
        ],
        strong: [
            'Design a service project for your class or community.',
            'Write a letter of encouragement to a struggling peer.',
            'Facilitate a classroom discussion on resilience.',
        ],
    },
    wisdom: {
        emerging: [
            'Ask three "why" questions about a topic this week.',
            'Compare two different perspectives on a current event.',
            'Create a mind map connecting a new concept to something you already know.',
        ],
        developing: [
            'Debate a complex issue using evidence from multiple sources.',
            'Design a decision-making framework for a real dilemma.',
            'Lead a Socratic seminar with your peers.',
        ],
        strong: [
            'Mentor classmates in critical thinking strategies.',
            'Write a reflective essay on a moral decision you faced.',
            'Create and teach a lesson connecting knowledge to real-life application.',
        ],
    },
};

const computeWeightedScore = (scores, weights) => {
    const w = weights || { coreTrait: 60, secondaryTrait1: 15, secondaryTrait2: 15, secondaryTrait3: 10 };
    const total = w.coreTrait + w.secondaryTrait1 + w.secondaryTrait2 + w.secondaryTrait3;
    const raw =
        (scores.coreTrait * w.coreTrait +
            scores.secondaryTrait1 * w.secondaryTrait1 +
            scores.secondaryTrait2 * w.secondaryTrait2 +
            scores.secondaryTrait3 * w.secondaryTrait3) / total;
    return Math.round(raw * 10) / 10;
};

const resolveLevel = (weightedScore) => {
    if (weightedScore >= 4) return 'strong';
    if (weightedScore >= 2.5) return 'developing';
    return 'emerging';
};

const generateActivities = (theme, level) => {
    return (ACTIVITY_TEMPLATES[theme]?.[level] || []).slice(0, 3);
};

const audit = (school, actor, action, targetType, targetId, meta) =>
    PlpAuditLog.create({ school, actor, action, targetType, targetId, meta }).catch(() => {});

// ─── Month Config ───────────────────────────────────────────────────────────────

export const getMonthConfigs = asyncHandler(async (req, res) => {
    const { academicYear } = req.query;
    const filter = { school: req.user.school };
    if (academicYear) filter.academicYear = academicYear;
    const configs = await PlpMonthConfig.find(filter).sort({ academicYear: 1, month: 1 });
    res.json({ success: true, data: configs });
});

export const getMonthConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const config = await PlpMonthConfig.findOne({ _id: id, school: req.user.school });
    if (!config) return res.status(404).json({ success: false, message: 'Config not found' });
    res.json({ success: true, data: config });
});

export const createMonthConfig = asyncHandler(async (req, res) => {
    const { academicYear, month, theme, weights, minEvidenceCount } = req.body;
    const config = await PlpMonthConfig.create({
        school: req.user.school,
        academicYear,
        month,
        theme,
        weights,
        minEvidenceCount,
        createdBy: req.user._id,
    });
    audit(req.user.school, req.user._id, 'config_created', 'PlpMonthConfig', config._id, { month, theme });
    res.status(201).json({ success: true, data: config });
});

export const updateMonthConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const config = await PlpMonthConfig.findOneAndUpdate(
        { _id: id, school: req.user.school, status: { $ne: 'closed' } },
        { ...req.body, updatedBy: req.user._id },
        { new: true, runValidators: true }
    );
    if (!config) return res.status(404).json({ success: false, message: 'Config not found or closed' });
    res.json({ success: true, data: config });
});

export const publishMonthConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const config = await PlpMonthConfig.findOneAndUpdate(
        { _id: id, school: req.user.school, status: 'draft' },
        { status: 'published', updatedBy: req.user._id },
        { new: true }
    );
    if (!config) return res.status(404).json({ success: false, message: 'Config not found or not in draft' });
    audit(req.user.school, req.user._id, 'config_published', 'PlpMonthConfig', config._id, {});
    res.json({ success: true, data: config });
});

export const closeMonthConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const config = await PlpMonthConfig.findOneAndUpdate(
        { _id: id, school: req.user.school, status: 'published' },
        { status: 'closed', updatedBy: req.user._id },
        { new: true }
    );
    if (!config) return res.status(404).json({ success: false, message: 'Config not found or not published' });
    // lock all submitted records for this month
    await PlpStudentRecord.updateMany(
        { school: req.user.school, academicYear: config.academicYear, month: config.month, status: 'submitted' },
        { status: 'locked' }
    );
    audit(req.user.school, req.user._id, 'config_closed', 'PlpMonthConfig', config._id, {});
    res.json({ success: true, data: config });
});

// ─── Student Records ────────────────────────────────────────────────────────────

export const getRecords = asyncHandler(async (req, res) => {
    const { academicYear, month, classId, teacherId } = req.query;
    const filter = { school: req.user.school };
    if (academicYear) filter.academicYear = academicYear;
    if (month) filter.month = Number(month);
    if (classId) filter.class = classId;

    const isAdmin = ['admin', 'department_principal'].includes(req.user.role);
    const isSupervisor = req.user.role === 'department_principal';

    if (!isAdmin) {
        if (isSupervisor) {
            const assignments = await PlpSupervisorAssignment.find({
                school: req.user.school,
                supervisor: req.user._id,
                active: true,
            }).select('teacher');
            const teacherIds = assignments.map((a) => a.teacher);
            if (teacherId && !teacherIds.some((t) => t.toString() === teacherId)) {
                return res.json({ success: true, data: [] });
            }
            filter.teacher = teacherId ? teacherId : { $in: teacherIds };
        } else {
            filter.teacher = req.user._id;
        }
    } else if (teacherId) {
        filter.teacher = teacherId;
    }

    const records = await PlpStudentRecord.find(filter)
        .populate('student', 'firstName lastName studentId')
        .populate('teacher', 'firstName lastName')
        .populate('class', 'name grade')
        .sort({ createdAt: -1 });

    res.json({ success: true, data: records });
});

export const getRecord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school })
        .populate('student', 'firstName lastName studentId')
        .populate('teacher', 'firstName lastName')
        .populate('class', 'name grade');
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertRecordAccess(req.user, record);
    res.json({ success: true, data: record });
});

const assertRecordAccess = async (user, record) => {
    if (['admin'].includes(user.role)) return;
    if (record.teacher.toString() === user._id.toString()) return;
    if (user.role === 'department_principal') {
        const assignment = await PlpSupervisorAssignment.findOne({
            school: user.school,
            supervisor: user._id,
            teacher: record.teacher,
            active: true,
        });
        if (assignment) return;
    }
    throw Object.assign(new Error('Not authorized'), { statusCode: 403 });
};

export const createRecord = asyncHandler(async (req, res) => {
    const { academicYear, month, theme, classId, studentId, scores } = req.body;
    const config = await PlpMonthConfig.findOne({
        school: req.user.school, academicYear, month, status: 'published',
    });
    if (!config) return res.status(400).json({ success: false, message: 'Month config not published yet' });

    const computedScores = scores || {};
    const weighted = computeWeightedScore(computedScores, config.weights);
    const level = resolveLevel(weighted);
    const activities = generateActivities(theme, level);

    const record = await PlpStudentRecord.create({
        school: req.user.school,
        academicYear,
        month,
        theme,
        teacher: req.user._id,
        class: classId,
        student: studentId,
        scores: computedScores,
        weightedScore: weighted,
        level,
        recommendedActivities: activities,
    });
    res.status(201).json({ success: true, data: record });
});

export const updateRecord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!existing) return res.status(404).json({ success: false, message: 'Record not found' });
    if (existing.status === 'locked') return res.status(400).json({ success: false, message: 'Record is locked' });
    await assertRecordAccess(req.user, existing);

    const { scores } = req.body;
    let updateData = { ...req.body };
    if (scores) {
        const config = await PlpMonthConfig.findOne({
            school: req.user.school, academicYear: existing.academicYear, month: existing.month,
        });
        const weighted = computeWeightedScore(scores, config?.weights);
        const level = resolveLevel(weighted);
        updateData.scores = scores;
        updateData.weightedScore = weighted;
        updateData.level = level;
        updateData.recommendedActivities = generateActivities(existing.theme, level);
        updateData.awardCandidate = existing.evidenceCount >= (config?.minEvidenceCount || 2);
    }
    const updated = await PlpStudentRecord.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
        .populate('student', 'firstName lastName studentId');
    res.json({ success: true, data: updated });
});

export const submitRecord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    if (record.status !== 'in_progress') return res.status(400).json({ success: false, message: 'Record already submitted or locked' });
    await assertRecordAccess(req.user, record);
    const config = await PlpMonthConfig.findOne({
        school: req.user.school, academicYear: record.academicYear, month: record.month,
    });
    const eligible = record.evidenceCount >= (config?.minEvidenceCount || 2);
    record.status = 'submitted';
    record.submittedAt = new Date();
    record.awardCandidate = eligible;
    await record.save();
    audit(req.user.school, req.user._id, 'record_submitted', 'PlpStudentRecord', record._id, {});
    res.json({ success: true, data: record });
});

// ─── Evidence ───────────────────────────────────────────────────────────────────

export const getEvidence = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const evidence = await PlpEvidence.find({ school: req.user.school, plpRecord: id })
        .populate('teacher', 'firstName lastName')
        .sort({ createdAt: -1 });
    res.json({ success: true, data: evidence });
});

export const createEvidence = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    if (record.status === 'locked') return res.status(400).json({ success: false, message: 'Record is locked' });
    await assertRecordAccess(req.user, record);

    const { type, note, taggedTraits } = req.body;
    const evidence = await PlpEvidence.create({
        school: req.user.school,
        plpRecord: id,
        teacher: req.user._id,
        type,
        note,
        taggedTraits: taggedTraits || [],
    });

    const newCount = record.evidenceCount + 1;
    const config = await PlpMonthConfig.findOne({
        school: req.user.school, academicYear: record.academicYear, month: record.month,
    });
    await PlpStudentRecord.findByIdAndUpdate(id, {
        evidenceCount: newCount,
        awardCandidate: newCount >= (config?.minEvidenceCount || 2),
    });

    res.status(201).json({ success: true, data: evidence });
});

export const deleteEvidence = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const evidence = await PlpEvidence.findOne({ _id: id, school: req.user.school });
    if (!evidence) return res.status(404).json({ success: false, message: 'Evidence not found' });
    await PlpStudentRecord.findByIdAndUpdate(evidence.plpRecord, { $inc: { evidenceCount: -1 } });
    await evidence.deleteOne();
    res.json({ success: true, message: 'Evidence deleted' });
});

// ─── Awards ─────────────────────────────────────────────────────────────────────

export const getAwardCandidates = asyncHandler(async (req, res) => {
    const { academicYear, month, classId } = req.query;
    const filter = {
        school: req.user.school,
        academicYear,
        month: Number(month),
        awardCandidate: true,
    };
    if (classId) filter.class = classId;
    const candidates = await PlpStudentRecord.find(filter)
        .populate('student', 'firstName lastName studentId')
        .populate('class', 'name')
        .sort({ weightedScore: -1 });
    res.json({ success: true, data: candidates });
});

export const setAwardDecision = asyncHandler(async (req, res) => {
    const { recordId, decision, reason } = req.body;
    if (decision === 'not_selected' && !reason?.trim()) {
        return res.status(400).json({ success: false, message: 'Reason required when not selecting a candidate' });
    }
    const record = await PlpStudentRecord.findOneAndUpdate(
        { _id: recordId, school: req.user.school },
        { awardDecision: decision, awardDecisionReason: reason || '' },
        { new: true }
    );
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    audit(req.user.school, req.user._id, 'award_decision', 'PlpStudentRecord', record._id, { decision, reason });
    res.json({ success: true, data: record });
});

// ─── Recommendations ────────────────────────────────────────────────────────────

export const getRecommendations = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, data: record.recommendedActivities });
});

export const regenerateRecommendations = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    const activities = generateActivities(record.theme, record.level);
    record.recommendedActivities = activities;
    await record.save();
    res.json({ success: true, data: activities });
});

// ─── Supervisor Scope ────────────────────────────────────────────────────────────

export const getSupervisorTeachers = asyncHandler(async (req, res) => {
    const assignments = await PlpSupervisorAssignment.find({
        school: req.user.school,
        supervisor: req.user._id,
        active: true,
    }).populate('teacher', 'firstName lastName email');
    res.json({ success: true, data: assignments });
});

// ─── Supervisor Assignments (admin) ─────────────────────────────────────────────

export const getSupervisorAssignments = asyncHandler(async (req, res) => {
    const assignments = await PlpSupervisorAssignment.find({ school: req.user.school })
        .populate('supervisor', 'firstName lastName email role')
        .populate('teacher', 'firstName lastName email');
    res.json({ success: true, data: assignments });
});

export const createSupervisorAssignment = asyncHandler(async (req, res) => {
    const { supervisorId, teacherId } = req.body;
    const assignment = await PlpSupervisorAssignment.create({
        school: req.user.school,
        supervisor: supervisorId,
        teacher: teacherId,
    });
    audit(req.user.school, req.user._id, 'supervisor_assignment_created', 'PlpSupervisorAssignment', assignment._id, { supervisorId, teacherId });
    res.status(201).json({ success: true, data: assignment });
});

export const deleteSupervisorAssignment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await PlpSupervisorAssignment.findOneAndDelete({ _id: id, school: req.user.school });
    res.json({ success: true, message: 'Assignment removed' });
});

// ─── Audit Log ───────────────────────────────────────────────────────────────────

export const getAuditLogs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const logs = await PlpAuditLog.find({ school: req.user.school })
        .populate('actor', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));
    const total = await PlpAuditLog.countDocuments({ school: req.user.school });
    res.json({ success: true, data: logs, total, page: Number(page) });
});

// ─── Theme labels (public helper) ────────────────────────────────────────────────

export const getThemeLabels = asyncHandler(async (req, res) => {
    res.json({ success: true, data: THEME_TRAITS });
});
